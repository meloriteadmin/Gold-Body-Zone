import { Router } from 'express';
import { handleCashfreeWebhook } from '../controllers/webhook.controller.js';

const router = Router();

router.post('/cashfree', handleCashfreeWebhook);

export default router;
