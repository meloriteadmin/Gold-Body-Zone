import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { apiClient } from '../lib/apiClient.js';

export function AdminResetPasswordPage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState({}, '', '/admin/reset-password');
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (password.length < 12 || password !== confirm) {
      setError('Use at least 12 characters and make sure both passwords match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.resetAdminPassword(token, password);
      setPassword('');
      setConfirm('');
      setSuccess(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101010] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-8 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F15A24]"><KeyRound /></div>
        <h1 className="font-display mt-5 text-3xl font-extrabold uppercase">Reset admin password</h1>
        {success ? <p className="mt-5 text-emerald-300">Password updated. Your other sessions have been signed out.</p>
          : token ? (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-sm">New password
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#222] p-3" required />
              </label>
              <label className="block text-sm">Confirm password
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#222] p-3" required />
              </label>
              {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
              <button disabled={busy} className="flex w-full items-center justify-center rounded-xl bg-[#F15A24] p-3 font-bold disabled:opacity-50">{busy ? <Loader2 className="animate-spin" /> : 'Save password'}</button>
            </form>
          ) : <p className="mt-5 text-zinc-300">This reset link is missing or expired. Request a new link from the admin login page.</p>}
        <Link to="/admin/login" className="mt-5 inline-block text-sm text-[#F15A24]">Back to admin login</Link>
      </section>
    </main>
  );
}
