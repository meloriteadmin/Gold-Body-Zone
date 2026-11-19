import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  Dumbbell,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { mapAuthError } from '../utils/authErrors.js';
import { apiClient } from '../lib/apiClient.js';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    loading: authLoading,
    authError,
    signIn,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  if (!authLoading && isAuthenticated) {
    const redirectTo = location.state?.from || '/admin';
    return <Navigate to={redirectTo} replace />;
  }

  const validate = () => {
    const errors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      const target = location.state?.from || '/admin';
      navigate(target, { replace: true });
    } catch (err) {
      setSubmitError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sessionExpiredNotice =
    location.state?.reason === 'SESSION_EXPIRED'
      ? location.state?.message ||
        'Your session has expired due to 30 minutes of inactivity. Please sign in again.'
      : '';

  const displayedError = submitError || authError;

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#101010] px-4 py-12 text-white">
      {/* Subtle Orange/Red Radial Glow */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_top,_rgba(241,90,36,0.22),_transparent_65%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-[#171717] p-8 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F15A24] to-[#E94B16] shadow-lg shadow-[#F15A24]/25">
              <Dumbbell className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">
                Administrator Access
              </p>
              <h1 className="font-display text-3xl font-extrabold tracking-wide text-white uppercase">
                Admin Sign In
              </h1>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#A1A1AA]">
            Sign in with your provisioned administrator credentials to manage
            competitions, categories, and publications.
          </p>

          {sessionExpiredNotice && !displayedError && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium text-amber-200"
            >
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{sessionExpiredNotice}</span>
            </div>
          )}

          {displayedError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs font-medium text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{displayedError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="admin-email"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder="admin@domain.com"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] py-3 pr-4 pl-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-red-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: '' }));
                    }
                  }}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] py-3 pr-11 pl-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-[#A1A1AA] transition-colors hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-red-400">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-3.5 text-sm font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>
          </form>
          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) { setResetMessage('Enter your admin email first.'); return; }
              try {
                const result = await apiClient.requestAdminPasswordReset(email.trim());
                setResetMessage(result.message);
              } catch (err) { setResetMessage(err.message); }
            }}
            className="mt-4 text-sm text-[#F15A24] hover:underline"
          >
            Forgot password?
          </button>
          {resetMessage && <p role="status" className="mt-2 text-sm text-zinc-300">{resetMessage}</p>}
        </div>
      </div>
    </div>
  );
}
