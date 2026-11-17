import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const CASHFREE_API_VERSION = '2023-08-01';

function getCashfreeBaseUrl() {
  return env.cashfreeEnv === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

function getCheckoutTokenSecret() {
  const seed = env.cashfreeSecretKey || env.supabaseServiceRoleKey;
  if (!seed) {
    throw new HttpError(503, 'Server security configuration is missing.');
  }
  return crypto
    .createHash('sha256')
    .update(`checkout-status:${seed}`)
    .digest();
}

export function createCheckoutStatusToken(registrationId, orderId) {
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${registrationId}:${orderId}:${exp}`;
  const sig = crypto
    .createHmac('sha256', getCheckoutTokenSecret())
    .update(payload)
    .digest('hex');
  return `${exp}.${sig}`;
}

export function verifyCheckoutStatusToken(token, registrationId, orderId) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return false;
  }
  const [expStr, sig] = token.split('.');
  const exp = Number.parseInt(expStr, 10);
  if (Number.isNaN(exp) || Date.now() > exp || !sig) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', getCheckoutTokenSecret())
    .update(`${registrationId}:${orderId}:${exp}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function buildCashfreeOrderId(registrationCode) {
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const safeCode = String(registrationCode || 'REG').replace(/[^a-zA-Z0-9_-]/g, '');
  return `CF-${safeCode}-${randomSuffix}`;
}

export function verifyCashfreeWebhookSignature(rawBody, timestamp, signature) {
  if (!rawBody || !timestamp || !signature || !env.cashfreeSecretKey) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', env.cashfreeSecretKey)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');

  const sigBuf = Buffer.from(String(signature));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function mapCashfreeStatus(eventType, orderStatus, paymentStatus) {
  const normEvent = String(eventType || '').toUpperCase();
  const normOrder = String(orderStatus || '').toUpperCase();
  const normPay = String(paymentStatus || '').toUpperCase();

  if (
    normEvent === 'PAYMENT_SUCCESS_WEBHOOK' ||
    normOrder === 'PAID' ||
    normPay === 'SUCCESS'
  ) {
    return 'PAID';
  }

  if (normEvent.includes('REFUND') || normPay === 'REFUNDED') {
    return 'REFUNDED';
  }

  if (
    normEvent === 'PAYMENT_FAILED_WEBHOOK' ||
    normEvent === 'PAYMENT_USER_DROPPED_WEBHOOK' ||
    normPay === 'FAILED' ||
    normPay === 'USER_DROPPED' ||
    normPay === 'CANCELLED' ||
    normOrder === 'EXPIRED' ||
    normOrder === 'TERMINATED'
  ) {
    return 'FAILED';
  }

  return 'PENDING';
}

async function cashfreeRequest(path, { method = 'GET', body } = {}) {
  if (!env.isCashfreeConfigured) {
    throw new HttpError(
      503,
      'Cashfree payment gateway credentials are not configured yet.'
    );
  }

  const response = await fetch(`${getCashfreeBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': CASHFREE_API_VERSION,
      'x-client-id': env.cashfreeAppId,
      'x-client-secret': env.cashfreeSecretKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  let rawText = '';
  if (typeof response.text === 'function') {
    rawText = await response.text().catch(() => '');
    try {
      data = JSON.parse(rawText);
    } catch {
      // Non-JSON response
    }
  } else if (typeof response.json === 'function') {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const errorMsg =
      data?.message ||
      (rawText && (rawText.includes('<HTML') || rawText.includes('<html'))
        ? `Cashfree gateway error (HTTP ${response.status})`
        : rawText.slice(0, 150)) ||
      'Cashfree gateway request failed.';

    throw new HttpError(
      response.status >= 500 ? 502 : 400,
      errorMsg
    );
  }

  return data;
}

export async function createCashfreeOrder({
  orderId,
  amount,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  returnUrl,
  notifyUrl,
}) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new HttpError(
      400,
      'Registration fee must be greater than zero before initiating online payment.'
    );
  }

  const sanitizedPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);

  const payload = {
    order_id: orderId,
    order_amount: Number(numericAmount.toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: String(customerId).replace(/[^a-zA-Z0-9_-]/g, ''),
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: sanitizedPhone.length === 10 ? sanitizedPhone : '9999999999',
    },
    order_meta: {
      return_url: returnUrl,
      ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    },
  };

  const data = await cashfreeRequest('/orders', {
    method: 'POST',
    body: payload,
  });

  return {
    cfOrderId: data.cf_order_id ? String(data.cf_order_id) : null,
    orderId: data.order_id,
    paymentSessionId: data.payment_session_id,
    orderStatus: data.order_status,
  };
}

export async function fetchCashfreeOrderState(orderId) {
  const [orderData, paymentsList] = await Promise.all([
    cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`),
    cashfreeRequest(`/orders/${encodeURIComponent(orderId)}/payments`).catch(
      () => []
    ),
  ]);

  const attempts = Array.isArray(paymentsList) ? paymentsList : [];
  const successAttempt = attempts.find(
    (p) => String(p.payment_status || '').toUpperCase() === 'SUCCESS'
  );
  const latestAttempt = successAttempt || attempts[0] || null;

  const nextStatus = mapCashfreeStatus(
    null,
    orderData?.order_status,
    latestAttempt?.payment_status
  );

  return {
    orderId: orderData?.order_id || orderId,
    orderStatus: orderData?.order_status || null,
    paymentSessionId: orderData?.payment_session_id || null,
    nextStatus,
    cfPaymentId: latestAttempt?.cf_payment_id
      ? String(latestAttempt.cf_payment_id)
      : null,
    paymentAmount:
      latestAttempt?.payment_amount !== undefined
        ? Number(latestAttempt.payment_amount)
        : orderData?.order_amount !== undefined
          ? Number(orderData.order_amount)
          : null,
    paymentTime: latestAttempt?.payment_time || null,
  };
}

export async function createCashfreeUpiQr({ paymentSessionId }) {
  const data = await cashfreeRequest('/orders/sessions', {
    method: 'POST',
    body: {
      payment_session_id: paymentSessionId,
      payment_method: {
        upi: {
          channel: 'qrcode',
        },
      },
    },
  });

  let qrDataUrl = null;
  const rawQrcode =
    data.data?.payload?.qrcode ||
    data.data?.payload ||
    data.data?.url ||
    null;

  if (typeof rawQrcode === 'string' && rawQrcode.startsWith('data:image/')) {
    qrDataUrl = rawQrcode;
  } else if (typeof rawQrcode === 'string' && (rawQrcode.startsWith('upi://') || rawQrcode.startsWith('http'))) {
    qrDataUrl = await QRCode.toDataURL(rawQrcode, {
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } else if (typeof data.data?.payload === 'string') {
    qrDataUrl = await QRCode.toDataURL(data.data.payload, {
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  return {
    action: data.action || 'custom',
    channel: data.channel || 'qrcode',
    cfPaymentId: data.cf_payment_id ? String(data.cf_payment_id) : null,
    qrDataUrl,
    rawPayload: data.data?.payload || null,
  };
}
