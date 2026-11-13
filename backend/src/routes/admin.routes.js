import { Router } from 'express';
import {
  addCategory,
  createCompetition,
  deleteCategory,
  deleteCompetition,
  getAdminProfile,
  getDashboardOverview,
  listCompetitions,
  setCompetitionPublishStatus,
  updateAdminProfile,
  updateCategory,
  updateCompetition,
  uploadAdminAvatar,
  uploadCompetitionPoster,
  removeCompetitionPoster,
} from '../controllers/admin.controller.js';
import {
  getRegistrationById,
  listRegistrations,
  resendRegistrationConfirmationEmail,
  updateRegistrationStatus,
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
router.post('/competitions', createCompetition);
router.patch('/competitions/:id', updateCompetition);
router.delete('/competitions/:id', adminSensitiveLimiter, deleteCompetition);
router.patch(
  '/competitions/:id/publish',
  adminSensitiveLimiter,
  setCompetitionPublishStatus
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

router.get('/registrations', listRegistrations);
router.get('/registrations/:id', getRegistrationById);
router.patch('/registrations/:id/status', updateRegistrationStatus);
router.post(
  '/registrations/:id/resend-confirmation-email',
  adminSensitiveLimiter,
  resendRegistrationConfirmationEmail
);

export default router;
