import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  Clock,
  Calendar,
  Zap,
  CreditCard,
  Smartphone,
  Check,
  Printer,
  Lock,
  ChevronRight,
  Phone,
  User,
  Sparkles,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import {
  CartItem,
  OnlinePaymentProvider,
  Order,
  OrderItem,
  PickupType,
  Product,
  Settings,
} from '../types';
import { formatMoney, getKioskDict, KioskLanguage } from '../utils/kioskI18n';
import { getBrandTheme } from '../utils/brandTheme';
import { generateNextDailyOrderNumber } from '../services/orderNumberService';
import {
  ONLINE_PAYMENT_METHOD_LABELS,
  processOnlineMobilePayment,
  resolveOnlinePaymentProvider,
} from '../services/onlinePaymentService';
import {
  DualPrintResult,
  printDualOrderReceipts,
  triggerBrowserIframePrint,
} from '../services/printService';
import { db } from '../firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

interface MobilePickupCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  products: Product[];
  settings: Settings;
  language: KioskLanguage;
  onRemoveFromCart: (cartItemId: string) => void;
  onValidateCart: () => { isValid: boolean; message?: string; isMinOrder?: boolean };
}

type MobileCheckoutStep = 'review' | 'pickup' | 'tip' | 'payment' | 'success';

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

const formatUsDate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const parseHHMMToMinutes = (hhmm: string | undefined, fallbackMinutes: number): number => {
  if (!hhmm || !hhmm.includes(':')) return fallbackMinutes;
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return fallbackMinutes;
  return h * 60 + m;
};

const formatMinutesTo12h = (totalMinutes: number): string => {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
};

const formatUsPhoneInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const MobilePickupCheckoutModal: React.FC<MobilePickupCheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  setCart,
  products,
  settings,
  language,
  onRemoveFromCart,
  onValidateCart,
}) => {
  const t = getKioskDict(language);
  const currency = settings.currency || 'USD';
  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;
  const primaryContrast = theme.primaryContrast;
  const taxRate = typeof settings.salesTaxRate === 'number' ? settings.salesTaxRate : 7.75;
  const defaultPrepMinutes = Math.max(5, Number(settings.defaultPrepMinutes || 20));
  const openMinutes = parseHHMMToMinutes(settings.pickupOpenTime, 9 * 60); // 9:00 AM
  const closeMinutes = parseHHMMToMinutes(settings.pickupCloseTime, 21 * 60); // 9:00 PM
  const slotInterval = Math.max(10, Number(settings.pickupSlotIntervalMinutes || 15));
  const defaultOnlineMethod = resolveOnlinePaymentProvider(settings);

  const [step, setStep] = useState<MobileCheckoutStep>('review');
  const [pickupType, setPickupType] = useState<PickupType>('asap');

  // Next 7 days in USA MM/DD/YYYY format
  const availableDates = useMemo(() => {
    const list: { value: string; label: string; isToday: boolean }[] = [];
    const today = new Date();
    const locale = language === 'es' ? 'es-US' : language === 'pt' ? 'pt-BR' : 'en-US';
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const val = formatUsDate(d);
      const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
      const dayTag =
        i === 0
          ? language === 'es'
            ? 'Hoy'
            : language === 'pt'
              ? 'Hoje'
              : 'Today'
          : i === 1
            ? language === 'es'
              ? 'Mañana'
              : language === 'pt'
                ? 'Amanhã'
                : 'Tomorrow'
            : weekday;
      list.push({
        value: val,
        label: `${dayTag} · ${val}`,
        isToday: i === 0,
      });
    }
    return list;
  }, [language]);

  const [selectedDate, setSelectedDate] = useState<string>(() => formatUsDate(new Date()));
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');

  // Generate pickup time slots for the selected date respecting operating hours & prep time
  const availableTimeSlots = useMemo(() => {
    const now = new Date();
    const todayStr = formatUsDate(now);
    const isToday = selectedDate === todayStr;
    const minStartToday = now.getHours() * 60 + now.getMinutes() + defaultPrepMinutes;

    const slots: string[] = [];
    const safeClose = closeMinutes > openMinutes ? closeMinutes : openMinutes + 8 * 60;
    for (let m = openMinutes; m <= safeClose; m += slotInterval) {
      if (isToday && m < minStartToday) continue;
      slots.push(formatMinutesTo12h(m));
    }
    return slots;
  }, [selectedDate, openMinutes, closeMinutes, slotInterval, defaultPrepMinutes]);

  useEffect(() => {
    if (pickupType === 'scheduled') {
      if (availableTimeSlots.length > 0) {
        if (!availableTimeSlots.includes(selectedTimeSlot)) {
          setSelectedTimeSlot(availableTimeSlots[0]);
        }
      } else {
        setSelectedTimeSlot('');
      }
    }
  }, [pickupType, availableTimeSlots, selectedTimeSlot]);

  // Customer Details
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState(settings.whatsappCountryCode || '+1');
  const [phoneInput, setPhoneInput] = useState('');
  const [orderNote, setOrderNote] = useState('');

  // Tip State
  const [tipSelection, setTipSelection] = useState<'none' | '15' | '18' | '20' | 'custom'>('18');
  const [customTipInput, setCustomTipInput] = useState('');

  // Online Payment State
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<OnlinePaymentProvider>(defaultOnlineMethod);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Confirmed Order
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [printResult, setPrintResult] = useState<DualPrintResult | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('review');
      setPickupType('asap');
      setSelectedDate(formatUsDate(new Date()));
      setSelectedTimeSlot('');
      setFullName('');
      setCountryCode(settings.whatsappCountryCode || '+1');
      setPhoneInput('');
      setOrderNote('');
      setTipSelection('18');
      setCustomTipInput('');
      setSelectedPaymentMethod(defaultOnlineMethod);
      setIsAuthorizing(false);
      setPaymentError(null);
      setConfirmedOrder(null);
      setPrintResult(null);
      setShowReceiptPreview(false);
    }
  }, [isOpen, defaultOnlineMethod, settings.whatsappCountryCode]);

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

  const computedScheduledLabel = useMemo(() => {
    if (pickupType === 'asap') {
      return `ASAP (~${defaultPrepMinutes} min)`;
    }
    const todayStr = formatUsDate(new Date());
    if (selectedDate === todayStr) {
      return selectedTimeSlot ? `Today ${selectedTimeSlot}` : `ASAP (~${defaultPrepMinutes} min)`;
    }
    return `${selectedDate} ${selectedTimeSlot}`.trim();
  }, [pickupType, defaultPrepMinutes, selectedDate, selectedTimeSlot]);

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

  const handleContinueFromPickup = () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error(t.fullNameRequired);
      return;
    }
    const phoneDigits = phoneInput.replace(/\D/g, '');
    if (phoneDigits.length < 8) {
      toast.error(t.mobilePhoneRequired);
      return;
    }
    if (pickupType === 'scheduled' && !selectedTimeSlot) {
      toast.error(t.pickupNoSlotsToday);
      return;
    }
    setStep('tip');
  };

  const handleExecuteOnlinePayment = async () => {
    if (isAuthorizing) return;
    setIsAuthorizing(true);
    setPaymentError(null);

    try {
      const formattedPhone = `${countryCode} ${phoneInput.trim()}`.trim();
      const paymentResult = await processOnlineMobilePayment(
        {
          amount: grandTotal,
          currency,
          customerName: fullName.trim(),
          phone: formattedPhone,
          referenceId: `mob_${Date.now()}`,
          selectedMethod: selectedPaymentMethod,
        },
        settings
      );

      if (!paymentResult.approved) {
        setPaymentError(paymentResult.error || 'Payment could not be completed. Please try again.');
        setIsAuthorizing(false);
        return;
      }

      const orderNumber = await generateNextDailyOrderNumber();
      const items = buildOrderItems();
      const nowDate = new Date();
      const pickupDateValue = pickupType === 'asap' ? formatUsDate(nowDate) : selectedDate;
      const pickupTimeValue =
        pickupType === 'asap'
          ? `ASAP (~${defaultPrepMinutes} min)`
          : selectedTimeSlot || `ASAP (~${defaultPrepMinutes} min)`;

      const newOrderPayload = cleanFirestoreObject({
        orderNumber,
        customerName: fullName.trim(),
        orderType: 'takeout' as const,
        deliveryType: 'pickup' as const,
        phone: formattedPhone,
        address: `Mobile Pickup (${computedScheduledLabel})`,
        pickupDate: pickupDateValue,
        pickupTime: pickupTimeValue,
        pickupType,
        scheduledTime: computedScheduledLabel,
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
        onlinePaymentProvider: paymentResult.provider,
        paymentTransactionId: paymentResult.transactionId,
        kitchenStatus: 'preparing' as const,
        orderLanguage: language,
        source: 'online' as const,
        orderSource: 'mobile_pickup' as const,
        createdAt: serverTimestamp(),
      });

      let savedId = `mobile_${Date.now()}`;
      try {
        const docRef = await addDoc(collection(db, 'pedidos'), newOrderPayload);
        savedId = docRef.id;
      } catch (fsErr) {
        console.warn('[MobilePickupCheckout] Firestore save warning:', fsErr);
      }

      const finalOrder: Order = {
        ...newOrderPayload,
        id: savedId,
        createdAt: nowDate,
      } as Order;

      setConfirmedOrder(finalOrder);
      setStep('success');
      setCart([]);

      // Trigger counter/kitchen printer if connected (QZ Tray silently, browser preview only on tap)
      const pResult = await printDualOrderReceipts(finalOrder, settings);
      setPrintResult(pResult);
    } catch (err) {
      console.error('[MobilePickupCheckout] Payment error:', err);
      setPaymentError('Unable to process payment. Please try again.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const updateCartItemQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  if (!isOpen) return null;

  const paymentMethods: { id: OnlinePaymentProvider; title: string; subtitle: string }[] = [
    {
      id: 'square_web',
      title: 'Card · Apple Pay · Google Pay',
      subtitle: 'Visa, Mastercard, Amex & digital wallets',
    },
    {
      id: 'paypal',
      title: 'PayPal',
      subtitle: 'Fast checkout with your PayPal balance or card',
    },
    {
      id: 'venmo',
      title: 'Venmo',
      subtitle: 'Pay seamlessly with your Venmo mobile account',
    },
    ...(defaultOnlineMethod === 'simulation'
      ? [
          {
            id: 'simulation' as OnlinePaymentProvider,
            title: 'Express Checkout (Demo)',
            subtitle: 'Instant test approval for Mobile Pickup preview',
          },
        ]
      : []),
  ];

  const stepIndex =
    step === 'review' ? 1 : step === 'pickup' ? 2 : step === 'tip' ? 3 : step === 'payment' ? 4 : 5;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isAuthorizing) onClose();
          }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 36, scale: 0.97 }}
          className="relative w-full max-w-xl max-h-[94vh] rounded-t-[32px] sm:rounded-[32px] border shadow-2xl overflow-hidden flex flex-col font-sans"
          style={{
            backgroundColor: theme.modalBg,
            borderColor: theme.primaryBorder,
            color: theme.text,
          }}
        >
          {/* Top Modal Header */}
          <div
            className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
            style={{
              backgroundColor: theme.cardBgSolid,
              borderColor: theme.primaryBorder,
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {step !== 'review' && step !== 'success' && !isAuthorizing && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 'pickup') setStep('review');
                    else if (step === 'tip') setStep('pickup');
                    else if (step === 'payment') setStep('tip');
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  style={{ backgroundColor: theme.primaryTint08, color: theme.primary }}
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="min-w-0">
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest"
                  style={{ color: theme.primary }}
                >
                  <Smartphone size={11} />
                  {t.mobilePickupBadge}
                </span>
                <h2 className="text-lg sm:text-xl font-serif font-black truncate" style={{ color: theme.text }}>
                  {step === 'review'
                    ? t.cartTitle
                    : step === 'pickup'
                      ? t.pickupStepTitle
                      : step === 'tip'
                        ? t.stepTipTitle
                        : step === 'payment'
                          ? t.onlinePaymentTitle
                          : t.orderConfirmedTitle}
                </h2>
              </div>
            </div>

            {!isAuthorizing && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0"
                style={{ backgroundColor: theme.primaryTint08, color: theme.textMuted }}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Step Progress Bar */}
          {step !== 'success' && (
            <div className="h-1 w-full" style={{ backgroundColor: theme.primaryTint08 }}>
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(stepIndex / 4) * 100}%`,
                  backgroundColor: primaryColor,
                }}
              />
            </div>
          )}

          {/* Scrollable Body */}
          <div className="flex-grow overflow-y-auto p-5 space-y-5">
            {/* STEP 1: REVIEW CART */}
            {step === 'review' && (
              <>
                {cart.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <div
                      className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                      style={{ backgroundColor: theme.primaryTint08, color: primaryColor }}
                    >
                      <ShoppingBag size={28} />
                    </div>
                    <h3 className="text-lg font-serif font-bold" style={{ color: theme.text }}>
                      {t.emptyCartTitle}
                    </h3>
                    <p className="text-xs max-w-xs mx-auto" style={{ color: theme.textMuted }}>
                      {t.emptyCartDesc}
                    </p>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-2 px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                      style={{ backgroundColor: primaryColor, color: primaryContrast }}
                    >
                      {t.backToMenu}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const product = products.find((p) => p.id === item.productId);
                      const basePrice = item.selectedSize
                        ? item.selectedSize.price
                        : product?.price && product.price > 0
                          ? product.price
                          : product?.oldPrice || 0;
                      const sidesTotal =
                        item.mealOptions?.sides?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
                      const unitTotal = basePrice + sidesTotal;

                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
                          style={{
                            backgroundColor: theme.cardBgSolid,
                            borderColor: theme.primaryBorder,
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {product?.image && (
                              <img
                                src={product.image}
                                alt={product.title}
                                className="w-14 h-14 rounded-xl object-cover shrink-0 border"
                                style={{ borderColor: theme.primaryBorder }}
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm truncate" style={{ color: theme.text }}>
                                {product?.title || 'Item'}
                              </h4>
                              {item.selectedSize && (
                                <p className="text-[11px]" style={{ color: theme.textMuted }}>
                                  {item.selectedSize.name}
                                </p>
                              )}
                              {item.observation && (
                                <p className="text-[11px] italic truncate" style={{ color: theme.textMuted }}>
                                  “{item.observation}”
                                </p>
                              )}
                              <p className="text-sm font-serif font-black mt-0.5 tabular-nums" style={{ color: theme.price }}>
                                {formatMoney(unitTotal * item.quantity, currency)}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 border rounded-full p-1 shrink-0"
                            style={{ borderColor: theme.primaryBorder, backgroundColor: theme.surfaceBg }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity <= 1) onRemoveFromCart(item.id);
                                else updateCartItemQty(item.id, -1);
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                              style={{ backgroundColor: theme.primaryTint08, color: primaryColor }}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-xs font-black min-w-[18px] text-center tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartItemQty(item.id, 1)}
                              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                              style={{ backgroundColor: primaryColor, color: primaryContrast }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div
                      className="p-4 rounded-2xl border space-y-1.5"
                      style={{ backgroundColor: theme.primaryTint05, borderColor: theme.primaryBorder }}
                    >
                      <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                        <span>{t.subtotal}</span>
                        <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                        <span>
                          {t.salesTax} ({taxRate}%)
                        </span>
                        <span className="tabular-nums">{formatMoney(taxAmount, currency)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* STEP 2: PICKUP TIME + CUSTOMER INFO */}
            {step === 'pickup' && (
              <div className="space-y-5">
                <p className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>
                  {t.pickupStepSubtitle}
                </p>

                {/* ASAP vs Schedule Toggle */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPickupType('asap')}
                    className="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5"
                    style={{
                      backgroundColor: pickupType === 'asap' ? theme.primaryTint12 : theme.cardBgSolid,
                      borderColor: pickupType === 'asap' ? primaryColor : theme.primaryBorder,
                      borderWidth: pickupType === 'asap' ? 2 : 1,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: pickupType === 'asap' ? primaryColor : theme.primaryTint08,
                        color: pickupType === 'asap' ? primaryContrast : primaryColor,
                      }}
                    >
                      <Zap size={18} />
                    </div>
                    <div className="text-sm font-black tracking-tight" style={{ color: theme.text }}>
                      {t.pickupAsapTitle}
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: theme.textMuted }}>
                      {t.pickupAsapDesc(defaultPrepMinutes)}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPickupType('scheduled')}
                    className="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5"
                    style={{
                      backgroundColor: pickupType === 'scheduled' ? theme.primaryTint12 : theme.cardBgSolid,
                      borderColor: pickupType === 'scheduled' ? primaryColor : theme.primaryBorder,
                      borderWidth: pickupType === 'scheduled' ? 2 : 1,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: pickupType === 'scheduled' ? primaryColor : theme.primaryTint08,
                        color: pickupType === 'scheduled' ? primaryContrast : primaryColor,
                      }}
                    >
                      <Calendar size={18} />
                    </div>
                    <div className="text-sm font-black tracking-tight" style={{ color: theme.text }}>
                      {t.pickupScheduleTitle}
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: theme.textMuted }}>
                      {t.pickupScheduleDesc}
                    </div>
                  </button>
                </div>

                {/* Scheduled Pickup Date (MM/DD/YYYY) & Time Slots */}
                {pickupType === 'scheduled' && (
                  <div
                    className="p-4 rounded-2xl border space-y-4"
                    style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                  >
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: theme.textMuted }}>
                        <Calendar size={13} style={{ color: primaryColor }} />
                        <span>{t.pickupDateLabel}</span>
                      </label>
                      <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full p-3 rounded-xl border text-sm font-bold outline-none"
                        style={{
                          backgroundColor: theme.surfaceBg,
                          borderColor: theme.primaryBorder,
                          color: theme.text,
                        }}
                      >
                        {availableDates.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: theme.textMuted }}>
                        <Clock size={13} style={{ color: primaryColor }} />
                        <span>{t.pickupTimeSlotLabel}</span>
                      </label>
                      {availableTimeSlots.length === 0 ? (
                        <p className="text-xs font-semibold p-3 rounded-xl border" style={{ backgroundColor: theme.primaryTint05, borderColor: theme.primaryBorder, color: theme.textMuted }}>
                          {t.pickupNoSlotsToday}
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                          {availableTimeSlots.map((slot) => {
                            const active = selectedTimeSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setSelectedTimeSlot(slot)}
                                className="py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer tabular-nums"
                                style={{
                                  backgroundColor: active ? primaryColor : theme.surfaceBg,
                                  color: active ? primaryContrast : theme.text,
                                  borderColor: active ? primaryColor : theme.primaryBorder,
                                }}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Customer Details */}
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: theme.textMuted }}>
                      <User size={13} style={{ color: primaryColor }} />
                      <span>{t.fullNameLabel} *</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t.fullNamePlaceholder}
                      className="w-full p-3.5 rounded-2xl border text-sm font-semibold outline-none"
                      style={{
                        backgroundColor: theme.cardBgSolid,
                        borderColor: theme.primaryBorder,
                        color: theme.text,
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: theme.textMuted }}>
                      <Phone size={13} style={{ color: primaryColor }} />
                      <span>{t.mobilePhoneLabel} *</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-24 p-3.5 rounded-2xl border text-sm font-bold outline-none shrink-0"
                        style={{
                          backgroundColor: theme.cardBgSolid,
                          borderColor: theme.primaryBorder,
                          color: theme.text,
                        }}
                      >
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+55">🇧🇷 +55</option>
                        <option value="+52">🇲🇽 +52</option>
                        <option value="+34">🇪🇸 +34</option>
                        <option value="+351">🇵🇹 +351</option>
                      </select>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phoneInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPhoneInput(countryCode === '+1' ? formatUsPhoneInput(val) : val);
                        }}
                        placeholder={t.mobilePhonePlaceholder}
                        className="flex-1 p-3.5 rounded-2xl border text-sm font-semibold outline-none"
                        style={{
                          backgroundColor: theme.cardBgSolid,
                          borderColor: theme.primaryBorder,
                          color: theme.text,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: theme.textMuted }}>
                      {t.orderNoteLabel}
                    </label>
                    <textarea
                      rows={2}
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      placeholder={t.orderNotePlaceholder}
                      className="w-full p-3 rounded-2xl border text-sm outline-none resize-none"
                      style={{
                        backgroundColor: theme.cardBgSolid,
                        borderColor: theme.primaryBorder,
                        color: theme.text,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: USA TIP & FINANCIAL BREAKDOWN */}
            {step === 'tip' && (
              <div className="space-y-5">
                <p className="text-xs" style={{ color: theme.textMuted }}>
                  {t.stepTipSubtitle}
                </p>

                <div className="grid grid-cols-3 gap-2.5">
                  {(['15', '18', '20'] as const).map((pct) => {
                    const active = tipSelection === pct;
                    const amount = Math.round(subtotal * (parseInt(pct, 10) / 100) * 100) / 100;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTipSelection(pct)}
                        className="py-4 px-2 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? primaryColor : theme.cardBgSolid,
                          color: active ? primaryContrast : theme.text,
                          borderColor: active ? primaryColor : theme.primaryBorder,
                        }}
                      >
                        <span className="text-lg font-serif font-black">{pct}%</span>
                        <span className="text-xs font-bold opacity-85 tabular-nums">
                          {formatMoney(amount, currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTipSelection('custom')}
                    className="py-3 px-4 rounded-2xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    style={{
                      backgroundColor: tipSelection === 'custom' ? theme.primaryTint12 : theme.cardBgSolid,
                      borderColor: tipSelection === 'custom' ? primaryColor : theme.primaryBorder,
                      color: theme.text,
                    }}
                  >
                    {t.customTip}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipSelection('none')}
                    className="py-3 px-4 rounded-2xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    style={{
                      backgroundColor: tipSelection === 'none' ? theme.primaryTint12 : theme.cardBgSolid,
                      borderColor: tipSelection === 'none' ? primaryColor : theme.primaryBorder,
                      color: theme.text,
                    }}
                  >
                    {t.noTip}
                  </button>
                </div>

                {tipSelection === 'custom' && (
                  <div className="relative">
                    <span
                      className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm"
                      style={{ color: theme.textMuted }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      inputMode="decimal"
                      value={customTipInput}
                      onChange={(e) => setCustomTipInput(e.target.value)}
                      placeholder={t.customTipPlaceholder}
                      className="w-full pl-9 pr-4 py-3.5 rounded-2xl border text-sm font-black outline-none"
                      style={{
                        backgroundColor: theme.cardBgSolid,
                        borderColor: primaryColor,
                        color: theme.text,
                      }}
                    />
                  </div>
                )}

                {/* USA Order Breakdown */}
                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                >
                  <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                    <span>{t.pickupTimeSummaryLabel}</span>
                    <span className="font-bold" style={{ color: primaryColor }}>
                      {computedScheduledLabel}
                    </span>
                  </div>
                  <div className="border-t my-2" style={{ borderColor: theme.primaryBorder }} />
                  <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                    <span>{t.subtotal}</span>
                    <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                    <span>
                      {t.salesTax} ({taxRate}%)
                    </span>
                    <span className="tabular-nums">{formatMoney(taxAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold" style={{ color: theme.textMuted }}>
                    <span>{t.tip}</span>
                    <span className="tabular-nums">{formatMoney(tipAmount, currency)}</span>
                  </div>
                  <div
                    className="border-t pt-2.5 mt-1 flex justify-between items-baseline"
                    style={{ borderColor: theme.primaryBorder }}
                  >
                    <span className="text-sm font-black uppercase tracking-wider">{t.total}</span>
                    <span className="text-2xl font-serif font-black tabular-nums" style={{ color: theme.price }}>
                      {formatMoney(grandTotal, currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: ONLINE MOBILE PAYMENT */}
            {step === 'payment' && (
              <div className="space-y-5">
                <div
                  className="p-4 rounded-2xl border flex items-center justify-between gap-3"
                  style={{ backgroundColor: theme.primaryTint08, borderColor: theme.primaryBorder }}
                >
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.textMuted }}>
                      {t.pickupTimeSummaryLabel} · {computedScheduledLabel}
                    </div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: theme.text }}>
                      {fullName} · {countryCode} {phoneInput}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-black uppercase" style={{ color: theme.textMuted }}>
                      {t.total}
                    </div>
                    <div className="text-xl font-serif font-black tabular-nums" style={{ color: theme.price }}>
                      {formatMoney(grandTotal, currency)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: theme.textMuted }}>
                    {t.choosePaymentMethod}
                  </div>

                  {paymentMethods.map((method) => {
                    const active = selectedPaymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        disabled={isAuthorizing}
                        onClick={() => setSelectedPaymentMethod(method.id)}
                        className="w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer disabled:opacity-60"
                        style={{
                          backgroundColor: active ? theme.primaryTint12 : theme.cardBgSolid,
                          borderColor: active ? primaryColor : theme.primaryBorder,
                          borderWidth: active ? 2 : 1,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: active ? primaryColor : theme.primaryTint08,
                              color: active ? primaryContrast : primaryColor,
                            }}
                          >
                            {method.id === 'simulation' ? (
                              <Sparkles size={18} />
                            ) : method.id === 'venmo' || method.id === 'paypal' ? (
                              <Smartphone size={18} />
                            ) : (
                              <CreditCard size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-black" style={{ color: theme.text }}>
                              {method.title}
                            </div>
                            <div className="text-[11px]" style={{ color: theme.textMuted }}>
                              {method.subtitle}
                            </div>
                          </div>
                        </div>

                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{
                            borderColor: active ? primaryColor : theme.primaryBorderStrong,
                            backgroundColor: active ? primaryColor : 'transparent',
                          }}
                        >
                          {active && <Check size={12} style={{ color: primaryContrast }} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {paymentError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                    {paymentError}
                  </div>
                )}

                <div className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: theme.textSoft }}>
                  <Lock size={12} />
                  <span>{t.onlinePaymentSubtitle}</span>
                </div>
              </div>
            )}

            {/* STEP 5: CONFIRMED (NO AUTO-RESET ON MOBILE!) */}
            {step === 'success' && confirmedOrder && (
              <div className="py-4 text-center space-y-5">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  <Check size={40} strokeWidth={3} />
                </motion.div>

                <div className="space-y-1">
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border"
                    style={{
                      backgroundColor: theme.primaryTint12,
                      color: primaryColor,
                      borderColor: theme.primaryBorder,
                    }}
                  >
                    <Smartphone size={12} />
                    <span>{t.mobilePickupBadge} · {t.paidBadge}</span>
                  </div>
                  <h3 className="text-2xl font-serif font-black pt-1" style={{ color: theme.text }}>
                    {t.orderConfirmedTitle}
                  </h3>
                  <p className="text-xs max-w-sm mx-auto" style={{ color: theme.textMuted }}>
                    {t.mobileOrderConfirmedSubtitle}
                  </p>
                </div>

                {/* Big Order Number & Pickup Window */}
                <div
                  className="p-5 rounded-3xl border space-y-3"
                  style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                >
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: theme.textMuted }}>
                    {t.yourOrderNumber}
                  </div>
                  <div className="text-5xl font-serif font-black tabular-nums" style={{ color: primaryColor }}>
                    #{confirmedOrder.orderNumber}
                  </div>
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider"
                    style={{ backgroundColor: theme.primaryTint12, color: theme.text }}
                  >
                    <Clock size={14} style={{ color: primaryColor }} />
                    <span>{confirmedOrder.scheduledTime || computedScheduledLabel}</span>
                  </div>
                  <div className="text-xs font-semibold pt-1" style={{ color: theme.textMuted }}>
                    {confirmedOrder.customerName} · {confirmedOrder.phone}
                  </div>
                  <div className="text-sm font-serif font-black tabular-nums" style={{ color: theme.price }}>
                    {t.total}: {formatMoney(confirmedOrder.total, currency)}
                  </div>
                </div>

                {showReceiptPreview && printResult && (
                  <div
                    className="p-4 rounded-2xl border text-left space-y-3"
                    style={{ backgroundColor: '#ffffff', borderColor: theme.primaryBorder }}
                  >
                    <div
                      className="text-xs text-black overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: printResult.customerHtml }}
                    />
                    <button
                      type="button"
                      onClick={() => triggerBrowserIframePrint([printResult.customerHtml])}
                      className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                      style={{ backgroundColor: primaryColor, color: primaryContrast }}
                    >
                      <Printer size={14} />
                      <span>{t.previewPrintReceipts}</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2.5 pt-1">
                  {printResult && !showReceiptPreview && (
                    <button
                      type="button"
                      onClick={() => setShowReceiptPreview(true)}
                      className="w-full py-3 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: theme.cardBgSolid,
                        borderColor: theme.primaryBorder,
                        color: theme.text,
                      }}
                    >
                      <Printer size={15} />
                      <span>{t.previewPrintReceipts}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg cursor-pointer active:scale-[0.99] transition-all"
                    style={{ backgroundColor: primaryColor, color: primaryContrast }}
                  >
                    {t.orderMoreItemsBtn}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer Action Buttons */}
          {step !== 'success' && (
            <div
              className="p-4 sm:p-5 border-t shrink-0"
              style={{
                backgroundColor: theme.cardBgSolid,
                borderColor: theme.primaryBorder,
              }}
            >
              {step === 'review' && cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const validation = onValidateCart();
                    if (!validation.isValid) {
                      toast.error(validation.message || 'Please check your order items.');
                      return;
                    }
                    setStep('pickup');
                  }}
                  className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  <span>{t.continueCheckout}</span>
                  <ChevronRight size={18} />
                </button>
              )}

              {step === 'pickup' && (
                <button
                  type="button"
                  onClick={handleContinueFromPickup}
                  className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  <span>{t.continueToTip}</span>
                  <ChevronRight size={18} />
                </button>
              )}

              {step === 'tip' && (
                <button
                  type="button"
                  onClick={() => setStep('payment')}
                  className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  <span>
                    {t.proceedToPayment} · {formatMoney(grandTotal, currency)}
                  </span>
                  <ChevronRight size={18} />
                </button>
              )}

              {step === 'payment' && (
                <button
                  type="button"
                  disabled={isAuthorizing}
                  onClick={handleExecuteOnlinePayment}
                  className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all disabled:opacity-60"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  {isAuthorizing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{t.authorizingOnlinePayment}</span>
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      <span>
                        {t.payWithMethodBtn(
                          ONLINE_PAYMENT_METHOD_LABELS[selectedPaymentMethod],
                          formatMoney(grandTotal, currency)
                        )}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
