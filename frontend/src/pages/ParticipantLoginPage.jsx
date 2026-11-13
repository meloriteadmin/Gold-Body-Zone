import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Trophy,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../context/ParticipantAuthContext.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ParticipantLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    loading,
    signInWithPassword,
    resetPasswordForEmail,
  } = useParticipantAuth();

  const redirectTo = location.state?.from || '/competitions';
  const openRegistration = Boolean(location.state?.openRegistration);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(redirectTo, {
        replace: true,
        state: openRegistration ? { openRegistration: true } : undefined,
      });
    }
  }, [loading, isAuthenticated, navigate, redirectTo, openRegistration]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithPassword(email, password);
      navigate(redirectTo, {
        replace: true,
        state: openRegistration ? { openRegistration: true } : undefined,
      });
    } catch (err) {
      setError(err?.message || 'Unable to sign in. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter your registered email address to receive a reset link.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordForEmail(email);
      setNotice(
        'If an athlete account exists for that email, a password reset link has been sent.'
      );
    } catch (err) {
      setError(err?.message || 'Unable to send password reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="bg-[#101010] px-4 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-white/[0.08] bg-[#171717] p-7 shadow-2xl sm:p-9">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24] to-[#E94B16] shadow-lg shadow-[#F15A24]/25">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <p className="mt-4 text-[11px] font-bold tracking-[0.22em] text-[#F15A24] uppercase">
              Athlete Portal
            </p>
            <h1 className="font-display mt-1 text-4xl font-extrabold tracking-wide text-white uppercase">
              {forgotMode ? 'Reset Password' : 'Athlete Login'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
              {forgotMode
                ? 'Enter your email to receive a secure Supabase password reset link.'
                : 'Sign in to register for competitions, verify your status, and view My Registrations.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>{notice}</span>
            </div>
          )}

          {forgotMode ? (
            <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-reset-email"
                  className="mb-1.5 block text-xs font-semibold text-zinc-200"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                  <input
                    id="login-reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="athlete@example.com"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-4 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] text-xs font-extrabold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Reset Link
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setError('');
                  setNotice('');
                }}
                className="w-full text-center text-xs font-semibold text-[#A1A1AA] hover:text-white"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-semibold text-zinc-200"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="athlete@example.com"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-4 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-semibold text-zinc-200"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setError('');
                      setNotice('');
                    }}
                    className="text-[11px] font-semibold text-[#F15A24] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-11 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-3 right-3 text-[#A1A1AA] hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] text-xs font-extrabold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {submitting ? 'Signing In...' : 'Login'}
              </button>
            </form>
          )}

          <p className="mt-6 border-t border-white/[0.08] pt-5 text-center text-xs text-[#A1A1AA]">
            New athlete?{' '}
            <Link
              to="/signup"
              state={location.state}
              className="font-bold text-[#F15A24] hover:underline"
            >
              Create an Account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
