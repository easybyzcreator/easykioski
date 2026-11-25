import { Order, OrderItem, Settings } from '../types';
import { formatMoney } from '../utils/kioskI18n';

declare global {
  interface Window {
    qz?: {
      websocket: {
        isActive: () => boolean;
        connect: () => Promise<void>;
      };
      configs: {
        create: (printer: string, options?: Record<string, any>) => any;
      };
      printers: {
        find: (query?: string) => Promise<string | string[]>;
      };
      print: (config: any, data: any[]) => Promise<void>;
    };
  }
}

export interface DualPrintResult {
  mode: 'qz-tray' | 'browser-fallback';
  customerPrinted: boolean;
  kitchenPrinted: boolean;
  customerHtml: string;
  kitchenHtml: string;
  error?: string;
}

const ESC = '\x1B';
const GS = '\x1D';
const INIT = `${ESC}@`;
const ALIGN_CENTER = `${ESC}a\x01`;
const ALIGN_LEFT = `${ESC}a\x00`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const SIZE_NORMAL = `${GS}!\x00`;
const SIZE_DOUBLE = `${GS}!\x11`;
const SIZE_GIANT = `${GS}!\x22`;
const CUT_PAPER = `\n\n\n${GS}V\x41\x03`;

const escapeHtml = (str: string): string =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatOrderTime = (createdAt: any): string => {
  try {
    let date: Date;
    if (createdAt?.toDate) {
      date = createdAt.toDate();
    } else if (createdAt?.seconds) {
      date = new Date(createdAt.seconds * 1000);
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else {
      date = new Date();
    }
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date().toLocaleString('en-US');
  }
};

export const extractItemModifications = (item: OrderItem): string[] => {
  const mods: string[] = [];

  if (item.selectedSize?.name) {
    mods.push(`SIZE: ${item.selectedSize.name}`);
  }

  if (item.mealOptions?.removals && item.mealOptions.removals.length > 0) {
    item.mealOptions.removals.forEach((rem) => {
      mods.push(`NO ${rem}`);
    });
  }

  if (item.mealOptions?.sides && item.mealOptions.sides.length > 0) {
    const sidesGrouped = item.mealOptions.sides.reduce((acc: Record<string, { qty: number; type?: string }>, s) => {
      const key = s.name;
      if (!acc[key]) acc[key] = { qty: 0, type: s.type };
      acc[key].qty += 1;
      return acc;
    }, {});

    Object.entries(sidesGrouped).forEach(([name, info]) => {
      const prefix = info.type === 'swap' ? 'SWAP' : 'ADD';
      mods.push(`${prefix}: ${info.qty > 1 ? `${info.qty}x ` : ''}${name}`);
    });
  }

  if (item.cakeOptions) {
    if (item.cakeOptions.size) mods.push(`SIZE: ${item.cakeOptions.size}`);
    if (item.cakeOptions.dough) mods.push(`DOUGH: ${item.cakeOptions.dough}`);
    if (item.cakeOptions.fillings?.length) mods.push(`FILLINGS: ${item.cakeOptions.fillings.join(' + ')}`);
    if (item.cakeOptions.topping) mods.push(`TOPPING: ${item.cakeOptions.topping}`);
    if (item.cakeOptions.topper) mods.push(`TOPPER: ${item.cakeOptions.topper}`);
    if (item.cakeOptions.styleNumber) mods.push(`STYLE PHOTO #${item.cakeOptions.styleNumber}`);
  }

  if (item.sandwichOptions?.fillings && item.sandwichOptions.fillings.length > 0) {
    mods.push(`OPTION: ${item.sandwichOptions.fillings.join(' + ')}`);
  }

  if (item.observation && item.observation.trim()) {
    mods.push(`NOTE: ${item.observation.trim()}`);
  }

  return mods;
};

/**
 * Generates Via 1 (Customer Receipt 80mm) ESC/POS commands for QZ Tray
 */
export function buildCustomerEscPos(order: Order, settings: Settings): string[] {
  const brand = (settings.brandName || 'EASY KIOSKI').toUpperCase();
  const currency = settings.currency || 'USD';
  const orderNum = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;
  const isMobilePickup = order.orderSource === 'mobile_pickup' || (order.source === 'online' && order.deliveryType === 'pickup');
  const modality = isMobilePickup
    ? 'MOBILE PICKUP'
    : order.orderType === 'takeout'
      ? 'TAKEOUT / TO-GO'
      : 'DINE-IN';
  const timestamp = formatOrderTime(order.createdAt);
  const divider = '------------------------------------------------\n';

  const lines: string[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    `${brand}\n`,
    BOLD_OFF,
    `${timestamp}\n`,
    divider,
    SIZE_DOUBLE,
    BOLD_ON,
    `ORDER ${orderNum}\n`,
    SIZE_NORMAL,
    `${modality}\n`,
    BOLD_OFF,
  ];

  if (isMobilePickup && (order.scheduledTime || order.pickupTime)) {
    lines.push(BOLD_ON, `PICKUP: ${(order.scheduledTime || order.pickupTime || '').toUpperCase()}\n`, BOLD_OFF);
  }
  if (order.customerName) {
    lines.push(`GUEST: ${order.customerName.toUpperCase()}\n`);
  }
  if (isMobilePickup && order.phone) {
    lines.push(`PHONE: ${order.phone}\n`);
  }
  if (order.tableOrPager) {
    lines.push(`TABLE / PAGER: ${order.tableOrPager.toUpperCase()}\n`);
  }

  lines.push(divider, ALIGN_LEFT);

  (order.items || []).forEach((item) => {
    const lineTotal = formatMoney((item.price || 0) * (item.quantity || 1), currency);
    lines.push(`${BOLD_ON}${item.quantity}x ${item.title}${BOLD_OFF}   ${lineTotal}\n`);
    const mods = extractItemModifications(item);
    mods.forEach((m) => {
      lines.push(`   - ${m}\n`);
    });
  });

  lines.push(divider);
  const subtotal = order.subtotal ?? order.total;
  lines.push(`Subtotal: ${formatMoney(subtotal, currency)}\n`);
  if (order.taxAmount !== undefined && order.taxAmount > 0) {
    lines.push(`Sales Tax (${order.taxRate ?? settings.salesTaxRate ?? 0}%): ${formatMoney(order.taxAmount, currency)}\n`);
  }
  if (order.tipAmount !== undefined && order.tipAmount > 0) {
    lines.push(`Tip: ${formatMoney(order.tipAmount, currency)}\n`);
  }
  const statusLine =
    order.paymentStatus === 'manual_verification'
      ? `\n*** VERIFY PAYMENT (${formatMoney(order.total, currency)}) ***\n`
      : `\n*** STATUS: PAID ***\n`;
  lines.push(
    divider,
    BOLD_ON,
    SIZE_DOUBLE,
    `TOTAL: ${formatMoney(order.total, currency)}\n`,
    SIZE_NORMAL,
    ALIGN_CENTER,
    statusLine,
    BOLD_OFF,
    `Thank you for your order!\n`,
    CUT_PAPER
  );

  return lines;
}

/**
 * Generates Via 2 (Kitchen / Counter Ticket 80mm) ESC/POS commands for QZ Tray
 * Highlights ORDER # in giant font and ALL modifications in BOLD UPPERCASE
 */
export function buildKitchenEscPos(order: Order): string[] {
  const orderNum = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;
  const isMobilePickup = order.orderSource === 'mobile_pickup' || (order.source === 'online' && order.deliveryType === 'pickup');
  const modality = isMobilePickup
    ? '*** MOBILE PICKUP ***'
    : order.orderType === 'takeout'
      ? '*** TAKEOUT / TO-GO ***'
      : '*** DINE-IN ***';
  const timestamp = formatOrderTime(order.createdAt);
  const divider = '================================================\n';

  const lines: string[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    `KITCHEN / COUNTER TICKET\n`,
    divider,
    SIZE_GIANT,
    `ORDER ${orderNum}\n`,
    SIZE_NORMAL,
    `\n`,
    SIZE_DOUBLE,
    `${modality}\n`,
    SIZE_NORMAL,
    ...(isMobilePickup && (order.scheduledTime || order.pickupTime)
      ? [`PICKUP AT: ${(order.scheduledTime || order.pickupTime || '').toUpperCase()}\n`]
      : []),
    `GUEST: ${(order.customerName || 'WALK-IN').toUpperCase()}\n`,
    ...(isMobilePickup && order.phone ? [`PHONE: ${order.phone}\n`] : []),
  ];

  if (order.tableOrPager) {
    lines.push(`TABLE/PAGER: ${order.tableOrPager.toUpperCase()}\n`);
  }

  lines.push(BOLD_OFF, `${timestamp}\n`, divider, ALIGN_LEFT);

  (order.items || []).forEach((item) => {
    lines.push(SIZE_DOUBLE, BOLD_ON, `${item.quantity}x ${item.title.toUpperCase()}\n`, SIZE_NORMAL, BOLD_OFF);
    const mods = extractItemModifications(item);
    mods.forEach((m) => {
      lines.push(BOLD_ON, `  >> ${m.toUpperCase()}\n`, BOLD_OFF);
    });
    lines.push('------------------------------------------------\n');
  });

  if (order.observation && order.observation.trim()) {
    lines.push(
      BOLD_ON,
      SIZE_DOUBLE,
      `ORDER NOTE:\n`,
      SIZE_NORMAL,
      `${order.observation.trim().toUpperCase()}\n`,
      BOLD_OFF,
      divider
    );
  }

  lines.push(CUT_PAPER);
  return lines;
}

/**
 * Generates clean 80mm thermal HTML for Via 1 (Customer Receipt)
 */
export function buildCustomerReceiptHtml(order: Order, settings: Settings): string {
  const brand = escapeHtml(settings.brandName || 'Easy Kioski');
  const currency = settings.currency || 'USD';
  const orderNum = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;
  const isMobilePickup = order.orderSource === 'mobile_pickup' || (order.source === 'online' && order.deliveryType === 'pickup');
  const modality = isMobilePickup
    ? 'MOBILE PICKUP'
    : order.orderType === 'takeout'
      ? 'TAKEOUT / TO-GO'
      : 'DINE-IN';
  const timestamp = escapeHtml(formatOrderTime(order.createdAt));
  const subtotal = order.subtotal ?? order.total;

  const itemsHtml = (order.items || [])
    .map((item) => {
      const mods = extractItemModifications(item);
      const lineTotal = formatMoney((item.price || 0) * (item.quantity || 1), currency);
      return `
        <div class="item-row">
          <div class="item-main">
            <span><strong>${item.quantity}x</strong> ${escapeHtml(item.title)}</span>
            <span class="mono">${lineTotal}</span>
          </div>
          ${mods.map((m) => `<div class="item-mod">· ${escapeHtml(m)}</div>`).join('')}
        </div>
      `;
    })
    .join('');

  return `
    <div class="ticket-80mm">
      <div class="center">
        <div class="brand">${brand}</div>
        <div class="meta">${timestamp}</div>
        <div class="divider"></div>
        <div class="label">CUSTOMER RECEIPT</div>
        <div class="order-num">ORDER ${escapeHtml(orderNum)}</div>
        <div class="modality">${modality}</div>
        ${isMobilePickup && (order.scheduledTime || order.pickupTime) ? `<div class="guest">Pickup: <strong>${escapeHtml(order.scheduledTime || order.pickupTime || '')}</strong></div>` : ''}
        ${order.customerName ? `<div class="guest">Guest: <strong>${escapeHtml(order.customerName)}</strong></div>` : ''}
        ${isMobilePickup && order.phone ? `<div class="guest">Phone: <strong>${escapeHtml(order.phone)}</strong></div>` : ''}
        ${order.tableOrPager ? `<div class="guest">Table / Pager: <strong>${escapeHtml(order.tableOrPager)}</strong></div>` : ''}
      </div>
      <div class="divider"></div>
      <div class="items">${itemsHtml}</div>
      <div class="divider"></div>
      <div class="totals">
        <div class="tot-line"><span>Subtotal</span><span class="mono">${formatMoney(subtotal, currency)}</span></div>
        ${
          order.taxAmount && order.taxAmount > 0
            ? `<div class="tot-line"><span>Sales Tax (${order.taxRate ?? settings.salesTaxRate ?? 0}%)</span><span class="mono">${formatMoney(order.taxAmount, currency)}</span></div>`
            : ''
        }
        ${
          order.tipAmount && order.tipAmount > 0
            ? `<div class="tot-line"><span>Tip${order.tipPercent ? ` (${order.tipPercent}%)` : ''}</span><span class="mono">${formatMoney(order.tipAmount, currency)}</span></div>`
            : ''
        }
        <div class="tot-line grand"><span>TOTAL PAID</span><span class="mono">${formatMoney(order.total, currency)}</span></div>
      </div>
      <div class="paid-stamp">PAID${order.paymentTransactionId ? ` · ${escapeHtml(order.paymentTransactionId)}` : ''}</div>
      <div class="center footer-note">Thank you! Please listen for Order ${escapeHtml(orderNum)}.</div>
    </div>
  `;
}

/**
 * Generates clean 80mm thermal HTML for Via 2 (Kitchen / Counter Ticket)
 */
export function buildKitchenTicketHtml(order: Order): string {
  const orderNum = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;
  const isMobilePickup = order.orderSource === 'mobile_pickup' || (order.source === 'online' && order.deliveryType === 'pickup');
  const modality = isMobilePickup
    ? 'MOBILE PICKUP'
    : order.orderType === 'takeout'
      ? 'TAKEOUT / TO-GO'
      : 'DINE-IN';
  const timestamp = escapeHtml(formatOrderTime(order.createdAt));

  const itemsHtml = (order.items || [])
    .map((item) => {
      const mods = extractItemModifications(item);
      return `
        <div class="kitchen-item">
          <div class="kitchen-item-title">${item.quantity}x ${escapeHtml(item.title.toUpperCase())}</div>
          ${mods.map((m) => `<div class="kitchen-mod">» ${escapeHtml(m.toUpperCase())}</div>`).join('')}
        </div>
      `;
    })
    .join('');

  return `
    <div class="ticket-80mm kitchen">
      <div class="center">
        <div class="label">KITCHEN / COUNTER TICKET</div>
        <div class="kitchen-order-num">ORDER ${escapeHtml(orderNum)}</div>
        <div class="kitchen-modality">${modality}</div>
        ${isMobilePickup && (order.scheduledTime || order.pickupTime) ? `<div class="kitchen-guest">PICKUP: ${escapeHtml((order.scheduledTime || order.pickupTime || '').toUpperCase())}</div>` : ''}
        <div class="kitchen-guest">${escapeHtml((order.customerName || 'WALK-IN').toUpperCase())}${order.tableOrPager ? ` · ${escapeHtml(order.tableOrPager.toUpperCase())}` : ''}</div>
        ${isMobilePickup && order.phone ? `<div class="guest">TEL: ${escapeHtml(order.phone)}</div>` : ''}
        <div class="meta">${timestamp}</div>
      </div>
      <div class="double-divider"></div>
      <div class="items">${itemsHtml}</div>
      ${
        order.observation && order.observation.trim()
          ? `
            <div class="double-divider"></div>
            <div class="kitchen-note">
              <div class="kitchen-note-label">SPECIAL INSTRUCTIONS:</div>
              <div>${escapeHtml(order.observation.trim().toUpperCase())}</div>
            </div>
          `
          : ''
      }
    </div>
  `;
}

export const THERMAL_PRINT_STYLES = `
  @page { size: 80mm auto; margin: 2mm; }
  body { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; margin: 0; padding: 0; }
  .ticket-80mm { width: 76mm; margin: 0 auto 12mm auto; padding: 4mm 2mm; font-size: 12px; line-height: 1.35; page-break-after: always; }
  .ticket-80mm:last-child { page-break-after: auto; }
  .center { text-align: center; }
  .brand { font-size: 16px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; }
  .meta { font-size: 10px; color: #333; margin-top: 2px; }
  .label { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; margin-top: 4px; }
  .order-num { font-size: 26px; font-weight: 900; margin: 4px 0; letter-spacing: 0.04em; }
  .kitchen-order-num { font-size: 36px; font-weight: 900; margin: 4px 0; letter-spacing: 0.04em; border: 2px solid #000; padding: 4px 0; }
  .modality { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; }
  .kitchen-modality { font-size: 16px; font-weight: 900; background: #000; color: #fff; padding: 4px 8px; display: inline-block; margin: 6px 0; }
  .guest { font-size: 12px; margin-top: 3px; }
  .kitchen-guest { font-size: 15px; font-weight: 900; margin-top: 2px; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .double-divider { border-top: 2px solid #000; margin: 8px 0; }
  .item-row { margin-bottom: 6px; }
  .item-main { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; }
  .item-mod { font-size: 11px; padding-left: 10px; color: #222; }
  .kitchen-item { padding: 6px 0; border-bottom: 1px dashed #000; }
  .kitchen-item-title { font-size: 15px; font-weight: 900; }
  .kitchen-mod { font-size: 13px; font-weight: 900; padding-left: 8px; margin-top: 2px; }
  .kitchen-note { border: 2px solid #000; padding: 6px; font-size: 13px; font-weight: 900; }
  .kitchen-note-label { font-size: 11px; text-decoration: underline; margin-bottom: 2px; }
  .totals { margin-top: 4px; }
  .tot-line { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
  .tot-line.grand { font-size: 16px; font-weight: 900; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
  .mono { font-variant-numeric: tabular-nums; }
  .paid-stamp { text-align: center; font-weight: 900; font-size: 13px; border: 1.5px solid #000; padding: 4px; margin: 10px 0; letter-spacing: 0.1em; }
  .footer-note { font-size: 11px; margin-top: 6px; }
`;

async function ensureQZConnection(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.qz?.websocket) return false;
  try {
    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect();
    }
    return window.qz.websocket.isActive();
  } catch {
    return false;
  }
}

/**
 * Triggers browser print via a clean hidden iframe (safe inside AI Studio iframes, avoids window.open blockers).
 */
export function triggerBrowserIframePrint(htmlSections: string[]): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return false;
    }

    doc.open();
    doc.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>80mm Thermal Receipts</title>
          <style>${THERMAL_PRINT_STYLES}</style>
        </head>
        <body>${htmlSections.join('')}</body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      }
    }, 250);
    return true;
  } catch (err) {
    console.warn('[PrintService] Browser iframe print failed:', err);
    return false;
  }
}

/**
 * Dispatches BOTH 80mm thermal tickets simultaneously as soon as paymentStatus === 'paid':
 * - Via 1: Customer Receipt (kioskPrinterName)
 * - Via 2: Kitchen / Counter Ticket (kitchenPrinterName)
 */
export async function printDualOrderReceipts(
  order: Order,
  settings: Settings
): Promise<DualPrintResult> {
  const customerHtml = buildCustomerReceiptHtml(order, settings);
  const kitchenHtml = buildKitchenTicketHtml(order);

  const qzReady = await ensureQZConnection();
  if (qzReady && window.qz) {
    try {
      const kioskPrinter = (settings.kioskPrinterName || 'Totem_Receipt_80mm').trim();
      const kitchenPrinter = (settings.kitchenPrinterName || 'Kitchen_Ticket_80mm').trim();

      const customerConfig = window.qz.configs.create(kioskPrinter);
      const kitchenConfig = window.qz.configs.create(kitchenPrinter);

      const customerData = buildCustomerEscPos(order, settings);
      const kitchenData = buildKitchenEscPos(order);

      // Simultaneous silent dispatch to both thermal printers
      await Promise.all([
        window.qz.print(customerConfig, customerData),
        window.qz.print(kitchenConfig, kitchenData),
      ]);

      return {
        mode: 'qz-tray',
        customerPrinted: true,
        kitchenPrinted: true,
        customerHtml,
        kitchenHtml,
      };
    } catch (err: any) {
      console.warn('[PrintService] QZ Tray print error, falling back to browser preview:', err);
      return {
        mode: 'browser-fallback',
        customerPrinted: false,
        kitchenPrinted: false,
        customerHtml,
        kitchenHtml,
        error: err?.message || 'QZ Tray printer unavailable',
      };
    }
  }

  return {
    mode: 'browser-fallback',
    customerPrinted: false,
    kitchenPrinted: false,
    customerHtml,
    kitchenHtml,
  };
}

/**
 * Reprints only the Kitchen / Counter 80mm ticket (used from KDS or Admin).
 */
export async function printKitchenTicketOnly(order: Order, settings: Settings): Promise<boolean> {
  const kitchenHtml = buildKitchenTicketHtml(order);
  const qzReady = await ensureQZConnection();
  if (qzReady && window.qz) {
    try {
      const kitchenPrinter = (settings.kitchenPrinterName || 'Kitchen_Ticket_80mm').trim();
      const kitchenConfig = window.qz.configs.create(kitchenPrinter);
      await window.qz.print(kitchenConfig, buildKitchenEscPos(order));
      return true;
    } catch {
      // Fallback to browser print
    }
  }
  return triggerBrowserIframePrint([kitchenHtml]);
}
