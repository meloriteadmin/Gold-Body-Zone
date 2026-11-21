import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

test('partial, duplicate, failed and full refunds preserve payment history',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
    process.env.CASHFREE_ENV = 'sandbox';
    process.env.CASHFREE_APP_ID = 'sandbox-test-id';
    process.env.CASHFREE_SECRET_KEY = 'sandbox-test-secret';
    const { getPrismaClient } = await import('../src/config/prisma.js');
    const { recordVerifiedRefund, requestAdminRefund, reconcileCashfreeRefunds } = await import('../src/services/refund.service.js');
    const db = getPrismaClient();
    const originalFetch = globalThis.fetch;
    const requests = new Map();
    globalThis.fetch = async (url, options = {}) => {
      const path = String(url);
      let result;
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.equal(options.headers['x-idempotency-key'].replaceAll('-', ''), body.refund_id.slice(3));
        result = { refund_id: body.refund_id, refund_amount: body.refund_amount,
          refund_status: 'PENDING', cf_refund_id: `cf-${body.refund_id}` };
        requests.set(body.refund_id, result);
      } else if (path.endsWith('/refunds')) {
        result = [...requests.values()];
      } else {
        result = requests.get(path.split('/').at(-1));
      }
      return { ok: Boolean(result), status: result ? 200 : 404,
        text: async () => JSON.stringify(result || { message: 'Not found' }) };
    };
    const competition = await db.competition.create({ data: {
      slug: `refund-test-${Date.now()}`, name: 'Refund test', competitionType: 'Bodybuilding',
    } });
    let registrationId;
    try {
      const category = await db.competitionCategory.create({ data: {
        competitionId: competition.id, name: 'Open', gender: 'MALE',
      } });
      const registration = await db.registration.create({ data: {
        registrationCode: `REF-${Date.now()}`, competitionId: competition.id,
        categoryId: category.id, participantName: 'Test Athlete',
        email: 'refund-test@example.invalid', mobileNumber: '9999999999',
        gender: 'MALE', age: 25, district: 'Test', gymName: 'Test',
        paymentStatus: 'PAID', registrationStatus: 'CONFIRMED',
      } });
      registrationId = registration.id;
      const orderId = `REFUND-ORDER-${Date.now()}`;
      await db.payment.create({ data: {
        registrationId, cashfreeOrderId: orderId, amount: 100, status: 'PAID',
      } });
      const firstRequestId = crypto.randomUUID();
      const first = await requestAdminRefund({ registrationId, requestId: firstRequestId,
        amount: 40, note: 'Partial refund test' });
      assert.equal(first.status, 'PENDING');
      await recordVerifiedRefund({ orderId, refundId: first.cashfreeRefundId,
        amount: 40, status: 'SUCCESS' });
      await recordVerifiedRefund({ orderId, refundId: first.cashfreeRefundId,
        amount: 40, status: 'SUCCESS' });
      assert.equal((await db.payment.findUnique({ where: { registrationId } })).status, 'PAID');
      const failedRequestId = crypto.randomUUID();
      const failed = await requestAdminRefund({ registrationId, requestId: failedRequestId,
        amount: 60, note: 'Failed refund test' });
      await recordVerifiedRefund({ orderId, refundId: failed.cashfreeRefundId,
        amount: 60, status: 'FAILED' });
      const finalRequestId = crypto.randomUUID();
      const finalRefund = await requestAdminRefund({ registrationId, requestId: finalRequestId,
        amount: 60, note: 'Complete refund test' });
      await recordVerifiedRefund({ orderId, refundId: finalRefund.cashfreeRefundId,
        amount: 60, status: 'SUCCESS' });
      assert.equal((await db.payment.findUnique({ where: { registrationId } })).status, 'REFUNDED');
      const retry = await requestAdminRefund({ registrationId, requestId: finalRequestId,
        amount: 60, note: 'Complete refund test' });
      assert.equal(retry.id, finalRequestId);
      assert.equal((await db.registration.findUnique({ where: { id: registrationId } })).registrationStatus, 'CANCELLED');
      assert.equal((await db.refund.findMany({ where: { payment: { registrationId } } })).length, 3);
      requests.get(first.cashfreeRefundId).refund_status = 'SUCCESS';
      requests.get(failed.cashfreeRefundId).refund_status = 'FAILED';
      requests.get(finalRefund.cashfreeRefundId).refund_status = 'SUCCESS';
      assert.equal((await reconcileCashfreeRefunds(registrationId)).length, 3);
    } finally {
      globalThis.fetch = originalFetch;
      if (registrationId) {
        const payment = await db.payment.findUnique({ where: { registrationId } });
        if (payment) await db.refund.deleteMany({ where: { paymentId: payment.id } });
        await db.registration.delete({ where: { id: registrationId } });
      }
      await db.competition.delete({ where: { id: competition.id } }).catch(() => {});
      await db.$disconnect();
    }
  });
