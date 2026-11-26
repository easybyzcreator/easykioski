import { Order, Settings } from '../types';
import { getCleanWhatsAppPhone, getCurrencySymbol } from './countryUtils';

/**
 * Formats a monetary number into a Brazilian-style currency string (e.g. 15.5 -> "15,50")
 */
export const formatCurrencyValue = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '0,00';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Calculates high contrast text color (black or white) for a given hex background
 */
export const getContrastText = (hexColor?: string): string => {
  if (!hexColor) return '#ffffff';
  let hex = hexColor.trim();
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
};

/**
 * Currency input mask handler that takes raw user input string (digits or commas)
 * and returns the formatted display string ("15,00") and the parsed numeric float (15).
 */
export const handleCurrencyInputMask = (input: string): { display: string; value: number } => {
  const digits = (input || '').replace(/\D/g, '');
  if (!digits) {
    return { display: '', value: 0 };
  }
  const numericValue = parseInt(digits, 10) / 100;
  const display = numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return { display, value: numericValue };
};

/**
 * Formats full WhatsApp message text for an order
 */
export const formatOrderWhatsAppMessage = (order: Order, settings: Settings): string => {
  const brand = settings.brandName || 'Nossa Confeitaria';
  const currency = getCurrencySymbol(settings.currency || 'BRL');
  const shortId = order.id ? order.id.slice(-6).toUpperCase() : '';
  
  let msg = `✨ *RESUMO DO PEDIDO - ${brand.toUpperCase()}* ✨\n`;
  msg += `────────────────────────────\n`;
  if (shortId) {
    msg += `📋 *Pedido:* #${shortId}\n`;
  }
  msg += `👤 *Cliente:* ${order.customerName || 'Cliente'}\n`;
  if (order.phone) {
    msg += `📱 *WhatsApp:* ${order.phone}\n`;
  }

  // Entrega ou Retirada
  const isPickup = order.deliveryType === 'pickup';
  msg += `🚚 *Modalidade:* ${isPickup ? '🏪 Retirada no Local' : '🛵 Entrega (Delivery)'}\n`;
  
  if (order.pickupDate) {
    msg += `📅 *Data de ${isPickup ? 'Retirada' : 'Entrega'}:* ${order.pickupDate}\n`;
  }
  if (order.pickupTime) {
    msg += `⏰ *Horário Agendado:* ${order.pickupTime}\n`;
  }

  if (!isPickup) {
    const fullAddr = order.address || `${order.street || ''}, ${order.number || 'S/N'}${order.neighborhood ? ` - ${order.neighborhood}` : ''}`;
    if (fullAddr.trim()) {
      msg += `📍 *Endereço:* ${fullAddr}\n`;
    }
  }

  msg += `\n🛒 *ITENS DO PEDIDO:*\n`;
  if (order.items && order.items.length > 0) {
    order.items.forEach((item, idx) => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      msg += `• *${item.quantity}x ${item.title}* — ${currency} ${formatCurrencyValue(itemTotal)}\n`;
      if (item.selectedSize) {
        msg += `   └ Tamanho/Opção: ${item.selectedSize.name}\n`;
      }
      if (item.cakeOptions) {
        const parts = [];
        if (item.cakeOptions.size) parts.push(`Tam: ${item.cakeOptions.size}`);
        if (item.cakeOptions.dough) parts.push(`Massa: ${item.cakeOptions.dough}`);
        if (item.cakeOptions.fillings?.length) parts.push(`Recheios: ${item.cakeOptions.fillings.join(', ')}`);
        if (item.cakeOptions.topping) parts.push(`Cob: ${item.cakeOptions.topping}`);
        if (item.cakeOptions.topper) parts.push(`Topper: ${item.cakeOptions.topper}`);
        if (parts.length > 0) msg += `   └ Bolo: ${parts.join(' | ')}\n`;
      }
      if (item.mealOptions?.sides?.length) {
        msg += `   └ Extras: ${item.mealOptions.sides.map(s => s.name).join(', ')}\n`;
      }
      if (item.mealOptions?.removals?.length) {
        msg += `   └ Sem: ${item.mealOptions.removals.join(', ')}\n`;
      }
      if (item.sandwichOptions?.fillings?.length) {
        msg += `   └ Recheios: ${item.sandwichOptions.fillings.join(', ')}\n`;
      }
      if (item.observation) {
        msg += `   └ Obs: ${item.observation}\n`;
      }
    });
  } else {
    msg += `• Nenhum item registrado.\n`;
  }

  msg += `────────────────────────────\n`;
  if (order.subtotal !== undefined && order.subtotal > 0 && Math.abs(order.subtotal - order.total) > 0.01) {
    msg += `💵 *Subtotal dos Itens:* ${currency} ${formatCurrencyValue(order.subtotal)}\n`;
  }
  if (order.deliveryFee !== undefined && order.deliveryFee > 0) {
    msg += `🛵 *Taxa de Frete:* ${currency} ${formatCurrencyValue(order.deliveryFee)}\n`;
  } else if (isPickup) {
    msg += `🏪 *Taxa de Retirada:* Grátis\n`;
  }
  if (order.taxAmount !== undefined && order.taxAmount > 0) {
    msg += `📊 *Taxas/Impostos:* ${currency} ${formatCurrencyValue(order.taxAmount)}\n`;
  }

  msg += `💰 *VALOR TOTAL: ${currency} ${formatCurrencyValue(order.total)}*\n`;

  const paymentText = order.paymentStatus === 'full' || order.paymentStatus === 'paid'
    ? '✅ Pago Integralmente'
    : order.paymentStatus === 'half'
    ? '⏳ Sinal de 50% Pago (Restante no ato da entrega)'
    : '⏳ Pagamento Pendente';
  msg += `💳 *Status do Pagamento:* ${paymentText}\n`;

  if (order.observation) {
    msg += `\n📝 *Observações:* ${order.observation}\n`;
  }

  msg += `\nMuito obrigado pelo seu pedido! Se desejar alterar qualquer detalhe ou tiver dúvidas, é só responder aqui. 🎂❤️`;
  return msg;
};

/**
 * Triggers WhatsApp redirect to send the order to customer
 */
export const sendOrderToWhatsApp = (order: Order, settings: Settings) => {
  const msg = formatOrderWhatsAppMessage(order, settings);
  const cleanPhone = getCleanWhatsAppPhone(order.phone, settings?.whatsappCountryCode || '+55');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

export interface OrderPaymentDisplayInfo {
  statusKey: 'paid' | 'half' | 'manual_verification' | 'awaiting_payment' | 'pending';
  tone: 'emerald' | 'amber' | 'sky' | 'rose';
  providerLabel: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  isPaid: boolean;
  isAutoConfirmed: boolean;
  confirmedTimeStr: string;
}

export const formatPaymentProviderLabel = (provider?: string): string => {
  if (!provider) return '';
  const key = String(provider).toLowerCase().trim();
  if (key === 'venmo') return 'Venmo';
  if (key === 'paypal') return 'PayPal';
  if (key === 'cashapp') return 'Cash App';
  if (key === 'zelle') return 'Zelle';
  if (key === 'cash') return 'Dinheiro';
  if (key === 'card') return 'Cartão';
  if (key === 'counter') return 'Balcão';
  if (key === 'square' || key === 'square_web') return 'Square';
  if (key === 'zettle') return 'Zettle';
  if (key === 'demo' || key === 'simulation') return 'Teste / Demo';
  return provider.toUpperCase();
};

export const formatOrderTimestampShort = (ts: any): string => {
  if (!ts) return '';
  let d: Date | null = null;
  if (ts?.toDate) {
    d = ts.toDate();
  } else if (ts?.seconds) {
    d = new Date(ts.seconds * 1000);
  } else if (ts instanceof Date) {
    d = ts;
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    const parsed = new Date(ts);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Returns unified, clear Portuguese payment status display info for Admin list & Calendar modal.
 */
export const getOrderPaymentDisplay = (order: Order): OrderPaymentDisplayInfo => {
  const providerRaw = order.paymentProvider || order.onlinePaymentProvider;
  const providerLabel = formatPaymentProviderLabel(providerRaw);
  const isAutoConfirmed = Boolean(order.webhookSecretVerified);
  const confirmedTimeStr = formatOrderTimestampShort(order.paymentConfirmedAt);

  if (order.paymentStatus === 'paid' || order.paymentStatus === 'full') {
    const badgeLabel = providerLabel
      ? `PAGO VIA ${providerLabel.toUpperCase()}`
      : 'PAGO / RECEBIDO';
    const title = providerLabel
      ? `Pago via ${providerLabel}`
      : 'Pagamento Recebido';
    const parts: string[] = [];
    if (isAutoConfirmed) {
      parts.push('Confirmado automaticamente via e-mail');
    } else if (order.paymentStatus === 'paid') {
      parts.push('Pagamento confirmado');
    } else {
      parts.push('Confirmado integralmente no painel');
    }
    if (confirmedTimeStr) {
      parts.push(`às ${confirmedTimeStr}`);
    }
    return {
      statusKey: 'paid',
      tone: 'emerald',
      providerLabel,
      badgeLabel,
      title,
      subtitle: parts.join(' '),
      isPaid: true,
      isAutoConfirmed,
      confirmedTimeStr,
    };
  }

  if (order.paymentStatus === 'half') {
    return {
      statusKey: 'half',
      tone: 'amber',
      providerLabel,
      badgeLabel: '50% RECEBIDO',
      title: 'Sinal de 50% Recebido',
      subtitle: 'Restante pendente na entrega ou retirada',
      isPaid: false,
      isAutoConfirmed: false,
      confirmedTimeStr,
    };
  }

  if (order.paymentStatus === 'manual_verification') {
    const badgeLabel = providerLabel
      ? `CONFERIR PAGAMENTO (${providerLabel.toUpperCase()})`
      : 'CONFERIR PAGAMENTO';
    const title =
      providerRaw === 'counter'
        ? 'Pagamento no Balcão'
        : providerLabel
          ? `Conferir recebimento (${providerLabel})`
          : 'Conferir Pagamento Manualmente';
    const subtitle =
      providerRaw === 'counter'
        ? 'Cliente escolheu pagar no balcão — confirme após receber'
        : 'Cliente informou que pagou — aguardando e-mail automático ou confirmação manual';
    return {
      statusKey: 'manual_verification',
      tone: 'amber',
      providerLabel,
      badgeLabel,
      title,
      subtitle,
      isPaid: false,
      isAutoConfirmed: false,
      confirmedTimeStr: '',
    };
  }

  if (order.paymentStatus === 'awaiting_payment') {
    return {
      statusKey: 'awaiting_payment',
      tone: 'sky',
      providerLabel,
      badgeLabel: 'AGUARDANDO PAGAMENTO (QR)',
      title: 'Aguardando Pagamento via QR Code',
      subtitle: 'Assim que o e-mail de confirmação chegar no Gmail, o status mudará para Pago automaticamente',
      isPaid: false,
      isAutoConfirmed: false,
      confirmedTimeStr: '',
    };
  }

  return {
    statusKey: 'pending',
    tone: 'rose',
    providerLabel,
    badgeLabel: 'NÃO RECEBIDO',
    title: 'Pagamento Não Recebido',
    subtitle: 'Nenhuma confirmação de recebimento registrada ainda',
    isPaid: false,
    isAutoConfirmed: false,
    confirmedTimeStr: '',
  };
};

