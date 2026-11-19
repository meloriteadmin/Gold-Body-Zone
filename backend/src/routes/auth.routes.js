import { Router } from 'express';
import {
  adminLogin, adminLogout, adminSession, changeAdminPassword,
} from '../controllers/auth.controller.js';
import { authRateLimit } from '../middleware/authRateLimit.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();
router.post('/admin/login', authRateLimit, adminLogin);
router.get('/admin/session', requireAdmin, adminSession);
router.post('/admin/logout', requireAdmin, adminLogout);
router.post('/admin/change-password', requireAdmin, changeAdminPassword);
export default router;
