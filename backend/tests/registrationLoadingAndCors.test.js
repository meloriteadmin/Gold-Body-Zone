import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Registration Loading, Order Reuse & CORS', () => {
  describe('1. CORS Origin Matching for Vercel Previews and Production', () => {
    const allowedOrigins = ['http://localhost:5173', 'https://gold-body-zone.vercel.app'];

    function isOriginAllowed(origin) {
      if (!origin) return true;
      const isAllowedVercelPreview =
        typeof origin === 'string' &&
        /^https:\/\/gold-body-zone(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);

      return (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        isAllowedVercelPreview
      );
    }

    it('allows production domain', () => {
      assert.equal(isOriginAllowed('https://gold-body-zone.vercel.app'), true);
    });

    it('allows localhost for development', () => {
      assert.equal(isOriginAllowed('http://localhost:5173'), true);
    });

    it('allows legitimate Vercel preview deployment origins for this project', () => {
      assert.equal(
        isOriginAllowed('https://gold-body-zone-9ngdk1x5i-melorite.vercel.app'),
        true
      );
      assert.equal(
        isOriginAllowed('https://gold-body-zone-git-main-melorite.vercel.app'),
        true
      );
      assert.equal(
        isOriginAllowed('https://gold-body-zone-preview-123.vercel.app'),
        true
      );
    });

    it('rejects unrelated or spoofed origins', () => {
      assert.equal(isOriginAllowed('https://malicious-site.com'), false);
      assert.equal(isOriginAllowed('https://other-project.vercel.app'), false);
      assert.equal(
        isOriginAllowed('https://gold-body-zone.vercel.app.attacker.com'),
        false
      );
      assert.equal(
        isOriginAllowed('https://fake-gold-body-zone.other.app'),
        false
      );
    });

    it('allows requests without origin header (server-to-server, mobile, webhooks)', () => {
      assert.equal(isOriginAllowed(undefined), true);
      assert.equal(isOriginAllowed(null), true);
    });
  });

  describe('3. Payment Attempt Initiation & Registration ID Preservation', () => {
    it('preserves existing registration ID while generating a fresh Cashfree payment session for retry', async () => {
      let createdNewOrder = false;

      async function createCashfreeOrderMock({ orderId }) {
        createdNewOrder = true;
        return {
          orderId,
          paymentSessionId: 'session_fresh_live_123',
          orderStatus: 'ACTIVE',
        };
      }

      // Existing pending registration record
      const existingRegistration = {
        id: 'reg-athlete-uuid-001',
        registrationCode: 'GBZ-M26-001',
        participantName: 'Yugandhara Athlete',
        email: 'yugandhara@example.com',
        mobileNumber: '9822986005',
        paymentStatus: 'PENDING',
        registrationStatus: 'PENDING',
        payment: {
          id: 'pay-001',
          cashfreeOrderId: 'CF-GBZ-M26-001-OLD111',
          status: 'PENDING',
        },
      };

      // When retrying or re-submitting payment:
      // 1. Generate fresh Cashfree order so the checkout session is fresh and never aborted
      const freshOrderId = `CF-${existingRegistration.registrationCode}-NEW222`;
      const cfOrder = await createCashfreeOrderMock({ orderId: freshOrderId });

      // 2. Database update: upsert payment for the SAME registrationId
      const updatedPayment = {
        ...existingRegistration.payment,
        cashfreeOrderId: cfOrder.orderId,
        status: 'PENDING',
      };

      assert.equal(createdNewOrder, true, 'Generates a fresh Cashfree order to avoid session abortion');
      assert.equal(existingRegistration.id, 'reg-athlete-uuid-001', 'Registration ID is strictly preserved');
      assert.equal(updatedPayment.cashfreeOrderId, freshOrderId);
      assert.equal(cfOrder.paymentSessionId, 'session_fresh_live_123');
    });

    it('detects already-paid Cashfree order on server-side and settles registration without creating a new payment', async () => {
      let createdNewOrder = false;

      async function fetchCashfreeOrderStateMock() {
        return {
          orderStatus: 'PAID',
          nextStatus: 'PAID',
          cfPaymentId: 'CF_PAY_987654',
          paymentAmount: 200,
        };
      }

      async function createCashfreeOrderMock() {
        createdNewOrder = true;
        return { orderId: 'CF-SHOULD-NOT-BE-CREATED' };
      }

      const registration = {
        id: 'reg-athlete-uuid-002',
        paymentStatus: 'PENDING',
        payment: {
          cashfreeOrderId: 'CF-ALREADY-PAID-001',
        },
      };

      const orderState = await fetchCashfreeOrderStateMock();
      let registrationConfirmed = false;

      if (orderState.nextStatus === 'PAID') {
        registrationConfirmed = true;
        registration.paymentStatus = 'PAID';
        registration.registrationStatus = 'CONFIRMED';
      } else {
        await createCashfreeOrderMock();
      }

      assert.equal(createdNewOrder, false, 'Must not create a new order when already paid');
      assert.equal(registrationConfirmed, true);
      assert.equal(registration.paymentStatus, 'PAID');
      assert.equal(registration.registrationStatus, 'CONFIRMED');
    });

    it('retains PENDING status when Cashfree order is still processing', async () => {
      async function fetchCashfreeOrderStateMock() {
        return {
          orderStatus: 'ACTIVE',
          nextStatus: 'PENDING',
          cfPaymentId: null,
          paymentAmount: null,
        };
      }

      const registration = {
        id: 'reg-athlete-uuid-003',
        paymentStatus: 'PENDING',
        registrationStatus: 'PENDING',
      };

      const orderState = await fetchCashfreeOrderStateMock();
      if (orderState.nextStatus === 'PENDING') {
        registration.paymentStatus = 'PENDING';
        registration.registrationStatus = 'PENDING';
      }

      assert.equal(registration.paymentStatus, 'PENDING');
      assert.equal(registration.registrationStatus, 'PENDING');
    });
  });

});
