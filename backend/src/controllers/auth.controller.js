import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { sendLocalAuthEmail } from '../services/email.service.js';
import {
  clearAdminSessionCookie, createAdminSession, createOneTimeToken,
  hashOneTimeToken, hashPassword, normalizeEmail, requireSameOrigin, verifyPassword,
} from '../services/localAuth.service.js';
import { HttpError } from '../utils/httpError.js';

const invalidLogin = () => new HttpError(401, 'Invalid email or password.');
const resetResponse = { message: 'If an active account exists, reset instructions have been sent.' };

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

export async function requestAdminPasswordReset(req, res, next) {
  try {
    requireSameOrigin(req);
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      throw new HttpError(400, 'Enter a valid email address.');
    }
    const prisma = getPrismaClient();
    const profile = await prisma.adminProfile.findUnique({ where: { email } });
    if (!profile?.isActive || !profile.passwordHash) return res.json(resetResponse);
    const token = createOneTimeToken();
    await prisma.adminProfile.update({
      where: { id: profile.id },
      data: { resetTokenHash: hashOneTimeToken(token), resetExpiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    // URL fragments are not sent to Nginx or logged in HTTP request lines.
    const url = `${env.publicAppUrl.replace(/\/$/, '')}/admin/reset-password#token=${encodeURIComponent(token)}`;
    await sendLocalAuthEmail({
      to: profile.email,
      subject: 'Reset your Gold Body Zone admin password',
      text: `Use this link within 30 minutes: ${url}`,
      html: `<p>Use this link within 30 minutes to reset your admin password.</p><p><a href="${url}">Reset password</a></p>`,
    });
    res.json(resetResponse);
  } catch (err) { next(err); }
}

export async function resetAdminPassword(req, res, next) {
  try {
    requireSameOrigin(req);
    const token = String(req.body?.token || '');
    const password = req.body?.password;
    validatePassword(password);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(400, 'Reset link is invalid or expired.');
    const prisma = getPrismaClient();
    const profile = await prisma.adminProfile.findFirst({
      where: { resetTokenHash: hashOneTimeToken(token), resetExpiresAt: { gt: new Date() }, isActive: true },
    });
    if (!profile) throw new HttpError(400, 'Reset link is invalid or expired.');
    await prisma.$transaction([
      prisma.adminProfile.update({
        where: { id: profile.id },
        data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), resetTokenHash: null, resetExpiresAt: null },
      }),
      prisma.adminSession.deleteMany({ where: { adminId: profile.id } }),
    ]);
    res.json({ message: 'Password reset. Sign in again.' });
  } catch (err) { next(err); }
}
