import { Router } from 'express';
import {
  completeEmptyCategoryHandler,
  getCategoryJudgingDataHandler,
  getSessionProgressionHandler,
  identifyJudgeHandler,
  saveRankingsHandler,
  saveSemifinalistsHandler,
  saveWinnerTitlesHandler,
  validateSessionTokenHandler,
} from '../controllers/judgingPortal.controller.js';

const router = Router();

// Validate temporary judging session token and load competition & active judges
router.get('/session/:token', validateSessionTokenHandler);

// Identify judge for the session
router.post('/session/:token/identify', identifyJudgeHandler);

// Get synchronized category progression across judges
router.get('/session/:token/progression', getSessionProgressionHandler);

// Complete an empty category (0 eligible contestants)
router.post('/session/:token/complete-empty-category', completeEmptyCategoryHandler);

// Get participants and current judge selections/rankings for a category and group
router.get('/session/:token/category-data', getCategoryJudgingDataHandler);

// Save semifinalist selections
router.post('/session/:token/semifinalists', saveSemifinalistsHandler);

// Save rankings for selected semifinalists
router.post('/session/:token/rankings', saveRankingsHandler);

// Save winner titles and complete category evaluation
router.post('/session/:token/winners', saveWinnerTitlesHandler);

export default router;
