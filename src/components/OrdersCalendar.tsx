import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Cake, 
  Printer, 
  Search, 
  X, 
  ExternalLink,
  Store,
  Truck,
  CheckCircle2,
  AlertCircle,
  Edit2,
  MessageCircle,
  Save,
  Calendar
} from 'lucide-react';
import { Order, Product, Settings } from '../types';
import { getCleanWhatsAppPhone, getCurrencySymbol } from '../utils/countryUtils';
import { sendOrderToWhatsApp, getContrastText } from '../utils/orderUtils';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';

interface OrdersCalendarProps {
  orders: Order[];
  settings: Settings;
  products?: Product[];
  onSelectOrderInList?: (orderId: string) => void;
  onPrintOrder?: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
}

type CalendarViewMode = 'today' | 'grid' | 'agenda' | 'month';

type ModalityKind = 'pickup' | 'takeout' | 'dine_in';

// Solid monochrome icon: Retirada no balcão (Image 2 — paper bag + hand picking up from top)
const CounterPickupIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Hand gripping top of bag */}
    <path d="M12.2 4.3c.7-.5 1.7-.8 2.7-.8H22v3.2h-2.5c-.7.9-1.6 1.6-2.8 2-.9.3-1.6.9-2.4 1.8-.5.5-1 .7-1.4.4-.5-.3-.6-1.1-.1-1.9l2.6-2.9c.2-.2.1-.5-.2-.5h-4.1c.3-.5.7-.9 1.1-1.3z" />
    {/* Folded bag top flap */}
    <path d="M5.6 6.4h8.2l-1.9 2.1H5.3V7c0-.3.1-.6.3-.6z" />
    {/* Bag main front body */}
    <path d="M5.1 9.5h6.7c-.2.9.1 1.9.9 2.4.8.5 1.8.3 2.5-.4l.3-.3L14.3 14v7.5H3.8V14l1.3-4.5z" />
    {/* Bag right side gusset */}
    <path d="M16.3 10.6l1.7 3.7v6.6l-1.4-1.4v-4.7a.5.5 0 0 0-1 0v4.7l-1.3 1.3v-6.5l1.3-3.7h.7zm-.2 9.7l1.3 1.2h-2.6l1.3-1.2z" />
  </svg>
);

// Solid monochrome icon: To-Go / Entrega (Image 3 — square frame with thick diagonal exit arrow top-right)
const ToGoIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Open square container */}
    <path d="M4.5 3.5h5.2l2.6 2.6H6.1v11.8h11.8v-5.7l2.6 2.6v4.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V5.3a1.8 1.8 0 0 1 1-1.8z" />
    {/* Thick diagonal arrow pointing out top-right */}
    <path d="M13.5 3h7.2c.7 0 1.3.6 1.3 1.3v7.2c0 .9-1.1 1.4-1.8.8l-2.3-2.3-5.6 5.6a1.7 1.7 0 0 1-2.4-2.4l5.6-5.6-2.3-2.3c-.6-.7-.1-1.8.8-1.8z" />
  </svg>
);

// Solid monochrome icon: Dine-In (Image 4 — circular plate with fork & spoon cutout inside)
const DineInIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.6 3 8.6 7.2 9.9v-7.5c-1.1-.4-1.8-1.4-1.8-2.7V7.4c0-.4.3-.7.7-.7s.7.3.7.7v3h.6v-3c0-.4.3-.7.7-.7s.7.3.7.7v3h.6v-3c0-.4.3-.7.7-.7s.7.3.7.7v4.3c0 1.3-.7 2.3-1.8 2.7v7.8c.5.1 1 .2 1.5.2.9 0 1.8-.1 2.6-.4v-7.4c-1.3-.5-2.2-1.9-2.2-3.7 0-2.3 1.2-4.1 2.7-4.1s2.7 1.8 2.7 4.1c0 1.8-.9 3.2-2.2 3.7v7c3.9-1.5 6.7-5.3 6.7-9.8 0-5.8-4.7-10.5-10.5-10.5zm0 2.7a7.8 7.8 0 0 0-7.8 7.8c0 2.9 1.6 5.4 3.9 6.8v-1.2A6.8 6.8 0 0 1 5.2 12a6.8 6.8 0 1 1 13.6 0c0 2.5-1.3 4.6-3.3 5.8v1.1a7.8 7.8 0 0 0 4.3-6.9A7.8 7.8 0 0 0 12 4.2z"
    />
  </svg>
);

export function getOrderModality(order: Order, isPickupFallback: boolean): {
  kind: ModalityKind;
  shortLabel: string;
  fullLabel: string;
} {
  if (order.orderType === 'dine_in') {
    return {
      kind: 'dine_in',
      shortLabel: 'Dine-In',
      fullLabel: 'Comer no Local (Dine-In)',
    };
  }
  if (order.orderSource === 'mobile_pickup' || order.deliveryType === 'pickup') {
    return {
      kind: 'pickup',
      shortLabel: 'Retirada',
      fullLabel: 'Retirada no Balcão',
    };
  }
  if (order.orderType === 'takeout' || order.deliveryType === 'delivery' || !isPickupFallback) {
    return {
      kind: 'takeout',
      shortLabel: 'To-Go',
      fullLabel: 'To-Go / Entrega',
    };
  }
  return {
    kind: 'pickup',
    shortLabel: 'Retirada',
    fullLabel: 'Retirada no Balcão',
  };
}

const ModalityIcon: React.FC<{ kind: ModalityKind; size?: number; className?: string }> = ({
  kind,
  size = 14,
  className = 'text-stone-800 shrink-0',
}) => {
  if (kind === 'dine_in') return <DineInIcon size={size} className={className} />;
  if (kind === 'takeout') return <ToGoIcon size={size} className={className} />;
  return <CounterPickupIcon size={size} className={className} />;
};

// Helper to parse dates from various formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Timestamp)
export function parseOrderDateTime(order: Order): { date: Date | null; timeStr: string; isPickup: boolean } {
  let targetDate: Date | null = null;
  let timeStr = '12:00 PM';
  const isPickup = !order.address || order.address.toLowerCase().includes('retirada') || order.address.toLowerCase().includes('pickup');

  // Try pickupDate first
  if (order.pickupDate && typeof order.pickupDate === 'string' && order.pickupDate.trim()) {
    const raw = order.pickupDate.trim();
    
    // Check if time is in pickupDate
    const timeMatch = raw.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
    if (timeMatch) {
      timeStr = timeMatch[1].toUpperCase();
    }

    // Date extraction
    const dateMatchSlash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const dateMatchDash = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);

    if (dateMatchSlash) {
      const part1 = parseInt(dateMatchSlash[1], 10);
      const part2 = parseInt(dateMatchSlash[2], 10);
      const year = parseInt(dateMatchSlash[3], 10);

      // Padrão EUA: MM/DD/YYYY por padrão (somente trata como DD/MM/YYYY se o primeiro número > 12)
      if (part1 > 12) {
        // DD/MM/YYYY
        targetDate = new Date(year, part2 - 1, part1);
      } else {
        // MM/DD/YYYY
        targetDate = new Date(year, part1 - 1, part2);
      }
    } else if (dateMatchDash) {
      const year = parseInt(dateMatchDash[1], 10);
      const month = parseInt(dateMatchDash[2], 10);
      const day = parseInt(dateMatchDash[3], 10);
      targetDate = new Date(year, month - 1, day);
    }
  }

  // Fallback to createdAt
  if (!targetDate) {
    if (order.createdAt?.toDate) {
      targetDate = order.createdAt.toDate();
    } else if (order.createdAt?.seconds) {
      targetDate = new Date(order.createdAt.seconds * 1000);
    } else if (order.createdAt instanceof Date) {
      targetDate = order.createdAt;
    } else if (typeof order.createdAt === 'string') {
      const parsed = new Date(order.createdAt);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }
  }

  // If timeStr is still default and targetDate has time
  if (targetDate && timeStr === '12:00 PM') {
    const d = order.createdAt?.toDate 
      ? order.createdAt.toDate() 
      : (order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000) : targetDate);
    if (d && typeof d.getHours === 'function') {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
  }

  return { date: targetDate, timeStr, isPickup };
}

// Convert time string "12:00 PM" into hour number (0 to 23)
function getHourFromTimeString(timeStr: string): number {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 12;
  let hour = parseInt(match[1], 10);
  const ampm = match[3] ? match[3].toUpperCase() : '';
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour;
}

export const OrdersCalendar: React.FC<OrdersCalendarProps> = ({
  orders,
  settings,
  products,
  onSelectOrderInList,
  onPrintOrder,
  onEditOrder
}) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('today');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Direct date editing state
  const [isEditingPickupDate, setIsEditingPickupDate] = useState(false);
  const [editingPickupDateValue, setEditingPickupDateValue] = useState('');
  const [isSavingPickupDate, setIsSavingPickupDate] = useState(false);

  // Helper format currency
  const currencySymbol = getCurrencySymbol(settings?.currency);
  const formatCurrency = (val: number) => {
    if (settings?.currency === 'USD') {
      return `${currencySymbol} ${Number(val || 0).toFixed(2)}`;
    }
    return `${currencySymbol} ${Number(val || 0).toFixed(2).replace('.', ',')}`;
  };

  // Dar baixa / reabrir pedido para a cozinha diretamente da tela
  const handleToggleKitchenDone = async (order: Order, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!order?.id) return;
    const isCompleted = order.kitchenStatus === 'completed';
    const nextStatus = isCompleted ? 'preparing' : 'completed';
    setUpdatingOrderId(order.id);
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        kitchenStatus: nextStatus,
        ...(nextStatus === 'completed' ? { readyAt: new Date().toISOString() } : {}),
      });
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...selectedOrder, kitchenStatus: nextStatus });
      }
      toast.success(
        nextStatus === 'completed'
          ? `Baixa registrada no pedido${order.orderNumber ? ` #${order.orderNumber}` : ''}!`
          : `Pedido${order.orderNumber ? ` #${order.orderNumber}` : ''} reaberto para produção.`
      );
    } catch (err) {
      console.error('Erro ao atualizar status de produção:', err);
      toast.error('Erro ao dar baixa no pedido. Verifique sua conexão.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Week range calculations (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay(); // 0 is Sunday
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Month range calculations
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = firstDayOfMonth.getDay();
    const days: (Date | null)[] = [];

    // Preceding empty/previous month days
    for (let i = 0; i < startDayOfWeek; i++) {
      const prevDate = new Date(year, month, 1 - (startDayOfWeek - i));
      days.push(prevDate);
    }

    // Days in current month
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    // Trailing days to fill 7-col grid (up to 35 or 42)
    while (days.length % 7 !== 0) {
      const nextDay = new Date(year, month + 1, days.length - (startDayOfWeek + lastDayOfMonth.getDate()) + 1);
      days.push(nextDay);
    }

    return days;
  }, [currentDate]);

  // Navigate functions
  const handlePrev = () => {
    const newD = new Date(currentDate);
    if (viewMode === 'month') {
      newD.setMonth(newD.getMonth() - 1);
    } else if (viewMode === 'today') {
      newD.setDate(newD.getDate() - 1);
    } else {
      newD.setDate(newD.getDate() - 7);
    }
    setCurrentDate(newD);
  };

  const handleNext = () => {
    const newD = new Date(currentDate);
    if (viewMode === 'month') {
      newD.setMonth(newD.getMonth() + 1);
    } else if (viewMode === 'today') {
      newD.setDate(newD.getDate() + 1);
    } else {
      newD.setDate(newD.getDate() + 7);
    }
    setCurrentDate(newD);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Map orders with parsed dates
  const parsedOrders = useMemo(() => {
    return orders.map(order => {
      const parsed = parseOrderDateTime(order);
      return {
        order,
        ...parsed
      };
    });
  }, [orders]);

  // Orders filtered by the current period
  const periodOrders = useMemo(() => {
    if (viewMode === 'today') {
      const todayRef = new Date();
      return parsedOrders
        .filter(p => {
          if (!p.date) return false;
          return (
            p.date.getFullYear() === todayRef.getFullYear() &&
            p.date.getMonth() === todayRef.getMonth() &&
            p.date.getDate() === todayRef.getDate()
          );
        })
        .sort((a, b) => {
          const aDone = a.order.kitchenStatus === 'completed' ? 1 : 0;
          const bDone = b.order.kitchenStatus === 'completed' ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          return getHourFromTimeString(a.timeStr) - getHourFromTimeString(b.timeStr);
        });
    }
    if (viewMode === 'month') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      return parsedOrders.filter(p => {
        if (!p.date) return false;
        return p.date.getFullYear() === year && p.date.getMonth() === month;
      });
    } else {
      const start = new Date(weekDays[0]);
      start.setHours(0, 0, 0, 0);
      const end = new Date(weekDays[6]);
      end.setHours(23, 59, 59, 999);

      return parsedOrders.filter(p => {
        if (!p.date) return false;
        return p.date >= start && p.date <= end;
      });
    }
  }, [parsedOrders, viewMode, weekDays, currentDate]);

  // Format header period text (Portuguese labels + USA MM/DD/YYYY dates)
  const periodTitle = useMemo(() => {
    const monthNamesPt = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const fmtUS = (d: Date) =>
      `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;

    if (viewMode === 'today') {
      return `Produção de Hoje — ${fmtUS(new Date())}`;
    }
    if (viewMode === 'month') {
      return `${monthNamesPt[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    }
    const start = weekDays[0];
    const end = weekDays[6];
    return `Semana de ${fmtUS(start)} a ${fmtUS(end)}`;
  }, [viewMode, weekDays, currentDate]);

  // Hours for the grid (07:00 AM to 09:00 PM)
  const hoursList = useMemo(() => {
    const hours = [];
    for (let h = 7; h <= 21; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      hours.push({
        hour24: h,
        label: `${displayH.toString().padStart(2, '0')}:00 ${ampm}`
      });
    }
    return hours;
  }, []);

  // Today check helper
  const isToday = (d: Date | null) => {
    if (!d) return false;
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  return (
    <div className="w-full space-y-6">
      {/* Calendar Card Container */}
      <div className="w-full bg-white border border-gray-200 rounded-3xl shadow-xl p-4 sm:p-7 space-y-6">
        
        {/* Top Header Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100/70 text-amber-900 shadow-sm border border-amber-200/50">
                <CalendarIcon size={22} className="text-[#865d39]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-gray-900">
                Cronograma de Entregas & Retiradas
              </h2>
            </div>
            <p className="text-[11px] font-extrabold tracking-[0.2em] text-gray-500 uppercase ml-1">
              VISUALIZAÇÃO DINÂMICA DOS PEDIDOS AGENDADOS
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* View Mode Switcher */}
            <div className="flex flex-wrap items-center p-1 bg-gray-100/80 rounded-2xl border border-gray-200/80 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setViewMode('today');
                  setCurrentDate(new Date());
                }}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  viewMode === 'today'
                    ? 'text-white shadow-md font-extrabold'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
                style={
                  viewMode === 'today'
                    ? {
                        backgroundColor: settings?.primaryColor || '#865d39',
                        color: getContrastText(settings?.primaryColor || '#865d39'),
                      }
                    : {}
                }
              >
                Pedidos Hoje
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-md font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Grade Semanal
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  viewMode === 'agenda'
                    ? 'bg-white text-gray-900 shadow-md font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Agenda Semanal
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  viewMode === 'month'
                    ? 'bg-white text-gray-900 shadow-md font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mensal
              </button>
            </div>

            {/* Navigation Buttons */}
            {viewMode !== 'today' && (
              <div className="flex items-center gap-1 bg-white border border-gray-200/80 rounded-2xl p-1 shadow-sm">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1.5 rounded-xl hover:bg-gray-100 active:scale-95 transition-all text-gray-700 cursor-pointer"
                  aria-label="Anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-3 py-1 rounded-xl text-xs font-black text-gray-800 hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1.5 rounded-xl hover:bg-gray-100 active:scale-95 transition-all text-gray-700 cursor-pointer"
                  aria-label="Próximo"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sub-header: Period Title, Modality Legend & Order Counter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-gray-200/50">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 font-sans">
              {periodTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-stone-600">
              <span className="inline-flex items-center gap-1.5" title="Retirada no Balcão">
                <CounterPickupIcon size={13} className="text-stone-800" />
                <span>Retirada</span>
              </span>
              <span className="inline-flex items-center gap-1.5" title="To-Go / Entrega">
                <ToGoIcon size={13} className="text-stone-800" />
                <span>To-Go / Entrega</span>
              </span>
              <span className="inline-flex items-center gap-1.5" title="Comer no Local (Dine-In)">
                <DineInIcon size={13} className="text-stone-800" />
                <span>Dine-In</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'today' && (
              <>
                <span className="px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-amber-100 text-amber-900 border border-amber-200">
                  {periodOrders.filter(p => p.order.kitchenStatus !== 'completed').length} EM PRODUÇÃO
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {periodOrders.filter(p => p.order.kitchenStatus === 'completed').length} CONCLUÍDOS
                </span>
              </>
            )}
            <span className="self-start sm:self-auto px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-gray-200/70 text-gray-700 border border-gray-300/60 shadow-sm">
              {periodOrders.length} {periodOrders.length === 1 ? 'PEDIDO NO PERÍODO' : 'PEDIDOS NO PERÍODO'}
            </span>
          </div>
        </div>

        {/* --- VIEW 0: PEDIDOS HOJE (COZINHA / PRODUÇÃO DO DIA COM BAIXA DIRETA) --- */}
        {viewMode === 'today' && (
          <div className="space-y-4">
            {periodOrders.length === 0 ? (
              <div className="py-12 px-6 text-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-600/70" />
                <p className="text-base font-bold text-gray-800">Nenhum pedido agendado ou recebido para hoje.</p>
                <p className="text-xs text-gray-500">
                  Novos pedidos feitos no totem ou agendados para hoje aparecerão automaticamente aqui em tempo real para a cozinha.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {periodOrders.map(({ order, timeStr, isPickup }) => {
                  const isDone = order.kitchenStatus === 'completed';
                  const isUpdating = updatingOrderId === order.id;
                  const orderTag = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;

                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-all cursor-pointer shadow-sm hover:shadow-md ${
                        isDone
                          ? 'bg-emerald-50/50 border-emerald-200 opacity-75'
                          : 'bg-white border-amber-200/90 ring-1 ring-amber-100'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Card Top */}
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide text-white"
                                style={{
                                  backgroundColor: isDone ? '#059669' : (settings?.primaryColor || '#865d39'),
                                }}
                              >
                                {orderTag}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600">
                                <Clock size={13} /> {timeStr}
                              </span>
                            </div>
                            <h4 className={`font-serif font-black text-base mt-1.5 truncate ${isDone ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                              {order.isB2B || order.isPJ ? (order.b2bCompanyName || order.customerName) : order.customerName}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-stone-600 mt-1">
                              {(() => {
                                const modality = getOrderModality(order, isPickup);
                                return (
                                  <span className="inline-flex items-center gap-1.5">
                                    <ModalityIcon kind={modality.kind} size={13} className="text-stone-800 shrink-0" />
                                    <span>{modality.fullLabel}</span>
                                  </span>
                                );
                              })()}
                              {order.tableOrPager && (
                                <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-800 font-black">
                                  Mesa/Pager: {order.tableOrPager}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-black text-sm text-gray-900 shrink-0 tabular-nums">
                            {formatCurrency(order.total)}
                          </span>
                        </div>

                        {/* Production Items List */}
                        <div className="space-y-2">
                          {(order.items || []).map((item, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-0.5">
                              <p className="text-xs font-extrabold text-gray-900">
                                <span className="text-amber-900 mr-1">{item.quantity}x</span>
                                {item.title}
                              </p>
                              {item.selectedSize && (
                                <p className="text-[11px] font-semibold text-gray-600">
                                  Tamanho: {item.selectedSize.name}
                                </p>
                              )}
                              {item.mealOptions?.sides && item.mealOptions.sides.length > 0 && (
                                <p className="text-[11px] font-semibold text-gray-600">
                                  Acompanhamentos: {item.mealOptions.sides.map(s => s.name).join(', ')}
                                </p>
                              )}
                              {item.mealOptions?.removals && item.mealOptions.removals.length > 0 && (
                                <p className="text-[11px] font-bold text-rose-700">
                                  Sem: {item.mealOptions.removals.join(', ')}
                                </p>
                              )}
                              {item.cakeOptions && (
                                <p className="text-[11px] font-semibold text-gray-600">
                                  Bolo: {[item.cakeOptions.size, item.cakeOptions.dough, ...(item.cakeOptions.fillings || [])].filter(Boolean).join(' • ')}
                                </p>
                              )}
                              {item.observation && (
                                <p className="text-[11px] font-bold text-amber-800 italic">
                                  Obs: {item.observation}
                                </p>
                              )}
                            </div>
                          ))}
                          {order.observation && (
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                              Observação Geral: {order.observation}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Kitchen Actions: Dar Baixa + Imprimir */}
                      <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={(e) => handleToggleKitchenDone(order, e)}
                          className={`flex-grow py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 ${
                            isDone
                              ? 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <CheckCircle2 size={15} />
                          {isUpdating
                            ? 'Salvando...'
                            : isDone
                            ? 'Concluído (Reabrir)'
                            : 'Dar Baixa (Concluir)'}
                        </button>
                        {onPrintOrder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPrintOrder(order);
                            }}
                            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors cursor-pointer"
                            title="Imprimir Comanda"
                          >
                            <Printer size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- VIEW 1: GRADE SEMANAL (ALIGNED SINGLE-TABLE LAYOUT) --- */}
        {viewMode === 'grid' && (
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="max-h-[580px] overflow-auto">
              <table className="w-full min-w-[880px] table-fixed border-collapse">
                <colgroup>
                  <col className="w-[88px]" />
                  {weekDays.map((_, i) => (
                    <col key={i} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-50 text-center font-bold text-xs text-gray-700">
                    <th className="p-3 border-b border-r border-gray-200 bg-gray-50 font-bold text-gray-400">
                      <div className="flex items-center justify-center">
                        <Clock size={15} />
                      </div>
                    </th>
                    {weekDays.map((d, i) => {
                      const todayActive = isToday(d);
                      const dayFormatted = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                      return (
                        <th
                          key={i}
                          className={`p-3 border-b border-r border-gray-200 last:border-r-0 align-middle ${
                            todayActive ? 'bg-amber-50 font-black' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className={`text-[11px] font-bold ${todayActive ? 'text-amber-900' : 'text-gray-500'}`}>
                              {dayNames[i]}
                            </span>
                            {todayActive ? (
                              <span
                                className="px-2.5 py-0.5 rounded-md text-white font-black text-xs shadow-sm"
                                style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                              >
                                {dayFormatted}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-gray-800">
                                {dayFormatted}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hoursList.map((hObj) => (
                    <tr key={hObj.hour24}>
                      {/* Hour Label */}
                      <td className="px-2 py-3 border-b border-r border-gray-200 bg-gray-50/80 text-[11px] font-bold text-gray-500 text-center align-middle select-none whitespace-nowrap">
                        {hObj.label}
                      </td>

                      {/* 7 Days Columns for this hour */}
                      {weekDays.map((d, dayIdx) => {
                        const cellOrders = periodOrders.filter((p) => {
                          if (!p.date) return false;
                          const matchesDay =
                            p.date.getDate() === d.getDate() &&
                            p.date.getMonth() === d.getMonth() &&
                            p.date.getFullYear() === d.getFullYear();
                          if (!matchesDay) return false;
                          const hour = getHourFromTimeString(p.timeStr);
                          return hour === hObj.hour24;
                        });

                        return (
                          <td
                            key={dayIdx}
                            className={`p-1.5 border-b border-r border-gray-200/80 last:border-r-0 align-top h-[62px] transition-colors ${
                              isToday(d) ? 'bg-amber-50/30' : 'hover:bg-gray-50/50'
                            }`}
                          >
                            <div className="space-y-1.5">
                              {cellOrders.map(({ order, timeStr, isPickup }) => {
                                const isValidated = order.paymentStatus === 'half' || order.paymentStatus === 'full' || order.paymentStatus === 'paid';
                                const modality = getOrderModality(order, isPickup);
                                return (
                                  <motion.button
                                    key={order.id}
                                    type="button"
                                    whileHover={{ scale: 1.015 }}
                                    whileTap={{ scale: 0.985 }}
                                    onClick={() => setSelectedOrder(order)}
                                    title={`${modality.fullLabel} • ${timeStr}`}
                                    className={`w-full text-left p-2 rounded-xl border shadow-xs transition-all cursor-pointer flex flex-col gap-1 ${
                                      isValidated
                                        ? 'bg-amber-50/90 border-amber-300/90 text-stone-900 hover:bg-amber-100/70'
                                        : 'bg-white border-gray-200 text-stone-900 hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-extrabold text-[11px] truncate uppercase text-stone-900">
                                        {order.isB2B || order.isPJ ? (order.b2bCompanyName || order.customerName) : order.customerName}
                                      </span>
                                      <span className="font-black text-[11px] text-stone-800 shrink-0 tabular-nums">
                                        {formatCurrency(order.total)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-600">
                                      <ModalityIcon kind={modality.kind} size={13} className="text-stone-900 shrink-0" />
                                      <span className="tabular-nums">{timeStr}</span>
                                      {isValidated && (
                                        <span
                                          className="ml-auto text-[9px] font-black px-1.5 py-0.5 text-white rounded"
                                          style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                                        >
                                          OK
                                        </span>
                                      )}
                                    </div>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- VIEW 2: AGENDA SEMANAL (DETAILED LIST PER DAY) --- */}
        {viewMode === 'agenda' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weekDays.map((d, i) => {
              const dayOrders = periodOrders.filter(p => {
                if (!p.date) return false;
                return (
                  p.date.getDate() === d.getDate() &&
                  p.date.getMonth() === d.getMonth() &&
                  p.date.getFullYear() === d.getFullYear()
                );
              });
              const todayActive = isToday(d);
              const dayFormatted = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;

              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-4 space-y-3 flex flex-col ${
                    todayActive
                      ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black ${todayActive ? 'text-amber-900' : 'text-gray-500'}`}>
                        {dayNames[i]}
                      </span>
                      <span 
                        className={`text-xs font-black ${todayActive ? 'px-2 py-0.5 text-white rounded-md' : 'text-gray-800'}`}
                        style={todayActive ? { backgroundColor: settings?.primaryColor || '#865d39' } : {}}
                      >
                        {dayFormatted}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-gray-400">
                      {dayOrders.length} {dayOrders.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </div>

                  <div className="space-y-2 flex-grow overflow-y-auto max-h-[300px]">
                    {dayOrders.length > 0 ? (
                      dayOrders.map(({ order, timeStr, isPickup }) => {
                        const isValidated = order.paymentStatus === 'half' || order.paymentStatus === 'full' || order.paymentStatus === 'paid';
                        const modality = getOrderModality(order, isPickup);
                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className="p-3 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-white hover:shadow-md transition-all cursor-pointer space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs text-gray-900">
                                {order.customerName}
                              </span>
                              <span className="font-black text-xs text-stone-900 tabular-nums">
                                {formatCurrency(order.total)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-stone-600 font-medium">
                              <span className="flex items-center gap-1.5">
                                <ModalityIcon kind={modality.kind} size={13} className="text-stone-800 shrink-0" />
                                {modality.shortLabel} • {timeStr}
                              </span>
                              {isValidated && (
                                <span
                                  className="text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                                  style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                                >
                                  Validado
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center py-6 text-xs text-gray-400 font-medium italic">
                        Nenhum pedido agendado
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* --- VIEW 3: MENSAL (MONTHLY GRID) --- */}
        {viewMode === 'month' && (
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200 text-center font-bold text-xs text-gray-600">
              {dayNames.map((n, idx) => (
                <div key={idx} className="p-3 border-r border-gray-200 last:border-r-0">
                  {n}
                </div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div className="grid grid-cols-7 auto-rows-fr divide-y divide-gray-100">
              {monthDays.map((d, i) => {
                if (!d) return <div key={i} className="min-h-[90px] bg-gray-50/50" />;
                const isCurrMonth = d.getMonth() === currentDate.getMonth();
                const todayActive = isToday(d);
                const dayOrders = periodOrders.filter(p => {
                  if (!p.date) return false;
                  return (
                    p.date.getDate() === d.getDate() &&
                    p.date.getMonth() === d.getMonth() &&
                    p.date.getFullYear() === d.getFullYear()
                  );
                });

                return (
                  <div
                    key={i}
                    className={`min-h-[100px] p-2 border-r border-gray-100 last:border-r-0 flex flex-col gap-1 transition-colors ${
                      !isCurrMonth
                        ? 'bg-gray-50/40 opacity-40'
                        : todayActive
                        ? 'bg-amber-50/40'
                        : 'hover:bg-gray-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          todayActive
                            ? 'w-6 h-6 rounded-full text-white flex items-center justify-center shadow-sm font-black'
                            : 'text-gray-700'
                        }`}
                        style={todayActive ? { backgroundColor: settings?.primaryColor || '#865d39' } : {}}
                      >
                        {d.getDate()}
                      </span>
                      {dayOrders.length > 0 && (
                        <span className="text-[10px] font-black text-amber-900">
                          {dayOrders.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 overflow-y-auto max-h-[80px]">
                      {dayOrders.map(({ order, timeStr, isPickup }) => {
                        const modality = getOrderModality(order, isPickup);
                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className="px-1.5 py-1 rounded bg-stone-50 border border-stone-200 text-stone-900 text-[10px] font-bold truncate cursor-pointer hover:bg-stone-100 transition-all flex items-center justify-between gap-1"
                          >
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <ModalityIcon kind={modality.kind} size={11} className="text-stone-800 shrink-0" />
                              <span className="truncate">{order.customerName}</span>
                            </span>
                            <span className="shrink-0 font-black tabular-nums">{timeStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* DETALHES DO AGENDAMENTO MODAL (IMAGE 2 STYLE) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedOrder && (() => {
          const { timeStr, isPickup } = parseOrderDateTime(selectedOrder);
          const cleanPhone = selectedOrder.phone ? getCleanWhatsAppPhone(selectedOrder.phone, settings?.whatsappCountryCode || '+55') : '';
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedOrder(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />

              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10 border border-gray-100"
              >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-gray-100 flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-extrabold tracking-[0.25em] text-gray-400 uppercase font-sans">
                      DETALHES DO AGENDAMENTO
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 mt-1">
                      {selectedOrder.isB2B || selectedOrder.isPJ
                        ? (selectedOrder.b2bCompanyName || selectedOrder.customerName)
                        : selectedOrder.customerName
                      }
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all cursor-pointer"
                  >
                    <X size={22} />
                  </button>
                </div>

                {/* Content Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                  
                  {/* Delivery Option & Scheduled Time Cards (Top 2 Pills) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Delivery / Pickup / Dine-In Card */}
                    {(() => {
                      const modality = getOrderModality(selectedOrder, isPickup);
                      return (
                        <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/70 space-y-1">
                          <span className="text-[10px] font-extrabold tracking-[0.2em] text-gray-400 uppercase">
                            MODALIDADE DO PEDIDO
                          </span>
                          <div className="flex items-center gap-2 text-lg sm:text-xl font-bold text-gray-900">
                            <ModalityIcon kind={modality.kind} size={20} className="text-stone-900 shrink-0" />
                            <span>{modality.fullLabel}</span>
                          </div>
                          {selectedOrder.address && (
                            <p className="text-xs text-gray-600 font-medium pt-1">
                              {selectedOrder.address}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Scheduled Time Card */}
                    <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/70 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold tracking-[0.2em] text-gray-400 uppercase">
                          HORÁRIO AGENDADO
                        </span>
                        {!isEditingPickupDate && (
                          <button
                            type="button"
                            onClick={() => {
                              // Converter MM/DD/YYYY (ou DD/MM/YYYY legado) para YYYY-MM-DD para o datepicker nativo
                              const parsedDate = parseOrderDateTime(selectedOrder).date;
                              if (parsedDate) {
                                const y = parsedDate.getFullYear();
                                const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                const d = String(parsedDate.getDate()).padStart(2, '0');
                                setEditingPickupDateValue(`${y}-${m}-${d}`);
                              } else {
                                setEditingPickupDateValue('');
                              }
                              setIsEditingPickupDate(true);
                            }}
                            className="text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                            style={{ color: settings?.primaryColor || '#865d39' }}
                          >
                            <Calendar size={13} /> Alterar Data
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-lg sm:text-xl font-bold text-gray-900">
                        <Clock size={20} className="text-gray-600" />
                        <span>{timeStr}</span>
                      </div>
                      {selectedOrder.pickupDate && !isEditingPickupDate && (() => {
                        const d = parseOrderDateTime(selectedOrder).date;
                        const dateFormatted = d 
                          ? `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`
                          : selectedOrder.pickupDate;
                        return (
                          <p className="text-xs text-gray-600 font-medium pt-1">
                            Data: <strong className="text-gray-900 font-bold">{dateFormatted}</strong>
                          </p>
                        );
                      })()}
                      {isEditingPickupDate && (
                        <div className="pt-2 mt-1 border-t border-gray-200/80 space-y-2.5">
                          <label className="text-[10px] font-bold text-gray-700 uppercase block">
                            📅 Escolha a nova data (MM/DD/AAAA):
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="date"
                              autoFocus
                              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-300 bg-white text-gray-900 shadow-sm outline-none cursor-pointer hover:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                              style={{ colorScheme: 'light' }}
                              value={editingPickupDateValue}
                              onChange={e => setEditingPickupDateValue(e.target.value)}
                              onClick={e => {
                                try {
                                  (e.target as any).showPicker?.();
                                } catch (_) {}
                              }}
                            />
                            <button
                              type="button"
                              disabled={isSavingPickupDate || !editingPickupDateValue}
                              onClick={async () => {
                                if (!selectedOrder?.id) return;
                                setIsSavingPickupDate(true);
                                try {
                                  // Converte YYYY-MM-DD para MM/DD/YYYY (padrão EUA)
                                  let formatted = editingPickupDateValue;
                                  if (editingPickupDateValue.includes('-')) {
                                    const [y, m, d] = editingPickupDateValue.split('-');
                                    formatted = `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
                                  }
                                  if (db) {
                                    await updateDoc(doc(db, 'pedidos', selectedOrder.id), {
                                      pickupDate: formatted
                                    });
                                  }
                                  setSelectedOrder({ ...selectedOrder, pickupDate: formatted });
                                  toast.success(`Data alterada para ${formatted}!`);
                                  setIsEditingPickupDate(false);
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Erro ao atualizar data.');
                                } finally {
                                  setIsSavingPickupDate(false);
                                }
                              }}
                              className="px-4 py-2 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                              style={{ 
                                backgroundColor: settings?.primaryColor || '#865d39',
                                color: getContrastText(settings?.primaryColor || '#865d39')
                              }}
                            >
                              {isSavingPickupDate ? 'Salvando...' : 'Salvar Data'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingPickupDate(false)}
                              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                          {/* Botões de Atalho Rápido */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[10px] font-bold text-gray-400 mr-1">Atalhos:</span>
                            {[
                              { label: 'Hoje', days: 0 },
                              { label: 'Amanhã', days: 1 },
                              { label: '+2 Dias', days: 2 },
                              { label: '+7 Dias', days: 7 }
                            ].map(quick => {
                              const targetDate = new Date();
                              targetDate.setDate(targetDate.getDate() + quick.days);
                              const y = targetDate.getFullYear();
                              const m = String(targetDate.getMonth() + 1).padStart(2, '0');
                              const d = String(targetDate.getDate()).padStart(2, '0');
                              const iso = `${y}-${m}-${d}`;
                              return (
                                <button
                                  key={quick.label}
                                  type="button"
                                  onClick={() => setEditingPickupDateValue(iso)}
                                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer transition-colors"
                                >
                                  {quick.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact & Customer Info Section */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-extrabold tracking-[0.25em] text-gray-900 uppercase font-sans">
                      CONTATO E CADASTRO
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 font-medium block">Telefone:</span>
                        {selectedOrder.phone ? (
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-900 hover:text-amber-950 hover:underline font-bold flex items-center gap-1.5 mt-0.5"
                          >
                            <Phone size={14} />
                            {selectedOrder.phone}
                          </a>
                        ) : (
                          <span className="text-gray-400 font-medium">Não informado</span>
                        )}
                      </div>

                      <div>
                        <span className="text-xs text-gray-500 font-medium block">Aniversário:</span>
                        <span className="font-bold text-gray-800 mt-0.5 block">
                          {selectedOrder.birthday || 'Não informado'}
                        </span>
                      </div>

                      {selectedOrder.email && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-gray-500 font-medium block">E-mail:</span>
                          <span className="font-medium text-gray-800 mt-0.5 block">
                            {selectedOrder.email}
                          </span>
                        </div>
                      )}

                      {selectedOrder.observation && (
                        <div className="sm:col-span-2 p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl">
                          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Observações do Cliente:</span>
                          <p className="text-xs text-amber-900 font-medium mt-1">
                            {selectedOrder.observation}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Items Section */}
                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <span className="text-[11px] font-extrabold tracking-[0.25em] text-gray-900 uppercase font-sans">
                      ITENS DO PEDIDO
                    </span>
                    <div className="divide-y divide-gray-100 space-y-2">
                      {selectedOrder.items?.map((item, idx) => (
                        <div key={idx} className="pt-2 first:pt-0 flex items-start justify-between gap-3 text-sm">
                          <div className="space-y-0.5">
                            <p className="font-bold text-gray-900">
                              {item.quantity}x {item.title} {item.price ? `- ${formatCurrency(item.price)} (cada)` : ''}
                            </p>
                            {item.selectedSize && (
                              <p className="text-xs text-gray-500">Tamanho: {item.selectedSize.name}</p>
                            )}
                            {item.mealOptions?.sides && item.mealOptions.sides.length > 0 && (
                              <p className="text-xs text-gray-500">
                                Acompanhamentos: {item.mealOptions.sides.map(s => s.name).join(', ')}
                              </p>
                            )}
                            {item.cakeOptions && (
                              <p className="text-xs text-gray-500">
                                Bolo: {item.cakeOptions.size || ''} {item.cakeOptions.dough ? `• Massa: ${item.cakeOptions.dough}` : ''}
                              </p>
                            )}
                          </div>
                          <span className="font-bold text-gray-900 shrink-0">
                            {formatCurrency((item.price || 0) * (item.quantity || 1))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="space-y-1.5 border-t border-gray-200 pt-4">
                    {selectedOrder.subtotal !== undefined && selectedOrder.subtotal > 0 && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Subtotal:</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.subtotal)}</span>
                      </div>
                    )}
                    {selectedOrder.taxAmount !== undefined && selectedOrder.taxAmount > 0 && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Impostos ({selectedOrder.taxRate || 8.25}%):</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg sm:text-xl font-extrabold text-gray-900 pt-2 border-t border-gray-100">
                      <span>Total Geral:</span>
                      <span className="text-gray-900">{formatCurrency(selectedOrder.total)}</span>
                    </div>
                  </div>

                </div>

                {/* Footer Buttons */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Dar Baixa na Produção */}
                    <button
                      type="button"
                      disabled={updatingOrderId === selectedOrder.id}
                      onClick={(e) => handleToggleKitchenDone(selectedOrder, e)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50 ${
                        selectedOrder.kitchenStatus === 'completed'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      <CheckCircle2 size={16} />
                      {selectedOrder.kitchenStatus === 'completed' ? 'Concluído (Reabrir)' : 'Dar Baixa'}
                    </button>

                    {/* Reenviar pelo WhatsApp com cor da marca */}
                    <button
                      type="button"
                      onClick={() => sendOrderToWhatsApp(selectedOrder, settings)}
                      className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                      style={{ 
                        backgroundColor: settings?.primaryColor || '#424733',
                        color: getContrastText(settings?.primaryColor || '#424733')
                      }}
                      title="Reenviar resumo completo do pedido pelo WhatsApp"
                    >
                      <MessageCircle size={16} /> Reenviar no Whats
                    </button>

                    {/* Editar Pedido */}
                    <button
                      type="button"
                      onClick={() => {
                        const ord = selectedOrder;
                        setSelectedOrder(null);
                        if (onEditOrder) {
                          onEditOrder(ord);
                        } else if (onSelectOrderInList) {
                          onSelectOrderInList(ord.id);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                      title="Editar itens, valores e informações do pedido"
                    >
                      <Edit2 size={16} /> Editar Pedido
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedOrder.id;
                        setSelectedOrder(null);
                        if (onSelectOrderInList) {
                          onSelectOrderInList(id);
                        }
                      }}
                      className="px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Search size={15} /> Ver na Lista
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onPrintOrder) {
                          onPrintOrder(selectedOrder);
                        } else {
                          window.print();
                        }
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Printer size={15} /> Imprimir Comanda
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedOrder(null)}
                      className="px-3.5 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs sm:text-sm transition-all cursor-pointer active:scale-95"
                    >
                      Fechar
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
