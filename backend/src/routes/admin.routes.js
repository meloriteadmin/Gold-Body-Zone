import { Router } from 'express';
import {
  addCategory,
  addCategoryGroup,
  createCompetition,
  deleteCategory,
  deleteCategoryGroup,
  deleteCompetition,
  getAdminProfile,
  getCompetition,
  getDashboardOverview,
  listCompetitions,
  setCompetitionPublishStatus,
  setRegistrationClosingStatus,
  toggleCompetitionCompletion,
  updateAdminProfile,
  updateCategory,
  updateCategoryGroup,
  updateCompetition,
  uploadAdminAvatar,
  uploadCompetitionPoster,
  removeCompetitionPoster,
  listCompetitionPhotos,
  uploadCompetitionPhotos,
  deleteCompetitionPhoto,
} from '../controllers/admin.controller.js';
import {
  createManualRegistration,
  exportRegistrations,
  getRegistrationById,
  listRegistrations,
  resendRegistrationConfirmationEmail,
  updateRegistrationStatus,
  verifyRegistrationPayment,
} from '../controllers/adminRegistrations.controller.js';
import {
  assignTrunkNumbersHandler,
  editTrunkNumberHandler,
  exportTrunkNumbersExcelHandler,
  getCompetitionTrunkNumbersHandler,
} from '../controllers/adminTrunkNumbers.controller.js';
import {
  assignJudgeToCompetitionHandler,
  createJudgeHandler,
  deleteJudgeHandler,
  getActiveSessionHandler,
  getCompetitionJudgingWorkspaceHandler,
  getJudgeHandler,
  getSessionProgressHandler,
  getSessionResultsHandler,
  listEligibleCompetitionsHandler,
  listJudgesHandler,
  removeJudgeFromCompetitionHandler,
  revokeJudgingSessionHandler,
  startJudgingSessionHandler,
  updateJudgeHandler,
} from '../controllers/adminJudges.controller.js';
import {
  cancelHeatHandler,
  categoryBoardHandler,
  closeHeatHandler,
  getLiveDashboardHandler,
  listLiveCompetitionsHandler,
  nextTrunkNumberHandler,
  openHeatHandler,
  regenerateJudgeLinkHandler,
  resetLiveScoringHandler,
  searchParticipantsHandler,
  setRound1QualifiersHandler,
  setTitleAwardsHandler,
  unlockJudgeSubmissionHandler,
  updateParticipantHandler,
} from '../controllers/liveScoring.controller.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/requireAdmin.js';
import { getStorageUsage } from '../controllers/storage.controller.js';
import { createRefund, listRefunds, reconcileRefunds } from '../controllers/refund.controller.js';
import { requireNonessentialDatabaseHeadroom } from '../services/storageUsage.service.js';
import {
  adminGeneralLimiter,
  adminSensitiveLimiter,
  InMemoryRateLimiter,
} from '../middleware/rateLimiter.js';
import { uploadImageMiddleware } from '../middleware/upload.js';

const router = Router();

// Event-day live tools (scoring dashboard polling, participant verification desk)
// need a much higher request budget than ordinary admin browsing.
const adminLiveLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: 'Too many live scoring requests. Please wait a few seconds.',
}).middleware();

router.use(requireAdmin);
router.use((req, res, next) =>
  req.path.startsWith('/live/')
    ? adminLiveLimiter(req, res, next)
    : adminGeneralLimiter(req, res, next)
);

router.get('/dashboard', getDashboardOverview);
router.get('/storage', getStorageUsage);

router.get('/profile', getAdminProfile);
router.patch('/profile', adminSensitiveLimiter, updateAdminProfile);
router.post(
  '/profile/avatar',
  adminSensitiveLimiter,
  requireNonessentialDatabaseHeadroom,
  uploadImageMiddleware.single('avatar'),
  uploadAdminAvatar
);

router.get('/competitions', listCompetitions);
router.get('/competitions/:id', getCompetition);
router.post('/competitions', requireNonessentialDatabaseHeadroom, createCompetition);
router.patch('/competitions/:id', updateCompetition);
router.delete('/competitions/:id', adminSensitiveLimiter, deleteCompetition);
router.patch(
  '/competitions/:id/publish',
  adminSensitiveLimiter,
  setCompetitionPublishStatus
);
router.patch(
  '/competitions/:id/registration-status',
  adminSensitiveLimiter,
  setRegistrationClosingStatus
);
router.patch(
  '/competitions/:id/complete',
  adminSensitiveLimiter,
  toggleCompetitionCompletion
);
router.post(
  '/competitions/:id/poster',
  requireNonessentialDatabaseHeadroom,
  uploadImageMiddleware.single('poster'),
  uploadCompetitionPoster
);
router.delete(
  '/competitions/:id/poster',
  adminSensitiveLimiter,
  removeCompetitionPoster
);

router.get('/competitions/:id/photos', listCompetitionPhotos);
router.post(
  '/competitions/:id/photos',
  requireNonessentialDatabaseHeadroom,
  uploadImageMiddleware.array('photos', 20),
  uploadCompetitionPhotos
);
router.delete(
  '/competitions/:id/photos/:photoId',
  adminSensitiveLimiter,
  deleteCompetitionPhoto
);

router.get(
  '/competitions/:id/trunk-numbers',
  getCompetitionTrunkNumbersHandler
);
router.post(
  '/competitions/:id/trunk-numbers/assign',
  adminSensitiveLimiter,
  assignTrunkNumbersHandler
);
router.patch(
  '/competitions/:id/registrations/:registrationId/trunk-number',
  adminSensitiveLimiter,
  editTrunkNumberHandler
);
router.get(
  '/competitions/:id/trunk-numbers/export',
  exportTrunkNumbersExcelHandler
);

router.post('/competitions/:id/categories', requireNonessentialDatabaseHeadroom, addCategory);
router.patch(
  '/competitions/:id/categories/:categoryId',
  updateCategory
);
router.delete(
  '/competitions/:id/categories/:categoryId',
  adminSensitiveLimiter,
  deleteCategory
);

router.post(
  '/competitions/:id/categories/:categoryId/groups',
  requireNonessentialDatabaseHeadroom,
  addCategoryGroup
);
router.patch(
  '/competitions/:id/categories/:categoryId/groups/:groupId',
  updateCategoryGroup
);
router.delete(
  '/competitions/:id/categories/:categoryId/groups/:groupId',
  adminSensitiveLimiter,
  deleteCategoryGroup
);

router.get('/registrations', listRegistrations);
router.get('/registrations/export', exportRegistrations);
router.post(
  '/registrations/manual',
  adminSensitiveLimiter,
  createManualRegistration
);
router.get('/registrations/:id', getRegistrationById);
router.patch('/registrations/:id/status', updateRegistrationStatus);
router.post(
  '/registrations/:id/verify-payment',
  verifyRegistrationPayment
);
router.post(
  '/registrations/:id/resend-confirmation-email',
  adminSensitiveLimiter,
  resendRegistrationConfirmationEmail
);
router.get('/registrations/:id/refunds', listRefunds);
router.post('/registrations/:id/refunds', adminSensitiveLimiter, requireSuperAdmin, createRefund);
router.post('/registrations/:id/refunds/reconcile', adminSensitiveLimiter, requireSuperAdmin, reconcileRefunds);

// Judge Management Routes
router.get('/judges', listJudgesHandler);
router.post('/judges', adminSensitiveLimiter, createJudgeHandler);
router.get('/judges/:id', getJudgeHandler);
router.put('/judges/:id', adminSensitiveLimiter, updateJudgeHandler);
router.delete('/judges/:id', adminSensitiveLimiter, deleteJudgeHandler);

// Competition-Specific Judges
router.post('/competitions/:id/judges/assign', adminSensitiveLimiter, assignJudgeToCompetitionHandler);
router.delete('/competitions/:id/judges/:judgeId', adminSensitiveLimiter, removeJudgeFromCompetitionHandler);

// Judging Session Management Routes
router.get('/judging/competitions', listEligibleCompetitionsHandler);
router.get('/judging/competitions/:id/workspace', getCompetitionJudgingWorkspaceHandler);
router.post('/judging/sessions', adminSensitiveLimiter, startJudgingSessionHandler);
router.post('/judging/sessions/:id/revoke', adminSensitiveLimiter, revokeJudgingSessionHandler);
router.get('/judging/sessions/competition/:competitionId', getActiveSessionHandler);
router.get('/judging/sessions/:id/progress', getSessionProgressHandler);
router.get('/judging/sessions/:id/results', getSessionResultsHandler);

// Live round-based scoring (Form 1 / Form 2 / Form 3)
router.get('/live/competitions', listLiveCompetitionsHandler);
router.get('/live/competitions/:id', getLiveDashboardHandler);
router.post('/live/competitions/:id/heats', openHeatHandler);
router.post('/live/heats/:heatId/close', closeHeatHandler);
router.post('/live/heats/:heatId/cancel', cancelHeatHandler);
router.post('/live/heats/:heatId/judges/:judgeId/unlock', unlockJudgeSubmissionHandler);
router.put('/live/competitions/:id/qualifiers', setRound1QualifiersHandler);
router.put('/live/competitions/:id/titles', setTitleAwardsHandler);
router.post('/live/competitions/:id/reset', resetLiveScoringHandler);
router.post('/live/competitions/:id/judges/:judgeId/regenerate-link', regenerateJudgeLinkHandler);

// Participant verification & category board
router.get('/live/competitions/:id/participants/search', searchParticipantsHandler);
router.get('/live/competitions/:id/category-board', categoryBoardHandler);
router.get('/live/competitions/:id/next-trunk-number', nextTrunkNumberHandler);
router.patch('/live/registrations/:registrationId', updateParticipantHandler);

export default router;
