import { Router } from 'express';
import { getPrismaClient } from '../config/prisma.js';
import { findAdminSession } from '../services/localAuth.service.js';
import { imageFileInfo } from '../services/storage.service.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

router.get('/:folder/:name', async (req, res, next) => {
  try {
    const storagePath = `${req.params.folder}/${req.params.name}`;
    const { filename, mime } = await imageFileInfo(storagePath);
    const prisma = getPrismaClient();
    const session = await findAdminSession(req);
    let publicImage = false;
    if (req.params.folder === 'posters') {
      const competition = await prisma.competition.findFirst({
        where: { posterStoragePath: storagePath }, select: { isPublished: true },
      });
      publicImage = Boolean(competition?.isPublished);
    } else if (req.params.folder === 'event-photos') {
      const photo = await prisma.competitionPhoto.findFirst({
        where: { photoStoragePath: storagePath }, include: { competition: { select: { isPublished: true } } },
      });
      publicImage = Boolean(photo?.competition?.isPublished);
    } else if (req.params.folder === 'avatars' && session) {
      const avatar = await prisma.adminProfile.findFirst({ where: { avatarStoragePath: storagePath }, select: { id: true } });
      if (!avatar) throw new HttpError(404, 'Image not found.');
    }
    if (!publicImage && !session) throw new HttpError(404, 'Image not found.');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', publicImage ? 'public, max-age=3600' : 'private, no-store');
    res.sendFile(filename);
  } catch (err) { next(err); }
});

export default router;
