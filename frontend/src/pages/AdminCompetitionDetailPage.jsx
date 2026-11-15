import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { CompetitionFormModal } from '../components/admin/CompetitionFormModal.jsx';
import { EventPhotosManager } from '../components/admin/EventPhotosManager.jsx';
import { RegistrationDetailModal } from '../components/admin/RegistrationDetailModal.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import {
  getCompetitionPoster,
  getCompetitionStatus,
  getRegistrationStatus,
  isDeadlineClosed,
} from '../utils/competitionHelpers.js';
import { formatDate, formatDateTime, formatFee } from '../utils/formatters.js';

export function AdminCompetitionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'registrations';

  const { accessToken } = useAuth();
  const [competition, setCompetition] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingCompetition, setDeletingCompetition] = useState(false);

  // Registrations tab filters
  const [regSearch, setRegSearch] = useState('');
  const [regSourceFilter, setRegSourceFilter] = useState('ALL'); // 'ALL' | 'ONLINE' | 'MANUAL'
  const [regCatFilter, setRegCatFilter] = useState('');
  const [regGroupFilter, setRegGroupFilter] = useState('');
  const [regPayFilter, setRegPayFilter] = useState('');
  const [regStatusFilter, setRegStatusFilter] = useState('');
  const [selectedReg, setSelectedReg] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Payments tab filters
  const [paySearch, setPaySearch] = useState('');
  const [payStatusFilter, setPayStatusFilter] = useState('');

  const loadCompetition = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.fetchAdminCompetition(accessToken, id);
      setCompetition(data.competition);
      setRegistrations(data.registrations || []);
    } catch (err) {
      setError(err.message || 'Failed to load competition details.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    loadCompetition();
  }, [loadCompetition]);

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  // -------------------------------------------------------------
  // ADMIN ACTIONS (No window.confirm or alert popups)
  // -------------------------------------------------------------
  const handleSaveCompetition = async (
    payload,
    { posterFile, removePoster } = {}
  ) => {
    let savedCompetition;
    const res = await apiClient.updateCompetition(
      accessToken,
      competition.id,
      payload
    );
    savedCompetition = res.competition;

    if (removePoster) {
      const removeRes = await apiClient.removeCompetitionPoster(
        accessToken,
        competition.id
      );
      savedCompetition = removeRes.competition;
    } else if (posterFile) {
      const posterRes = await apiClient.uploadCompetitionPoster(
        accessToken,
        competition.id,
        posterFile
      );
      savedCompetition = posterRes.competition;
    }

    setCompetition(savedCompetition);
    setSuccessMsg('Competition updated successfully.');
    setTimeout(() => setSuccessMsg(''), 4000);
    await loadCompetition();
  };

  const handleDeleteCompetition = async () => {
    setDeletingCompetition(true);
    setError('');
    try {
      await apiClient.deleteCompetition(accessToken, competition.id);
      navigate('/admin/competitions');
    } catch (err) {
      setError(err.message || 'Failed to delete competition.');
      setConfirmDeleteOpen(false);
    } finally {
      setDeletingCompetition(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!competition) return;
    const nextPublished = !competition.isPublished;
    setActionLoading(true);
    setError('');
    try {
      const res = await apiClient.setCompetitionPublish(
        accessToken,
        competition.id,
        nextPublished
      );
      setCompetition((prev) => ({ ...prev, ...res.competition }));
      setSuccessMsg(
        `Competition successfully ${nextPublished ? 'published' : 'unpublished'}.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update publication status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRegistrationClosing = async () => {
    if (!competition) return;
    const nextClosed = !competition.isRegistrationClosed;

    setActionLoading(true);
    setError('');
    try {
      const res = await apiClient.setCompetitionRegistrationClosing(
        accessToken,
        competition.id,
        nextClosed
      );
      setCompetition((prev) => ({ ...prev, ...res.competition }));
      setSuccessMsg(
        nextClosed
          ? 'Registrations have been manually closed.'
          : 'Registrations have been successfully reopened.'
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update registration status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCompletion = async () => {
    if (!competition) return;
    const nextCompleted = !competition.isCompleted;

    setActionLoading(true);
    setError('');
    try {
      const res = await apiClient.toggleCompetitionCompletion(
        accessToken,
        competition.id,
        nextCompleted
      );
      setCompetition((prev) => ({ ...prev, ...res.competition }));
      setSuccessMsg(
        nextCompleted
          ? 'Competition marked as Completed and moved to History.'
          : 'Competition reopened.'
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update completion status.');
    } finally {
      setActionLoading(false);
    }
  };

  // -------------------------------------------------------------
  // COMPUTED STATES & METRICS
  // -------------------------------------------------------------
  const compStatus = useMemo(
    () => (competition ? getCompetitionStatus(competition) : 'Draft'),
    [competition]
  );
  const regStatus = useMemo(
    () => (competition ? getRegistrationStatus(competition) : 'Closed'),
    [competition]
  );
  const deadlinePassed = useMemo(
    () =>
      Boolean(
        competition && isDeadlineClosed(competition.registrationDeadline)
      ),
    [competition]
  );

  const stats = useMemo(() => {
    if (!competition) {
      return {
        total: 0,
        confirmed: 0,
        pending: 0,
        paid: 0,
        unpaid: 0,
        revenue: 0,
      };
    }
    return {
      total: competition.registrationStats?.total || registrations.length,
      confirmed:
        competition.registrationStats?.confirmed ||
        registrations.filter((r) => r.registrationStatus === 'CONFIRMED')
          .length,
      pending:
        competition.registrationStats?.pending ||
        registrations.filter((r) => r.registrationStatus === 'PENDING').length,
      paid:
        competition.registrationStats?.paid ||
        registrations.filter((r) => r.paymentStatus === 'PAID').length,
      unpaid:
        competition.registrationStats?.unpaid ||
        registrations.filter((r) => r.paymentStatus !== 'PAID').length,
      revenue:
        competition.registrationStats?.totalRevenue ||
        registrations
          .filter((r) => r.paymentStatus === 'PAID')
          .reduce(
            (acc, r) =>
              acc +
              Number(r.payment?.amount || competition.registrationFee || 0),
            0
          ),
    };
  }, [competition, registrations]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      if (regSourceFilter === 'ONLINE' && reg.isManual) return false;
      if (regSourceFilter === 'MANUAL' && !reg.isManual) return false;
      if (regCatFilter && reg.categoryId !== regCatFilter) return false;
      if (regGroupFilter && reg.groupId !== regGroupFilter) return false;
      if (regPayFilter && reg.paymentStatus !== regPayFilter) return false;
      if (regStatusFilter && reg.registrationStatus !== regStatusFilter)
        return false;
      if (regSearch.trim()) {
        const query = regSearch.toLowerCase();
        const nameMatch = reg.participantName?.toLowerCase().includes(query);
        const emailMatch = reg.email?.toLowerCase().includes(query);
        const codeMatch = reg.registrationCode?.toLowerCase().includes(query);
        return nameMatch || emailMatch || codeMatch;
      }
      return true;
    });
  }, [
    registrations,
    regSourceFilter,
    regCatFilter,
    regGroupFilter,
    regPayFilter,
    regStatusFilter,
    regSearch,
  ]);

  const handleExport = async (format) => {
    if (!accessToken || !id) return;
    setExporting(true);
    setError('');
    try {
      await apiClient.downloadRegistrationsExport(accessToken, {
        competitionId: id,
        format,
        source: regSourceFilter,
        categoryId: regCatFilter || undefined,
        groupId: regGroupFilter || undefined,
        search: regSearch || undefined,
        paymentStatus: regPayFilter || undefined,
        registrationStatus: regStatusFilter || undefined,
      });
      setExportOpen(false);
      setSuccessMsg(
        `Registrations exported successfully as ${format.toUpperCase()}.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to export registrations list.');
    } finally {
      setExporting(false);
    }
  };

  const filteredPayments = useMemo(() => {
    return registrations.filter((reg) => {
      if (payStatusFilter && reg.paymentStatus !== payStatusFilter) return false;
      if (paySearch.trim()) {
        const query = paySearch.toLowerCase();
        const nameMatch = reg.participantName?.toLowerCase().includes(query);
        const emailMatch = reg.email?.toLowerCase().includes(query);
        const orderMatch = reg.payment?.cashfreeOrderId
          ?.toLowerCase()
          .includes(query);
        const payIdMatch = reg.payment?.cashfreePaymentId
          ?.toLowerCase()
          .includes(query);
        return nameMatch || emailMatch || orderMatch || payIdMatch;
      }
      return true;
    });
  }, [registrations, payStatusFilter, paySearch]);

  const posterPreview = competition ? getCompetitionPoster(competition) : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
      </div>
    );
  }

  if (error && !competition) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <h3 className="font-display mt-3 text-xl font-bold text-white uppercase">
          Competition Not Found
        </h3>
        <p className="mt-1 text-sm text-[#A1A1AA]">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/admin/competitions')}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold text-white uppercase shadow-lg shadow-[#F15A24]/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Competitions
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Detail Modal */}
      {selectedReg && (
        <RegistrationDetailModal
          registration={selectedReg}
          isOpen={Boolean(selectedReg)}
          onClose={() => setSelectedReg(null)}
          onStatusUpdated={(updated) => {
            setRegistrations((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
            );
            setSelectedReg(null);
          }}
        />
      )}

      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => navigate('/admin/competitions')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#A1A1AA] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Competitions
        </button>

        {/* State-Sensitive Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Upload Event Photos */}
          <button
            type="button"
            onClick={() => setTab('gallery')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#F15A24]/20 transition-all hover:brightness-110"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Photos</span>
          </button>

          {/* Edit Competition */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/50 hover:bg-white/5 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5 text-[#F15A24]" />
            Edit
          </button>

          {/* Close / Reopen Registrations */}
          {!competition.isCompleted &&
            (competition.isRegistrationClosed ? (
              <button
                type="button"
                onClick={handleToggleRegistrationClosing}
                disabled={actionLoading || deadlinePassed}
                title={
                  deadlinePassed
                    ? 'Registration deadline has passed.'
                    : 'Reopen registrations for participants'
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockOpen className="h-3.5 w-3.5" />
                Reopen Registrations
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleRegistrationClosing}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                Close Registrations
              </button>
            ))}

          {/* Publish / Unpublish */}
          {!competition.isCompleted && (
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              {competition.isPublished ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-emerald-400" />
                  Publish
                </>
              )}
            </button>
          )}

          {/* Mark Completed / Reopen */}
          <button
            type="button"
            onClick={handleToggleCompletion}
            disabled={actionLoading}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              competition.isCompleted
                ? 'border-white/10 bg-white/5 text-[#A1A1AA] hover:bg-white/10 hover:text-white'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {competition.isCompleted
              ? 'Mark as In-Progress'
              : 'Mark as Completed'}
          </button>

          {/* Delete Competition */}
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-400" />
            Delete
          </button>
        </div>
      </div>

      {/* Banner / Success / Error Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header Card */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#222222] via-[#1b1b1b] to-[#171717] p-6 shadow-xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Poster Thumbnail */}
            <img
              src={posterPreview}
              alt={competition.name}
              className="h-24 w-20 shrink-0 rounded-xl border border-white/10 object-cover shadow-md"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[#F15A24]/30 bg-[#F15A24]/10 px-2.5 py-0.5 text-xs font-bold tracking-wider text-[#F15A24] uppercase">
                  {competition.competitionType}
                </span>

                {/* Competition Status Badge */}
                <StatusBadge
                  variant={
                    compStatus === 'Completed'
                      ? 'completed'
                      : compStatus === 'Live'
                        ? 'published'
                        : compStatus === 'Published'
                          ? 'published'
                          : 'draft'
                  }
                >
                  {compStatus}
                </StatusBadge>

                {/* Registration Status Badge */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    regStatus === 'Open'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : regStatus === 'Closing Soon'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {regStatus === 'Open' && <LockOpen className="h-3 w-3" />}
                  {regStatus === 'Closing Soon' && (
                    <Clock className="h-3 w-3" />
                  )}
                  {regStatus === 'Closed' && <Lock className="h-3 w-3" />}
                  Registrations {regStatus}
                </span>
              </div>

              <h2 className="font-display mt-2 text-2xl font-extrabold tracking-wide text-white uppercase sm:text-3xl">
                {competition.name}
              </h2>

              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#A1A1AA]">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                  Event: {formatDate(competition.eventDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#F15A24]" />
                  {competition.venue || 'Venue Not Set'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#F15A24]" />
                  Deadline: {formatDate(competition.registrationDeadline)}
                </span>
                <span>Fee: {formatFee(competition.registrationFee)}</span>
                <button
                  type="button"
                  onClick={() => setTab('gallery')}
                  className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-[#F15A24] transition-colors"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-[#F15A24]" />
                  <span>Photos: {competition.photos?.length || 0}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap items-center gap-1 border-t border-white/[0.08] pt-4">
          {[
            {
              id: 'registrations',
              label: `Registrations (${stats.total})`,
              icon: Users,
            },
            {
              id: 'payments',
              label: `Payments (${registrations.filter((r) => r.paymentStatus === 'PAID').length})`,
              icon: CreditCard,
            },
            {
              id: 'gallery',
              label: `Event Photos (${competition.photos?.length || 0})`,
              icon: ImageIcon,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wider uppercase transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#F15A24] to-[#E94B16] text-white shadow-md shadow-[#F15A24]/20'
                    : 'text-[#A1A1AA] hover:bg-[#222222] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
          <p className="text-[11px] font-bold tracking-wider text-[#A1A1AA] uppercase">
            Total Registrations
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold text-white tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
          <p className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
            Confirmed Athletes
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold text-emerald-400 tabular-nums">
            {stats.confirmed}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
          <p className="text-[11px] font-bold tracking-wider text-blue-400 uppercase">
            Total Collection
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold text-blue-400 tabular-nums">
            ₹{stats.revenue.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
          <p className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
            Unpaid / Pending
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold text-amber-400 tabular-nums">
            {stats.unpaid}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: REGISTRATIONS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          {/* Source Filter and Export Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                Registration Source:
              </span>
              <div className="inline-flex rounded-xl border border-white/10 bg-[#222222] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setRegSourceFilter('ALL')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                    regSourceFilter === 'ALL'
                      ? 'bg-[#F15A24] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setRegSourceFilter('ONLINE')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                    regSourceFilter === 'ONLINE'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => setRegSourceFilter('MANUAL')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                    regSourceFilter === 'MANUAL'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Manual
                </button>
              </div>
            </div>

            {/* Export Registrations Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((prev) => !prev)}
                disabled={exporting || filteredRegistrations.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#F15A24]/40 hover:text-white disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F15A24]" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-[#F15A24]" />
                )}
                <span>{exporting ? 'Exporting...' : 'Export Registrations'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>

              {exportOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setExportOpen(false)}
                  />
                  <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-white/10 bg-[#222222] p-1.5 shadow-2xl backdrop-blur-md">
                    <p className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                      Export Format ({regSourceFilter === 'ALL' ? 'All' : regSourceFilter === 'ONLINE' ? 'Online' : 'Manual'})
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
                      <span>PDF Document (.pdf)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="text"
                value={regSearch}
                onChange={(e) => setRegSearch(e.target.value)}
                placeholder="Search participant, email, ID..."
                className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>

            <select
              value={regCatFilter}
              onChange={(e) => setRegCatFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            >
              <option value="">All Categories</option>
              {(competition.categories || []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={regPayFilter}
              onChange={(e) => setRegPayFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>

            <select
              value={regStatusFilter}
              onChange={(e) => setRegStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            >
              <option value="">All Registration Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setRegSearch('');
                setRegSourceFilter('ALL');
                setRegCatFilter('');
                setRegGroupFilter('');
                setRegPayFilter('');
                setRegStatusFilter('');
              }}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-4 text-xs font-semibold text-zinc-300 transition-colors hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a]">
            {filteredRegistrations.length === 0 ? (
              <div className="p-12 text-center text-sm text-[#A1A1AA]">
                No registered participants match the selected filters.
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
                      <th className="px-4 py-3.5">Payment</th>
                      <th className="px-4 py-3.5">Reg Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredRegistrations.map((reg) => (
                      <tr
                        key={reg.id}
                        className="transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3.5 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{reg.participantName}</span>
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
                          <div className="font-mono text-[10px] text-[#F15A24]">
                            {reg.registrationCode}
                          </div>
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
                          {reg.group?.name || reg.groupName || 'Open'}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-400">
                          {formatDateTime(reg.createdAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              reg.paymentStatus === 'PAID'
                                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {reg.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              reg.registrationStatus === 'CONFIRMED'
                                ? 'border border-blue-500/30 bg-blue-500/10 text-blue-400'
                                : reg.registrationStatus === 'CANCELLED'
                                  ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                                  : 'border border-zinc-700 bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {reg.registrationStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReg(reg)}
                            className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:text-white"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: PAYMENTS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Payments Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="text"
                value={paySearch}
                onChange={(e) => setPaySearch(e.target.value)}
                placeholder="Search payment by participant name, order ID, payment ID..."
                className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>

            <select
              value={payStatusFilter}
              onChange={(e) => setPayStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">Paid Only</option>
              <option value="PENDING">Pending Only</option>
              <option value="FAILED">Failed Only</option>
            </select>
          </div>

          {/* Payments Table */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a]">
            {filteredPayments.length === 0 ? (
              <div className="p-12 text-center text-sm text-[#A1A1AA]">
                No payment transactions found matching the filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] bg-[#141414] text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                    <tr>
                      <th className="px-4 py-3.5">Athlete</th>
                      <th className="px-4 py-3.5">Amount</th>
                      <th className="px-4 py-3.5">Payment Status</th>
                      <th className="px-4 py-3.5">Cashfree Order ID</th>
                      <th className="px-4 py-3.5">Cashfree Payment ID</th>
                      <th className="px-4 py-3.5">Payment Timestamp</th>
                      <th className="px-4 py-3.5">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredPayments.map((reg) => {
                      const pay = reg.payment;
                      const isPaid = reg.paymentStatus === 'PAID';
                      const amount =
                        pay?.amount !== null && pay?.amount !== undefined
                          ? Number(pay.amount)
                          : Number(competition.registrationFee || 0);

                      return (
                        <tr
                          key={reg.id}
                          className="transition-colors hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-white">
                              {reg.participantName}
                            </p>
                            <p className="text-[11px] text-[#A1A1AA]">
                              {reg.email}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-white tabular-nums">
                            ₹{amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isPaid
                                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {reg.paymentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-300">
                            {pay?.cashfreeOrderId || 'N/A'}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-300">
                            {pay?.cashfreePaymentId || 'N/A'}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-400">
                            {pay?.paidAt
                              ? formatDateTime(pay.paidAt)
                              : formatDateTime(reg.createdAt)}
                          </td>
                          <td className="px-4 py-3.5 text-zinc-400">
                            {pay?.verificationSource || 'Cashfree Standard'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: EVENT PHOTOS GALLERY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'gallery' && (
        <EventPhotosManager
          competitionId={competition.id}
          competitionName={competition.name}
          initialPhotos={competition.photos || []}
          onPhotosUpdated={(photos) =>
            setCompetition((prev) => ({ ...prev, photos }))
          }
        />
      )}

      {/* Edit Competition Modal */}
      <CompetitionFormModal
        isOpen={modalOpen}
        editingCompetition={competition}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveCompetition}
      />

      {/* Delete Confirmation Modal */}
      {confirmDeleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#171717] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="rounded-xl bg-red-500/10 p-2.5">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3
                  id="delete-dialog-title"
                  className="font-display text-lg font-bold text-white uppercase"
                >
                  Delete Competition?
                </h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              Are you sure you want to delete <strong className="text-white">"{competition.name}"</strong>?
              {stats.total > 0 && (
                <span className="block mt-1.5 text-amber-300">
                  Note: This competition has {stats.total} registration(s).
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deletingCompetition}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCompetition}
                disabled={deletingCompetition}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white uppercase transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deletingCompetition ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Competition</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
