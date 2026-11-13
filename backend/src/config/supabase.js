import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Server-side Supabase admin client (uses service role key; never expose to frontend).
 * Returns null until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured.
 */
export const supabaseAdmin = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      'Supabase server client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.'
    );
  }
  return supabaseAdmin;
}
