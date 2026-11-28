import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Hash, Loader2, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
import { apiClient } from '../../lib/apiClient.js';
import { suggestCategoryForMeasurements } from './CategoryBreakdownPanel.jsx';

const inputCls =
  'h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none disabled:opacity-60';
const labelCls = 'mb-1 block text-[10px] font-bold tracking-wider text-zinc-400 uppercase';

function toForm(p) {
  return {
    participantName: p?.participantName || '',
    email: p?.email || '',
    mobileNumber: p?.mobileNumber || '',
    gender: p?.gender || 'MALE',
    age: p?.age ?? '',
    heightCm: p?.heightCm ?? '',
    weightKg: p?.weightKg ?? '',
    district: p?.district || '',
    representingType: p?.representingType || 'GYM',
    gymName: p?.gymName || '',
    categoryId: p?.categoryId || '',
    groupId: p?.groupId || '',
    trunkNumber: p?.trunkNumber ?? '',
    registrationStatus: p?.registrationStatus || 'PENDING',
    verified: Boolean(p?.verifiedAt),
  };
}

/**
 * Edit every participant detail (admin only). Saves to the single registration
 * record, so changes appear everywhere: registrations, exports, category lists,
 * trunk numbers and live judging.
 */
export function ParticipantEditModal({ participant, categories = [], competitionId, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(participant));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);

  useEffect(() => {
    setForm(toForm(participant));
  }, [participant]);

  useEffect(() => {
    setError('');
    setSaved(false);
  }, [participant?.id]);

  const original = useMemo(() => toForm(participant), [participant]);
  const selectedCategory = categories.find((c) => c.id === form.categoryId) || null;
  const groups = selectedCategory?.groups || [];

  const suggestion = useMemo(
    () => suggestCategoryForMeasurements(categories, form.weightKg, form.heightCm),
    [categories, form.weightKg, form.heightCm]
  );

  if (!participant) return null;

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e?.target ? e.target.value : e;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'categoryId') {
        const cat = categories.find((c) => c.id === value);
        if (!cat?.groups?.some((g) => g.id === prev.groupId)) next.groupId = '';
      }
      return next;
    });
    setSaved(false);
  };

  const changedPayload = () => {
    const payload = {};
    Object.keys(form).forEach((key) => {
      const a = form[key];
      const b = original[key];
      if (String(a ?? '') !== String(b ?? '')) payload[key] = a;
    });
    if (payload.trunkNumber !== undefined) {
      payload.trunkNumber = payload.trunkNumber === '' ? null : Number(payload.trunkNumber);
    }
    if (payload.age !== undefined) payload.age = Number(payload.age);
    if (payload.heightCm !== undefined) payload.heightCm = payload.heightCm === '' ? null : Number(payload.heightCm);
    if (payload.weightKg !== undefined) payload.weightKg = payload.weightKg === '' ? null : Number(payload.weightKg);
    if (payload.categoryId !== undefined && payload.groupId === undefined) payload.groupId = form.groupId || '';
    return payload;
  };

  const handleSave = async (extra = {}) => {
    const payload = { ...changedPayload(), ...extra };
    if (Object.keys(payload).length === 0) {
      setSaved(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.updateParticipant(participant.id, payload);
      setSaved(true);
      onSaved?.(res.registration);
    } catch (err) {
      setError(err.message || 'Failed to save participant.');
    } finally {
      setSaving(false);
    }
  };

  const fillNextTrunk = async () => {
    if (!competitionId) return;
    setLoadingNext(true);
    try {
      const res = await apiClient.fetchNextTrunkNumber(competitionId);
      setForm((prev) => ({ ...prev, trunkNumber: res.nextTrunkNumber }));
      setSaved(false);
    } catch (err) {
      setError(err.message || 'Could not get next trunk number.');
    } finally {
      setLoadingNext(false);
    }
  };

  const hasChanges = Object.keys(changedPayload()).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Verify &amp; Edit Participant</p>
            <h3 className="font-display truncate text-xl font-extrabold text-white uppercase">{participant.participantName}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-zinc-400">
              <span className="font-mono text-[#F15A24]">{participant.registrationCode}</span>
              <span>Payment: <strong className={participant.paymentStatus === 'PAID' ? 'text-emerald-400' : 'text-amber-400'}>{participant.paymentStatus}</strong>{participant.paymentMethod ? ` (${participant.paymentMethod})` : ''}</span>
              {participant.aadhaarLast4 && <span>Aadhaar: XXXX-XXXX-{participant.aadhaarLast4}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Trunk number & verification — most used at the desk */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#F15A24]/30 bg-[#F15A24]/5 p-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Trunk Number (assigned by admin)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#F15A24]" />
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={form.trunkNumber}
                    onChange={set('trunkNumber')}
                    placeholder="Not assigned"
                    className={`${inputCls} pl-9 font-display text-lg font-bold`}
                  />
                </div>
                <button
                  type="button"
                  onClick={fillNextTrunk}
                  disabled={loadingNext}
                  className="shrink-0 rounded-xl border border-white/10 bg-[#222222] px-3 text-[11px] font-bold text-zinc-200 hover:border-[#F15A24] hover:text-white disabled:opacity-50"
                >
                  {loadingNext ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Next free'}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">Unique across the entire competition—even in different categories. Leave empty to remove.</p>
            </div>
            <div className="flex flex-col justify-center">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-[#222222] px-3 py-2.5">
                <input type="checkbox" checked={form.verified} onChange={set('verified')} className="h-5 w-5 accent-[#3b82f6]" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <ShieldCheck className="h-4 w-4 text-blue-400" /> Details verified at venue
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {participant.verifiedAt ? `Verified on ${new Date(participant.verifiedAt).toLocaleString('en-IN')}` : 'Tick after checking ID, weight & category'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.categoryId} onChange={set('categoryId')} className={inputCls}>
                {!categories.some((c) => c.id === form.categoryId) && <option value={form.categoryId}>— choose category —</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Group / Division</label>
              <select value={form.groupId} onChange={set('groupId')} className={inputCls} disabled={groups.length === 0}>
                <option value="">{groups.length ? 'No group' : 'No groups in this category'}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            {suggestion && suggestion.id !== form.categoryId && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-200 sm:col-span-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                Based on the entered {form.weightKg !== '' ? 'weight' : 'height'}, the matching category is <strong className="text-white">{suggestion.name}</strong>.
                <button type="button" onClick={() => set('categoryId')(suggestion.id)} className="ml-auto rounded-lg bg-blue-500/30 px-2.5 py-1 font-bold text-white hover:bg-blue-500/50">
                  Move to {suggestion.name}
                </button>
              </div>
            )}
          </div>

          {/* Measurements */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input type="number" step="0.01" value={form.weightKg} onChange={set('weightKg')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Height (cm)</label>
              <input type="number" step="0.01" value={form.heightCm} onChange={set('heightCm')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Age</label>
              <input type="number" value={form.age} onChange={set('age')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select value={form.gender} onChange={set('gender')} className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          {/* Identity & contact */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Full Name</label>
              <input value={form.participantName} onChange={set('participantName')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Mobile Number</label>
              <input value={form.mobileNumber} onChange={set('mobileNumber')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>District</label>
              <input value={form.district} onChange={set('district')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Representing</label>
              <select value={form.representingType} onChange={set('representingType')} className={inputCls}>
                <option value="GYM">Gym</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Gym Name</label>
              <input value={form.gymName} onChange={set('gymName')} className={inputCls} placeholder={form.representingType === 'INDIVIDUAL' ? 'Optional for individual' : ''} />
            </div>
            <div>
              <label className={labelCls}>Registration Status</label>
              <select value={form.registrationStatus} onChange={set('registrationStatus')} className={inputCls}>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">
            Payment status cannot be edited (it is set only by verified payments). Only <strong>Confirmed + Paid</strong> participants with a trunk number appear on the judges' forms.
          </p>
        </div>

        <div className="space-y-2 border-t border-white/[0.08] p-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" /> {error}
            </div>
          )}
          {saved && !error && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> Saved. Changes are now applied everywhere.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-bold text-zinc-200 hover:text-white">
              Close
            </button>
            {!original.verified && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave({ verified: true })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/15 px-4 py-2.5 text-xs font-bold text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Save &amp; Mark Verified
              </button>
            )}
            <button
              type="button"
              disabled={saving || !hasChanges}
              onClick={() => handleSave()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#F15A24]/20 hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
