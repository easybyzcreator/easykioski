import { Settings } from '../types';

export type TotemQrOnlyMethod = 'venmo' | 'paypal' | 'cashapp';
export type TotemQrWalletMethod = TotemQrOnlyMethod | 'counter';
export type MobileWalletMethod = 'venmo' | 'paypal' | 'cashapp' | 'zelle';

export const DEFAULT_DEMO_VENMO = 'easykioski-demo';
export const DEFAULT_DEMO_PAYPAL = 'easykioskidemo';
export const DEFAULT_DEMO_CASHAPP = 'easykioskidemo';

export function sanitizeVenmoUsername(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?venmo\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

export function sanitizePaypalUsername(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

export function sanitizeCashAppTag(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?cash\.app\//i, '')
    .replace(/^\$+/, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

export function generateSecureWebhookSecret(length: number = 32): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const array = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let token = 'ek_';
  for (let i = 0; i < length; i++) {
    token += alphabet[array[i] % alphabet.length];
  }
  return token;
}

export function buildTotemQrPaymentUrl(
  method: TotemQrOnlyMethod,
  settings: Settings,
  total: number,
  orderNumber: number
): string {
  const safeTotal = Math.max(0.01, Number(total) || 0).toFixed(2);
  if (method === 'venmo') {
    const venmoUser = sanitizeVenmoUsername(settings.venmoUsername) || DEFAULT_DEMO_VENMO;
    const note = encodeURIComponent(`Order #${orderNumber}`);
    return `https://venmo.com/${encodeURIComponent(venmoUser)}?txn=pay&amount=${safeTotal}&note=${note}`;
  }
  if (method === 'paypal') {
    const paypalUser = sanitizePaypalUsername(settings.paypalMeUsername) || DEFAULT_DEMO_PAYPAL;
    return `https://www.paypal.com/paypalme/${encodeURIComponent(paypalUser)}/${safeTotal}`;
  }
  const cashTag = sanitizeCashAppTag(settings.cashAppTag) || DEFAULT_DEMO_CASHAPP;
  return `https://cash.app/$${encodeURIComponent(cashTag)}/${safeTotal}`;
}

export function getAvailableTotemQrWallets(settings: Settings): TotemQrOnlyMethod[] {
  const wallets: TotemQrOnlyMethod[] = [];
  if (sanitizeVenmoUsername(settings.venmoUsername)) wallets.push('venmo');
  if (sanitizePaypalUsername(settings.paypalMeUsername)) wallets.push('paypal');
  if (sanitizeCashAppTag(settings.cashAppTag)) wallets.push('cashapp');
  if (wallets.length === 0) {
    return ['venmo', 'paypal', 'cashapp'];
  }
  return wallets;
}

export function getAvailableTotemPaymentMethods(settings: Settings): TotemQrWalletMethod[] {
  const methods: TotemQrWalletMethod[] = [...getAvailableTotemQrWallets(settings)];
  if (settings.allowPayAtCounter !== false) methods.push('counter');
  return methods;
}

export function getAvailableMobilePaymentMethods(settings: Settings): MobileWalletMethod[] {
  const methods: MobileWalletMethod[] = [...getAvailableTotemQrWallets(settings)];
  if ((settings.zelleIdentifier || '').trim()) methods.push('zelle');
  return methods;
}

export function generateGoogleAppsScriptCode(params: {
  projectId: string;
  webhookSecret: string;
}): string {
  const safeProjectId = (params.projectId || 'app-toten-ebc').trim();
  const safeSecret = (params.webhookSecret || 'CONFIGURE_NO_PAINEL_ADMIN').trim();

  return `/**
 * ============================================================================
 * EASY KIOSKI — CONFIRMAÇÃO AUTOMÁTICA DE PAGAMENTO VIA GMAIL
 * Suporta Totem na Loja e Mobile Pickup (/order): VENMO · PAYPAL · CASH APP · ZELLE
 * ============================================================================
 * Projeto Firebase : ${safeProjectId}
 * Label Gmail      : EasyKioski-Processed
 * Frequência       : Executar a cada 1 minuto via Acionador (Trigger) de Tempo
 * ============================================================================
 */

var FIREBASE_PROJECT_ID = '${safeProjectId}';
var WEBHOOK_SECRET = '${safeSecret}';
var PROCESSED_LABEL_NAME = 'EasyKioski-Processed';
var EMAIL_LOOKBACK_MINUTES = 10;
var ORDER_LOOKBACK_MINUTES = 15;

/**
 * Função principal — configure o Acionador (Trigger) para rodar esta função a cada 1 minuto.
 */
function processEasyKioskiPayments() {
  var processedLabel = getOrCreateLabel_(PROCESSED_LABEL_NAME);
  var nowMs = Date.now();
  var emailCutoffMs = nowMs - EMAIL_LOOKBACK_MINUTES * 60 * 1000;

  // Busca e-mails não lidos de Venmo, PayPal, Cash App ou Zelle que ainda não foram processados
  var searchQuery =
    'is:unread -label:' + PROCESSED_LABEL_NAME + ' newer_than:1d ' +
    '(from:venmo@venmo.com OR from:service@paypal.com OR from:cash@square.com OR from:zellepay.com OR subject:Zelle OR "sent you money with Zelle")';

  var threads = GmailApp.search(searchQuery, 0, 20);
  if (!threads || threads.length === 0) {
    return;
  }

  // Consulta no Firestore os pedidos pendentes dos últimos 15 minutos
  var pendingOrders = fetchPendingKioskOrders_(ORDER_LOOKBACK_MINUTES);
  if (!pendingOrders || pendingOrders.length === 0) {
    return;
  }

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();

    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      if (!msg.isUnread()) continue;

      var msgDateMs = msg.getDate().getTime();
      if (msgDateMs < emailCutoffMs) continue;

      var from = (msg.getFrom() || '').toLowerCase();
      var subject = msg.getSubject() || '';
      var plainBody = msg.getPlainBody() || '';
      var combinedText = subject + '\\n' + plainBody;

      // Confirma se é um e-mail de pagamento recebido
      if (!isPaymentReceiptEmail_(combinedText)) {
        continue;
      }

      var provider = detectProvider_(from, combinedText);
      var paidAmount = extractDollarAmount_(combinedText);
      var parsedOrderNumber = extractOrderNumber_(combinedText);

      if (paidAmount === null && parsedOrderNumber === null) {
        continue;
      }

      // Faz match prioritário pelo orderNumber OU pelo valor exato do pedido mais recente
      var matchedOrder = findMatchingOrder_(pendingOrders, parsedOrderNumber, paidAmount);
      if (!matchedOrder) {
        continue;
      }

      var updated = markOrderAsPaidInFirestore_(matchedOrder.docPath, provider);
      if (updated) {
        msg.markRead();
        thread.addLabel(processedLabel);

        // Remove da lista local para evitar duplo match na mesma execução
        pendingOrders = pendingOrders.filter(function(o) {
          return o.docPath !== matchedOrder.docPath;
        });

        Logger.log(
          '[EasyKioski] Pedido #' + matchedOrder.orderNumber +
          ' confirmado via ' + provider.toUpperCase() +
          ' ($' + (paidAmount !== null ? paidAmount.toFixed(2) : matchedOrder.total.toFixed(2)) + ')'
        );
      }
    }
  }
}

/**
 * Helper opcional: rode 1 única vez no editor para criar o Trigger automático de 1 minuto.
 */
function setupOneMinuteTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processEasyKioskiPayments') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processEasyKioskiPayments')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('[EasyKioski] Trigger de 1 minuto criado com sucesso!');
}

function isPaymentReceiptEmail_(text) {
  return /(paid you|sent you|payment received|received a payment|you received|deposited into|money with zelle|zelle payment)/i.test(text);
}

function detectProvider_(from, text) {
  if (from.indexOf('venmo.com') !== -1 || /venmo/i.test(text)) return 'venmo';
  if (from.indexOf('paypal.com') !== -1 || /paypal/i.test(text)) return 'paypal';
  if (from.indexOf('cash@square.com') !== -1 || /cash app/i.test(text)) return 'cashapp';
  if (from.indexOf('zellepay.com') !== -1 || /zelle/i.test(text)) return 'zelle';
  return 'venmo';
}

function extractDollarAmount_(text) {
  // Captura valores no formato $24.50 ou $1,250.00
  var match = text.match(/\\$\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})|[0-9]+\\.[0-9]{2})/);
  if (!match || !match[1]) return null;
  var numeric = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(numeric) ? null : Math.round(numeric * 100) / 100;
}

function extractOrderNumber_(text) {
  // Procura padrões como "Order #104", "Order 104" ou "#104"
  var match = text.match(/(?:order\\s*#?\\s*|#)(\\d{1,5})\\b/i);
  if (!match || !match[1]) return null;
  var parsed = parseInt(match[1], 10);
  return isNaN(parsed) ? null : parsed;
}

function fetchPendingKioskOrders_(lookbackMinutes) {
  var url =
    'https://firestore.googleapis.com/v1/projects/' +
    FIREBASE_PROJECT_ID +
    '/databases/(default)/documents:runQuery';

  var payload = {
    structuredQuery: {
      from: [{ collectionId: 'pedidos' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'paymentStatus' },
          op: 'EQUAL',
          value: { stringValue: 'awaiting_payment' }
        }
      }
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    Logger.log('[EasyKioski] Erro ao consultar Firestore: ' + response.getContentText());
    return [];
  }

  var rows = JSON.parse(response.getContentText());
  var cutoffMs = Date.now() - lookbackMinutes * 60 * 1000;
  var orders = [];

  for (var i = 0; i < rows.length; i++) {
    var doc = rows[i].document;
    if (!doc || !doc.fields) continue;

    var fields = doc.fields;
    var createdMs = parseFirestoreTimestampMs_(fields.createdAt);
    if (createdMs && createdMs < cutoffMs) continue;

    var orderNum = parseFirestoreNumber_(fields.orderNumber);
    var totalVal = parseFirestoreNumber_(fields.total);

    orders.push({
      docPath: doc.name,
      orderNumber: orderNum,
      total: totalVal !== null ? Math.round(totalVal * 100) / 100 : null,
      createdMs: createdMs || 0
    });
  }

  // Mais recentes primeiro
  orders.sort(function(a, b) {
    return b.createdMs - a.createdMs;
  });

  return orders;
}

function findMatchingOrder_(pendingOrders, orderNumber, paidAmount) {
  // 1) Prioridade máxima: match pelo número do pedido (#104)
  if (orderNumber !== null) {
    for (var i = 0; i < pendingOrders.length; i++) {
      if (pendingOrders[i].orderNumber === orderNumber) {
        if (paidAmount === null || pendingOrders[i].total === null || Math.abs(pendingOrders[i].total - paidAmount) < 0.02) {
          return pendingOrders[i];
        }
      }
    }
  }

  // 2) Fallback: match pelo valor exato ($XX.XX) no pedido pendente mais recente
  if (paidAmount !== null) {
    for (var j = 0; j < pendingOrders.length; j++) {
      if (pendingOrders[j].total !== null && Math.abs(pendingOrders[j].total - paidAmount) < 0.01) {
        return pendingOrders[j];
      }
    }
  }

  return null;
}

function markOrderAsPaidInFirestore_(docFullName, provider) {
  var url =
    'https://firestore.googleapis.com/v1/' +
    docFullName +
    '?updateMask.fieldPaths=paymentStatus' +
    '&updateMask.fieldPaths=paymentConfirmedAt' +
    '&updateMask.fieldPaths=paymentProvider' +
    '&updateMask.fieldPaths=webhookSecretVerified';

  var payload = {
    fields: {
      paymentStatus: { stringValue: 'paid' },
      paymentConfirmedAt: { timestampValue: new Date().toISOString() },
      paymentProvider: { stringValue: provider },
      webhookSecretVerified: { stringValue: WEBHOOK_SECRET }
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    Logger.log('[EasyKioski] Erro no PATCH Firestore (' + code + '): ' + response.getContentText());
    return false;
  }
  return true;
}

function parseFirestoreNumber_(fieldObj) {
  if (!fieldObj) return null;
  if (fieldObj.integerValue !== undefined) return parseFloat(fieldObj.integerValue);
  if (fieldObj.doubleValue !== undefined) return parseFloat(fieldObj.doubleValue);
  if (fieldObj.stringValue !== undefined) {
    var v = parseFloat(fieldObj.stringValue);
    return isNaN(v) ? null : v;
  }
  return null;
}

function parseFirestoreTimestampMs_(fieldObj) {
  if (!fieldObj) return null;
  if (fieldObj.timestampValue) {
    var ms = Date.parse(fieldObj.timestampValue);
    return isNaN(ms) ? null : ms;
  }
  if (fieldObj.stringValue) {
    var msStr = Date.parse(fieldObj.stringValue);
    return isNaN(msStr) ? null : msStr;
  }
  return null;
}

function getOrCreateLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
  }
  return label;
}
`;
}
