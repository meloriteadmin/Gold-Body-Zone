import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// 30 minutes total inactivity timeout
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
// Warning appears 2 minutes before logout (at 28 minutes of inactivity)
const DEFAULT_WARNING_MS = 2 * 60 * 1000;

export function useAdminInactivity({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_MS,
} = {}) {
  const { signOut, refreshAdminProfile } = useAuth();
  const navigate = useNavigate();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(warningMs / 1000)
  );

  const lastActivityRef = useRef(Date.now());
  const isWarningOpenRef = useRef(false);
  isWarningOpenRef.current = isWarningOpen;

  const performLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('[auth:admin] Inactivity auto-signout error:', err?.message);
    }
    navigate('/admin/login', {
      replace: true,
      state: {
        reason: 'SESSION_EXPIRED',
        message:
          'Your admin session has expired due to 30 minutes of inactivity. Please sign in again.',
      },
    });
  }, [signOut, navigate]);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWarningOpen(false);
    setSecondsRemaining(Math.ceil(warningMs / 1000));
    // Trigger lightweight profile refresh to keep Supabase token active
    refreshAdminProfile?.().catch(() => {});
  }, [warningMs, refreshAdminProfile]);

  useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      // If inactivity duration has already exceeded the timeout (e.g. laptop wake or background tab return),
      // late activity cannot revive the session — immediately logout.
      if (now - lastActivityRef.current >= timeoutMs) {
        performLogout();
        return;
      }

      lastActivityRef.current = now;
      // If warning modal is open and user interacts before timeout, extend session
      if (isWarningOpenRef.current) {
        setIsWarningOpen(false);
      }
    };

    // When returning to tab or waking from background suspension, check immediately
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const elapsed = now - lastActivityRef.current;
        if (elapsed >= timeoutMs) {
          performLogout();
        } else if (elapsed >= timeoutMs - warningMs) {
          setIsWarningOpen(true);
          setSecondsRemaining(Math.ceil((timeoutMs - elapsed) / 1000));
        }
      }
    };

    // Genuine user interactions to track
    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    // Throttle event listener updates to once every 2 seconds to avoid performance overhead
    let lastThrottled = 0;
    const throttledListener = () => {
      const now = Date.now();
      if (now - lastThrottled >= 2000) {
        lastThrottled = now;
        handleActivity();
      }
    };

    for (const evt of events) {
      window.addEventListener(evt, throttledListener, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, {
      passive: true,
    });

    // Interval ticker to evaluate inactivity
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remainingMs = timeoutMs - elapsed;

      if (remainingMs <= 0) {
        clearInterval(interval);
        performLogout();
        return;
      }

      if (remainingMs <= warningMs) {
        setIsWarningOpen(true);
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
      } else if (isWarningOpenRef.current) {
        setIsWarningOpen(false);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      for (const evt of events) {
        window.removeEventListener(evt, throttledListener);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeoutMs, warningMs, performLogout]);

  return {
    isWarningOpen,
    secondsRemaining,
    extendSession,
    performLogout,
  };
}
