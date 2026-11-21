import { measureAllStorage } from '../services/storageUsage.service.js';

export async function getStorageUsage(_req, res, next) {
  try { res.json(await measureAllStorage()); }
  catch (err) { next(err); }
}
