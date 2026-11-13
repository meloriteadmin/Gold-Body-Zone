import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Browser-safe Supabase client using only the public URL and anon key.
 * Returns null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.
 */
export const supabase = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey)
  : null;

/**
 * Isolated participant Supabase Auth client with its own storageKey so
 * participant sessions on /my-registrations never collide with admin sessions.
 */
export const participantSupabase = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storageKey: 'gym-comp-participant-auth',
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
    );
  }
  return supabase;
}
