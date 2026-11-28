import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  History,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { CompetitionCard } from '../components/admin/CompetitionCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';

export function HistoryPage() {
  const { accessToken } = useAuth();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploadingId, setUploadingId] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(''), 3500);
    return () => window.clearTimeout(timer);
  }, [success]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!accessToken) return;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await apiClient.fetchAdminCompetitions(accessToken, {
        history: true,
      });
      setCompetitions(res.competitions || []);
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load completed competitions.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const refresh = () => loadHistory({ silent: true });
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [loadHistory]);

  const filteredCompetitions = useMemo(() => {
    return competitions.filter((comp) => {
      // Event Type filter
      if (typeFilter !== 'ALL' && comp.competitionType !== typeFilter) {
        return false;
      }

      // Custom Date Range filter
      if (startDate || endDate) {
        const compDateRaw = comp.eventDate || comp.completedAt;
        if (!compDateRaw) return false;

        const target = new Date(compDateRaw);
        if (Number.isNaN(target.getTime())) return false;

        const localY = target.getFullYear();
        const localM = String(target.getMonth() + 1).padStart(2, '0');
        const localD = String(target.getDate()).padStart(2, '0');
        const localYMD = `${localY}-${localM}-${localD}`;
        const utcYMD = target.toISOString().slice(0, 10);

        if (startDate) {
          const matchesStart = localYMD >= startDate || utcYMD >= startDate;
          if (!matchesStart) return false;
        }

        if (endDate) {
          const matchesEnd = localYMD <= endDate || utcYMD <= endDate;
          if (!matchesEnd) return false;
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
  const restoreCompetition = async (competition) => {
    if (!window.confirm(`Bring "${competition.name}" back to active competitions?`)) return;
    try {
      await apiClient.toggleCompetitionCompletion(accessToken, competition.id, false);
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Could not restore competition.');
    }
  };
  const uploadHistoryPhotos = async (competition, files) => {
    const images = Array.from(files || []);
    if (!images.length) return;
    if (images.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Use JPEG, PNG or WebP images under 5 MB each.');
      return;
    }
    setUploadingId(competition.id);
    setError('');
    try {
      for (let offset = 0; offset < images.length; offset += 20) {
        await apiClient.uploadCompetitionPhotos(accessToken, competition.id, images.slice(offset, offset + 20), '');
      }
      setSuccess(`${images.length} photo(s) added to ${competition.name}.`);
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Could not upload photos.');
    } finally {
      setUploadingId('');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
            Competition History
          </h2>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Archive of concluded and completed bodybuilding events. Click on any
            card to view details, registrations, and event photos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
            {competitions.length} Completed Event(s)
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {success && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">{success}</div>}

      {/* Filter Toolbar */}
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {/* Search Box */}
          <div className="relative flex-1">
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompetitions.map((comp) => (
            <div key={comp.id} className="space-y-2">
              <CompetitionCard competition={comp} />
              <button type="button" onClick={() => restoreCompetition(comp)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white hover:border-[#F15A24]">
                <RotateCcw className="h-4 w-4" /> Restore to active competitions
              </button>
              <label className="ml-2 inline-flex cursor-pointer items-center rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white hover:border-[#F15A24]">
                {uploadingId === comp.id ? 'Uploading…' : 'Add event photos'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={Boolean(uploadingId)} onChange={(event) => { uploadHistoryPhotos(comp, event.target.files); event.target.value = ''; }} />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
