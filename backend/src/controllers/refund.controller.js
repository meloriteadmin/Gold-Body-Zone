import { getPrismaClient } from '../config/prisma.js';
import { requestAdminRefund, reconcileCashfreeRefunds } from '../services/refund.service.js';

export async function createRefund(req, res, next) {
  try {
    const refund = await requestAdminRefund({
      registrationId: req.params.id, requestId: req.body?.requestId,
      amount: req.body?.amount, note: req.body?.note, adminId: req.admin.id,
    });
    res.status(202).json({ refund });
  } catch (error) { next(error); }
}

export async function listRefunds(req, res, next) {
  try {
    const payment = await getPrismaClient().payment.findUnique({
      where: { registrationId: req.params.id },
      include: { refunds: { orderBy: { createdAt: 'asc' } } },
    });
    res.json({ refunds: payment?.refunds || [] });
  } catch (error) { next(error); }
}

export async function reconcileRefunds(req, res, next) {
  try {
    const refunds = await reconcileCashfreeRefunds(req.params.id);
    res.json({ refunds });
  } catch (error) { next(error); }
}
