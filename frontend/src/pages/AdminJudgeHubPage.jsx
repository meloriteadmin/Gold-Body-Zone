import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  ArrowLeft,
  ClipboardCheck,
  Gavel,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Trophy,
  UserPlus,
  Users,
  Vote,
} from 'lucide-react';
import { CreateJudgeModal } from '../components/admin/live/LiveJudgesPanel.jsx';
import { CategoryBoard } from '../components/admin/live/CategoryBoard.jsx';
import { LiveScoringWorkspace } from '../components/admin/live/LiveScoringWorkspace.jsx';
import { Banner } from '../components/admin/live/liveUi.jsx';
import { apiClient } from '../lib/apiClient.js';
import { getCompetitionPoster } from '../utils/competitionHelpers.js';
import { formatDate } from '../utils/formatters.js';
import { AdminJudgeManagementPage } from './AdminJudgeManagementPage.jsx';

const TABS = [
  { key: 'board', label: 'Category Line-up', hint: 'Search, verify and assign trunk numbers by category', icon: Layers },
  { key: 'live', label: 'Run Live Judging', hint: 'Judges, Forms 1–3 and final results', icon: Vote },
  { key: 'classic', label: 'Classic Tools', hint: 'Previous judge workflow (advanced)', icon: Users },
];

function CompetitionPicker({ competitions, loading, onPick, tab }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return competitions;
    return competitions.filter((c) => `${c.name} ${c.competitionType} ${c.venue || ''}`.toLowerCase().includes(term));
  }, [competitions, q]);

  if (loading && competitions.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#171717] py-20">
        <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competitions…" className="h-10 w-full rounded-xl border border-white/10 bg-[#171717] pr-4 pl-10 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none" />
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#1a1a1a] p-12 text-center">
          <Trophy className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-sm font-semibold text-white">No active competitions.</p>
          <p className="mt-1 text-xs text-zinc-500">Completed competitions are in History.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <button type="button" key={c.id} onClick={() => onPick(c.id)} className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] text-left shadow-lg transition-all hover:-translate-y-0.5 hover:border-[#F15A24]/60">
              <div className="relative aspect-[16/8] overflow-hidden bg-[#121212]">
                <img src={getCompetitionPoster(c)} alt="" className="h-full w-full object-cover opacity-80 transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute top-3 right-3 left-3 flex justify-between gap-2">
                  <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">{c.competitionType}</span>
                  {c.hasOpenHeat ? (
                    <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black uppercase">Form live</span>
                  ) : c.liveRound > 0 ? (
                    <span className="rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-black uppercase">Round {c.liveRound}</span>
                  ) : !c.isPublished ? (
                    <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white uppercase">Draft</span>
                  ) : null}
                </div>
                <p className="absolute right-3 bottom-2 left-3 font-display text-xl font-extrabold text-white uppercase">{c.name}</p>
              </div>
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-[#F15A24]" />{formatDate(c.eventDate)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#F15A24]" />{c.venue || 'Venue not set'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/[0.04] py-1.5"><p className="font-display text-lg font-bold text-white">{c.categoriesCount}</p><p className="text-[9px] text-zinc-500 uppercase">Categories</p></div>
                  <div className="rounded-lg bg-white/[0.04] py-1.5"><p className="font-display text-lg font-bold text-emerald-400">{c.eligibleCount}</p><p className="text-[9px] text-zinc-500 uppercase">Paid</p></div>
                  <div className="rounded-lg bg-white/[0.04] py-1.5"><p className={`font-display text-lg font-bold ${c.withTrunkCount < c.eligibleCount ? 'text-amber-400' : 'text-[#F15A24]'}`}>{c.withTrunkCount}</p><p className="text-[9px] text-zinc-500 uppercase">Trunk No.</p></div>
                </div>
                <p className="text-right text-[11px] font-bold text-[#F15A24]">
                  Open category board →
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminJudgeHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'board';
  const competitionId = params.get('c') || '';
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(''), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const loadCompetitions = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.fetchLiveCompetitions();
      setCompetitions(data.competitions || []);
      setError('');
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load competitions.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  useEffect(() => {
    const refresh = () => loadCompetitions({ silent: true });
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [loadCompetitions]);

  useEffect(() => {
    if (tab === 'classic' || competitionId) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) loadCompetitions({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [tab, competitionId, loadCompetitions]);

  const setTab = (key) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next);
  };
  const pick = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id);
    else next.delete('c');
    if (id) next.set('tab', 'board');
    setParams(next);
  };

  const competition = competitions.find((c) => c.id === competitionId) || (competitionId ? { id: competitionId, name: 'Competition' } : null);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24]/20 to-[#E94B16]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30">
            <Gavel className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">Judging Control Room</h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">Verify participants, manage judges and run Round 1 → Round 2 → Round 3 live.</p>
          </div>
        </div>
      {competition && tab !== 'classic' && (
          <div className="flex gap-2">
            <button type="button" onClick={() => loadCompetitions()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-3.5 py-2 text-xs font-bold text-white">
              <UserPlus className="h-3.5 w-3.5" /> Create Judge
            </button>
          </div>
        )}
      </div>

      {competition && <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(t.key)} className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${active ? 'border-[#F15A24] bg-gradient-to-r from-[#F15A24]/20 to-[#E94B16]/5' : 'border-white/[0.08] bg-[#171717] hover:border-[#F15A24]/40'}`}>
              <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#F15A24]' : 'text-zinc-500'}`} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-white">{t.label}</span>
                <span className="block truncate text-[10px] text-zinc-500">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>}

      {flash && <Banner tone="success" onClose={() => setFlash('')}>{flash}</Banner>}
      {error && tab !== 'classic' && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}

      {!competition ? (
        <CompetitionPicker competitions={competitions} loading={loading} onPick={pick} tab={tab} />
      ) : tab === 'classic' ? (
        <div className="space-y-4">
          <button type="button" onClick={() => pick('')} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-[#F15A24]/50 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All competitions
          </button>
          <AdminJudgeManagementPage />
        </div>
      ) : tab === 'live' ? (
        <LiveScoringWorkspace key={competition.id} competitionId={competition.id} competitions={competitions} onBack={() => pick('')} />
      ) : (
        <CategoryBoard key={competition.id} competition={competition} onBack={() => pick('')} />
      )}

      {createOpen && (
        <CreateJudgeModal
          competitions={competitions}
          defaultCompetitionId={competitionId}
          onClose={() => setCreateOpen(false)}
          onCreated={(judge, compId) => {
            const comp = competitions.find((c) => c.id === compId);
            setFlash(`Judge "${judge.name}" created for ${comp?.name || 'the competition'}. Open Live Scoring → Judges Panel to copy their private link.`);
            if (tab === 'live' && compId !== competitionId) pick(compId);
          }}
        />
      )}
    </div>
  );
}
