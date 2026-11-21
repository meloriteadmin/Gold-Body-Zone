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
import { requireAdmin, requireSuperAdmin } from '../middleware/requireAdmin.js';
import { getStorageUsage } from '../controllers/storage.controller.js';
import { createRefund, listRefunds, reconcileRefunds } from '../controllers/refund.controller.js';
import { requireNonessentialDatabaseHeadroom } from '../services/storageUsage.service.js';
import {
  adminGeneralLimiter,
  adminSensitiveLimiter,
} from '../middleware/rateLimiter.js';
import { uploadImageMiddleware } from '../middleware/upload.js';

const router = Router();

router.use(requireAdmin);
router.use(adminGeneralLimiter);

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

export default router;
