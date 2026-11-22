import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Hash,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
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
  isPastEvent,
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
  const [judgingFinished, setJudgingFinished] = useState(false);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [reopenDeadlineModalOpen, setReopenDeadlineModalOpen] = useState(false);
  const [newReopenDeadline, setNewReopenDeadline] = useState('');
  const [reopenDeadlineError, setReopenDeadlineError] = useState('');

  // Direct Photo Upload
  const directPhotoInputRef = useRef(null);
  const [uploadingDirectPhotos, setUploadingDirectPhotos] = useState(false);

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

  // Trunk Numbers state
  const [assigningTrunkNumbers, setAssigningTrunkNumbers] = useState(false);
  const [exportingTrunkNumbers, setExportingTrunkNumbers] = useState(false);
  const [editingTrunkId, setEditingTrunkId] = useState(null);
  const [inlineTrunkVal, setInlineTrunkVal] = useState('');
  const [inlineTrunkError, setInlineTrunkError] = useState('');
  const [inlineTrunkLoading, setInlineTrunkLoading] = useState(false);
  const [trunkSearchQuery, setTrunkSearchQuery] = useState('');

  const loadCompetition = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError('');
    try {
      const [data, trunkData] = await Promise.all([
        apiClient.fetchAdminCompetition(accessToken, id),
        apiClient
          .fetchCompetitionTrunkNumbers(accessToken, id)
          .catch(() => null),
      ]);
      setCompetition(data.competition);

      let allRegistrations = data.registrations || [];
      if (trunkData?.candidates?.length) {
        const trunkMap = new Map(
          trunkData.candidates.map((c) => [c.id, c.trunkNumber])
        );
        allRegistrations = allRegistrations.map((r) =>
          trunkMap.has(r.id) ? { ...r, trunkNumber: trunkMap.get(r.id) } : r
        );
      }
      setRegistrations(allRegistrations);
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
    const isCurrentlyClosed = isRegClosed;

    if (isCurrentlyClosed) {
      if (eventPassed) {
        setError('Cannot reopen registrations because the event date has already passed.');
        return;
      }

      if (deadlinePassed) {
        setReopenDeadlineError('');
        setNewReopenDeadline('');
        setReopenDeadlineModalOpen(true);
        return;
      }

      setActionLoading(true);
      setError('');
      try {
        const res = await apiClient.setCompetitionRegistrationClosing(
          accessToken,
          competition.id,
          false
        );
        setCompetition((prev) => ({ ...prev, ...res.competition }));
        setSuccessMsg('Registrations have been successfully reopened.');
        setTimeout(() => setSuccessMsg(''), 4000);
      } catch (err) {
        setError(err.message || 'Failed to reopen registrations.');
      } finally {
        setActionLoading(false);
      }
    } else {
      setActionLoading(true);
      setError('');
      try {
        const res = await apiClient.setCompetitionRegistrationClosing(
          accessToken,
          competition.id,
          true
        );
        setCompetition((prev) => ({ ...prev, ...res.competition }));
        setSuccessMsg('Registrations have been manually closed.');
        setTimeout(() => setSuccessMsg(''), 4000);
      } catch (err) {
        setError(err.message || 'Failed to close registrations.');
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleConfirmReopenWithDeadline = async () => {
    if (!competition || !newReopenDeadline) {
      setReopenDeadlineError('Please select a valid future date.');
      return;
    }

    const selectedDate = new Date(newReopenDeadline);
    selectedDate.setHours(23, 59, 59, 999);
    if (new Date() > selectedDate) {
      setReopenDeadlineError('Registration deadline must be a valid future date.');
      return;
    }

    if (competition.eventDate) {
      const eventDate = new Date(competition.eventDate);
      eventDate.setHours(23, 59, 59, 999);
      if (selectedDate > eventDate) {
        setReopenDeadlineError(
          `Registration deadline cannot be after the competition date (${formatDate(competition.eventDate)}).`
        );
        return;
      }
    }

    setActionLoading(true);
    setReopenDeadlineError('');
    try {
      const res = await apiClient.setCompetitionRegistrationClosing(
        accessToken,
        competition.id,
        false,
        { registrationDeadline: newReopenDeadline }
      );
      setCompetition((prev) => ({ ...prev, ...res.competition }));
      setSuccessMsg(
        'Registration deadline extended and registrations successfully reopened.'
      );
      setReopenDeadlineModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setReopenDeadlineError(
        err.message || 'Failed to update deadline and reopen registrations.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCompletion = async () => {
    if (!competition) return;
    const nextCompleted = !competition.isCompleted;

    if (nextCompleted && !window.confirm('Finish this competition? Do this after judging is complete. It will leave Judging and move to History.')) return;

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

  const handleDirectPhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !competition?.id || !accessToken) return;

    // Filter valid image types and size <= 5MB
    const valid = files.filter((f) => {
      const isImg = ['image/jpeg', 'image/png', 'image/webp'].includes(f.type);
      const isSize = f.size <= 5 * 1024 * 1024;
      return isImg && isSize;
    });

    if (valid.length === 0) {
      setError('Please select valid JPEG, PNG, or WebP images under 5 MB each.');
      if (directPhotoInputRef.current) directPhotoInputRef.current.value = '';
      return;
    }

    setUploadingDirectPhotos(true);
    setError('');
    try {
      const res = await apiClient.uploadCompetitionPhotos(
        accessToken,
        competition.id,
        valid,
        ''
      );
      const updatedPhotos = res.photos || [];
      setCompetition((prev) => ({
        ...prev,
        photos: updatedPhotos,
      }));
      setTab('gallery');
      setSuccessMsg(`${valid.length} photo(s) uploaded successfully!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to upload event photos.');
    } finally {
      setUploadingDirectPhotos(false);
      if (directPhotoInputRef.current) {
        directPhotoInputRef.current.value = '';
      }
    }
  };

  const handleExportTrunkNumbers = async () => {
    setExportingTrunkNumbers(true);
    setError('');
    try {
      await apiClient.downloadTrunkNumbersExport(accessToken, competition.id);
    } catch (err) {
      setError(err.message || 'Failed to export trunk numbers.');
    } finally {
      setExportingTrunkNumbers(false);
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
  const isCompleted = useMemo(
    () => Boolean(competition?.isCompleted || compStatus === 'Completed'),
    [competition, compStatus]
  );
  const isRegClosed = useMemo(
    () => regStatus === 'Closed',
    [regStatus]
  );
  const canAssignTrunkNumbers = useMemo(
    () => isRegClosed && !isCompleted,
    [isRegClosed, isCompleted]
  );
  const deadlinePassed = useMemo(
    () =>
      Boolean(
        competition && isDeadlineClosed(competition.registrationDeadline)
      ),
    [competition]
  );
  const eventPassed = useMemo(
    () => Boolean(competition && isPastEvent(competition.eventDate)),
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
        const trunkMatch =
          reg.trunkNumber !== null &&
          reg.trunkNumber !== undefined &&
          String(reg.trunkNumber).includes(query);
        return nameMatch || emailMatch || codeMatch || trunkMatch;
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

  const eligibleCandidates = useMemo(() => {
    return registrations.filter(
      (r) =>
        (r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID') ||
        (r.trunkNumber !== null && r.trunkNumber !== undefined)
    );
  }, [registrations]);

  const assignedTrunkCount = useMemo(() => {
    return registrations.filter(
      (r) => r.trunkNumber !== null && r.trunkNumber !== undefined
    ).length;
  }, [registrations]);

  const confirmedPaidCandidates = useMemo(() => registrations.filter(
    (r) => r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID'
  ), [registrations]);
  const numberedConfirmedCount = confirmedPaidCandidates.filter(
    (r) => r.trunkNumber !== null && r.trunkNumber !== undefined
  ).length;

  useEffect(() => {
    if (!competition?.isPublished || !isRegClosed || isCompleted ||
        !confirmedPaidCandidates.length || numberedConfirmedCount !== confirmedPaidCandidates.length) {
      setJudgingFinished(false);
      return;
    }
    let active = true;
    apiClient.fetchEligibleJudgingCompetitions(accessToken)
      .then(({ competitions }) => {
        if (active) setJudgingFinished(
          competitions?.some((item) => item.id === competition.id && item.judgingStatus === 'Evaluation Done') || false
        );
      })
      .catch(() => { if (active) setJudgingFinished(false); });
    return () => { active = false; };
  }, [accessToken, competition?.id, competition?.isPublished, isRegClosed, isCompleted,
    confirmedPaidCandidates.length, numberedConfirmedCount]);

  const filteredTrunkRegistrations = useMemo(() => {
    let list = [...eligibleCandidates];
    if (trunkSearchQuery.trim()) {
      const q = trunkSearchQuery.trim().toLowerCase();
      list = list.filter((r) => {
        const nameMatch = r.participantName?.toLowerCase().includes(q);
        const codeMatch = r.registrationCode?.toLowerCase().includes(q);
        const trunkMatch =
          r.trunkNumber !== null && String(r.trunkNumber).includes(q);
        return nameMatch || codeMatch || trunkMatch;
      });
    }
    return list.sort((a, b) => {
      const numA =
        a.trunkNumber !== null && a.trunkNumber !== undefined
          ? a.trunkNumber
          : 999999;
      const numB =
        b.trunkNumber !== null && b.trunkNumber !== undefined
          ? b.trunkNumber
          : 999999;
      if (numA !== numB) return numA - numB;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }, [eligibleCandidates, trunkSearchQuery]);

  const handleAssignTrunkNumbers = async () => {
    if (isCompleted) {
      setError('Trunk numbers cannot be assigned for a completed competition.');
      return;
    }
    if (!isRegClosed) {
      setError('Trunk numbers can only be bulk assigned after registration has closed.');
      return;
    }

    setAssigningTrunkNumbers(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiClient.assignTrunkNumbers(accessToken, competition.id);
      setSuccessMsg(
        res.message ||
          (res.newlyAssignedCount > 0
            ? `Successfully assigned trunk numbers to ${res.newlyAssignedCount} candidate(s).`
            : 'All eligible candidates already have trunk numbers assigned.')
      );
      await loadCompetition();
      setTab('trunk-numbers');
    } catch (err) {
      setError(err.message || 'Failed to assign trunk numbers.');
    } finally {
      setAssigningTrunkNumbers(false);
    }
  };

  const handleStartInlineEdit = (candidate) => {
    setEditingTrunkId(candidate.id);
    setInlineTrunkVal(
      candidate.trunkNumber !== null && candidate.trunkNumber !== undefined
        ? String(candidate.trunkNumber)
        : ''
    );
    setInlineTrunkError('');
  };

  const handleCancelInlineEdit = () => {
    setEditingTrunkId(null);
    setInlineTrunkVal('');
    setInlineTrunkError('');
  };

  const handleSaveInlineEdit = async (registrationId) => {
    const num = Number(inlineTrunkVal);
    if (!Number.isInteger(num) || num <= 0) {
      setInlineTrunkError('Enter a positive whole number greater than 0.');
      return;
    }

    const duplicate = eligibleCandidates.find(
      (r) => r.id !== registrationId && r.trunkNumber === num
    );
    if (duplicate) {
      setInlineTrunkError(
        `Number ${num} is already assigned to "${duplicate.participantName}".`
      );
      return;
    }

    setInlineTrunkLoading(true);
    setInlineTrunkError('');
    try {
      const res = await apiClient.editTrunkNumber(
        accessToken,
        competition.id,
        registrationId,
        num
      );
      setSuccessMsg(res.message || `Trunk number updated to ${num}.`);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registrationId ? { ...r, trunkNumber: num } : r
        )
      );
      setEditingTrunkId(null);
      setInlineTrunkVal('');
    } catch (err) {
      setInlineTrunkError(err.message || 'Failed to update trunk number.');
    } finally {
      setInlineTrunkLoading(false);
    }
  };

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
        />
      )}

      {/* Extend Deadline & Reopen Registrations Modal */}
      {reopenDeadlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <LockOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white uppercase">
                  Reopen Registrations
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Update registration deadline
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-zinc-300">
              The previous registration deadline{' '}
              {competition.registrationDeadline && (
                <span className="font-semibold text-white">
                  ({formatDate(competition.registrationDeadline)})
                </span>
              )}{' '}
              has passed. To reopen registrations, please select a new future deadline date.
            </p>

            {reopenDeadlineError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{reopenDeadlineError}</span>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                New Registration Deadline *
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                max={
                  competition.eventDate
                    ? new Date(competition.eventDate).toISOString().split('T')[0]
                    : undefined
                }
                value={newReopenDeadline}
                onChange={(e) => {
                  setNewReopenDeadline(e.target.value);
                  setReopenDeadlineError('');
                }}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white focus:border-[#F15A24] focus:outline-none"
              />
              {competition.eventDate && (
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  Must be on or before the competition date (
                  {formatDate(competition.eventDate)}).
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setReopenDeadlineModalOpen(false);
                  setReopenDeadlineError('');
                }}
                disabled={actionLoading}
                className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReopenWithDeadline}
                disabled={actionLoading || !newReopenDeadline}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:brightness-110 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Reopening...</span>
                  </>
                ) : (
                  <>
                    <LockOpen className="h-3.5 w-3.5" />
                    <span>Update & Reopen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
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
          {/* Direct Upload Event Photos */}
          <button
            type="button"
            onClick={() => directPhotoInputRef.current?.click()}
            disabled={uploadingDirectPhotos || actionLoading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-50"
          >
            {uploadingDirectPhotos ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Photos</span>
              </>
            )}
          </button>
          <input
            ref={directPhotoInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleDirectPhotoSelect}
            className="hidden"
          />

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
            (isRegClosed ? (
              <button
                type="button"
                onClick={handleToggleRegistrationClosing}
                disabled={actionLoading || eventPassed}
                title={
                  eventPassed
                    ? 'Cannot reopen registrations because the event date has already passed.'
                    : deadlinePassed
                      ? 'Registration deadline has passed. Click to extend deadline and reopen.'
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

          {/* Only older hidden competitions need a manual visibility action. */}
          {!competition.isCompleted && !competition.isPublished && (
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5 text-emerald-400" />
              Show on Website
            </button>
          )}

          {/* Mark Completed / Reopen */}
          <button
            type="button"
            onClick={handleToggleCompletion}
            disabled={actionLoading || (!isCompleted && (!isRegClosed || (confirmedPaidCandidates.length > 0 && !judgingFinished)))}
            title={!isCompleted && !isRegClosed
              ? 'Close registrations before completing the competition.'
              : !isCompleted && confirmedPaidCandidates.length > 0 && !judgingFinished
                ? 'Finish judging before completing the competition.'
                : 'Move this competition to History.'}
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

          {/* Assign Trunk Numbers Button */}
          {canAssignTrunkNumbers && confirmedPaidCandidates.length > 0 && numberedConfirmedCount < confirmedPaidCandidates.length && (
            <button
            type="button"
            onClick={handleAssignTrunkNumbers}
            disabled={actionLoading || assigningTrunkNumbers}
            title={
              isCompleted
                ? 'Trunk numbers cannot be assigned for a completed competition.'
                : !isRegClosed
                  ? 'Trunk numbers can only be bulk assigned after registration has closed.'
                  : 'Bulk assign trunk numbers to all eligible confirmed & paid candidates.'
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#F15A24]/40 bg-[#F15A24]/15 px-3 py-2 text-xs font-bold text-[#F15A24] transition-colors hover:bg-[#F15A24]/25 disabled:opacity-50"
          >
            {assigningTrunkNumbers ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hash className="h-3.5 w-3.5" />
            )}
            <span>Assign Trunk Numbers</span>
            </button>
          )}
        </div>
      </div>

      {!isCompleted && (
        <div className="rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-xs text-zinc-300">
          {!competition.isPublished
            ? 'This older competition is hidden. Choose Show on Website to make it public.'
            : !isRegClosed
              ? 'Visible on the public website. Close registrations when entries are finished; the public page will show Registration Closed.'
              : confirmedPaidCandidates.length === 0
                ? 'Registration is closed and remains visible publicly. Confirm paid participants before assigning trunk numbers.'
                : numberedConfirmedCount < confirmedPaidCandidates.length
                  ? 'Registration is closed. Assign trunk numbers to all confirmed, paid participants, then open Judging.'
                  : judgingFinished
                    ? 'Judging is complete. You can now mark this competition completed and move it to History.'
                    : 'Ready for Judging. Complete the judging work before marking this competition completed.'}
          {competition.isPublished && isRegClosed && confirmedPaidCandidates.length > 0 && numberedConfirmedCount === confirmedPaidCandidates.length && (
            <button type="button" onClick={() => navigate('/admin/judge')} className="ml-2 font-bold text-[#F15A24] hover:underline">
              Open Judging →
            </button>
          )}
        </div>
      )}

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
            {
              id: 'trunk-numbers',
              label: `Trunk Numbers (${assignedTrunkCount})`,
              icon: Hash,
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5 sm:col-span-1">
          <p className="text-[11px] font-bold tracking-wider text-[#F15A24] uppercase">
            Trunk Numbers
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold text-[#F15A24] tabular-nums">
            {assignedTrunkCount}
            <span className="text-xs font-semibold text-zinc-500">
              /{eligibleCandidates.length}
            </span>
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
                      <th className="px-4 py-3.5">Trunk Number</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredRegistrations.map((reg) => (
                      <tr
                        key={reg.id}
                        className={`transition-colors ${
                          editingTrunkId === reg.id
                            ? 'bg-[#F15A24]/[0.06]'
                            : 'hover:bg-white/[0.02]'
                        }`}
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
                        <td className="px-4 py-3.5">
                          {editingTrunkId === reg.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={inlineTrunkVal}
                                onChange={(e) => {
                                  setInlineTrunkVal(e.target.value);
                                  if (inlineTrunkError) setInlineTrunkError('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveInlineEdit(reg.id);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelInlineEdit();
                                  }
                                }}
                                autoFocus
                                placeholder="Number"
                                className="h-8 w-20 rounded-lg border border-[#F15A24] bg-[#1a1a1a] px-2.5 text-xs font-bold text-white shadow-inner focus:outline-none focus:ring-1 focus:ring-[#F15A24]"
                              />
                              {inlineTrunkError && (
                                <span className="max-w-[160px] text-[10px] font-medium text-red-400">
                                  {inlineTrunkError}
                                </span>
                              )}
                            </div>
                          ) : reg.trunkNumber !== null &&
                            reg.trunkNumber !== undefined ? (
                            <span className="inline-flex items-center rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-1 font-mono text-xs font-extrabold text-[#F15A24]">
                              {reg.trunkNumber}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {editingTrunkId === reg.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(reg.id)}
                                disabled={inlineTrunkLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                                title="Save trunk number"
                              >
                                {inlineTrunkLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                disabled={inlineTrunkLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                                title="Cancel"
                              >
                                <X className="h-3 w-3" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartInlineEdit(reg)}
                                disabled={Boolean(editingTrunkId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-[#F15A24]/40 hover:text-white disabled:opacity-40"
                                title="Edit trunk number"
                              >
                                <Pencil className="h-3 w-3 text-[#F15A24]" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedReg(reg)}
                                className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-white"
                              >
                                Details
                              </button>
                            </div>
                          )}
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

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: TRUNK NUMBERS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'trunk-numbers' && (
        <div className="space-y-4">
          {/* Header Summary & Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-[#A1A1AA] uppercase">
                  Total Eligible Candidates
                </p>
                <p className="font-display mt-0.5 text-2xl font-extrabold text-white">
                  {eligibleCandidates.length}
                </p>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div>
                <p className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                  Total Assigned Numbers
                </p>
                <p className="font-display mt-0.5 text-2xl font-extrabold text-emerald-400">
                  {assignedTrunkCount}
                </p>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div>
                <p className="text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                  Unassigned Candidates
                </p>
                <p className="font-display mt-0.5 text-2xl font-extrabold text-amber-400">
                  {Math.max(0, eligibleCandidates.length - assignedTrunkCount)}
                </p>
              </div>
            </div>

            {/* Actions: Assign Button & Export Button */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAssignTrunkNumbers}
                disabled={assigningTrunkNumbers || !canAssignTrunkNumbers}
                title={
                  isCompleted
                    ? 'Trunk numbers cannot be assigned for a completed competition.'
                    : !isRegClosed
                      ? 'Bulk trunk number assignment is enabled only after registration has closed.'
                      : 'Bulk assign trunk numbers to all eligible confirmed & paid candidates.'
                }
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase transition-all ${
                  canAssignTrunkNumbers
                    ? 'bg-gradient-to-r from-[#F15A24] to-[#E94B16] text-white shadow-md shadow-[#F15A24]/20 hover:brightness-110'
                    : 'border border-white/10 bg-[#222222] text-zinc-500 cursor-not-allowed opacity-60'
                }`}
              >
                {assigningTrunkNumbers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
                <span>Assign Trunk Numbers</span>
              </button>

              <button
                type="button"
                onClick={handleExportTrunkNumbers}
                disabled={exportingTrunkNumbers || eligibleCandidates.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-4 py-2.5 text-xs font-bold text-white uppercase transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {exportingTrunkNumbers ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#F15A24]" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                )}
                <span>Export Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {isCompleted && (
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs font-medium text-blue-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" />
              <span>
                This competition is marked as <strong>Completed</strong>. Trunk number assignment is finalized and locked.
              </span>
            </div>
          )}

          {!isRegClosed && !isCompleted && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-200">
              <Clock className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Registration is currently <strong>{regStatus}</strong>. Bulk trunk number assignment can only be initiated after registration has closed.
              </span>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-3">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={trunkSearchQuery}
                onChange={(e) => setTrunkSearchQuery(e.target.value)}
                placeholder="Search candidates by name, registration code, or trunk number..."
                className="h-9 w-full rounded-xl border border-white/10 bg-[#222222] pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>
            {trunkSearchQuery && (
              <button
                type="button"
                onClick={() => setTrunkSearchQuery('')}
                className="rounded-lg border border-white/10 bg-[#222222] px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a]">
            {filteredTrunkRegistrations.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#A1A1AA]">
                {trunkSearchQuery
                  ? 'No matching candidates found for this search.'
                  : 'No eligible candidates available for trunk number assignment yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#222222] text-[11px] font-bold tracking-wider text-[#A1A1AA] uppercase">
                      <th className="px-4 py-3.5">Trunk Number</th>
                      <th className="px-4 py-3.5">Candidate Name</th>
                      <th className="px-4 py-3.5">Registration ID</th>
                      <th className="px-4 py-3.5">Category &amp; Division</th>
                      <th className="px-4 py-3.5">Payment</th>
                      <th className="px-4 py-3.5">Reg Status</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredTrunkRegistrations.map((cand) => (
                      <tr
                        key={cand.id}
                        className={`transition-colors ${
                          editingTrunkId === cand.id
                            ? 'bg-[#F15A24]/[0.06]'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          {editingTrunkId === cand.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={inlineTrunkVal}
                                onChange={(e) => {
                                  setInlineTrunkVal(e.target.value);
                                  if (inlineTrunkError) setInlineTrunkError('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveInlineEdit(cand.id);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelInlineEdit();
                                  }
                                }}
                                autoFocus
                                placeholder="Number"
                                className="h-8 w-24 rounded-lg border border-[#F15A24] bg-[#1a1a1a] px-2.5 text-xs font-bold text-white shadow-inner focus:outline-none focus:ring-1 focus:ring-[#F15A24]"
                              />
                              {inlineTrunkError && (
                                <span className="max-w-[200px] text-[10px] font-medium text-red-400">
                                  {inlineTrunkError}
                                </span>
                              )}
                            </div>
                          ) : cand.trunkNumber !== null &&
                            cand.trunkNumber !== undefined ? (
                            <span className="inline-flex items-center rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-1 font-mono text-xs font-extrabold text-[#F15A24]">
                              {cand.trunkNumber}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-500">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-white">
                            {cand.participantName}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {cand.district} •{' '}
                            {cand.representingType === 'INDIVIDUAL'
                              ? 'Individual'
                              : cand.gymName || 'Gym'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-zinc-300">
                          {cand.registrationCode}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-300">
                          <p className="font-semibold text-white">
                            {cand.category?.name || 'Open'}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {cand.group?.name ||
                              cand.groupName ||
                              'No Group'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                              cand.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {cand.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            variant={
                              cand.registrationStatus === 'CONFIRMED'
                                ? 'confirmed'
                                : 'pending'
                            }
                          >
                            {cand.registrationStatus}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {editingTrunkId === cand.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(cand.id)}
                                disabled={inlineTrunkLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                                title="Save trunk number"
                              >
                                {inlineTrunkLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                disabled={inlineTrunkLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                                title="Cancel edit"
                              >
                                <X className="h-3 w-3" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartInlineEdit(cand)}
                              disabled={Boolean(editingTrunkId)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-[#F15A24]/40 hover:text-white disabled:opacity-40"
                            >
                              <Pencil className="h-3 w-3 text-[#F15A24]" />
                              <span>Edit</span>
                            </button>
                          )}
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

      {/* Edit Competition Modal */}
      <CompetitionFormModal
        isOpen={modalOpen}
        editingCompetition={competition}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveCompetition}
      />
    </div>
  );
}
