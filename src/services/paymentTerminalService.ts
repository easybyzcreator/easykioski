import { Settings, TerminalProvider } from '../types';

export interface TerminalPaymentRequest {
  amount: number; // Total amount in dollars (e.g. 24.75)
  currency: string; // e.g. 'USD'
  referenceId: string;
  customerName?: string;
  note?: string;
}

export interface TerminalCheckoutSession {
  checkoutId: string;
  provider: TerminalProvider;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'FAILED';
  transactionId?: string;
  cardBrand?: string;
  last4?: string;
  errorMessage?: string;
  isLiveApi?: boolean;
}

/**
 * Modular Payment Terminal Service for US Self-Service Kiosks.
 * Supports:
 * - Square Terminal API (v2/terminals/checkouts)
 * - PayPal Zettle Terminal / Reader API
 * - Simulation mode (for live sales demos & testing)
 */
export function resolveTerminalProvider(settings: Settings): TerminalProvider {
  return settings.terminalProvider || 'simulation';
}

/**
 * Initiates a payment request on the configured physical card reader.
 */
export async function initiateTerminalPayment(
  request: TerminalPaymentRequest,
  settings: Settings
): Promise<TerminalCheckoutSession> {
  const provider = resolveTerminalProvider(settings);
  const amountCents = Math.round(request.amount * 100);

  if (provider === 'square') {
    const apiKey = (settings.terminalApiKey || '').trim();
    const deviceId = (settings.terminalDeviceId || '').trim();

    if (!apiKey || !deviceId) {
      return {
        checkoutId: `sq_cfg_${Date.now()}`,
        provider: 'square',
        status: 'FAILED',
        errorMessage: 'Square Terminal API Key and Device ID must be configured in Admin Settings.',
      };
    }

    // Square Terminal API v2 payload structure (routed via backend proxy in production to keep keys secure)
    const squarePayload = {
      idempotency_key: `ebc_${request.referenceId}_${Date.now()}`,
      checkout: {
        amount_money: {
          amount: amountCents,
          currency: request.currency || 'USD',
        },
        device_options: {
          device_id: deviceId,
          skip_receipt_screen: true,
          tip_settings: {
            allow_tipping: false, // Tip is already collected in the kiosk UI
          },
        },
        reference_id: request.referenceId,
        note: request.note || `Kiosk Order - ${request.customerName || 'Guest'}`,
      },
    };

    try {
      // Attempt server-side proxy route if deployed, otherwise return ready session for polling
      const res = await fetch('/api/terminal/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: squarePayload,
          deviceId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          checkoutId: data.checkout?.id || `sq_${Date.now()}`,
          provider: 'square',
          status: 'IN_PROGRESS',
          isLiveApi: true,
        };
      }
    } catch {
      // Proxy not mounted in pure SPA mode; keep terminal waiting state
    }

    return {
      checkoutId: `sq_pending_${Date.now()}`,
      provider: 'square',
      status: 'IN_PROGRESS',
      isLiveApi: false,
    };
  }

  if (provider === 'zettle') {
    const apiKey = (settings.terminalApiKey || '').trim();
    const deviceId = (settings.terminalDeviceId || '').trim();

    if (!apiKey || !deviceId) {
      return {
        checkoutId: `zt_cfg_${Date.now()}`,
        provider: 'zettle',
        status: 'FAILED',
        errorMessage: 'PayPal Zettle API Key and Reader Device ID must be configured in Admin Settings.',
      };
    }

    const zettlePayload = {
      internalTraceId: request.referenceId,
      amount: amountCents,
      currency: request.currency || 'USD',
      readerId: deviceId,
      reference: request.note || `Kiosk Order - ${request.customerName || 'Guest'}`,
    };

    try {
      const res = await fetch('/api/terminal/zettle/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zettlePayload),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          checkoutId: data.checkoutId || `zt_${Date.now()}`,
          provider: 'zettle',
          status: 'IN_PROGRESS',
          isLiveApi: true,
        };
      }
    } catch {
      // Proxy not mounted in pure SPA mode
    }

    return {
      checkoutId: `zt_pending_${Date.now()}`,
      provider: 'zettle',
      status: 'IN_PROGRESS',
      isLiveApi: false,
    };
  }

  // Simulation Mode
  return {
    checkoutId: `sim_${Date.now()}`,
    provider: 'simulation',
    status: 'IN_PROGRESS',
    isLiveApi: false,
  };
}

/**
 * Polls the terminal session for completion status (used in live Square / Zettle mode).
 */
export async function pollTerminalStatus(
  session: TerminalCheckoutSession
): Promise<TerminalCheckoutSession> {
  if (session.provider === 'simulation' || !session.isLiveApi) {
    return session;
  }

  try {
    const endpoint =
      session.provider === 'square'
        ? `/api/terminal/square/checkout/${encodeURIComponent(session.checkoutId)}`
        : `/api/terminal/zettle/checkout/${encodeURIComponent(session.checkoutId)}`;
    const res = await fetch(endpoint);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'COMPLETED' || data.status === 'APPROVED') {
        return {
          ...session,
          status: 'COMPLETED',
          transactionId: data.transactionId || session.checkoutId,
          cardBrand: data.cardBrand || 'CARD',
          last4: data.last4 || '****',
        };
      }
      if (data.status === 'CANCELED' || data.status === 'FAILED') {
        return {
          ...session,
          status: data.status,
          errorMessage: data.errorMessage || 'Transaction declined or canceled on terminal.',
        };
      }
    }
  } catch {
    // Keep polling silently
  }

  return session;
}

/**
 * Cancels an in-progress terminal payment request.
 */
export async function cancelTerminalPayment(session: TerminalCheckoutSession | null): Promise<void> {
  if (!session || session.provider === 'simulation' || !session.isLiveApi) return;
  try {
    const endpoint =
      session.provider === 'square'
        ? `/api/terminal/square/checkout/${encodeURIComponent(session.checkoutId)}/cancel`
        : `/api/terminal/zettle/checkout/${encodeURIComponent(session.checkoutId)}/cancel`;
    await fetch(endpoint, { method: 'POST' });
  } catch {
    // Ignore cancel network errors
  }
}

/**
 * Simulates an instant contactless/chip card approval when `terminalProvider === 'simulation'`.
 */
export async function simulateTerminalApproval(
  session: TerminalCheckoutSession
): Promise<TerminalCheckoutSession> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  return {
    ...session,
    status: 'COMPLETED',
    transactionId: `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    cardBrand: 'APPLE PAY / VISA',
    last4: '4242',
  };
}
