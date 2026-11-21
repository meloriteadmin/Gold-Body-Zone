import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Gavel,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient.js';
import { formatDate } from '../utils/formatters.js';

const WINNER_TITLES = [
  'Best Poser',
  'Most Improved Body Builder',
];

function formatGymDisplay(cand = {}) {
  if (
    cand.representingType === 'INDIVIDUAL' ||
    (cand.gymName && cand.gymName.toLowerCase().includes('individual'))
  ) {
    return 'Individual';
  }
  return cand.gymName || 'Individual';
}

export function JudgeSessionPage() {
  const { token, judgeId: routeJudgeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlJudgeId = routeJudgeId || searchParams.get('judgeId') || searchParams.get('jid');
  const urlKey = searchParams.get('key') || searchParams.get('accessKey');

  // Session & Identification state
  const [sessionData, setSessionData] = useState(null);
  const [identifiedJudge, setIdentifiedJudge] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');

  // Judging steps: 'semifinalists' | 'ranking' | 'winners'
  const [currentStep, setCurrentStep] = useState('semifinalists');

  // Progression & active category
  const [progressionData, setProgressionData] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [submittingEmptyCat, setSubmittingEmptyCat] = useState(false);

  // Category data & judging state
  const [categoryData, setCategoryData] = useState(null);
  const [loadingCatData, setLoadingCatData] = useState(false);
  const [catError, setCatError] = useState('');

  // Selected semifinalist IDs: Set of registrationId strings
  const [selectedRegIds, setSelectedRegIds] = useState(new Set());
  const [savingSelections, setSavingSelections] = useState(false);

  // Rankings state: Map of registrationId -> rank (Number)
  const [rankingsMap, setRankingsMap] = useState(new Map());
  const [savingRankings, setSavingRankings] = useState(false);
  const [rankingSuccessMsg, setRankingSuccessMsg] = useState('');
  const [rankingError, setRankingError] = useState('');

  // Winner Titles state: Map of registrationId -> title string
  const [winnerTitlesMap, setWinnerTitlesMap] = useState(new Map());
  const [savingWinners, setSavingWinners] = useState(false);
  const [winnerSuccessMsg, setWinnerSuccessMsg] = useState('');
  const [winnerError, setWinnerError] = useState('');

  // Load judging session metadata
  const loadSession = useCallback(async () => {
    if (!token) return;
    setLoadingSession(true);
    setSessionError('');
    try {
      let candidateJudgeId = urlJudgeId;
      let candidateKey = urlKey;

      if (!candidateJudgeId) {
        const storedJudgeJson = localStorage.getItem(`gbz_judge_${token}`);
        if (storedJudgeJson) {
          try {
            const parsed = JSON.parse(storedJudgeJson);
            if (parsed?.id) {
              candidateJudgeId = parsed.id;
              candidateKey = parsed.accessKey || null;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      const data = await apiClient.fetchJudgingSession(token, {
        judgeId: candidateJudgeId || undefined,
        key: candidateKey || undefined,
      });
      setSessionData(data);

      if (data.identifiedJudge) {
        setIdentifiedJudge(data.identifiedJudge);
        localStorage.setItem(`gbz_judge_${token}`, JSON.stringify(data.identifiedJudge));
      } else if (candidateJudgeId && data.judges?.length > 0) {
        const matched = data.judges.find((j) => j.id === candidateJudgeId);
        if (matched) {
          setIdentifiedJudge(matched);
          localStorage.setItem(`gbz_judge_${token}`, JSON.stringify(matched));
        }
      }
    } catch (err) {
      setSessionError(
        err.message ||
          'This temporary judging link has expired or was revoked. Please contact the administrator.'
      );
    } finally {
      setLoadingSession(false);
    }
  }, [token, urlJudgeId, urlKey]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Load progression status across all judges
  const loadProgression = useCallback(async () => {
    if (!token || !identifiedJudge?.id) return;
    try {
      const prog = await apiClient.fetchJudgingProgression(
        token,
        identifiedJudge.id
      );
      setProgressionData(prog);

      // Auto-synchronize to active category if needed
      if (prog?.currentActiveCategoryId) {
        setSelectedCategoryId((prev) => {
          if (!prev) return prog.currentActiveCategoryId;
          const currentCatInfo = prog.categories?.find((c) => c.id === prev);
          // If current selection is finished or locked, jump to active category
          if (currentCatInfo?.status === 'COMPLETED' || currentCatInfo?.status === 'LOCKED') {
            return prog.currentActiveCategoryId;
          }
          return prev;
        });
      }
    } catch {
      // Ignore background progression poll error
    }
  }, [token, identifiedJudge]);

  // Periodic polling for progression synchronization (every 3 seconds)
  useEffect(() => {
    if (!identifiedJudge?.id) return;
    loadProgression();

    const interval = setInterval(() => {
      loadProgression();
    }, 3000);

    return () => clearInterval(interval);
  }, [identifiedJudge, loadProgression]);

  // Load participants, existing selections, and rankings for active category/group
  const loadCategoryJudgingData = useCallback(async () => {
    if (!token || !identifiedJudge?.id || !selectedCategoryId) return;
    setLoadingCatData(true);
    setCatError('');
    setRankingError('');
    setRankingSuccessMsg('');
    setWinnerError('');
    setWinnerSuccessMsg('');
    try {
      const data = await apiClient.fetchCategoryJudgingData(token, {
        judgeId: identifiedJudge.id,
        categoryId: selectedCategoryId,
        groupId: selectedGroupId || null,
      });
      setCategoryData(data);

      // Restore selections
      const selSet = new Set(data.selectedRegistrationIds || []);
      setSelectedRegIds(selSet);

      // Restore rankings and winner titles
      const rMap = new Map();
      const tMap = new Map();
      (data.rankings || []).forEach((r) => {
        rMap.set(r.registrationId, Number(r.rank));
        if (r.title) {
          tMap.set(r.registrationId, r.title);
        }
      });
      setRankingsMap(rMap);
      setWinnerTitlesMap(tMap);
    } catch (err) {
      setCatError(err.message || 'Failed to load category judging sheet.');
    } finally {
      setLoadingCatData(false);
    }
  }, [token, identifiedJudge, selectedCategoryId, selectedGroupId]);

  useEffect(() => {
    if (identifiedJudge && selectedCategoryId) {
      loadCategoryJudgingData();
    }
  }, [identifiedJudge, selectedCategoryId, selectedGroupId, loadCategoryJudgingData]);

  // Handle Judge Identification Confirmation
  const handleConfirmJudge = (judge) => {
    setIdentifiedJudge(judge);
    localStorage.setItem(`gbz_judge_${token}`, JSON.stringify(judge));
    setCurrentStep('semifinalists');
  };

  // Toggle Semifinalist Checkbox
  const handleToggleParticipant = async (regId) => {
    const nextSet = new Set(selectedRegIds);
    if (nextSet.has(regId)) {
      nextSet.delete(regId);
    } else {
      nextSet.add(regId);
    }
    setSelectedRegIds(nextSet);

    // Auto-save selections
    try {
      setSavingSelections(true);
      await apiClient.saveSemifinalistSelections(token, {
        judgeId: identifiedJudge.id,
        categoryId: selectedCategoryId,
        groupId: selectedGroupId || null,
        selectedRegistrationIds: Array.from(nextSet),
      });
    } catch (err) {
      setCatError(err.message || 'Failed to save selection.');
    } finally {
      setSavingSelections(false);
    }
  };

  // Proceed from Semifinalists to Ranking
  const handleProceedToRanking = () => {
    if (selectedRegIds.size === 0) {
      alert('Please select at least 1 semifinalist before proceeding to ranking.');
      return;
    }
    setCurrentStep('ranking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Rank Change for a participant
  const handleRankChange = (regId, rankValue) => {
    const nextMap = new Map(rankingsMap);
    if (!rankValue) {
      nextMap.delete(regId);
    } else {
      nextMap.set(regId, Number(rankValue));
    }
    setRankingsMap(nextMap);
    setRankingError('');
    setRankingSuccessMsg('');
  };

  // Save Rankings
  const handleSaveRankings = async () => {
    const totalSelected = selectedRegIds.size;
    if (totalSelected === 0) {
      setRankingError('No semifinalists selected.');
      return;
    }

    // Verify all selected participants have a rank
    const unranked = Array.from(selectedRegIds).filter(
      (id) => !rankingsMap.has(id) || !rankingsMap.get(id)
    );
    if (unranked.length > 0) {
      setRankingError(
        `All ${totalSelected} semifinalists must be assigned a rank. You have ${unranked.length} unranked contestant(s).`
      );
      return;
    }

    // Verify ranks are unique
    const assignedRanks = new Set();
    const duplicateRanks = new Set();

    for (const [id, rk] of rankingsMap.entries()) {
      if (!selectedRegIds.has(id)) continue;
      if (assignedRanks.has(rk)) {
        duplicateRanks.add(rk);
      }
      assignedRanks.add(rk);
    }

    if (duplicateRanks.size > 0) {
      setRankingError(
        `Duplicate rank(s) detected: ${Array.from(duplicateRanks).join(
          ', '
        )}. Each contestant must receive a unique rank from 1 to ${totalSelected}.`
      );
      return;
    }

    // Format rankings payload
    const rankingsPayload = Array.from(selectedRegIds).map((id) => ({
      registrationId: id,
      rank: rankingsMap.get(id),
    }));

    setSavingRankings(true);
    setRankingError('');
    setRankingSuccessMsg('');
    try {
      const res = await apiClient.saveJudgeRankings(token, {
        judgeId: identifiedJudge.id,
        categoryId: selectedCategoryId,
        groupId: selectedGroupId || null,
        rankings: rankingsPayload,
      });
      setRankingSuccessMsg(
        res.message ||
          `Rankings saved successfully for ${totalSelected} contestant(s)!`
      );
      // Immediately refresh progression
      await loadProgression();
    } catch (err) {
      setRankingError(err.message || 'Failed to save rankings.');
    } finally {
      setSavingRankings(false);
    }
  };

  // Proceed to Winner Selection
  const handleProceedToWinners = async (autoSave = false) => {
    const totalSelected = selectedRegIds.size;
    if (totalSelected === 0) {
      setRankingError('Please select at least 1 semifinalist first.');
      return;
    }

    // Verify all selected participants have a rank
    const unranked = Array.from(selectedRegIds).filter(
      (id) => !rankingsMap.has(id) || !rankingsMap.get(id)
    );
    if (unranked.length > 0) {
      setRankingError(
        `All ${totalSelected} semifinalists must be assigned a rank before proceeding to winner selection. You have ${unranked.length} unranked contestant(s).`
      );
      return;
    }

    // Verify ranks are unique
    const assignedRanks = new Set();
    const duplicateRanks = new Set();
    for (const [id, rk] of rankingsMap.entries()) {
      if (!selectedRegIds.has(id)) continue;
      if (assignedRanks.has(rk)) {
        duplicateRanks.add(rk);
      }
      assignedRanks.add(rk);
    }
    if (duplicateRanks.size > 0) {
      setRankingError(
        `Duplicate rank(s) detected: ${Array.from(duplicateRanks).join(
          ', '
        )}. Each contestant must receive a unique rank from 1 to ${totalSelected}.`
      );
      return;
    }

    if (autoSave) {
      const rankingsPayload = Array.from(selectedRegIds).map((id) => ({
        registrationId: id,
        rank: rankingsMap.get(id),
      }));

      setSavingRankings(true);
      setRankingError('');
      setRankingSuccessMsg('');
      try {
        await apiClient.saveJudgeRankings(token, {
          judgeId: identifiedJudge.id,
          categoryId: selectedCategoryId,
          groupId: selectedGroupId || null,
          rankings: rankingsPayload,
        });
      } catch (err) {
        setRankingError(err.message || 'Failed to save rankings.');
        setSavingRankings(false);
        return;
      } finally {
        setSavingRankings(false);
      }
    }

    setWinnerError('');
    setWinnerSuccessMsg('');
    setCurrentStep('winners');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Title Change for a contestant
  const handleTitleChange = (regId, titleValue) => {
    const nextMap = new Map(winnerTitlesMap);
    if (!titleValue) {
      nextMap.delete(regId);
    } else {
      nextMap.set(regId, titleValue);
    }
    setWinnerTitlesMap(nextMap);
    setWinnerError('');
    setWinnerSuccessMsg('');
  };

  // Handle Final Submit for Winners & Category Evaluation
  const handleFinalSubmitWinners = async () => {
    // Validate that each title is assigned to at most one contestant
    const titleCounts = new Map();
    for (const [regId, title] of winnerTitlesMap.entries()) {
      if (!title || !selectedRegIds.has(regId)) continue;
      titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
      if (titleCounts.get(title) > 1) {
        setWinnerError(`Award "${title}" cannot be assigned to multiple contestants.`);
        return;
      }
    }

    setSavingWinners(true);
    setWinnerError('');
    setWinnerSuccessMsg('');
    try {
      const winnerTitlesPayload = [];
      winnerTitlesMap.forEach((title, registrationId) => {
        if (title && title.trim() && selectedRegIds.has(registrationId)) {
          winnerTitlesPayload.push({
            registrationId,
            title: title.trim(),
          });
        }
      });

      const res = await apiClient.saveJudgeWinnerTitles(token, {
        judgeId: identifiedJudge.id,
        categoryId: selectedCategoryId,
        groupId: selectedGroupId || null,
        winnerTitles: winnerTitlesPayload,
      });

      setWinnerSuccessMsg(res.message || 'Category evaluation submitted successfully!');

      // Reload progression
      const prog = await apiClient.fetchJudgingProgression(token, identifiedJudge.id);
      setProgressionData(prog);

      // If next category is available, transition after a short delay
      if (prog?.currentActiveCategoryId && prog.currentActiveCategoryId !== selectedCategoryId) {
        setTimeout(() => {
          setSelectedCategoryId(prog.currentActiveCategoryId);
          setSelectedGroupId('');
          setCurrentStep('semifinalists');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 1200);
      } else {
        await loadCategoryJudgingData();
      }
    } catch (err) {
      setWinnerError(err.message || 'Failed to submit category evaluation.');
    } finally {
      setSavingWinners(false);
    }
  };

  // Handle empty category submission (0 contestants)
  const handleCompleteEmptyCategory = async () => {
    try {
      setSubmittingEmptyCat(true);
      setCatError('');
      const prog = await apiClient.completeEmptyCategory(token, {
        judgeId: identifiedJudge.id,
        categoryId: selectedCategoryId,
      });
      setProgressionData(prog);
      if (
        prog?.currentActiveCategoryId &&
        prog.currentActiveCategoryId !== selectedCategoryId
      ) {
        setSelectedCategoryId(prog.currentActiveCategoryId);
      }
    } catch (err) {
      setCatError(err.message || 'Failed to submit category completion.');
    } finally {
      setSubmittingEmptyCat(false);
    }
  };

  // Active Category & Group details
  const activeCategory = useMemo(() => {
    return (
      progressionData?.categories?.find((c) => c.id === selectedCategoryId) ||
      sessionData?.competition?.categories?.find((c) => c.id === selectedCategoryId) ||
      null
    );
  }, [progressionData, sessionData, selectedCategoryId]);

  const activeCategoryProgression = useMemo(() => {
    return (
      progressionData?.categories?.find((c) => c.id === selectedCategoryId) || null
    );
  }, [progressionData, selectedCategoryId]);

  const activeGroup = useMemo(() => {
    return activeCategory?.groups?.find((g) => g.id === selectedGroupId) || null;
  }, [activeCategory, selectedGroupId]);

  // Selected semifinalist objects for the ranking page
  const selectedParticipants = useMemo(() => {
    if (!categoryData?.participants) return [];
    return categoryData.participants.filter((p) => selectedRegIds.has(p.id));
  }, [categoryData, selectedRegIds]);

  // Ranked participants sorted by rank (1 to N) for winner selection
  const rankedParticipants = useMemo(() => {
    if (!categoryData?.participants) return [];
    return categoryData.participants
      .filter((p) => selectedRegIds.has(p.id) && rankingsMap.has(p.id))
      .sort((a, b) => (rankingsMap.get(a.id) || 0) - (rankingsMap.get(b.id) || 0));
  }, [categoryData, selectedRegIds, rankingsMap]);

  // Available rank options: 1 to N
  const rankOptions = useMemo(() => {
    const count = selectedRegIds.size;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [selectedRegIds]);

  // -------------------------------------------------------------
  // RENDER: Loading or Error
  // -------------------------------------------------------------
  if (loadingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111] p-4 text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F15A24]/10 text-[#F15A24]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <p className="mt-4 text-xs font-semibold text-zinc-400">
          Verifying judging session link...
        </p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111] p-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1c1c1c] p-8 text-center shadow-2xl space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold uppercase text-white">
            Link Expired or Inactive
          </h2>
          <p className="text-xs text-zinc-400">{sessionError}</p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const comp = sessionData?.competition;

  // -------------------------------------------------------------
  // RENDER: Step 0 - Judge Identification
  // -------------------------------------------------------------
  if (!identifiedJudge) {
    const availableJudges = sessionData?.judges || [];

    return (
      <div className="min-h-screen bg-[#111111] text-white">
        {/* Banner */}
        <header className="border-b border-white/[0.08] bg-[#181818] px-4 py-6 sm:px-8">
          <div className="w-full max-w-[1600px] mx-auto text-center space-y-2">
            <span className="rounded-md border border-[#F15A24]/40 bg-[#F15A24]/10 px-3 py-1 text-xs font-bold text-[#F15A24] uppercase tracking-wider">
              Official Judging Portal
            </span>
            <h1 className="font-display text-2xl sm:text-4xl font-extrabold uppercase text-white">
              {comp?.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-zinc-400 pt-1">
              <span>{formatDate(comp?.eventDate)}</span>
              <span>•</span>
              <span>{comp?.venue || 'Venue to be announced'}</span>
            </div>
          </div>
        </header>

        {/* Personal Judging Link Required */}
        <main className="w-full max-w-lg mx-auto px-4 py-16 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-8 shadow-xl text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F15A24]/10 text-[#F15A24]">
              <Lock className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold uppercase text-white">
                Personal Judging Link Required
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Each judge has been assigned a unique, secure judging link for this competition. Please access your judging sheet using your personal link provided by the administrator.
              </p>
            </div>
            <div className="pt-2 text-xs text-zinc-500 border-t border-white/[0.06]">
              Competition: {comp?.name || 'Active Competition'}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Main Judge Dashboard (Identified)
  // -------------------------------------------------------------
  const categoriesList = progressionData?.categories || sessionData?.competition?.categories || [];

  return (
    <div className="min-h-screen bg-[#111111] text-zinc-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#161616]/95 backdrop-blur-md px-4 py-3 sm:px-6 lg:px-8">
        <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F15A24]/20 to-[#E94B16]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30 shrink-0">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-white uppercase text-sm sm:text-base">
                  {comp?.name}
                </span>
                <span className="hidden sm:inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                  {comp?.competitionType}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 flex items-center gap-2">
                <span>{comp?.venue}</span>
                <span>•</span>
                <span>{formatDate(comp?.eventDate)}</span>
              </p>
            </div>
          </div>

          {/* Identified Judge Name Pill (Switch button removed) */}
          <div className="rounded-xl border border-white/10 bg-[#222222] px-4 py-2 text-right text-xs">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Official Judge
            </span>
            <span className="font-bold text-white text-sm sm:text-base">
              {identifiedJudge.name}
            </span>
          </div>
        </div>
      </header>

      {/* Synchronized Category Flow Bar */}
      <div className="border-b border-white/[0.08] bg-[#1a1a1a] px-4 py-3 sm:px-6 lg:px-8">
        <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Synchronized Sequence Stepper */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-bold text-zinc-400 uppercase shrink-0 mr-1">
              Sequence:
            </span>

            {categoriesList.map((cat, idx) => {
              const isSelected = cat.id === selectedCategoryId;
              const isSubmittedByMe = Boolean(cat.isSubmittedByCurrentJudge);
              const isInProgress = cat.status === 'IN_PROGRESS';
              const isLocked = cat.status === 'LOCKED' && !isSubmittedByMe;

              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) {
                      setSelectedCategoryId(cat.id);
                      setSelectedGroupId(cat.groups?.[0]?.id || '');
                      setCurrentStep('semifinalists');
                    }
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 border ${
                    isSelected
                      ? 'border-[#F15A24] bg-[#F15A24]/10 text-white shadow-sm ring-1 ring-[#F15A24]/30'
                      : isSubmittedByMe
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : isInProgress
                          ? 'border-[#F15A24]/40 bg-[#242424] text-zinc-200 hover:border-[#F15A24]'
                          : 'border-white/5 bg-[#181818] text-zinc-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-70">
                    {idx + 1}.
                  </span>
                  <span>{cat.name}</span>

                  {isSubmittedByMe ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : isInProgress ? (
                    <span className="rounded-full bg-[#F15A24] px-1.5 py-0.2 text-[9px] font-extrabold text-white uppercase">
                      Live
                    </span>
                  ) : isLocked ? (
                    <Lock className="h-3 w-3 text-zinc-600 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Stepper Tabs (1. Semifinalists / 2. Final Ranking / 3. Winner Selection) */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] p-1 self-start lg:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setCurrentStep('semifinalists')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                currentStep === 'semifinalists'
                  ? 'bg-[#F15A24] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>1. Semifinalists ({selectedRegIds.size})</span>
            </button>
            <button
              type="button"
              onClick={() => handleProceedToRanking()}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                currentStep === 'ranking'
                  ? 'bg-[#F15A24] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Award className="h-4 w-4" />
              <span>2. Final Ranking</span>
            </button>
            <button
              type="button"
              onClick={() => handleProceedToWinners(false)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                currentStep === 'winners'
                  ? 'bg-[#F15A24] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Trophy className="h-4 w-4" />
              <span>3. Winner Selection</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Full-Width Content Area */}
      <main className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {catError && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-xs sm:text-sm font-medium text-red-200"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{catError}</span>
          </div>
        )}

        {/* All Categories Completed Screen */}
        {progressionData?.allCategoriesCompleted ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-[#1a1a1a] p-10 sm:p-16 text-center shadow-2xl space-y-5">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <Trophy className="h-10 w-10 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Evaluation Done
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase text-white">
                All Categories Judged Successfully
              </h2>
              <p className="text-sm text-zinc-400 max-w-xl mx-auto">
                All categories have been evaluated and submitted. Thank you for your official panel judging service!
              </p>
            </div>
          </div>
        ) : loadingCatData ? (
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#1a1a1a] py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
          </div>
        ) : currentStep === 'semifinalists' ? (
          /* ------------------------------------------------------------- */
          /* STEP 1: SEMIFINALIST SELECTION                                */
          /* ------------------------------------------------------------- */
          <div className="space-y-5">
            {/* Step 1 Instructions & Counter Bar */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-6 sm:flex-row sm:items-center sm:justify-between shadow-lg">
              <div>
                <h3 className="font-display text-xl font-bold text-white uppercase flex items-center gap-3">
                  <span>Semifinalist Selection: {activeCategory?.name}</span>
                  <span className="rounded-md border border-[#F15A24]/40 bg-[#F15A24]/10 px-3 py-0.5 font-mono text-xs font-bold text-[#F15A24]">
                    {selectedRegIds.size} Selected
                  </span>
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                  Select the contestants you wish to advance to the final ranking round. Click any row or checkbox to select.
                </p>
              </div>

              <div className="flex items-center gap-4">
                {savingSelections && (
                  <span className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin text-[#F15A24]" />
                    <span>Saving...</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleProceedToRanking}
                  disabled={selectedRegIds.size === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-40"
                >
                  <span>Proceed to Ranking</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Participants Table */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-xl">
              {!categoryData?.participants ||
              categoryData.participants.length === 0 ? (
                <div className="p-16 text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-zinc-400">
                    <Users className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">
                      No eligible contestants registered in {activeCategory?.name}.
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      Acknowledge this category to record your completion and advance to the next category.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={submittingEmptyCat}
                      onClick={handleCompleteEmptyCategory}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#F15A24] px-6 py-2.5 text-xs font-bold text-white uppercase shadow-lg shadow-[#F15A24]/20 hover:brightness-110 disabled:opacity-50"
                    >
                      {submittingEmptyCat ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span>Confirm &amp; Submit Category (0 Contestants)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-white/[0.08] bg-[#141414] text-xs font-bold tracking-wider text-zinc-400 uppercase">
                      <tr>
                        <th className="w-16 px-6 py-4 text-center">Select</th>
                        <th className="w-32 px-6 py-4">Trunk No.</th>
                        <th className="px-6 py-4">Contestant Name</th>
                        <th className="px-6 py-4">Gym / Club</th>
                        <th className="px-6 py-4">District</th>
                        <th className="px-6 py-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {categoryData.participants.map((cand) => {
                        const isSelected = selectedRegIds.has(cand.id);

                        return (
                          <tr
                            key={cand.id}
                            onClick={() => handleToggleParticipant(cand.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#F15A24]/[0.08] hover:bg-[#F15A24]/[0.12]'
                                : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-6 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleParticipant(cand.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-5 w-5 rounded border-white/20 bg-[#222222] text-[#F15A24] focus:ring-0 cursor-pointer"
                              />
                            </td>

                            {/* Trunk Number */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-3.5 py-1.5 font-mono text-base font-extrabold text-[#F15A24]">
                                {cand.trunkNumber}
                              </span>
                            </td>

                            {/* Candidate Name */}
                            <td className="px-6 py-4 font-bold text-white text-base">
                              {cand.participantName}
                            </td>

                            {/* Gym Name */}
                            <td className="px-6 py-4 text-zinc-300 font-medium">
                              {formatGymDisplay(cand)}
                            </td>

                            {/* District */}
                            <td className="px-6 py-4 text-zinc-400">
                              {cand.district || '—'}
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 text-right">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F15A24]/40 bg-[#F15A24]/10 px-3 py-1 text-xs font-bold text-[#F15A24] uppercase">
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Selected</span>
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-500 font-medium">
                                  Not Selected
                                </span>
                              )}
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
        ) : currentStep === 'ranking' ? (
          /* ------------------------------------------------------------- */
          /* STEP 2: RANKING PAGE                                          */
          /* ------------------------------------------------------------- */
          <div className="space-y-5">
            {/* Step 2 Header & Action Bar */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-6 sm:flex-row sm:items-center sm:justify-between shadow-lg">
              <div>
                <h3 className="font-display text-xl font-bold text-white uppercase flex items-center gap-2.5">
                  <Award className="h-6 w-6 text-[#F15A24]" />
                  <span>Assign Final Ranks (1 to {selectedRegIds.size}) — {activeCategory?.name}</span>
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                  Assign each selected semifinalist a unique rank from 1 to{' '}
                  {selectedRegIds.size}. Every contestant must receive exactly one unique rank.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep('semifinalists')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-5 py-3 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Semifinalists</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveRankings}
                  disabled={savingRankings || selectedParticipants.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-4 py-3 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
                  title="Save current rankings"
                >
                  {savingRankings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Save Rankings</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProceedToWinners(true)}
                  disabled={savingRankings || selectedParticipants.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {savingRankings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  <span>Next: Winner Selection</span>
                </button>
              </div>
            </div>

            {/* Success Notification */}
            {rankingSuccessMsg && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 text-xs sm:text-sm font-bold text-emerald-200"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span>{rankingSuccessMsg}</span>
              </div>
            )}

            {/* Error Notification */}
            {rankingError && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-xs sm:text-sm font-bold text-red-200"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{rankingError}</span>
              </div>
            )}

            {/* Selected Semifinalists Table */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-xl">
              {selectedParticipants.length === 0 ? (
                <div className="p-16 text-center text-xs sm:text-sm text-zinc-400 space-y-4">
                  <p>No semifinalists have been selected yet.</p>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('semifinalists')}
                    className="rounded-xl bg-[#F15A24] px-5 py-2.5 text-xs font-bold text-white uppercase shadow-md hover:brightness-110"
                  >
                    Select Semifinalists First
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-white/[0.08] bg-[#141414] text-xs font-bold tracking-wider text-zinc-400 uppercase">
                      <tr>
                        <th className="w-32 px-6 py-4">Trunk No.</th>
                        <th className="px-6 py-4">Contestant Name</th>
                        <th className="px-6 py-4">Gym / Club</th>
                        <th className="w-64 px-6 py-4 text-right">Assign Rank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {selectedParticipants.map((cand) => {
                        const currentRank = rankingsMap.get(cand.id) || '';

                        return (
                          <tr key={cand.id} className="hover:bg-white/[0.02] transition-colors">
                            {/* Trunk Number */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-3.5 py-1.5 font-mono text-base font-extrabold text-[#F15A24]">
                                {cand.trunkNumber}
                              </span>
                            </td>

                            {/* Contestant Name */}
                            <td className="px-6 py-4 font-bold text-white text-base">
                              {cand.participantName}
                            </td>

                            {/* Gym */}
                            <td className="px-6 py-4 text-zinc-300 font-medium">
                              {formatGymDisplay(cand)}
                            </td>

                            {/* Rank Dropdown */}
                            <td className="px-6 py-4 text-right">
                              <select
                                value={currentRank}
                                onChange={(e) =>
                                  handleRankChange(cand.id, e.target.value)
                                }
                                className={`w-full max-w-[240px] rounded-xl border px-4 py-2.5 text-xs font-bold focus:outline-none cursor-pointer ${
                                  currentRank
                                    ? 'border-[#F15A24] bg-[#222222] text-[#F15A24]'
                                    : 'border-white/10 bg-[#1c1c1c] text-zinc-400'
                                }`}
                              >
                                <option value="">Select Rank...</option>
                                {rankOptions.map((num) => {
                                  const takenBy = Array.from(
                                    rankingsMap.entries()
                                  ).find(
                                    ([id, val]) =>
                                      id !== cand.id &&
                                      val === num &&
                                      selectedRegIds.has(id)
                                  );

                                  return (
                                    <option
                                      key={num}
                                      value={num}
                                      disabled={Boolean(takenBy)}
                                    >
                                      Rank {num}
                                      {takenBy
                                        ? ` (Already Assigned)`
                                        : num === 1
                                          ? ' (1st Place)'
                                          : num === 2
                                            ? ' (2nd Place)'
                                            : num === 3
                                              ? ' (3rd Place)'
                                              : ''}
                                    </option>
                                  );
                                })}
                              </select>
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
        ) : (
          /* ------------------------------------------------------------- */
          /* STEP 3: WINNER SELECTION                                      */
          /* ------------------------------------------------------------- */
          <div className="space-y-5">
            {/* Step 3 Header & Action Bar */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-6 sm:flex-row sm:items-center sm:justify-between shadow-lg">
              <div>
                <h3 className="font-display text-xl font-bold text-white uppercase flex items-center gap-2.5">
                  <Trophy className="h-6 w-6 text-[#F15A24]" />
                  <span>Winner Selection — {activeCategory?.name}</span>
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                  Select special titles from the dropdown for eligible contestants: <span className="font-semibold text-white">Best Poser</span> or <span className="font-semibold text-white">Most Improved Body Builder</span>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep('ranking')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#222222] px-5 py-3 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Ranking</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinalSubmitWinners}
                  disabled={savingWinners || rankedParticipants.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-emerald-500/20 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {savingWinners ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Final Submit Category Evaluation</span>
                </button>
              </div>
            </div>

            {/* Final Submitted Badge if already submitted */}
            {categoryData?.isFinalSubmitted && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3.5 text-xs sm:text-sm font-semibold text-emerald-300">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span>
                    Category evaluation submitted successfully. You can update titles and re-submit if needed.
                  </span>
                </div>
                {categoryData.submittedAt && (
                  <span className="text-xs text-emerald-400/80">
                    Submitted: {new Date(categoryData.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}

            {/* Success & Error Notifications */}
            {winnerSuccessMsg && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 text-xs sm:text-sm font-bold text-emerald-200"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span>{winnerSuccessMsg}</span>
              </div>
            )}

            {winnerError && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-xs sm:text-sm font-bold text-red-200"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{winnerError}</span>
              </div>
            )}

            {/* Table of Final-Ranked Contestants */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-xl">
              {rankedParticipants.length === 0 ? (
                <div className="p-16 text-center text-xs sm:text-sm text-zinc-400 space-y-4">
                  <p>No contestants have been ranked yet.</p>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('ranking')}
                    className="rounded-xl bg-[#F15A24] px-5 py-2.5 text-xs font-bold text-white uppercase shadow-md hover:brightness-110"
                  >
                    Assign Ranks First
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-white/[0.08] bg-[#141414] text-xs font-bold tracking-wider text-zinc-400 uppercase">
                      <tr>
                        <th className="w-32 px-6 py-4">Rank</th>
                        <th className="w-32 px-6 py-4">Trunk No.</th>
                        <th className="px-6 py-4">Contestant Name</th>
                        <th className="px-6 py-4">Gym / Club</th>
                        <th className="w-80 px-6 py-4 text-right">Title Award</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {rankedParticipants.map((cand) => {
                        const rk = rankingsMap.get(cand.id);
                        const currentTitle = winnerTitlesMap.get(cand.id) || '';

                        return (
                          <tr key={cand.id} className="hover:bg-white/[0.02] transition-colors">
                            {/* Rank Badge */}
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-extrabold uppercase ${
                                  rk === 1
                                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                                    : rk === 2
                                      ? 'bg-zinc-300/20 text-zinc-200 border border-zinc-300/40'
                                      : rk === 3
                                        ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                                        : 'bg-white/5 text-zinc-400 border border-white/10'
                                }`}
                              >
                                {rk === 1 ? '🥇 1st Place' : rk === 2 ? '🥈 2nd Place' : rk === 3 ? '🥉 3rd Place' : `Rank ${rk}`}
                              </span>
                            </td>

                            {/* Trunk Number */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center rounded-lg border border-[#F15A24]/40 bg-[#F15A24]/10 px-3.5 py-1.5 font-mono text-base font-extrabold text-[#F15A24]">
                                {cand.trunkNumber}
                              </span>
                            </td>

                            {/* Contestant Name */}
                            <td className="px-6 py-4 font-bold text-white text-base">
                              {cand.participantName}
                            </td>

                            {/* Gym */}
                            <td className="px-6 py-4 text-zinc-300 font-medium">
                              {formatGymDisplay(cand)}
                            </td>

                            {/* Title Dropdown */}
                            <td className="px-6 py-4 text-right">
                              <select
                                value={currentTitle}
                                onChange={(e) => handleTitleChange(cand.id, e.target.value)}
                                className={`w-full max-w-[280px] rounded-xl border px-4 py-2.5 text-xs font-bold focus:outline-none cursor-pointer ${
                                  currentTitle
                                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
                                    : 'border-white/10 bg-[#1c1c1c] text-zinc-400'
                                }`}
                              >
                                <option value="">-- No Title / None --</option>
                                {WINNER_TITLES.map((title) => {
                                  const takenByOther = Array.from(winnerTitlesMap.entries()).find(
                                    ([id, val]) => id !== cand.id && val === title
                                  );

                                  return (
                                    <option
                                      key={title}
                                      value={title}
                                      disabled={Boolean(takenByOther)}
                                    >
                                      🏆 {title}
                                      {takenByOther ? ' (Already Assigned)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
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
      </main>
    </div>
  );
}
