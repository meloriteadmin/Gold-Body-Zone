import { env } from '../config/env.js';
import {
  mapCashfreeStatus,
  verifyCashfreeWebhookSignature,
} from '../services/cashfree.service.js';
import { settleVerifiedPayment } from '../services/paymentSettlement.service.js';
import { recordVerifiedRefund } from '../services/refund.service.js';
import { HttpError } from '../utils/httpError.js';

export async function handleCashfreeWebhook(req, res, next) {
  try {
    if (!env.cashfreeSecretKey) {
      throw new HttpError(
        503,
        'Cashfree webhook verification is not configured yet.'
      );
    }

    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    const isValid = verifyCashfreeWebhookSignature(
      req.rawBody,
      timestamp,
      signature
    );

    if (!isValid) {
      throw new HttpError(401, 'Invalid Cashfree webhook signature.');
    }

    const eventType = String(req.body?.type || '').trim().toUpperCase();
    const isTestWebhook =
      eventType === 'TEST' ||
      eventType === 'TEST_WEBHOOK' ||
      eventType === 'WEBHOOK_TEST' ||
      Boolean(req.body?.data?.test_object);

    if (isTestWebhook) {
      return res.status(200).json({ received: true, test: true });
    }

    const orderId =
      req.body?.data?.order?.order_id || req.body?.data?.refund?.order_id;
    const cfPaymentIdRaw =
      req.body?.data?.payment?.cf_payment_id ??
      req.body?.data?.refund?.cf_payment_id;
    const cfPaymentId = cfPaymentIdRaw ? String(cfPaymentIdRaw) : null;
    const paymentAmount =
      req.body?.data?.payment?.payment_amount ??
      req.body?.data?.order?.order_amount;
    const paymentTime = req.body?.data?.payment?.payment_time;
    const nextStatus = mapCashfreeStatus(
      req.body?.type,
      req.body?.data?.order?.order_status,
      req.body?.data?.refund?.refund_status ??
        req.body?.data?.payment?.payment_status
    );

    if (!orderId) {
      throw new HttpError(400, 'Missing Cashfree order_id in webhook payload.');
    }

    if (eventType.includes('REFUND')) {
      const refund = req.body?.data?.refund;
      if (!refund?.refund_id || refund.refund_amount === undefined || !refund.refund_status) {
        throw new HttpError(400, 'Incomplete Cashfree refund webhook.');
      }
      await recordVerifiedRefund({
        orderId, refundId: String(refund.refund_id), amount: refund.refund_amount,
        status: refund.refund_status, providerRefundId: refund.cf_refund_id,
      });
      return res.status(200).json({ received: true });
    }

    await settleVerifiedPayment({
      orderId,
      nextStatus,
      cfPaymentId,
      paymentAmount,
      refundAmount: req.body?.data?.refund?.refund_amount,
      paymentTime,
      verificationSource: 'CASHFREE_WEBHOOK',
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}
