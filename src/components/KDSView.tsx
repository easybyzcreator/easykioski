import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Order, Settings } from '../types';
import { extractItemModifications, printKitchenTicketOnly } from '../services/printService';
import {
  CheckCircle2,
  ChefHat,
  Clock,
  Printer,
  RotateCcw,
  Volume2,
  VolumeX,
  ArrowLeft,
  UtensilsCrossed,
  ShoppingBag,
  Smartphone,
  Phone,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney } from '../utils/kioskI18n';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface KDSViewProps {
  settings: Settings;
  onExitToKiosk: () => void;
  onOpenAdmin: () => void;
}

const getOrderTimestampMs = (createdAt: any): number => {
  if (!createdAt) return Date.now();
  if (typeof createdAt.toDate === 'function') return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === 'number') return createdAt.seconds * 1000;
  if (createdAt instanceof Date) return createdAt.getTime();
  const parsed = Date.parse(String(createdAt));
  return isNaN(parsed) ? Date.now() : parsed;
};

const formatElapsed = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Plays a gentle, pleasant dual-tone acoustic kitchen chime via Web Audio API.
 */
function playSoftOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + startOffset + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    playTone(587.33, 0, 0.35); // D5
    playTone(880.0, 0.16, 0.55); // A5
  } catch {
    // Audio playback blocked before user gesture
  }
}

export const KDSView: React.FC<KDSViewProps> = ({ settings, onExitToKiosk, onOpenAdmin }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'preparing' | 'ready'>('preparing');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const knownPreparingIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  // Live 1-second timer tick
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Real-time Firestore listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'pedidos'),
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));

        const requirePaidMobile = settings.mobilePickupRequirePaidForKds !== false;

        // Exclude orders still awaiting payment; enforce paid/manual_verification for Mobile Pickup when enabled
        const paidOrders = fetched.filter((o) => {
          if (o.paymentStatus === 'awaiting_payment') return false;
          const isMobile =
            o.orderSource === 'mobile_pickup' ||
            (o.source === 'online' && o.deliveryType === 'pickup');
          if (isMobile) {
            if (requirePaidMobile) {
              return (
                o.paymentStatus === 'paid' ||
                o.paymentStatus === 'full' ||
                o.paymentStatus === 'manual_verification'
              );
            }
            return true;
          }
          return (
            o.paymentStatus === 'paid' ||
            o.paymentStatus === 'full' ||
            o.paymentStatus === 'manual_verification' ||
            o.source === 'kiosk'
          );
        });

        const preparingNow = paidOrders.filter(
          (o) => o.kitchenStatus !== 'ready' && o.kitchenStatus !== 'completed'
        );

        if (initialLoadDoneRef.current) {
          let hasNewOrder = false;
          for (const ord of preparingNow) {
            if (!knownPreparingIdsRef.current.has(ord.id)) {
              hasNewOrder = true;
              break;
            }
          }
          if (hasNewOrder && soundEnabled) {
            playSoftOrderChime();
            toast.info('New order received in Kitchen!');
          }
        } else {
          initialLoadDoneRef.current = true;
        }

        knownPreparingIdsRef.current = new Set(preparingNow.map((o) => o.id));
        setOrders(paidOrders);
      },
      (err) => {
        console.error('[KDS] Firestore listener error:', err);
      }
    );

    return () => unsub();
  }, [soundEnabled, settings.mobilePickupRequirePaidForKds]);

  const preparingOrders = useMemo(() => {
    return orders
      .filter((o) => o.kitchenStatus !== 'ready' && o.kitchenStatus !== 'completed')
      .sort((a, b) => getOrderTimestampMs(a.createdAt) - getOrderTimestampMs(b.createdAt)); // FIFO
  }, [orders]);

  const readyOrders = useMemo(() => {
    return orders
      .filter((o) => o.kitchenStatus === 'ready' || o.kitchenStatus === 'completed')
      .sort((a, b) => getOrderTimestampMs(b.readyAt || b.createdAt) - getOrderTimestampMs(a.readyAt || a.createdAt));
  }, [orders]);

  const markAsReady = async (order: Order) => {
    setUpdatingId(order.id);
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        kitchenStatus: 'ready',
        readyAt: serverTimestamp(),
      });
      toast.success(`Order #${order.orderNumber || order.id.slice(-4).toUpperCase()} marked as READY`);
    } catch (err) {
      console.error('[KDS] Error updating status:', err);
      toast.error('Could not update order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const reopenToPreparing = async (order: Order) => {
    setUpdatingId(order.id);
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        kitchenStatus: 'preparing',
      });
      toast.info(`Order #${order.orderNumber || order.id.slice(-4).toUpperCase()} moved back to Preparing`);
    } catch (err) {
      console.error('[KDS] Error reopening order:', err);
      toast.error('Could not reopen order.');
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmPaymentManually = async (order: Order) => {
    setUpdatingId(order.id);
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        paymentStatus: 'paid',
        paymentConfirmedAt: serverTimestamp(),
      });
      toast.success(`Payment verified for Order #${order.orderNumber || order.id.slice(-4).toUpperCase()}!`);
    } catch (err) {
      console.error('[KDS] Error verifying payment:', err);
      toast.error('Could not confirm payment.');
    } finally {
      setUpdatingId(null);
    }
  };

  const primaryColor = settings.primaryColor || '#865d39';

  return (
    <div
      className="min-h-screen w-full bg-[#141312] text-[#F5F2ED] flex flex-col"
      style={{ '--text-color': '#FFFFFF' } as React.CSSProperties}
    >
      {/* KDS Top Bar */}
      <header className="sticky top-0 z-30 bg-[#1B1917]/95 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            <ChefHat size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif font-extrabold text-xl sm:text-2xl tracking-tight text-white! truncate">
              {settings.brandName || 'Easy Kioski'} · Kitchen Display
            </h1>
            <div className="text-xs text-stone-400 flex items-center gap-2">
              <span>Live Queue</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{preparingOrders.length} active</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{readyOrders.length} ready</span>
            </div>
          </div>
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-white/8 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('preparing')}
            className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'preparing'
                ? 'bg-[#FAF7F2] text-stone-950 shadow-sm'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            Preparing ({preparingOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ready')}
            className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ready'
                ? 'bg-[#FAF7F2] text-stone-950 shadow-sm'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            Completed ({readyOrders.length})
          </button>
        </div>

        {/* Utility Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playSoftOrderChime();
            }}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs font-bold text-stone-200 flex items-center gap-2 transition-all cursor-pointer"
            title={soundEnabled ? 'Mute new order alerts' : 'Enable new order alerts'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-stone-400" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs font-bold text-stone-200 transition-all cursor-pointer whitespace-nowrap"
          >
            Admin
          </button>

          <button
            type="button"
            onClick={onExitToKiosk}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs font-bold text-stone-200 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft size={15} />
            <span>Kiosk</span>
          </button>
        </div>
      </header>

      {/* Main Orders Grid */}
      <main className="flex-grow p-4 sm:p-8 max-w-[1600px] w-full mx-auto">
        {activeTab === 'preparing' ? (
          preparingOrders.length === 0 ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-white/6 border border-white/10 flex items-center justify-center text-stone-400">
                <CheckCircle2 size={36} />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-bold text-white!">All caught up</h2>
                <p className="text-sm text-stone-400 max-w-sm">
                  Paid kiosk orders will appear here automatically in real time.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 items-start">
              <AnimatePresence>
                {preparingOrders.map((order) => {
                  const elapsedMs = Math.max(0, nowMs - getOrderTimestampMs(order.createdAt));
                  const elapsedMinutes = elapsedMs / 60000;
                  const isLate = elapsedMinutes >= 15;
                  const isWarning = elapsedMinutes >= 10 && elapsedMinutes < 15;

                  const timerBg = isLate
                    ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                    : isWarning
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';

                  const cardBorder = isLate
                    ? 'border-rose-500/60'
                    : isWarning
                    ? 'border-amber-500/50'
                    : 'border-white/12';

                  const orderDisplayNum = order.orderNumber
                    ? `#${order.orderNumber}`
                    : `#${order.id.slice(-4).toUpperCase()}`;

                  const isMobilePickup =
                    order.orderSource === 'mobile_pickup' ||
                    (order.source === 'online' && order.deliveryType === 'pickup');
                  const pickupTimeDisplay =
                    order.pickupSchedule ||
                    order.scheduledTime ||
                    (order.pickupTime
                      ? order.pickupDate
                        ? `${order.pickupDate} ${order.pickupTime}`
                        : order.pickupTime
                      : order.pickupType === 'asap'
                        ? `ASAP (~${settings.defaultPrepMinutes || 25} MIN)`
                        : '');

                  const isManualVerification = order.paymentStatus === 'manual_verification';
                  const currency = settings.currency || 'USD';
                  const providerBadge =
                    order.paymentProvider === 'venmo'
                      ? 'VENMO'
                      : order.paymentProvider === 'paypal'
                        ? 'PAYPAL'
                        : order.paymentProvider === 'cashapp'
                          ? 'CASH APP'
                          : order.paymentProvider === 'zelle'
                            ? 'ZELLE'
                            : order.paymentProvider === 'counter'
                              ? 'COUNTER'
                              : '';

                  return (
                    <motion.article
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      className={`bg-[#201E1C] rounded-3xl border ${
                        isManualVerification
                          ? 'border-amber-400/90 ring-2 ring-amber-400/30'
                          : isMobilePickup
                            ? 'border-sky-400/50'
                            : cardBorder
                      } shadow-2xl overflow-hidden flex flex-col`}
                    >
                      {/* Channel Badge Strip */}
                      <div
                        className={`px-5 py-2 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-widest border-b ${
                          isMobilePickup
                            ? 'bg-sky-500/20 text-sky-200 border-sky-400/30'
                            : 'bg-white/[0.04] text-stone-300 border-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {isMobilePickup ? (
                            <>
                              <Smartphone size={13} className="text-sky-300" />
                              MOBILE PICKUP
                            </>
                          ) : order.orderType === 'takeout' ? (
                            <>
                              <ShoppingBag size={13} />
                              TOTEM · TAKEOUT
                            </>
                          ) : (
                            <>
                              <UtensilsCrossed size={13} />
                              TOTEM · DINE-IN
                            </>
                          )}
                        </span>
                        {isMobilePickup && pickupTimeDisplay ? (
                          <span className="px-2 py-0.5 rounded-md bg-sky-400/25 text-white font-black tracking-wide">
                            PICKUP: {pickupTimeDisplay.toUpperCase()}
                          </span>
                        ) : providerBadge ? (
                          <span className="px-2 py-0.5 rounded-md bg-white/10 text-stone-200 font-black tracking-wide">
                            {providerBadge}
                          </span>
                        ) : null}
                      </div>

                      {/* Manual Payment Verification Yellow Alert Bar */}
                      {isManualVerification && (
                        <div className="px-4 py-3 bg-amber-400 text-stone-950 flex items-center justify-between gap-3 border-b border-amber-500">
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle size={18} className="shrink-0" />
                            <div className="leading-tight min-w-0">
                              <div className="text-xs font-black uppercase tracking-wider truncate">
                                VERIFY PAYMENT ({formatMoney(order.total, currency)})
                              </div>
                              <div className="text-[10px] font-bold opacity-85 truncate">
                                {providerBadge ? `Via ${providerBadge} · Tap to confirm` : 'Tap once confirmed'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => confirmPaymentManually(order)}
                            className="px-3 py-1.5 rounded-xl bg-stone-950 hover:bg-stone-800 text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                          >
                            <ShieldCheck size={14} />
                            <span>Confirm</span>
                          </button>
                        </div>
                      )}

                      {/* Ticket Top Header */}
                      <div className="p-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3 bg-white/[0.02]">
                        <div>
                          <div className="flex items-baseline gap-2.5">
                            <span className="text-4xl font-serif font-black tracking-tight tabular-nums text-white">
                              {orderDisplayNum}
                            </span>
                            {!isMobilePickup && (
                              <span className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1">
                                {order.orderType === 'takeout' ? (
                                  <>
                                    <ShoppingBag size={13} /> TAKEOUT
                                  </>
                                ) : (
                                  <>
                                    <UtensilsCrossed size={13} /> DINE-IN
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-base font-bold text-[#FAF7F2] mt-1">
                            {order.customerName || 'Guest'}
                            {order.tableOrPager ? ` · ${order.tableOrPager}` : ''}
                          </div>
                          {isMobilePickup && order.phone && (
                            <div className="text-xs font-bold text-sky-300 mt-1 flex items-center gap-1.5">
                              <Phone size={12} />
                              <span>{order.phone}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div
                            className={`px-3 py-1.5 rounded-xl border text-sm font-mono font-black tabular-nums flex items-center gap-1.5 ${timerBg}`}
                          >
                            <Clock size={14} />
                            <span>{formatElapsed(elapsedMs)}</span>
                          </div>
                          {(isLate || isWarning) && (
                            <span className="text-[11px] font-bold text-amber-300">
                              {isLate ? 'Priority · 15+ min' : 'Attention · 10+ min'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Order Items & Highlighted Modifications */}
                      <div className="p-5 space-y-3.5 flex-grow">
                        {(order.items || []).map((item, idx) => {
                          const mods = extractItemModifications(item);
                          return (
                            <div
                              key={idx}
                              className="pb-3 border-b border-white/8 last:border-b-0 last:pb-0 space-y-1.5"
                            >
                              <div className="flex items-start gap-2.5 text-lg font-bold leading-snug text-white">
                                <span
                                  className="px-2 py-0.5 rounded-lg text-sm font-black tabular-nums shrink-0 mt-0.5"
                                  style={{ backgroundColor: primaryColor, color: '#ffffff' }}
                                >
                                  {item.quantity}x
                                </span>
                                <span>{item.title}</span>
                              </div>

                              {mods.length > 0 && (
                                <div className="pl-9 space-y-1">
                                  {mods.map((mod, mIdx) => (
                                    <div
                                      key={mIdx}
                                      className={`text-xs font-extrabold uppercase tracking-wide ${
                                        mod.startsWith('NO ')
                                          ? 'text-rose-300'
                                          : 'text-amber-300'
                                      }`}
                                    >
                                      » {mod}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {order.observation && order.observation.trim() && (
                          <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-400/35 text-amber-200 text-xs font-bold uppercase tracking-wide">
                            NOTE: {order.observation.trim()}
                          </div>
                        )}
                      </div>

                      {/* Action Footer */}
                      <div className="p-4 pt-0 flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => printKitchenTicketOnly(order, settings)}
                          className="min-h-[54px] w-14 rounded-2xl bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center text-stone-200 transition-all cursor-pointer shrink-0"
                          title="Reprint Kitchen Ticket (80mm)"
                        >
                          <Printer size={20} />
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          onClick={() => markAsReady(order)}
                          className="flex-1 min-h-[54px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-extrabold text-sm tracking-wider uppercase shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={20} />
                          <span>MARK AS READY</span>
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        ) : (
          /* COMPLETED / READY TAB */
          readyOrders.length === 0 ? (
            <div className="min-h-[55vh] flex flex-col items-center justify-center text-center text-stone-400 space-y-2">
              <p className="text-lg font-serif font-bold text-stone-200">No completed orders yet</p>
              <p className="text-sm">Orders marked as ready will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {readyOrders.slice(0, 30).map((order) => {
                const orderDisplayNum = order.orderNumber
                  ? `#${order.orderNumber}`
                  : `#${order.id.slice(-4).toUpperCase()}`;
                const isMobilePickup =
                  order.orderSource === 'mobile_pickup' ||
                  (order.source === 'online' && order.deliveryType === 'pickup');
                return (
                  <div
                    key={order.id}
                    className="bg-[#1D1B1A] rounded-3xl border border-white/10 p-5 flex flex-col justify-between gap-4 opacity-90"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-2xl font-serif font-black tabular-nums text-emerald-400">
                            {orderDisplayNum} · READY
                          </div>
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              isMobilePickup
                                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                                : 'bg-white/10 text-stone-300'
                            }`}
                          >
                            {isMobilePickup ? 'MOBILE PICKUP' : order.orderType === 'takeout' ? 'TOTEM · TAKEOUT' : 'TOTEM · DINE-IN'}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-stone-200 mt-1">
                          {order.customerName || 'Guest'}
                          {isMobilePickup && order.scheduledTime ? ` · ${order.scheduledTime}` : ''}
                        </div>
                        {isMobilePickup && order.phone && (
                          <div className="text-xs text-sky-300 font-semibold mt-0.5">{order.phone}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => printKitchenTicketOnly(order, settings)}
                        className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center text-stone-300 cursor-pointer"
                        title="Reprint Ticket"
                      >
                        <Printer size={16} />
                      </button>
                    </div>

                    <div className="space-y-1 text-sm text-stone-300">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx}>
                          <span className="font-bold text-white">{item.quantity}x</span> {item.title}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={updatingId === order.id}
                      onClick={() => reopenToPreparing(order)}
                      className="min-h-[44px] w-full rounded-xl bg-white/8 hover:bg-white/15 text-stone-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>Return to Preparing</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
};
