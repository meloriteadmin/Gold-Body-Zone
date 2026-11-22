import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gavel,
  Loader2,
  MapPin,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { JudgeFormModal } from '../components/admin/JudgeFormModal.jsx';
import { JudgeResultsModal } from '../components/admin/JudgeResultsModal.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { getCompetitionPoster } from '../utils/competitionHelpers.js';
import { formatDate, formatFee } from '../utils/formatters.js';

export function AdminJudgeManagementPage() {
  const { accessToken } = useAuth();

  // Navigation states
  const [selectedCompId, setSelectedCompId] = useState(null);
  const [directoryModalOpen, setDirectoryModalOpen] = useState(false);

  // List data states
  const [competitions, setCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);

  // Workspace data states (for selected competition)
  const [workspace, setWorkspace] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  // Shared UI states
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals & Sub-actions
  const [judgeModalOpen, setJudgeModalOpen] = useState(false);
  const [editingJudge, setEditingJudge] = useState(null);
  const [assignDirectoryModalOpen, setAssignDirectoryModalOpen] = useState(false);
  const [selectedDirectoryJudgeId, setSelectedDirectoryJudgeId] = useState('');
  const [judgeToRemove, setJudgeToRemove] = useState(null);
  const [judgeToDelete, setJudgeToDelete] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [copiedJudgeId, setCopiedJudgeId] = useState(null);

  // Results Modal states
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [resultsSessionId, setResultsSessionId] = useState('');
  const [resultsCompName, setResultsCompName] = useState('');
  const [resultsInitialJudgeId, setResultsInitialJudgeId] = useState(null);

  // --------------------------------------------------------------------------
  // 1. Load All Eligible Competitions
  // --------------------------------------------------------------------------
  const loadCompetitions = useCallback(async () => {
    if (!accessToken) return;
    setLoadingCompetitions(true);
    setError('');
    try {
      const res = await apiClient.fetchEligibleJudgingCompetitions(accessToken);
      setCompetitions(res.competitions || []);
    } catch (err) {
      setError(err.message || 'Failed to load competitions.');
    } finally {
      setLoadingCompetitions(false);
    }
  }, [accessToken]);

  // --------------------------------------------------------------------------
  // 2. Load Workspace for Selected Competition
  // --------------------------------------------------------------------------
  const loadWorkspace = useCallback(async (compId) => {
    if (!accessToken || !compId) return;
    setLoadingWorkspace(true);
    setError('');
    try {
      const data = await apiClient.fetchCompetitionJudgingWorkspace(accessToken, compId);
      setWorkspace(data);
    } catch (err) {
      setError(err.message || 'Failed to load judging workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  useEffect(() => {
    if (selectedCompId) {
      loadWorkspace(selectedCompId);
    } else {
      setWorkspace(null);
    }
  }, [selectedCompId, loadWorkspace]);

  // --------------------------------------------------------------------------
  // 3. Session Actions (Start, Revoke)
  // --------------------------------------------------------------------------
  const handleStartCompetition = async () => {
    if (!selectedCompId) return;
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiClient.startJudgingSession(accessToken, {
        competitionId: selectedCompId,
        durationHours: 24,
      });
      setSuccessMsg('Competition judging started! Temporary link generated (valid 24 hours).');
      await loadWorkspace(selectedCompId);
      await loadCompetitions();
    } catch (err) {
      setError(err.message || 'Failed to start judging session.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (
      !window.confirm(
        'Are you sure you want to revoke this judging link? Judges currently using this link will immediately lose access.'
      )
    ) {
      return;
    }
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiClient.revokeJudgingSession(accessToken, sessionId);
      setSuccessMsg('Judging link revoked successfully.');
      if (selectedCompId) await loadWorkspace(selectedCompId);
      await loadCompetitions();
    } catch (err) {
      setError(err.message || 'Failed to revoke judging link.');
    } finally {
      setActionLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Sharing & Copying Links
  // --------------------------------------------------------------------------
  const getJudgeLink = (judge, token) => {
    if (!token || !judge?.id) return '';
    const keyParam = judge.accessKey ? `&key=${judge.accessKey}` : '';
    return `${window.location.origin}/judge/${token}?judgeId=${judge.id}${keyParam}`;
  };

  const handleCopyJudgeLink = (judge, token, compName) => {
    const fullUrl = getJudgeLink(judge, token);
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedJudgeId(judge.id);
      setSuccessMsg(`Personal judging link for ${judge.name} copied to clipboard!`);
      setTimeout(() => setCopiedJudgeId(null), 3000);
    });
  };

  const handleShareJudgeWhatsApp = (judge, token, compName) => {
    const fullUrl = getJudgeLink(judge, token);
    const text = `🏆 GOLD BODY ZONE — Official Judging Portal\nCompetition: ${compName}\nJudge: ${judge.name} (${judge.designation || 'Judge'})\n\nPlease click your secure personal judging link below to score contestants:\n${fullUrl}\n\nNote: This link is unique to your identity. Submissions are saved automatically.`;
    const cleanPhone = (judge.phone || '').replace(/[^0-9]/g, '');
    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = (token, compName) => {
    const fullUrl = `${window.location.origin}/judge/${token}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedToken(token);
      setSuccessMsg(`Judging link for "${compName}" copied to clipboard!`);
      setTimeout(() => setCopiedToken(null), 3000);
    });
  };

  const handleShareWhatsApp = (token, compName) => {
    const fullUrl = `${window.location.origin}/judge/${token}`;
    const text = `🏆 GOLD BODY ZONE — Official Judging Portal\nCompetition: ${compName}\n\nPlease click your secure judging link below to identify yourself and score contestants:\n${fullUrl}\n\nNote: This link is active for this competition only.`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // --------------------------------------------------------------------------
  // 5. Judge Management (Create, Edit, Assign, Remove)
  // --------------------------------------------------------------------------
  const handleSaveJudge = async (payload) => {
    if (editingJudge) {
      await apiClient.updateAdminJudge(accessToken, editingJudge.id, payload);
      setSuccessMsg(`Judge "${payload.name}" updated successfully.`);
    } else {
      const payloadWithComp = selectedCompId
        ? { ...payload, competitionId: selectedCompId }
        : payload;
      await apiClient.createAdminJudge(accessToken, payloadWithComp);
      setSuccessMsg(`Judge "${payload.name}" created and assigned successfully.`);
    }

    if (selectedCompId) {
      await loadWorkspace(selectedCompId);
    }
    await loadCompetitions();
  };

  const handleAssignDirectoryJudge = async () => {
    if (!selectedDirectoryJudgeId || !selectedCompId) return;
    setActionLoading(true);
    setError('');
    try {
      await apiClient.assignJudgeToCompetition(
        accessToken,
        selectedCompId,
        selectedDirectoryJudgeId
      );
      setSuccessMsg('Judge assigned to this competition successfully.');
      setAssignDirectoryModalOpen(false);
      setSelectedDirectoryJudgeId('');
      await loadWorkspace(selectedCompId);
    } catch (err) {
      setError(err.message || 'Failed to assign judge.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRemoveJudgeFromCompetition = async () => {
    if (!judgeToRemove || !selectedCompId) return;
    setActionLoading(true);
    setError('');
    try {
      await apiClient.removeJudgeFromCompetition(
        accessToken,
        selectedCompId,
        judgeToRemove.id
      );
      setSuccessMsg(`Judge "${judgeToRemove.name}" removed from this competition.`);
      setJudgeToRemove(null);
      await loadWorkspace(selectedCompId);
    } catch (err) {
      setError(err.message || 'Failed to remove judge from competition.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDeleteDirectoryJudge = async () => {
    if (!judgeToDelete) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await apiClient.deleteAdminJudge(accessToken, judgeToDelete.id);
      setSuccessMsg(res.message || `Judge "${judgeToDelete.name}" deleted.`);
      setJudgeToDelete(null);
      if (selectedCompId) await loadWorkspace(selectedCompId);
      await loadCompetitions();
    } catch (err) {
      setError(err.message || 'Failed to delete judge.');
    } finally {
      setActionLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 6. Results Viewing
  // --------------------------------------------------------------------------
  const openResultsModal = (sessionId, compName, initialJudgeId = null) => {
    setResultsSessionId(sessionId);
    setResultsCompName(compName);
    setResultsInitialJudgeId(initialJudgeId);
    setResultsModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // RENDER: Workspace View (when a competition card was clicked)
  // --------------------------------------------------------------------------
  if (selectedCompId) {
    const comp = workspace?.competition;
    const session = workspace?.activeSession;
    const assignedJudges = workspace?.assignedJudges || [];
    const directoryJudges = workspace?.directoryJudges || [];

    // Precise status from DB session & submission records:
    // 'Judging Not Started' | 'Judging In Progress' | 'Evaluation Done'
    const rawStatus = workspace?.judgingStatus || 'Judging Not Started';
    const isEvaluationDone = rawStatus === 'Evaluation Done' || rawStatus === 'Judging Completed';
    const isJudgingInProgress = rawStatus === 'Judging In Progress';
    const isJudgingNotStarted = rawStatus === 'Judging Not Started';

    const shareUrl =
      session && session.status === 'ACTIVE' && !isEvaluationDone
        ? `${window.location.origin}/judge/${session.token}`
        : '';

    // Unassigned directory judges available to add
    const assignedJudgeIds = new Set(assignedJudges.map((j) => j.id));
    const availableDirectoryJudges = directoryJudges.filter(
      (j) => !assignedJudgeIds.has(j.id) && j.isActive
    );

    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Navigation & Breadcrumb */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCompId(null)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#1a1a1a] text-zinc-300 transition-colors hover:border-[#F15A24]/50 hover:text-white"
              title="Back to all competitions"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F15A24]">
                  Judging Workspace
                </span>
                <span className="text-zinc-600">•</span>
                <span className="text-xs text-zinc-400">
                  {comp?.name || 'Competition Details'}
                </span>
              </div>
              <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
                {comp?.name || 'Competition Judging'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => loadWorkspace(selectedCompId)}
              disabled={loadingWorkspace}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
              title="Refresh workspace"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingWorkspace ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div
            role="status"
            className="flex items-center justify-between gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-emerald-400 hover:text-white text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-400 hover:text-white text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {loadingWorkspace || !comp ? (
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#1c1c1c] py-28">
            <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
          </div>
        ) : (
          <>
            {/* Competition Header Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center gap-5 p-5">
                {/* Poster Thumbnail */}
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#121212] shadow-inner">
                  <img
                    src={getCompetitionPoster(comp)}
                    alt={`${comp.name} poster`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>

                {/* Metadata & Status */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">
                      {comp.competitionType}
                    </span>

                    {/* Final Competition Status Badge: Evaluation Done | Judging In Progress | Judging Not Started */}
                    {isEvaluationDone ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Evaluation Done</span>
                      </span>
                    ) : isJudgingInProgress ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-0.5 text-xs font-bold text-blue-400">
                        <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                        <span>Judging In Progress</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-0.5 text-xs font-bold text-zinc-400">
                        <span>Judging Not Started</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-xl font-bold uppercase text-white">
                    {comp.name}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-300">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                      <span>{formatDate(comp.eventDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#F15A24]" />
                      <span>{comp.venue || 'Venue Not Set'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-400" />
                      <span>{comp.eligibleParticipantCount || 0} Confirmed Contestant(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{comp.categoriesCount || 0} Category Division(s)</span>
                    </div>
                  </div>
                </div>

                {/* Registration Fee */}
                <div className="shrink-0 text-left md:text-right">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase">
                    Registration Fee
                  </span>
                  <p className="font-display text-2xl font-extrabold text-[#F15A24]">
                    {formatFee(comp.registrationFee)}
                  </p>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 1. OVERALL JUDGING PROGRESS                                   */}
            {/* ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5 shadow-lg space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase text-white">
                    Overall Judging Progress
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Real-time monitoring of assigned judges, category submissions, and evaluation status.
                  </p>
                </div>
                <span className="font-mono text-base font-extrabold text-[#F15A24]">
                  {session?.overallProgress?.completionPercentage ?? 0}%
                </span>
              </div>

              {/* Metric Cards (Assigned, Completed, Pending, Category Progress) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Assigned Judge Count */}
                <div className="rounded-xl border border-white/10 bg-[#141414] p-4 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400 text-xs">
                    <span className="font-semibold uppercase tracking-wider">Assigned Judges</span>
                    <Users className="h-4 w-4 text-blue-400" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-white">
                    {session?.assignedJudgeCount ?? assignedJudges.length}
                  </p>
                  <p className="text-[11px] text-zinc-500">Official panel judges</p>
                </div>

                {/* Metric 2: Completed Judges */}
                <div className="rounded-xl border border-white/10 bg-[#141414] p-4 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400 text-xs">
                    <span className="font-semibold uppercase tracking-wider">Completed Judges</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-emerald-400">
                    {session?.completedJudgeCount ?? 0}
                  </p>
                  <p className="text-[11px] text-zinc-500">All categories submitted</p>
                </div>

                {/* Metric 3: Pending Judges */}
                <div className="rounded-xl border border-white/10 bg-[#141414] p-4 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400 text-xs">
                    <span className="font-semibold uppercase tracking-wider">Pending Judges</span>
                    <Clock className="h-4 w-4 text-amber-400" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-amber-400">
                    {session?.pendingJudges?.length ?? (session ? assignedJudges.length : 0)}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {!session
                      ? 'Judging not started'
                      : session.pendingJudges?.length === 0
                        ? 'None (All Completed)'
                        : `${session.pendingJudges?.length} awaiting submission`}
                  </p>
                </div>

                {/* Metric 4: Category Progress (Clear: e.g. 2 of 2 categories completed) */}
                <div className="rounded-xl border border-white/10 bg-[#141414] p-4 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400 text-xs">
                    <span className="font-semibold uppercase tracking-wider">Category Progress</span>
                    <Award className="h-4 w-4 text-[#F15A24]" />
                  </div>
                  <p className="font-display text-xl font-extrabold text-white">
                    {session
                      ? isEvaluationDone
                        ? `${comp.categoriesCount || 0} of ${comp.categoriesCount || 0} categories completed`
                        : `${session.completedJudgeCount > 0 ? Math.min(session.completedJudgeCount, comp.categoriesCount || 0) : 0} of ${comp.categoriesCount || 0} categories completed`
                      : `0 of ${comp.categoriesCount || 0} categories completed`}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {isEvaluationDone
                      ? 'All divisions completed'
                      : isJudgingInProgress
                        ? 'Evaluation in progress'
                        : 'Awaiting session start'}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isEvaluationDone
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-[#F15A24] to-[#E94B16]'
                    }`}
                    style={{
                      width: `${session?.overallProgress?.completionPercentage ?? 0}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    {session
                      ? isEvaluationDone
                        ? `${comp.categoriesCount || 0} of ${comp.categoriesCount || 0} categories completed`
                        : `${session.completedJudgeCount || 0} judge(s) fully completed`
                      : 'Not Started'}
                  </span>
                  <span>
                    {isEvaluationDone
                      ? 'Evaluation Done'
                      : isJudgingInProgress
                        ? 'Judging In Progress'
                        : 'Judging Not Started'}
                  </span>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 2. PANEL JUDGES FOR THIS COMPETITION                          */}
            {/* ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase text-white">
                    Panel Judges for this Competition ({assignedJudges.length})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Official judges assigned to evaluate contestants in this competition.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Assign from directory button */}
                  {availableDirectoryJudges.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAssignDirectoryModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-white/20 hover:text-white"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-blue-400" />
                      <span>Assign from Directory ({availableDirectoryJudges.length})</span>
                    </button>
                  )}

                  {/* Create Judge button */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingJudge(null);
                      setJudgeModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold text-white uppercase shadow-md hover:brightness-110"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Judge</span>
                  </button>
                </div>
              </div>

              {/* Assigned Judges Table */}
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
                {assignedJudges.length === 0 ? (
                  <div className="p-12 text-center text-xs text-zinc-400 space-y-2">
                    <p>No judges assigned specifically to this competition yet.</p>
                    <p className="text-zinc-500">
                      Click &quot;Create Judge&quot; or &quot;Assign from Directory&quot; to configure your panel.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/[0.08] bg-[#101010] text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                        <tr>
                          <th className="px-4 py-3.5">Judge</th>
                          <th className="px-4 py-3.5">Phone</th>
                          <th className="px-4 py-3.5">City / District</th>
                          <th className="px-4 py-3.5">Evaluation Status</th>
                          <th className="px-4 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {assignedJudges.map((j, idx) => {
                          const jStatus = session?.judgesStatus?.find((js) => js.id === j.id);

                          return (
                            <tr key={j.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-300">
                                    Judge {idx + 1}
                                  </span>
                                  <span className="font-bold text-white">
                                    {j.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-zinc-300 font-mono">
                                {j.phone || '—'}
                              </td>
                              <td className="px-4 py-3.5 text-zinc-400">
                                {j.city || '—'}
                              </td>
                              <td className="px-4 py-3.5">
                                {session && jStatus ? (
                                  jStatus.isCompleted ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                                      <CheckCircle2 className="h-3 w-3" />
                                      <span>Completed ({jStatus.submittedCategoriesCount}/{jStatus.totalCategories})</span>
                                    </span>
                                  ) : jStatus.hasStarted ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
                                      <Clock className="h-3 w-3" />
                                      <span>In Progress ({jStatus.submittedCategoriesCount}/{jStatus.totalCategories})</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[10px] font-bold text-zinc-400 uppercase">
                                      <span>Pending (0/{jStatus.totalCategories})</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[10px] font-bold text-zinc-400 uppercase">
                                    <span>Ready</span>
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Copy Individual Link for this judge */}
                                  {session && isJudgingInProgress && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyJudgeLink(j, session.token, comp.name)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:border-[#F15A24] hover:text-[#F15A24]"
                                        title={`Copy personal link for ${j.name}`}
                                      >
                                        {copiedJudgeId === j.id ? (
                                          <Check className="h-3 w-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                        <span>{copiedJudgeId === j.id ? 'Copied' : 'Link'}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleShareJudgeWhatsApp(j, session.token, comp.name)}
                                        className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/20 border border-[#25D366]/40 px-2 py-1 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/30"
                                        title={`Send personal link to ${j.name} via WhatsApp`}
                                      >
                                        <Share2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}

                                  {/* View Results for this judge */}
                                  {session && (
                                    <button
                                      type="button"
                                      onClick={() => openResultsModal(session.id, comp.name, j.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-1 text-xs font-bold text-[#F15A24] hover:bg-[#F15A24]/20"
                                      title="View this judge's selections, rankings and winner titles"
                                    >
                                      <Trophy className="h-3 w-3" />
                                      <span>View Results</span>
                                    </button>
                                  )}

                                  {/* Edit Judge */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingJudge(j);
                                      setJudgeModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white"
                                  >
                                    <Pencil className="h-3 w-3 text-[#F15A24]" />
                                    <span>Edit</span>
                                  </button>

                                  {/* Remove Judge from Competition */}
                                  <button
                                    type="button"
                                    onClick={() => setJudgeToRemove(j)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                                    title="Remove from Competition"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Remove</span>
                                  </button>
                                </div>
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

            {/* ------------------------------------------------------------- */}
            {/* 3. START COMPETITION & GENERATE LINK                          */}
            {/* ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase text-white">
                    Start Competition &amp; Generate Link
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Generate the secure temporary judging link only when you are ready to start. All judges score independently.
                  </p>
                </div>

                {isEvaluationDone && (
                  <button
                    type="button"
                    onClick={handleStartCompetition}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2 text-xs font-bold text-zinc-200 uppercase hover:border-[#F15A24] hover:text-white disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5 text-[#F15A24]" />
                    <span>Start New Evaluation / Session</span>
                  </button>
                )}
              </div>

              {/* State A: Evaluation Done (Hide Link & Controls) */}
              {isEvaluationDone ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-400 text-sm uppercase tracking-wide">
                        Evaluation Done — Session Finalized
                      </h4>
                      <p className="text-xs text-zinc-300">
                        All assigned panel judges have submitted all required categories including Winner Selection. Link sharing is closed.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isJudgingInProgress && session ? (
                /* State B: Judging In Progress (Show Separate Judging Links for Each Judge) */
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-white/[0.08] pb-3">
                    <div className="space-y-0.5">
                      <span className="flex items-center gap-2 font-bold text-emerald-400 uppercase tracking-wide">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Individual Judging Links Active ({assignedJudges.length} Judges)</span>
                      </span>
                      <p className="text-[11px] text-zinc-400">
                        Separate secure links generated for each assigned judge. Each judge evaluates contestants independently.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="flex items-center gap-1.5 text-zinc-400">
                        <Clock className="h-3.5 w-3.5 text-zinc-500" />
                        <span>
                          Expires:{' '}
                          {new Date(session.expiresAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          ({new Date(session.expiresAt).toLocaleDateString()})
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRevokeSession(session.id)}
                        disabled={actionLoading}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        title="Revoke All Session Links"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Revoke Session</span>
                      </button>
                    </div>
                  </div>

                  {/* List of Unique Links per Judge */}
                  {assignedJudges.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-400">
                      No judges assigned specifically to this competition yet. Please assign judges above.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assignedJudges.map((j, idx) => {
                        const judgeUrl = getJudgeLink(j, session.token);
                        const jStatus = session?.judgesStatus?.find((js) => js.id === j.id);

                        return (
                          <div
                            key={j.id}
                            className="rounded-xl border border-white/10 bg-[#141414] p-3 sm:p-4 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-300">
                                  Judge {idx + 1}
                                </span>
                                <span className="font-bold text-white text-sm">
                                  {j.name}
                                </span>
                                {j.city && (
                                  <span className="text-[11px] text-zinc-400">
                                    • {j.city}
                                  </span>
                                )}
                              </div>

                              <div>
                                {jStatus?.isCompleted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Completed ({jStatus.submittedCategoriesCount}/{jStatus.totalCategories})</span>
                                  </span>
                                ) : jStatus?.hasStarted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
                                    <Clock className="h-3 w-3" />
                                    <span>In Progress ({jStatus.submittedCategoriesCount}/{jStatus.totalCategories})</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[10px] font-bold text-zinc-400 uppercase">
                                    <span>Pending</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Link Input & Individual Controls */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={judgeUrl}
                                className="h-9 flex-1 rounded-xl border border-white/10 bg-[#101010] px-3 font-mono text-xs text-zinc-300 select-all focus:outline-none focus:border-[#F15A24]/60"
                              />

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyJudgeLink(j, session.token, comp.name)}
                                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 text-xs font-bold text-white transition-colors hover:border-[#F15A24] hover:text-[#F15A24]"
                                  title={`Copy personal link for ${j.name}`}
                                >
                                  {copiedJudgeId === j.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                  <span>{copiedJudgeId === j.id ? 'Copied' : 'Copy Link'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleShareJudgeWhatsApp(j, session.token, comp.name)}
                                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 text-xs font-bold text-white shadow-md transition-all hover:brightness-105"
                                  title={`Send link to ${j.name} via WhatsApp`}
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  <span>WhatsApp</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 text-xs text-zinc-400 border-t border-white/[0.06]">
                    <span>
                      Each link automatically identifies the correct judge. Judges cannot switch or select another judge&apos;s identity.
                    </span>
                  </div>
                </div>
              ) : (
                /* State C: Judging Not Started -> Generate link ONLY when admin clicks Start Competition */
                <div className="rounded-xl border border-white/10 bg-[#141414] p-6 text-center space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24]/20 to-[#E94B16]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30">
                    <Play className="h-6 w-6 fill-current translate-x-0.5" />
                  </div>
                  <div>
                    <h4 className="font-display text-lg font-bold uppercase text-white">
                      Start Competition &amp; Generate Link
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 max-w-lg mx-auto">
                      Registration is closed. Click below to start competition judging and generate the temporary shared link for your panel judges.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleStartCompetition}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-3.5 text-xs sm:text-sm font-extrabold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 fill-white" />
                      )}
                      <span>Start Competition &amp; Generate Link</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 4. HISTORICAL EVALUATION SESSIONS (AT THE BOTTOM, NO COUNT)   */}
            {/* ------------------------------------------------------------- */}
            {workspace?.historicalSessions && workspace.historicalSessions.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5 shadow-lg space-y-4">
                <div className="border-b border-white/[0.08] pb-3">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                    Historical Evaluation Sessions
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Previous judging sessions and their scores are permanently preserved in the database.
                  </p>
                </div>

                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#141414]">
                  {workspace.historicalSessions.map((hs, idx) => (
                    <div
                      key={hs.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-white/[0.02]"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">
                            Evaluation Session #{workspace.historicalSessions.length - idx}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              hs.status === 'COMPLETED'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : hs.status === 'ACTIVE'
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            {hs.status === 'COMPLETED' ? 'EVALUATION DONE' : hs.status}
                          </span>
                          {hs.isCurrent && (
                            <span className="rounded bg-[#F15A24]/20 border border-[#F15A24]/40 px-1.5 py-0.2 text-[10px] font-bold text-[#F15A24]">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Created: {new Date(hs.createdAt).toLocaleString()}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openResultsModal(hs.id, comp.name)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#222222] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-[#F15A24] hover:text-[#F15A24] self-start sm:self-auto"
                      >
                        <Trophy className="h-3.5 w-3.5 text-[#F15A24]" />
                        <span>View Results</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal 1: Create or Edit Judge */}
        <JudgeFormModal
          isOpen={judgeModalOpen}
          judge={editingJudge}
          onClose={() => {
            setJudgeModalOpen(false);
            setEditingJudge(null);
          }}
          onSave={handleSaveJudge}
        />

        {/* Modal 2: Assign from Directory */}
        {assignDirectoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="h-5 w-5 text-[#F15A24]" />
                  <h3 className="font-display text-lg font-bold uppercase text-white">
                    Assign Existing Judge
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssignDirectoryModalOpen(false);
                    setSelectedDirectoryJudgeId('');
                  }}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-zinc-300">
                  Select an official judge from your registered directory to assign to{' '}
                  <strong className="text-white">{comp?.name}</strong>:
                </p>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Select Directory Judge
                  </label>
                  <select
                    value={selectedDirectoryJudgeId}
                    onChange={(e) => setSelectedDirectoryJudgeId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#121212] px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F15A24]"
                  >
                    <option value="">-- Choose a Judge --</option>
                    {availableDirectoryJudges.map((dj) => (
                      <option key={dj.id} value={dj.id}>
                        {dj.name} {dj.city ? `• ${dj.city}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.08] px-5 py-4">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setAssignDirectoryModalOpen(false);
                    setSelectedDirectoryJudgeId('');
                  }}
                  className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading || !selectedDirectoryJudgeId}
                  onClick={handleAssignDirectoryJudge}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold text-white uppercase shadow-md hover:brightness-110 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Assign Judge</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 3: Remove Judge from Competition Confirmation */}
        {judgeToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1c1c1c] p-6 shadow-2xl space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400 shrink-0">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold uppercase text-white">
                    Remove Judge from Competition
                  </h3>
                  <p className="mt-1 text-xs text-zinc-300">
                    Are you sure you want to remove judge <strong className="text-white">{judgeToRemove.name}</strong> from this competition?
                  </p>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    The judge will remain in your global directory and can be reassigned anytime.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setJudgeToRemove(null)}
                  className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={confirmRemoveJudgeFromCompetition}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white uppercase shadow-md hover:bg-red-500"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Remove Judge</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 4: View Judge Results */}
        <JudgeResultsModal
          isOpen={resultsModalOpen}
          onClose={() => setResultsModalOpen(false)}
          sessionId={resultsSessionId}
          competitionName={resultsCompName}
          accessToken={accessToken}
          initialJudgeId={resultsInitialJudgeId}
        />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Grid View (All Competitions using CompetitionCard design)
  // --------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24]/20 to-[#E94B16]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30">
            <Gavel className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
              Judge Management &amp; Sessions
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              Select a competition card to open its dedicated judging workspace, manage judges, and start judging.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadCompetitions}
            disabled={loadingCompetitions}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
            title="Refresh Competitions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCompetitions ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setDirectoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            <Users className="h-3.5 w-3.5 text-[#F15A24]" />
            <span>Judges Directory</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-emerald-400 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-red-400 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Info notice */}
      <div className="rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-4 text-xs text-zinc-400">
        <span className="font-bold text-white uppercase tracking-wider">
          Judging Requirements:
        </span>{' '}
        Competitions appear here after registrations close and confirmed, paid contestants receive trunk numbers. Finish judging before marking a competition completed.
      </div>

      {/* Competitions Grid */}
      {loadingCompetitions ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#222222] py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
        </div>
      ) : competitions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#1a1a1a] p-12 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500/80" />
          <h3 className="font-display mt-3 text-lg font-bold text-white uppercase">
            No Eligible Competitions Ready for Judging
          </h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
            Close registrations, assign trunk numbers to confirmed, paid contestants, then return here. Completed competitions move to History.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((comp) => {
            const status = comp.judgingStatus || 'Judging Not Started';
            const isEvaluationDone = status === 'Evaluation Done' || status === 'Judging Completed';
            const isInProgress = status === 'Judging In Progress';

            return (
              <article
                key={comp.id}
                onClick={() => setSelectedCompId(comp.id)}
                className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-lg transition-all duration-200 hover:-translate-y-1 hover:border-[#F15A24]/50 hover:shadow-xl hover:shadow-[#F15A24]/10"
              >
                {/* Poster Container */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#121212]">
                  <img
                    src={getCompetitionPoster(comp)}
                    alt={`${comp.name} poster`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                  {/* Top Badges Overlay */}
                  <div className="absolute top-3 right-3 left-3 flex items-center justify-between gap-2">
                    <span className="rounded-md border border-black/40 bg-black/60 px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase backdrop-blur-md">
                      {comp.competitionType}
                    </span>

                    {/* Final Competition Status Badge: Evaluation Done | Judging In Progress | Judging Not Started */}
                    {isEvaluationDone ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-black/70 px-2 py-0.5 text-[11px] font-bold text-emerald-400 backdrop-blur-md uppercase">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Evaluation Done</span>
                      </span>
                    ) : isInProgress ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/50 bg-black/70 px-2 py-0.5 text-[11px] font-bold text-blue-400 backdrop-blur-md uppercase">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span>Judging In Progress</span>
                      </span>
                    ) : (
                      <span className="rounded-md border border-white/20 bg-black/70 px-2 py-0.5 text-[11px] font-bold text-zinc-300 backdrop-blur-md uppercase">
                        Judging Not Started
                      </span>
                    )}
                  </div>

                  {/* Bottom Fee Overlay */}
                  <div className="absolute right-3 bottom-2.5">
                    <span className="font-display text-lg font-extrabold text-[#F15A24] drop-shadow-md">
                      {formatFee(comp.registrationFee)}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-wide text-white uppercase transition-colors group-hover:text-[#F15A24]">
                      {comp.name}
                    </h3>

                    {/* Metadata details */}
                    <div className="mt-2.5 space-y-1.5 text-xs text-[#A1A1AA]">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
                        <span>Date: {formatDate(comp.eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
                        <span className="truncate">
                          Venue: {comp.venue || 'Not specified'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                        <span>
                          {comp.eligibleParticipantCount || 0} Confirmed Contestant(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Status & Open Judging Workspace */}
                  <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs">
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {isEvaluationDone
                        ? 'Evaluation Done'
                        : isInProgress
                          ? `In Progress (${comp.activeJudgingSession?.progress?.completionPercentage ?? 0}%)`
                          : 'Judging Not Started'}
                    </span>

                    <span className="font-bold tracking-wider text-[#F15A24] uppercase text-[11px] transition-transform group-hover:translate-x-0.5 flex items-center gap-1">
                      <span>Judging Workspace</span>
                      <span>→</span>
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Directory Modal: Manage General Judges Directory */}
      {directoryModalOpen && (
        <DirectoryJudgesModal
          accessToken={accessToken}
          onClose={() => setDirectoryModalOpen(false)}
          onJudgeChanged={loadCompetitions}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helper Component: Directory Judges Management Modal
// ----------------------------------------------------------------------------
function DirectoryJudgesModal({ accessToken, onClose, onJudgeChanged }) {
  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingJudge, setEditingJudge] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [judgeToDelete, setJudgeToDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchJudges = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.fetchAdminJudges(accessToken);
      setJudges(res.judges || []);
    } catch (err) {
      setError(err.message || 'Failed to load judges.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchJudges();
  }, [fetchJudges]);

  const handleSave = async (payload) => {
    if (editingJudge) {
      await apiClient.updateAdminJudge(accessToken, editingJudge.id, payload);
    } else {
      await apiClient.createAdminJudge(accessToken, payload);
    }
    await fetchJudges();
    if (onJudgeChanged) onJudgeChanged();
  };

  const confirmDelete = async () => {
    if (!judgeToDelete) return;
    setActionLoading(true);
    try {
      await apiClient.deleteAdminJudge(accessToken, judgeToDelete.id);
      setJudgeToDelete(null);
      await fetchJudges();
      if (onJudgeChanged) onJudgeChanged();
    } catch (err) {
      setError(err.message || 'Failed to delete judge.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#181818] text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold uppercase text-white">
                Official Judges Directory ({judges.length})
              </h3>
              <p className="text-xs text-zinc-400">
                Manage your panel of judges. You can assign these judges to individual competitions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingJudge(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-3.5 py-1.5 text-xs font-bold text-white uppercase shadow-md hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Judge</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
            </div>
          ) : judges.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#121212] p-12 text-center text-xs text-zinc-400">
              No judges found in directory. Click &quot;Add Judge&quot; to register official panel judges.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] bg-[#101010] text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">Judge Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">City / District</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {judges.map((j) => (
                      <tr key={j.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold text-white">{j.name}</td>
                        <td className="px-4 py-3 text-zinc-300 font-mono">{j.phone || '—'}</td>
                        <td className="px-4 py-3 text-zinc-400">{j.city || '—'}</td>
                        <td className="px-4 py-3">
                          {j.isActive ? (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-400 uppercase">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingJudge(j);
                                setFormOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#222222] px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white"
                            >
                              <Pencil className="h-3 w-3 text-[#F15A24]" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setJudgeToDelete(j)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <JudgeFormModal
        isOpen={formOpen}
        judge={editingJudge}
        onClose={() => {
          setFormOpen(false);
          setEditingJudge(null);
        }}
        onSave={handleSave}
      />

      {judgeToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1c1c1c] p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold uppercase text-white">
                  Confirm Delete Judge
                </h3>
                <p className="mt-1 text-xs text-zinc-300">
                  Are you sure you want to delete judge <strong className="text-white">{judgeToDelete.name}</strong>?
                </p>
                <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
                  Historical judging scores and winner title awards made by this judge will be preserved.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setJudgeToDelete(null)}
                className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={confirmDelete}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white uppercase shadow-md hover:bg-red-500"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Delete Judge</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
