import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  ShieldCheck,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { formatDateTime } from '../utils/formatters.js';

export function AdminProfilePage() {
  const {
    accessToken,
    adminProfile,
    setAdminProfile,
    refreshAdminProfile,
    sendPasswordResetEmail,
  } = useAuth();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullNameDraft, setFullNameDraft] = useState(adminProfile?.fullName || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Password Reset Link state
  const [sendingReset, setSendingReset] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    refreshAdminProfile().catch(() => {});
  }, [refreshAdminProfile]);

  useEffect(() => {
    setFullNameDraft(adminProfile?.fullName || '');
  }, [adminProfile?.fullName]);

  const handleStartEditing = () => {
    setFullNameDraft(adminProfile?.fullName || '');
    setError('');
    setSuccessMessage('');
    setIsEditingProfile(true);
  };

  const handleCancelEditing = () => {
    setFullNameDraft(adminProfile?.fullName || '');
    setError('');
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setSaving(true);
    try {
      const res = await apiClient.updateAdminProfile(accessToken, {
        fullName: fullNameDraft.trim() || null,
      });
      setAdminProfile(res.profile);
      setSuccessMessage('Profile updated successfully.');
      setIsEditingProfile(false);
    } catch (err) {
      setError(err.message || 'Failed to update admin profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Profile image must be JPEG, PNG, or WebP.');
      return;
    }

    setError('');
    setSuccessMessage('');
    setUploadingAvatar(true);
    try {
      const res = await apiClient.uploadAdminAvatar(accessToken, file);
      setAdminProfile(res.profile);
      setSuccessMessage('Profile image updated.');
    } catch (err) {
      setError(err.message || 'Failed to upload profile image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(adminProfile?.email);
      setPasswordSuccess(
        `A secure password reset link has been sent to ${adminProfile?.email || 'your registered email'}. Please check your inbox.`
      );
    } catch (err) {
      setPasswordError(
        err.message || 'Unable to send password reset email. Please try again.'
      );
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6">
        <div className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              {adminProfile?.avatarUrl ? (
                <img
                  src={adminProfile.avatarUrl}
                  alt={adminProfile.fullName || 'Admin profile'}
                  className="h-20 w-20 rounded-2xl border border-white/15 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24] to-[#E94B16]">
                  <User className="h-9 w-9 text-white" />
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-wide text-white uppercase">
                {adminProfile?.fullName || 'Not Provided'}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-xs text-[#A1A1AA]">
                <Mail className="h-3.5 w-3.5 text-[#F15A24]" />
                {adminProfile?.email || 'Not Provided'}
              </p>

              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/50">
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F15A24]" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-[#F15A24]" />
                )}
                {uploadingAvatar ? 'Uploading...' : 'Update Profile Image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingAvatar}
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {!isEditingProfile && (
            <button
              type="button"
              onClick={handleStartEditing}
              className="inline-flex self-start sm:self-auto items-center gap-2 rounded-xl border border-white/15 bg-[#171717] px-4 py-2 text-xs font-bold tracking-wider text-white uppercase hover:border-[#F15A24] hover:text-[#F15A24]"
            >
              <Pencil className="h-3.5 w-3.5 text-[#F15A24]" />
              Edit Profile
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Profile Details — Read-Only Mode or Editing Form */}
        {!isEditingProfile ? (
          <div className="mt-6 rounded-xl border border-white/[0.06] bg-[#171717] p-5">
            <p className="text-[11px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Full Name
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {adminProfile?.fullName || 'Not Provided'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="admin-full-name"
                className="mb-1.5 block text-xs font-semibold tracking-wider text-zinc-300 uppercase"
              >
                Full Name
              </label>
              <input
                id="admin-full-name"
                type="text"
                autoFocus
                value={fullNameDraft}
                onChange={(e) => setFullNameDraft(e.target.value)}
                placeholder="Enter admin full name"
                className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleCancelEditing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-[#A1A1AA] hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Account Information */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4">
          <ShieldCheck className="h-5 w-5 text-[#F15A24]" />
          <h3 className="font-display text-xl font-bold tracking-wide text-white uppercase">
            Account Information
          </h3>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-[#171717] p-4">
            <dt className="font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Role
            </dt>
            <dd className="mt-1 text-sm font-bold text-white">
              {adminProfile?.role || 'Not Provided'}
            </dd>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#171717] p-4">
            <dt className="font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Email Address
            </dt>
            <dd className="mt-1 text-sm font-semibold text-white">
              {adminProfile?.email || 'Not Provided'}
            </dd>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#171717] p-4">
            <dt className="font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Account Created
            </dt>
            <dd className="mt-1 text-sm text-white">
              {formatDateTime(adminProfile?.createdAt)}
            </dd>
          </div>

        </dl>
      </section>

      {/* Change Password via Email Reset Link */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4">
          <KeyRound className="h-5 w-5 text-[#F15A24]" />
          <h3 className="font-display text-xl font-bold tracking-wide text-white uppercase">
            Change Password
          </h3>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[#A1A1AA]">
          To change your password securely, click below to receive a password reset link at your registered email address ({adminProfile?.email || 'registered email'}). The link opens a secure page where you can enter and confirm your new password.
        </p>

        {passwordError && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{passwordError}</span>
          </div>
        )}

        {passwordSuccess && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <div className="mt-5 flex justify-start">
          <button
            type="button"
            disabled={sendingReset}
            onClick={handleRequestPasswordReset}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:opacity-60"
          >
            {sendingReset ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {sendingReset ? 'Sending Reset Link...' : 'Send Password Reset Link'}
          </button>
        </div>
      </section>
    </div>
  );
}
