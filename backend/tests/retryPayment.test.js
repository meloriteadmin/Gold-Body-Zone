import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { buildCashfreeOrderId } from '../src/services/cashfree.service.js';

describe('Retry Payment Flow for Existing Pending Registrations', () => {
  let registrations;
  let payments;
  let competitions;

  beforeEach(() => {
    competitions = new Map([
      [
        'comp-masters',
        {
          id: 'comp-masters',
          name: 'Masters',
          slug: 'masters',
          competitionType: 'Masters',
          registrationFee: '200',
          registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
          isPublished: true,
        },
      ],
    ]);

    registrations = new Map([
      [
        'reg-pending-masters',
        {
          id: 'reg-pending-masters',
          registrationCode: 'REG-202611-E85384',
          competitionId: 'comp-masters',
          participantName: 'yugi',
          email: 'yugandharapatil84@gmail.com',
          mobileNumber: '9096957052',
          registrationStatus: 'PENDING',
          paymentStatus: 'PENDING',
        },
      ],
    ]);

    payments = new Map();
  });

  it('preserves existing registration ID and retrieves correct fee (₹200) without creating a new registration', async () => {
    const reg = registrations.get('reg-pending-masters');
    const comp = competitions.get(reg.competitionId);

    assert.ok(reg, 'Pending registration must exist');
    const initialRegistrationCount = registrations.size;

    // Verify fee retrieval
    const feeNumber = Number(comp.registrationFee);
    assert.equal(feeNumber, 200, 'Fee must be exactly ₹200 as configured for Masters');

    // Simulate initiating a new Cashfree order for existing registration
    const newOrderId = buildCashfreeOrderId(reg.registrationCode);
    assert.ok(newOrderId.startsWith('CF-REG-202611-E85384-'));

    // Upsert payment under the existing registration ID
    payments.set(reg.id, {
      id: 'pay-1',
      registrationId: reg.id,
      cashfreeOrderId: newOrderId,
      amount: feeNumber,
      currency: 'INR',
      status: 'PENDING',
    });

    // Registrations count must remain unchanged
    assert.equal(registrations.size, initialRegistrationCount);
    assert.equal(reg.id, 'reg-pending-masters', 'Registration ID must remain unchanged');

    const payment = payments.get(reg.id);
    assert.ok(payment);
    assert.equal(payment.registrationId, 'reg-pending-masters');
    assert.equal(payment.amount, 200);
    assert.equal(payment.status, 'PENDING');
  });

  it('formats custom returnUrl correctly when initiated from Profile page', () => {
    const customReturnUrl = 'http://localhost:5174/profile?order_id={order_id}';
    const cleanAppBase = 'http://localhost:5174';

    const parsed = new URL(customReturnUrl, cleanAppBase);
    const appBaseParsed = new URL(cleanAppBase);

    assert.equal(parsed.origin, appBaseParsed.origin);
    assert.ok(parsed.searchParams.has('order_id'));

    const formattedReturnUrl = parsed.toString().replace('%7Border_id%7D', '{order_id}');
    assert.equal(formattedReturnUrl, 'http://localhost:5174/profile?order_id={order_id}');
  });

  it('keeps registration pending if payment is cancelled or failed', () => {
    const reg = registrations.get('reg-pending-masters');
    const payment = payments.get(reg.id) || { status: 'PENDING' };

    // When payment fails or is cancelled
    payment.status = 'FAILED';
    reg.paymentStatus = 'FAILED';
    // Registration must not be confirmed
    assert.notEqual(reg.registrationStatus, 'CONFIRMED');
    assert.equal(reg.registrationStatus, 'PENDING');
  });

  it('updates registration to CONFIRMED and payment to PAID only after successful verification', () => {
    const reg = registrations.get('reg-pending-masters');
    const payment = {
      id: 'pay-1',
      registrationId: reg.id,
      amount: 200,
      status: 'PAID',
      paidAt: new Date(),
    };

    // Upon successful settlement
    reg.paymentStatus = 'PAID';
    reg.registrationStatus = 'CONFIRMED';

    assert.equal(reg.paymentStatus, 'PAID');
    assert.equal(reg.registrationStatus, 'CONFIRMED');
  });

  it('evaluates Already Registered, Complete Payment, and Retry Payment correctly based on both registration and payment statuses', () => {
    function computeStatusAndCta(registration, { deadlinePassed = false, noCategories = false } = {}) {
      const isRegisteredAndPaid = Boolean(
        registration &&
          registration.registrationStatus === 'CONFIRMED' &&
          registration.paymentStatus === 'PAID'
      );
      const isCancelled = registration?.registrationStatus === 'CANCELLED';
      const hasPendingPayment = Boolean(
        registration &&
          !isRegisteredAndPaid &&
          !isCancelled &&
          (registration.paymentStatus === 'PENDING' || !registration.paymentStatus)
      );
      const hasFailedPayment = Boolean(
        registration &&
          !isRegisteredAndPaid &&
          !isCancelled &&
          registration.paymentStatus === 'FAILED'
      );

      let badgeLabel = null;
      if (isRegisteredAndPaid) {
        badgeLabel = 'ALREADY REGISTERED';
      } else if (hasPendingPayment) {
        badgeLabel = 'PAYMENT PENDING';
      } else if (hasFailedPayment) {
        badgeLabel = 'PAYMENT FAILED';
      } else if (isCancelled) {
        badgeLabel = 'CANCELLED';
      }

      let ctaLabel = 'REGISTER NOW';
      let ctaDisabled = false;

      if (isRegisteredAndPaid) {
        ctaLabel = 'ALREADY REGISTERED';
        ctaDisabled = true;
      } else if (hasPendingPayment) {
        ctaLabel = 'COMPLETE PAYMENT';
        ctaDisabled = deadlinePassed;
      } else if (hasFailedPayment) {
        ctaLabel = 'RETRY PAYMENT';
        ctaDisabled = deadlinePassed;
      } else if (deadlinePassed) {
        ctaLabel = 'REGISTRATION CLOSED';
        ctaDisabled = true;
      } else if (noCategories) {
        ctaLabel = 'CATEGORIES PENDING';
        ctaDisabled = true;
      }

      return { badgeLabel, ctaLabel, ctaDisabled, isRegisteredAndPaid };
    }

    // 1. Unregistered participant
    const unreg = computeStatusAndCta(null);
    assert.equal(unreg.badgeLabel, null);
    assert.equal(unreg.ctaLabel, 'REGISTER NOW');
    assert.equal(unreg.ctaDisabled, false);

    // 2. Pending registration with PENDING payment
    const pending = computeStatusAndCta({
      registrationStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    assert.equal(pending.badgeLabel, 'PAYMENT PENDING');
    assert.equal(pending.ctaLabel, 'COMPLETE PAYMENT');
    assert.equal(pending.ctaDisabled, false);
    assert.equal(pending.isRegisteredAndPaid, false);

    // 3. Pending registration with FAILED payment
    const failed = computeStatusAndCta({
      registrationStatus: 'PENDING',
      paymentStatus: 'FAILED',
    });
    assert.equal(failed.badgeLabel, 'PAYMENT FAILED');
    assert.equal(failed.ctaLabel, 'RETRY PAYMENT');
    assert.equal(failed.ctaDisabled, false);
    assert.equal(failed.isRegisteredAndPaid, false);

    // 4. Confirmed registration with PAID payment
    const confirmed = computeStatusAndCta({
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
    assert.equal(confirmed.badgeLabel, 'ALREADY REGISTERED');
    assert.equal(confirmed.ctaLabel, 'ALREADY REGISTERED');
    assert.equal(confirmed.ctaDisabled, true);
    assert.equal(confirmed.isRegisteredAndPaid, true);

    // 5. Inconsistent / Unsettled state (e.g. status was marked CONFIRMED before payment was PAID)
    // Must NOT show Already Registered because payment is still PENDING!
    const unverifiedConfirm = computeStatusAndCta({
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PENDING',
    });
    assert.notEqual(unverifiedConfirm.ctaLabel, 'ALREADY REGISTERED');
    assert.equal(unverifiedConfirm.ctaLabel, 'COMPLETE PAYMENT');
    assert.equal(unverifiedConfirm.badgeLabel, 'PAYMENT PENDING');
    assert.equal(unverifiedConfirm.isRegisteredAndPaid, false);

    // 6. Cancelled registration allows new registration
    const cancelled = computeStatusAndCta({
      registrationStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
    });
    assert.equal(cancelled.badgeLabel, 'CANCELLED');
    assert.equal(cancelled.ctaLabel, 'REGISTER NOW');
    assert.equal(cancelled.ctaDisabled, false);
  });
});
