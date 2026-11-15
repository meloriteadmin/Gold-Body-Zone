import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  Filter,
  History,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { formatDate, formatFee } from '../utils/formatters.js';

export function HistoryPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.fetchAdminCompetitions(accessToken, {
        history: true,
      });
      setCompetitions(res.competitions || []);
    } catch (err) {
      setError(err.message || 'Failed to load completed competitions.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleToggleCompletion = async (comp) => {
    const confirmMessage = `Re-open "${comp.name}"? This competition will be removed from History and restored to Active Competitions.`;

    if (!window.confirm(confirmMessage)) return;

    setTogglingId(comp.id);
    try {
      await apiClient.toggleCompetitionCompletion(accessToken, comp.id, false);
      setCompetitions((prev) => prev.filter((c) => c.id !== comp.id));
    } catch (err) {
      alert(err.message || 'Failed to update competition completion status.');
    } finally {
      setTogglingId(null);
    }
  };

  const filteredCompetitions = useMemo(() => {
    return competitions.filter((comp) => {
      // Event Type filter
      if (typeFilter !== 'ALL' && comp.competitionType !== typeFilter) {
        return false;
      }

      // Custom Date Range filter
      if (comp.eventDate) {
        const eventTime = new Date(comp.eventDate).getTime();
        if (startDate) {
          const start = new Date(startDate).getTime();
          if (eventTime < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate).setHours(23, 59, 59, 999);
          if (eventTime > end) return false;
        }
      }

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = comp.name?.toLowerCase().includes(query);
        const venueMatch = comp.venue?.toLowerCase().includes(query);
        return nameMatch || venueMatch;
      }
      return true;
    });
  }, [competitions, typeFilter, startDate, endDate, searchQuery]);

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#222222] via-[#1b1b1b] to-[#171717] p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F15A24]/20 text-[#F15A24]">
              <History className="h-4 w-4" />
            </span>
            <p className="text-xs font-bold tracking-[0.2em] text-[#F15A24] uppercase">
              Archived Events
            </p>
          </div>
          <h2 className="font-display mt-2 text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
            Competition History
          </h2>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Competitions explicitly marked as Completed by administrators.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-white/5"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#F15A24]' : ''}`} />
          Refresh
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar with Event Type and Date Range */}
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or venue..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] pr-4 pl-10 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
            />
          </div>

          {/* Event Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs font-semibold text-white focus:border-[#F15A24] focus:outline-none"
          >
            <option value="ALL">All Event Types</option>
            <option value="Bodybuilding">Bodybuilding</option>
            <option value="Men's Physique">Men's Physique</option>
            <option value="Masters">Masters</option>
            <option value="Women's Competition">Women's Competition</option>
          </select>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-4 text-xs font-semibold text-zinc-300 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Filters
          </button>
        </div>

        {/* Custom Date Range Row */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-3 text-xs text-[#A1A1AA]">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-300">
            Date Range:
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 rounded-lg border border-white/10 bg-[#222222] px-2.5 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 rounded-lg border border-white/10 bg-[#222222] px-2.5 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
        </div>
      ) : filteredCompetitions.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-12 text-center">
          <History className="mx-auto h-10 w-10 text-zinc-600" />
          <h3 className="font-display mt-3 text-lg font-bold text-white uppercase">
            No Completed Competitions
          </h3>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Only competitions explicitly marked as Completed by an administrator appear in History.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filteredCompetitions.map((comp) => {
            const stats = comp.registrationStats || {
              total: 0,
              confirmed: 0,
              pending: 0,
              paid: 0,
              unpaid: 0,
              totalRevenue: 0,
            };
            const isToggling = togglingId === comp.id;

            return (
              <div
                key={comp.id}
                className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-6 shadow-lg transition-all hover:border-[#F15A24]/40"
              >
                <div className="space-y-4">
                  {/* Top Bar: Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-lg border border-[#F15A24]/30 bg-[#F15A24]/10 px-2.5 py-1 text-xs font-bold tracking-wider text-[#F15A24] uppercase">
                      {comp.competitionType}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </span>
                  </div>

                  {/* Competition Title */}
                  <div>
                    <h3 className="font-display text-xl font-bold tracking-wide text-white">
                      {comp.name}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#A1A1AA]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                        {formatDate(comp.eventDate)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-[#F15A24]" />
                        {comp.venue || 'No venue specified'}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-[#F15A24]" />
                        {comp.categories?.length || 0} Categories
                      </span>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-[#141414] p-3.5">
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-[#A1A1AA] uppercase">
                        Total Registrations
                      </p>
                      <p className="font-display mt-0.5 text-2xl font-extrabold text-white tabular-nums">
                        {stats.total}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                        Payment Collection
                      </p>
                      <p className="font-display mt-0.5 text-2xl font-extrabold text-emerald-400 tabular-nums">
                        ₹{(stats.totalRevenue || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <button
                    type="button"
                    onClick={() => handleToggleCompletion(comp)}
                    disabled={isToggling}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#A1A1AA] transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {isToggling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    Revert to In-Progress
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold tracking-wider text-white uppercase shadow-md shadow-[#F15A24]/20 transition-all hover:brightness-110"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
