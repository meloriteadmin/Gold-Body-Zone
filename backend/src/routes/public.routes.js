import { Router } from 'express';
import {
  checkCompetitionRegistration,
  createPublicRegistration,
  getPublishedCompetition,
  listPublishedCompetitions,
  retryRegistrationPayment,
  submitContactEnquiry,
  verifyPublicOrderPayment,
} from '../controllers/public.controller.js';

const router = Router();

router.get('/competitions', listPublishedCompetitions);
router.get('/competitions/:id', getPublishedCompetition);
router.get('/competitions/:id/check-registration', checkCompetitionRegistration);
router.post('/competitions/:id/check-registration', checkCompetitionRegistration);
router.post('/registrations', createPublicRegistration);
router.post(
  '/registrations/:id/retry-payment',
  retryRegistrationPayment
);
router.post('/payments/verify-order', verifyPublicOrderPayment);
router.post('/contact/enquiry', submitContactEnquiry);

export default router;
