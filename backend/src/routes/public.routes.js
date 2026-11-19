import { Router } from 'express';
import {
  checkCompetitionRegistration,
  createPublicRegistration,
  getPublishedCompetition,
  listPublishedCompetitions,
  retryRegistrationPayment,
  verifyPublicOrderPayment,
} from '../controllers/public.controller.js';
import { publicMutationLimiter, publicLookupLimiter } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

function requireStagingRegistrationWindow(_req, _res, next) {
  if (env.stagingMode && !env.stagingRegistrationsEnabled) {
    return next(new HttpError(503, 'Staging registration tests are currently closed.'));
  }
  next();
}

router.get('/competitions', listPublishedCompetitions);
router.get('/competitions/:id', getPublishedCompetition);
router.post('/competitions/:id/check-registration', publicLookupLimiter, checkCompetitionRegistration);
router.post('/registrations', publicMutationLimiter, requireStagingRegistrationWindow, createPublicRegistration);
router.post(
  '/registrations/:id/retry-payment',
  publicMutationLimiter,
  requireStagingRegistrationWindow,
  retryRegistrationPayment
);
router.post('/payments/verify-order', publicMutationLimiter, verifyPublicOrderPayment);

export default router;
