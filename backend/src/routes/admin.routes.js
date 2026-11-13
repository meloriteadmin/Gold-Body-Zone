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
import { uploadImageMiddleware } from '../middleware/upload.js';

const router = Router();

router.use(requireAdmin);

router.get('/dashboard', getDashboardOverview);

router.get('/profile', getAdminProfile);
router.patch('/profile', updateAdminProfile);
router.post(
  '/profile/avatar',
  uploadImageMiddleware.single('avatar'),
  uploadAdminAvatar
);

router.get('/competitions', listCompetitions);
router.post('/competitions', createCompetition);
router.patch('/competitions/:id', updateCompetition);
router.delete('/competitions/:id', deleteCompetition);
router.patch('/competitions/:id/publish', setCompetitionPublishStatus);
router.post(
  '/competitions/:id/poster',
  uploadImageMiddleware.single('poster'),
  uploadCompetitionPoster
);
router.delete('/competitions/:id/poster', removeCompetitionPoster);

router.post('/competitions/:id/categories', addCategory);
router.patch('/competitions/:id/categories/:categoryId', updateCategory);
router.delete('/competitions/:id/categories/:categoryId', deleteCategory);

router.get('/registrations', listRegistrations);
router.get('/registrations/:id', getRegistrationById);
router.patch('/registrations/:id/status', updateRegistrationStatus);
router.post(
  '/registrations/:id/resend-confirmation-email',
  resendRegistrationConfirmationEmail
);

export default router;
