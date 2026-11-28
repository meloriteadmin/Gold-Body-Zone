import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Gavel,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
  Unlink,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiClient } from '../../../lib/apiClient.js';

export function judgeScoringUrl(token) {
  return `${window.location.origin}/score/${token}`;
}

const inputCls =
  'h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none';

/**
 * Create a judge and choose the competition the judge belongs to.
 */
export function CreateJudgeModal({ competitions = [], defaultCompetitionId = '', onClose, onCreated }) {
  const [competitionId, setCompetitionId] = useState(defaultCompetitionId || competitions[0]?.id || '');
  const [allCompetitions, setAllCompetitions] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!competitionId && !allCompetitions) return setError('Select the competition for this judge.');
    if (name.trim().length < 2) return setError('Enter the judge’s full name.');
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.createAdminJudge(null, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        isActive: true,
        competitionId,
        ...(allCompetitions ? { competitionIds: competitions.filter((competition) => competition.isPublished && !competition.isCompleted).map((competition) => competition.id) } : {}),
      });
      onCreated?.(res.judge, competitionId);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create judge.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24]">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">Create Judge</h3>
              <p className="text-xs text-zinc-400">The judge gets a private link for the selected competition.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400" /> {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
              Competition <span className="text-[#F15A24]">*</span>
            </label>
            <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} className={inputCls}>
              <option value="">— Select competition —</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={allCompetitions} onChange={(event) => setAllCompetitions(event.target.checked)} /> Assign this judge to all active competitions
            </label>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
              Full Name <span className="text-[#F15A24]">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Vikram Shinde" autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold tracking-wider text-zinc-400 uppercase">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="For WhatsApp link" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold tracking-wider text-zinc-400 uppercase">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold tracking-wider text-zinc-400 uppercase">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.08] p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-bold text-zinc-200">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create Judge
          </button>
        </div>
      </form>
    </div>
  );
}

function EditJudgeModal({ judge, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: judge.name || '',
    phone: judge.phone || '',
    email: judge.email || '',
    city: judge.city || '',
    designation: judge.designation || 'Judge',
    isActive: judge.isActive !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((prev) => ({
    ...prev,
    [key]: key === 'isActive' ? event.target.checked : event.target.value,
  }));

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError('Enter the judge’s full name.');
    setSaving(true);
    setError('');
    try {
      await apiClient.updateAdminJudge(null, judge.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        designation: form.designation.trim() || 'Judge',
        isActive: form.isActive,
      });
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update judge.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] p-5">
          <div>
            <h3 className="font-display text-lg font-bold text-white uppercase">Edit Judge</h3>
            <p className="text-xs text-zinc-400">Updates apply to this judge’s profile and private scoring screen.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          <div>
            <label className="mb-1 block text-[11px] font-bold text-zinc-400 uppercase">Full name</label>
            <input value={form.name} onChange={set('name')} className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-[11px] font-bold text-zinc-400 uppercase">Phone</label><input value={form.phone} onChange={set('phone')} className={inputCls} /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-zinc-400 uppercase">Email</label><input type="email" value={form.email} onChange={set('email')} className={inputCls} /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-zinc-400 uppercase">City</label><input value={form.city} onChange={set('city')} className={inputCls} /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-zinc-400 uppercase">Designation</label><input value={form.designation} onChange={set('designation')} className={inputCls} /></div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#222222] p-3 text-xs text-white">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="h-4 w-4 accent-[#F15A24]" />
            Judge is active and may use assigned private links
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.08] p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-bold text-zinc-200">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-[#F15A24] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save judge
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Judges of one competition with their private scoring links.
 */
export function LiveJudgesPanel({ competition, judges = [], competitions = [], onChanged, onMessage }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [assignId, setAssignId] = useState('');
  const [editJudge, setEditJudge] = useState(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!assignOpen) return;
    apiClient
      .fetchAdminJudges(null, { activeOnly: true })
      .then((res) => setDirectory(res.judges || []))
      .catch(() => setDirectory([]));
  }, [assignOpen]);

  const assignedIds = new Set(judges.map((j) => j.id));
  const available = directory.filter((j) => !assignedIds.has(j.id));

  const copy = async (judge) => {
    const url = judgeScoringUrl(judge.accessToken);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(judge.id);
    setTimeout(() => setCopied(''), 2500);
  };

  const share = (judge) => {
    const url = judgeScoringUrl(judge.accessToken);
    const text = `🏆 ${competition?.name || 'Competition'} — Judge scoring sheet\n\nHello ${judge.name}, this is your PRIVATE judging link. Do not share it.\n${url}`;
    const phone = (judge.phone || '').replace(/\D/g, '');
    const target = phone.length >= 10 ? `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}` : 'https://wa.me/';
    window.open(`${target}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const regenerate = async (judge) => {
    if (!window.confirm(`Create a NEW link for ${judge.name}? The old link will stop working immediately.`)) return;
    setBusy(`regen:${judge.id}`);
    try {
      await apiClient.regenerateLiveJudgeLink(competition.id, judge.id);
      onMessage?.(`New private link generated for ${judge.name}. Share it again.`);
      await onChanged?.();
    } catch (err) {
      onMessage?.(err.message || 'Failed to regenerate link.', true);
    } finally {
      setBusy('');
    }
  };

  const remove = async (judge) => {
    if (!window.confirm(`Remove ${judge.name} from ${competition?.name}? Their link will stop working. Already submitted sheets are kept.`)) return;
    setBusy(`remove:${judge.id}`);
    try {
      await apiClient.removeJudgeFromCompetition(null, competition.id, judge.id);
      onMessage?.(`${judge.name} removed from this competition.`);
      await onChanged?.();
    } catch (err) {
      onMessage?.(err.message || 'Failed to remove judge.', true);
    } finally {
      setBusy('');
    }
  };

  const deleteJudge = async (judge) => {
    if (!window.confirm(`Delete ${judge.name} from the judge directory? If they have submitted scores, the profile will be deactivated instead so history is preserved.`)) return;
    setBusy(`delete:${judge.id}`);
    try {
      const result = await apiClient.deleteAdminJudge(null, judge.id);
      onMessage?.(result.message || `${judge.name} deleted.`);
      await onChanged?.();
    } catch (err) {
      onMessage?.(err.message || 'Failed to delete judge.', true);
    } finally {
      setBusy('');
    }
  };

  const assign = async () => {
    if (!assignId) return;
    setBusy('assign');
    try {
      await apiClient.assignJudgeToCompetition(null, competition.id, assignId);
      setAssignOpen(false);
      setAssignId('');
      onMessage?.('Judge added to this competition.');
      await onChanged?.();
    } catch (err) {
      onMessage?.(err.message || 'Failed to assign judge.', true);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F15A24]/10 text-[#F15A24]">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold tracking-wide text-white uppercase">
              Judges Panel ({judges.length})
            </h3>
            <p className="text-[11px] text-zinc-500">Each judge has a separate private link. Judges see trunk numbers only.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAssignOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white">
            <Users className="h-3.5 w-3.5 text-[#F15A24]" /> Add existing
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-3 py-2 text-xs font-bold text-white">
            <UserPlus className="h-3.5 w-3.5" /> Create Judge
          </button>
        </div>
      </div>

      {assignOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#1d1d1d] p-3">
          <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className="h-9 min-w-56 flex-1 rounded-lg border border-white/10 bg-[#222222] px-2 text-xs text-white">
            <option value="">{available.length ? '— Select a judge from the directory —' : 'No other active judges in the directory'}</option>
            {available.map((j) => (
              <option key={j.id} value={j.id}>{j.name}{j.city ? ` · ${j.city}` : ''}</option>
            ))}
          </select>
          <button type="button" disabled={!assignId || busy === 'assign'} onClick={assign} className="rounded-lg bg-[#F15A24] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {busy === 'assign' ? 'Adding…' : 'Add to competition'}
          </button>
        </div>
      )}

      {judges.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-5 text-center text-xs text-amber-200">
          No judges yet. Create judges for this competition before starting Round 1.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {judges.map((judge, index) => (
            <div key={judge.id} className="min-w-0 rounded-xl border border-white/[0.08] bg-[#1d1d1d] p-4 transition-colors hover:border-white/15">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F15A24]/15 font-display text-base font-extrabold text-[#F15A24] ring-1 ring-[#F15A24]/25">
                    J{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white" title={judge.name}>{judge.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {[judge.designation || 'Judge', judge.city, judge.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={Boolean(busy)} onClick={() => setEditJudge(judge)} title="Edit judge" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-[#242424] px-2.5 text-[11px] font-semibold text-zinc-200 hover:border-blue-500/40 hover:text-blue-200 disabled:opacity-50">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => remove(judge)} title="Remove from this competition" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-[#242424] px-2 text-[11px] font-semibold text-amber-200 hover:border-amber-500/40 disabled:opacity-50">
                    <Unlink className="h-3 w-3" />
                  </button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => deleteJudge(judge)} title="Delete judge profile" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-[#242424] px-2 text-[11px] font-semibold text-red-300 hover:border-red-500/40 disabled:opacity-50">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Private link ready
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => copy(judge)} title="Copy private link" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#252525] px-2.5 text-[11px] font-semibold text-zinc-100 hover:border-[#F15A24]/50">
                    {copied === judge.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-[#F15A24]" />}
                    {copied === judge.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" onClick={() => share(judge)} title="Share on WhatsApp" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20">
                    <Share2 className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                  <a href={judgeScoringUrl(judge.accessToken)} target="_blank" rel="noreferrer" title="Open judge screen" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-[#252525] px-2.5 text-[11px] font-semibold text-zinc-200 hover:text-white">
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                  <button type="button" disabled={Boolean(busy)} onClick={() => regenerate(judge)} title="Generate new private link" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-[#252525] px-2.5 text-[11px] font-semibold text-zinc-300 hover:text-white disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${busy === `regen:${judge.id}` ? 'animate-spin' : ''}`} /> Reset
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateJudgeModal
          competitions={competitions.length ? competitions : competition ? [competition] : []}
          defaultCompetitionId={competition?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={async (judge) => {
            onMessage?.(`Judge "${judge.name}" created. Copy or WhatsApp the private link below.`);
            await onChanged?.();
          }}
        />
      )}
      {editJudge && (
        <EditJudgeModal
          judge={editJudge}
          onClose={() => setEditJudge(null)}
          onSaved={async () => {
            onMessage?.('Judge profile updated.');
            await onChanged?.();
          }}
        />
      )}
    </section>
  );
}
