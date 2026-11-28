import {
  cancelHeat,
  closeHeat,
  getJudgeScoringState,
  getLiveDashboard,
  listLiveCompetitions,
  openHeat,
  regenerateJudgeLink,
  resetLiveScoring,
  setRound1Qualifiers,
  setTitleAwards,
  submitJudgeScores,
  unlockJudgeSubmission,
} from '../services/liveScoring.service.js';
import {
  getCompetitionCategoryBoard,
  getNextFreeTrunkNumber,
  searchCompetitionParticipants,
  updateParticipantDetails,
} from '../services/participantAdmin.service.js';

const wrap = (fn) => async (req, res, next) => {
  try {
    const result = await fn(req, res);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// Admin — live scoring
export const listLiveCompetitionsHandler = wrap(async () => ({ competitions: await listLiveCompetitions() }));
export const getLiveDashboardHandler = wrap((req) => getLiveDashboard(req.params.id));
export const openHeatHandler = wrap((req) => openHeat(req.params.id, req.body || {}));
export const closeHeatHandler = wrap((req) => closeHeat(req.params.heatId));
export const cancelHeatHandler = wrap((req) => cancelHeat(req.params.heatId));
export const unlockJudgeSubmissionHandler = wrap((req) => unlockJudgeSubmission(req.params.heatId, req.params.judgeId));
export const setRound1QualifiersHandler = wrap((req) => setRound1Qualifiers(req.params.id, req.body || {}));
export const setTitleAwardsHandler = wrap((req) => setTitleAwards(req.params.id, req.body || {}));
export const resetLiveScoringHandler = wrap((req) => resetLiveScoring(req.params.id));
export const regenerateJudgeLinkHandler = wrap((req) => regenerateJudgeLink(req.params.id, req.params.judgeId));

// Admin — participants
export const searchParticipantsHandler = wrap((req) =>
  searchCompetitionParticipants(req.params.id, typeof req.query.q === 'string' ? req.query.q : '')
);
export const categoryBoardHandler = wrap((req) => getCompetitionCategoryBoard(req.params.id));
export const nextTrunkNumberHandler = wrap((req) => getNextFreeTrunkNumber(req.params.id));
export const updateParticipantHandler = wrap(async (req) => ({
  registration: await updateParticipantDetails(req.params.registrationId, req.body || {}),
}));

// Judge portal (public, token protected)
export const judgeScoringStateHandler = wrap((req) => getJudgeScoringState(req.params.token));
export const judgeSubmitHandler = wrap((req) => submitJudgeScores(req.params.token, req.body || {}));
