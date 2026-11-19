import { findAdminSession, requireSameOrigin } from '../services/localAuth.service.js';
import { HttpError } from '../utils/httpError.js';

export async function requireAdmin(req, _res, next) {
  try {
    const session = await findAdminSession(req);
    if (!session) throw new HttpError(401, 'Admin session is missing or expired.');
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.admin.role)) {
      throw new HttpError(403, 'Admin privileges are required.');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) requireSameOrigin(req);
    req.admin = session.admin;
    req.adminSession = session;
    next();
  } catch (err) { next(err); }
}

export function requireSuperAdmin(req, _res, next) {
  if (req.admin?.role !== 'SUPER_ADMIN') return next(new HttpError(403, 'Super administrator privileges are required.'));
  next();
}
