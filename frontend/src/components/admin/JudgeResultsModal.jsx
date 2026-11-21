import { useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Gavel,
  Loader2,
  MapPin,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient.js';
import { formatDate } from '../../utils/formatters.js';

export function JudgeResultsModal({
  isOpen,
  onClose,
  sessionId,
  competitionName,
  accessToken,
  initialJudgeId = null,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedJudgeId, setSelectedJudgeId] = useState(initialJudgeId || '');

  useEffect(() => {
    if (!isOpen || !sessionId || !accessToken) return;

    let isMounted = true;
    setLoading(true);
    setError('');

    apiClient
      .fetchJudgingSessionResults(accessToken, sessionId)
      .then((res) => {
        if (!isMounted) return;
        setData(res);
        if (res.judgeResults?.length > 0) {
          const matchInitial = initialJudgeId && res.judgeResults.some((j) => j.judge.id === initialJudgeId);
          setSelectedJudgeId(matchInitial ? initialJudgeId : res.judgeResults[0].judge.id);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to load judge evaluation results.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionId, accessToken, initialJudgeId]);

  if (!isOpen) return null;

  const currentJudgeResult = data?.judgeResults?.find(
    (j) => j.judge.id === selectedJudgeId
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-[#181818] text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F15A24]/10 text-[#F15A24] ring-1 ring-[#F15A24]/30">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold uppercase text-white">
                  Judge Evaluation Results
                </h3>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300 uppercase">
                  Official Panel
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {competitionName || data?.competition?.name || 'Competition'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
              <p className="text-xs">Loading panel evaluations &amp; rankings...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-center text-xs text-red-200">
              {error}
            </div>
          ) : (
            <>
              {/* Overall Progress Banner */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-white/10 bg-[#141414] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase">
                      Panel Judges
                    </span>
                    <p className="text-lg font-extrabold text-white">
                      {data?.overallProgress?.totalJudges || 0} Judges
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F15A24]/10 text-[#F15A24]">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase">
                      Categories
                    </span>
                    <p className="text-lg font-extrabold text-white">
                      {data?.overallProgress?.totalCategories || 0} Divisions
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-400 uppercase">
                        Progress
                      </span>
                      <span className="font-bold text-emerald-400 font-mono">
                        {data?.overallProgress?.completionPercentage || 0}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-[#F15A24] to-emerald-400 rounded-full"
                        style={{
                          width: `${data?.overallProgress?.completionPercentage || 0}%`,
                        }}
                      />
                    </div>
                    <span className="mt-1 block text-[10px] text-zinc-500">
                      {data?.overallProgress?.totalSubmittedSubmissions || 0} of{' '}
                      {data?.overallProgress?.totalPossibleSubmissions || 0} Submissions
                    </span>
                  </div>
                </div>
              </div>

              {/* Judge Tabs */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Select Judge:
                </span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {data?.judgeResults?.map((jr) => {
                    const isSelected = jr.judge.id === selectedJudgeId;
                    return (
                      <button
                        key={jr.judge.id}
                        type="button"
                        onClick={() => setSelectedJudgeId(jr.judge.id)}
                        className={`flex items-center gap-2.5 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 border ${
                          isSelected
                            ? 'border-[#F15A24] bg-[#F15A24]/15 text-white shadow-sm ring-1 ring-[#F15A24]/30'
                            : 'border-white/10 bg-[#222222] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Gavel className="h-3.5 w-3.5 text-[#F15A24]" />
                        <span>{jr.judge.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                            jr.isFullyCompleted
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {jr.submittedCategoriesCount}/{jr.totalCategories}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Judge's Category Evaluations */}
              {currentJudgeResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                    <div>
                      <h4 className="font-bold text-white text-base">
                        Evaluations by {currentJudgeResult.judge.name}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        {currentJudgeResult.judge.designation || 'Official Judge'}{' '}
                        {currentJudgeResult.judge.city && `• ${currentJudgeResult.judge.city}`}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        currentJudgeResult.isFullyCompleted
                          ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border border-amber-500/40 bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      <span>
                        {currentJudgeResult.submittedCategoriesCount} of{' '}
                        {currentJudgeResult.totalCategories} Categories Completed
                      </span>
                    </span>
                  </div>

                  {/* List of Categories */}
                  <div className="space-y-4">
                    {currentJudgeResult.categoryEvaluations?.map((catEval) => (
                      <div
                        key={catEval.categoryId}
                        className="rounded-2xl border border-white/[0.08] bg-[#1d1d1d] p-5 space-y-4"
                      >
                        {/* Category Heading & Status */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.06] pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-display text-base font-bold text-white uppercase">
                                {catEval.categoryName}
                              </span>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                                {catEval.gender}
                              </span>
                            </div>
                            <span className="text-xs text-zinc-400">
                              {catEval.semifinalistsCount} Semifinalists Selected
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {catEval.isSubmitted ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-bold text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Evaluation Submitted</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[11px] font-bold text-amber-400">
                                <Clock className="h-3 w-3" />
                                <span>Pending Evaluation</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Special Awards / Winner Selections */}
                        {catEval.winners?.length > 0 && (
                          <div className="rounded-xl border border-[#F15A24]/30 bg-[#F15A24]/[0.05] p-3.5 space-y-2">
                            <span className="text-[11px] font-bold text-[#F15A24] uppercase tracking-wider flex items-center gap-1.5">
                              <Trophy className="h-3.5 w-3.5" />
                              <span>Awarded Special Titles</span>
                            </span>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {catEval.winners.map((win, idx) => (
                                <div
                                  key={idx}
                                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#222222] px-3 py-1.5 text-xs"
                                >
                                  <span className="font-bold text-[#F15A24]">
                                    {win.title}:
                                  </span>
                                  <span className="font-bold text-white">
                                    {win.participantName}
                                  </span>
                                  <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[10px] text-zinc-300">
                                    Trunk #{win.trunkNumber}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Final Rankings Table */}
                        {catEval.rankings?.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic py-2">
                            No rankings submitted yet for this category.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#161616]">
                            <table className="w-full text-left text-xs">
                              <thead className="border-b border-white/[0.08] bg-[#121212] text-[11px] font-bold text-zinc-400 uppercase">
                                <tr>
                                  <th className="w-24 px-4 py-2.5">Final Rank</th>
                                  <th className="w-24 px-4 py-2.5">Trunk No.</th>
                                  <th className="px-4 py-2.5">Contestant Name</th>
                                  <th className="px-4 py-2.5">Gym / Club</th>
                                  <th className="px-4 py-2.5 text-right">Awarded Title</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/[0.04]">
                                {catEval.rankings.map((r) => (
                                  <tr key={r.registrationId} className="hover:bg-white/[0.02]">
                                    <td className="px-4 py-2.5 font-bold text-white">
                                      <span
                                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                                          r.rank === 1
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                            : r.rank === 2
                                              ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30'
                                              : r.rank === 3
                                                ? 'bg-amber-700/20 text-amber-400 border border-amber-700/30'
                                                : 'text-zinc-400'
                                        }`}
                                      >
                                        Rank {r.rank}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="font-mono font-extrabold text-[#F15A24]">
                                        {r.trunkNumber}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-white">
                                      {r.participantName}
                                    </td>
                                    <td className="px-4 py-2.5 text-zinc-300">
                                      {r.representingType === 'INDIVIDUAL' || r.gymName?.toLowerCase().includes('individual')
                                        ? 'Individual'
                                        : r.gymName || 'Individual'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      {r.title ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-[#F15A24]/40 bg-[#F15A24]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#F15A24]">
                                          🏆 {r.title}
                                        </span>
                                      ) : (
                                        <span className="text-zinc-600">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/[0.08] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-[#222222] px-5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
