import assert from 'node:assert/strict';
import { test } from 'node:test';

test('first payment requests reserve one stable Cashfree order under concurrency',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
    process.env.CASHFREE_ENV = 'sandbox';
    process.env.CASHFREE_APP_ID = 'sandbox-test-id';
    process.env.CASHFREE_SECRET_KEY = 'sandbox-test-secret';
    process.env.CHECKOUT_TOKEN_SECRET = 'test-checkout-token-secret-at-least-32-chars';
    process.env.PUBLIC_APP_URL = 'http://localhost:5173';
    const { getPrismaClient } = await import('../src/config/prisma.js');
    const { createCheckoutStatusToken } = await import('../src/services/cashfree.service.js');
    const { retryRegistrationPayment } = await import('../src/controllers/public.controller.js');
    const db = getPrismaClient();
    const originalFetch = globalThis.fetch;
    let postCount = 0;
    let createdOrder = null;
    let simulatePostTimeout = false;
    globalThis.fetch = async (url, options = {}) => {
      if (options.method === 'POST' && String(url).endsWith('/orders')) {
        postCount++;
        const body = JSON.parse(options.body);
        assert.equal(options.headers['x-idempotency-key'], body.order_id.slice(3));
        await new Promise((resolve) => setTimeout(resolve, 80));
        createdOrder = body.order_id;
        if (simulatePostTimeout) throw new Error('Simulated lost response after remote order creation');
        return { ok: true, text: async () => JSON.stringify({
          order_id: body.order_id, payment_session_id: 'session-test', order_status: 'ACTIVE',
        }) };
      }
      if (String(url).includes('/orders/') && !String(url).endsWith('/payments')) {
        return { ok: true, text: async () => JSON.stringify({
          order_id: createdOrder, order_status: 'ACTIVE', order_amount: 100,
          payment_session_id: 'session-test',
        }) };
      }
      return { ok: true, text: async () => '[]' };
    };

    const competition = await db.competition.create({ data: {
      slug: `order-lock-${Date.now()}`, name: 'Order lock test',
      competitionType: 'Bodybuilding', genderEligibility: 'MALE_ONLY',
      registrationFee: 100, isPublished: true,
    } });
    const registrationIds = [];
    try {
      const category = await db.competitionCategory.create({ data: {
        competitionId: competition.id, name: 'Test', gender: 'MALE',
      } });
      const registration = await db.registration.create({ data: {
        registrationCode: `LOCK-${Date.now()}`, competitionId: competition.id,
        categoryId: category.id, participantName: 'Test Athlete',
        email: 'order-lock@example.invalid', mobileNumber: '9999999999',
        gender: 'MALE', age: 25, district: 'Test', gymName: 'Test',
      } });
      registrationIds.push(registration.id);
      const token = createCheckoutStatusToken(registration.id, registration.id);
      const call = () => new Promise((resolve, reject) => {
        const req = { params: { id: registration.id }, body: { statusToken: token }, headers: {} };
        const res = { status() { return this; }, json(value) { resolve(value); return this; } };
        retryRegistrationPayment(req, res, reject);
      });
      const [first, second] = await Promise.all([call(), call()]);
      assert.equal(postCount, 1);
      assert.equal(first.cashfree.orderId, second.cashfree.orderId);
      assert.equal(first.cashfree.orderId, `CF-${registration.id}`);
      assert.equal((await db.payment.findUnique({ where: { registrationId: registration.id } })).cashfreeOrderId,
        first.cashfree.orderId);

      const secondRegistration = await db.registration.create({ data: {
        registrationCode: `TIMEOUT-${Date.now()}`, competitionId: competition.id,
        categoryId: category.id, participantName: 'Test Athlete',
        email: 'order-timeout@example.invalid', mobileNumber: '9999999999',
        gender: 'MALE', age: 25, district: 'Test', gymName: 'Test',
      } });
      registrationIds.push(secondRegistration.id);
      simulatePostTimeout = true;
      const secondToken = createCheckoutStatusToken(secondRegistration.id, secondRegistration.id);
      const recovered = await new Promise((resolve, reject) => {
        const req = { params: { id: secondRegistration.id }, body: { statusToken: secondToken }, headers: {} };
        const res = { status() { return this; }, json(value) { resolve(value); return this; } };
        retryRegistrationPayment(req, res, reject);
      });
      assert.equal(recovered.cashfree.orderId, `CF-${secondRegistration.id}`);
      assert.equal((await db.payment.findUnique({ where: { registrationId: secondRegistration.id } })).cashfreeOrderId,
        recovered.cashfree.orderId);
      assert.equal(postCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
      for (const id of registrationIds) await db.registration.delete({ where: { id } });
      await db.competition.delete({ where: { id: competition.id } });
      await db.$disconnect();
    }
  });
