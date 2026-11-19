import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';

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
 * prevents out-of-order PAID downgrades.
 */
export async function settleVerifiedPayment({
  orderId,
  nextStatus,
  cfPaymentId,
  paymentAmount,
  refundAmount,
  paymentTime,
  verificationSource,
}) {
  const prisma = getPrismaClient();
  const initialRecord = await prisma.payment.findUnique({
    where: { cashfreeOrderId: String(orderId) },
    select: { id: true },
  });

  if (!initialRecord) {
    throw new HttpError(404, 'Matching payment order not found.');
  }

  // Lock and reread the row so concurrent webhook and status checks cannot
  // calculate a downgrade from the same stale PENDING state.
  const updatedRegistration = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${initialRecord.id} FOR UPDATE`;
    const paymentRecord = await tx.payment.findUnique({
      where: { id: initialRecord.id }, include: { registration: true },
    });
    if (!paymentRecord) throw new HttpError(404, 'Matching payment order not found.');

  // Never downgrade an already-verified PAID payment unless explicitly refunded.
  const effectiveStatus =
    paymentRecord.status === 'REFUNDED'
      ? 'REFUNDED'
      : paymentRecord.status === 'PAID' &&
          (nextStatus === 'PENDING' || nextStatus === 'FAILED')
        ? 'PAID'
        : nextStatus;

  if (nextStatus === 'REFUNDED' && paymentRecord.status !== 'REFUNDED') {
    if (paymentRecord.status !== 'PAID' || toPaisa(refundAmount) !== toPaisa(paymentRecord.amount)) {
      throw new HttpError(400, 'Refund amount or payment state does not match the original paid order.');
    }
    const successfulRefunds = await tx.refund.findMany({
      where: { paymentId: paymentRecord.id, status: 'SUCCESS' },
      select: { amount: true },
    });
    const ledgerTotal = successfulRefunds.reduce((sum, refund) => sum + toPaisa(refund.amount), 0);
    if (ledgerTotal !== toPaisa(paymentRecord.amount)) {
      throw new HttpError(409, 'Reconcile verified Cashfree refund records before closing this payment.');
    }
  }

  if (effectiveStatus === 'PAID' && nextStatus === 'PAID') {
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
    (paymentRecord.status === 'PAID' &&
      (nextStatus === 'PENDING' || nextStatus === 'FAILED')) ||
    (paymentRecord.status === 'REFUNDED' && nextStatus !== 'REFUNDED');

  const isCancelledRegistration =
    paymentRecord.registration?.registrationStatus === 'CANCELLED';

  const now = new Date();
  const parsedPaidAt =
    effectiveStatus === 'PAID'
      ? paymentTime
        ? new Date(paymentTime)
        : paymentRecord.paidAt || now
      : paymentRecord.paidAt;

  await tx.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: effectiveStatus,
        ...(cfPaymentId && !isDowngradeAttemptOnPaid
          ? { cashfreePaymentId: String(cfPaymentId) }
          : {}),
        paidAt: parsedPaidAt,
        verifiedAt: paymentRecord.status === 'REFUNDED' ? paymentRecord.verifiedAt : now,
        verificationSource: paymentRecord.status === 'REFUNDED'
          ? paymentRecord.verificationSource
          : verificationSource,
      },
    });
  const updatedRegistration = await tx.registration.update({
      where: { id: paymentRecord.registrationId },
      data: {
        paymentStatus: effectiveStatus,
        ...(effectiveStatus === 'PAID' && !isCancelledRegistration
          ? { registrationStatus: 'CONFIRMED' }
          : effectiveStatus === 'REFUNDED'
            ? { registrationStatus: 'CANCELLED' }
            : {}),
      },
      include: REGISTRATION_INCLUDE,
    });
  return updatedRegistration;
  });

  return updatedRegistration;
}
