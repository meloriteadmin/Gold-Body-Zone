import {
  assignJudgeToCompetition,
  createJudge,
  deleteJudge,
  getJudgeById,
  listJudges,
  removeJudgeFromCompetition,
  updateJudge,
} from '../services/judge.service.js';
import {
  getActiveJudgingSession,
  getCompetitionJudgingWorkspace,
  getSessionJudgeResults,
  getSessionJudgingProgress,
  listEligibleJudgingCompetitions,
  revokeJudgingSession,
  startJudgingSession,
} from '../services/judgingSession.service.js';

export async function listJudgesHandler(req, res, next) {
  try {
    const activeOnly = req.query.active === 'true';
    const competitionId = req.query.competitionId || null;
    const judges = await listJudges({ activeOnly, competitionId });
    res.status(200).json({ judges });
  } catch (err) {
    next(err);
  }
}

export async function getJudgeHandler(req, res, next) {
  try {
    const judge = await getJudgeById(req.params.id);
    res.status(200).json({ judge });
  } catch (err) {
    next(err);
  }
}

export async function createJudgeHandler(req, res, next) {
  try {
    const judge = await createJudge(req.body);
    res.status(201).json({
      message: 'Judge created successfully.',
      judge,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateJudgeHandler(req, res, next) {
  try {
    const judge = await updateJudge(req.params.id, req.body);
    res.status(200).json({
      message: 'Judge updated successfully.',
      judge,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteJudgeHandler(req, res, next) {
  try {
    const result = await deleteJudge(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listEligibleCompetitionsHandler(_req, res, next) {
  try {
    const competitions = await listEligibleJudgingCompetitions();
    res.status(200).json({ competitions });
  } catch (err) {
    next(err);
  }
}

export async function startJudgingSessionHandler(req, res, next) {
  try {
    const { competitionId, durationHours } = req.body;
    const session = await startJudgingSession(competitionId, { durationHours });
    res.status(201).json({
      message: 'Judging session started successfully.',
      session,
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeJudgingSessionHandler(req, res, next) {
  try {
    const session = await revokeJudgingSession(req.params.id);
    res.status(200).json({
      message: 'Judging session link revoked successfully.',
      session,
    });
  } catch (err) {
    next(err);
  }
}

export async function getActiveSessionHandler(req, res, next) {
  try {
    const session = await getActiveJudgingSession(req.params.competitionId);
    res.status(200).json({ session });
  } catch (err) {
    next(err);
  }
}

export async function getSessionProgressHandler(req, res, next) {
  try {
    const data = await getSessionJudgingProgress(req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSessionResultsHandler(req, res, next) {
  try {
    const data = await getSessionJudgeResults(req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getCompetitionJudgingWorkspaceHandler(req, res, next) {
  try {
    const data = await getCompetitionJudgingWorkspace(req.params.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function assignJudgeToCompetitionHandler(req, res, next) {
  try {
    const { judgeId } = req.body;
    const result = await assignJudgeToCompetition({
      competitionId: req.params.id,
      judgeId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function removeJudgeFromCompetitionHandler(req, res, next) {
  try {
    const result = await removeJudgeFromCompetition({
      competitionId: req.params.id,
      judgeId: req.params.judgeId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
