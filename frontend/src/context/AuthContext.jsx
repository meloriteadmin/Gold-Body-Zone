import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { env } from '../config/env.js';
import { apiClient } from '../lib/apiClient.js';
import { supabase } from '../lib/supabase.js';
import { mapAuthError } from '../utils/authErrors.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const verifyAdminSession = useCallback(async (nextSession) => {
    if (!nextSession?.access_token) {
      setSession(null);
      setAdminProfile(null);
      return null;
    }

    try {
      const data = await apiClient.fetchAdminProfile(nextSession.access_token);
      setSession(nextSession);
      setAdminProfile(data.profile);
      setAuthError('');
      return data.profile;
    } catch (err) {
      if (err.status === 403 && supabase) {
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
      } else {
        setSession(nextSession);
      }
      setAdminProfile(null);
      const friendlyMessage = mapAuthError(err, {
        operation: 'session_verify',
        fallbackMessage: 'Unable to verify admin privileges.',
      });
      setAuthError(friendlyMessage);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      if (!supabase) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data?.session) {
        await verifyAdminSession(data.session);
      }
      if (active) {
        setLoading(false);
      }
    }

    bootstrapSession();

    if (!supabase) {
      return () => {
        active = false;
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!active) return;
        if (event === 'SIGNED_OUT' || !nextSession) {
          setSession(null);
          setAdminProfile(null);
          return;
        }
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(nextSession);
        }
      }
    );

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [verifyAdminSession]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) {
      throw new Error(
        'Supabase Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
      );
    }

    setAuthError('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data?.session) {
      const friendlyMessage = mapAuthError(error, { operation: 'login' });
      setAuthError(friendlyMessage);
      throw new Error(friendlyMessage);
    }

    let verifiedProfile = null;
    try {
      verifiedProfile = await apiClient.fetchAdminProfile(
        data.session.access_token
      );
    } catch (err) {
      if (err.status === 403 && supabase) {
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
      } else {
        setSession(data.session);
      }
      setAdminProfile(null);
      const friendlyMessage = mapAuthError(err, {
        operation: 'session_verify',
        fallbackMessage: 'Unable to load admin profile.',
      });
      setAuthError(friendlyMessage);
      throw new Error(friendlyMessage);
    }

    setSession(data.session);
    setAdminProfile(verifiedProfile?.profile || null);
    return verifiedProfile?.profile || null;
  }, []);

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!supabase || !adminProfile?.email) {
        throw new Error('Authentication session is not active.');
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: adminProfile.email,
        password: currentPassword,
      });

      if (verifyError) {
        const friendlyMessage = mapAuthError(verifyError, {
          operation: 'change_password_verify',
          fallbackMessage: 'Current password is incorrect.',
        });
        throw new Error(friendlyMessage);
      }

      const { data: updateData, error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        const friendlyMessage = mapAuthError(updateError, {
          operation: 'change_password',
          fallbackMessage: 'Unable to update password. Please try again.',
        });
        throw new Error(friendlyMessage);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        setSession(sessionData.session);
      }

      return updateData?.user || null;
    },
    [adminProfile?.email]
  );

  const sendPasswordResetEmail = useCallback(async (email) => {
    if (!supabase) {
      throw new Error('Supabase Authentication is not configured.');
    }
    const targetEmail = (email || adminProfile?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      throw new Error('Registered email address is required.');
    }
    const redirectTo = `${window.location.origin}/admin/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo,
    });
    if (error) {
      const friendlyMessage = mapAuthError(error, {
        operation: 'password_reset',
        fallbackMessage: 'Unable to send password reset email. Please try again later.',
      });
      throw new Error(friendlyMessage);
    }
    return true;
  }, [adminProfile?.email]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setAdminProfile(null);
    setAuthError('');
  }, []);

  const refreshAdminProfile = useCallback(async () => {
    if (!session?.access_token) return null;
    const data = await apiClient.fetchAdminProfile(session.access_token);
    setAdminProfile(data.profile);
    return data.profile;
  }, [session?.access_token]);

  const value = useMemo(
    () => ({
      session,
      accessToken: session?.access_token || '',
      adminProfile,
      isAuthenticated: Boolean(session?.access_token && adminProfile),
      isSupabaseConfigured: env.isSupabaseConfigured,
      loading,
      authError,
      signIn,
      changePassword,
      sendPasswordResetEmail,
      signOut,
      refreshAdminProfile,
      setAdminProfile,
    }),
    [
      session,
      adminProfile,
      loading,
      authError,
      signIn,
      changePassword,
      sendPasswordResetEmail,
      signOut,
      refreshAdminProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
