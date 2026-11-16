import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyReturnedOrder } from '../../frontend/src/utils/paymentReturn.js';

describe('Cashfree Return URL Verification Flow', () => {
  it('returns confirmed state on PAID backend verification so loading spinner clears', async () => {
    let savedSession = null;
    let refreshed = false;

    const result = await verifyReturnedOrder({
      orderId: 'order_cf_100',
      readCheckoutSession: () => ({ statusToken: 'tok_initial' }),
      saveCheckoutSession: (data) => {
        savedSession = data;
      },
      verifyOrderPayment: async ({ orderId, statusToken }) => {
        assert.equal(orderId, 'order_cf_100');
        assert.equal(statusToken, 'tok_initial');
        return {
          verified: true,
          statusToken: 'tok_updated',
          registration: {
            id: 'reg-100',
            registrationCode: 'REG-202611-ABC123',
            paymentStatus: 'PAID',
            registrationStatus: 'CONFIRMED',
          },
        };
      },
      accessToken: 'jwt-1',
      refreshRegistrations: async () => {
        refreshed = true;
      },
    });

    assert.equal(result.status, 'confirmed');
    assert.equal(result.error, '');
    assert.equal(result.registration.paymentStatus, 'PAID');
    assert.equal(result.registration.registrationStatus, 'CONFIRMED');
    assert.equal(savedSession.statusToken, 'tok_updated');
    assert.equal(refreshed, true);
  });

  it('returns pending state when Cashfree order is still PENDING', async () => {
    const result = await verifyReturnedOrder({
      orderId: 'order_cf_pending',
      readCheckoutSession: () => ({ statusToken: 'tok_pending' }),
      saveCheckoutSession: () => {},
      verifyOrderPayment: async () => ({
        verified: false,
        statusToken: 'tok_pending',
        registration: {
          id: 'reg-101',
          paymentStatus: 'PENDING',
          registrationStatus: 'PENDING',
        },
      }),
    });

    assert.equal(result.status, 'pending');
    assert.equal(
      result.error,
      'Payment not completed. Please retry to confirm your registration.'
    );
    assert.equal(result.registration.paymentStatus, 'PENDING');
  });

  it('does NOT confirm registration if paymentStatus is not PAID', async () => {
    const result = await verifyReturnedOrder({
      orderId: 'order_cf_unpaid',
      readCheckoutSession: () => ({ statusToken: 'tok_unpaid' }),
      saveCheckoutSession: () => {},
      verifyOrderPayment: async () => ({
        verified: false,
        statusToken: 'tok_unpaid',
        registration: {
          id: 'reg-102',
          paymentStatus: 'PENDING',
          registrationStatus: 'CONFIRMED', // spoofed/anomalous status without payment
        },
      }),
    });

    assert.notEqual(result.status, 'confirmed');
    assert.equal(result.status, 'pending');
    assert.equal(
      result.error,
      'Payment not completed. Please retry to confirm your registration.'
    );
  });

  it('returns failed state when paymentStatus is FAILED', async () => {
    const result = await verifyReturnedOrder({
      orderId: 'order_cf_failed',
      readCheckoutSession: () => ({ statusToken: 'tok_failed' }),
      saveCheckoutSession: () => {},
      verifyOrderPayment: async () => ({
        verified: false,
        statusToken: 'tok_failed',
        registration: {
          id: 'reg-103',
          paymentStatus: 'FAILED',
          registrationStatus: 'PENDING',
        },
      }),
    });

    assert.equal(result.status, 'failed');
    assert.equal(
      result.error,
      'Payment not completed. Please retry to confirm your registration.'
    );
  });

  it('returns error state with useful message when verification fails or times out', async () => {
    const result = await verifyReturnedOrder({
      orderId: 'order_cf_timeout',
      readCheckoutSession: () => ({ statusToken: 'tok_timeout' }),
      saveCheckoutSession: () => {},
      verifyOrderPayment: async () => {
        throw new Error(
          'Verification request timed out. Please retry payment status check.'
        );
      },
    });

    assert.equal(result.status, 'error');
    assert.match(result.error, /timed out/i);
    assert.equal(result.registration, null);
  });
});
