import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  formatStatusLabel,
  getStatusBadgeVariant,
  RegistrationDetailModal,
} from '../components/admin/RegistrationDetailModal.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { supabase } from '../lib/supabase.js';
import { formatDateTime } from '../utils/formatters.js';

const PAGE_SIZE = 15;

export function RegistrationsPage() {
  const { accessToken } = useAuth();

  const [competitions, setCompetitions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);

  const filtersRef = useRef({
    debouncedSearch: '',
    competitionId: '',
    categoryId: '',
    registrationStatus: '',
    page: 1,
  });

  useEffect(() => {
    filtersRef.current = {
      debouncedSearch,
      competitionId,
      categoryId,
      registrationStatus,
      page,
    };
  }, [debouncedSearch, competitionId, categoryId, registrationStatus, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    if (!accessToken) return;
    apiClient
      .fetchAdminCompetitions(accessToken)
      .then((data) => {
        if (active) {
          setCompetitions(data?.competitions || []);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accessToken]);

  const categoryOptions = useMemo(() => {
    if (competitionId) {
      const comp = competitions.find((c) => c.id === competitionId);
      return (comp?.categories || []).map((cat) => ({
        ...cat,
        label: `${cat.gender}: ${cat.name}`,
      }));
    }
    return competitions.flatMap((comp) =>
      (comp?.categories || []).map((cat) => ({
        ...cat,
        label: `${comp.name} — ${cat.gender}: ${cat.name}`,
      }))
    );
  }, [competitions, competitionId]);

  const loadRegistrations = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.fetchAdminRegistrations(accessToken, {
        search: debouncedSearch,
        competitionId,
        categoryId,
        registrationStatus,
        page,
        limit: PAGE_SIZE,
      });
      setRegistrations(Array.isArray(data?.registrations) ? data.registrations : []);
      setPagination(
        data?.pagination || {
          page,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(err?.message || 'Failed to load registrations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    debouncedSearch,
    competitionId,
    categoryId,
    registrationStatus,
    page,
  ]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  const matchesCurrentFilters = useCallback((record) => {
    if (!record) return false;
    const f = filtersRef.current;
    if (f.competitionId && record.competitionId !== f.competitionId) {
      return false;
    }
    if (f.categoryId && record.categoryId !== f.categoryId) {
      return false;
    }
    if (
      f.registrationStatus &&
      record.registrationStatus !== f.registrationStatus
    ) {
      return false;
    }
    if (f.debouncedSearch) {
      const needle = f.debouncedSearch.toLowerCase();
      const haystack = [
        record.participantName,
        record.email,
        record.mobileNumber,
        record.registrationCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }, []);

  const syncRealtimeRecord = useCallback(
    async (registrationId, eventType) => {
      if (!registrationId || !accessToken) return;

      if (eventType === 'DELETE') {
        setRegistrations((prev) =>
          prev.filter((item) => item.id !== registrationId)
        );
        setSelectedRegistration((prev) =>
          prev?.id === registrationId ? null : prev
        );
        return;
      }

      try {
        const res = await apiClient.fetchAdminRegistrationById(
          accessToken,
          registrationId
        );
        const enriched = res?.registration;
        if (!enriched) return;

        setSelectedRegistration((prev) =>
          prev?.id === enriched.id ? enriched : prev
        );

        const matches = matchesCurrentFilters(enriched);
        const f = filtersRef.current;

        setRegistrations((prev) => {
          const exists = prev.some((item) => item.id === enriched.id);

          if (!matches) {
            return exists
              ? prev.filter((item) => item.id !== enriched.id)
              : prev;
          }

          if (exists) {
            return prev.map((item) =>
              item.id === enriched.id ? enriched : item
            );
          }

          if (eventType === 'INSERT' && f.page === 1) {
            return [enriched, ...prev].slice(0, PAGE_SIZE);
          }

          return prev;
        });

        if (eventType === 'INSERT' && matches) {
          setPagination((prev) => {
            const nextTotal = (prev?.total || 0) + 1;
            return {
              ...prev,
              total: nextTotal,
              totalPages: Math.max(1, Math.ceil(nextTotal / (prev?.limit || PAGE_SIZE))),
            };
          });
        }
      } catch {
        // Ignore transient sync errors
      }
    },
    [accessToken, matchesCurrentFilters]
  );

  // Supabase Realtime subscription
  useEffect(() => {
    if (!supabase || !accessToken) return undefined;

    supabase.realtime.setAuth(accessToken);

    const channel = supabase
      .channel('admin-registrations-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        (payload) => {
          const targetId = payload.new?.id || payload.old?.id;
          if (targetId) syncRealtimeRecord(targetId, payload.eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          const registrationId =
            payload.new?.registration_id || payload.old?.registration_id;
          if (registrationId) syncRealtimeRecord(registrationId, 'UPDATE');
        }
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      setRealtimeActive(false);
      supabase.removeChannel(channel);
    };
  }, [accessToken, syncRealtimeRecord]);

  const handleUpdateRegistrationStatus = async (id, nextStatus) => {
    const res = await apiClient.updateRegistrationStatus(
      accessToken,
      id,
      nextStatus
    );
    const updated = res?.registration;
    if (updated) {
      setRegistrations((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setSelectedRegistration((prev) =>
        prev?.id === updated.id ? updated : prev
      );
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCompetitionId('');
    setCategoryId('');
    setRegistrationStatus('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch ||
      competitionId ||
      categoryId ||
      registrationStatus
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
            Participant Registrations
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 sm:self-auto"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#F15A24]" />
              Reset Filters
            </button>
          )}
          <button
            type="button"
            onClick={loadRegistrations}
            title="Refresh registrations"
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 text-[#F15A24] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <section className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.08] bg-[#222222] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, mobile or ID..."
            className="w-full rounded-xl border border-white/10 bg-[#171717] py-2.5 pr-4 pl-10 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
          />
        </div>

        <select
          value={competitionId}
          onChange={(e) => {
            setCompetitionId(e.target.value);
            setCategoryId('');
            setPage(1);
          }}
          aria-label="Filter by competition"
          className="rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 text-xs text-white focus:border-[#F15A24] focus:outline-none"
        >
          <option value="">All Competitions</option>
          {competitions.map((comp) => (
            <option key={comp.id} value={comp.id}>
              {comp.name}
            </option>
          ))}
        </select>

        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 text-xs text-white focus:border-[#F15A24] focus:outline-none"
        >
          <option value="">All Categories</option>
          {categoryOptions.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>

        <select
          value={registrationStatus}
          onChange={(e) => {
            setRegistrationStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by registration status"
          className="rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 text-xs text-white focus:border-[#F15A24] focus:outline-none"
        >
          <option value="">All Reg. Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </section>

      {/* Top Error Alert with Retry */}
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs font-medium text-red-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadRegistrations}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-1.5 font-semibold text-red-200 transition-colors hover:bg-red-900/60 sm:self-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Registrations Table */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#222222]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
          </div>
        ) : error && registrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <AlertCircle className="h-11 w-11 text-red-400" />
            <h3 className="font-display mt-4 text-2xl font-bold tracking-wide text-white uppercase">
              Failed to Load Registrations
            </h3>
            <p className="mt-1 max-w-md text-xs text-[#A1A1AA]">
              {error}
            </p>
            <button
              type="button"
              onClick={loadRegistrations}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 hover:brightness-110"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Loading
            </button>
          </div>
        ) : registrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <ClipboardList className="h-11 w-11 text-[#F15A24]" />
            <h3 className="font-display mt-4 text-2xl font-bold tracking-wide text-white uppercase">
              No Registrations Found
            </h3>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              {hasActiveFilters
                ? 'Try clearing or adjusting your search and filter criteria.'
                : 'Participant registrations submitted from the public website will appear here in real time.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#171717] text-[11px] font-bold tracking-wider text-[#A1A1AA] uppercase">
                  <th className="px-4 py-3.5">Registration ID</th>
                  <th className="px-4 py-3.5">Participant Name</th>
                  <th className="px-4 py-3.5">Email</th>
                  <th className="px-4 py-3.5">Mobile</th>
                  <th className="px-4 py-3.5">Gender</th>
                  <th className="px-4 py-3.5">Age</th>
                  <th className="px-4 py-3.5">Height</th>
                  <th className="px-4 py-3.5">Weight</th>
                  <th className="px-4 py-3.5">District</th>
                  <th className="px-4 py-3.5">Gym / Individual</th>
                  <th className="px-4 py-3.5">Competition</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Reg. Date</th>
                  <th className="px-4 py-3.5">Reg. Status</th>
                  <th className="px-4 py-3.5">Payment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {registrations.map((reg) => {
                  const effectivePaymentStatus =
                    reg.payment?.status || reg.paymentStatus || 'PENDING';
                  const effectiveRegStatus = reg.registrationStatus || 'PENDING';
                  return (
                    <tr
                      key={reg.id}
                      onClick={() => setSelectedRegistration(reg)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.04]"
                    >
                      <td className="px-4 py-3.5 font-mono font-bold whitespace-nowrap text-[#F15A24]">
                        {reg.registrationCode || '—'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-white">
                        {reg.participantName || '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.email || '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.mobileNumber || '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {formatStatusLabel(reg.gender, '—')}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.age ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.heightCm ? `${reg.heightCm} cm` : '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.weightKg ? `${reg.weightKg} kg` : '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.district || '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.representingType === 'INDIVIDUAL'
                          ? 'Individual'
                          : reg.gymName || 'Gym'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-white">
                        {reg.competition?.name || 'Not Available'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {reg.category
                          ? `${reg.category.gender}: ${reg.category.name}`
                          : 'Not Available'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-[#A1A1AA]">
                        {reg.createdAt ? formatDateTime(reg.createdAt) : '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge
                          variant={getStatusBadgeVariant(effectiveRegStatus)}
                        >
                          {formatStatusLabel(effectiveRegStatus)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge
                          variant={getStatusBadgeVariant(effectivePaymentStatus)}
                        >
                          {formatStatusLabel(effectivePaymentStatus)}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#171717] px-5 py-3.5 text-xs">
            <span className="text-[#A1A1AA]">
              Page {pagination.page} of {pagination.totalPages} (
              {pagination.total} total)
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-3 py-1.5 font-semibold text-white hover:border-[#F15A24]/50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-3 py-1.5 font-semibold text-white hover:border-[#F15A24]/50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      <RegistrationDetailModal
        registration={selectedRegistration}
        onClose={() => setSelectedRegistration(null)}
        onUpdateStatus={handleUpdateRegistrationStatus}
      />
    </div>
  );
}
