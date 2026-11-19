import { Router } from 'express';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import imageRoutes from './image.routes.js';
import healthRoutes from './health.routes.js';
import publicRoutes from './public.routes.js';
import webhookRoutes from './webhook.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/images', imageRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
