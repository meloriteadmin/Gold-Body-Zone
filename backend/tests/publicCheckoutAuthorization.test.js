import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
globalThis.__prisma = {
  competition: {
    async findFirst() { return { id: 'comp-1', name: 'Test Event', isPublished: true }; },
  },
  registration: {
    async findFirst() { return registration; },
    async findUnique() { return registration; },
  },
};

const { env } = await import('../src/config/env.js');
env.cashfreeSecretKey = 'test-only-checkout-secret';
env.checkoutTokenSecret = 'test-only-checkout-secret';
const { createCheckoutStatusToken } = await import('../src/services/cashfree.service.js');
const { checkCompetitionRegistration, retryRegistrationPayment } = await import('../src/controllers/public.controller.js');

const registration = {
  id: 'reg-1',
  email: 'athlete@example.com',
  paymentStatus: 'PENDING',
  registrationStatus: 'PENDING',
  createdAt: new Date('2026-11-19T00:00:00Z'),
  competition: { id: 'comp-1', isPublished: true, isCompleted: false },
  payment: { cashfreeOrderId: 'order-1' },
};

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('Public checkout authorization', () => {
  it('does not disclose registration details or checkout tokens for a guessed email', async () => {
    const res = response();
    let error;
    await checkCompetitionRegistration(
      { params: { id: 'comp-1' }, body: { email: registration.email }, query: {} },
      res,
      (err) => { error = err; }
    );
    assert.equal(error, undefined);
    assert.deepEqual(res.body, { registered: false, registration: null });
  });

  it('requires the checkout token before retrying a registration', async () => {
    const res = response();
    let error;
    await retryRegistrationPayment(
      { params: { id: registration.id }, body: {} },
      res,
      (err) => { error = err; }
    );
    assert.equal(error?.statusCode, 403);
  });

  it('returns registration details only with the matching checkout token', async () => {
    const res = response();
    let error;
    await checkCompetitionRegistration(
      {
        params: { id: 'comp-1' },
        body: {
          email: registration.email,
          statusToken: createCheckoutStatusToken(registration.id, 'order-1'),
        },
        query: {},
      },
      res,
      (err) => { error = err; }
    );
    assert.equal(error, undefined);
    assert.equal(res.body.registered, true);
    assert.equal(res.body.registration.id, registration.id);
  });
});
