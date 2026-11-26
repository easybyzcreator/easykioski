import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  Clock,
  Calendar,
  Zap,
  Smartphone,
  Check,
  Printer,
  ChevronRight,
  Phone,
  User,
  Sparkles,
  Loader2,
  ShoppingBag,
  ExternalLink,
  Copy,
  CheckCircle2,
  ChefHat,
  BellRing,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import {
  CartItem,
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
  buildTotemQrPaymentUrl,
  formatPaypalDisplayLabel,
  getAvailableMobilePaymentMethods,
  isPaypalBizProfileUrl,
  MobileWalletMethod,
  sanitizeCashAppTag,
  sanitizePaypalUsername,
  sanitizeVenmoUsername,
} from '../services/appsScriptGenerator';
import {
  DualPrintResult,
  printDualOrderReceipts,
  triggerBrowserIframePrint,
} from '../services/printService';
import { db } from '../firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
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

function playConfirmationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(523.25, 0, 0.25);
    playTone(659.25, 0.12, 0.28);
    playTone(783.99, 0.24, 0.45);
  } catch {
    // Ignore autoplay restrictions
  }
}

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
  const defaultPrepMinutes = Math.max(5, Number(settings.defaultPrepMinutes || 25));
  const openMinutes = parseHHMMToMinutes(settings.pickupOpenTime, 9 * 60); // 9:00 AM
  const closeMinutes = parseHHMMToMinutes(settings.pickupCloseTime, 21 * 60); // 9:00 PM
  const slotInterval = Math.max(10, Number(settings.pickupSlotIntervalMinutes || 15));

  const availableWallets = useMemo(() => getAvailableMobilePaymentMethods(settings), [
    settings.venmoUsername,
    settings.paypalMeUsername,
    settings.cashAppTag,
    settings.zelleIdentifier,
  ]);

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

  // Zero-Gateway Payment State
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [lastTappedWallet, setLastTappedWallet] = useState<MobileWalletMethod | null>(null);
  const [copiedZelle, setCopiedZelle] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Confirmed Order + Live Kitchen Status Tracking
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [printResult, setPrintResult] = useState<DualPrintResult | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const hasFinalizedRef = useRef(false);

  // Reset modal cleanly ONLY when isOpen transitions to true (never reset on live Firestore settings updates!)
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
      setPendingOrder(null);
      setIsCreatingOrder(false);
      setIsUpdatingPayment(false);
      setLastTappedWallet(null);
      setCopiedZelle(false);
      setPaymentError(null);
      setConfirmedOrder(null);
      setPrintResult(null);
      setShowReceiptPreview(false);
      hasFinalizedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  // Real-time Firestore listener on the active Mobile Pickup order:
  // 1) Detects Google Apps Script / Demo payment confirmation (`paymentStatus === 'paid'`)
  // 2) Keeps listening on Success screen so customer sees live `kitchenStatus` (`preparing` -> `ready`)
  const trackedOrderId = confirmedOrder?.id || pendingOrder?.id || null;

  useEffect(() => {
    if (!isOpen || !trackedOrderId || trackedOrderId.startsWith('local_')) return;

    const orderRef = doc(db, 'pedidos', trackedOrderId);
    const unsubscribe = onSnapshot(
      orderRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<Order>;

        // Update live status when already on success screen (e.g. KDS marks READY or verifies manual payment)
        if (hasFinalizedRef.current) {
          setConfirmedOrder((prev) =>
            prev
              ? {
                  ...prev,
                  paymentStatus: data.paymentStatus || prev.paymentStatus,
                  paymentProvider: data.paymentProvider || prev.paymentProvider,
                  kitchenStatus: data.kitchenStatus || prev.kitchenStatus,
                }
              : prev
          );
          return;
        }

        // Transition from awaiting_payment -> paid automatically!
        if (data.paymentStatus === 'paid' && pendingOrder) {
          hasFinalizedRef.current = true;
          const paidOrder: Order = {
            ...pendingOrder,
            ...data,
            id: snap.id,
            paymentStatus: 'paid',
            paymentProvider: data.paymentProvider || lastTappedWallet || 'venmo',
            kitchenStatus: data.kitchenStatus || 'preparing',
          };

          playConfirmationChime();
          setConfirmedOrder(paidOrder);
          setStep('success');
          setCart([]);

          printDualOrderReceipts(paidOrder, settings)
            .then((res) => setPrintResult(res))
            .catch((err) => console.warn('[MobilePickup] Dual print warning:', err));
        }
      },
      (err) => {
        console.warn('[MobilePickup] onSnapshot listener error:', err);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, trackedOrderId]);

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

  // Creates the pending order (`awaiting_payment`) in Firestore and transitions to Step 4 Deep Links
  const startMobilePaymentStep = async () => {
    if (isCreatingOrder) return;
    setIsCreatingOrder(true);
    setPaymentError(null);

    try {
      const orderNumber = await generateNextDailyOrderNumber();
      const items = buildOrderItems();
      const nowDate = new Date();
      const formattedPhone = `${countryCode} ${phoneInput.trim()}`.trim();
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
        pickupSchedule: computedScheduledLabel,
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
        paymentStatus: 'awaiting_payment' as const,
        kitchenStatus: 'preparing' as const,
        orderLanguage: language,
        source: 'online' as const,
        orderSource: 'mobile_pickup' as const,
        createdAt: serverTimestamp(),
      });

      let savedId = `local_${Date.now()}`;
      try {
        const docRef = await addDoc(collection(db, 'pedidos'), newOrderPayload);
        savedId = docRef.id;
      } catch (fsErr) {
        console.warn('[MobilePickupCheckout] Firestore save warning:', fsErr);
        toast.error('Could not reach server. Please check your connection and try again.');
        setIsCreatingOrder(false);
        return;
      }

      const createdPendingOrder: Order = {
        ...newOrderPayload,
        id: savedId,
        createdAt: nowDate,
      } as Order;

      setPendingOrder(createdPendingOrder);
      setStep('payment');
    } catch (err) {
      console.error('[MobilePickupCheckout] Error creating pending order:', err);
      setPaymentError('Unable to prepare your order. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Clean up abandoned awaiting_payment document if customer goes back or closes modal before paying
  const cleanupPendingOrderIfUnpaid = async () => {
    if (pendingOrder && !hasFinalizedRef.current && !pendingOrder.id.startsWith('local_')) {
      const idToDelete = pendingOrder.id;
      setPendingOrder(null);
      try {
        await deleteDoc(doc(db, 'pedidos', idToDelete));
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  const handleCloseModal = async () => {
    if (isCreatingOrder || isUpdatingPayment) return;
    await cleanupPendingOrderIfUnpaid();
    onClose();
  };

  const handleBackFromPayment = async () => {
    if (isUpdatingPayment) return;
    await cleanupPendingOrderIfUnpaid();
    setStep('tip');
  };

  // Discreet fallback: customer confirms manually -> sends to KDS with yellow VERIFY PAYMENT banner
  const handleManualVerificationNotifyKitchen = async () => {
    if (!pendingOrder || isUpdatingPayment) return;
    setIsUpdatingPayment(true);
    setPaymentError(null);
    try {
      const chosenProvider = lastTappedWallet || availableWallets[0] || 'venmo';
      hasFinalizedRef.current = true;

      if (!pendingOrder.id.startsWith('local_')) {
        await updateDoc(doc(db, 'pedidos', pendingOrder.id), {
          paymentStatus: 'manual_verification',
          paymentProvider: chosenProvider,
        });
      }

      const manualOrder: Order = {
        ...pendingOrder,
        paymentStatus: 'manual_verification',
        paymentProvider: chosenProvider,
      };

      playConfirmationChime();
      setConfirmedOrder(manualOrder);
      setStep('success');
      setCart([]);

      // Only auto-print on manual verification if Admin didn't restrict printing strictly to confirmed paid orders
      const pResult = await printDualOrderReceipts(manualOrder, settings);
      setPrintResult(pResult);
    } catch (err) {
      console.error('[MobilePickupCheckout] Manual verification error:', err);
      hasFinalizedRef.current = false;
      setPaymentError('Could not notify kitchen. Please try again.');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  // Demo Mode button (only rendered when settings.totemDemoMode === true)
  const handleSimulateDemoPayment = async () => {
    if (!pendingOrder || isUpdatingPayment) return;
    setIsUpdatingPayment(true);
    setPaymentError(null);
    try {
      if (!pendingOrder.id.startsWith('local_')) {
        await updateDoc(doc(db, 'pedidos', pendingOrder.id), {
          paymentStatus: 'paid',
          paymentProvider: lastTappedWallet || 'demo',
          paymentConfirmedAt: serverTimestamp(),
        });
      } else {
        hasFinalizedRef.current = true;
        const paidOrder: Order = {
          ...pendingOrder,
          paymentStatus: 'paid',
          paymentProvider: 'demo',
        };
        playConfirmationChime();
        setConfirmedOrder(paidOrder);
        setStep('success');
        setCart([]);
        const pResult = await printDualOrderReceipts(paidOrder, settings);
        setPrintResult(pResult);
      }
    } catch (err) {
      console.error('[MobilePickupCheckout] Demo payment error:', err);
      setPaymentError('Could not simulate payment.');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleCopyZelleDetails = async () => {
    if (!pendingOrder) return;
    const zelleId = (settings.zelleIdentifier || '').trim();
    if (!zelleId) return;
    setLastTappedWallet('zelle');
    const copyText = `Zelle: ${zelleId} | Amount: ${formatMoney(pendingOrder.total, currency)} | Memo: Order #${pendingOrder.orderNumber}`;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopiedZelle(true);
      toast.success(t.mobileZelleCopiedToast);
      window.setTimeout(() => setCopiedZelle(false), 3000);
    } catch {
      toast.info(copyText);
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

  const stepIndex =
    step === 'review' ? 1 : step === 'pickup' ? 2 : step === 'tip' ? 3 : step === 'payment' ? 4 : 5;

  const venmoUrl =
    pendingOrder && sanitizeVenmoUsername(settings.venmoUsername)
      ? buildTotemQrPaymentUrl('venmo', settings, pendingOrder.total, pendingOrder.orderNumber || 100)
      : '';
  const paypalUrl =
    pendingOrder && sanitizePaypalUsername(settings.paypalMeUsername)
      ? buildTotemQrPaymentUrl('paypal', settings, pendingOrder.total, pendingOrder.orderNumber || 100)
      : '';
  const cashAppUrl =
    pendingOrder && sanitizeCashAppTag(settings.cashAppTag)
      ? buildTotemQrPaymentUrl('cashapp', settings, pendingOrder.total, pendingOrder.orderNumber || 100)
      : '';
  const zelleId = (settings.zelleIdentifier || '').trim();

  const isConfirmedManual = confirmedOrder?.paymentStatus === 'manual_verification';
  const isOrderReady =
    confirmedOrder?.kitchenStatus === 'ready' || confirmedOrder?.kitchenStatus === 'completed';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleCloseModal}
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
              {step !== 'review' && step !== 'success' && !isCreatingOrder && !isUpdatingPayment && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 'pickup') setStep('review');
                    else if (step === 'tip') setStep('pickup');
                    else if (step === 'payment') handleBackFromPayment();
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

            {!isCreatingOrder && !isUpdatingPayment && (
              <button
                type="button"
                onClick={handleCloseModal}
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
                              {item.sandwichOptions?.fillings && item.sandwichOptions.fillings.length > 0 && (
                                <p className="text-[11px] font-semibold leading-snug" style={{ color: theme.textMuted }}>
                                  {language === 'es' ? 'Rellenos' : language === 'pt' ? 'Recheios' : 'Fillings'}: {item.sandwichOptions.fillings.join(' + ')}
                                </p>
                              )}
                              {item.mealOptions?.removals && item.mealOptions.removals.length > 0 && (
                                <p className="text-[11px] font-semibold text-rose-600 leading-snug">
                                  {language === 'es' ? 'Sin' : language === 'pt' ? 'Sem' : 'No'}: {item.mealOptions.removals.join(', ')}
                                </p>
                              )}
                              {item.mealOptions?.sides && item.mealOptions.sides.length > 0 && (
                                <p className="text-[11px] leading-snug" style={{ color: theme.textMuted }}>
                                  + {item.mealOptions.sides.map((s) => s.name).join(', ')}
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

            {/* STEP 4: DIRECT MOBILE DEEP LINKS (VENMO / PAYPAL / CASH APP / ZELLE — ZERO GATEWAY) */}
            {step === 'payment' && pendingOrder && (
              <div className="space-y-4">
                {/* Order Summary Banner */}
                <div
                  className="p-4 rounded-2xl border flex items-center justify-between gap-3"
                  style={{ backgroundColor: theme.primaryTint08, borderColor: theme.primaryBorder }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                      style={{ color: primaryColor }}
                    >
                      <span>{t.qrOrderLabel(pendingOrder.orderNumber || 100)}</span>
                      <span>·</span>
                      <span>{computedScheduledLabel}</span>
                    </div>
                    <div className="text-sm font-bold mt-0.5 truncate" style={{ color: theme.text }}>
                      {fullName} · {countryCode} {phoneInput}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-black uppercase" style={{ color: theme.textMuted }}>
                      {t.qrAmountToPay}
                    </div>
                    <div className="text-2xl font-serif font-black tabular-nums" style={{ color: theme.price }}>
                      {formatMoney(pendingOrder.total, currency)}
                    </div>
                  </div>
                </div>

                {/* Live Listening Status Bar */}
                <div
                  className="px-4 py-3 rounded-2xl border flex items-center gap-3"
                  style={{
                    backgroundColor: theme.cardBgSolid,
                    borderColor: theme.primaryBorder,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <span className="text-xs font-semibold leading-snug" style={{ color: theme.textMuted }}>
                    {t.mobileWaitingPaymentStatus}
                  </span>
                </div>

                <p className="text-xs font-medium px-1" style={{ color: theme.textMuted }}>
                  {t.mobileDeepLinkSubtitle}
                </p>

                {/* Direct Mobile Wallet Deep-Link Buttons */}
                <div className="space-y-3">
                  {venmoUrl && (
                    <a
                      href={venmoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLastTappedWallet('venmo')}
                      className="w-full p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 transition-all active:scale-[0.98] text-white"
                      style={{ backgroundColor: '#008CFF' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center font-black text-xl shrink-0">
                          V
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-black tracking-tight">{t.mobilePayWithVenmo}</div>
                          <div className="text-[11px] font-semibold text-white/85 truncate">
                            @{sanitizeVenmoUsername(settings.venmoUsername)} · {t.mobileTapToOpenApp}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-black text-sm tabular-nums">
                        <span>{formatMoney(pendingOrder.total, currency)}</span>
                        <ExternalLink size={16} />
                      </div>
                    </a>
                  )}

                  {paypalUrl && (
                    <a
                      href={paypalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLastTappedWallet('paypal')}
                      className="w-full p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 transition-all active:scale-[0.98] text-white"
                      style={{ backgroundColor: '#003087' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center font-black text-xl shrink-0">
                          P
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-black tracking-tight">{t.mobilePayWithPaypal}</div>
                          <div className="text-[11px] font-semibold text-white/85 truncate">
                            {formatPaypalDisplayLabel(settings.paypalMeUsername)} ·{' '}
                            {isPaypalBizProfileUrl(settings.paypalMeUsername)
                              ? `Tap Pay · $${pendingOrder.total.toFixed(2)}`
                              : t.mobileTapToOpenApp}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-black text-sm tabular-nums">
                        <span>{formatMoney(pendingOrder.total, currency)}</span>
                        <ExternalLink size={16} />
                      </div>
                    </a>
                  )}

                  {cashAppUrl && (
                    <a
                      href={cashAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLastTappedWallet('cashapp')}
                      className="w-full p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 transition-all active:scale-[0.98] text-white"
                      style={{ backgroundColor: '#00C244' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center font-black text-xl shrink-0">
                          $
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-black tracking-tight">{t.mobilePayWithCashApp}</div>
                          <div className="text-[11px] font-semibold text-white/90 truncate">
                            ${sanitizeCashAppTag(settings.cashAppTag)} · {t.mobileTapToOpenApp}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-black text-sm tabular-nums">
                        <span>{formatMoney(pendingOrder.total, currency)}</span>
                        <ExternalLink size={16} />
                      </div>
                    </a>
                  )}

                  {/* Optional Zelle Card */}
                  {zelleId && (
                    <div
                      className="p-4 rounded-2xl border space-y-3"
                      style={{
                        backgroundColor: theme.cardBgSolid,
                        borderColor: '#6D1ED455',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-xl text-white shrink-0"
                            style={{ backgroundColor: '#6D1ED4' }}
                          >
                            Z
                          </div>
                          <div className="min-w-0">
                            <div className="text-base font-black tracking-tight" style={{ color: theme.text }}>
                              {t.mobilePayWithZelle}
                            </div>
                            <div className="text-xs font-mono font-bold truncate" style={{ color: '#6D1ED4' }}>
                              {zelleId}
                            </div>
                          </div>
                        </div>
                        <span className="text-sm font-black tabular-nums shrink-0" style={{ color: theme.price }}>
                          {formatMoney(pendingOrder.total, currency)}
                        </span>
                      </div>

                      <div
                        className="px-3 py-2 rounded-xl text-[11px] font-bold flex items-center justify-between gap-2"
                        style={{ backgroundColor: theme.primaryTint08, color: theme.text }}
                      >
                        <span>{t.mobileZelleMemoHint(pendingOrder.orderNumber || 100)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyZelleDetails}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                        style={{ backgroundColor: '#6D1ED4' }}
                      >
                        {copiedZelle ? <Check size={15} /> : <Copy size={15} />}
                        <span>{t.mobileCopyZelleAndAmount}</span>
                      </button>
                    </div>
                  )}

                  {availableWallets.length === 0 && (
                    <div
                      className="p-4 rounded-2xl border flex items-start gap-3 text-xs"
                      style={{ backgroundColor: theme.primaryTint05, borderColor: theme.primaryBorder, color: theme.textMuted }}
                    >
                      <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: primaryColor }} />
                      <span>{t.mobileNoWalletsConfigured}</span>
                    </div>
                  )}
                </div>

                {paymentError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                    {paymentError}
                  </div>
                )}

                {/* Secondary Actions: Discreet Manual Notify Kitchen + Conditional Demo Mode */}
                <div className="pt-2 space-y-2.5 border-t" style={{ borderColor: theme.primaryBorder }}>
                  <button
                    type="button"
                    disabled={isUpdatingPayment}
                    onClick={handleManualVerificationNotifyKitchen}
                    className="w-full py-3.5 px-4 rounded-2xl border text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: theme.cardBgSolid,
                      borderColor: theme.primaryBorderStrong,
                      color: theme.text,
                    }}
                  >
                    {isUpdatingPayment ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <BellRing size={15} style={{ color: primaryColor }} />
                    )}
                    <span>{t.mobileIvePaidNotifyKitchen}</span>
                  </button>

                  {settings.totemDemoMode === true && (
                    <button
                      type="button"
                      disabled={isUpdatingPayment}
                      onClick={handleSimulateDemoPayment}
                      className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingPayment ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      <span>{t.mobileSimulateDemoBtn}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5: PAYMENT CONFIRMED + LIVE KITCHEN TRACKER (NO AUTO-RESET ON MOBILE) */}
            {step === 'success' && confirmedOrder && (
              <div className="py-3 text-center space-y-5">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
                  style={{
                    backgroundColor: isOrderReady ? '#059669' : primaryColor,
                    color: '#ffffff',
                  }}
                >
                  <Check size={40} strokeWidth={3} />
                </motion.div>

                <div className="space-y-1.5">
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border"
                    style={{
                      backgroundColor: isConfirmedManual ? '#FEF3C7' : theme.primaryTint12,
                      color: isConfirmedManual ? '#92400E' : primaryColor,
                      borderColor: isConfirmedManual ? '#F59E0B' : theme.primaryBorder,
                    }}
                  >
                    <Smartphone size={12} />
                    <span>
                      {t.mobilePickupBadge} · {isConfirmedManual ? t.qrManualVerificationBadge : t.paidBadge}
                    </span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-serif font-black pt-1 leading-snug" style={{ color: theme.text }}>
                    {isConfirmedManual
                      ? t.mobileManualVerifyHeadline(confirmedOrder.orderNumber || 100)
                      : t.mobilePaymentConfirmedHeadline(confirmedOrder.orderNumber || 100)}
                  </h3>
                  <p className="text-xs max-w-sm mx-auto" style={{ color: theme.textMuted }}>
                    {isConfirmedManual ? t.qrManualVerificationSub : t.mobileOrderConfirmedSubtitle}
                  </p>
                </div>

                {/* Big Order Number & Pickup Schedule Card */}
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
                    <span>{confirmedOrder.pickupSchedule || confirmedOrder.scheduledTime || computedScheduledLabel}</span>
                  </div>
                  <div className="text-xs font-semibold pt-1" style={{ color: theme.textMuted }}>
                    {confirmedOrder.customerName} · {confirmedOrder.phone}
                  </div>
                  <div className="text-sm font-serif font-black tabular-nums" style={{ color: theme.price }}>
                    {t.total}: {formatMoney(confirmedOrder.total, currency)}
                  </div>
                </div>

                {/* Live Real-Time Order Status Card (Synced with KDS via onSnapshot) */}
                <div
                  className="p-4 rounded-2xl border flex items-center justify-between gap-3 text-left"
                  style={{
                    backgroundColor: isOrderReady ? '#ECFDF5' : theme.primaryTint08,
                    borderColor: isOrderReady ? '#10B981' : theme.primaryBorder,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isOrderReady ? '#059669' : primaryColor,
                        color: '#ffffff',
                      }}
                    >
                      {isOrderReady ? <CheckCircle2 size={20} /> : <ChefHat size={20} />}
                    </div>
                    <div className="min-w-0">
                      <div
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: isOrderReady ? '#047857' : theme.textMuted }}
                      >
                        {t.mobileOrderStatusLabel}
                      </div>
                      <div
                        className="text-sm font-black"
                        style={{ color: isOrderReady ? '#065F46' : theme.text }}
                      >
                        {isOrderReady ? t.mobileOrderStatusReady : t.mobileOrderStatusPreparing}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${isOrderReady ? 'bg-emerald-500' : 'animate-pulse'}`}
                    style={!isOrderReady ? { backgroundColor: primaryColor } : undefined}
                  />
                </div>

                {/* Clean Declarative Receipt Preview Card (Safe React bindings — no raw HTML injection) */}
                {showReceiptPreview && (
                  <div
                    className="p-4 rounded-2xl border text-left space-y-3"
                    style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                  >
                    <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: theme.primaryBorder }}>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider" style={{ color: theme.text }}>
                          {settings.brandName || 'Easy Kioski'}
                        </div>
                        <div className="text-[11px]" style={{ color: theme.textMuted }}>
                          {t.qrOrderLabel(confirmedOrder.orderNumber || 100)} ·{' '}
                          {confirmedOrder.pickupSchedule || confirmedOrder.scheduledTime || computedScheduledLabel}
                        </div>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase"
                        style={{ backgroundColor: theme.primaryTint12, color: primaryColor }}
                      >
                        {isConfirmedManual ? 'VERIFY' : t.paidBadge}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {(confirmedOrder.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between gap-2">
                          <span className="font-semibold" style={{ color: theme.text }}>
                            {item.quantity}x {item.title}
                            {item.selectedSize ? ` (${item.selectedSize.name})` : ''}
                          </span>
                          <span className="font-bold tabular-nums shrink-0" style={{ color: theme.text }}>
                            {formatMoney(item.price * item.quantity, currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-2 space-y-1 text-[11px]" style={{ borderColor: theme.primaryBorder, color: theme.textMuted }}>
                      <div className="flex justify-between">
                        <span>{t.subtotal}</span>
                        <span className="tabular-nums">{formatMoney(confirmedOrder.subtotal ?? subtotal, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.salesTax}</span>
                        <span className="tabular-nums">{formatMoney(confirmedOrder.taxAmount ?? taxAmount, currency)}</span>
                      </div>
                      {(confirmedOrder.tipAmount ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span>{t.tip}</span>
                          <span className="tabular-nums">{formatMoney(confirmedOrder.tipAmount, currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs font-black pt-1" style={{ color: theme.text }}>
                        <span>{t.total}</span>
                        <span className="tabular-nums">{formatMoney(confirmedOrder.total, currency)}</span>
                      </div>
                    </div>

                    {printResult && (
                      <button
                        type="button"
                        onClick={() => triggerBrowserIframePrint([printResult.customerHtml])}
                        className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                        style={{ backgroundColor: primaryColor, color: primaryContrast }}
                      >
                        <Printer size={14} />
                        <span>{t.previewPrintReceipts}</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowReceiptPreview((prev) => !prev)}
                    className="w-full py-3.5 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    style={{
                      backgroundColor: theme.cardBgSolid,
                      borderColor: theme.primaryBorder,
                      color: theme.text,
                    }}
                  >
                    <Receipt size={15} style={{ color: primaryColor }} />
                    <span>{showReceiptPreview ? t.mobileHideReceiptBtn : t.mobileSaveReceiptTrackBtn}</span>
                  </button>

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

          {/* Sticky Footer Action Buttons (Steps 1-3 only; Step 4 has direct deep-link buttons inside body) */}
          {step !== 'success' && step !== 'payment' && (
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
                  disabled={isCreatingOrder}
                  onClick={startMobilePaymentStep}
                  className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all disabled:opacity-60"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  {isCreatingOrder ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{t.qrCreatingOrder}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {t.proceedToPayment} · {formatMoney(grandTotal, currency)}
                      </span>
                      <ChevronRight size={18} />
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
