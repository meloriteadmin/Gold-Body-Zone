import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { mapAuthError } from '../utils/authErrors.js';

export function AdminResetPasswordPage() {
  const navigate = useNavigate();

  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkRecovery() {
      if (!supabase) {
        if (active) setCheckingSession(false);
        return;
      }

      // Check current session or listen for PASSWORD_RECOVERY event
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data?.session?.user) {
        setHasRecoverySession(true);
        setAdminEmail(data.session.user.email || '');
      }

      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!active) return;
          if (
            event === 'PASSWORD_RECOVERY' ||
            (event === 'SIGNED_IN' && session?.user)
          ) {
            setHasRecoverySession(true);
            if (session?.user?.email) {
              setAdminEmail(session.user.email);
            }
          }
        }
      );

      setCheckingSession(false);
      return () => {
        listener?.subscription?.unsubscribe();
      };
    }

    checkRecovery();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (!supabase) {
        throw new Error('Supabase client is not configured.');
      }

      const emailToVerify = adminEmail;
      if (!emailToVerify) {
        throw new Error(
          'Could not identify your registered admin email. Please open the recovery link directly from your email.'
        );
      }

      // 1. Verify current password securely using the existing admin email and Supabase sign-in
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: emailToVerify,
        password: currentPassword,
      });

      if (verifyErr) {
        throw new Error(
          mapAuthError(verifyErr, {
            operation: 'change_password_verify',
            fallbackMessage: 'Current password is incorrect.',
          })
        );
      }

      // 2. Update password using Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        throw new Error(
          mapAuthError(updateErr, {
            operation: 'change_password',
            fallbackMessage: 'Unable to update password. Please try again.',
          })
        );
      }

      // Clear sensitive password values from component state
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(
        mapAuthError(err, {
          operation: 'change_password',
          fallbackMessage:
            'Unable to update password. Your recovery link may have expired.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101010] p-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24] to-[#E94B16] shadow-lg shadow-[#F15A24]/25">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <p className="mt-4 text-[11px] font-bold tracking-[0.22em] text-[#F15A24] uppercase">
            GOLD BODY ZONE Admin
          </p>
          <h1 className="font-display mt-1 text-3xl font-extrabold tracking-wide uppercase">
            Change Password
          </h1>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            {adminEmail
              ? `Updating password for ${adminEmail}`
              : 'Enter your current password and your new password below.'}
          </p>
        </div>

        {checkingSession ? (
          <div className="mt-8 flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
          </div>
        ) : success ? (
          <div className="mt-6 space-y-5 text-center">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-200">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span>Password updated successfully via Supabase Auth.</span>
              </div>
              <p className="mt-2 text-[11px] font-normal text-emerald-300/80">
                Your admin credentials have been updated securely. Your active
                session remains preserved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin', { replace: true })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-3 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 hover:brightness-110"
            >
              Go to Admin Portal
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : !hasRecoverySession ? (
          <div className="mt-6 space-y-5 text-center">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs font-medium text-amber-200">
              <AlertCircle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              <span>
                No active password recovery session found. The link may have
                expired or is invalid. Please request a new link from your Admin
                Profile.
              </span>
            </div>
            <Link
              to="/admin/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F15A24] hover:underline"
            >
              Back to Admin Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label
                htmlFor="current-admin-pw"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                Current Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  id="current-admin-pw"
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] py-2.5 pr-11 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-[#A1A1AA] hover:text-white"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label
                htmlFor="new-admin-pw"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  id="new-admin-pw"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] py-2.5 pr-11 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-[#A1A1AA] hover:text-white"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                htmlFor="confirm-admin-pw"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  id="confirm-admin-pw"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] py-2.5 pr-11 pl-10 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-[#A1A1AA] hover:text-white"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
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
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {submitting ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
