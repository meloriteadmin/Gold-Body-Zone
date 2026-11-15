import { Router } from 'express';
import {
  createPublicRegistration,
  getPublishedCompetition,
  listPublishedCompetitions,
  retryRegistrationPayment,
  verifyPublicOrderPayment,
} from '../controllers/public.controller.js';

const router = Router();

router.get('/competitions', listPublishedCompetitions);
router.get('/competitions/:id', getPublishedCompetition);
router.post('/registrations', createPublicRegistration);
router.post(
  '/registrations/:id/retry-payment',
  retryRegistrationPayment
);
router.post('/payments/verify-order', verifyPublicOrderPayment);

export default router;
