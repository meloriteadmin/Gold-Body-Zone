import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, it } from 'node:test';

const TEST_CASHFREE_SECRET = 'cfsk_test_dummy_secret_for_unit_tests_only';

function buildInMemoryDb() {
  const registrations = new Map();
  const payments = new Map();

  function seedOrder({
    orderId,
    registrationId,
    amount = 500,
    paymentStatus = 'PENDING',
    registrationStatus = 'PENDING',
    cashfreePaymentId = null,
    paidAt = null,
  }) {
    const registration = {
      id: registrationId,
      registrationCode: `GYMX-${registrationId}`,
      fullName: 'Test Athlete',
      email: 'athlete@example.com',
      registrationStatus,
      paymentStatus,
      confirmationEmailSentAt: null,
      competition: {
        id: 'comp-1',
        slug: 'test-championship',
        name: 'Test Championship',
        competitionType: 'BODYBUILDING',
        eventDate: new Date('2026-12-01T00:00:00Z'),
        venue: 'Mumbai',
        registrationFee: amount,
      },
      category: {
        id: 'cat-1',
        name: '65-75 kg',
        gender: 'MALE',
        categoryType: 'WEIGHT',
      },
      payment: null,
    };

    const payment = {
      id: `pay-${registrationId}`,
      registrationId,
      cashfreeOrderId: orderId,
      cashfreePaymentId,
      amount,
      status: paymentStatus,
      paidAt,
      verifiedAt: null,
      verificationSource: null,
      registration,
    };

    registration.payment = payment;
    registrations.set(registrationId, registration);
    payments.set(orderId, payment);
  }

  const prismaMock = {
    payment: {
      async findUnique({ where }) {
        const record = payments.get(where.cashfreeOrderId);
        if (!record) return null;
        return {
          ...record,
          registration: { ...record.registration },
        };
      },
      async update({ where, data }) {
        const target = [...payments.values()].find((p) => p.id === where.id);
        if (!target) {
          throw new Error(`Payment not found: ${where.id}`);
        }
        Object.assign(target, data);
        return { ...target };
      },
    },
    registration: {
      async update({ where, data }) {
        const target = registrations.get(where.id);
        if (!target) {
          throw new Error(`Registration not found: ${where.id}`);
        }
        Object.assign(target, data);
        return {
          ...target,
          payment: target.payment ? { ...target.payment } : null,
        };
      },
      async updateMany({ where, data }) {
        const target = registrations.get(where.id);
        if (
          target &&
          target.paymentStatus === where.paymentStatus &&
          target.confirmationEmailSentAt === null
        ) {
          Object.assign(target, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    async $transaction(operations) {
      return Promise.all(operations);
    },
  };

  return {
    registrations,
    payments,
    seedOrder,
    prismaMock,
  };
}

const db = buildInMemoryDb();
globalThis.__prisma = db.prismaMock;

const { env } = await import('../src/config/env.js');
env.cashfreeSecretKey = TEST_CASHFREE_SECRET;
env.smtpHost = '';
env.smtpUser = '';
env.smtpPass = '';
env.emailFrom = '';

const { createApp } = await import('../src/app.js');
const app = createApp();

function signPayload(rawBody, timestamp, secret = TEST_CASHFREE_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
}

async function postWebhook({ rawBody, headers = {} }) {
  const reqSocket = new PassThrough();
  reqSocket.remoteAddress = '127.0.0.1';
  const req = new http.IncomingMessage(reqSocket);
  req.method = 'POST';
  req.url = '/api/webhooks/cashfree';
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(rawBody)),
    ...Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
  };

  const res = new http.ServerResponse(req);
  const chunks = [];
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  return new Promise((resolve, reject) => {
    res.write = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
        );
      }
      return origWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
        );
      }
      const result = origEnd(chunk, encoding, cb);
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve({
          status: res.statusCode,
          body: text ? JSON.parse(text) : null,
        });
      } catch (parseErr) {
        reject(parseErr);
      }
      return result;
    };

    app(req, res, (err) => {
      if (err) reject(err);
    });

    process.nextTick(() => {
      req.push(rawBody);
      req.push(null);
    });
  });
}

describe('Cashfree Webhook Integration', () => {
  beforeEach(() => {
    db.registrations.clear();
    db.payments.clear();
    env.cashfreeSecretKey = TEST_CASHFREE_SECRET;
  });

  it('returns 503 when CASHFREE_SECRET_KEY is not configured', async () => {
    env.cashfreeSecretKey = '';
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({ type: 'TEST', data: {} });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 503);
    assert.match(res.body.message, /not configured/i);
  });

  it('rejects invalid signatures signed with the wrong key', async () => {
    db.seedOrder({ orderId: 'order_invalid_sig', registrationId: 'reg-1', amount: 750 });
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order_invalid_sig', order_amount: 750, order_status: 'PAID' },
        payment: {
          cf_payment_id: '998877',
          payment_status: 'SUCCESS',
          payment_amount: 750,
          payment_time: '2026-11-12T10:00:00+05:30',
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp, 'wrong_secret_key'),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(db.payments.get('order_invalid_sig').status, 'PENDING');
    assert.equal(db.registrations.get('reg-1').registrationStatus, 'PENDING');
  });

  it('acknowledges a signed Cashfree dashboard TEST webhook without touching orders or marking paid', async () => {
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'TEST',
      event_time: '2026-11-12T10:00:00+05:30',
      data: {
        test_object: {
          test_key: 'test_value',
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, test: true });
    assert.equal(db.payments.size, 0);
    assert.equal(db.registrations.size, 0);
  });

  it('settles valid 2022-09-01 PAYMENT_SUCCESS_WEBHOOK as PAID and CONFIRMED when amount matches', async () => {
    db.seedOrder({ orderId: 'order_success_1', registrationId: 'reg-2', amount: 1200 });
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      event_time: '2026-11-12T10:05:00+05:30',
      data: {
        order: {
          order_id: 'order_success_1',
          order_amount: 1200.0,
          order_currency: 'INR',
          order_status: 'PAID',
        },
        payment: {
          cf_payment_id: 123456789,
          payment_status: 'SUCCESS',
          payment_amount: 1200.0,
          payment_time: '2026-11-12T10:04:55+05:30',
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true });
    const payment = db.payments.get('order_success_1');
    const registration = db.registrations.get('reg-2');
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.cashfreePaymentId, '123456789');
    assert.equal(payment.verificationSource, 'CASHFREE_WEBHOOK');
    assert.equal(registration.paymentStatus, 'PAID');
    assert.equal(registration.registrationStatus, 'CONFIRMED');
  });

  it('handles PAYMENT_FAILED_WEBHOOK and PAYMENT_USER_DROPPED_WEBHOOK without confirming registration', async () => {
    db.seedOrder({ orderId: 'order_failed_1', registrationId: 'reg-3', amount: 900 });
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'PAYMENT_USER_DROPPED_WEBHOOK',
      data: {
        order: { order_id: 'order_failed_1', order_amount: 900 },
        payment: {
          cf_payment_id: '555111',
          payment_status: 'USER_DROPPED',
          payment_amount: 900,
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(db.payments.get('order_failed_1').status, 'FAILED');
    assert.equal(db.registrations.get('reg-3').paymentStatus, 'FAILED');
    assert.equal(db.registrations.get('reg-3').registrationStatus, 'PENDING');
  });

  it('preserves PAID and CONFIRMED idempotently on duplicate success and stale failed webhooks', async () => {
    db.seedOrder({ orderId: 'order_dup_1', registrationId: 'reg-4', amount: 1500 });
    const timestamp = String(Date.now());

    const successBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order_dup_1', order_amount: 1500 },
        payment: {
          cf_payment_id: 'cf-win-1',
          payment_status: 'SUCCESS',
          payment_amount: 1500,
          payment_time: '2026-11-12T10:10:00+05:30',
        },
      },
    });

    const firstRes = await postWebhook({
      rawBody: successBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(successBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });
    assert.equal(firstRes.status, 200);

    const dupRes = await postWebhook({
      rawBody: successBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(successBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });
    assert.equal(dupRes.status, 200);

    const staleFailedBody = JSON.stringify({
      type: 'PAYMENT_FAILED_WEBHOOK',
      data: {
        order: { order_id: 'order_dup_1', order_amount: 1500 },
        payment: {
          cf_payment_id: 'cf-old-failed',
          payment_status: 'FAILED',
        },
      },
    });

    const staleRes = await postWebhook({
      rawBody: staleFailedBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(staleFailedBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });
    assert.equal(staleRes.status, 200);

    const payment = db.payments.get('order_dup_1');
    const registration = db.registrations.get('reg-4');
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.cashfreePaymentId, 'cf-win-1');
    assert.equal(registration.paymentStatus, 'PAID');
    assert.equal(registration.registrationStatus, 'CONFIRMED');
  });

  it('rejects mismatched payment_amount without confirming registration or overwriting expected DB amount', async () => {
    db.seedOrder({ orderId: 'order_mismatch_1', registrationId: 'reg-5', amount: 1000 });
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order_mismatch_1', order_amount: 1000 },
        payment: {
          cf_payment_id: 'cf-tampered-1',
          payment_status: 'SUCCESS',
          payment_amount: 100,
          payment_time: '2026-11-12T10:15:00+05:30',
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /amount/i);
    const payment = db.payments.get('order_mismatch_1');
    const registration = db.registrations.get('reg-5');
    assert.equal(payment.status, 'PENDING');
    assert.equal(payment.amount, 1000);
    assert.equal(payment.cashfreePaymentId, null);
    assert.equal(registration.paymentStatus, 'PENDING');
    assert.equal(registration.registrationStatus, 'PENDING');
  });

  it('protects CANCELLED registrations from late PAID webhooks while preserving payment reconciliation data', async () => {
    db.seedOrder({
      orderId: 'order_cancelled_1',
      registrationId: 'reg-6',
      amount: 800,
      paymentStatus: 'PENDING',
      registrationStatus: 'CANCELLED',
    });
    const timestamp = String(Date.now());
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order_cancelled_1', order_amount: 800 },
        payment: {
          cf_payment_id: 'cf-late-paid-1',
          payment_status: 'SUCCESS',
          payment_amount: 800,
          payment_time: '2026-11-12T10:20:00+05:30',
        },
      },
    });

    const res = await postWebhook({
      rawBody,
      headers: {
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signPayload(rawBody, timestamp),
        'x-webhook-version': '2022-09-01',
      },
    });

    assert.equal(res.status, 200);
    const payment = db.payments.get('order_cancelled_1');
    const registration = db.registrations.get('reg-6');
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.cashfreePaymentId, 'cf-late-paid-1');
    assert.equal(payment.verificationSource, 'CASHFREE_WEBHOOK');
    assert.equal(registration.paymentStatus, 'PAID');
    assert.equal(registration.registrationStatus, 'CANCELLED');
    assert.equal(registration.confirmationEmailSentAt, null);
  });
});
