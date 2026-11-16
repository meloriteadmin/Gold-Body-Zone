import { load } from '@cashfreepayments/cashfree-js';

const STORAGE_PREFIX = 'cf_checkout_';

export function saveCheckoutSession({ orderId, statusToken, registrationId }) {
  if (!orderId || !statusToken) return;
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${orderId}`,
      JSON.stringify({ orderId, statusToken, registrationId })
    );
  } catch {
    // Ignore storage unavailability
  }
}

export function readCheckoutSession(orderId) {
  if (!orderId) return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function launchCashfreeCheckout({
  mode = 'sandbox',
  paymentSessionId,
  orderId,
  statusToken,
  registrationId,
  redirectTarget = '_modal',
}) {
  if (!paymentSessionId || !orderId) {
    throw new Error('Cashfree payment session is not available.');
  }

  saveCheckoutSession({ orderId, statusToken, registrationId });

  const cashfree = await load({
    mode: mode === 'production' ? 'production' : 'sandbox',
  });

  if (!cashfree) {
    throw new Error('Unable to initialize Cashfree Checkout SDK.');
  }

  return cashfree.checkout({
    paymentSessionId,
    redirectTarget: redirectTarget || '_modal',
  });
}
