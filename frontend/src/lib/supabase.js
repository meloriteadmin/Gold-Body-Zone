import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Browser-safe Supabase client using only the public URL and anon key.
 * Used for admin authentication and administrative sessions.
 * Returns null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.
 */
export const supabase = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

/**
 * Safely removes Supabase auth items from browser localStorage to clean up
 * stale refresh tokens, invalid sessions, and conflicting tokens.
 */
export function purgeSupabaseAuthStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (
          key &&
          (key.startsWith('sb-') ||
            key.includes('supabase.auth') ||
            key.includes('auth-token'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          // Ignore
        }
      });
    }
  } catch {
    // Ignore storage access errors (e.g. strict privacy mode)
  }
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
    );
  }
  return supabase;
}
