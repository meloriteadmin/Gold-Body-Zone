import { useEffect, useState } from 'react';
import { AlertCircle, Gavel, Loader2, X } from 'lucide-react';

export function JudgeFormModal({
  isOpen,
  judge,
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (judge) {
      setName(judge.name || '');
      setPhone(judge.phone || '');
      setEmail(judge.email || '');
      setCity(judge.city || '');
      setIsActive(judge.isActive !== undefined ? judge.isActive : true);
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setCity('');
      setIsActive(true);
    }
    setError('');
  }, [judge, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Judge name is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        isActive,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save judge.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24]">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                {judge ? 'Edit Judge Profile' : 'Add New Judge'}
              </h3>
              <p className="text-xs text-zinc-400">
                Configure judge details for competition scoring.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300">
              Full Name <span className="text-[#F15A24]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vikram Shinde"
              className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Enter the judge's full name. Judges are assigned sequential identifiers on panels.
            </p>
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-300">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. judge@example.com"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>
          </div>

          {/* Judge's City / District */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300">
              Judge&apos;s City / District
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Pune, Maharashtra"
              className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Judge&apos;s home city or district.
            </p>
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="judge-active-checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#222222] text-[#F15A24] focus:ring-0"
            />
            <label
              htmlFor="judge-active-checkbox"
              className="text-xs font-medium text-zinc-300 cursor-pointer"
            >
              Active for upcoming judging sessions
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{judge ? 'Update Judge' : 'Create Judge'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
