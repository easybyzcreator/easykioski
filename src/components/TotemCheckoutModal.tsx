import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  UtensilsCrossed,
  ShoppingBag,
  CreditCard,
  Smartphone,
  Check,
  Printer,
  Lock,
  Sparkles,
  Wifi,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { CartItem, Order, OrderItem, OrderModality, Product, Settings } from '../types';
import { formatMoney, getKioskDict, KioskLanguage } from '../utils/kioskI18n';
import { getContrastText } from '../utils/orderUtils';
import { getBrandTheme } from '../utils/brandTheme';
import { generateNextDailyOrderNumber } from '../services/orderNumberService';
import {
  cancelTerminalPayment,
  initiateTerminalPayment,
  pollTerminalStatus,
  resolveTerminalProvider,
  simulateTerminalApproval,
  TerminalCheckoutSession,
} from '../services/paymentTerminalService';
import {
  DualPrintResult,
  printDualOrderReceipts,
  triggerBrowserIframePrint,
} from '../services/printService';
import { db } from '../firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

interface TotemCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  products: Product[];
  settings: Settings;
  language: KioskLanguage;
  onRemoveFromCart: (cartItemId: string) => void;
  onValidateCart: () => { isValid: boolean; message?: string; isMinOrder?: boolean };
  onOrderCompletedAndReset: () => void;
}

type CheckoutStep = 'review' | 'modality' | 'tip' | 'payment' | 'success';

const cleanFirestoreObject = <T,>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj
      .map((item) => cleanFirestoreObject(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (
    obj &&
    typeof obj === 'object' &&
    Object.prototype.toString.call(obj) === '[object Object]' &&
    Object.getPrototypeOf(obj) === Object.prototype
  ) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        const cleaned = cleanFirestoreObject(value);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
    }
    return result as T;
  }
  return obj;
};

export const TotemCheckoutModal: React.FC<TotemCheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  setCart,
  products,
  settings,
  language,
  onRemoveFromCart,
  onValidateCart,
  onOrderCompletedAndReset,
}) => {
  const t = getKioskDict(language);
  const currency = settings.currency || 'USD';
  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;
  const primaryContrast = theme.primaryContrast;
  const taxRate = typeof settings.salesTaxRate === 'number' ? settings.salesTaxRate : 7.75;
  const terminalProvider = resolveTerminalProvider(settings);

  const [step, setStep] = useState<CheckoutStep>('review');
  const [orderType, setOrderType] = useState<OrderModality>('dine_in');
  const [firstName, setFirstName] = useState('');
  const [tableOrPager, setTableOrPager] = useState('');
  const [orderNote, setOrderNote] = useState('');

  // Tip State
  const [tipSelection, setTipSelection] = useState<'none' | '15' | '18' | '20' | 'custom'>('18');
  const [customTipInput, setCustomTipInput] = useState('');

  // Payment Terminal State
  const [terminalSession, setTerminalSession] = useState<TerminalCheckoutSession | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Confirmed Order & Dual Printing State
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [printResult, setPrintResult] = useState<DualPrintResult | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [autoResetCountdown, setAutoResetCountdown] = useState(14);

  const pollIntervalRef = useRef<number | null>(null);

  // Reset internal modal state when opened cleanly
  useEffect(() => {
    if (isOpen) {
      setStep('review');
      setOrderType('dine_in');
      setFirstName('');
      setTableOrPager('');
      setOrderNote('');
      setTipSelection('18');
      setCustomTipInput('');
      setTerminalSession(null);
      setIsAuthorizing(false);
      setPaymentError(null);
      setConfirmedOrder(null);
      setPrintResult(null);
      setIsPrinting(false);
      setShowReceiptPreview(false);
      setAutoResetCountdown(14);
    } else if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [isOpen]);

  // Calculate financial breakdown
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const product = products.find((p) => p.id === item.productId);
      const basePrice = item.selectedSize
        ? item.selectedSize.price
        : product?.price && product.price > 0
        ? product.price
        : product?.oldPrice || 0;
      const sidesTotal = item.mealOptions?.sides?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
      return acc + (basePrice + sidesTotal) * item.quantity;
    }, 0);
  }, [cart, products]);

  const taxAmount = useMemo(() => {
    return Math.round(subtotal * (taxRate / 100) * 100) / 100;
  }, [subtotal, taxRate]);

  const tipAmount = useMemo(() => {
    if (tipSelection === 'none') return 0;
    if (tipSelection === 'custom') {
      const parsed = parseFloat(customTipInput.replace(',', '.'));
      return isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
    }
    const pct = parseInt(tipSelection, 10);
    return Math.round(subtotal * (pct / 100) * 100) / 100;
  }, [tipSelection, customTipInput, subtotal]);

  const tipPercent = useMemo(() => {
    if (tipSelection === '15') return 15;
    if (tipSelection === '18') return 18;
    if (tipSelection === '20') return 20;
    return undefined;
  }, [tipSelection]);

  const grandTotal = useMemo(() => {
    return Math.round((subtotal + taxAmount + tipAmount) * 100) / 100;
  }, [subtotal, taxAmount, tipAmount]);

  // Auto-reset timer on success screen (pauses while viewing receipt preview)
  useEffect(() => {
    if (step !== 'success' || showReceiptPreview) return;

    const timer = window.setInterval(() => {
      setAutoResetCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          onOrderCompletedAndReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, showReceiptPreview, onOrderCompletedAndReset]);

  const buildOrderItems = (): OrderItem[] => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const basePrice = item.selectedSize
        ? item.selectedSize.price
        : product?.price && product.price > 0
        ? product.price
        : product?.oldPrice || 0;
      const sidesTotal = item.mealOptions?.sides?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
      const unitPrice = basePrice + sidesTotal;

      const orderItem: OrderItem = {
        title: product?.title || 'Item',
        quantity: item.quantity,
        price: unitPrice,
        priceType: product?.priceType || 'fixed',
      };
      if (item.selectedSize) orderItem.selectedSize = item.selectedSize;
      if (item.mealOptions) orderItem.mealOptions = item.mealOptions;
      if (item.cakeOptions) orderItem.cakeOptions = item.cakeOptions;
      if (item.sandwichOptions) orderItem.sandwichOptions = item.sandwichOptions;
      if (item.observation) orderItem.observation = item.observation;
      return orderItem;
    });
  };

  const finalizePaidOrder = async (approvedSession: TerminalCheckoutSession) => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setIsAuthorizing(true);
    try {
      const orderNumber = await generateNextDailyOrderNumber();
      const items = buildOrderItems();
      const nowDate = new Date();

      const newOrderPayload = cleanFirestoreObject({
        orderNumber,
        customerName: firstName.trim() || 'Guest',
        tableOrPager: tableOrPager.trim() || undefined,
        orderType,
        deliveryType: 'pickup' as const,
        phone: '',
        address: orderType === 'dine_in' ? 'Dine-In (Kiosk)' : 'Takeout / To-Go (Kiosk)',
        birthday: '',
        email: '',
        observation: orderNote.trim(),
        items,
        subtotal,
        taxRate,
        taxAmount,
        tipAmount,
        tipPercent,
        total: grandTotal,
        paymentStatus: 'paid' as const,
        paymentProvider: approvedSession.provider,
        paymentTransactionId: approvedSession.transactionId || approvedSession.checkoutId,
        kitchenStatus: 'preparing' as const,
        orderLanguage: language,
        source: 'kiosk' as const,
        orderSource: 'totem' as const,
        createdAt: serverTimestamp(),
      });

      let savedId = `kiosk_${Date.now()}`;
      try {
        const docRef = await addDoc(collection(db, 'pedidos'), newOrderPayload);
        savedId = docRef.id;
      } catch (fsErr) {
        console.warn('[TotemCheckout] Firestore save warning:', fsErr);
      }

      const finalOrder: Order = {
        ...newOrderPayload,
        id: savedId,
        createdAt: nowDate,
      } as Order;

      setConfirmedOrder(finalOrder);
      setStep('success');
      setCart([]);

      // Simultaneously trigger Dual 80mm Printing (Via 1: Customer Receipt + Via 2: Kitchen Ticket)
      setIsPrinting(true);
      const pResult = await printDualOrderReceipts(finalOrder, settings);
      setPrintResult(pResult);
      setIsPrinting(false);

      if (pResult.mode === 'qz-tray') {
        toast.success(t.receiptsPrinted);
      }
    } catch (err) {
      console.error('[TotemCheckout] Error finalizing paid order:', err);
      toast.error('Failed to finalize order. Please try again.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const startTerminalPaymentStep = async () => {
    setStep('payment');
    setPaymentError(null);
    setIsAuthorizing(false);

    const session = await initiateTerminalPayment(
      {
        amount: grandTotal,
        currency,
        referenceId: `kiosk_${Date.now()}`,
        customerName: firstName.trim() || 'Guest',
        note: `${orderType === 'dine_in' ? 'DINE-IN' : 'TAKEOUT'} - ${firstName.trim()}`,
      },
      settings
    );

    setTerminalSession(session);

    if (session.status === 'FAILED') {
      setPaymentError(session.errorMessage || 'Terminal unavailable.');
      return;
    }

    if (session.isLiveApi) {
      pollIntervalRef.current = window.setInterval(async () => {
        const updated = await pollTerminalStatus(session);
        setTerminalSession(updated);
        if (updated.status === 'COMPLETED') {
          await finalizePaidOrder(updated);
        } else if (updated.status === 'FAILED' || updated.status === 'CANCELED') {
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setPaymentError(updated.errorMessage || 'Payment declined or canceled.');
        }
      }, 2000);
    }
  };

  const handleSimulatePayment = async () => {
    if (!terminalSession || isAuthorizing) return;
    setIsAuthorizing(true);
    setPaymentError(null);
    try {
      const approved = await simulateTerminalApproval(terminalSession);
      setTerminalSession(approved);
      await finalizePaidOrder(approved);
    } catch {
      setPaymentError('Simulation failed. Please retry.');
      setIsAuthorizing(false);
    }
  };

  const handleCancelPaymentStep = async () => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    await cancelTerminalPayment(terminalSession);
    setTerminalSession(null);
    setPaymentError(null);
    setStep('tip');
  };

  const handleCloseModal = () => {
    if (step === 'success') {
      onOrderCompletedAndReset();
      return;
    }
    if (step === 'payment') {
      cancelTerminalPayment(terminalSession);
    }
    onClose();
  };

  const stepIndexMap: Record<CheckoutStep, number> = {
    review: 0,
    modality: 1,
    tip: 2,
    payment: 3,
    success: 4,
  };
  const currentStepIdx = stepIndexMap[step];

  const isMinOrderActive = !!(settings.minOrderEnabled && settings.minOrderValue && settings.minOrderValue > 0);
  const isBelowMin = isMinOrderActive && subtotal < (settings.minOrderValue || 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={step !== 'payment' && step !== 'success' ? handleCloseModal : undefined}
            className="absolute inset-0 bg-black/45 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 18 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-2xl backdrop-blur-2xl rounded-[32px] shadow-[0_32px_90px_rgba(0,0,0,0.28)] border overflow-hidden flex flex-col max-h-[92vh]"
            style={{
              backgroundColor: theme.modalBg,
              borderColor: theme.primaryBorder,
              color: theme.text,
            }}
          >
            {/* Header Bar */}
            {step !== 'success' && (
              <div
                className="px-5 sm:px-7 py-4 sm:py-5 border-b flex items-center justify-between gap-3"
                style={{
                  borderColor: theme.primaryBorder,
                  backgroundColor: theme.cardBg,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {step !== 'review' && step !== 'payment' ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (step === 'modality') setStep('review');
                        else if (step === 'tip') setStep('modality');
                      }}
                      className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-white/80 hover:bg-white border border-black/8 flex items-center justify-center gap-1.5 text-xs font-bold text-stone-800 transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      <ArrowLeft size={18} />
                      <span className="hidden sm:inline whitespace-nowrap">{t.back}</span>
                    </button>
                  ) : step === 'review' ? (
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="min-h-[44px] px-3 rounded-2xl bg-white/80 hover:bg-white border border-black/8 flex items-center gap-1.5 text-xs font-bold text-stone-800 transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      <ArrowLeft size={18} />
                      <span className="hidden sm:inline whitespace-nowrap">{t.backToMenu}</span>
                    </button>
                  ) : null}

                  <div className="min-w-0">
                    <h2
                      className="text-xl sm:text-2xl font-serif font-extrabold tracking-tight truncate"
                      style={{ color: theme.categoryText }}
                    >
                      {step === 'review' && t.cartTitle}
                      {step === 'modality' && t.stepModalityTitle}
                      {step === 'tip' && t.stepTipTitle}
                      {step === 'payment' && t.stepPaymentTitle}
                    </h2>
                    {/* Subtle Step Progress Hairline */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {[0, 1, 2, 3].map((idx) => (
                        <div
                          key={idx}
                          className="h-1 rounded-full transition-all duration-300"
                          style={{
                            width: idx === currentStepIdx ? 28 : 12,
                            backgroundColor: idx <= currentStepIdx ? primaryColor : theme.primaryBorder,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {step !== 'payment' && (
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    aria-label={t.close}
                    className="min-h-[44px] min-w-[44px] rounded-full bg-white/80 hover:bg-white border border-black/8 flex items-center justify-center text-stone-700 transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}

            {/* Main Scrollable Step Content */}
            <div className="p-5 sm:p-7 overflow-y-auto flex-grow">
              {/* STEP 0: CART REVIEW */}
              {step === 'review' && (
                cart.length === 0 ? (
                  <div className="text-center py-14 space-y-5">
                    <div className="w-16 h-16 rounded-full bg-stone-200/70 text-stone-700 flex items-center justify-center mx-auto">
                      <ShoppingBag size={28} />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xl font-serif font-bold text-stone-900">{t.emptyCartTitle}</h3>
                      <p className="text-sm text-stone-600">{t.emptyCartDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="min-h-[52px] px-8 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95 cursor-pointer"
                      style={{ backgroundColor: primaryColor, color: primaryContrast }}
                    >
                      {t.backToMenu}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      {cart.map((item) => {
                        const product = products.find((p) => p.id === item.productId);
                        if (!product) return null;

                        const basePrice = item.selectedSize
                          ? item.selectedSize.price
                          : product.price > 0
                          ? product.price
                          : product.oldPrice || 0;
                        const sidesTotal = item.mealOptions?.sides?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
                        const lineTotal = (basePrice + sidesTotal) * item.quantity;

                        return (
                          <div
                            key={item.id}
                            className="bg-white/85 rounded-2xl p-4 border border-black/6 flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <img
                                src={product.image}
                                alt={product.title}
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 rounded-xl object-cover bg-stone-100 shrink-0 border border-black/5"
                              />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-serif font-bold text-base text-stone-900 leading-snug">
                                  {product.title}
                                </h4>
                                <div className="text-xs text-stone-600 space-y-0.5 mt-0.5">
                                  {item.selectedSize && (
                                    <span className="font-semibold text-stone-800">{item.selectedSize.name}</span>
                                  )}
                                  {item.mealOptions?.removals && item.mealOptions.removals.length > 0 && (
                                    <div className="text-rose-700 font-semibold">
                                      {t.excludeLabel}: {item.mealOptions.removals.join(', ')}
                                    </div>
                                  )}
                                  {item.mealOptions?.sides && item.mealOptions.sides.length > 0 && (
                                    <div>
                                      {item.mealOptions.sides
                                        .map((s) => `${s.type === 'swap' ? t.swapsLabel : t.sidesLabel}: ${s.name}`)
                                        .join(' · ')}
                                    </div>
                                  )}
                                  {item.sandwichOptions?.fillings && item.sandwichOptions.fillings.length > 0 && (
                                    <div>{item.sandwichOptions.fillings.join(' + ')}</div>
                                  )}
                                  {item.cakeOptions && (
                                    <div>
                                      {[
                                        item.cakeOptions.size,
                                        item.cakeOptions.dough,
                                        item.cakeOptions.fillings?.join(' + '),
                                        item.cakeOptions.topping,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-1 font-bold text-sm tabular-nums" style={{ color: settings.priceColor || primaryColor }}>
                                  {formatMoney(lineTotal, currency)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => onRemoveFromCart(item.id)}
                                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-900 active:scale-90 transition-all cursor-pointer"
                              >
                                <Minus size={16} />
                              </button>
                              <span className="min-w-[24px] text-center font-bold text-base tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setCart((prev) =>
                                    prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))
                                  )
                                }
                                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-sm"
                                style={{ backgroundColor: primaryColor, color: primaryContrast }}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals Preview */}
                    <div className="pt-4 border-t border-black/10 space-y-2 text-sm">
                      <div className="flex justify-between text-stone-600">
                        <span>{t.subtotal}</span>
                        <span className="font-semibold tabular-nums text-stone-900">{formatMoney(subtotal, currency)}</span>
                      </div>
                      {taxRate > 0 && (
                        <div className="flex justify-between text-stone-600">
                          <span>
                            {t.salesTax} ({taxRate}%)
                          </span>
                          <span className="font-semibold tabular-nums text-stone-900">{formatMoney(taxAmount, currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-baseline pt-2 border-t border-black/8">
                        <span className="font-serif font-bold text-lg text-stone-900">{t.total}</span>
                        <span className="font-serif font-black text-2xl tabular-nums" style={{ color: primaryColor }}>
                          {formatMoney(subtotal + taxAmount, currency)}
                        </span>
                      </div>
                    </div>

                    {isBelowMin && (
                      <div
                        className="p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2"
                        style={{
                          backgroundColor: theme.primaryTint08,
                          borderColor: theme.primaryBorder,
                          color: theme.primary,
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Lock size={15} />
                          {t.minOrderLabel}: {formatMoney(settings.minOrderValue || 0, currency)}
                        </span>
                        <span className="tabular-nums">
                          {t.minOrderMissing}: {formatMoney((settings.minOrderValue || 0) - subtotal, currency)}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="min-h-[54px] px-5 rounded-2xl border font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                        style={{
                          backgroundColor: theme.cardBgSolid,
                          borderColor: theme.primaryBorder,
                          color: theme.text,
                        }}
                      >
                        <ArrowLeft size={16} />
                        {t.addMoreItems}
                      </button>

                      <button
                        type="button"
                        disabled={isBelowMin}
                        onClick={() => {
                          const validation = onValidateCart();
                          if (!validation.isValid) {
                            toast.error(validation.message || 'Check your order items.');
                            return;
                          }
                          setStep('modality');
                        }}
                        className="min-h-[54px] px-6 rounded-2xl font-bold text-base shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                        style={{ backgroundColor: primaryColor, color: primaryContrast }}
                      >
                        <span>{t.continueCheckout}</span>
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* STEP 1: DINE-IN / TAKEOUT + FIRST NAME */}
              {step === 'modality' && (
                <div className="space-y-6">
                  <p className="text-sm text-stone-600">{t.stepModalitySubtitle}</p>

                  {/* Large Tactile Glass Cards for Dine-In / Takeout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setOrderType('dine_in')}
                      className="p-6 rounded-3xl border-2 text-left transition-all cursor-pointer flex flex-col items-center text-center gap-3 min-h-[160px] justify-center"
                      style={{
                        backgroundColor: orderType === 'dine_in' ? primaryColor : 'rgba(255,255,255,0.78)',
                        borderColor: orderType === 'dine_in' ? primaryColor : 'rgba(0,0,0,0.08)',
                        color: orderType === 'dine_in' ? primaryContrast : '#1c1917',
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                          backgroundColor:
                            orderType === 'dine_in' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                        }}
                      >
                        <UtensilsCrossed size={28} />
                      </div>
                      <div>
                        <div className="font-serif font-extrabold text-xl tracking-tight">{t.dineIn}</div>
                        <div className="text-xs opacity-80 mt-1">{t.dineInDesc}</div>
                      </div>
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setOrderType('takeout')}
                      className="p-6 rounded-3xl border-2 text-left transition-all cursor-pointer flex flex-col items-center text-center gap-3 min-h-[160px] justify-center"
                      style={{
                        backgroundColor: orderType === 'takeout' ? primaryColor : 'rgba(255,255,255,0.78)',
                        borderColor: orderType === 'takeout' ? primaryColor : 'rgba(0,0,0,0.08)',
                        color: orderType === 'takeout' ? primaryContrast : '#1c1917',
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                          backgroundColor:
                            orderType === 'takeout' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                        }}
                      >
                        <ShoppingBag size={28} />
                      </div>
                      <div>
                        <div className="font-serif font-extrabold text-xl tracking-tight">{t.takeout}</div>
                        <div className="text-xs opacity-80 mt-1">{t.takeoutDesc}</div>
                      </div>
                    </motion.button>
                  </div>

                  {/* Quick Name & Optional Table/Pager Inputs */}
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold tracking-wide text-stone-700 block">
                        {t.firstNameLabel} *
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder={t.firstNamePlaceholder}
                        className="w-full min-h-[54px] px-4 rounded-2xl bg-white border border-black/12 text-lg font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>

                    {(settings.askTableOrPager || orderType === 'dine_in') && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold tracking-wide text-stone-700 block">
                          {t.tableOrPagerLabel}
                        </label>
                        <input
                          type="text"
                          value={tableOrPager}
                          onChange={(e) => setTableOrPager(e.target.value)}
                          placeholder={t.tableOrPagerPlaceholder}
                          className="w-full min-h-[48px] px-4 rounded-2xl bg-white/90 border border-black/10 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold tracking-wide text-stone-700 block">
                        {t.orderNoteLabel}
                      </label>
                      <input
                        type="text"
                        value={orderNote}
                        onChange={(e) => setOrderNote(e.target.value)}
                        placeholder={t.orderNotePlaceholder}
                        className="w-full min-h-[48px] px-4 rounded-2xl bg-white/90 border border-black/10 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!firstName.trim()) {
                        toast.error(t.firstNameRequired);
                        return;
                      }
                      setStep('tip');
                    }}
                    className="w-full min-h-[58px] rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                    style={{ backgroundColor: primaryColor, color: primaryContrast }}
                  >
                    <span>{t.continueToTip}</span>
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}

              {/* STEP 2: US TIP SCREEN */}
              {step === 'tip' && (
                <div className="space-y-6">
                  <p className="text-sm text-stone-600">{t.stepTipSubtitle}</p>

                  {/* Primary 15% / 18% / 20% Cards */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {(['15', '18', '20'] as const).map((pct) => {
                      const isSelected = tipSelection === pct;
                      const previewVal = Math.round(subtotal * (parseInt(pct, 10) / 100) * 100) / 100;
                      return (
                        <motion.button
                          key={pct}
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setTipSelection(pct)}
                          className="min-h-[112px] p-4 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer"
                          style={{
                            backgroundColor: isSelected ? primaryColor : 'rgba(255,255,255,0.85)',
                            borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.08)',
                            color: isSelected ? primaryContrast : '#1c1917',
                          }}
                        >
                          <span className="font-serif font-black text-2xl sm:text-3xl tabular-nums">{pct}%</span>
                          <span className="text-xs sm:text-sm font-semibold opacity-85 tabular-nums">
                            {formatMoney(previewVal, currency)}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Custom Tip & No Tip Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTipSelection('custom')}
                      className="min-h-[56px] px-4 rounded-2xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                      style={{
                        backgroundColor: tipSelection === 'custom' ? primaryColor : 'rgba(255,255,255,0.85)',
                        borderColor: tipSelection === 'custom' ? primaryColor : 'rgba(0,0,0,0.08)',
                        color: tipSelection === 'custom' ? primaryContrast : '#1c1917',
                      }}
                    >
                      <span>{t.customTip} ({currency === 'USD' ? '$' : currency})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTipSelection('none');
                        setCustomTipInput('');
                      }}
                      className="min-h-[56px] px-4 rounded-2xl border-2 font-bold text-sm flex items-center justify-center transition-all cursor-pointer"
                      style={{
                        backgroundColor: tipSelection === 'none' ? theme.text : theme.cardBgSolid,
                        borderColor: tipSelection === 'none' ? theme.text : theme.primaryBorder,
                        color: tipSelection === 'none' ? getContrastText(theme.text) : theme.textMuted,
                      }}
                    >
                      {t.noTip}
                    </button>
                  </div>

                  {tipSelection === 'custom' && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl p-4 border border-black/10 flex items-center gap-3"
                    >
                      <span className="text-xl font-serif font-bold text-stone-500">
                        {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$'}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.50"
                        min="0"
                        autoFocus
                        value={customTipInput}
                        onChange={(e) => setCustomTipInput(e.target.value)}
                        placeholder={t.customTipPlaceholder}
                        className="w-full text-2xl font-bold tabular-nums text-stone-900 bg-transparent focus:outline-none"
                      />
                    </motion.div>
                  )}

                  {/* Full Live Breakdown */}
                  <div className="bg-white/80 rounded-3xl p-5 border border-black/8 space-y-2.5 text-sm">
                    <div className="flex justify-between text-stone-600">
                      <span>{t.subtotal}</span>
                      <span className="font-semibold tabular-nums text-stone-900">{formatMoney(subtotal, currency)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>
                        {t.salesTax} ({taxRate}%)
                      </span>
                      <span className="font-semibold tabular-nums text-stone-900">{formatMoney(taxAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>
                        {t.tip}
                        {tipPercent ? ` (${tipPercent}%)` : ''}
                      </span>
                      <span className="font-semibold tabular-nums text-stone-900">{formatMoney(tipAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-3 border-t border-black/10">
                      <span className="font-serif font-extrabold text-xl text-stone-900">{t.total}</span>
                      <span className="font-serif font-black text-3xl tabular-nums" style={{ color: primaryColor }}>
                        {formatMoney(grandTotal, currency)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startTerminalPaymentStep}
                    className="w-full min-h-[60px] rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer"
                    style={{ backgroundColor: primaryColor, color: primaryContrast }}
                  >
                    <CreditCard size={22} />
                    <span>
                      {t.proceedToPayment} · {formatMoney(grandTotal, currency)}
                    </span>
                  </button>
                </div>
              )}

              {/* STEP 3: PAYMENT TERMINAL READER */}
              {step === 'payment' && (
                <div className="py-6 flex flex-col items-center text-center space-y-7">
                  {/* Animated Contactless / Apple Pay Visual */}
                  <div className="relative flex items-center justify-center w-36 h-36">
                    <motion.div
                      animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0.05, 0.35] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <motion.div
                      animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.15, 0.55] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                      className="absolute inset-4 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div
                      className="relative w-24 h-24 rounded-full shadow-2xl flex items-center justify-center"
                      style={{ backgroundColor: primaryColor, color: primaryContrast }}
                    >
                      <div className="flex items-center gap-1">
                        <Smartphone size={26} />
                        <Wifi size={22} className="rotate-90" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 max-w-md">
                    <div className="font-serif font-black text-4xl tabular-nums text-stone-900">
                      {formatMoney(grandTotal, currency)}
                    </div>
                    <h3 className="text-lg sm:text-xl font-serif font-bold text-stone-900 text-balance">
                      {t.tapInsertSwipe}
                    </h3>
                    <p className="text-xs font-semibold tracking-wide text-stone-500 pt-1">
                      {t.acceptedMethods}
                    </p>
                  </div>

                  {/* Provider / Reader Connection State */}
                  <div className="w-full max-w-sm bg-white/80 rounded-2xl px-4 py-3 border border-black/8 flex items-center justify-between text-xs text-stone-600">
                    <span className="font-semibold">
                      {terminalProvider === 'square'
                        ? 'Square Terminal'
                        : terminalProvider === 'zettle'
                        ? 'PayPal Zettle Reader'
                        : 'Demo Terminal Mode'}
                    </span>
                    <span className="font-bold text-stone-900">
                      {isAuthorizing ? t.processingPayment : t.waitingReader}
                    </span>
                  </div>

                  {paymentError && (
                    <div className="w-full max-w-md p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                      {paymentError}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="w-full max-w-sm space-y-3 pt-2">
                    {/* Discreet Simulate Approved Payment button — ONLY visible in simulation mode */}
                    {terminalProvider === 'simulation' && (
                      <button
                        type="button"
                        disabled={isAuthorizing}
                        onClick={handleSimulatePayment}
                        className="w-full min-h-[52px] rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: primaryColor, color: primaryContrast }}
                      >
                        <Sparkles size={16} />
                        <span>{isAuthorizing ? t.processingPayment : t.simulatePaymentBtn}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isAuthorizing}
                      onClick={handleCancelPaymentStep}
                      className="w-full min-h-[48px] rounded-2xl bg-white hover:bg-stone-50 border border-black/10 font-bold text-sm text-stone-700 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      {t.cancelPayment}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: ORDER CONFIRMED + DUAL 80MM PRINTING */}
              {step === 'success' && confirmedOrder && (
                <div className="py-4 flex flex-col items-center text-center space-y-6">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl"
                    style={{
                      backgroundColor: theme.details,
                      color: getContrastText(theme.details),
                    }}
                  >
                    <Check size={40} strokeWidth={3} />
                  </motion.div>

                  <div className="space-y-1">
                    <h2 className="text-3xl font-serif font-extrabold" style={{ color: theme.text }}>
                      {t.orderConfirmedTitle}
                    </h2>
                    <p className="text-sm" style={{ color: theme.textMuted }}>
                      {confirmedOrder.customerName} ·{' '}
                      {confirmedOrder.orderType === 'takeout' ? t.takeout : t.dineIn}
                      {confirmedOrder.tableOrPager ? ` · ${confirmedOrder.tableOrPager}` : ''}
                    </p>
                  </div>

                  {/* Giant Editorial Order Number Card */}
                  <div
                    className="w-full max-w-sm rounded-[28px] p-6 border shadow-sm space-y-2"
                    style={{
                      backgroundColor: theme.cardBgSolid,
                      borderColor: theme.primaryBorder,
                    }}
                  >
                    <div className="text-xs font-bold tracking-widest" style={{ color: theme.textMuted }}>
                      {t.yourOrderNumber}
                    </div>
                    <div
                      className="text-6xl sm:text-7xl font-serif font-black tracking-tight tabular-nums leading-none py-1"
                      style={{ color: primaryColor }}
                    >
                      #{confirmedOrder.orderNumber}
                    </div>
                    <div
                      className="pt-2 border-t flex items-center justify-between text-xs font-bold"
                      style={{ borderColor: theme.primaryBorder }}
                    >
                      <span style={{ color: theme.details }}>{t.paidBadge}</span>
                      <span className="tabular-nums" style={{ color: theme.price }}>
                        {formatMoney(confirmedOrder.total, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Dual 80mm Printing Status */}
                  <div className="w-full max-w-sm space-y-2.5">
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-stone-600">
                      <Printer size={15} />
                      <span>{isPrinting ? t.printingReceipts : t.receiptsPrinted}</span>
                    </div>

                    {printResult && (
                      <button
                        type="button"
                        onClick={() => setShowReceiptPreview(true)}
                        className="w-full min-h-[46px] px-4 rounded-2xl bg-white hover:bg-stone-50 border border-black/12 text-xs font-bold text-stone-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Printer size={15} />
                        <span>{t.previewPrintReceipts}</span>
                      </button>
                    )}
                  </div>

                  <div className="w-full max-w-sm space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={onOrderCompletedAndReset}
                      className="w-full min-h-[56px] rounded-2xl font-bold text-base shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                      style={{ backgroundColor: primaryColor, color: primaryContrast }}
                    >
                      <RotateCcw size={18} />
                      <span>{t.startNewOrder}</span>
                    </button>
                    {!showReceiptPreview && (
                      <p className="text-xs text-stone-500 tabular-nums">
                        {t.autoResetNotice(autoResetCountdown)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Dual 80mm Thermal Receipts Preview & Browser Fallback Print Modal */}
          <AnimatePresence>
            {showReceiptPreview && printResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
                onClick={() => setShowReceiptPreview(false)}
              >
                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border"
                  style={{
                    backgroundColor: theme.modalBg,
                    borderColor: theme.primaryBorder,
                    color: theme.text,
                  }}
                >
                  <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.primaryBorder }}>
                    <div>
                      <h3 className="font-serif font-bold text-lg" style={{ color: theme.text }}>
                        Dual 80mm Thermal Tickets
                      </h3>
                      <p className="text-xs text-stone-500">
                        Via 1: Customer Receipt · Via 2: Kitchen / Counter Ticket
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          triggerBrowserIframePrint([printResult.customerHtml, printResult.kitchenHtml])
                        }
                        className="min-h-[42px] px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                        style={{ backgroundColor: primaryColor, color: primaryContrast }}
                      >
                        <Printer size={15} />
                        <span>Print Both 80mm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReceiptPreview(false)}
                        className="w-10 h-10 rounded-full bg-white border border-black/10 flex items-center justify-center text-stone-700 cursor-pointer"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-stone-200/70">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-stone-600 text-center">
                        VIA 1 · CUSTOMER RECEIPT ({settings.kioskPrinterName || 'Totem_Receipt_80mm'})
                      </div>
                      <div className="bg-white rounded-xl p-5 shadow-md font-mono text-xs text-stone-900 border border-stone-300 leading-relaxed space-y-2">
                        <div className="text-center border-b border-dashed border-stone-400 pb-2">
                          <div className="font-black text-sm uppercase">{settings.brandName}</div>
                          <div className="text-2xl font-black mt-1">ORDER #{confirmedOrder?.orderNumber}</div>
                          <div className="font-bold">
                            {confirmedOrder?.orderType === 'takeout' ? 'TAKEOUT / TO-GO' : 'DINE-IN'}
                          </div>
                          <div>Guest: {confirmedOrder?.customerName}</div>
                        </div>
                        <div className="space-y-1.5 border-b border-dashed border-stone-400 pb-2">
                          {confirmedOrder?.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between gap-2">
                              <span>
                                <strong>{it.quantity}x</strong> {it.title}
                              </span>
                              <span className="tabular-nums">{formatMoney(it.price * it.quantity, currency)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{formatMoney(confirmedOrder?.subtotal, currency)}</span>
                          </div>
                          {(confirmedOrder?.taxAmount || 0) > 0 && (
                            <div className="flex justify-between">
                              <span>Sales Tax ({confirmedOrder?.taxRate}%)</span>
                              <span className="tabular-nums">{formatMoney(confirmedOrder?.taxAmount, currency)}</span>
                            </div>
                          )}
                          {(confirmedOrder?.tipAmount || 0) > 0 && (
                            <div className="flex justify-between">
                              <span>Tip</span>
                              <span className="tabular-nums">{formatMoney(confirmedOrder?.tipAmount, currency)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-black text-sm pt-1 border-t border-stone-900">
                            <span>TOTAL PAID</span>
                            <span className="tabular-nums">{formatMoney(confirmedOrder?.total, currency)}</span>
                          </div>
                        </div>
                        <div className="text-center font-black border border-stone-900 py-1 mt-2">
                          STATUS: PAID
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-stone-600 text-center">
                        VIA 2 · KITCHEN TICKET ({settings.kitchenPrinterName || 'Kitchen_Ticket_80mm'})
                      </div>
                      <div className="bg-white rounded-xl p-5 shadow-md font-mono text-xs text-stone-900 border-2 border-stone-900 leading-relaxed space-y-2">
                        <div className="text-center border-b-2 border-stone-900 pb-2">
                          <div className="text-[10px] font-bold tracking-widest">KITCHEN / COUNTER</div>
                          <div className="text-4xl font-black border-2 border-stone-900 py-1 my-1">
                            #{confirmedOrder?.orderNumber}
                          </div>
                          <div className="bg-stone-900 text-white font-black py-1 px-2 inline-block text-xs">
                            {confirmedOrder?.orderType === 'takeout' ? 'TAKEOUT / TO-GO' : 'DINE-IN'}
                          </div>
                          <div className="font-black text-sm mt-1 uppercase">
                            {confirmedOrder?.customerName}
                            {confirmedOrder?.tableOrPager ? ` · ${confirmedOrder.tableOrPager}` : ''}
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {confirmedOrder?.items.map((it, idx) => (
                            <div key={idx} className="border-b border-dashed border-stone-400 pb-2">
                              <div className="font-black text-sm uppercase">
                                {it.quantity}x {it.title}
                              </div>
                              {it.selectedSize && (
                                <div className="font-black pl-2 uppercase">» SIZE: {it.selectedSize.name}</div>
                              )}
                              {it.mealOptions?.removals?.map((r, rIdx) => (
                                <div key={rIdx} className="font-black pl-2 uppercase">
                                  » NO {r}
                                </div>
                              ))}
                              {it.mealOptions?.sides?.map((s, sIdx) => (
                                <div key={sIdx} className="font-black pl-2 uppercase">
                                  » {s.type === 'swap' ? 'SWAP' : 'ADD'}: {s.name}
                                </div>
                              ))}
                              {it.sandwichOptions?.fillings?.length ? (
                                <div className="font-black pl-2 uppercase">
                                  » OPTION: {it.sandwichOptions.fillings.join(' + ')}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {confirmedOrder?.observation && (
                          <div className="border-2 border-stone-900 p-2 font-black uppercase">
                            NOTE: {confirmedOrder.observation}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
};
