import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { sendRegistrationConfirmationEmail } from './email.service.js';

const REGISTRATION_INCLUDE = {
  competition: {
    select: {
      id: true,
      slug: true,
      name: true,
      competitionType: true,
      eventDate: true,
      venue: true,
      registrationFee: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      gender: true,
      categoryType: true,
    },
  },
  payment: true,
};

function toPaisa(amount) {
  if (amount === undefined || amount === null || amount === '') {
    return null;
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

/**
 * Atomically settles a verified payment outcome from Cashfree (server API or signed webhook),
 * validates paid amounts against stored order amount, protects cancelled registrations,
 * prevents out-of-order PAID downgrades, and dispatches the confirmation email strictly once.
 */
export async function settleVerifiedPayment({
  orderId,
  nextStatus,
  cfPaymentId,
  paymentAmount,
  paymentTime,
  verificationSource,
}) {
  const prisma = getPrismaClient();
  const paymentRecord = await prisma.payment.findUnique({
    where: { cashfreeOrderId: String(orderId) },
    include: { registration: true },
  });

  if (!paymentRecord) {
    throw new HttpError(404, 'Matching payment order not found.');
  }

  // Never downgrade an already-verified PAID payment unless explicitly refunded.
  const effectiveStatus =
    paymentRecord.status === 'PAID' &&
    (nextStatus === 'PENDING' || nextStatus === 'FAILED')
      ? 'PAID'
      : nextStatus;

  if (nextStatus === 'PAID') {
    const expectedPaisa = toPaisa(paymentRecord.amount);
    const incomingPaisa = toPaisa(paymentAmount);

    if (
      expectedPaisa === null ||
      incomingPaisa === null ||
      incomingPaisa !== expectedPaisa
    ) {
      throw new HttpError(
        400,
        'Verified payment amount does not match expected order amount.'
      );
    }
  }

  const isDowngradeAttemptOnPaid =
    paymentRecord.status === 'PAID' &&
    (nextStatus === 'PENDING' || nextStatus === 'FAILED');

  const isCancelledRegistration =
    paymentRecord.registration?.registrationStatus === 'CANCELLED';

  const now = new Date();
  const parsedPaidAt =
    effectiveStatus === 'PAID'
      ? paymentTime
        ? new Date(paymentTime)
        : paymentRecord.paidAt || now
      : paymentRecord.paidAt;

  const [, updatedRegistration] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: effectiveStatus,
        ...(cfPaymentId && !isDowngradeAttemptOnPaid
          ? { cashfreePaymentId: String(cfPaymentId) }
          : {}),
        paidAt: parsedPaidAt,
        verifiedAt: now,
        verificationSource,
      },
    }),
    prisma.registration.update({
      where: { id: paymentRecord.registrationId },
      data: {
        paymentStatus: effectiveStatus,
        ...(effectiveStatus === 'PAID' && !isCancelledRegistration
          ? { registrationStatus: 'CONFIRMED' }
          : {}),
      },
      include: REGISTRATION_INCLUDE,
    }),
  ]);

  if (effectiveStatus === 'PAID' && !isCancelledRegistration) {
    await sendRegistrationConfirmationEmail(paymentRecord.registrationId);
  }

  return updatedRegistration;
}
