import crypto from 'node:crypto';
import { getPrismaClient } from '../config/prisma.js';
import {
  computeCompetitionStatus,
  computeRegistrationStatus,
} from '../utils/competitionValidation.js';
import { HttpError } from '../utils/httpError.js';
import {
  serializeCompetition,
  serializeJudge,
  serializeJudgeRanking,
  serializeJudgeSelection,
  serializeJudgingSession,
} from '../utils/serializers.js';

/**
 * In-memory registry for categories that have 0 eligible contestants.
 * Key: `${sessionId}:${categoryId}`, Value: Set<judgeId>
 */
const completedEmptyCategories = new Map();

/**
 * Sorts judging categories in standard sequence:
 * 1. 40–45 kg is strictly first for every judge.
 * 2. Ascending order by weight range / numeric value.
 * 3. Fallback to sortOrder, then name.
 */
export function sortJudgingCategories(categories = []) {
  return [...categories].sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();

    // 1. Strict priority for 40-45 kg
    const is40A =
      /\b40\s*[-–]\s*45\b/.test(nameA) ||
      nameA.includes('40-45') ||
      nameA.includes('40–45');
    const is40B =
      /\b40\s*[-–]\s*45\b/.test(nameB) ||
      nameB.includes('40-45') ||
      nameB.includes('40–45');

    if (is40A && !is40B) return -1;
    if (!is40A && is40B) return 1;

    // 2. Numeric weight comparison if present
    const matchA = nameA.match(/\d+/);
    const matchB = nameB.match(/\d+/);
    if (matchA && matchB) {
      const numA = parseInt(matchA[0], 10);
      const numB = parseInt(matchB[0], 10);
      if (numA !== numB) return numA - numB;
    } else if (matchA && !matchB) {
      return -1;
    } else if (!matchA && matchB) {
      return 1;
    }

    // 3. Fallback to sortOrder, then name
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999;
    if (orderA !== orderB) return orderA - orderB;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Lists published competitions where registration is closed and which are not completed or cancelled.
 */
export async function listEligibleJudgingCompetitions() {
  const prisma = getPrismaClient();

  const competitions = await prisma.competition.findMany({
    where: {
      isPublished: true,
      isCompleted: false,
    },
    include: {
      categories: {
        include: {
          groups: true,
        },
      },
      registrations: {
        where: {
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: { not: null },
        },
        select: {
          id: true,
          trunkNumber: true,
        },
      },
      judgingSessions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
  });

  // Filter only competitions whose registration is actually CLOSED
  const eligible = competitions.filter((comp) => {
    const compStatus = computeCompetitionStatus(comp);
    if (compStatus === 'COMPLETED' || comp.isCompleted) return false;

    const regStatus = computeRegistrationStatus(comp);
    return regStatus === 'CLOSED';
  });

  const activeJudgesCount = prisma.judge.count
    ? await prisma.judge.count({ where: { isActive: true } })
    : (await prisma.judge.findMany({ where: { isActive: true } })).length;

  // Gather active session IDs
  const activeSessionIds = eligible
    .map((c) => c.judgingSessions?.[0]?.id)
    .filter(Boolean);

  const submissionsList =
    activeSessionIds.length > 0
      ? await prisma.judgeCategorySubmission.findMany({
          where: { sessionId: { in: activeSessionIds } },
        })
      : [];

  return eligible.map((comp) => {
    const rawSession = comp.judgingSessions?.[0] || null;
    let activeSession = rawSession ? serializeJudgingSession(rawSession) : null;
    let judgingStatus = 'Judging Not Started';

    if (activeSession) {
      const sessSubs = submissionsList.filter((s) => s.sessionId === rawSession.id);

      // Distinct final submissions per judge and category (Winner Selection completed)
      const completedKeys = new Set([
        ...sessSubs.map((s) => `${s.judgeId}:${s.categoryId}`),
      ]);

      const totalCats = comp.categories?.length || 0;
      const totalPossible = activeJudgesCount * totalCats;
      const submittedCount = completedKeys.size;
      const percentage =
        totalPossible > 0 ? Math.round((submittedCount / totalPossible) * 100) : 0;
      const isFullyCompleted = totalPossible > 0 && submittedCount >= totalPossible;

      // Mark session as COMPLETED once ALL judges have submitted ALL required category evaluations
      if (isFullyCompleted) {
        activeSession.status = 'COMPLETED';
        if (rawSession.status === 'ACTIVE' && prisma.judgingSession?.update) {
          prisma.judgingSession
            .update({
              where: { id: rawSession.id },
              data: { status: 'COMPLETED' },
            })
            .catch(() => {});
        }
      }

      activeSession.progress = {
        totalJudges: activeJudgesCount,
        totalCategories: totalCats,
        totalPossibleSubmissions: totalPossible,
        submittedSubmissions: submittedCount,
        completionPercentage: isFullyCompleted ? 100 : percentage,
        isFullyCompleted,
      };

      if (rawSession.status !== 'REVOKED') {
        if (isFullyCompleted || rawSession.status === 'COMPLETED') {
          judgingStatus = 'Evaluation Done';
        } else if (rawSession.status === 'ACTIVE' && new Date(rawSession.expiresAt) > new Date()) {
          judgingStatus = 'Judging In Progress';
        }
      }
    }

    return {
      ...serializeCompetition(comp),
      eligibleParticipantCount: comp.registrations.length,
      activeJudgingSession: activeSession,
      judgingStatus,
    };
  });
}

/**
 * Starts a judging session for an eligible competition and generates a secure temporary link token.
 */
export async function startJudgingSession(competitionId, { durationHours = 24 } = {}) {
  const prisma = getPrismaClient();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      categories: true,
      registrations: {
        where: {
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: { not: null },
        },
        select: { id: true },
      },
    },
  });

  if (!competition) {
    throw new HttpError(404, 'Competition not found.');
  }

  if (competition.isCompleted || computeCompetitionStatus(competition) === 'COMPLETED') {
    throw new HttpError(400, 'Cannot start judging for a completed competition.');
  }

  const regStatus = computeRegistrationStatus(competition);
  if (regStatus !== 'CLOSED') {
    throw new HttpError(
      400,
      'Judging can only be started after competition registration has closed.'
    );
  }

  if (!competition.isPublished) {
    throw new HttpError(400, 'Competition must be published to start a judging session.');
  }

  // Generate secure cryptographic token
  const token = crypto.randomBytes(24).toString('hex');
  const parsedHours = Math.max(1, Math.min(168, Number(durationHours) || 24)); // 1 hour to 7 days
  const expiresAt = new Date(Date.now() + parsedHours * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Revoke any previous active session for this competition to keep one active link
    await tx.judgingSession.updateMany({
      where: {
        competitionId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    // Create the new session
    const session = await tx.judgingSession.create({
      data: {
        competitionId,
        token,
        status: 'ACTIVE',
        expiresAt,
      },
      include: {
        competition: {
          include: {
            categories: {
              include: { groups: true },
            },
          },
        },
      },
    });

    return serializeJudgingSession(session);
  });
}

/**
 * Revokes an active judging session.
 */
export async function revokeJudgingSession(sessionId) {
  const prisma = getPrismaClient();

  const session = await prisma.judgingSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new HttpError(404, 'Judging session not found.');
  }

  const updated = await prisma.judgingSession.update({
    where: { id: sessionId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
    include: {
      competition: true,
    },
  });

  return serializeJudgingSession(updated);
}

/**
 * Gets the active judging session for a competition.
 */
export async function getActiveJudgingSession(competitionId) {
  const prisma = getPrismaClient();

  const session = await prisma.judgingSession.findFirst({
    where: {
      competitionId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      competition: true,
    },
  });

  return session ? serializeJudgingSession(session) : null;
}

/**
 * Generates a secure HMAC access token for a specific judge and session token.
 */
export function generateJudgeAccessToken(sessionToken, judgeId) {
  if (!sessionToken || !judgeId) return '';
  return crypto
    .createHmac('sha256', sessionToken)
    .update(judgeId)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Validates a session token and returns competition metadata & active judges for identification.
 * Does NOT expose unverified participant data to unauthorized users.
 * When judgeId is provided, automatically identifies and authorizes the specific judge.
 */
export async function getJudgingSessionByToken(token, { judgeId, key } = {}) {
  if (!token || typeof token !== 'string') {
    throw new HttpError(400, 'Session token is required.');
  }

  const prisma = getPrismaClient();

  const session = await prisma.judgingSession.findUnique({
    where: { token },
    include: {
      competition: {
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: {
              groups: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'Invalid judging session link. Please verify the URL.');
  }

  if (session.status === 'REVOKED') {
    throw new HttpError(
      403,
      'This judging session link has been revoked by the administrator.'
    );
  }

  if (new Date(session.expiresAt) <= new Date() || session.status === 'EXPIRED') {
    if (session.status === 'ACTIVE') {
      await prisma.judgingSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
    }
    throw new HttpError(
      410,
      'This temporary judging link has expired. Please request a new link from the administrator.'
    );
  }

  // Fetch active judges assigned to this competition (or all active if none assigned)
  let judges = await prisma.judge.findMany({
    where: {
      isActive: true,
      OR: [
        { competitionId: session.competitionId },
        { assignments: { some: { competitionId: session.competitionId } } },
      ],
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      designation: true,
      city: true,
    },
  });

  if (judges.length === 0) {
    judges = await prisma.judge.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        designation: true,
        city: true,
      },
    });
  }

  let identifiedJudge = null;
  if (judgeId) {
    let matchedJudge = judges.find((j) => j.id === judgeId);
    if (!matchedJudge) {
      const dbJudge = await prisma.judge.findUnique({
        where: { id: judgeId },
        select: { id: true, name: true, designation: true, city: true, isActive: true },
      });
      if (!dbJudge || !dbJudge.isActive) {
        throw new HttpError(404, 'Judge profile not found or is currently inactive.');
      }
      matchedJudge = dbJudge;
    }

    if (key) {
      const expectedKey = generateJudgeAccessToken(session.token, judgeId);
      if (key !== expectedKey) {
        throw new HttpError(403, 'Invalid or unauthorized judge access key.');
      }
    }

    identifiedJudge = {
      ...matchedJudge,
      accessKey: generateJudgeAccessToken(session.token, matchedJudge.id),
    };
  }

  return {
    session: serializeJudgingSession(session),
    competition: {
      id: session.competition.id,
      name: session.competition.name,
      competitionType: session.competition.competitionType,
      venue: session.competition.venue,
      eventDate: session.competition.eventDate
        ? session.competition.eventDate.toISOString()
        : null,
      categories: sortJudgingCategories(session.competition.categories || []).map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender,
        categoryType: c.categoryType,
        groups: (c.groups || []).map((g) => ({
          id: g.id,
          name: g.name,
        })),
      })),
    },
    judges: identifiedJudge
      ? [identifiedJudge]
      : judges.map((j) => ({
          ...j,
          accessKey: generateJudgeAccessToken(session.token, j.id),
        })),
    identifiedJudge: identifiedJudge || null,
  };
}

/**
 * Identifies a judge for a session and returns their existing progress.
 */
export async function identifyJudgeForSession(token, judgeId, key = null) {
  const sessionInfo = await getJudgingSessionByToken(token, { judgeId, key });
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });

  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge profile not found or is currently inactive.');
  }

  // Fetch judge's existing selections & rankings across all categories in this session
  const [selections, rankings] = await Promise.all([
    prisma.judgeSemifinalistSelection.findMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
      },
    }),
    prisma.judgeRanking.findMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
      },
      orderBy: { rank: 'asc' },
    }),
  ]);

  return {
    judge: {
      ...serializeJudge(judge),
      accessKey: generateJudgeAccessToken(sessionInfo.session.token, judge.id),
    },
    session: sessionInfo.session,
    competition: sessionInfo.competition,
    existingSelections: selections.map(serializeJudgeSelection),
    existingRankings: rankings.map(serializeJudgeRanking),
  };
}

/**
 * Gets judging data for a specific Category and Group for an identified judge.
 */
export async function getCategoryJudgingData({ token, judgeId, categoryId, groupId }) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });

  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge not found or inactive.');
  }

  const category = sessionInfo.competition.categories.find((c) => c.id === categoryId);
  if (!category) {
    throw new HttpError(404, 'Category not found in this competition.');
  }

  const group = category.groups?.find((g) => g.id === groupId) || null;
  const groupKey = groupId || 'DEFAULT';

  // Build registration where clause:
  // Must be CONFIRMED, PAID, and have an assigned trunk number.
  const regWhere = {
    competitionId: sessionInfo.session.competitionId,
    categoryId,
    registrationStatus: 'CONFIRMED',
    paymentStatus: 'PAID',
    trunkNumber: { not: null },
  };

  if (groupId) {
    regWhere.groupId = groupId;
  }

  // Fetch eligible candidates sorted strictly by trunk number
  const eligibleRegistrations = await prisma.registration.findMany({
    where: regWhere,
    orderBy: {
      trunkNumber: 'asc',
    },
    select: {
      id: true,
      trunkNumber: true,
      participantName: true,
      gymName: true,
      representingType: true,
      district: true,
      gender: true,
      age: true,
      weightKg: true,
      heightCm: true,
    },
  });

  // Fetch this judge's selections for this category/group
  const selections = await prisma.judgeSemifinalistSelection.findMany({
    where: {
      sessionId: sessionInfo.session.id,
      judgeId,
      categoryId,
      groupKey,
    },
    select: {
      registrationId: true,
    },
  });

  const selectedRegistrationIds = selections.map((s) => s.registrationId);

  // Fetch this judge's rankings for this category/group
  const rankings = await prisma.judgeRanking.findMany({
    where: {
      sessionId: sessionInfo.session.id,
      judgeId,
      categoryId,
      groupKey,
    },
    orderBy: { rank: 'asc' },
    select: {
      registrationId: true,
      rank: true,
      title: true,
    },
  });

  // Check if this judge has submitted category evaluation
  const categorySubmission = await prisma.judgeCategorySubmission.findUnique({
    where: {
      sessionId_judgeId_categoryId_groupKey: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
    },
  });

  return {
    competition: {
      id: sessionInfo.competition.id,
      name: sessionInfo.competition.name,
      venue: sessionInfo.competition.venue,
      eventDate: sessionInfo.competition.eventDate,
    },
    category: {
      id: category.id,
      name: category.name,
      gender: category.gender,
      categoryType: category.categoryType,
    },
    group: group ? { id: group.id, name: group.name } : null,
    judge: serializeJudge(judge),
    participants: eligibleRegistrations.map((r) => ({
      id: r.id,
      trunkNumber: r.trunkNumber,
      participantName: r.participantName,
      representingType: r.representingType,
      gymName:
        r.representingType === 'INDIVIDUAL' ||
        (r.gymName && r.gymName.toLowerCase().includes('individual'))
          ? 'Individual'
          : r.gymName || 'Individual',
      district: r.district,
    })),
    selectedRegistrationIds,
    rankings,
    isFinalSubmitted: Boolean(categorySubmission),
    submittedAt: categorySubmission?.submittedAt
      ? categorySubmission.submittedAt.toISOString()
      : null,
  };
}

/**
 * Saves a judge's semifinalist selections for a category and group.
 */
export async function saveJudgeSemifinalistSelections({
  token,
  judgeId,
  categoryId,
  groupId,
  selectedRegistrationIds = [],
}) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });

  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge not found or inactive.');
  }

  if (!Array.isArray(selectedRegistrationIds)) {
    throw new HttpError(400, 'Selected participants must be provided as an array.');
  }

  const groupKey = groupId || 'DEFAULT';

  // Verify all selected registration IDs belong to this competition, category, and group,
  // and are CONFIRMED, PAID with trunk numbers
  if (selectedRegistrationIds.length > 0) {
    const validRegistrations = await prisma.registration.findMany({
      where: {
        id: { in: selectedRegistrationIds },
        competitionId: sessionInfo.session.competitionId,
        categoryId,
        ...(groupId ? { groupId } : {}),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: { not: null },
      },
      select: { id: true },
    });

    if (validRegistrations.length !== selectedRegistrationIds.length) {
      throw new HttpError(
        400,
        'One or more selected participants are not eligible or do not belong to this category.'
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Delete previous selections for this judge & category/group
    await tx.judgeSemifinalistSelection.deleteMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
    });

    // 2. Insert new selections
    if (selectedRegistrationIds.length > 0) {
      await tx.judgeSemifinalistSelection.createMany({
        data: selectedRegistrationIds.map((regId) => ({
          sessionId: sessionInfo.session.id,
          judgeId,
          registrationId: regId,
          categoryId,
          groupId: groupId || null,
          groupKey,
        })),
      });
    }

    // 3. Remove any rankings for participants that are no longer selected
    await tx.judgeRanking.deleteMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
        registrationId: {
          notIn: selectedRegistrationIds,
        },
      },
    });

    const updated = await tx.judgeSemifinalistSelection.findMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
      include: {
        registration: {
          select: {
            id: true,
            trunkNumber: true,
            participantName: true,
          },
        },
      },
    });

    return {
      message: `Successfully saved ${updated.length} semifinalist selection(s).`,
      count: updated.length,
      selections: updated.map((s) => ({
        ...serializeJudgeSelection(s),
        registration: s.registration,
      })),
    };
  });
}

/**
 * Saves a judge's rankings for their selected semifinalists.
 * Validations:
 * - If N semifinalists selected, exactly N rankings must be provided.
 * - Ranks must be contiguous whole numbers 1..N.
 * - Prevent duplicate ranks.
 * - Require every selected participant to receive one unique rank.
 */
export async function saveJudgeRankings({
  token,
  judgeId,
  categoryId,
  groupId,
  rankings = [],
}) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });

  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge not found or inactive.');
  }

  if (!Array.isArray(rankings) || rankings.length === 0) {
    throw new HttpError(400, 'Rankings array is required and cannot be empty.');
  }

  const groupKey = groupId || 'DEFAULT';

  // Fetch the judge's saved semifinalist selections for this category/group
  const savedSelections = await prisma.judgeSemifinalistSelection.findMany({
    where: {
      sessionId: sessionInfo.session.id,
      judgeId,
      categoryId,
      groupKey,
    },
    include: {
      registration: {
        select: {
          id: true,
          trunkNumber: true,
          participantName: true,
        },
      },
    },
  });

  const selectedIds = new Set(savedSelections.map((s) => s.registrationId));
  const expectedCount = savedSelections.length;

  if (expectedCount === 0) {
    throw new HttpError(
      400,
      'No semifinalists selected yet for this group. Please select semifinalists first.'
    );
  }

  if (rankings.length !== expectedCount) {
    throw new HttpError(
      400,
      `All ${expectedCount} selected semifinalists must be ranked. Received ${rankings.length} rank(s).`
    );
  }

  // Validate each item in rankings
  const rankedRegistrationIds = new Set();
  const assignedRanks = new Set();

  for (const item of rankings) {
    const { registrationId, rank } = item;
    if (!registrationId) {
      throw new HttpError(400, 'Each ranking item must contain a registrationId.');
    }
    if (!selectedIds.has(registrationId)) {
      throw new HttpError(
        400,
        `Participant (${registrationId}) is not among the semifinalists selected by this judge.`
      );
    }
    if (rankedRegistrationIds.has(registrationId)) {
      throw new HttpError(400, 'Duplicate ranking entry detected for the same participant.');
    }
    rankedRegistrationIds.add(registrationId);

    const numRank = Number(rank);
    if (!Number.isInteger(numRank) || numRank < 1 || numRank > expectedCount) {
      throw new HttpError(
        400,
        `Each rank must be a whole number between 1 and ${expectedCount}.`
      );
    }
    if (assignedRanks.has(numRank)) {
      throw new HttpError(
        400,
        `Duplicate rank ${numRank} detected. Each participant must receive a unique rank.`
      );
    }
    assignedRanks.add(numRank);
  }

  // Check that all ranks from 1 to expectedCount are covered
  for (let r = 1; r <= expectedCount; r++) {
    if (!assignedRanks.has(r)) {
      throw new HttpError(
        400,
        `Missing rank ${r}. Every rank from 1 to ${expectedCount} must be assigned.`
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Delete previous rankings for this judge & category/group
    await tx.judgeRanking.deleteMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
    });

    // 2. Insert new validated rankings
    await tx.judgeRanking.createMany({
      data: rankings.map((item) => ({
        sessionId: sessionInfo.session.id,
        judgeId,
        registrationId: item.registrationId,
        categoryId,
        groupId: groupId || null,
        groupKey,
        rank: Number(item.rank),
      })),
    });

    const updated = await tx.judgeRanking.findMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
      orderBy: { rank: 'asc' },
      include: {
        registration: {
          select: {
            id: true,
            trunkNumber: true,
            participantName: true,
          },
        },
      },
    });

    return {
      message: `Successfully saved rankings for ${updated.length} participant(s).`,
      count: updated.length,
      rankings: updated.map((r) => ({
        ...serializeJudgeRanking(r),
        registration: r.registration,
      })),
    };
  });
}

/**
 * Gets judging session summary for admin dashboard (which judges are active, completed selections, completed rankings).
 */
export async function getSessionJudgingProgress(sessionId) {
  const prisma = getPrismaClient();

  const session = await prisma.judgingSession.findUnique({
    where: { id: sessionId },
    include: {
      competition: {
        include: {
          categories: {
            include: { groups: true },
          },
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'Session not found.');
  }

  const [judges, selections, rankings] = await Promise.all([
    prisma.judge.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.judgeSemifinalistSelection.findMany({ where: { sessionId } }),
    prisma.judgeRanking.findMany({ where: { sessionId } }),
  ]);

  const progressByJudge = judges.map((judge) => {
    const judgeSelections = selections.filter((s) => s.judgeId === judge.id);
    const judgeRankings = rankings.filter((r) => r.judgeId === judge.id);

    return {
      judge: serializeJudge(judge),
      totalSelections: judgeSelections.length,
      totalRankings: judgeRankings.length,
      hasSubmittedSelections: judgeSelections.length > 0,
      hasSubmittedRankings: judgeRankings.length > 0,
    };
  });

  return {
    session: serializeJudgingSession(session),
    progress: progressByJudge,
  };
}

/**
 * Checks if all judges have submitted all required category evaluations.
 * If yes, marks the judging session as COMPLETED.
 */
export async function checkAndMarkSessionCompleted(sessionId) {
  const prisma = getPrismaClient();
  const session = await prisma.judgingSession.findUnique({
    where: { id: sessionId },
    include: {
      competition: {
        include: {
          categories: true,
        },
      },
    },
  });

  if (!session || session.status === 'COMPLETED' || session.status === 'REVOKED') {
    return session;
  }

  // Target judges: judges assigned to this competition, or active judges as fallback
  const assignedJudges = await prisma.judge.findMany({
    where: {
      isActive: true,
      OR: [
        { competitionId: session.competitionId },
        { assignments: { some: { competitionId: session.competitionId } } },
      ],
    },
    select: { id: true },
  });

  const activeJudgesCount = prisma.judge.count
    ? await prisma.judge.count({ where: { isActive: true } })
    : (await prisma.judge.findMany({ where: { isActive: true } })).length;

  const targetJudgesCount = assignedJudges.length > 0 ? assignedJudges.length : activeJudgesCount;
  const totalCategories = session.competition?.categories?.length || 0;
  const totalPossible = targetJudgesCount * totalCategories;

  if (totalPossible <= 0) return session;

  const submissions = prisma.judgeCategorySubmission?.findMany
    ? await prisma.judgeCategorySubmission.findMany({ where: { sessionId } })
    : [];

  const completedKeys = new Set([
    ...submissions.map((s) => `${s.judgeId}:${s.categoryId}`),
  ]);

  // Include any completed empty categories for this session
  for (const [key, judgeSet] of completedEmptyCategories.entries()) {
    if (key.startsWith(`${sessionId}:`)) {
      const catId = key.split(':')[1];
      for (const jId of judgeSet) {
        completedKeys.add(`${jId}:${catId}`);
      }
    }
  }

  if (completedKeys.size >= totalPossible) {
    const updated = await prisma.judgingSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED' },
    });
    return updated;
  }

  return session;
}

export const VALID_WINNER_TITLES = [
  'Best Poser',
  'Most Improved Body Builder',
];

/**
 * Saves a judge's winner titles for final-ranked contestants and marks the category evaluation as final submitted.
 * Requirements:
 * - Titles only awarded to contestants ranked in this category by this judge.
 * - Allowed titles: 'Best Poser', 'Most Improved Body Builder'.
 * - Each title assigned to at most 1 contestant.
 * - Records final submission in JudgeCategorySubmission.
 */
export async function saveJudgeWinnerTitles({
  token,
  judgeId,
  categoryId,
  groupId,
  winnerTitles = {},
}) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });
  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge not found or inactive.');
  }

  const groupKey = groupId || 'DEFAULT';

  // Fetch current rankings for this judge in this category/group
  const existingRankings = await prisma.judgeRanking.findMany({
    where: {
      sessionId: sessionInfo.session.id,
      judgeId,
      categoryId,
      groupKey,
    },
  });

  if (existingRankings.length === 0) {
    throw new HttpError(
      400,
      'No rankings found for this category. Please complete semifinalists and rankings first.'
    );
  }

  const rankedRegIds = new Set(existingRankings.map((r) => r.registrationId));

  // winnerTitles can be an array of { registrationId, title } or an object/map { [registrationId]: title }
  const titleByRegId = new Map();
  const assignedTitles = new Set();

  if (Array.isArray(winnerTitles)) {
    for (const item of winnerTitles) {
      if (item?.registrationId && item?.title) {
        titleByRegId.set(item.registrationId, item.title.trim());
      }
    }
  } else if (typeof winnerTitles === 'object' && winnerTitles !== null) {
    for (const [regId, title] of Object.entries(winnerTitles)) {
      if (title && typeof title === 'string' && title.trim()) {
        titleByRegId.set(regId, title.trim());
      }
    }
  }

  for (const [regId, title] of titleByRegId.entries()) {
    if (!rankedRegIds.has(regId)) {
      throw new HttpError(
        400,
        `Contestant ${regId} must be in the final rankings to receive a title.`
      );
    }
    if (!VALID_WINNER_TITLES.includes(title)) {
      throw new HttpError(
        400,
        `Invalid title "${title}". Must be one of: ${VALID_WINNER_TITLES.join(', ')}.`
      );
    }
    if (assignedTitles.has(title)) {
      throw new HttpError(
        400,
        `Duplicate award for "${title}". Each award can only be assigned to one contestant.`
      );
    }
    assignedTitles.add(title);
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update titles on all rankings for this judge and category
    for (const ranking of existingRankings) {
      const title = titleByRegId.get(ranking.registrationId) || null;
      await tx.judgeRanking.update({
        where: { id: ranking.id },
        data: { title },
      });
    }

    // 2. Upsert JudgeCategorySubmission record to mark category evaluation completed by this judge
    const submissionId = crypto.randomUUID();
    if (tx.judgeCategorySubmission?.upsert) {
      await tx.judgeCategorySubmission.upsert({
        where: {
          sessionId_judgeId_categoryId_groupKey: {
            sessionId: sessionInfo.session.id,
            judgeId,
            categoryId,
            groupKey,
          },
        },
        create: {
          id: submissionId,
          sessionId: sessionInfo.session.id,
          judgeId,
          categoryId,
          groupKey,
        },
        update: {
          submittedAt: new Date(),
        },
      });
    }

    // 3. Fetch refreshed rankings with registration details
    const updatedRankings = await tx.judgeRanking.findMany({
      where: {
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
      orderBy: { rank: 'asc' },
      include: {
        registration: {
          select: {
            id: true,
            trunkNumber: true,
            participantName: true,
            representingType: true,
            gymName: true,
            district: true,
          },
        },
      },
    });

    return {
      message: 'Category evaluation and winner titles saved successfully!',
      categoryEvaluationSubmitted: true,
      rankings: updatedRankings.map((r) => ({
        ...serializeJudgeRanking(r),
        registration: {
          ...r.registration,
          gymName:
            r.registration?.representingType === 'INDIVIDUAL' ||
            (r.registration?.gymName && r.registration?.gymName.toLowerCase().includes('individual'))
              ? 'Individual'
              : r.registration?.gymName || 'Individual',
        },
      })),
    };
  });

  await checkAndMarkSessionCompleted(sessionInfo.session.id).catch(() => {});
  return result;
}

/**
 * Computes category progression for an identified judge.
 * Each judge progresses INDEPENDENTLY.
 * - Sequence begins with 40–45 kg for every judge.
 * - Categories already submitted by THIS judge are marked COMPLETED.
 * - The first uncompleted category is IN_PROGRESS.
 * - Categories after that are LOCKED.
 * - Never waits for other judges to submit before allowing the next category.
 */
export async function getSessionProgression({ token, judgeId }) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const activeJudges = await prisma.judge.findMany({
    where: { isActive: true },
    select: { id: true, name: true, designation: true },
    orderBy: { name: 'asc' },
  });
  const totalJudgeCount = activeJudges.length;

  const [allSubmissions, allRankings] = await Promise.all([
    prisma.judgeCategorySubmission?.findMany
      ? prisma.judgeCategorySubmission.findMany({
          where: { sessionId: sessionInfo.session.id },
        })
      : [],
    prisma.judgeRanking.findMany({
      where: { sessionId: sessionInfo.session.id },
      select: { judgeId: true, categoryId: true },
    }),
  ]);

  const orderedCategories = sessionInfo.competition.categories;

  // Query eligible participant counts for all categories in this competition
  const categoryRegistrations = await prisma.registration.findMany({
    where: {
      competitionId: sessionInfo.session.competitionId,
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      trunkNumber: { not: null },
    },
    select: { categoryId: true },
  });

  const participantCountByCat = new Map();
  categoryRegistrations.forEach((r) => {
    participantCountByCat.set(
      r.categoryId,
      (participantCountByCat.get(r.categoryId) || 0) + 1
    );
  });

  // Calculate status for each category independently for THIS judge
  let activeCategoryFound = false;
  let currentActiveCategoryId = null;

  const categoriesProgression = orderedCategories.map((cat, index) => {
    const participantCount = participantCountByCat.get(cat.id) || 0;

    // A category is considered submitted by THIS judge ONLY if:
    // 1) An entry exists in judgeCategorySubmission for this judge & category (Final Submit on Winner Selection)
    // OR 2) Empty category was confirmed by this judge
    const isSubmittedByThisJudge = Boolean(
      judgeId &&
        (allSubmissions.some(
          (s) => s.judgeId === judgeId && s.categoryId === cat.id
        ) ||
          completedEmptyCategories
            .get(`${sessionInfo.session.id}:${cat.id}`)
            ?.has(judgeId))
    );

    // Also count how many judges overall have submitted this category (for admin tracking)
    const submittedJudgeIds = new Set([
      ...allSubmissions.filter((s) => s.categoryId === cat.id).map((s) => s.judgeId),
      ...(completedEmptyCategories.get(`${sessionInfo.session.id}:${cat.id}`) || []),
    ]);
    const submittedJudgeCount = submittedJudgeIds.size;
    const isCompletedByAll =
      totalJudgeCount === 0 || submittedJudgeCount >= totalJudgeCount;

    // INDEPENDENT PROGRESSION:
    // If this judge has submitted this category: status is 'COMPLETED'.
    // If not submitted, the first unsubmitted category is 'IN_PROGRESS'.
    // Any unsubmitted categories after that are 'LOCKED'.
    let status;
    if (isSubmittedByThisJudge) {
      status = 'COMPLETED';
    } else if (!activeCategoryFound) {
      status = 'IN_PROGRESS';
      activeCategoryFound = true;
      currentActiveCategoryId = cat.id;
    } else {
      status = 'LOCKED';
    }

    return {
      id: cat.id,
      name: cat.name,
      gender: cat.gender,
      categoryType: cat.categoryType,
      groups: cat.groups || [],
      sortSequence: index + 1,
      participantCount,
      status,
      submittedJudgeCount,
      totalJudgeCount,
      isCompletedByAll,
      isSubmittedByCurrentJudge: isSubmittedByThisJudge,
    };
  });

  const allCategoriesCompleted = !activeCategoryFound;
  if (allCategoriesCompleted && categoriesProgression.length > 0) {
    currentActiveCategoryId =
      categoriesProgression[categoriesProgression.length - 1].id;
  }

  const activeCategory =
    categoriesProgression.find((c) => c.id === currentActiveCategoryId) ||
    categoriesProgression[0] ||
    null;

  return {
    session: sessionInfo.session,
    competition: sessionInfo.competition,
    totalJudges: totalJudgeCount,
    activeJudges,
    currentActiveCategoryId,
    activeCategory,
    allCategoriesCompleted,
    waitingForOtherJudges: false, // INDEPENDENT PROGRESSION: NEVER WAIT!
    categories: categoriesProgression,
  };
}

/**
 * Submits an empty category (0 eligible contestants) for a judge.
 */
export async function submitEmptyCategory({ token, judgeId, categoryId, groupId }) {
  const sessionInfo = await getJudgingSessionByToken(token);
  const prisma = getPrismaClient();

  const judge = await prisma.judge.findUnique({
    where: { id: judgeId },
  });
  if (!judge || !judge.isActive) {
    throw new HttpError(404, 'Judge profile not found or inactive.');
  }

  const regCount = await prisma.registration.count({
    where: {
      competitionId: sessionInfo.session.competitionId,
      categoryId,
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      trunkNumber: { not: null },
    },
  });

  if (regCount > 0) {
    throw new HttpError(
      400,
      'This category has eligible participants. Please select semifinalists and assign ranks.'
    );
  }

  const key = `${sessionInfo.session.id}:${categoryId}`;
  if (!completedEmptyCategories.has(key)) {
    completedEmptyCategories.set(key, new Set());
  }
  completedEmptyCategories.get(key).add(judgeId);

  const groupKey = groupId || 'DEFAULT';
  const submissionId = crypto.randomUUID();
  if (prisma.judgeCategorySubmission?.upsert) {
    await prisma.judgeCategorySubmission.upsert({
      where: {
        sessionId_judgeId_categoryId_groupKey: {
          sessionId: sessionInfo.session.id,
          judgeId,
          categoryId,
          groupKey,
        },
      },
      create: {
        id: submissionId,
        sessionId: sessionInfo.session.id,
        judgeId,
        categoryId,
        groupKey,
      },
      update: {
        submittedAt: new Date(),
      },
    });
  }

  await checkAndMarkSessionCompleted(sessionInfo.session.id).catch(() => {});
  return getSessionProgression({ token, judgeId });
}

/**
 * Returns comprehensive judging evaluation results for an active or completed session.
 * Includes:
 * - Overall progress
 * - Individual judges' evaluations: selections, rankings, and winner title awards.
 */
export async function getSessionJudgeResults(sessionId) {
  const prisma = getPrismaClient();

  const session = await prisma.judgingSession.findUnique({
    where: { id: sessionId },
    include: {
      competition: {
        include: {
          categories: {
            include: { groups: true },
          },
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'Judging session not found.');
  }

  const orderedCategories = sortJudgingCategories(
    session.competition.categories || []
  );

  const [allSubmissions, allSelections, allRankings] = await Promise.all([
    prisma.judgeCategorySubmission?.findMany
      ? prisma.judgeCategorySubmission.findMany({ where: { sessionId } })
      : [],
    prisma.judgeSemifinalistSelection.findMany({
      where: { sessionId },
      include: {
        registration: {
          select: {
            id: true,
            trunkNumber: true,
            participantName: true,
            representingType: true,
            gymName: true,
            district: true,
          },
        },
      },
    }),
    prisma.judgeRanking.findMany({
      where: { sessionId },
      orderBy: { rank: 'asc' },
      include: {
        registration: {
          select: {
            id: true,
            trunkNumber: true,
            participantName: true,
            representingType: true,
            gymName: true,
            district: true,
          },
        },
      },
    }),
  ]);

  // Include judges assigned to this competition and any judges who submitted in this session
  const judgeIdsInSession = new Set([
    ...allSubmissions.map((s) => s.judgeId),
    ...allRankings.map((r) => r.judgeId),
    ...allSelections.map((s) => s.judgeId),
  ]);

  let judges = await prisma.judge.findMany({
    where: {
      OR: [
        { competitionId: session.competitionId },
        { assignments: { some: { competitionId: session.competitionId } } },
        { id: { in: Array.from(judgeIdsInSession) } },
      ],
    },
    orderBy: { name: 'asc' },
  });

  if (judges.length === 0) {
    judges = await prisma.judge.findMany({
      where: {
        OR: [
          { isActive: true },
          { id: { in: Array.from(judgeIdsInSession) } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  const totalCategories = orderedCategories.length;
  const totalJudges = judges.length;
  const totalPossibleSubmissions = totalCategories * totalJudges;

  // Build per-judge results
  const judgeResults = judges.map((judge) => {
    const judgeSubmissions = allSubmissions.filter((s) => s.judgeId === judge.id);
    const judgeRankings = allRankings.filter((r) => r.judgeId === judge.id);
    const judgeSelections = allSelections.filter((s) => s.judgeId === judge.id);

    const categoriesEvaluated = orderedCategories.map((cat) => {
      const catSub = judgeSubmissions.find((s) => s.categoryId === cat.id);
      const catRankings = judgeRankings
        .filter((r) => r.categoryId === cat.id)
        .sort((a, b) => a.rank - b.rank);
      const catSelections = judgeSelections.filter((s) => s.categoryId === cat.id);

      const isSubmitted = Boolean(
        catSub ||
          completedEmptyCategories
            .get(`${sessionId}:${cat.id}`)
            ?.has(judge.id)
      );
      const winners = catRankings
        .filter((r) => Boolean(r.title))
        .map((r) => ({
          title: r.title,
          rank: r.rank,
          registrationId: r.registrationId,
          trunkNumber: r.registration?.trunkNumber,
          participantName: r.registration?.participantName,
          gymName:
            r.registration?.representingType === 'INDIVIDUAL' ||
            (r.registration?.gymName && r.registration?.gymName.toLowerCase().includes('individual'))
              ? 'Individual'
              : r.registration?.gymName || 'Individual',
          district: r.registration?.district,
        }));

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        gender: cat.gender,
        isSubmitted,
        submittedAt: catSub?.submittedAt || (catRankings[0]?.updatedAt || null),
        semifinalistsCount: catSelections.length,
        rankings: catRankings.map((r) => ({
          rank: r.rank,
          title: r.title || null,
          registrationId: r.registrationId,
          trunkNumber: r.registration?.trunkNumber,
          participantName: r.registration?.participantName,
          gymName:
            r.registration?.representingType === 'INDIVIDUAL' ||
            (r.registration?.gymName && r.registration?.gymName.toLowerCase().includes('individual'))
              ? 'Individual'
              : r.registration?.gymName || 'Individual',
          district: r.registration?.district,
        })),
        winners,
      };
    });

    const submittedCount = categoriesEvaluated.filter((c) => c.isSubmitted).length;

    return {
      judge: serializeJudge(judge),
      totalCategories,
      submittedCategoriesCount: submittedCount,
      isFullyCompleted: totalCategories > 0 && submittedCount >= totalCategories,
      categoryEvaluations: categoriesEvaluated,
    };
  });

  const totalSubmittedSubmissions = judgeResults.reduce(
    (sum, j) => sum + j.submittedCategoriesCount,
    0
  );

  return {
    session: serializeJudgingSession(session),
    competition: {
      id: session.competition.id,
      name: session.competition.name,
      competitionType: session.competition.competitionType,
      venue: session.competition.venue,
      eventDate: session.competition.eventDate,
      categoriesCount: totalCategories,
    },
    overallProgress: {
      totalJudges,
      totalCategories,
      totalPossibleSubmissions,
      totalSubmittedSubmissions,
      completionPercentage:
        totalPossibleSubmissions > 0
          ? Math.round((totalSubmittedSubmissions / totalPossibleSubmissions) * 100)
          : 0,
    },
    judgeResults,
  };
}

/**
 * Detailed workspace data for a specific competition:
 * - Competition metadata, poster, categories, participant count
 * - Assigned panel judges
 * - Active session link & session state
 * - Assigned judge count, completed judge count, pending judges & overall progress
 * - Historical evaluation sessions
 */
export async function getCompetitionJudgingWorkspace(competitionId) {
  const prisma = getPrismaClient();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: { groups: true },
      },
      registrations: {
        where: {
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: { not: null },
        },
        select: {
          id: true,
          trunkNumber: true,
        },
      },
    },
  });

  if (!competition) {
    throw new HttpError(404, 'Competition not found.');
  }

  // 1. Fetch judges assigned specifically to this competition
  const assignedJudgesRaw = await prisma.judge.findMany({
    where: {
      OR: [
        { competitionId },
        { assignments: { some: { competitionId } } },
      ],
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  const assignedJudges = assignedJudgesRaw.map(serializeJudge);

  // 2. Fetch all directory judges available for assignment
  const allActiveJudgesRaw = await prisma.judge.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  const allDirectoryJudges = allActiveJudgesRaw.map(serializeJudge);

  // 3. Fetch all sessions for this competition (historical & active)
  const allSessions = await prisma.judgingSession.findMany({
    where: { competitionId },
    orderBy: { createdAt: 'desc' },
  });

  const latestSession = allSessions[0] || null;

  let activeSessionData = null;

  if (latestSession) {
    const orderedCategories = sortJudgingCategories(competition.categories || []);
    const totalCategories = orderedCategories.length;

    // Fetch submissions for this latest session (Winner Selection final submissions)
    const submissions = prisma.judgeCategorySubmission?.findMany
      ? await prisma.judgeCategorySubmission.findMany({ where: { sessionId: latestSession.id } })
      : [];

    // Submissions map by judge (only count completed winner submissions or empty categories)
    const judgeSubmissionKeys = new Map();
    for (const s of submissions) {
      if (!judgeSubmissionKeys.has(s.judgeId)) judgeSubmissionKeys.set(s.judgeId, new Set());
      judgeSubmissionKeys.get(s.judgeId).add(s.categoryId);
    }
    for (const [key, judgeSet] of completedEmptyCategories.entries()) {
      if (key.startsWith(`${latestSession.id}:`)) {
        const catId = key.split(':')[1];
        for (const jId of judgeSet) {
          if (!judgeSubmissionKeys.has(jId)) judgeSubmissionKeys.set(jId, new Set());
          judgeSubmissionKeys.get(jId).add(catId);
        }
      }
    }

    // Determine judge evaluations
    // Target judges for progress: assigned judges (or active directory judges if none assigned)
    const targetJudges = assignedJudges.length > 0 ? assignedJudges : allDirectoryJudges;
    const assignedJudgeCount = targetJudges.length;

    let completedJudgeCount = 0;
    const pendingJudges = [];

    const judgesStatus = targetJudges.map((j) => {
      const submittedCatCount = judgeSubmissionKeys.get(j.id)?.size || 0;
      const isJudgeCompleted = totalCategories > 0 && submittedCatCount >= totalCategories;
      const accessKey = generateJudgeAccessToken(latestSession.token, j.id);

      if (isJudgeCompleted) {
        completedJudgeCount++;
      } else {
        pendingJudges.push({
          id: j.id,
          name: j.name,
          designation: j.designation,
          submittedCategories: submittedCatCount,
          totalCategories,
        });
      }

      return {
        ...j,
        accessKey,
        submittedCategoriesCount: submittedCatCount,
        totalCategories,
        isCompleted: isJudgeCompleted,
        hasStarted: submittedCatCount > 0,
      };
    });

    const totalPossible = assignedJudgeCount * totalCategories;
    let totalSubmitted = 0;
    for (const j of judgesStatus) {
      totalSubmitted += j.submittedCategoriesCount;
    }

    const percentage = totalPossible > 0 ? Math.round((totalSubmitted / totalPossible) * 100) : 0;
    const isFullyCompleted = totalPossible > 0 && completedJudgeCount >= assignedJudgeCount;

    // Auto-update status to COMPLETED if fully completed
    let sessionStatus = latestSession.status;
    if (isFullyCompleted && sessionStatus === 'ACTIVE') {
      sessionStatus = 'COMPLETED';
      if (prisma.judgingSession?.update) {
        prisma.judgingSession
          .update({
            where: { id: latestSession.id },
            data: { status: 'COMPLETED' },
          })
          .catch(() => {});
      }
    }

    activeSessionData = {
      ...serializeJudgingSession(latestSession),
      status: sessionStatus,
      assignedJudgeCount,
      completedJudgeCount,
      pendingJudges,
      overallProgress: {
        totalJudges: assignedJudgeCount,
        totalCategories,
        totalPossibleSubmissions: totalPossible,
        submittedSubmissions: totalSubmitted,
        completionPercentage: isFullyCompleted ? 100 : percentage,
        isFullyCompleted,
      },
      judgesStatus,
    };
  }

  // Determine judging status for this competition
  let judgingStatus = 'Judging Not Started';
  if (latestSession && latestSession.status !== 'REVOKED') {
    if (activeSessionData?.overallProgress?.isFullyCompleted || latestSession.status === 'COMPLETED') {
      judgingStatus = 'Evaluation Done';
    } else if (latestSession.status === 'ACTIVE' && new Date(latestSession.expiresAt) > new Date()) {
      judgingStatus = 'Judging In Progress';
    }
  }

  // Build historical sessions summary
  const historicalSessions = allSessions.map((s) => ({
    ...serializeJudgingSession(s),
    isCurrent: latestSession ? s.id === latestSession.id : false,
  }));

  return {
    competition: {
      ...serializeCompetition(competition),
      eligibleParticipantCount: competition.registrations.length,
      categoriesCount: competition.categories.length,
    },
    judgingStatus,
    assignedJudges: assignedJudges.map((j) => ({
      ...j,
      accessKey: latestSession ? generateJudgeAccessToken(latestSession.token, j.id) : null,
    })),
    directoryJudges: allDirectoryJudges,
    activeSession: activeSessionData,
    historicalSessions,
  };
}
