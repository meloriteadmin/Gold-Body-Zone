import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Search, ShieldCheck, UserSearch } from 'lucide-react';
import { apiClient } from '../../../lib/apiClient.js';
import { ParticipantEditModal } from '../ParticipantEditModal.jsx';
import { Banner, GhostButton, SectionCard, TrunkBadge } from './liveUi.jsx';

/**
 * Venue check-in desk: search a participant (nothing is listed until you search),
 * verify their details, correct anything and assign the trunk number.
 */
export function VerificationDesk({ competition, onBack, embedded = false, onManual, onSaved }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState('');
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState('');
  const inputRef = useRef(null);
  const requestId = useRef(0);
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(''), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    apiClient
      .fetchCategoryBoard(competition.id)
      .then((data) =>
        setCategories(
          (data.categories || []).map((c) => ({ id: c.id, name: c.name, categoryType: c.categoryType, groups: c.groups }))
        )
      )
      .catch(() => setCategories([]));
    inputRef.current?.focus();
  }, [competition.id]);

  const runSearch = useCallback(
    async (q) => {
      const term = q.trim();
      const id = ++requestId.current;
      if (!term) {
        setResults([]);
        setSearched('');
        setError('');
        return;
      }
      setSearching(true);
      try {
        const data = await apiClient.searchCompetitionParticipants(competition.id, term);
        if (id !== requestId.current) return;
        setResults(data.participants || []);
        setSearched(term);
        setError('');
      } catch (err) {
        if (id === requestId.current) setError(err.message || 'Search failed.');
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    },
    [competition.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => {
    const refresh = () => { if (query.trim()) runSearch(query); };
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [query, runSearch]);

  const handleSaved = (updated) => {
    setEditing(null);
    setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setFlash(`${updated.participantName} saved${updated.trunkNumber != null ? ` · Trunk #${updated.trunkNumber}` : ''}.`);
    onSaved?.(updated);
  };

  return (
    <div className="space-y-4">
      {!embedded && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#222222] to-[#171717] p-5">
        <GhostButton onClick={onBack} className="px-2.5"><ArrowLeft className="h-4 w-4" /></GhostButton>
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Participant verification</p>
          <h2 className="font-display text-2xl font-extrabold text-white uppercase">{competition.name}</h2>
        </div>
      </div>}

      <SectionCard title="Find participant" subtitle="Search by name, email, phone, registration code, trunk number, gym, district or Aadhaar last 4 digits." icon={UserSearch}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="h-14 w-full rounded-2xl border border-white/10 bg-[#222222] pr-12 pl-12 text-base text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
          />
          {searching && <Loader2 className="absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 animate-spin text-[#F15A24]" />}
        </div>
        {flash && <div className="mt-3"><Banner tone="success" onClose={() => setFlash('')}>{flash}</Banner></div>}
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}

        <div className="mt-4">
          {!searched ? (
            <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-zinc-500">
              No participants are listed until you search. Start typing above.
            </p>
          ) : results.length === 0 && !searching ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-zinc-500">
              <p>No participant matches “{searched}” in this competition.</p>
              {onManual && <button type="button" onClick={onManual} className="mt-3 rounded-lg bg-[#F15A24] px-4 py-2 font-bold text-white">Manual registration</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1d1d1d] p-3 text-left hover:border-[#F15A24]/60"
                >
                  <TrunkBadge value={p.trunkNumber} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                      {p.participantName}
                      {p.verifiedAt && <ShieldCheck className="h-4 w-4 text-blue-400" />}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      <span className="font-mono text-[#F15A24]">{p.registrationCode}</span> · {p.mobileNumber} · {p.email}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {p.category?.name || 'No category'}{p.groupName ? ` · ${p.groupName}` : ''} · {p.weightKg ?? '—'} kg · {p.heightCm ?? '—'} cm · {p.gymName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.paymentStatus === 'PAID' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{p.paymentStatus}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.registrationStatus === 'CONFIRMED' ? 'bg-emerald-500/15 text-emerald-300' : p.registrationStatus === 'CANCELLED' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{p.registrationStatus}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1.5 text-xs font-semibold text-zinc-200">
                    <Pencil className="h-3.5 w-3.5" /> Verify / Edit
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {editing && (
        <ParticipantEditModal
          participant={editing}
          categories={categories}
          competitionId={competition.id}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
