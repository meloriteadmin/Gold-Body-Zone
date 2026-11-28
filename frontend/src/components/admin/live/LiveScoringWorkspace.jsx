import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Eye,
  History,
  ListOrdered,
  Loader2,
  Lock,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Swords,
  Trash2,
  Trophy,
  Unlock,
  Vote,
  X,
} from 'lucide-react';
import { apiClient } from '../../../lib/apiClient.js';
import { formatDate } from '../../../utils/formatters.js';
import { LiveJudgesPanel } from './LiveJudgesPanel.jsx';
import {
  Banner,
  GhostButton,
  PrimaryButton,
  SectionCard,
  TitleCombobox,
  TrunkBadge,
  participantLabel,
} from './liveUi.jsx';

const ROUND_TABS = [
  { key: 1, label: 'Round 1 · Form 1', sub: 'Voting / elimination', icon: Vote },
  { key: 2, label: 'Round 2 · Form 2', sub: 'Ranking (no elimination)', icon: ListOrdered },
  { key: 3, label: 'Round 3 · Form 3', sub: 'Titles', icon: Award },
  { key: 4, label: 'Final Results', sub: 'Print / announce', icon: Trophy },
];

const DIVISION_STATUS = {
  NOT_STARTED: { label: 'Not started', cls: 'border-white/15 bg-white/[0.04] text-zinc-400' },
  IN_PROGRESS: { label: 'On judges’ screens', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  RESULTS_READY: { label: 'Results ready', cls: 'border-blue-500/40 bg-blue-500/10 text-blue-300' },
  QUALIFIED: { label: 'Winner sent to Round 2', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
};

// ---------------------------------------------------------------------------
// Start-heat modal (Round 1 main / tie-break)
// ---------------------------------------------------------------------------
function StartFormModal({ config, onClose, onConfirm, busy }) {
  const { title, description, participants = [], showLimit, defaultLimit = 20, groups = [] } = config;
  const [limitMode, setLimitMode] = useState(defaultLimit ? 'custom' : 'none');
  const [limit, setLimit] = useState(defaultLimit ? String(defaultLimit) : '');
  const [groupId, setGroupId] = useState('');
  const presets = [5, 10, 15, 20];

  const confirm = () => {
    const payload = {};
    if (showLimit) payload.selectionLimit = limitMode === 'none' ? null : Number(limit) || null;
    if (groupId) payload.groupId = groupId;
    onConfirm(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] p-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Send form to judges</p>
            <h3 className="font-display text-xl font-extrabold text-white uppercase">{title}</h3>
            {description && <p className="mt-1 text-xs text-zinc-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {groups.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">Which participants?</p>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-sm text-white">
                <option value="">Whole category (all groups)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>Only group: {g.name} ({g.eligibleCount})</option>
                ))}
              </select>
            </div>
          )}
          {showLimit && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">How many X marks can each judge give?</p>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((n) => (
                  <button key={n} type="button" onClick={() => { setLimitMode('custom'); setLimit(String(n)); }} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${limitMode === 'custom' && limit === String(n) ? 'border-[#F15A24] bg-[#F15A24] text-white' : 'border-white/10 bg-[#222222] text-zinc-300'}`}>
                    Up to {n}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  value={limitMode === 'custom' ? limit : ''}
                  onChange={(e) => { setLimitMode('custom'); setLimit(e.target.value); }}
                  placeholder="Custom (e.g. 25)"
                  className="h-8 w-32 rounded-lg border border-white/10 bg-[#222222] px-2 text-xs text-white"
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">Choose the number of participants who can advance. Enter more than 20 for a larger category.</p>
            </div>
          )}
          {participants.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">Trunk numbers on this form ({participants.length})</p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {participants.map((p) => (
                  <TrunkBadge key={p.id} value={p.trunkNumber} size="sm" />
                ))}
              </div>
            </div>
          )}
          <Banner tone="warn">The form appears immediately on every judge’s screen. Only one form can be open at a time.</Banner>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.08] p-4">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={confirm} disabled={busy || (showLimit && limitMode === 'custom' && !(Number(limit) >= 1))}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start on judges’ screens
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open heat banner
// ---------------------------------------------------------------------------
function OpenHeatPanel({ heat, judges, busy, onClose, onCancel, onUnlock }) {
  if (!heat) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-black p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-400">
          <Lock className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-white">No form is open — judges’ screens are dark / waiting.</p>
          <p className="text-[11px] text-zinc-500">Choose a category below and press “Start Form” to send the next form.</p>
        </div>
      </div>
    );
  }
  const allIn = heat.submittedCount >= heat.totalJudges && heat.totalJudges > 0;
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${allIn ? 'border-emerald-500/50 bg-emerald-500/[0.07]' : 'border-amber-500/50 bg-amber-500/[0.07]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-amber-300 uppercase">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" /></span>
            Live on judges’ screens
          </p>
          <h3 className="font-display mt-1 text-2xl font-extrabold text-white uppercase">{heat.label}</h3>
          <p className="text-xs text-zinc-300">
            {heat.participants.length} trunk numbers
            {heat.round === 1 && (heat.selectionLimit ? ` · up to ${heat.selectionLimit} X marks per judge` : ' · no X limit')}
            {heat.round === 3 && ` · titles: ${heat.titles.join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-extrabold text-white">
            {heat.submittedCount}<span className="text-xl text-zinc-400">/{heat.totalJudges}</span>
          </p>
          <p className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">sheets submitted</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {judges.map((j, i) => {
          const sub = heat.submissions.find((s) => s.judgeId === j.id);
          return (
            <span key={j.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${sub ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-black/30 text-zinc-400'}`}>
              {sub ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              J{i + 1} · {j.name}
              {sub && (
                <button type="button" title="Reopen this judge’s sheet so they can correct it" onClick={() => onUnlock(heat.id, j)} className="ml-1 rounded p-0.5 text-emerald-300 hover:bg-white/10">
                  <Unlock className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PrimaryButton onClick={() => onClose(heat)} disabled={busy || !allIn} className="px-5 py-3 text-sm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Close &amp; Show Results {allIn ? '' : `(${heat.totalJudges - heat.submittedCount} pending)`}
        </PrimaryButton>
        <GhostButton onClick={() => onCancel(heat)} disabled={busy} className="border-red-500/30 text-red-300">
          <X className="h-4 w-4" /> Cancel this form
        </GhostButton>
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">Closing turns every judge’s screen black and shows the result here.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROUND 1
// ---------------------------------------------------------------------------
function Round1Division({ division, category, judges, openHeat, busy, stage, onStart, onTiebreak, onQualify }) {
  const [expanded, setExpanded] = useState(division.status === 'RESULTS_READY');
  const stageData = division.stages?.[stage - 1];
  const results = stageData?.results;
  const latestResultKey = `${stageData?.rootHeatId || ''}:${results?.tiebreakHeatIds?.length || 0}`;
  const seenResultKey = useRef(latestResultKey);
  useEffect(() => {
    // Auto-open the results as soon as a form (or tie-break) for this category is revealed.
    if (stageData?.rootHeatId && seenResultKey.current !== latestResultKey) setExpanded(true);
    seenResultKey.current = latestResultKey;
  }, [latestResultKey, stageData?.rootHeatId]);
  const suggested = stage === 3 ? (division.qualifierIds.length ? division.qualifierIds : results?.suggestedQualifierIds || []) : [];
  const [picked, setPicked] = useState(() => new Set(suggested));

  useEffect(() => {
    setPicked(new Set(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, stageData?.rootHeatId, division.qualifierIds.join(','), (results?.suggestedQualifierIds || []).join(','), results?.tiebreakHeatIds?.length]);

  const currentHeatOpen = openHeat?.round === 1 && openHeat.categoryId === division.categoryId && (openHeat.groupId || null) === (division.groupId || null) &&
    (openHeat.parentHeatId === stageData?.rootHeatId || (!openHeat.isTiebreak && openHeat.label?.includes(`Stage ${stage}`)));
  const stageStatus = currentHeatOpen ? 'IN_PROGRESS' : stage === 3 && division.qualifierIds.length ? 'QUALIFIED' : stageData?.rootHeatId ? 'RESULTS_READY' : 'NOT_STARTED';
  const status = DIVISION_STATUS[stageStatus] || DIVISION_STATUS.NOT_STARTED;
  const eligible = division.groupId
    ? category?.groups?.find((g) => g.id === division.groupId)?.eligibleCount ?? 0
    : category?.eligibleCount ?? 0;
  const missing = division.groupId
    ? category?.groups?.find((g) => g.id === division.groupId)?.missingTrunkCount ?? 0
    : category?.missingTrunkCount ?? 0;
  const priorStage = stage > 1 ? division.stages?.[stage - 2] : null;
  const readyCount = stage === 1 ? eligible : (priorStage?.advancementIds?.length || 0);
  const startBlocked = stage === 1 ? missing > 0 : !priorStage?.rootHeatId || Boolean(priorStage?.advanceError) || readyCount === 0;

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickedIds = [...picked];
  const cutoff = Math.min(stageData?.target || (stage === 1 ? 20 : stage === 2 ? 5 : 1), results?.rows.length || 0);
  const tieGroups = results?.tieGroups || [];
  const qualifierChanged =
    pickedIds.length !== division.qualifierIds.length || pickedIds.some((id) => !division.qualifierIds.includes(id));

  return (
    <div className={`rounded-xl border ${stageStatus === 'IN_PROGRESS' ? 'border-amber-500/50' : 'border-white/[0.08]'} bg-[#1b1b1b]`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl font-bold text-white">
              {division.categoryName}
              {division.groupName && <span className="text-zinc-400"> · {division.groupName}</span>}
            </p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${status.cls}`}>{status.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {readyCount} {stage === 1 ? 'ready (confirmed, paid, trunk no.)' : `selected from Stage ${stage - 1}`}
            {stage === 1 && missing > 0 && <span className="font-semibold text-amber-400"> · {missing} without trunk number</span>}
            {stage > 1 && priorStage?.advanceError && <span className="font-semibold text-amber-400"> · Finish Stage {stage - 1} results</span>}
            {division.qualifiers.length > 0 && (
              <span className="text-emerald-400"> · Round 2: {division.qualifiers.map((q) => `#${q.trunkNumber}`).join(', ')}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {results && (
            <GhostButton onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Results
            </GhostButton>
          )}
          <PrimaryButton disabled={busy || Boolean(openHeat) || readyCount === 0 || startBlocked} onClick={() => onStart(division)} title={startBlocked ? (stage === 1 ? 'Assign trunk numbers first' : `Finish Stage ${stage - 1} first`) : ''}>
            <Play className="h-3.5 w-3.5" /> {results ? `Re-run Stage ${stage}` : `Start Stage ${stage}`}
          </PrimaryButton>
        </div>
      </div>

      {results && expanded && (
        <div className="border-t border-white/[0.06] p-4">
          {tieGroups.length > 0 && (
            <div className="mb-3 space-y-2">
              {tieGroups.map((g) => (
                <div key={g.position} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                  <span>
                    <strong>Tie at position {g.position}:</strong>{' '}
                    {g.registrationIds.map((id) => `#${results.rows.find((r) => r.registrationId === id)?.participant?.trunkNumber}`).join(', ')} have equal votes.
                  </span>
                  <GhostButton className="ml-auto border-amber-500/40 text-amber-200" disabled={busy || Boolean(openHeat)} onClick={() => onTiebreak(division, g, results)}>
                    <Swords className="h-3.5 w-3.5" /> Compete again (tie-break)
                  </GhostButton>
                </div>
              ))}
              <p className="text-[10px] text-zinc-500">A tie-break is optional. The highest vote totals proceed automatically; a tie at the last place is ordered by trunk number unless you re-vote it.</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-2">{stage === 3 ? 'Finalist' : 'Select'}</th>
                  <th className="px-2 py-2">Pos.</th>
                  <th className="px-2 py-2">Trunk</th>
                  <th className="px-2 py-2">Participant</th>
                  <th className="px-2 py-2 text-center">Votes</th>
                  <th className="px-2 py-2">Marked by</th>
                  {results.tiebreakHeatIds.length > 0 && <th className="px-2 py-2 text-center">Tie-break votes</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {results.rows.map((row) => (
                  <tr key={row.registrationId} className={row.eliminated ? 'opacity-50' : row.isTied ? 'bg-amber-500/[0.06]' : row.position === 1 ? 'bg-emerald-500/[0.06]' : ''}>
                    <td className="px-2 py-2">
                      {stage === 3 ? <input type="checkbox" checked={picked.has(row.registrationId)} onChange={() => toggle(row.registrationId)} className="h-4 w-4 accent-[#F15A24]" disabled={row.eliminated} aria-label={`Select finalist trunk ${row.participant?.trunkNumber || 'unknown'}`} /> : <span className={results.rows.indexOf(row) < cutoff ? 'font-semibold text-emerald-400' : 'text-zinc-500'}>{results.rows.indexOf(row) < cutoff ? 'Selected' : 'Out'}</span>}
                    </td>
                    <td className="px-2 py-2 font-display text-lg font-bold text-white">
                      {row.eliminated ? <span className="text-xs font-bold text-red-400">OUT</span> : row.position}
                      {row.isTied && <span className="ml-1 text-[9px] font-bold text-amber-300">TIE</span>}
                    </td>
                    <td className="px-2 py-2"><TrunkBadge value={row.participant?.trunkNumber} size="sm" /></td>
                    <td className="px-2 py-2">
                      <p className="font-bold text-white">{row.participant?.participantName}</p>
                      <p className="text-[10px] text-zinc-500">{row.participant?.gymName} · {row.participant?.district}</p>
                    </td>
                    <td className="px-2 py-2 text-center font-display text-xl font-extrabold text-[#F15A24]">{row.votes}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {judges.map((j, ji) => (
                          <span key={j.id} title={j.name} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${row.votedByJudgeIds.includes(j.id) ? 'bg-[#F15A24]/20 text-[#F15A24]' : 'bg-white/[0.04] text-zinc-600'}`}>
                            J{ji + 1}{row.votedByJudgeIds.includes(j.id) ? ' ✕' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    {results.tiebreakHeatIds.length > 0 && (
                      <td className="px-2 py-2 text-center text-zinc-300">{row.tiebreaks.filter((v) => v != null).join(' → ') || '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stage === 3 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <Crown className="h-4 w-4 text-[#F15A24]" />
            <p className="text-xs text-zinc-300">
              {results.leaderTie
                ? 'Top position is tied — run a tie-break or tick the winner manually.'
                : 'The participant with the highest votes is pre-selected for Round 2.'}
            </p>
            <PrimaryButton className="ml-auto" disabled={busy || (!qualifierChanged && division.qualifierIds.length > 0)} onClick={() => onQualify(division, pickedIds)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {pickedIds.length === 0 ? 'Clear Round 2 selection' : `Confirm ${pickedIds.length} for Round 2`}
            </PrimaryButton>
          </div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROUND 2
// ---------------------------------------------------------------------------
function Round2Panel({ dash, busy, onStart, onTiebreak }) {
  const { round2, judges, openHeat } = dash;
  const results = round2.results;
  return (
    <div className="space-y-4">
      <SectionCard
        title="Finalists (Round 1 winners)"
        subtitle="Every category winner competes in Round 2. Judges give each trunk number unique numeric points; the highest total ranks first."
        icon={Crown}
        actions={
          <PrimaryButton disabled={busy || Boolean(openHeat) || round2.finalists.length === 0} onClick={onStart}>
            <Play className="h-3.5 w-3.5" /> {results ? 'Re-run Form 2' : 'Start Form 2 (Ranking)'}
          </PrimaryButton>
        }
      >
        {round2.finalists.length === 0 ? (
          <Banner tone="warn">No finalists yet. In Round 1, open each category’s results and press “Confirm for Round 2”.</Banner>
        ) : (
          <div className="flex flex-wrap gap-2">
            {round2.finalists.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1d1d1d] px-3 py-2">
                <TrunkBadge value={p.trunkNumber} size="sm" />
                <div>
                  <p className="text-xs font-bold text-white">{p.participantName}</p>
                  <p className="text-[10px] text-zinc-500">{p.categoryName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {results && (
        <SectionCard title="Round 2 result" subtitle="Highest total points = first place. Equal totals can compete again (no elimination)." icon={ListOrdered}>
          {results.tieGroups.map((g) => (
            <div key={g.position} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span>
                <strong>Same points at position {g.position}:</strong>{' '}
                {g.registrationIds.map((id) => `#${results.rows.find((r) => r.registrationId === id)?.participant?.trunkNumber}`).join(', ')}
              </span>
              <GhostButton className="ml-auto border-amber-500/40 text-amber-200" disabled={busy || Boolean(openHeat)} onClick={() => onTiebreak(g, results)}>
                <Swords className="h-3.5 w-3.5" /> Compete again (Form 2)
              </GhostButton>
            </div>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-2">Position</th>
                  <th className="px-2 py-2">Trunk</th>
                  <th className="px-2 py-2">Participant</th>
                  <th className="px-2 py-2">Category</th>
                  {judges.map((j, i) => (
                    <th key={j.id} className="px-2 py-2 text-center" title={j.name}>
                      <span className="inline-block rounded bg-[#F15A24]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F15A24]">J{i + 1}</span>
                      <span className="mt-0.5 block max-w-[96px] truncate text-[10px] font-semibold text-zinc-300 normal-case mx-auto">{j.name}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">Total</th>
                  {results.tiebreakHeatIds.length > 0 && <th className="px-2 py-2 text-center">Tie-break</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {results.rows.map((row) => (
                  <tr key={row.registrationId} className={row.isTied ? 'bg-amber-500/[0.06]' : row.position === 1 ? 'bg-emerald-500/[0.06]' : ''}>
                    <td className="px-2 py-2 font-display text-xl font-extrabold text-white">
                      {row.position}{row.isTied && <span className="ml-1 text-[9px] text-amber-300">TIE</span>}
                    </td>
                    <td className="px-2 py-2"><TrunkBadge value={row.participant?.trunkNumber} size="sm" /></td>
                    <td className="px-2 py-2 font-bold text-white">{row.participant?.participantName}</td>
                    <td className="px-2 py-2 text-zinc-400">{row.participant?.categoryName}</td>
                    {judges.map((j) => (
                      <td key={j.id} className="px-2 py-2 text-center text-zinc-300">{row.ranksByJudge[j.id] ?? '—'}</td>
                    ))}
                    <td className="px-2 py-2 text-center font-display text-lg font-bold text-[#F15A24]">{row.total}</td>
                    {results.tiebreakHeatIds.length > 0 && (
                      <td className="px-2 py-2 text-center text-zinc-300">{row.tiebreaks.filter((v) => v != null).join(' → ') || '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROUND 3
// ---------------------------------------------------------------------------
function Round3Panel({ dash, busy, onStartForm3, onTitleTiebreak, onSaveAwards }) {
  const { round2, round3, titleAwards, standardTitles, openHeat, judges = [] } = dash;
  const [formTitle, setFormTitle] = useState('');
  const awardedTitles = useMemo(
    () => new Set(titleAwards.map((award) => award.title.toLowerCase())),
    [titleAwards]
  );
  const completedTitles = useMemo(
    () => [...round3.titleResults.map((r) => r.title), ...titleAwards.map((a) => a.title)],
    [round3.titleResults, titleAwards]
  );
  const activeTitle = completedTitles.some((t) => t.toLowerCase() === formTitle.toLowerCase()) ? '' : formTitle;
  const pendingResults = round3.titleResults.filter((result) => !awardedTitles.has(result.title.toLowerCase()));
  const winnerIds = useMemo(() => new Set(titleAwards.map((award) => award.registrationId)), [titleAwards]);

  const rankedPool = useMemo(
    () => round2.results?.rows.map((row) => row.participant).filter(Boolean) || round2.finalists || [],
    [round2]
  );
  const remaining = useMemo(
    () => rankedPool.filter((person) => !winnerIds.has(person.id)),
    [rankedPool, winnerIds]
  );

  const [selectedIds, setSelectedIds] = useState(() => remaining.slice(0, 5).map((p) => p.id));

  useEffect(() => {
    const remainingIdSet = new Set(remaining.map((p) => p.id));
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => remainingIdSet.has(id));
      if (kept.length > 0) return kept;
      return remaining.slice(0, 5).map((p) => p.id);
    });
  }, [remaining]);

  const toggleParticipant = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const confirmWinner = async (result) => {
    const awards = [
      ...titleAwards.map((award) => ({ title: award.title, registrationId: award.registrationId, excludeFromFutureTitles: true })),
      { title: result.title, registrationId: result.winnerId, excludeFromFutureTitles: true },
    ];
    if (await onSaveAwards(awards)) {
      setFormTitle('');
    }
  };

  const removeAward = async (titleToRemove) => {
    if (!window.confirm(`Remove awarded title "${titleToRemove}"?`)) return;
    const awards = titleAwards
      .filter((award) => award.title.toLowerCase() !== titleToRemove.toLowerCase())
      .map((award) => ({ title: award.title, registrationId: award.registrationId, excludeFromFutureTitles: true }));
    await onSaveAwards(awards);
  };

  const startVote = async () => {
    if (!activeTitle || selectedIds.length === 0) return;
    const ok = await onStartForm3([activeTitle], selectedIds);
    if (ok) setFormTitle('');
  };

  const excludedWinners = titleAwards.filter((award) => award.excludeFromFutureTitles);
  const judgeIndexById = useMemo(() => new Map(judges.map((j, i) => [j.id, `J${i + 1}`])), [judges]);

  return (
    <div className="space-y-4">
      {pendingResults.length > 0 && (
        <SectionCard
          title="Confirm voted title winner"
          subtitle="Judges have submitted votes. Review the votes and confirm the winner to unlock the next title."
          icon={Crown}
          className="border-amber-500/40 bg-amber-500/[0.04]"
        >
          <div className="space-y-3">
            {pendingResults.map((t) => {
              const winnerPerson = t.winnerParticipant || t.votes.find((v) => v.registrationId === t.winnerId)?.participant;
              return (
                <div key={t.title} className="rounded-xl border border-white/10 bg-[#181818] p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">Title voted</p>
                      <h4 className="font-display text-xl font-extrabold text-white uppercase">{t.title}</h4>
                    </div>
                    {t.winnerId && <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-300">Winner decided</span>}
                    {t.isTied && <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 font-bold text-amber-300">Tie — re-vote needed</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.votes.map((v) => (
                      <div key={v.registrationId} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${v.registrationId === t.winnerId ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-300'}`}>
                        <TrunkBadge value={v.participant?.trunkNumber} size="sm" />
                        <div>
                          <p className="font-bold text-white">{v.participant?.participantName || 'Finalist'}</p>
                          <p className="text-[10px] text-zinc-400">
                            <strong className="text-[#F15A24]">{v.votes}</strong> vote{v.votes === 1 ? '' : 's'}
                            {v.votedByJudgeIds?.length > 0 && ` (${v.votedByJudgeIds.map((jid) => judgeIndexById.get(jid) || 'J').join(', ')})`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {t.tiebreaks?.length > 0 && (
                    <div className="mt-3 rounded-lg border border-purple-500/25 bg-purple-500/10 p-2.5">
                      <p className="mb-1.5 font-bold text-purple-200">Tie-break votes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.tiebreaks[t.tiebreaks.length - 1].votes.map((vote) => (
                          <span key={vote.registrationId} className="rounded bg-black/30 px-2 py-1 text-purple-100">
                            #{vote.participant?.trunkNumber} {vote.participant?.participantName || ''}: <strong>{vote.votes}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.isTied && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <span className="text-amber-100">Equal top votes. Send only the tied trunk numbers back to judges.</span>
                      <PrimaryButton disabled={busy || Boolean(openHeat)} onClick={() => onTitleTiebreak(t)}>
                        <Swords className="h-3.5 w-3.5" /> Start tie-break vote
                      </PrimaryButton>
                    </div>
                  )}
                  {!t.isTied && t.winnerId && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <span className="text-sm font-bold text-emerald-100">
                        Winner: #{winnerPerson?.trunkNumber} · {winnerPerson?.participantName || 'Finalist'}
                      </span>
                      <PrimaryButton disabled={busy || Boolean(openHeat)} onClick={() => confirmWinner(t)}>
                        <CheckCircle2 className="h-4 w-4" /> Confirm winner &amp; continue
                      </PrimaryButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Open a title vote (Form 3)"
        subtitle="1) Pick one title, 2) Choose the competing trunk numbers (Top 5 or remaining), 3) Send to judges."
        icon={Vote}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">1 · Select title</p>
            <TitleCombobox options={standardTitles} exclude={completedTitles} value={activeTitle} placeholder="Search standard titles or type a custom title…" onChange={setFormTitle} />
          </div>
          <div className="flex flex-col rounded-xl border border-white/10 bg-[#141414] p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-white">2 · Competing trunks ({selectedIds.length}/{remaining.length})</p>
              {remaining.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {remaining.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setSelectedIds(remaining.slice(0, 5).map((p) => p.id))}
                      className="rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/15 px-2 py-1 text-[10px] font-bold text-[#F15A24] hover:bg-[#F15A24]/25"
                    >
                      Top 5
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(remaining.map((p) => p.id))}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:text-white"
                  >
                    All ({remaining.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            {remaining.length === 0 ? (
              <p className="mt-3 text-zinc-400">
                {rankedPool.length === 0 ? 'Confirm Round 1 / Round 2 finalists first.' : 'All finalists have received a title.'}
              </p>
            ) : (
              <div className="mt-2.5 flex max-h-48 flex-wrap content-start gap-1.5 overflow-y-auto">
                {remaining.map((person, idx) => {
                  const checked = selectedIds.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleParticipant(person.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        checked
                          ? 'border-[#F15A24] bg-[#F15A24]/20 text-white'
                          : 'border-white/10 bg-[#1d1d1d] text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                      }`}
                    >
                      {round2.results && <span className="text-[10px] text-zinc-400">#{idx + 1}</span>}
                      <span>Trunk #{person.trunkNumber}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-auto pt-3 text-[10px] text-zinc-500">Tap trunk numbers to include or exclude them for this title.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/30 p-3">
          <div className="text-xs text-zinc-300">
            {pendingResults.length > 0 ? (
              <span className="font-semibold text-amber-300">Confirm the voted winner above before opening the next title.</span>
            ) : !activeTitle ? (
              <span>Select a title on the left to continue.</span>
            ) : selectedIds.length === 0 ? (
              <span className="font-semibold text-amber-300">Select at least one trunk number.</span>
            ) : (
              <span>
                Ready to send <strong className="text-white">{activeTitle}</strong> with <strong className="text-white">{selectedIds.length}</strong> trunk number(s).
              </span>
            )}
          </div>
          <PrimaryButton
            disabled={busy || Boolean(openHeat) || pendingResults.length > 0 || selectedIds.length === 0 || !activeTitle}
            onClick={startVote}
          >
            <Play className="h-3.5 w-3.5" /> Start title vote
          </PrimaryButton>
        </div>

        {excludedWinners.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-300">
            <span className="font-bold text-zinc-200">Already awarded (excluded from remaining): </span>
            <span className="text-zinc-400">
              {excludedWinners.map((award) => `#${award.participant?.trunkNumber} ${award.participant?.participantName}`).join(' · ')}
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Awarded titles" subtitle="Each confirmed winner is automatically excluded from remaining title votes." icon={Award}>
        {titleAwards.length === 0 ? (
          <p className="text-xs text-zinc-500">No title awarded yet. Open a title vote above and confirm the winner once judges submit.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {titleAwards.map((award) => (
              <div key={award.title} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-300 uppercase">{award.title}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-white">#{award.participant?.trunkNumber} · {award.participant?.participantName}</p>
                </div>
                <GhostButton disabled={busy || Boolean(openHeat)} onClick={() => removeAward(award.title)} className="px-2.5 py-1.5 text-[11px]">
                  <Trash2 className="h-3 w-3" /> Undo
                </GhostButton>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FINAL RESULTS
// ---------------------------------------------------------------------------
function FinalResultsPanel({ dash }) {
  const { competition, round1, round2, titleAwards } = dash;
  const qualified = round1.divisions.filter((d) => d.qualifiers.length);
  return (
    <div id="live-final-results" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-zinc-400">Printable summary of all rounds.</p>
        <GhostButton onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print results</GhostButton>
      </div>
      <SectionCard title={`${competition.name} — Results`} subtitle={`${competition.venue || ''} ${competition.eventDate ? `· ${formatDate(competition.eventDate)}` : ''}`} icon={Trophy}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase">Titles</p>
            {titleAwards.length === 0 ? (
              <p className="text-xs text-zinc-500">No titles saved yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {titleAwards.map((a) => (
                  <div key={a.title} className="flex items-center gap-3 rounded-xl border border-[#F15A24]/30 bg-[#F15A24]/5 p-3">
                    <Award className="h-5 w-5 text-[#F15A24]" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">{a.title}</p>
                      <p className="truncate text-sm font-bold text-white">{a.participant ? participantLabel(a.participant) : 'Removed participant'}</p>
                      <p className="text-[10px] text-zinc-500">{a.participant?.gymName} · {a.participant?.categoryName}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase">Round 2 · Final ranking</p>
            {!round2.results ? (
              <p className="text-xs text-zinc-500">Round 2 not completed yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {round2.results.rows.map((r) => (
                  <li key={r.registrationId} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#1d1d1d] px-3 py-2 text-sm">
                    <span className="w-8 font-display text-xl font-extrabold text-white">{r.position}</span>
                    <TrunkBadge value={r.participant?.trunkNumber} size="sm" />
                    <span className="font-bold text-white">{r.participant?.participantName}</span>
                    <span className="text-xs text-zinc-500">{r.participant?.categoryName} · {r.participant?.gymName}</span>
                    {r.isTied && <span className="ml-auto text-[10px] font-bold text-amber-300">TIED</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase">Round 1 · Category winners</p>
            {qualified.length === 0 ? (
              <p className="text-xs text-zinc-500">No category winners confirmed yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {qualified.map((d) => (
                  <div key={d.divisionKey} className="rounded-lg border border-white/[0.06] bg-[#1d1d1d] px-3 py-2">
                    <p className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">{d.categoryName}{d.groupName ? ` · ${d.groupName}` : ''}</p>
                    {d.qualifiers.map((q) => (
                      <p key={q.id} className="text-sm font-bold text-white">{participantLabel(q)} <span className="text-xs font-normal text-zinc-500">({q.gymName})</span></p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WORKSPACE
// ---------------------------------------------------------------------------
export function LiveScoringWorkspace({ competitionId, competitions = [], onBack }) {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [roundTab, setRoundTab] = useState(1);
  const [round1Stage, setRound1Stage] = useState(1);
  const [modal, setModal] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const autoTabbed = useRef(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await apiClient.fetchLiveDashboard(competitionId);
        setDash(data);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err.message || 'Failed to load live scoring.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [competitionId]
  );

  useEffect(() => {
    autoTabbed.current = false;
    setDash(null);
    load();
  }, [load]);

  // Silent live refresh (no reload / flicker)
  useEffect(() => {
    const interval = dash?.openHeat ? 2500 : 5000;
    const timer = window.setInterval(() => {
      if (!document.hidden) load({ silent: true });
    }, interval);
    return () => window.clearInterval(timer);
  }, [load, dash?.openHeat]);

  useEffect(() => {
    const refresh = () => load({ silent: true });
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [load]);

  useEffect(() => {
    if (!message || message.tone !== 'success') return undefined;
    const timer = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!dash || autoTabbed.current) return;
    autoTabbed.current = true;
    setRoundTab(dash.stage === 'ROUND3' ? 3 : dash.stage === 'ROUND2' ? 2 : 1);
  }, [dash]);

  const notify = (text, isError = false) => setMessage({ text, tone: isError ? 'error' : 'success' });

  const run = async (fn, successText) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (successText) notify(successText);
      await load({ silent: true });
      return true;
    } catch (err) {
      notify(err.message || 'Action failed.', true);
      await load({ silent: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const categoriesById = useMemo(() => new Map((dash?.categories || []).map((c) => [c.id, c])), [dash]);

  if (loading && !dash) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#171717] py-24">
        <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
      </div>
    );
  }
  if (!dash) {
    return (
      <div className="space-y-3">
        <GhostButton onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> All competitions</GhostButton>
        <Banner tone="error">{loadError || 'Unable to load.'} <button type="button" className="ml-2 font-bold underline" onClick={() => load()}>Retry</button></Banner>
      </div>
    );
  }

  const { competition, judges, openHeat } = dash;

  // ---- handlers ----
  const startRound1 = (division) => {
    const category = categoriesById.get(division.categoryId);
    const previousIds = round1Stage > 1 ? division.stages?.[round1Stage - 2]?.advancementIds || [] : [];
    setModal({
      title: `Form 1 · Stage ${round1Stage} · ${division.categoryName}${division.groupName ? ` (${division.groupName})` : ''}`,
      description: 'Judges mark X on the trunk numbers they select. Votes are counted per participant.',
      showLimit: round1Stage !== 3,
      defaultLimit: round1Stage === 1 ? 20 : round1Stage === 2 ? 5 : 1,
      participants: previousIds.map((id) => dash.eligibleParticipants.find((person) => person.id === id)).filter(Boolean),
      groups: division.groupId ? [] : (category?.groups || []).filter((g) => g.eligibleCount > 0),
      onConfirm: (opts) =>
        run(
          () => apiClient.openLiveHeat(competition.id, { round: 1, stage: round1Stage, categoryId: division.categoryId, groupId: division.groupId || opts.groupId || undefined, selectionLimit: opts.selectionLimit }),
          `Form 1 for ${division.categoryName} is now on the judges’ screens.`
        ).then((ok) => ok && setModal(null)),
    });
  };

  const startTiebreak = (round, rootHeatId, group, results, labelText, target = 1) => {
    const participants = group.registrationIds.map((id) => results.rows.find((r) => r.registrationId === id)?.participant).filter(Boolean);
    const crossesCutoff = group.position <= target && group.position + group.registrationIds.length - 1 > target;
    const seats = crossesCutoff ? target - (group.position - 1) : 1;
    setModal({
      title: `Tie-break · ${labelText}`,
      description:
        round === 1
          ? `Only tied participants appear. Judges choose ${seats} trunk number(s) in this re-vote.`
          : 'Only the tied participants appear. Judges score them again; no elimination.',
      showLimit: false,
      defaultLimit: round === 1 ? seats : '',
      participants,
      onConfirm: (opts) =>
        run(
          () => apiClient.openLiveHeat(competition.id, { round, parentHeatId: rootHeatId, participantIds: group.registrationIds, selectionLimit: opts.selectionLimit }),
          'Tie-break form is now on the judges’ screens.'
        ).then((ok) => ok && setModal(null)),
    });
  };

  const closeHeat = (heat) => {
    run(() => apiClient.closeLiveHeat(heat.id), 'Form closed. Judges’ screens are now black. Results are shown below.').then(() => {
      setRoundTab(heat.round);
    });
  };

  const cancelHeat = (heat) => {
    if (!window.confirm(`Cancel "${heat.label}"? All sheets submitted for this form will be discarded.`)) return;
    run(() => apiClient.cancelLiveHeat(heat.id), 'Form cancelled.');
  };

  const unlockSheet = (heatId, judge) => {
    if (!window.confirm(`Reopen ${judge.name}'s sheet? Their submitted marks are removed and they must submit again.`)) return;
    run(() => apiClient.unlockLiveJudgeSheet(heatId, judge.id), `${judge.name} can now submit again.`);
  };

  const qualify = (division, ids) =>
    run(
      () => apiClient.setLiveQualifiers(competition.id, { categoryId: division.categoryId, groupId: division.groupId || undefined, registrationIds: ids }),
      ids.length ? `${division.categoryName}: ${ids.length} participant(s) sent to Round 2.` : `${division.categoryName}: Round 2 selection cleared.`
    );

  const startRound2 = () => {
    const missing = dash.round1.divisions.filter((d) => (categoriesById.get(d.categoryId)?.eligibleCount || 0) > 0 && d.qualifierIds.length === 0 && !d.groupId);
    const warn = missing.length ? `\n\nThese categories have no Round 2 winner yet: ${missing.map((d) => d.categoryName).join(', ')}.` : '';
    if (!window.confirm(`Start Form 2 with ${dash.round2.finalists.length} finalist(s)?${warn}`)) return;
    run(() => apiClient.openLiveHeat(competition.id, { round: 2 }), 'Form 2 (ranking) is now on the judges’ screens.');
  };

  const startForm3 = (titles, participantIds = []) =>
    run(() => apiClient.openLiveHeat(competition.id, { round: 3, titles, participantIds }), 'Form 3 (titles) is now on the judges’ screens.');

  const startTitleTiebreak = (result) => {
    const trunkNumbers = (result.tieRegistrationIds || [])
      .map((id) => result.votes.find((vote) => vote.registrationId === id)?.participant?.trunkNumber)
      .filter((value) => value != null)
      .join(', ');
    if (!window.confirm(`Approve a tie-break for "${result.title}"? Only tied trunk numbers ${trunkNumbers || 'shown in the result'} will be sent to the judges.`)) return;
    run(
      () => apiClient.openLiveHeat(competition.id, {
        round: 3,
        parentHeatId: result.rootHeatId,
        participantIds: result.tieRegistrationIds,
      }),
      `Title tie-break for "${result.title}" is now on the judges’ screens.`
    );
  };

  const saveAwards = (awards) => run(() => apiClient.setLiveTitleAwards(competition.id, awards), 'Title awards saved.');

  const resetAll = () => {
    const typed = window.prompt(`This deletes ALL live scoring data (forms, votes, qualifiers, titles) for "${competition.name}". Participants are NOT affected.\n\nType RESET to confirm.`);
    if (typed !== 'RESET') return;
    run(() => apiClient.resetLiveScoring(competition.id), 'Live scoring data reset.');
  };
  const endCompetition = async () => {
    if (openHeat) return notify('Close or cancel the current form first.', 'error');
    if (!window.confirm(`End "${competition.name}" and move it to History?`)) return;
    const ended = await run(() => apiClient.toggleCompetitionCompletion(null, competition.id, true), 'Competition moved to History.');
    if (ended) onBack();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#222222] to-[#171717] p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBack} className="px-2.5" title="All competitions" aria-label="All competitions"><ArrowLeft className="h-4 w-4" /></GhostButton>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Live scoring</p>
            <h2 className="font-display text-2xl font-extrabold text-white uppercase">{competition.name}</h2>
            <p className="text-[11px] text-zinc-500">{competition.venue || 'Venue not set'} · {formatDate(competition.eventDate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={() => load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</GhostButton>
          <GhostButton onClick={endCompetition} disabled={busy || Boolean(openHeat)}><CheckCircle2 className="h-3.5 w-3.5" /> End competition</GhostButton>
          <GhostButton onClick={() => setShowHistory((v) => !v)}><History className="h-3.5 w-3.5" /> Form history</GhostButton>
          <GhostButton onClick={resetAll} className="border-red-500/30 text-red-300"><RotateCcw className="h-3.5 w-3.5" /> Reset scoring</GhostButton>
        </div>
      </div>

      {message && <Banner tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Banner>}

      <OpenHeatPanel heat={openHeat} judges={judges} busy={busy} onClose={closeHeat} onCancel={cancelHeat} onUnlock={unlockSheet} />

      <LiveJudgesPanel competition={competition} judges={judges} competitions={competitions} onChanged={() => load({ silent: true })} onMessage={notify} />

      {showHistory && (
        <SectionCard title="Form history" subtitle="Every form sent to judges, newest first." icon={History}>
          {dash.heats.length === 0 ? (
            <p className="text-xs text-zinc-500">No forms yet.</p>
          ) : (
            <div className="space-y-1.5">
              {dash.heats.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-[#1d1d1d] px-3 py-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${h.status === 'OPEN' ? 'bg-amber-500/15 text-amber-300' : h.status === 'CLOSED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{h.status}</span>
                  <span className="font-semibold text-white">{h.label}</span>
                  <span className="text-zinc-500">{h.submittedCount}/{h.totalJudges} sheets · {new Date(h.openedAt).toLocaleTimeString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Round tabs */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ROUND_TABS.map((t) => {
          const Icon = t.icon;
          const active = roundTab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setRoundTab(t.key)} className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${active ? 'border-[#F15A24] bg-[#F15A24]/10' : 'border-white/[0.08] bg-[#171717] hover:border-[#F15A24]/40'}`}>
              <Icon className={`h-5 w-5 ${active ? 'text-[#F15A24]' : 'text-zinc-500'}`} />
              <span>
                <span className="block text-xs font-bold text-white">{t.label}</span>
                <span className="block text-[10px] text-zinc-500">{t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {roundTab === 1 && (
        <SectionCard title="Round 1 · Three elimination stages" subtitle="Stage 1 selects up to 20, Stage 2 selects up to 5, Stage 3 selects one winner per category." icon={Vote}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Round 1 elimination stage">
              {[1, 2, 3].map((stage) => <button key={stage} type="button" role="tab" aria-selected={round1Stage === stage} onClick={() => setRound1Stage(stage)} className={`rounded-lg border px-4 py-2 text-xs font-bold ${round1Stage === stage ? 'border-[#F15A24] bg-[#F15A24]/15 text-white' : 'border-white/10 text-zinc-400'}`}>Stage {stage} · Select {stage === 1 ? '20' : stage === 2 ? '5' : '1'}</button>)}
            </div>
            {dash.round1.divisions.length === 0 && <p className="text-xs text-zinc-500">This competition has no categories.</p>}
            {dash.round1.divisions.map((d) => (
              <Round1Division
                key={d.divisionKey}
                division={d}
                category={categoriesById.get(d.categoryId)}
                judges={judges}
                openHeat={openHeat}
                busy={busy}
                stage={round1Stage}
                onStart={startRound1}
                onTiebreak={(division, group, results) =>
                  startTiebreak(1, division.stages?.[round1Stage - 1]?.rootHeatId, group, results, `${division.categoryName} Stage ${round1Stage} (position ${group.position})`, division.stages?.[round1Stage - 1]?.target || (round1Stage === 1 ? 20 : round1Stage === 2 ? 5 : 1))
                }
                onQualify={qualify}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {roundTab === 2 && (
        <Round2Panel
          dash={dash}
          busy={busy}
          onStart={startRound2}
          onTiebreak={(group, results) => startTiebreak(2, dash.round2.rootHeatId, group, results, `Round 2 (position ${group.position})`)}
        />
      )}

      {roundTab === 3 && (
        <Round3Panel
          dash={dash}
          busy={busy}
          onStartForm3={startForm3}
          onTitleTiebreak={startTitleTiebreak}
          onSaveAwards={saveAwards}
        />
      )}

      {roundTab === 4 && <FinalResultsPanel dash={dash} />}

      {modal && <StartFormModal config={modal} busy={busy} onClose={() => setModal(null)} onConfirm={modal.onConfirm} />}
    </div>
  );
}
