import { getPrismaClient } from '../config/prisma.js';
import {
  clearAdminSessionCookie, createAdminSession,
  hashPassword, normalizeEmail, requireSameOrigin, verifyPassword,
} from '../services/localAuth.service.js';
import { HttpError } from '../utils/httpError.js';

const invalidLogin = () => new HttpError(401, 'Invalid email or password.');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new HttpError(400, 'Password must be between 12 and 256 characters.');
  }
}

export async function adminLogin(req, res, next) {
  try {
    requireSameOrigin(req);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || email.length > 160 || typeof password !== 'string') throw invalidLogin();
    const prisma = getPrismaClient();
    const profile = await prisma.adminProfile.findUnique({ where: { email } });
    if (!profile?.isActive || !(await verifyPassword(password, profile.passwordHash))) throw invalidLogin();
    await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const expiresAt = await createAdminSession(res, profile.id);
    res.json({ profile: { id: profile.id, email: profile.email, role: profile.role, fullName: profile.fullName }, expiresAt });
  } catch (err) { next(err); }
}

export async function adminSession(req, res) {
  res.json({ profile: req.admin, expiresAt: req.adminSession.expiresAt });
}

export async function adminLogout(req, res, next) {
  try {
    await getPrismaClient().adminSession.delete({ where: { id: req.adminSession.id } });
    clearAdminSessionCookie(res);
    res.json({ message: 'Signed out.' });
  } catch (err) { next(err); }
}

export async function changeAdminPassword(req, res, next) {
  try {
    if (!(await verifyPassword(req.body?.currentPassword, req.admin.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    const password = req.body?.newPassword;
    validatePassword(password);
    const prisma = getPrismaClient();
    await prisma.$transaction([
      prisma.adminProfile.update({ where: { id: req.admin.id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } }),
      prisma.adminSession.deleteMany({ where: { adminId: req.admin.id } }),
    ]);
    clearAdminSessionCookie(res);
    res.json({ message: 'Password changed. Sign in again.' });
  } catch (err) { next(err); }
}
