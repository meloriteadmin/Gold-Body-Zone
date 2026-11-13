import { Router } from 'express';
import {
  createPublicRegistration,
  getPublishedCompetition,
  listMyRegistrations,
  listPublishedCompetitions,
  retryRegistrationPayment,
  verifyPublicOrderPayment,
} from '../controllers/public.controller.js';
import {
  optionalParticipant,
  requireParticipant,
} from '../middleware/requireParticipant.js';

const router = Router();

router.get('/competitions', listPublishedCompetitions);
router.get('/competitions/:id', getPublishedCompetition);
router.post('/registrations', optionalParticipant, createPublicRegistration);
router.post(
  '/registrations/:id/retry-payment',
  optionalParticipant,
  retryRegistrationPayment
);
router.post('/payments/verify-order', optionalParticipant, verifyPublicOrderPayment);
router.get('/my-registrations', requireParticipant, listMyRegistrations);

export default router;
