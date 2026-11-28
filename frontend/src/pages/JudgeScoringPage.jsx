import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Lock, RotateCcw, Send, X } from 'lucide-react';
import { apiClient } from '../lib/apiClient.js';

/**
 * Judge's private scoring screen (/score/:token).
 * Shows ONLY trunk numbers — never participant names or details.
 * Form 1 = mark X (voting), Form 2 = rank, Form 3 = titles.
 */

function FormNumber({ n }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-red-600 font-display text-2xl font-extrabold text-red-600">
      {n}
    </span>
  );
}

function SheetHeader({ state }) {
  const { heat, competition, judge } = state;
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-black/80 pb-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wider text-black/60 uppercase">{competition.name}</p>
        <h1 className="font-display text-2xl leading-tight font-extrabold text-black uppercase">
          {heat.round === 1 ? 'Selection' : heat.round === 2 ? 'Final Ranking' : 'Title Winner'}
          {heat.isTiebreak && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 align-middle text-xs text-white">TIE-BREAK</span>}
        </h1>
        <p className="text-sm font-semibold text-black/80">
          {heat.categoryName ? `Category: ${heat.categoryName}` : heat.label}
        </p>
        <p className="text-[11px] text-black/60">Judge: {judge.name}</p>
      </div>
      <FormNumber n={heat.round} />
    </div>
  );
}

function ConfirmSheet({ title, lines, onCancel, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-black shadow-2xl">
        <h2 className="font-display text-xl font-extrabold uppercase">{title}</h2>
        <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto text-sm">
          {lines.map((l, i) => (
            <p key={i} className="rounded-lg bg-black/5 px-3 py-2 font-semibold">{l}</p>
          ))}
        </div>
        <p className="mt-3 text-xs text-black/60">After submitting you cannot change your sheet. Ask the admin to reopen it if needed.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 rounded-xl border-2 border-black/20 py-3 text-sm font-bold">Back</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Form 1: X marks ----------------
function Form1({ heat, onSubmit, busy }) {
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const limit = heat.selectionLimit;
  const half = Math.ceil(heat.participants.length / 2);
  const columns = heat.participants.length > 8 ? [heat.participants.slice(0, half), heat.participants.slice(half)] : [heat.participants];
  const byId = new Map(heat.participants.map((p) => [p.id, p]));

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (limit && prev.length >= limit) return prev;
      return [...prev, id];
    });
  };

  return (
    <>
      <p className="mt-3 text-sm font-semibold text-black">
        Procedure: Mark the <u>best</u> competitor(s) with “X”.{' '}
        {limit ? <span className="text-red-600">Maximum {limit}.</span> : <span className="text-black/60">No limit.</span>}
      </p>
      <div className={`mt-3 grid gap-3 ${columns.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {columns.map((col, ci) => (
          <table key={ci} className="w-full border-2 border-black text-black">
            <thead>
              <tr className="bg-black/5 text-xs font-bold uppercase">
                <th className="border border-black px-2 py-1.5">Number</th>
                <th className="border border-black px-2 py-1.5">Selection</th>
              </tr>
            </thead>
            <tbody>
              {col.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <tr key={p.id} onClick={() => toggle(p.id)} className={`cursor-pointer select-none ${on ? 'bg-red-50' : ''}`}>
                    <td className="border border-black px-2 py-2 text-center font-display text-2xl font-extrabold">{p.trunkNumber ?? '—'}</td>
                    <td className="border border-black px-2 py-1 text-center">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${on ? 'text-red-600' : 'text-black/10'}`}>
                        <X className="h-9 w-9" strokeWidth={on ? 4 : 2} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
      <div className="sticky bottom-0 mt-4 -mx-4 border-t-2 border-black/10 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold text-black">
            {selected.length} marked{limit ? ` / ${limit}` : ''}
          </p>
          <button type="button" onClick={() => setSelected([])} disabled={!selected.length} className="rounded-xl border-2 border-black/20 px-3 py-3 text-sm font-bold text-black disabled:opacity-40">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setConfirm(true)} disabled={!selected.length || busy} className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
            <Send className="h-4 w-4" /> Submit sheet
          </button>
        </div>
      </div>
      {confirm && (
        <ConfirmSheet
          title="Submit your X marks?"
          lines={[`Marked trunk numbers: ${selected.map((id) => byId.get(id)?.trunkNumber).sort((a, b) => a - b).join(', ')}`]}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => { await onSubmit({ selected }); setConfirm(false); }}
        />
      )}
    </>
  );
}

// ---------------- Form 2: ranking ----------------
function Form2({ heat, onSubmit, busy }) {
  const n = heat.participants.length;
  const [ranks, setRanks] = useState({});
  const [confirm, setConfirm] = useState(false);
  const used = new Map();
  Object.entries(ranks).forEach(([id, r]) => {
    if (r) used.set(r, [...(used.get(r) || []), id]);
  });
  const duplicates = [...used.entries()].filter(([, ids]) => ids.length > 1).map(([r]) => r);
  const complete = heat.participants.every((p) => ranks[p.id]) && duplicates.length === 0;

  const setRank = (id, rank) => setRanks((prev) => ({ ...prev, [id]: rank }));

  return (
    <>
      <p className="mt-3 text-sm font-semibold text-black">Give every competitor a unique number vote. <strong>{n} = best (1 = lowest); highest total ranks 1st.</strong></p>
      <table className="mt-3 w-full border-2 border-black text-black">
        <thead>
          <tr className="bg-black/5 text-xs font-bold uppercase">
            <th className="border border-black px-2 py-1.5">Competitor Number</th>
            <th className="border border-black px-2 py-1.5">Number Vote (1–{n})</th>
          </tr>
        </thead>
        <tbody>
          {heat.participants.map((p) => {
            const r = ranks[p.id];
            const dup = r && duplicates.includes(r);
            return (
              <tr key={p.id}>
                <td className="w-1/3 border border-black px-2 py-2 text-center font-display text-3xl font-extrabold">{p.trunkNumber ?? '—'}</td>
                <td className="border border-black p-2">
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {Array.from({ length: n }, (_, i) => i + 1).map((rank) => {
                      const takenByOther = used.has(rank) && !(used.get(rank) || []).includes(p.id);
                      const on = r === rank;
                      return (
                        <button
                          type="button"
                          key={rank}
                          onClick={() => setRank(p.id, on ? undefined : rank)}
                          className={`h-11 min-w-11 rounded-lg border-2 font-display text-lg font-extrabold ${
                            on ? (dup ? 'border-red-600 bg-red-600 text-white' : 'border-black bg-black text-white') : takenByOther ? 'border-black/10 text-black/25' : 'border-black/30 text-black'
                          }`}
                        >
                          {rank}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {duplicates.length > 0 && <p className="mt-2 text-sm font-bold text-red-600">Points {duplicates.join(', ')} used more than once.</p>}
      <div className="sticky bottom-0 mt-4 -mx-4 border-t-2 border-black/10 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold text-black">{Object.values(ranks).filter(Boolean).length} / {n} ranked</p>
          <button type="button" onClick={() => setRanks({})} className="rounded-xl border-2 border-black/20 px-3 py-3 text-sm font-bold text-black"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={() => setConfirm(true)} disabled={!complete || busy} className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
            <Send className="h-4 w-4" /> Submit sheet
          </button>
        </div>
      </div>
      {confirm && (
        <ConfirmSheet
          title="Submit your points?"
          lines={[...heat.participants].sort((a, b) => ranks[b.id] - ranks[a.id]).map((p) => `${ranks[p.id]} points → Trunk #${p.trunkNumber}`)}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => { await onSubmit({ ranks }); setConfirm(false); }}
        />
      )}
    </>
  );
}

// ---------------- Form 3: titles ----------------
function Form3({ heat, onSubmit, busy }) {
  const [choice, setChoice] = useState({});
  const [confirm, setConfirm] = useState(false);
  const byId = new Map(heat.participants.map((p) => [p.id, p]));
  const complete = heat.titles.length > 0 && heat.titles.every((t) => Boolean(choice[t]) && byId.has(choice[t]));

  const toggleChoice = (title, participantId) => {
    setChoice((prev) => ({
      ...prev,
      [title]: prev[title] === participantId ? undefined : participantId,
    }));
  };

  return (
    <>
      <p className="mt-3 text-sm font-semibold text-black">Tap one trunk number for the title below, verify your selection, then submit.</p>
      <div className="mt-3 space-y-4">
        {heat.titles.map((title) => {
          const pickedId = choice[title];
          const pickedParticipant = pickedId ? byId.get(pickedId) : null;
          return (
            <div key={title} className="overflow-hidden rounded-2xl border-2 border-black bg-white">
              <div className="bg-zinc-950 px-4 py-3 text-white">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Title being judged</p>
                <h2 className="mt-0.5 font-display text-2xl font-extrabold tracking-wide uppercase sm:text-3xl">{title}</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {heat.participants.map((p) => {
                    const on = pickedId === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        aria-pressed={on}
                        onClick={() => toggleChoice(title, p.id)}
                        className={`relative flex h-20 flex-col items-center justify-center rounded-xl border-2 px-2 transition-all active:scale-[0.98] ${
                          on
                            ? 'border-red-700 bg-red-600 text-white shadow-lg shadow-red-600/25'
                            : 'border-black/25 bg-zinc-50 text-black hover:border-black'
                        }`}
                      >
                        {on && <CheckCircle2 className="absolute top-1.5 right-1.5 h-4 w-4 text-white" />}
                        <span className="font-display text-3xl leading-none font-extrabold">#{p.trunkNumber}</span>
                        <span className={`mt-1 text-[10px] font-bold tracking-wider uppercase ${on ? 'text-white' : 'text-black/45'}`}>
                          {on ? 'Selected' : 'Tap'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div
                  role="status"
                  className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold ${
                    pickedParticipant
                      ? 'border-red-600/30 bg-red-50 text-red-700'
                      : 'border-black/10 bg-black/5 text-black/60'
                  }`}
                >
                  <span>
                    {pickedParticipant
                      ? `${title} → Trunk #${pickedParticipant.trunkNumber}`
                      : `Choose one trunk number for ${title}`}
                  </span>
                  {pickedParticipant && (
                    <button
                      type="button"
                      onClick={() => toggleChoice(title, pickedParticipant.id)}
                      className="rounded-lg border border-red-600/30 bg-white px-2 py-0.5 text-[11px] font-bold text-red-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-4 -mx-4 border-t-2 border-black/10 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold text-black">
            {heat.titles.filter((t) => choice[t]).length} / {heat.titles.length} selected
          </p>
          <button
            type="button"
            onClick={() => setChoice({})}
            disabled={!heat.titles.some((t) => choice[t])}
            className="rounded-xl border-2 border-black/20 px-3 py-3 text-sm font-bold text-black disabled:opacity-40"
            aria-label="Reset selection"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setConfirm(true)} disabled={!complete || busy} className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
            <Send className="h-4 w-4" /> Submit sheet
          </button>
        </div>
      </div>
      {confirm && (
        <ConfirmSheet
          title="Submit your title vote?"
          lines={heat.titles.map((t) => `${t} → Trunk #${byId.get(choice[t])?.trunkNumber}`)}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            const cleanTitles = {};
            heat.titles.forEach((t) => {
              if (choice[t]) cleanTitles[t] = choice[t];
            });
            await onSubmit({ titles: cleanTitles });
            setConfirm(false);
          }}
        />
      )}
    </>
  );
}

function SubmittedSummary({ state }) {
  const { heat, mySubmission } = state;
  const byId = new Map(heat.participants.map((p) => [p.id, p]));
  const payload = mySubmission?.payload || {};
  let lines = [];
  if (heat.round === 1) {
    lines = [`X marked: ${(payload.selected || []).map((id) => byId.get(id)?.trunkNumber).sort((a, b) => a - b).join(', ')}`];
  } else if (heat.round === 2) {
    lines = Object.entries(payload.ranks || {})
      .sort((a, b) => b[1] - a[1])
      .map(([id, r]) => `${r} points → #${byId.get(id)?.trunkNumber}`);
  } else {
    lines = Object.entries(payload.titles || {}).map(([t, id]) => `${t} → #${byId.get(id)?.trunkNumber}`);
  }
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <CheckCircle2 className="h-16 w-16 text-emerald-500" />
      <h2 className="mt-3 font-display text-3xl font-extrabold text-white uppercase">Sheet submitted</h2>
      <p className="mt-1 text-sm text-zinc-400">{heat.label}</p>
      <div className="mt-5 w-full max-w-sm space-y-1 text-left">
        {lines.map((l, i) => (
          <p key={i} className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200">{l}</p>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for the admin to close this form…</p>
    </div>
  );
}

export function JudgeScoringPage() {
  const { token } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const failures = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.fetchJudgeScoringState(token);
      setState(data);
      setError('');
      setFatal(false);
      failures.current = 0;
    } catch (err) {
      failures.current += 1;
      if ([403, 404, 410].includes(err.status)) {
        setFatal(true);
        setError(err.message);
      } else if (failures.current >= 2) {
        setError('Connection problem — retrying…');
      }
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  // Keep the phone screen awake while judging (where supported)
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not supported */
      }
    };
    request();
    const onVis = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    document.title = 'Judge Sheet';
  }, []);

  const heatId = state?.heat?.id || null;
  const prevHeat = useRef(heatId);
  useEffect(() => {
    if (prevHeat.current !== heatId) {
      prevHeat.current = heatId;
      setNotice('');
    }
  }, [heatId]);

  const submit = async (payload) => {
    if (!state?.heat) return;
    setBusy(true);
    setNotice('');
    try {
      await apiClient.submitJudgeScoringSheet(token, state.heat.id, payload);
      await load();
    } catch (err) {
      setNotice(err.message || 'Could not submit. Please try again.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const formKey = useMemo(() => `${heatId}:${state?.screen}`, [heatId, state?.screen]);

  if (fatal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] p-6 text-center text-white">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-3 font-display text-2xl font-extrabold uppercase">Link not valid</h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
      </div>
    );
  }

  if (state.screen === 'LOCKED') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-end bg-black p-6 pb-10 text-center">
        <Lock className="h-5 w-5 text-zinc-800" />
        <p className="mt-2 text-[11px] text-zinc-800">Sheet closed · results are with the admin · please wait</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-2 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-300">{error}</p>}

        {state.screen === 'WAITING' && (
          <div className="flex min-h-[85vh] flex-col items-center justify-center text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#F15A24]" />
            <h1 className="mt-4 font-display text-3xl font-extrabold text-white uppercase">Please wait</h1>
            <p className="mt-1 text-sm text-zinc-400">The admin will open the next form shortly.</p>
            <p className="mt-6 text-xs text-zinc-600">{state.competition.name} · Judge {state.judge.name}</p>
          </div>
        )}

        {state.screen === 'SUBMITTED' && state.heat && <SubmittedSummary state={state} />}

        {state.screen === 'FORM' && state.heat && (
          <div key={formKey} className="rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <SheetHeader state={state} />
            {notice && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{notice}</p>}
            {state.heat.round === 1 && <Form1 heat={state.heat} onSubmit={submit} busy={busy} />}
            {state.heat.round === 2 && <Form2 heat={state.heat} onSubmit={submit} busy={busy} />}
            {state.heat.round === 3 && <Form3 key={state.heat.id} heat={state.heat} onSubmit={submit} busy={busy} />}
          </div>
        )}
      </div>
    </div>
  );
}
