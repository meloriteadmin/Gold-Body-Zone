import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { env } from '../config/env.js';
import { apiClient } from '../lib/apiClient.js';
import { participantSupabase } from '../lib/supabase.js';

const ParticipantAuthContext = createContext(null);

// Singleton promise to coordinate concurrent token refresh requests
let participantRefreshPromise = null;

async function getValidParticipantSession() {
  if (!participantSupabase) return null;

  try {
    const { data, error } = await participantSupabase.auth.getSession();
    if (error || !data?.session) return null;

    const currentSession = data.session;
    const now = Math.floor(Date.now() / 1000);

    // If session is still valid for > 30s, use it directly without a network call
    if (currentSession.expires_at && currentSession.expires_at > now + 30) {
      return currentSession;
    }

    // Token is expired or expiring in <= 30 seconds.
    // Deduplicate concurrent refresh calls so only one refreshSession is executed.
    if (!participantRefreshPromise) {
      participantRefreshPromise = participantSupabase.auth
        .refreshSession()
        .then(({ data: refreshedData, error: refreshErr }) => {
          if (refreshErr || !refreshedData?.session) {
            return null;
          }
          return refreshedData.session;
        })
        .catch(() => null)
        .finally(() => {
          participantRefreshPromise = null;
        });
    }

    const refreshed = await participantRefreshPromise;
    return refreshed;
  } catch {
    return null;
  }
}

export function ParticipantAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [registrationsError, setRegistrationsError] = useState('');
  const pendingRefreshRef = useRef(null);

  const accessToken = session?.access_token || '';
  const isAuthenticated = Boolean(accessToken);

  const refreshRegistrations = useCallback(
    async (overrideToken) => {
      // If a refresh is already in progress and no specific override token was requested, return existing promise
      if (!overrideToken && pendingRefreshRef.current) {
        return pendingRefreshRef.current;
      }

      const run = async () => {
        let tokenToUse = overrideToken;
        if (!tokenToUse) {
          const validSession = await getValidParticipantSession();
          if (validSession) {
            tokenToUse = validSession.access_token;
            if (validSession.access_token !== session?.access_token) {
              setSession(validSession);
            }
          } else {
            tokenToUse = session?.access_token || '';
          }
        }

        if (!tokenToUse) {
          setRegistrations([]);
          setRegistrationsError('');
          return [];
        }

        setLoadingRegistrations(true);
        setRegistrationsError('');
        try {
          let data;
          try {
            data = await apiClient.fetchMyRegistrations(tokenToUse);
          } catch (apiErr) {
            // If the server rejected token as 401 Unauthorized, attempt an official Supabase session refresh
            if (apiErr?.status === 401 && participantSupabase) {
              try {
                const { data: refreshedData, error: refreshErr } =
                  await participantSupabase.auth.refreshSession();
                if (!refreshErr && refreshedData?.session?.access_token) {
                  setSession(refreshedData.session);
                  data = await apiClient.fetchMyRegistrations(
                    refreshedData.session.access_token
                  );
                } else {
                  setSession(null);
                  throw apiErr;
                }
              } catch {
                setSession(null);
                throw apiErr;
              }
            } else {
              throw apiErr;
            }
          }

          const list = data?.registrations || [];
          setRegistrations(list);
          return list;
        } catch (err) {
          setRegistrations([]);
          setRegistrationsError(
            err?.message || 'Unable to load your registration status.'
          );
          return [];
        } finally {
          setLoadingRegistrations(false);
        }
      };

      const task = run().finally(() => {
        if (pendingRefreshRef.current === task) {
          pendingRefreshRef.current = null;
        }
      });

      if (!overrideToken) {
        pendingRefreshRef.current = task;
      }

      return task;
    },
    [session]
  );

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!participantSupabase) {
        if (active) setLoading(false);
        return;
      }

      try {
        const { data } = await participantSupabase.auth.getSession();
        if (!active) return;

        let initialSession = data?.session || null;
        if (initialSession) {
          const now = Math.floor(Date.now() / 1000);
          // If stored session is expired or expiring within 30s, refresh before concluding bootstrap
          if (
            initialSession.expires_at &&
            initialSession.expires_at <= now + 30
          ) {
            try {
              const { data: refreshed, error: refreshErr } =
                await participantSupabase.auth.refreshSession();
              if (active) {
                if (!refreshErr && refreshed?.session) {
                  initialSession = refreshed.session;
                } else {
                  initialSession = null;
                }
              }
            } catch {
              if (active) initialSession = null;
            }
          }
        }

        if (active) {
          setSession(initialSession);
        }
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrap();

    if (!participantSupabase) {
      return () => {
        active = false;
      };
    }

    const { data: listener } = participantSupabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setRegistrations([]);
          setRegistrationsError('');
        } else {
          setSession(nextSession || null);
        }
      }
    );

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Only fetch registrations after initial authentication bootstrap has loaded
    if (loading) return;
    if (accessToken) {
      refreshRegistrations(accessToken);
    } else {
      setRegistrations([]);
    }
  }, [loading, accessToken, refreshRegistrations]);

  const signInWithPassword = useCallback(async (email, password) => {
    if (!participantSupabase) {
      throw new Error('Authentication service is not configured.');
    }
    const { data, error } = await participantSupabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data?.session) {
      throw new Error(error?.message || 'Unable to sign in.');
    }
    setSession(data.session);
    return data.session;
  }, []);

  const signUpWithPassword = useCallback(
    async (email, password, fullName = '') => {
      if (!participantSupabase) {
        throw new Error('Authentication service is not configured.');
      }
      const cleanEmail = email.trim().toLowerCase();
      const redirectTo = `${window.location.origin}/competitions`;
      const cleanFullName = fullName.trim();
      const { data, error } = await participantSupabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
          ...(cleanFullName ? { data: { full_name: cleanFullName } } : {}),
        },
      });
      if (error) {
        // Supabase returns 422 or "User already registered" when email is taken
        if (
          /already registered/i.test(error.message) ||
          /already exists/i.test(error.message) ||
          error.status === 422
        ) {
          throw new Error('Account already exists. Please log in.');
        }
        throw new Error(error.message || 'Unable to create account.');
      }

      // In Supabase Auth, when a user already exists (or email is not unique),
      // identities may be returned as an empty array [] without an explicit error.
      if (
        data?.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        throw new Error('Account already exists. Please log in.');
      }

      // When Confirm email is OFF, Supabase returns a session immediately.
      // If a session exists, update local state directly so the user is instantly authenticated.
      let activeSession = data?.session || null;

      // Fallback: If Supabase created the user but did not return the session in the response payload,
      // immediately log in with signInWithPassword so the participant is never left unauthenticated.
      if (!activeSession && data?.user) {
        try {
          const { data: signInData, error: signInErr } =
            await participantSupabase.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
          if (!signInErr && signInData?.session) {
            activeSession = signInData.session;
          }
        } catch {
          // preserve existing flow if signIn fails
        }
      }

      if (activeSession) {
        setSession(activeSession);
      }

      return {
        session: activeSession,
        user: data?.user || null,
        needsEmailConfirmation: false,
      };
    },
    []
  );

  const resetPasswordForEmail = useCallback(async (email) => {
    if (!participantSupabase) {
      throw new Error('Authentication service is not configured.');
    }
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await participantSupabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    );
    if (error) {
      throw new Error(error.message || 'Unable to send password reset email.');
    }
  }, []);

  const sendEmailOtp = useCallback(async (email) => {
    if (!participantSupabase) {
      throw new Error('Authentication service is not configured.');
    }
    const redirectTo = `${window.location.origin}/competitions`;
    const { error } = await participantSupabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) {
      throw new Error(error.message || 'Failed to send verification code.');
    }
  }, []);

  const verifyEmailOtp = useCallback(async (email, token) => {
    if (!participantSupabase) {
      throw new Error('Authentication service is not configured.');
    }
    const { data, error } = await participantSupabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error || !data?.session) {
      throw new Error(
        error?.message || 'Invalid or expired verification code.'
      );
    }
    setSession(data.session);
    return data.session;
  }, []);

  const signOut = useCallback(async () => {
    if (participantSupabase) {
      try {
        await participantSupabase.auth.signOut();
      } catch (err) {
        console.warn('[auth:participant] Error during signOut:', err?.message);
      }
    }
    setSession(null);
    setRegistrations([]);
    setRegistrationsError('');
  }, []);

  const registrationsByCompetitionId = useMemo(() => {
    const map = {};
    for (const reg of registrations) {
      if (reg?.competitionId) {
        map[reg.competitionId] = reg;
      }
    }
    return map;
  }, [registrations]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      accessToken,
      isAuthenticated,
      isSupabaseConfigured: env.isSupabaseConfigured,
      loading,
      registrations,
      registrationsByCompetitionId,
      loadingRegistrations,
      registrationsError,
      refreshRegistrations,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      sendEmailOtp,
      verifyEmailOtp,
      signOut,
    }),
    [
      session,
      accessToken,
      isAuthenticated,
      loading,
      registrations,
      registrationsByCompetitionId,
      loadingRegistrations,
      registrationsError,
      refreshRegistrations,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      sendEmailOtp,
      verifyEmailOtp,
      signOut,
    ]
  );

  return (
    <ParticipantAuthContext.Provider value={value}>
      {children}
    </ParticipantAuthContext.Provider>
  );
}

export function useParticipantAuth() {
  const ctx = useContext(ParticipantAuthContext);
  if (!ctx) {
    throw new Error(
      'useParticipantAuth must be used within a ParticipantAuthProvider.'
    );
  }
  return ctx;
}
