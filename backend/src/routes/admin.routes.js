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
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  adminGeneralLimiter,
  adminSensitiveLimiter,
} from '../middleware/rateLimiter.js';
import { uploadImageMiddleware } from '../middleware/upload.js';

const router = Router();

router.use(requireAdmin);
router.use(adminGeneralLimiter);

router.get('/dashboard', getDashboardOverview);

router.get('/profile', getAdminProfile);
router.patch('/profile', adminSensitiveLimiter, updateAdminProfile);
router.post(
  '/profile/avatar',
  adminSensitiveLimiter,
  uploadImageMiddleware.single('avatar'),
  uploadAdminAvatar
);

router.get('/competitions', listCompetitions);
router.get('/competitions/:id', getCompetition);
router.post('/competitions', createCompetition);
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
  uploadImageMiddleware.array('photos', 20),
  uploadCompetitionPhotos
);
router.delete(
  '/competitions/:id/photos/:photoId',
  adminSensitiveLimiter,
  deleteCompetitionPhoto
);

router.post('/competitions/:id/categories', addCategory);
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

export default router;
