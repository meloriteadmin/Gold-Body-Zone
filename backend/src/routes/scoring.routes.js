import { Router } from 'express';
import { judgeScoringStateHandler, judgeSubmitHandler } from '../controllers/liveScoring.controller.js';
import { InMemoryRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Keyed by the judge's private token (all judges at a venue may share one Wi-Fi IP).
const judgePollLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  keyGenerator: (req) => `scoring:${req.params.token || req.ip}`,
  message: 'Too many requests from this judge link. Please wait a moment.',
}).middleware();

router.get('/:token', judgePollLimiter, judgeScoringStateHandler);
router.post('/:token/submit', judgePollLimiter, judgeSubmitHandler);

export default router;
