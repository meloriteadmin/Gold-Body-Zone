import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Dumbbell,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Trophy,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { ManualRegistrationModal } from '../components/admin/ManualRegistrationModal.jsx';
import {
  formatStatusLabel,
  getStatusBadgeVariant,
  RegistrationDetailModal,
} from '../components/admin/RegistrationDetailModal.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { supabase } from '../lib/supabase.js';
import { formatDate, formatDateTime, formatFee } from '../utils/formatters.js';

const PAGE_SIZE = 15;

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All Payment Statuses' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Payment Pending' },
  { value: 'FAILED', label: 'Payment Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const REG_STATUS_OPTIONS = [
  { value: '', label: 'All Registration Statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function RegistrationsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramCompetitionId = searchParams.get('competitionId') || '';

  const [competitions, setCompetitions] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [competitionSearch, setCompetitionSearch] = useState('');

  // Selected Competition state (active when viewing specific competition registrations)
  const [selectedCompetitionId, setSelectedCompetitionId] =
    useState(paramCompetitionId);

  // Registrations state
  const [registrations, setRegistrations] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  // Filters within a competition
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL'); // 'ALL' | 'ONLINE' | 'MANUAL'
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [registrationSuccessData, setRegistrationSuccessData] = useState(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);

  const handleManualSuccess = (newReg) => {
    const compName =
      newReg?.competition?.name ||
      competitions.find((c) => c.id === newReg?.competitionId)?.name ||
      'Competition';

    const successData = {
      participantName: newReg.participantName,
      competitionName: compName,
      registrationCode: newReg.registrationCode,
      paymentStatus: newReg.paymentStatus || 'PAID',
    };

    setRegistrationSuccessData(successData);
    setSuccessBanner(
      `Registration Completed Successfully! ${newReg.participantName} (${newReg.registrationCode}) - Paid & Confirmed.`
    );
    setTimeout(() => setSuccessBanner(''), 8000);

    loadCompetitions();
    if (selectedCompetitionId) {
      loadRegistrations();
    }
  };

  // Keep selectedCompetitionId in sync with URL
  useEffect(() => {
    setSelectedCompetitionId(paramCompetitionId);
  }, [paramCompetitionId]);

  // Load competitions list
  const loadCompetitions = useCallback(async () => {
    if (!accessToken) return;
    setCompetitionsLoading(true);
    try {
      const data = await apiClient.fetchAdminCompetitions(accessToken);
      setCompetitions(Array.isArray(data?.competitions) ? data.competitions : []);
    } catch (err) {
      setError(err?.message || 'Failed to load competitions.');
    } finally {
      setCompetitionsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  // Debounce search input for participant list
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Active selected competition details
  const activeCompetition = useMemo(() => {
    if (!selectedCompetitionId) return null;
    return competitions.find((c) => c.id === selectedCompetitionId) || null;
  }, [competitions, selectedCompetitionId]);

  // Available categories for selected competition
  const availableCategories = useMemo(() => {
    return activeCompetition?.categories || [];
  }, [activeCompetition]);

  // Available groups for selected category or all groups in this competition
  const availableGroups = useMemo(() => {
    if (categoryId) {
      const cat = availableCategories.find((c) => c.id === categoryId);
      return cat?.groups || [];
    }
    return availableCategories.flatMap((c) => c.groups || []);
  }, [availableCategories, categoryId]);

  // Load registrations when a competition is selected
  const loadRegistrations = useCallback(async () => {
    if (!accessToken || !selectedCompetitionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.fetchAdminRegistrations(accessToken, {
        search: debouncedSearch,
        competitionId: selectedCompetitionId,
        categoryId,
        groupId,
        paymentStatus,
        registrationStatus,
        source: sourceFilter,
        page,
        limit: PAGE_SIZE,
      });
      setRegistrations(
        Array.isArray(data?.registrations) ? data.registrations : []
      );
      setPagination(
        data?.pagination || {
          page,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(
        err?.message || 'Failed to load registrations. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    selectedCompetitionId,
    debouncedSearch,
    categoryId,
    groupId,
    paymentStatus,
    registrationStatus,
    sourceFilter,
    page,
  ]);

  const handleExport = async (format) => {
    if (!accessToken || !selectedCompetitionId) return;
    setExporting(true);
    setError('');
    try {
      await apiClient.downloadRegistrationsExport(accessToken, {
        competitionId: selectedCompetitionId,
        format,
        source: sourceFilter,
        categoryId: categoryId || undefined,
        groupId: groupId || undefined,
        search: debouncedSearch || undefined,
        paymentStatus: paymentStatus || undefined,
        registrationStatus: registrationStatus || undefined,
      });
      setExportOpen(false);
      setSuccessBanner(
        `Registrations exported successfully as ${format.toUpperCase()}.`
      );
      setTimeout(() => setSuccessBanner(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to export registrations list.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (selectedCompetitionId) {
      loadRegistrations();
    }
  }, [selectedCompetitionId, loadRegistrations]);

  // Setup Supabase realtime for live payment & registration changes
  useEffect(() => {
    if (!supabase || !selectedCompetitionId) return;

    let channel = null;
    try {
      channel = supabase
        .channel(`admin-registrations-${selectedCompetitionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'registrations' },
          () => {
            loadRegistrations();
            loadCompetitions();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            loadRegistrations();
            loadCompetitions();
          }
        )
        .subscribe((status) => {
          setRealtimeActive(status === 'SUBSCRIBED');
        });
    } catch {
      setRealtimeActive(false);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [selectedCompetitionId, loadRegistrations, loadCompetitions]);

  const handleSelectCompetition = (comp) => {
    setSelectedCompetitionId(comp.id);
    setSearchParams({ competitionId: comp.id });
    setCategoryId('');
    setGroupId('');
    setPaymentStatus('');
    setRegistrationStatus('');
    setSearchInput('');
    setPage(1);
  };

  const handleBackToOverview = () => {
    setSelectedCompetitionId('');
    setSearchParams({});
    setCategoryId('');
    setGroupId('');
    setPaymentStatus('');
    setRegistrationStatus('');
    setSearchInput('');
    setPage(1);
    setRegistrations([]);
    loadCompetitions();
  };

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCategoryId('');
    setGroupId('');
    setPaymentStatus('');
    setRegistrationStatus('');
    setSourceFilter('ALL');
    setPage(1);
  };

  const filteredCompetitions = useMemo(() => {
    if (!competitionSearch.trim()) return competitions;
    const q = competitionSearch.trim().toLowerCase();
    return competitions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.competitionType.toLowerCase().includes(q) ||
        (c.venue && c.venue.toLowerCase().includes(q))
    );
  }, [competitions, competitionSearch]);

  // -------------------------------------------------------------
  // VIEW 1: REGISTRATION OVERVIEW PAGE (COMPETITION CARDS)
  // -------------------------------------------------------------
  if (!selectedCompetitionId) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#222222] via-[#1b1b1b] to-[#171717] p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#F15A24] uppercase">
              Registration Management
            </p>
            <h2 className="font-display mt-1 text-2xl font-extrabold tracking-wide text-white uppercase sm:text-3xl">
              Registration Overview
            </h2>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Select a competition below to view its registered participants,
              payment statuses, and verify entries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#F15A24]/20 hover:brightness-110"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Manual Registration</span>
            </button>
            <button
              type="button"
              onClick={loadCompetitions}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-[#171717] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/40"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#F15A24]" />
              <span>Refresh Overview</span>
            </button>
          </div>
        </section>

        {/* Search / Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              value={competitionSearch}
              onChange={(e) => setCompetitionSearch(e.target.value)}
              placeholder="Search competitions by name, type, or venue..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#171717] pr-4 pl-10 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
            />
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

        {competitionsLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#171717] py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
          </div>
        ) : filteredCompetitions.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-12 text-center">
            <Trophy className="mx-auto h-10 w-10 text-zinc-600" />
            <p className="mt-3 text-sm font-semibold text-white">
              No competitions found.
            </p>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              {competitionSearch
                ? 'Try a different search keyword.'
                : 'Add a competition first to manage participant registrations.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompetitions.map((comp) => (
              <div
                key={comp.id}
                onClick={() => handleSelectCompetition(comp)}
                className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-6 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F15A24]/60 hover:shadow-[#F15A24]/10"
              >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-[#F15A24]/30 bg-[#F15A24]/10 px-2.5 py-1 text-xs font-bold tracking-wider text-[#F15A24] uppercase">
                        {comp.competitionType}
                      </span>
                    </div>

                    <h3 className="font-display mt-3 text-xl font-bold tracking-wide text-white transition-colors group-hover:text-[#F15A24]">
                      {comp.name}
                    </h3>

                    <div className="mt-3 flex items-center gap-2 text-xs text-[#A1A1AA]">
                      <Calendar className="h-4 w-4 text-[#F15A24]" />
                      <span>{formatDate(comp.eventDate)}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs font-bold tracking-wider text-[#F15A24] uppercase">
                    <span>View Registrations</span>
                    <span className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}

        {manualModalOpen && (
          <ManualRegistrationModal
            isOpen={manualModalOpen}
            competitions={competitions}
            selectedCompetitionId={selectedCompetitionId}
            onClose={() => setManualModalOpen(false)}
            onSuccess={handleManualSuccess}
          />
        )}

        {/* Registration Completed Successfully Modal */}
        {registrationSuccessData && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={() => setRegistrationSuccessData(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            />
            <div className="relative w-full max-w-md rounded-3xl border border-emerald-500/40 bg-[#171717] p-7 shadow-2xl space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-8 ring-emerald-500/10">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <div>
                <h3
                  id="success-modal-title"
                  className="font-display text-2xl font-bold tracking-wide text-white uppercase"
                >
                  Registration Completed Successfully!
                </h3>
                <p className="text-xs text-emerald-400 font-semibold mt-1">
                  Payment Verified • Confirmation Email Sent
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 text-left space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Participant Name:</span>
                  <span className="font-semibold text-white">
                    {registrationSuccessData.participantName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Competition Name:</span>
                  <span className="text-zinc-200">
                    {registrationSuccessData.competitionName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Registration ID:</span>
                  <span className="font-mono font-bold text-[#F15A24]">
                    {registrationSuccessData.registrationCode}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Payment Status:</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    {registrationSuccessData.paymentStatus}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRegistrationSuccessData(null)}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 hover:brightness-110"
              >
                Close & View Registrations
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: COMPETITION REGISTRATION DETAILS (PARTICIPANTS TABLE)
  // -------------------------------------------------------------
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Detail Modal */}
      {selectedRegistration && (
        <RegistrationDetailModal
          registration={selectedRegistration}
          isOpen={Boolean(selectedRegistration)}
          onClose={() => setSelectedRegistration(null)}
          onStatusUpdated={() => {
            loadRegistrations();
            loadCompetitions();
          }}
        />
      )}

      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBackToOverview}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#171717] px-4 py-2 text-xs font-bold text-white uppercase transition-colors hover:border-[#F15A24] hover:text-[#F15A24]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>All Competitions</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Export Registrations Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((prev) => !prev)}
              disabled={exporting || registrations.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/40 hover:text-white disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F15A24]" />
              ) : (
                <Download className="h-3.5 w-3.5 text-[#F15A24]" />
              )}
              <span>{exporting ? 'Exporting...' : 'Export'}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setExportOpen(false)}
                />
                <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-white/10 bg-[#222222] p-1.5 shadow-2xl backdrop-blur-md">
                  <p className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                    Export Format ({sourceFilter === 'ALL' ? 'All' : sourceFilter === 'ONLINE' ? 'Online' : 'Manual'})
                  </p>
                  <button
                    type="button"
                    onClick={() => handleExport('xlsx')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#F15A24]/15 hover:text-[#F15A24]"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    <span>Excel Spreadsheet (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#F15A24]/15 hover:text-[#F15A24]"
                  >
                    <FileText className="h-4 w-4 text-blue-400" />
                    <span>CSV Document (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#F15A24]/15 hover:text-[#F15A24]"
                  >
                    <FileText className="h-4 w-4 text-rose-400" />
                    <span>PDF Report (.pdf)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#F15A24]/20 hover:brightness-110"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Manual Registration</span>
          </button>

          <button
            type="button"
            onClick={loadRegistrations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/40 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#F15A24] ${loading ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Competition Summary Banner */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#222222] via-[#1b1b1b] to-[#171717] p-6 shadow-xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-[#F15A24]/30 bg-[#F15A24]/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">
                {activeCompetition?.competitionType}
              </span>
              <StatusBadge
                variant={activeCompetition?.isPublished ? 'published' : 'draft'}
              >
                {activeCompetition?.isPublished ? 'Published' : 'Draft'}
              </StatusBadge>
            </div>
            <h2 className="font-display mt-1 text-2xl font-extrabold tracking-wide text-white uppercase sm:text-3xl">
              {activeCompetition?.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#A1A1AA]">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                {formatDate(activeCompetition?.eventDate)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#F15A24]" />
                {activeCompetition?.venue || 'Venue Not Set'}
              </span>
              <span>Fee: {formatFee(activeCompetition?.registrationFee)}</span>
            </div>
          </div>

          {/* Quick Stats Pills */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#141414] px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase">
                Total
              </p>
              <p className="font-display text-lg font-bold text-white">
                {pagination.total}
              </p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-blue-300 uppercase">
                Confirmed
              </p>
              <p className="font-display text-lg font-bold text-blue-400">
                {
                  registrations.filter(
                    (r) => r.registrationStatus === 'CONFIRMED'
                  ).length
                }
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-emerald-300 uppercase">
                Paid
              </p>
              <p className="font-display text-lg font-bold text-emerald-400">
                {
                  registrations.filter((r) => r.paymentStatus === 'PAID')
                    .length
                }
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-amber-300 uppercase">
                Unpaid / Pending
              </p>
              <p className="font-display text-lg font-bold text-amber-400">
                {
                  registrations.filter((r) => r.paymentStatus !== 'PAID')
                    .length
                }
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-4 shadow-sm space-y-3">
        {/* Source Filter: All | Online | Manual */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
              Registration Source:
            </span>
            <div className="inline-flex rounded-xl border border-white/10 bg-[#222222] p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('ALL');
                  setPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                  sourceFilter === 'ALL'
                    ? 'bg-[#F15A24] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('ONLINE');
                  setPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                  sourceFilter === 'ONLINE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Online
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('MANUAL');
                  setPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                  sourceFilter === 'MANUAL'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Manual
              </button>
            </div>
          </div>

          <div className="text-xs text-zinc-400">
            Total records:{' '}
            <span className="font-semibold text-white">{pagination.total}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, code..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
            />
          </div>

          {/* Payment Status Filter */}
          <select
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
          >
            {PAYMENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Registration Status Filter & Reset */}
          <div className="flex gap-2">
            <select
              value={registrationStatus}
              onChange={(e) => {
                setRegistrationStatus(e.target.value);
                setPage(1);
              }}
              className="h-10 flex-1 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            >
              {REG_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={resetFilters}
              title="Reset Filters"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#222222] text-[#A1A1AA] transition-colors hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Success Banner */}
      {successBanner && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Participants Table */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#171717] shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
          </div>
        ) : registrations.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-zinc-600" />
            <p className="mt-3 text-sm font-semibold text-white">
              No participants found.
            </p>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              {debouncedSearch || categoryId || groupId || paymentStatus || registrationStatus
                ? 'Try clearing active filters to see all participants.'
                : 'No participants have registered for this competition yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] bg-[#141414] text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                <tr>
                  <th className="px-4 py-3.5">Participant</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Gender</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Group / Division</th>
                  <th className="px-4 py-3.5">Registered Date</th>
                  <th className="px-4 py-3.5">Payment Status</th>
                  <th className="px-4 py-3.5">Reg Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {registrations.map((reg) => {
                  const isPaid = reg.paymentStatus === 'PAID';
                  const isPendingPay = reg.paymentStatus === 'PENDING';
                  const isFailedPay = reg.paymentStatus === 'FAILED';

                  return (
                    <tr
                      key={reg.id}
                      className="transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-white">
                            {reg.participantName}
                          </p>
                          {reg.isManual ? (
                            <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 uppercase">
                              Manual
                            </span>
                          ) : (
                            <span className="rounded border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 uppercase">
                              Online
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-[#F15A24]">
                          {reg.registrationCode}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-zinc-300">{reg.email}</p>
                        <p className="text-[11px] text-[#A1A1AA]">
                          {reg.mobileNumber}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-zinc-300">
                        {reg.gender}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-white">
                        {reg.category?.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-300">
                        {reg.group?.name || reg.groupName || (
                          <span className="text-zinc-500">Open</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {formatDateTime(reg.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                            isPaid
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : isPendingPay
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                                : isFailedPay
                                  ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                                  : 'border border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
                          }`}
                        >
                          {isPaid && <CheckCircle2 className="h-3 w-3" />}
                          {isPendingPay && <Clock className="h-3 w-3" />}
                          {isFailedPay && <XCircle className="h-3 w-3" />}
                          {reg.paymentStatus}
                          {reg.isManual && reg.paymentMethod && (
                            <span className="opacity-75">
                              ({reg.paymentMethod})
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge
                          variant={getStatusBadgeVariant(reg.registrationStatus)}
                        >
                          {formatStatusLabel(reg.registrationStatus)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRegistration(reg)}
                          className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-xs font-semibold text-zinc-200 transition-colors hover:border-[#F15A24] hover:text-white"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-3 text-xs text-[#A1A1AA]">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, pagination.total)} of{' '}
              {pagination.total} registrations
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 p-1.5 text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-semibold text-white">
                {page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 p-1.5 text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {manualModalOpen && (
        <ManualRegistrationModal
          isOpen={manualModalOpen}
          competitions={competitions}
          selectedCompetitionId={selectedCompetitionId}
          onClose={() => setManualModalOpen(false)}
          onSuccess={handleManualSuccess}
        />
      )}

      {/* Registration Completed Successfully Modal */}
      {registrationSuccessData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setRegistrationSuccessData(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
          />
          <div className="relative w-full max-w-md rounded-3xl border border-emerald-500/40 bg-[#171717] p-7 shadow-2xl space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-8 ring-emerald-500/10">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div>
              <h3
                id="success-modal-title"
                className="font-display text-2xl font-bold tracking-wide text-white uppercase"
              >
                Registration Completed Successfully!
              </h3>
              <p className="text-xs text-emerald-400 font-semibold mt-1">
                Payment Verified • Confirmation Email Sent
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Participant Name:</span>
                <span className="font-semibold text-white">
                  {registrationSuccessData.participantName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Competition Name:</span>
                <span className="text-zinc-200">
                  {registrationSuccessData.competitionName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Registration ID:</span>
                <span className="font-mono font-bold text-[#F15A24]">
                  {registrationSuccessData.registrationCode}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Payment Status:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  {registrationSuccessData.paymentStatus}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRegistrationSuccessData(null)}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 hover:brightness-110"
            >
              Close & View Registrations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
