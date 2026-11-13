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
  User,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../context/ParticipantAuthContext.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ParticipantSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    loading,
    signUpWithPassword,
  } = useParticipantAuth();

  const redirectTo = location.state?.from || '/competitions';
  const openRegistration = Boolean(location.state?.openRegistration);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanName = fullName.trim();
    if (cleanName.length < 2) {
      setError('Full Name must be at least 2 characters.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithPassword(email, password, cleanName);
      navigate(redirectTo, {
        replace: true,
        state: openRegistration ? { openRegistration: true } : undefined,
      });
    } catch (err) {
      setError(err?.message || 'Unable to create athlete account.');
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
              Athlete Registration
            </p>
            <h1 className="font-display mt-1 text-4xl font-extrabold tracking-wide text-white uppercase">
              Create Account
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
              Sign up to register for sanctioned bodybuilding, physique, and
              masters competitions.
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

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="signup-name"
                className="mb-1.5 block text-xs font-semibold text-zinc-200"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-4 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="mb-1.5 block text-xs font-semibold text-zinc-200"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                <input
                  id="signup-email"
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
              <label
                htmlFor="signup-password"
                className="mb-1.5 block text-xs font-semibold text-zinc-200"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
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

            <div>
              <label
                htmlFor="signup-confirm"
                className="mb-1.5 block text-xs font-semibold text-zinc-200"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                <input
                  id="signup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-11 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  aria-label={
                    showConfirm
                      ? 'Hide confirm password'
                      : 'Show confirm password'
                  }
                  className="absolute top-3 right-3 text-[#A1A1AA] hover:text-white"
                >
                  {showConfirm ? (
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
              {submitting ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-6 border-t border-white/[0.08] pt-5 text-center text-xs text-[#A1A1AA]">
            Already have an account?{' '}
            <Link
              to="/login"
              state={location.state}
              className="font-bold text-[#F15A24] hover:underline"
            >
              Login
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
