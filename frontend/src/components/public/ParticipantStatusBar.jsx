import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useParticipantAuth } from '../../context/ParticipantAuthContext.jsx';

export function ParticipantStatusBar() {
  const {
    user,
    isAuthenticated,
    isSupabaseConfigured,
    registrations,
    loadingRegistrations,
    refreshRegistrations,
    signInWithPassword,
    signUpWithPassword,
    sendEmailOtp,
    verifyEmailOtp,
    signOut,
  } = useParticipantAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('otp');
  const [passwordFlow, setPasswordFlow] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isSupabaseConfigured) {
    return null;
  }

  const handleOtpRequest = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await sendEmailOtp(email);
      setOtpSent(true);
      setMessage(
        'A verification link and 6-digit code were sent to your email.'
      );
    } catch (err) {
      setError(err.message || 'Unable to send verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await verifyEmailOtp(email, otpCode);
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      if (passwordFlow === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        const res = await signUpWithPassword(email, password);
        if (res.needsEmailConfirmation) {
          setMessage(
            'Account created. Click the verification link sent to your email before signing in.'
          );
        } else {
          setModalOpen(false);
        }
      } else {
        await signInWithPassword(email, password);
        setModalOpen(false);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#171717] px-5 py-4 sm:flex-row sm:items-center">
        {isAuthenticated ? (
          <>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-zinc-200">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#F15A24]" />
              <span>
                Verified Athlete:{' '}
                <strong className="text-white">{user?.email}</strong>
              </span>
              <span className="rounded-full border border-white/10 bg-[#222222] px-2.5 py-0.5 text-[11px] font-semibold text-[#A1A1AA]">
                {registrations.length}{' '}
                {registrations.length === 1 ? 'Entry' : 'Entries'} Synced
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refreshRegistrations()}
                disabled={loadingRegistrations}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#222222] px-3.5 py-1.5 text-[11px] font-bold tracking-wider text-white uppercase hover:border-[#F15A24]/60"
              >
                <RefreshCw
                  className={`h-3 w-3 ${loadingRegistrations ? 'animate-spin' : ''}`}
                />
                Sync Status
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#101010] px-3.5 py-1.5 text-[11px] font-bold tracking-wider text-[#A1A1AA] uppercase hover:border-red-500/50 hover:text-red-300"
              >
                <LogOut className="h-3 w-3" />
                Sign Out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-xs text-[#A1A1AA]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#F15A24]" />
              <span>
                Already registered? Verify your athlete email to view your{' '}
                <strong className="text-white">REGISTERED</strong> or{' '}
                <strong className="text-white">PAYMENT PENDING</strong> status
                directly on competition cards.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="shrink-0 rounded-full border border-[#F15A24]/60 bg-[#F15A24]/10 px-4 py-2 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase transition-colors hover:bg-[#F15A24] hover:text-white"
            >
              Verify Athlete Email
            </button>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <p className="text-[11px] font-bold tracking-widest text-[#F15A24] uppercase">
                  Participant Verification
                </p>
                <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
                  Sync Registration Status
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-[#A1A1AA] hover:bg-white/5 hover:text-white"
                aria-label="Close athlete verification modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-[#101010] p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('otp');
                  setError('');
                  setMessage('');
                }}
                className={`rounded-lg py-2 text-xs font-bold tracking-wider uppercase ${
                  authMode === 'otp'
                    ? 'bg-[#F15A24] text-white'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                Email Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('password');
                  setError('');
                  setMessage('');
                }}
                className={`rounded-lg py-2 text-xs font-bold tracking-wider uppercase ${
                  authMode === 'password'
                    ? 'bg-[#F15A24] text-white'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                Password
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{message}</span>
              </div>
            )}

            {authMode === 'otp' ? (
              <div className="mt-5 space-y-4">
                <form onSubmit={handleOtpRequest} className="space-y-3">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#A1A1AA]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Registered email address"
                      className="w-full rounded-xl border border-white/10 bg-[#222222] py-2.5 pr-4 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {otpSent ? 'Resend Email Code' : 'Send Email Code'}
                  </button>
                </form>

                {otpSent && (
                  <form
                    onSubmit={handleOtpVerify}
                    className="space-y-3 border-t border-white/[0.08] pt-4"
                  >
                    <input
                      type="text"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Enter 6-digit verification code"
                      className="w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 font-mono text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#F15A24] bg-[#F15A24]/15 px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase hover:bg-[#F15A24]"
                    >
                      {submitting && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Verify Code
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 6 chars)"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {passwordFlow === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
                <div className="pt-1 text-center text-xs text-[#A1A1AA]">
                  <button
                    type="button"
                    onClick={() =>
                      setPasswordFlow((p) =>
                        p === 'signin' ? 'signup' : 'signin'
                      )
                    }
                    className="font-semibold text-[#F15A24] hover:underline"
                  >
                    {passwordFlow === 'signin'
                      ? 'New participant? Create account'
                      : 'Already verified? Sign in'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
