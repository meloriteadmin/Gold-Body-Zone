import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function uploadImageToBucket(file, folder = 'posters') {
  if (!env.supabaseStorageBucket) {
    throw new HttpError(
      503,
      'SUPABASE_STORAGE_BUCKET is not configured in backend/.env.'
    );
  }

  const supabase = getSupabaseAdmin();
  const ext =
    MIME_TO_EXT[file.mimetype] ||
    path.extname(file.originalname || '').toLowerCase() ||
    '.jpg';
  const filePath = `${folder}/${crypto.randomUUID()}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(env.supabaseStorageBucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new HttpError(
      500,
      `Failed to upload image to storage: ${uploadError.message}`
    );
  }

  const { data: publicData } = supabase.storage
    .from(env.supabaseStorageBucket)
    .getPublicUrl(filePath);

  return {
    storagePath: filePath,
    publicUrl: publicData?.publicUrl || null,
  };
}

export async function deleteImageFromBucket(storagePath) {
  if (!storagePath || !env.supabaseStorageBucket || !env.isSupabaseConfigured) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    await supabase.storage
      .from(env.supabaseStorageBucket)
      .remove([storagePath]);
  } catch {
    // Non-fatal cleanup error
  }
}
