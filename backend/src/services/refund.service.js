import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { createCashfreeRefund, fetchCashfreeRefund, fetchCashfreeRefunds } from './cashfree.service.js';

const ACTIVE = ['REQUESTED', 'PENDING', 'SUCCESS'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || Math.abs(Math.round(number * 100) - number * 100) > 1e-6) {
    throw new HttpError(400, 'Refund amount must be a positive number with at most two decimal places.');
  }
  return Math.round(number * 100);
}

function providerStatus(value) {
  const status = String(value || '').toUpperCase();
  if (status === 'SUCCESS') return 'SUCCESS';
  if (status === 'FAILED' || status === 'CANCELLED') return 'FAILED';
  if (['PENDING', 'ACTIVE', 'ONHOLD', 'ON_HOLD'].includes(status)) return 'PENDING';
  throw new HttpError(400, 'Unknown Cashfree refund status; manual reconciliation required.');
}

export async function recordVerifiedRefund({ orderId, refundId, amount, status, providerRefundId }) {
  if (!refundId || !orderId) throw new HttpError(400, 'Refund identifier and order are required.');
  const refundPaisa = paisa(amount);
  const nextStatus = providerStatus(status);
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { cashfreeOrderId: orderId }, select: { id: true } });
  if (!payment) throw new HttpError(404, 'Matching payment order not found.');

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
    const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!currentPayment || !['PAID', 'REFUNDED'].includes(currentPayment.status)) {
      throw new HttpError(409, 'Refund cannot be applied before payment is verified.');
    }
    let refund = await tx.refund.findUnique({ where: { cashfreeRefundId: refundId } });
    if (refund && (refund.paymentId !== payment.id || paisa(refund.amount) !== refundPaisa)) {
      throw new HttpError(409, 'Cashfree refund does not match its recorded payment and amount.');
    }
    if (!refund) {
      if (refundPaisa > paisa(currentPayment.amount)) throw new HttpError(400, 'Refund exceeds the paid amount.');
      refund = await tx.refund.create({ data: {
        paymentId: payment.id, cashfreeRefundId: refundId,
        amount: refundPaisa / 100, status: 'REQUESTED',
        note: 'Recorded from verified Cashfree event',
      } });
    }
    const effective = refund.status === 'SUCCESS' ? 'SUCCESS' : nextStatus;
    refund = await tx.refund.update({ where: { id: refund.id }, data: {
      status: effective,
      ...(providerRefundId ? { providerRefundId: String(providerRefundId) } : {}),
      ...(effective === 'SUCCESS' ? { processedAt: refund.processedAt || new Date() } : {}),
    } });
    const all = await tx.refund.findMany({ where: { paymentId: payment.id } });
    const successful = all.filter((item) => item.status === 'SUCCESS')
      .reduce((sum, item) => sum + paisa(item.amount), 0);
    if (successful > paisa(currentPayment.amount)) {
      throw new HttpError(409, 'Verified refunds exceed the original paid amount.');
    }
    if (successful === paisa(currentPayment.amount) && currentPayment.status !== 'REFUNDED') {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await tx.registration.update({ where: { id: currentPayment.registrationId }, data: {
        paymentStatus: 'REFUNDED', registrationStatus: 'CANCELLED',
      } });
    }
    return refund;
  });
}

export async function requestAdminRefund({ registrationId, requestId, amount, note, adminId }) {
  if (!UUID.test(String(requestId || ''))) throw new HttpError(400, 'A UUID requestId is required for safe refund retries.');
  const refundPaisa = paisa(amount);
  const cleanNote = String(note || '').trim();
  if (cleanNote.length < 5 || cleanNote.length > 250) throw new HttpError(400, 'Refund reason must be 5–250 characters.');
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { registrationId }, select: { id: true } });
  if (!payment) throw new HttpError(404, 'Paid registration not found.');
  const refundId = `GBZ${requestId.replaceAll('-', '')}`;

  const reserved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { refunds: true } });
    const existing = current?.refunds.find((item) => item.id === requestId);
    if (existing) {
      if (paisa(existing.amount) !== refundPaisa || existing.note !== cleanNote) {
        throw new HttpError(409, 'Refund requestId was already used with different details.');
      }
      return { refund: existing, orderId: current.cashfreeOrderId };
    }
    if (!current?.cashfreeOrderId || current.status !== 'PAID') {
      throw new HttpError(409, 'Only a verified Cashfree payment can be refunded.');
    }
    const committed = current.refunds.filter((item) => ACTIVE.includes(item.status))
      .reduce((sum, item) => sum + paisa(item.amount), 0);
    if (committed + refundPaisa > paisa(current.amount)) {
      throw new HttpError(409, 'Refund exceeds the remaining paid amount.');
    }
    const refund = await tx.refund.create({ data: {
      id: requestId, paymentId: current.id, cashfreeRefundId: refundId,
      amount: refundPaisa / 100, note: cleanNote, requestedByAdminId: adminId,
    } });
    return { refund, orderId: current.cashfreeOrderId };
  });

  if (reserved.refund.status !== 'REQUESTED') return reserved.refund;
  let provider;
  try {
    provider = await createCashfreeRefund({
      orderId: reserved.orderId, refundId, amount: refundPaisa / 100,
      note: cleanNote, idempotencyKey: requestId,
    });
  } catch (error) {
    provider = await fetchCashfreeRefund(reserved.orderId, refundId).catch(() => null);
    if (!provider) throw error; // Keep REQUESTED for a same-key retry/reconciliation.
  }
  if (provider.refund_id !== refundId || paisa(provider.refund_amount) !== refundPaisa) {
    throw new HttpError(502, 'Cashfree refund response does not match the requested refund.');
  }
  return recordVerifiedRefund({
    orderId: reserved.orderId, refundId, amount: provider.refund_amount,
    status: provider.refund_status, providerRefundId: provider.cf_refund_id,
  });
}

export async function reconcileCashfreeRefunds(registrationId) {
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { registrationId } });
  if (!payment?.cashfreeOrderId) throw new HttpError(404, 'Cashfree payment not found.');
  const providerRefunds = await fetchCashfreeRefunds(payment.cashfreeOrderId);
  for (const item of providerRefunds) {
    await recordVerifiedRefund({
      orderId: payment.cashfreeOrderId, refundId: item.refund_id,
      amount: item.refund_amount, status: item.refund_status,
      providerRefundId: item.cf_refund_id,
    });
  }
  return prisma.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: 'asc' } });
}
