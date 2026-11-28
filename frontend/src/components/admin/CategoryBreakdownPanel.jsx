import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient.js';

const TYPE_LABEL = { WEIGHT: 'Weight', HEIGHT: 'Height', OPEN: 'Open' };

function StatPill({ label, value, tone = 'zinc' }) {
  const tones = {
    zinc: 'border-white/10 bg-white/[0.03] text-white',
    emerald: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/25 bg-amber-500/5 text-amber-400',
    blue: 'border-blue-500/25 bg-blue-500/5 text-blue-400',
    orange: 'border-[#F15A24]/30 bg-[#F15A24]/5 text-[#F15A24]',
  };
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-center ${tones[tone]}`}>
      <p className="text-[9px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</p>
      <p className="font-display text-base leading-tight font-bold">{value}</p>
    </div>
  );
}

function statusChip(reg) {
  if (reg.registrationStatus === 'CANCELLED') {
    return <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400 uppercase">Cancelled</span>;
  }
  if (reg.paymentStatus !== 'PAID') {
    return <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 uppercase">{reg.paymentStatus}</span>;
  }
  if (reg.registrationStatus !== 'CONFIRMED') {
    return <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 uppercase">{reg.registrationStatus}</span>;
  }
  return <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase">Paid</span>;
}

/**
 * Category-wise participant breakdown for one competition, based on the
 * categories / groups configured when the competition was created.
 *
 * mode="filter": clicking a category calls onSelectCategory (used to filter a table).
 * mode="expand": clicking a category shows its participants (optionally editable).
 */
export function CategoryBreakdownPanel({
  competitionId,
  refreshKey = 0,
  mode = 'filter',
  selectedCategoryId = '',
  onSelectCategory,
  onEditParticipant,
  onAddManual,
  onDeleteParticipant,
  hideCancelled = false,
  collapsible = false,
  autoRefreshMs = 20000,
  title = 'Participants by Category',
}) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!competitionId) return;
      if (!silent) setLoading(true);
      try {
        const data = await apiClient.fetchCategoryBoard(competitionId);
        if (!mountedRef.current) return;
        setBoard(data);
        setError('');
      } catch (err) {
        if (!silent && mountedRef.current) setError(err.message || 'Failed to load category breakdown.');
      } finally {
        if (!silent && mountedRef.current) setLoading(false);
      }
    },
    [competitionId]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setBoard(null);
    setExpandedId('');
    load();
  }, [load]);

  useEffect(() => {
    if (refreshKey) load({ silent: true });
  }, [refreshKey, load]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) load({ silent: true });
    }, autoRefreshMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshMs, load]);

  useEffect(() => {
    const refresh = () => load({ silent: true });
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [load]);

  const expandedCategory = useMemo(
    () => board?.categories?.find((c) => c.id === expandedId) || null,
    [board, expandedId]
  );

  const visibleParticipants = useMemo(() => {
    if (!expandedCategory) return [];
    let list = expandedCategory.participants || [];
    if (hideCancelled && !showCancelled) list = list.filter((p) => p.registrationStatus !== 'CANCELLED');
    if (groupFilter === '__none') list = list.filter((p) => !p.groupId);
    else if (groupFilter) list = list.filter((p) => p.groupId === groupFilter);
    const q = listSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.participantName?.toLowerCase().includes(q) ||
          p.registrationCode?.toLowerCase().includes(q) ||
          String(p.trunkNumber ?? '').includes(q) ||
          p.mobileNumber?.includes(q) ||
          p.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [expandedCategory, groupFilter, listSearch, hideCancelled, showCancelled]);

  if (!competitionId) return null;

  const handleCardClick = (cat) => {
    if (mode === 'filter') {
      onSelectCategory?.(selectedCategoryId === cat.id ? '' : cat.id);
    } else {
      setExpandedId((prev) => (prev === cat.id ? '' : cat.id));
      setGroupFilter('');
      setListSearch('');
    }
  };

  const activeId = mode === 'filter' ? selectedCategoryId : expandedId;
  const selectedName = board?.categories?.find((c) => c.id === selectedCategoryId)?.name;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F15A24]/10 text-[#F15A24]">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold tracking-wide text-white uppercase">{title}</h3>
            <p className="text-[11px] text-zinc-500">
              {mode === 'filter'
                ? 'Click a category to filter the participant table below.'
                : 'Click a category to see its participants and trunk numbers.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'filter' && selectedCategoryId && (
            <button
              type="button"
              onClick={() => onSelectCategory?.('')}
              className="inline-flex items-center gap-1 rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-1 text-[11px] font-bold text-[#F15A24]"
            >
              Showing: {selectedName || 'Category'} <X className="h-3 w-3" />
            </button>
          )}
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          {loading && !board ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" />
            </div>
          ) : error && !board ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
              <button type="button" onClick={() => load()} className="ml-auto font-bold text-red-300 hover:text-white">
                Retry
              </button>
            </div>
          ) : !board?.categories?.length ? (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
              This competition has no categories configured.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <StatPill label="Total" value={board.summary.total} />
                <StatPill label="Confirmed & Paid" value={board.summary.confirmedPaid} tone="emerald" />
                <StatPill label="Pending" value={board.summary.pendingPayment} tone="amber" />
                <StatPill label="Cancelled" value={board.summary.cancelled} />
                <StatPill label="Trunk No. Given" value={board.summary.withTrunk} tone="orange" />
                <StatPill label="Verified" value={board.summary.verified} tone="blue" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {board.categories.map((cat) => {
                  const isActive = activeId === cat.id;
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => handleCardClick(cat)}
                      className={`rounded-xl border p-3.5 text-left transition-all ${
                        isActive
                          ? 'border-[#F15A24] bg-[#F15A24]/10 ring-1 ring-[#F15A24]/40'
                          : 'border-white/[0.08] bg-[#1d1d1d] hover:border-[#F15A24]/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-display text-lg font-bold text-white">{cat.name}</p>
                          <p className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                            {TYPE_LABEL[cat.categoryType] || cat.categoryType} · {cat.gender}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-white/[0.06] px-2 py-1 font-display text-xl font-extrabold text-white">
                          {cat.summary.total}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                          {cat.summary.confirmedPaid} paid
                        </span>
                        {cat.summary.pendingPayment > 0 && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                            {cat.summary.pendingPayment} pending
                          </span>
                        )}
                        <span className="rounded bg-[#F15A24]/10 px-1.5 py-0.5 text-[#F15A24]">
                          {cat.summary.withTrunk} trunk no.
                        </span>
                        {cat.summary.verified > 0 && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400">
                            {cat.summary.verified} verified
                          </span>
                        )}
                      </div>
                      {cat.groups.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cat.groups.map((g) => (
                            <span key={g.id} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                              {g.name}: <strong className="text-white">{g.summary.total}</strong>
                            </span>
                          ))}
                          {cat.ungroupedCount > 0 && (
                            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                              No group: {cat.ungroupedCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {board.uncategorized?.length > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  {board.uncategorized.length} participant(s) belong to a category that no longer exists. Edit them to move them into a valid category.
                </p>
              )}

              {mode === 'expand' && expandedCategory && (
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                    <p className="font-display text-base font-bold text-white uppercase">
                      {expandedCategory.name}{' '}
                      <span className="text-xs font-semibold text-zinc-500">
                        ({visibleParticipants.length} shown)
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {onAddManual && <button type="button" onClick={() => onAddManual(expandedCategory.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#F15A24] px-2.5 py-1.5 text-[11px] font-bold text-white"><Plus className="h-3.5 w-3.5" /> Manual registration</button>}
                      {hideCancelled && <label className="flex items-center gap-1 text-[11px] text-zinc-400"><input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} /> Show removed</label>}
                      {expandedCategory.groups.length > 0 && (
                        <select
                          value={groupFilter}
                          onChange={(e) => setGroupFilter(e.target.value)}
                          className="h-8 rounded-lg border border-white/10 bg-[#222222] px-2 text-[11px] text-white focus:border-[#F15A24] focus:outline-none"
                        >
                          <option value="">All groups</option>
                          {expandedCategory.groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                          <option value="__none">No group</option>
                        </select>
                      )}
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          placeholder="Filter list…"
                          className="h-8 w-40 rounded-lg border border-white/10 bg-[#222222] pr-2 pl-7 text-[11px] text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  {visibleParticipants.length === 0 ? (
                    <p className="p-6 text-center text-xs text-zinc-500">No participants in this view.</p>
                  ) : (
                    <div className="max-h-[520px] overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-[#1a1a1a] text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                          <tr>
                            <th className="px-3 py-2.5">Trunk No.</th>
                            <th className="px-3 py-2.5">Participant</th>
                            <th className="px-3 py-2.5">Group</th>
                            <th className="px-3 py-2.5">Weight / Height</th>
                            <th className="px-3 py-2.5">Gym / District</th>
                            <th className="px-3 py-2.5">Status</th>
                            {(onEditParticipant || onDeleteParticipant) && <th className="px-3 py-2.5 text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                          {visibleParticipants.map((p) => (
                            <tr key={p.id} className="hover:bg-white/[0.02]">
                              <td className="px-3 py-2.5">
                                {p.trunkNumber != null ? (
                                  <span className="inline-flex min-w-10 justify-center rounded-lg bg-[#F15A24] px-2 py-1 font-display text-base font-extrabold text-white">
                                    {p.trunkNumber}
                                  </span>
                                ) : (
                                  <span className="rounded-lg border border-dashed border-white/20 px-2 py-1 text-[10px] text-zinc-500">
                                    Not set
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="flex items-center gap-1.5 font-bold text-white">
                                  {p.participantName}
                                  {p.verifiedAt && (
                                    <span title="Verified at venue">
                                      <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                                    </span>
                                  )}
                                </p>
                                <p className="font-mono text-[10px] text-[#F15A24]">{p.registrationCode}</p>
                              </td>
                              <td className="px-3 py-2.5 text-zinc-300">{p.groupName || '—'}</td>
                              <td className="px-3 py-2.5 text-zinc-300">
                                {p.weightKg != null ? `${p.weightKg} kg` : '—'} / {p.heightCm != null ? `${p.heightCm} cm` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-400">
                                <p className="text-zinc-300">{p.gymName}</p>
                                <p className="text-[10px]">{p.district}</p>
                              </td>
                              <td className="px-3 py-2.5">{statusChip(p)}</td>
                              {(onEditParticipant || onDeleteParticipant) && (
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex justify-end gap-1.5">
                                  {onEditParticipant && (
                                  <button
                                    type="button"
                                    onClick={() => onEditParticipant(p, () => load({ silent: true }))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:border-[#F15A24] hover:text-white"
                                  >
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
                                  )}
                                  {onDeleteParticipant && p.registrationStatus !== 'CANCELLED' && <button type="button" onClick={() => onDeleteParticipant(p)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300"><Trash2 className="h-3 w-3" /> Delete</button>}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {mode === 'expand' && !expandedCategory && (
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Select a category card above to open its participant list.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Suggests a category from weight / height using the category names
 * (e.g. "55–60 kg", "0-55 kg", "Under 175 cm", "Above 175 cm", "Upto 60 kg", "80+ kg").
 */
export function suggestCategoryForMeasurements(categories = [], weightKg, heightCm) {
  const parse = (name, unit) => {
    const n = (name || '').toLowerCase().replace(/–|—/g, '-');
    if (!n.includes(unit)) return null;
    let m = n.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
    if (m) return { min: Number(m[1]), max: Number(m[2]) };
    m = n.match(/(?:under|below|upto|up to|less than|<)\s*(\d+(?:\.\d+)?)/);
    if (m) return { min: -Infinity, max: Number(m[1]) };
    m = n.match(/(?:above|over|more than|>)\s*(\d+(?:\.\d+)?)/);
    if (m) return { min: Number(m[1]), max: Infinity, exclusiveMin: true };
    m = n.match(/(\d+(?:\.\d+)?)\s*\+/);
    if (m) return { min: Number(m[1]), max: Infinity, exclusiveMin: true };
    return null;
  };
  const pick = (value, unit, type) => {
    if (value == null || value === '' || Number.isNaN(Number(value))) return null;
    const v = Number(value);
    const ranges = categories
      .filter((c) => c.categoryType === type)
      .map((c) => ({ c, r: parse(c.name, unit) }))
      .filter((x) => x.r);
    // lower bound exclusive (e.g. 55-60 means >55 and <=60), first category inclusive
    const hit = ranges.find(({ r }) => (r.min === -Infinity || v > r.min || (v === r.min && r.min === 0)) && v <= r.max);
    return hit?.c || ranges.find(({ r }) => v >= r.min && v <= r.max)?.c || null;
  };
  return pick(weightKg, 'kg', 'WEIGHT') || pick(heightCm, 'cm', 'HEIGHT') || null;
}
