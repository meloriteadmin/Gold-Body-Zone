import {
  getCategoryJudgingData,
  getJudgingSessionByToken,
  getSessionProgression,
  identifyJudgeForSession,
  saveJudgeRankings,
  saveJudgeSemifinalistSelections,
  saveJudgeWinnerTitles,
  submitEmptyCategory,
} from '../services/judgingSession.service.js';
import { HttpError } from '../utils/httpError.js';

export async function validateSessionTokenHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.query.judgeId || req.query.jid;
    const key = req.query.key || req.query.accessKey;
    const sessionInfo = await getJudgingSessionByToken(token, { judgeId, key });
    res.status(200).json(sessionInfo);
  } catch (err) {
    next(err);
  }
}

export async function identifyJudgeHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.body.judgeId;
    const key = req.body.key || req.query.key || req.query.accessKey;
    if (!judgeId) {
      throw new HttpError(400, 'Judge ID is required for identification.');
    }
    const result = await identifyJudgeForSession(token, judgeId, key);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCategoryJudgingDataHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.query.judgeId;
    const { categoryId, groupId } = req.query;

    if (!judgeId) {
      throw new HttpError(401, 'Judge must be identified before accessing judging data.');
    }
    if (!categoryId) {
      throw new HttpError(400, 'Category ID is required.');
    }

    const data = await getCategoryJudgingData({
      token,
      judgeId,
      categoryId,
      groupId: groupId || null,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function saveSemifinalistsHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.body.judgeId;
    const { categoryId, groupId, selectedRegistrationIds } = req.body;

    if (!judgeId) {
      throw new HttpError(401, 'Judge identity is required.');
    }
    if (!categoryId) {
      throw new HttpError(400, 'Category ID is required.');
    }

    const result = await saveJudgeSemifinalistSelections({
      token,
      judgeId,
      categoryId,
      groupId: groupId || null,
      selectedRegistrationIds: selectedRegistrationIds || [],
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function saveRankingsHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.body.judgeId;
    const { categoryId, groupId, rankings } = req.body;

    if (!judgeId) {
      throw new HttpError(401, 'Judge identity is required.');
    }
    if (!categoryId) {
      throw new HttpError(400, 'Category ID is required.');
    }

    const result = await saveJudgeRankings({
      token,
      judgeId,
      categoryId,
      groupId: groupId || null,
      rankings: rankings || [],
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSessionProgressionHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.query.judgeId;

    const progression = await getSessionProgression({
      token,
      judgeId: judgeId || null,
    });

    res.status(200).json(progression);
  } catch (err) {
    next(err);
  }
}

export async function completeEmptyCategoryHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.body.judgeId;
    const { categoryId } = req.body;

    if (!judgeId) {
      throw new HttpError(401, 'Judge identity is required.');
    }
    if (!categoryId) {
      throw new HttpError(400, 'Category ID is required.');
    }

    const progression = await submitEmptyCategory({
      token,
      judgeId,
      categoryId,
    });

    res.status(200).json(progression);
  } catch (err) {
    next(err);
  }
}

export async function saveWinnerTitlesHandler(req, res, next) {
  try {
    const { token } = req.params;
    const judgeId = req.headers['x-judge-id'] || req.body.judgeId;
    const { categoryId, groupId, winnerTitles } = req.body;

    if (!judgeId) {
      throw new HttpError(401, 'Judge identity is required.');
    }
    if (!categoryId) {
      throw new HttpError(400, 'Category ID is required.');
    }

    const result = await saveJudgeWinnerTitles({
      token,
      judgeId,
      categoryId,
      groupId: groupId || null,
      winnerTitles: winnerTitles || {},
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
