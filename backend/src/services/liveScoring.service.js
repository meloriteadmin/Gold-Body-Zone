import crypto from 'node:crypto';
import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { categoryMatchesMeasurements } from './categoryRules.js';

/**
 * LIVE ROUND-BASED SCORING
 * ------------------------------------------------------------------
 * Round 1 (Form 1) — Elimination voting, per category (or category group).
 *   Every judge marks an "X" next to the trunk numbers they prefer.
 *   Votes = number of judges who marked a participant. Highest votes on top.
 *   Admin may run a tie-break (Form 1 again) between participants with equal
 *   votes. The tie-break winner keeps the position, the loser(s) are OUT.
 *   Admin confirms who qualifies for Round 2 (normally the single leader).
 *
 * Round 2 (Form 2) — Ranking, no elimination.
 *   Judges give every finalist unique points. Highest total
 *   wins. Equal totals may be re-judged (tie-break, ranking only among them).
 *
 * Round 3 (Form 3) — Titles.
 *   Admin opens one title at a time. Judges vote one trunk number for that
 *   title. Equal top votes may be re-judged using only the tied participants.
 *   An awarded participant can optionally be excluded from future titles.
 *
 * Privacy: the judge endpoints only ever expose trunk numbers.
 */

export const LIVE_HEAT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
});

export const STANDARD_TITLES = [
  'Overall Champion',
  'Title Winner',
  'Champion of Champions',
  'Best Bodybuilder',
  'Best Physique',
  'Best Poser',
  'Best Performer',
  'Most Improved Body Builder',
  'Most Muscular',
  'Best Symmetry',
  'Best Proportion',
  'Best Conditioning',
  'Best Muscle Control',
  'Best Posing Routine',
  'Best Presentation',
  'Best Abs',
  'Best Arms',
  'Best Back',
  'Best Chest',
  'Best Legs',
  'Best Shoulders',
  'Best Mass',
  "Best Men's Physique",
  'Best Classic Physique',
  'Best Fitness Physique',
  "Best Women's Physique",
  'Best Bikini Athlete',
  'Best Junior Bodybuilder',
  'Best Teen Bodybuilder',
  'Best Master Bodybuilder',
  'Best Physically Challenged Bodybuilder',
  'Best Upcoming Bodybuilder',
  'Best Newcomer',
  'Best Transformation',
  'Best Gym Team',
  'First Runner-Up',
  'Second Runner-Up',
  'Third Runner-Up',
  'Iron Man',
  'Golden Body',
];

const ELIGIBLE_REGISTRATION_WHERE = {
  registrationStatus: 'CONFIRMED',
  paymentStatus: 'PAID',
};

function generateAccessToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function asIdArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v) : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function divisionKeyOf(categoryId, groupId) {
  return groupId ? `${categoryId}:${groupId}` : categoryId;
}

function toIso(date) {
  if (!date) return null;
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

function cleanGymName(reg) {
  if (!reg) return '';
  if (
    reg.representingType === 'INDIVIDUAL' ||
    (reg.gymName && reg.gymName.toLowerCase().includes('individual'))
  ) {
    return 'Individual';
  }
  return reg.gymName || 'Individual';
}

/**
 * Wraps "table does not exist" errors (migration not applied) into a clear message.
 */
function rethrowMigrationHint(err) {
  if (err?.code === 'P2021' || err?.code === 'P2022' || /live_heats|live_competition_states|live_heat_submissions|access_token|verified_at/.test(String(err?.message || '')) && /does not exist/.test(String(err?.message || ''))) {
    throw new HttpError(
      503,
      'Live scoring tables are missing. Please run the database migration (npx prisma migrate deploy) on the server.'
    );
  }
  throw err;
}

async function withMigrationHint(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return rethrowMigrationHint(err);
  }
}

// ---------------------------------------------------------------------------
// Judge panel & private links
// ---------------------------------------------------------------------------

/**
 * Returns the active judges of a competition. Guarantees every judge has an
 * assignment row with a private access token (used for the judge's personal link).
 */
export async function getCompetitionPanel(competitionId, prisma = getPrismaClient()) {
  const judges = await prisma.judge.findMany({
    where: {
      isActive: true,
      OR: [{ competitionId }, { assignments: { some: { competitionId } } }],
    },
    include: { assignments: { where: { competitionId } } },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });

  const panel = [];
  for (const judge of judges) {
    let assignment = judge.assignments?.[0] || null;
    if (!assignment) {
      assignment = await prisma.competitionJudge.upsert({
        where: { competitionId_judgeId: { competitionId, judgeId: judge.id } },
        create: { competitionId, judgeId: judge.id, accessToken: generateAccessToken() },
        update: {},
      });
    }
    if (!assignment.accessToken) {
      // Only fill when still empty, so parallel requests never overwrite a shared link.
      await prisma.competitionJudge.updateMany({
        where: { id: assignment.id, accessToken: null },
        data: { accessToken: generateAccessToken() },
      });
      assignment = await prisma.competitionJudge.findUnique({ where: { id: assignment.id } });
    }
    panel.push({
      id: judge.id,
      name: judge.name,
      phone: judge.phone || null,
      email: judge.email || null,
      city: judge.city || null,
      designation: judge.designation || 'Judge',
      accessToken: assignment.accessToken,
    });
  }
  return panel;
}

export async function regenerateJudgeLink(competitionId, judgeId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const assignment = await prisma.competitionJudge.findUnique({
      where: { competitionId_judgeId: { competitionId, judgeId } },
    });
    if (!assignment) {
      throw new HttpError(404, 'This judge is not assigned to the competition.');
    }
    const updated = await prisma.competitionJudge.update({
      where: { id: assignment.id },
      data: { accessToken: generateAccessToken() },
    });
    return { judgeId, accessToken: updated.accessToken };
  });
}

// ---------------------------------------------------------------------------
// Helpers: participants & heats
// ---------------------------------------------------------------------------

const PARTICIPANT_SELECT = {
  id: true,
  trunkNumber: true,
  participantName: true,
  gymName: true,
  representingType: true,
  district: true,
  categoryId: true,
  groupId: true,
  registrationStatus: true,
  paymentStatus: true,
  weightKg: true,
  heightCm: true,
};

async function loadCompetition(prisma, competitionId) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { groups: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      },
    },
  });
  if (!competition) throw new HttpError(404, 'Competition not found.');
  return competition;
}

async function getOrCreateState(prisma, competitionId) {
  const existing = await prisma.liveCompetitionState.findUnique({ where: { competitionId } });
  if (existing) return existing;
  try {
    return await prisma.liveCompetitionState.create({ data: { competitionId } });
  } catch (err) {
    if (err?.code === 'P2002') {
      return prisma.liveCompetitionState.findUnique({ where: { competitionId } });
    }
    throw err;
  }
}

function participantView(reg, categoriesById) {
  if (!reg) return null;
  const category = categoriesById.get(reg.categoryId);
  const group = category?.groups?.find((g) => g.id === reg.groupId) || null;
  return {
    id: reg.id,
    trunkNumber: reg.trunkNumber ?? null,
    participantName: reg.participantName,
    gymName: cleanGymName(reg),
    district: reg.district || '',
    categoryId: reg.categoryId,
    categoryName: category?.name || '',
    groupName: group?.name || null,
    registrationStatus: reg.registrationStatus,
    paymentStatus: reg.paymentStatus,
  };
}

function compareTrunk(a, b) {
  const ta = a?.trunkNumber ?? Number.MAX_SAFE_INTEGER;
  const tb = b?.trunkNumber ?? Number.MAX_SAFE_INTEGER;
  return ta - tb;
}

/**
 * Compares tie-break vectors level by level. Levels are only compared when both
 * participants took part in that tie-break.
 */
function compareTiebreakLevels(aLevels, bLevels, direction) {
  const len = Math.max(aLevels.length, bLevels.length);
  for (let i = 0; i < len; i++) {
    const a = aLevels[i];
    const b = bLevels[i];
    if (a == null || b == null) continue;
    if (a !== b) return direction === 'desc' ? b - a : a - b;
  }
  return 0;
}

function assignPositions(rows, primaryKey, direction) {
  // rows must be pre-sorted. Equal primary + equal comparable tiebreak levels => same position.
  let position = 0;
  let previous = null;
  rows.forEach((row, index) => {
    if (row.eliminated) {
      row.position = null;
      return;
    }
    const isTie =
      previous &&
      !previous.eliminated &&
      previous[primaryKey] === row[primaryKey] &&
      compareTiebreakLevels(previous.tiebreaks, row.tiebreaks, direction) === 0;
    if (!isTie) position = index + 1;
    row.position = position;
    previous = row;
  });

  const byPosition = new Map();
  rows.forEach((row) => {
    if (row.position == null) return;
    if (!byPosition.has(row.position)) byPosition.set(row.position, []);
    byPosition.get(row.position).push(row.registrationId);
  });
  const tieGroups = [];
  for (const [pos, ids] of byPosition.entries()) {
    if (ids.length > 1) tieGroups.push({ position: pos, registrationIds: ids });
    rows.forEach((row) => {
      if (row.position === pos) row.isTied = ids.length > 1;
    });
  }
  tieGroups.sort((a, b) => a.position - b.position);
  return tieGroups;
}

function closedTiebreaksFor(rootHeat, heats) {
  return heats
    .filter((h) => h.parentHeatId === rootHeat.id && h.status === LIVE_HEAT_STATUS.CLOSED)
    .sort((a, b) => new Date(a.closedAt || a.updatedAt) - new Date(b.closedAt || b.updatedAt));
}

function round1Stage(heat) {
  return Number(String(heat.label || '').match(/Stage ([123])\b/)?.[1] || 1);
}

export function advancingIds(root, heats, participantsById) {
  const results = computeRound1Results(root, heats, participantsById);
  const active = results.rows.filter((row) => !row.eliminated);
  const limit = Math.min(root.selectionLimit || active.length, active.length);
  if (active.length <= limit) return active.map((row) => row.registrationId);
  return active.slice(0, limit).map((row) => row.registrationId);
}

/**
 * ROUND 1 results for one main heat (+ its closed tie-breaks).
 */
export function computeRound1Results(rootHeat, heats, participantsById) {
  const ids = asIdArray(rootHeat.participantIds);
  const subs = rootHeat.submissions || [];
  const rows = ids.map((id) => {
    const marks = subs.filter((s) => asIdArray(asObject(s.payload).selected).includes(id));
    return {
      registrationId: id,
      votes: marks.length,
      votedByJudgeIds: marks.map((s) => s.judgeId),
      tiebreaks: [],
      eliminated: false,
      eliminatedInHeatId: null,
      participant: participantsById.get(id) || null,
    };
  });
  const rowById = new Map(rows.map((r) => [r.registrationId, r]));

  const tiebreaks = closedTiebreaksFor(rootHeat, heats);
  tiebreaks.forEach((tb, level) => {
    const tbIds = asIdArray(tb.participantIds);
    const tbSubs = tb.submissions || [];
    const counts = new Map(
      tbIds.map((id) => [
        id,
        tbSubs.filter((s) => asIdArray(asObject(s.payload).selected).includes(id)).length,
      ])
    );
    const max = Math.max(0, ...counts.values());
    tbIds.forEach((id) => {
      const row = rowById.get(id);
      if (!row) return;
      row.tiebreaks[level] = counts.get(id) || 0;
      if ((!/Stage [123]\b/.test(String(rootHeat.label || '')) || round1Stage(rootHeat) === 3) && !row.eliminated && (counts.get(id) || 0) < max) {
        row.eliminated = true;
        row.eliminatedInHeatId = tb.id;
      }
    });
  });

  rows.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.votes !== b.votes) return b.votes - a.votes;
    const tb = compareTiebreakLevels(a.tiebreaks, b.tiebreaks, 'desc');
    if (tb !== 0) return tb;
    return compareTrunk(a.participant, b.participant);
  });

  const tieGroups = assignPositions(rows, 'votes', 'desc');
  const leaders = rows.filter((r) => r.position === 1).map((r) => r.registrationId);

  return {
    rows,
    tieGroups,
    judgesSubmitted: subs.length,
    tiebreakHeatIds: tiebreaks.map((t) => t.id),
    suggestedQualifierIds: leaders.length === 1 ? leaders : [],
    leaderTie: leaders.length > 1,
  };
}

/**
 * ROUND 2 results: numeric judge points, highest total first.
 */
export function computeRound2Results(rootHeat, heats, participantsById) {
  const ids = asIdArray(rootHeat.participantIds);
  const subs = rootHeat.submissions || [];
  const rows = ids.map((id) => {
    const ranksByJudge = {};
    let total = 0;
    subs.forEach((s) => {
      const rank = Number(asObject(asObject(s.payload).ranks)[id]);
      if (Number.isInteger(rank)) {
        ranksByJudge[s.judgeId] = rank;
        total += rank;
      }
    });
    return {
      registrationId: id,
      total,
      ranksByJudge,
      tiebreaks: [],
      eliminated: false,
      participant: participantsById.get(id) || null,
    };
  });
  const rowById = new Map(rows.map((r) => [r.registrationId, r]));

  const tiebreaks = closedTiebreaksFor(rootHeat, heats);
  tiebreaks.forEach((tb, level) => {
    const tbIds = asIdArray(tb.participantIds);
    (tb.submissions || []).forEach((s) => {
      const ranks = asObject(asObject(s.payload).ranks);
      tbIds.forEach((id) => {
        const row = rowById.get(id);
        const rank = Number(ranks[id]);
        if (!row || !Number.isInteger(rank)) return;
        row.tiebreaks[level] = (row.tiebreaks[level] || 0) + rank;
      });
    });
    tbIds.forEach((id) => {
      const row = rowById.get(id);
      if (row && row.tiebreaks[level] == null) row.tiebreaks[level] = 0;
    });
  });

  rows.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    const tb = compareTiebreakLevels(a.tiebreaks, b.tiebreaks, 'desc');
    if (tb !== 0) return tb;
    return compareTrunk(a.participant, b.participant);
  });

  const tieGroups = assignPositions(rows, 'total', 'desc');
  return {
    rows,
    tieGroups,
    judgesSubmitted: subs.length,
    tiebreakHeatIds: tiebreaks.map((t) => t.id),
  };
}

/**
 * ROUND 3 results: votes per title.
 */
export function computeRound3Results(heat, participantsById, heats = [heat]) {
  const titles = Array.isArray(heat.titles) ? heat.titles : [];
  const subs = heat.submissions || [];
  const closedTiebreaks = heat.id ? closedTiebreaksFor(heat, heats) : [];
  return titles.map((title) => {
    const counts = new Map();
    const judgesByReg = new Map();
    subs.forEach((s) => {
      const regId = asObject(asObject(s.payload).titles)[title];
      if (typeof regId === 'string' && regId) {
        counts.set(regId, (counts.get(regId) || 0) + 1);
        if (!judgesByReg.has(regId)) judgesByReg.set(regId, []);
        judgesByReg.get(regId).push(s.judgeId);
      }
    });
    const votes = [...counts.entries()]
      .map(([registrationId, count]) => ({
        registrationId,
        votes: count,
        votedByJudgeIds: judgesByReg.get(registrationId) || [],
        participant: participantsById.get(registrationId) || null,
      }))
      .sort((a, b) => b.votes - a.votes || compareTrunk(a.participant, b.participant));
    const top = votes[0]?.votes || 0;
    let leaders = votes.filter((v) => v.votes === top && top > 0);
    const tiebreaks = [];
    closedTiebreaks
      .filter((tb) => (Array.isArray(tb.titles) ? tb.titles : []).some((value) => value.toLowerCase() === title.toLowerCase()))
      .forEach((tb) => {
        const ids = asIdArray(tb.participantIds);
        const tbCounts = new Map(ids.map((id) => [id, 0]));
        const tbJudgesByReg = new Map(ids.map((id) => [id, []]));
        (tb.submissions || []).forEach((submission) => {
          const selected = asObject(asObject(submission.payload).titles)[title];
          if (tbCounts.has(selected)) {
            tbCounts.set(selected, (tbCounts.get(selected) || 0) + 1);
            tbJudgesByReg.get(selected).push(submission.judgeId);
          }
        });
        const rows = ids
          .map((registrationId) => ({
            registrationId,
            votes: tbCounts.get(registrationId) || 0,
            votedByJudgeIds: tbJudgesByReg.get(registrationId) || [],
            participant: participantsById.get(registrationId) || null,
          }))
          .sort((a, b) => b.votes - a.votes || compareTrunk(a.participant, b.participant));
        const maxVotes = rows[0]?.votes || 0;
        leaders = rows.filter((row) => row.votes === maxVotes && maxVotes > 0);
        tiebreaks.push({ heatId: tb.id, votes: rows });
      });
    const winnerId = leaders.length === 1 ? leaders[0].registrationId : null;
    return {
      title,
      votes,
      winnerId,
      winnerParticipant: winnerId ? participantsById.get(winnerId) || null : null,
      isTied: leaders.length > 1,
      tieRegistrationIds: leaders.length > 1 ? leaders.map((leader) => leader.registrationId) : [],
      tiebreaks,
      tiebreakHeatIds: tiebreaks.map((item) => item.heatId),
    };
  });
}

function heatSummary(heat, participantsById, panel) {
  const submissions = (heat.submissions || []).map((s) => ({
    judgeId: s.judgeId,
    judgeName: panel.find((j) => j.id === s.judgeId)?.name || 'Judge',
    submittedAt: toIso(s.submittedAt),
    payload: s.payload,
  }));
  const submittedIds = new Set(submissions.map((s) => s.judgeId));
  return {
    id: heat.id,
    round: heat.round,
    label: heat.label,
    categoryId: heat.categoryId,
    groupId: heat.groupId,
    parentHeatId: heat.parentHeatId,
    isTiebreak: heat.isTiebreak,
    status: heat.status,
    selectionLimit: heat.selectionLimit,
    titles: Array.isArray(heat.titles) ? heat.titles : [],
    participants: asIdArray(heat.participantIds)
      .map((id) => participantsById.get(id) || { id, trunkNumber: null, participantName: 'Unknown participant' })
      .sort(compareTrunk),
    openedAt: toIso(heat.openedAt),
    closedAt: toIso(heat.closedAt),
    submissions,
    submittedCount: submissions.length,
    totalJudges: panel.length,
    pendingJudges: panel.filter((j) => !submittedIds.has(j.id)).map((j) => ({ id: j.id, name: j.name })),
  };
}

// ---------------------------------------------------------------------------
// Admin: competition list & dashboard
// ---------------------------------------------------------------------------

export async function listLiveCompetitions() {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const competitions = await prisma.competition.findMany({
      where: { isCompleted: false },
      include: {
        categories: { select: { id: true } },
        registrations: {
          select: { id: true, registrationStatus: true, paymentStatus: true, trunkNumber: true },
        },
        liveHeats: { select: { id: true, round: true, status: true } },
      },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
    });

    return competitions.map((c) => {
      const eligible = c.registrations.filter(
        (r) => r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID'
      );
      const maxRound = c.liveHeats.reduce((m, h) => (h.status === 'CANCELLED' ? m : Math.max(m, h.round)), 0);
      return {
        id: c.id,
        name: c.name,
        competitionType: c.competitionType,
        venue: c.venue,
        eventDate: toIso(c.eventDate),
        posterUrl: c.posterUrl,
        isPublished: c.isPublished,
        isRegistrationClosed: c.isRegistrationClosed,
        categoriesCount: c.categories.length,
        totalRegistrations: c.registrations.length,
        eligibleCount: eligible.length,
        withTrunkCount: eligible.filter((r) => r.trunkNumber != null).length,
        hasOpenHeat: c.liveHeats.some((h) => h.status === LIVE_HEAT_STATUS.OPEN),
        liveRound: maxRound,
      };
    });
  });
}

export async function getLiveDashboard(competitionId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const competition = await loadCompetition(prisma, competitionId);
    const categoriesById = new Map(competition.categories.map((c) => [c.id, c]));

    const [panel, state, heats, registrations] = await Promise.all([
      getCompetitionPanel(competitionId, prisma),
      getOrCreateState(prisma, competitionId),
      prisma.liveHeat.findMany({
        where: { competitionId },
        include: { submissions: { orderBy: { submittedAt: 'asc' } } },
        orderBy: { openedAt: 'asc' },
      }),
      prisma.registration.findMany({
        where: { competitionId },
        select: PARTICIPANT_SELECT,
      }),
    ]);

    const participantsById = new Map(
      registrations.map((r) => [r.id, participantView(r, categoriesById)])
    );

    // Category overview with judging eligibility
    const categories = competition.categories.map((cat) => {
      const inCat = registrations.filter((r) => r.categoryId === cat.id && categoryMatchesMeasurements(cat, r.weightKg, r.heightCm));
      const eligible = inCat.filter(
        (r) => r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID'
      );
      return {
        id: cat.id,
        name: cat.name,
        gender: cat.gender,
        categoryType: cat.categoryType,
        groups: (cat.groups || []).map((g) => {
          const gEligible = eligible.filter((r) => r.groupId === g.id);
          return {
            id: g.id,
            name: g.name,
            eligibleCount: gEligible.filter((r) => r.trunkNumber != null).length,
            missingTrunkCount: gEligible.filter((r) => r.trunkNumber == null).length,
          };
        }),
        totalRegistrations: inCat.length,
        eligibleCount: eligible.filter((r) => r.trunkNumber != null).length,
        missingTrunkCount: eligible.filter((r) => r.trunkNumber == null).length,
        notEligibleCount: inCat.length - eligible.length,
      };
    });

    const activeHeats = heats.filter((h) => h.status !== LIVE_HEAT_STATUS.CANCELLED);
    const openHeat = heats.find((h) => h.status === LIVE_HEAT_STATUS.OPEN) || null;
    const qualifiers = asObject(state.round1Qualifiers);

    // ROUND 1 divisions
    const divisionMap = new Map();
    competition.categories.forEach((cat) => {
      divisionMap.set(cat.id, { categoryId: cat.id, groupId: null });
    });
    activeHeats
      .filter((h) => h.round === 1 && h.categoryId)
      .forEach((h) => {
        const key = divisionKeyOf(h.categoryId, h.groupId);
        if (!divisionMap.has(key)) divisionMap.set(key, { categoryId: h.categoryId, groupId: h.groupId });
      });
    Object.keys(qualifiers).forEach((key) => {
      if (!divisionMap.has(key)) {
        const [categoryId, groupId] = key.split(':');
        divisionMap.set(key, { categoryId, groupId: groupId || null });
      }
    });

    const round1Divisions = [...divisionMap.entries()].map(([key, d]) => {
      const cat = categoriesById.get(d.categoryId);
      const group = cat?.groups?.find((g) => g.id === d.groupId) || null;
      const divisionHeats = activeHeats.filter(
        (h) => h.round === 1 && h.categoryId === d.categoryId && (h.groupId || null) === (d.groupId || null)
      );
      const mainHeats = divisionHeats.filter((h) => !h.isTiebreak);
      const closedMain = mainHeats.filter((h) => h.status === LIVE_HEAT_STATUS.CLOSED);
      const stageRoots = [1, 2, 3].map((stage) => [...closedMain].reverse().find((h) => round1Stage(h) === stage) || null);
      const rootHeat = stageRoots[2] || stageRoots[1] || stageRoots[0];
      const isOpen = divisionHeats.some((h) => h.status === LIVE_HEAT_STATUS.OPEN);
      const results = rootHeat ? computeRound1Results(rootHeat, heats, participantsById) : null;
      const qualifierIds = asIdArray(qualifiers[key]);
      let status = 'NOT_STARTED';
      if (rootHeat) status = 'RESULTS_READY';
      if (qualifierIds.length) status = 'QUALIFIED';
      if (isOpen) status = 'IN_PROGRESS';
      return {
        divisionKey: key,
        categoryId: d.categoryId,
        groupId: d.groupId,
        categoryName: cat?.name || 'Deleted category',
        groupName: group?.name || null,
        status,
        rootHeatId: rootHeat?.id || null,
        results,
        stages: stageRoots.map((root, index) => {
          if (!root) return { stage: index + 1, rootHeatId: null, results: null, target: null, participantCount: null, advancementIds: [], advanceError: null };
          let advancementIds = [];
          let advanceError = null;
          try {
            advancementIds = advancingIds(root, heats, participantsById);
            const eligibleNow = new Set(registrations.filter((reg) => cat && reg.categoryId === d.categoryId && reg.registrationStatus === 'CONFIRMED' && reg.paymentStatus === 'PAID' && reg.trunkNumber != null && categoryMatchesMeasurements(cat, reg.weightKg, reg.heightCm)).map((reg) => reg.id));
            if (advancementIds.some((id) => !eligibleNow.has(id))) {
              throw new HttpError(400, 'An advancing participant is no longer eligible. Update and save this stage’s list.');
            }
          }
          catch (error) { advanceError = error.message; }
          return { stage: index + 1, rootHeatId: root.id, results: computeRound1Results(root, heats, participantsById), target: root.selectionLimit, participantCount: asIdArray(root.participantIds).length, advancementIds, advanceError };
        }),
        qualifierIds,
        qualifiers: qualifierIds.map((id) => participantsById.get(id)).filter(Boolean),
      };
    });

    // ROUND 2
    const r2Main = activeHeats.filter((h) => h.round === 2 && !h.isTiebreak);
    const r2Root = [...r2Main].reverse().find((h) => h.status === LIVE_HEAT_STATUS.CLOSED) || null;
    const round2 = {
      rootHeatId: r2Root?.id || null,
      results: r2Root ? computeRound2Results(r2Root, heats, participantsById) : null,
      finalistIds: allQualifierIds(qualifiers),
    };
    round2.finalists = round2.finalistIds.map((id) => participantsById.get(id)).filter(Boolean).sort(compareTrunk);

    // ROUND 3
    const r3Roots = activeHeats.filter(
      (h) => h.round === 3 && !h.isTiebreak && h.status === LIVE_HEAT_STATUS.CLOSED
    );
    const titleResultMap = new Map();
    r3Roots.forEach((root) => {
      computeRound3Results(root, participantsById, heats).forEach((result) => {
        titleResultMap.set(result.title.toLowerCase(), { ...result, rootHeatId: root.id });
      });
    });
    const round3 = {
      heatId: r3Roots[r3Roots.length - 1]?.id || null,
      titleResults: [...titleResultMap.values()],
    };

    const titleAwards = (Array.isArray(state.titleAwards) ? state.titleAwards : []).map((a) => ({
      title: a.title,
      registrationId: a.registrationId,
      excludeFromFutureTitles: Boolean(a.excludeFromFutureTitles),
      participant: participantsById.get(a.registrationId) || null,
    }));

    let stage = 'ROUND1';
    if (activeHeats.some((h) => h.round === 2)) stage = 'ROUND2';
    if (activeHeats.some((h) => h.round === 3) || titleAwards.length) stage = 'ROUND3';

    const eligibleParticipants = registrations
      .filter((r) => r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID')
      .map((r) => participantsById.get(r.id))
      .sort(compareTrunk);

    return {
      competition: {
        id: competition.id,
        name: competition.name,
        competitionType: competition.competitionType,
        venue: competition.venue,
        eventDate: toIso(competition.eventDate),
        posterUrl: competition.posterUrl,
        isCompleted: competition.isCompleted,
      },
      stage,
      categories,
      judges: panel,
      openHeat: openHeat ? heatSummary(openHeat, participantsById, panel) : null,
      heats: [...heats].reverse().map((h) => heatSummary(h, participantsById, panel)),
      round1: { divisions: round1Divisions },
      round2,
      round3,
      titleAwards,
      eligibleParticipants,
      standardTitles: STANDARD_TITLES,
      serverTime: new Date().toISOString(),
    };
  });
}

function allQualifierIds(qualifiers) {
  const seen = new Set();
  Object.values(asObject(qualifiers)).forEach((ids) => asIdArray(ids).forEach((id) => seen.add(id)));
  return [...seen];
}

// ---------------------------------------------------------------------------
// Admin: heat lifecycle
// ---------------------------------------------------------------------------

async function assertNoOpenHeat(tx, competitionId) {
  const open = await tx.liveHeat.findFirst({
    where: { competitionId, status: LIVE_HEAT_STATUS.OPEN },
    select: { id: true, label: true },
  });
  if (open) {
    throw new HttpError(
      409,
      `"${open.label || 'A heat'}" is still open on the judges' screens. Close (reveal) or cancel it first.`
    );
  }
}

function parseSelectionLimit(raw, max) {
  if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, 'Selection limit must be a whole number of 1 or more (or empty for no limit).');
  }
  return Math.min(n, max);
}

function cleanTitles(rawTitles) {
  if (!Array.isArray(rawTitles)) return [];
  const seen = new Set();
  const out = [];
  rawTitles.forEach((t) => {
    const title = typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : '';
    if (!title) return;
    if (title.length > 80) throw new HttpError(400, `Title "${title.slice(0, 30)}…" is too long (max 80 characters).`);
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(title);
  });
  return out;
}

/**
 * Opens a new heat (Form 1 / Form 2 / Form 3) on all judges' screens.
 */
export async function openHeat(competitionId, body = {}) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const competition = await loadCompetition(prisma, competitionId);
    if (competition.isCompleted) {
      throw new HttpError(400, 'This competition is marked completed. Re-open it before scoring.');
    }
    const round = Number(body.round);
    if (![1, 2, 3].includes(round)) throw new HttpError(400, 'Round must be 1, 2 or 3.');

    const panel = await getCompetitionPanel(competitionId, prisma);
    await getOrCreateState(prisma, competitionId);
    if (panel.length === 0) {
      throw new HttpError(400, 'Add at least one active judge to this competition before starting a round.');
    }

    return prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`live:${competitionId}`}))`;
      } catch {
        /* ignore when not supported */
      }
      await assertNoOpenHeat(tx, competitionId);

      const parentHeatId = typeof body.parentHeatId === 'string' && body.parentHeatId ? body.parentHeatId : null;
      let data;

      if (parentHeatId) {
        data = await buildTiebreakHeat(tx, competition, round, parentHeatId, body);
      } else if (round === 1) {
        data = await buildRound1Heat(tx, competition, body);
      } else if (round === 2) {
        data = await buildRound2Heat(tx, competition);
      } else {
        data = await buildRound3Heat(tx, competition, body);
      }

      const heat = await tx.liveHeat.create({
        data: { competitionId, round, status: LIVE_HEAT_STATUS.OPEN, ...data },
      });
      return { heat: { id: heat.id, label: heat.label, round: heat.round } };
    });
  });
}

async function eligibleIdsForDivision(tx, competitionId, category, groupId) {
  const regs = await tx.registration.findMany({
    where: {
      competitionId,
      categoryId: category.id,
      ...(groupId ? { groupId } : {}),
      ...ELIGIBLE_REGISTRATION_WHERE,
    },
    select: { id: true, trunkNumber: true, participantName: true, weightKg: true, heightCm: true },
    orderBy: [{ trunkNumber: 'asc' }, { createdAt: 'asc' }],
  });
  const invalid = regs.filter((reg) => !categoryMatchesMeasurements(category, reg.weightKg, reg.heightCm));
  if (invalid.length) throw new HttpError(400, `${invalid.length} participant(s) have measurements outside ${category.name}. Correct their category in Category Line-up before judging.`);
  return regs;
}

async function buildRound1Heat(tx, competition, body) {
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';
  const category = competition.categories.find((c) => c.id === categoryId);
  if (!category) throw new HttpError(400, 'Choose a category of this competition.');
  const groupId = typeof body.groupId === 'string' && body.groupId ? body.groupId : null;
  const group = groupId ? category.groups.find((g) => g.id === groupId) : null;
  if (groupId && !group) throw new HttpError(400, 'Selected group does not belong to this category.');

  const stage = Number(body.stage || 1);
  if (![1, 2, 3].includes(stage)) throw new HttpError(400, 'Choose Round 1 Stage 1, 2 or 3.');
  const laterHeats = await tx.liveHeat.findMany({ where: { competitionId: competition.id, round: 1, categoryId, groupId, status: { not: LIVE_HEAT_STATUS.CANCELLED }, isTiebreak: false }, select: { label: true } });
  if (laterHeats.some((heat) => round1Stage(heat) > stage)) {
    throw new HttpError(400, `Stage ${stage + 1} has already started for this category. Later stages must be cleared before re-running Stage ${stage}.`);
  }
  const regs = await eligibleIdsForDivision(tx, competition.id, category, groupId);
  const missing = regs.filter((r) => r.trunkNumber == null);
  if (missing.length) {
    throw new HttpError(
      400,
      `${missing.length} confirmed participant(s) in ${category.name} have no trunk number (${missing
        .slice(0, 5)
        .map((r) => r.participantName)
        .join(', ')}${missing.length > 5 ? ', …' : ''}). Assign trunk numbers in Judging Control Room → Category Line-up first.`
    );
  }
  if (regs.length === 0) {
    throw new HttpError(400, `No confirmed & paid participants in ${category.name}${group ? ` (${group.name})` : ''}.`);
  }

  let participantIds = regs.map((reg) => reg.id);
  if (stage > 1) {
    const prior = await tx.liveHeat.findMany({ where: { competitionId: competition.id, round: 1, categoryId, groupId, status: LIVE_HEAT_STATUS.CLOSED }, include: { submissions: true }, orderBy: { openedAt: 'asc' } });
    const previous = [...prior].reverse().find((heat) => !heat.isTiebreak && round1Stage(heat) === stage - 1);
    if (!previous) throw new HttpError(400, `Finish Stage ${stage - 1} before starting Stage ${stage}.`);
    participantIds = advancingIds(previous, prior, new Map(regs.map((reg) => [reg.id, reg])));
    if (participantIds.some((id) => !regs.some((reg) => reg.id === id))) throw new HttpError(400, 'A selected participant is no longer eligible. Correct the category before continuing.');
  }
  const target = Math.min(stage === 3 ? 1 : Number(body.selectionLimit || (stage === 1 ? 20 : 5)), participantIds.length);
  if (!Number.isInteger(target) || target < 1) throw new HttpError(400, 'Select a valid number of participants.');

  return {
    categoryId,
    groupId,
    isTiebreak: false,
    label: `Round 1 · Stage ${stage} · ${category.name}${group ? ` (${group.name})` : ''}`,
    selectionLimit: target,
    participantIds,
    titles: [],
  };
}

async function buildRound2Heat(tx, competition) {
  const state = await getOrCreateState(tx, competition.id);
  const ids = allQualifierIds(state.round1Qualifiers);
  if (ids.length === 0) {
    throw new HttpError(400, 'No Round 1 qualifiers yet. Finalize at least one category in Round 1 first.');
  }
  for (const category of competition.categories) {
    const eligibleCount = await tx.registration.count({ where: { competitionId: competition.id, categoryId: category.id, ...ELIGIBLE_REGISTRATION_WHERE } });
    if (eligibleCount && !Object.keys(asObject(state.round1Qualifiers)).some((key) => key === category.id || key.startsWith(`${category.id}:`))) {
      throw new HttpError(400, `Finish all three Round 1 stages and confirm a winner for ${category.name} before starting Round 2.`);
    }
  }
  const regs = await tx.registration.findMany({
    where: { id: { in: ids }, competitionId: competition.id },
    select: { id: true, trunkNumber: true, participantName: true, registrationStatus: true, paymentStatus: true },
  });
  const invalid = regs.filter(
    (r) => r.trunkNumber == null || r.registrationStatus !== 'CONFIRMED' || r.paymentStatus !== 'PAID'
  );
  if (invalid.length || regs.length !== ids.length) {
    throw new HttpError(
      400,
      `Some qualifiers are no longer eligible (missing trunk number or not confirmed/paid): ${invalid
        .map((r) => r.participantName)
        .join(', ') || 'removed registration'}. Fix them or re-finalize the category.`
    );
  }
  regs.sort((a, b) => a.trunkNumber - b.trunkNumber);
  return {
    categoryId: null,
    groupId: null,
    isTiebreak: false,
    label: 'Round 2 · Final ranking',
    selectionLimit: null,
    participantIds: regs.map((r) => r.id),
    titles: [],
  };
}

async function buildRound3Heat(tx, competition, body) {
  const titles = cleanTitles(body.titles);
  if (titles.length !== 1) throw new HttpError(400, 'Choose exactly one title for each Form 3 vote.');

  const state = await getOrCreateState(tx, competition.id);
  const titleKey = titles[0].toLowerCase();
  const awards = Array.isArray(state.titleAwards) ? state.titleAwards : [];
  if (awards.some((award) => String(award?.title || '').toLowerCase() === titleKey)) {
    throw new HttpError(400, `"${titles[0]}" is already awarded. Choose a different title.`);
  }
  const previousTitleHeats = await tx.liveHeat.findMany({
    where: {
      competitionId: competition.id,
      round: 3,
      isTiebreak: false,
      status: { in: [LIVE_HEAT_STATUS.OPEN, LIVE_HEAT_STATUS.CLOSED] },
    },
    select: { titles: true },
  });
  if (previousTitleHeats.some((heat) => (Array.isArray(heat.titles) ? heat.titles : []).some((title) => title.toLowerCase() === titleKey))) {
    throw new HttpError(400, `Judges have already voted for "${titles[0]}". Resolve its result before starting another form with that title.`);
  }
  const unfinished = previousTitleHeats.flatMap((heat) => Array.isArray(heat.titles) ? heat.titles : [])
    .find((title) => !awards.some((award) => String(award?.title || '').toLowerCase() === title.toLowerCase()));
  if (unfinished) throw new HttpError(400, `Resolve the vote and save the winner for "${unfinished}" before opening another title.`);

  let participantIds = asIdArray(body.participantIds);
  if (participantIds.length === 0) {
    const r2 = await tx.liveHeat.findMany({
      where: { competitionId: competition.id, round: 2, isTiebreak: false, status: LIVE_HEAT_STATUS.CLOSED },
      orderBy: { openedAt: 'desc' },
      take: 1,
    });
    if (r2[0]) {
      participantIds = asIdArray(r2[0].participantIds);
    } else {
      participantIds = allQualifierIds(state.round1Qualifiers);
    }
  }
  const excludedIds = new Set(
    awards.filter((award) => award?.excludeFromFutureTitles).map((award) => award.registrationId)
  );
  participantIds = participantIds.filter((id) => !excludedIds.has(id));
  const regs = await tx.registration.findMany({
    where: { id: { in: participantIds }, competitionId: competition.id, trunkNumber: { not: null } },
    select: { id: true, trunkNumber: true },
    orderBy: { trunkNumber: 'asc' },
  });
  if (regs.length === 0) {
    throw new HttpError(400, 'No eligible finalists remain for this title. Review the previous title exclusions.');
  }
  return {
    categoryId: null,
    groupId: null,
    isTiebreak: false,
    label: `Round 3 · ${titles[0]}`,
    selectionLimit: null,
    participantIds: regs.map((r) => r.id),
    titles,
  };
}

async function buildTiebreakHeat(tx, competition, round, parentHeatId, body) {
  const parent = await tx.liveHeat.findUnique({
    where: { id: parentHeatId },
    include: { submissions: true },
  });
  if (!parent || parent.competitionId !== competition.id) throw new HttpError(404, 'Original heat not found.');
  if (parent.round !== round) throw new HttpError(400, 'Tie-break must be in the same round as the original heat.');
  const rootId = parent.isTiebreak ? parent.parentHeatId : parent.id;
  const root = await tx.liveHeat.findUnique({ where: { id: rootId }, include: { submissions: true } });
  if (!root || root.status !== LIVE_HEAT_STATUS.CLOSED) {
    throw new HttpError(400, 'Results of the original heat must be revealed before a tie-break.');
  }
  if (round === 1) {
    const allMain = await tx.liveHeat.findMany({
      where: { competitionId: competition.id, round: 1, categoryId: root.categoryId, groupId: root.groupId, isTiebreak: false, status: { not: LIVE_HEAT_STATUS.CANCELLED } },
      select: { label: true },
    });
    if (allMain.some((heat) => round1Stage(heat) > round1Stage(root))) {
      throw new HttpError(400, 'A later elimination stage has started. Its earlier result can no longer be re-voted.');
    }
  }

  const ids = [...new Set(asIdArray(body.participantIds))];
  if (ids.length < 2) throw new HttpError(400, 'Select at least two tied participants for the tie-break.');

  // Verify they are currently tied according to the latest results
  const heats = await tx.liveHeat.findMany({
    where: { competitionId: competition.id, round, status: LIVE_HEAT_STATUS.CLOSED },
    include: { submissions: true },
  });
  const participantsById = new Map(asIdArray(root.participantIds).map((id) => [id, { id }]));
  let tiedGroup;
  let title = null;
  let tiebreakSelectionLimit = null;
  if (round === 3) {
    const result = computeRound3Results(root, participantsById, heats)[0];
    title = result?.title || (Array.isArray(root.titles) ? root.titles[0] : null);
    const tiedIds = result?.tieRegistrationIds || [];
    const exactTie = ids.length === tiedIds.length && ids.every((id) => tiedIds.includes(id));
    if (!result?.isTied || !exactTie) {
      throw new HttpError(400, 'Only all participants tied for this title can enter its tie-break.');
    }
    tiedGroup = { position: null, registrationIds: tiedIds };
  } else {
    const results = round === 1
      ? computeRound1Results(root, heats, participantsById)
      : computeRound2Results(root, heats, participantsById);
    tiedGroup = results.tieGroups.find((group) => ids.every((id) => group.registrationIds.includes(id)));
    if (!tiedGroup) {
      throw new HttpError(400, 'The selected participants are not tied on the same position. Pick participants from one tie group.');
    }
    if (round === 1) {
      // Admins may request a re-vote for any true tie, including one that does not
      // change the cutoff. Otherwise the normal vote order fills the stage quota.
      const cutoff = Math.min(root.selectionLimit || results.rows.length, results.rows.length);
      const crossesCutoff = tiedGroup.position <= cutoff && tiedGroup.position + tiedGroup.registrationIds.length - 1 > cutoff;
      tiebreakSelectionLimit = crossesCutoff ? cutoff - (tiedGroup.position - 1) : 1;
    }
  }

  const regs = await tx.registration.findMany({
    where: { id: { in: ids }, competitionId: competition.id },
    select: { id: true, trunkNumber: true },
    orderBy: { trunkNumber: 'asc' },
  });
  if (regs.some((r) => r.trunkNumber == null)) {
    throw new HttpError(400, 'Every tie-break participant needs a trunk number.');
  }

  let label = `Round ${round} · Tie-break for position ${tiedGroup.position}`;
  if (round === 1 && root.categoryId) {
    const cat = competition.categories.find((c) => c.id === root.categoryId);
    const grp = cat?.groups?.find((g) => g.id === root.groupId);
    label = `Round 1 · ${cat?.name || 'Category'}${grp ? ` (${grp.name})` : ''} · Tie-break (position ${tiedGroup.position})`;
  } else if (round === 3) {
    label = `Round 3 · ${title || 'Title'} · Tie-break`;
  }

  return {
    categoryId: root.categoryId,
    groupId: root.groupId,
    parentHeatId: root.id,
    isTiebreak: true,
    label,
    selectionLimit: round === 1 ? Math.min(tiebreakSelectionLimit, regs.length) : null,
    participantIds: regs.map((r) => r.id),
    titles: round === 3 && title ? [title] : [],
  };
}

export async function closeHeat(heatId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const heat = await prisma.liveHeat.findUnique({ where: { id: heatId } });
    if (!heat) throw new HttpError(404, 'Heat not found.');
    if (heat.status !== LIVE_HEAT_STATUS.OPEN) throw new HttpError(400, 'This heat is not open.');
    const count = await prisma.liveHeatSubmission.count({ where: { heatId } });
    if (count === 0) {
      throw new HttpError(400, 'No judge has submitted this form yet. Wait for submissions or cancel the heat.');
    }
    const panel = await getCompetitionPanel(heat.competitionId, prisma);
    const submitted = await prisma.liveHeatSubmission.findMany({ where: { heatId }, select: { judgeId: true } });
    const submittedIds = new Set(submitted.map((item) => item.judgeId));
    const pending = panel.filter((judge) => !submittedIds.has(judge.id));
    if (pending.length) {
      throw new HttpError(400, `Wait for all judges before closing this form: ${pending.map((judge) => judge.name).join(', ')}.`);
    }
    const updated = await prisma.liveHeat.updateMany({
      where: { id: heatId, status: LIVE_HEAT_STATUS.OPEN },
      data: { status: LIVE_HEAT_STATUS.CLOSED, closedAt: new Date() },
    });
    if (updated.count === 0) throw new HttpError(409, 'Heat was already closed.');
    return { heatId, status: LIVE_HEAT_STATUS.CLOSED };
  });
}

export async function cancelHeat(heatId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const heat = await prisma.liveHeat.findUnique({ where: { id: heatId } });
    if (!heat) throw new HttpError(404, 'Heat not found.');
    if (heat.status !== LIVE_HEAT_STATUS.OPEN) throw new HttpError(400, 'Only an open heat can be cancelled.');
    await prisma.liveHeat.update({
      where: { id: heatId },
      data: { status: LIVE_HEAT_STATUS.CANCELLED, closedAt: new Date() },
    });
    return { heatId, status: LIVE_HEAT_STATUS.CANCELLED };
  });
}

export async function unlockJudgeSubmission(heatId, judgeId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const heat = await prisma.liveHeat.findUnique({ where: { id: heatId } });
    if (!heat) throw new HttpError(404, 'Heat not found.');
    if (heat.status !== LIVE_HEAT_STATUS.OPEN) {
      throw new HttpError(400, 'A judge sheet can only be reopened while the heat is open.');
    }
    const result = await prisma.liveHeatSubmission.deleteMany({ where: { heatId, judgeId } });
    return { heatId, judgeId, reopened: result.count > 0 };
  });
}

// ---------------------------------------------------------------------------
// Admin: qualifiers, titles, reset
// ---------------------------------------------------------------------------

export async function setRound1Qualifiers(competitionId, body = {}) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const competition = await loadCompetition(prisma, competitionId);
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';
    const category = competition.categories.find((c) => c.id === categoryId);
    if (!category) throw new HttpError(400, 'Choose a valid category.');
    const groupId = typeof body.groupId === 'string' && body.groupId ? body.groupId : null;
    if (groupId && !category.groups.some((g) => g.id === groupId)) {
      throw new HttpError(400, 'Selected group does not belong to this category.');
    }
    const ids = [...new Set(asIdArray(body.registrationIds))];
    if (ids.length > 1) throw new HttpError(400, 'Exactly one Stage 3 winner may advance from each category.');
    if (ids.length) {
      const heats = await prisma.liveHeat.findMany({ where: { competitionId, round: 1, categoryId, groupId, status: LIVE_HEAT_STATUS.CLOSED }, include: { submissions: true }, orderBy: { openedAt: 'asc' } });
      const root = [...heats].reverse().find((heat) => !heat.isTiebreak && round1Stage(heat) === 3);
      if (!root) throw new HttpError(400, 'Finish all three Round 1 stages before choosing the finalist.');
      const winners = advancingIds(root, heats, new Map());
      if (winners.length !== 1 || ids[0] !== winners[0]) throw new HttpError(400, 'Only the Stage 3 vote winner can advance to Round 2.');
    }
    if (ids.length) {
      const regs = await prisma.registration.findMany({
        where: { id: { in: ids }, competitionId },
        select: { id: true, trunkNumber: true },
      });
      if (regs.length !== ids.length) throw new HttpError(400, 'One or more selected participants were not found.');
      if (regs.some((r) => r.trunkNumber == null)) throw new HttpError(400, 'Qualifiers need trunk numbers.');
    }
    const state = await getOrCreateState(prisma, competitionId);
    const qualifiers = { ...asObject(state.round1Qualifiers) };
    const key = divisionKeyOf(categoryId, groupId);
    if (ids.length) qualifiers[key] = ids;
    else delete qualifiers[key];
    await prisma.liveCompetitionState.update({
      where: { id: state.id },
      data: { round1Qualifiers: qualifiers },
    });
    return { divisionKey: key, qualifierIds: ids };
  });
}

export async function setTitleAwards(competitionId, body = {}) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    await loadCompetition(prisma, competitionId);
    const raw = Array.isArray(body.awards) ? body.awards : [];
    const seen = new Set();
    const awards = [];
    for (const item of raw) {
      const title = typeof item?.title === 'string' ? item.title.trim().replace(/\s+/g, ' ') : '';
      const registrationId = typeof item?.registrationId === 'string' ? item.registrationId : '';
      if (!title && !registrationId) continue;
      if (!title) throw new HttpError(400, 'Every award needs a title.');
      if (title.length > 80) throw new HttpError(400, `Title "${title.slice(0, 30)}…" is too long.`);
      if (!registrationId) throw new HttpError(400, `Choose the winner for "${title}".`);
      const key = title.toLowerCase();
      if (seen.has(key)) throw new HttpError(400, `"${title}" is listed twice. Each title can be awarded once.`);
      seen.add(key);
      awards.push({
        title,
        registrationId,
        excludeFromFutureTitles: true,
      });
    }
    if (awards.length) {
      const titleHeats = await prisma.liveHeat.findMany({ where: { competitionId, round: 3, status: LIVE_HEAT_STATUS.CLOSED }, include: { submissions: true } });
      const resolvedTitles = new Map();
      titleHeats.filter((heat) => !heat.isTiebreak).forEach((heat) => {
        computeRound3Results(heat, new Map(), titleHeats).forEach((result) => resolvedTitles.set(result.title.toLowerCase(), result));
      });
      for (const award of awards) {
        const result = resolvedTitles.get(award.title.toLowerCase());
        if (!result || result.isTied || result.winnerId !== award.registrationId) {
          throw new HttpError(400, `Finish judge voting and resolve any tie for "${award.title}" before awarding its voted winner.`);
        }
      }
      const regs = await prisma.registration.findMany({
        where: { id: { in: awards.map((a) => a.registrationId) }, competitionId },
        select: { id: true },
      });
      const found = new Set(regs.map((r) => r.id));
      const bad = awards.find((a) => !found.has(a.registrationId));
      if (bad) throw new HttpError(400, `Winner for "${bad.title}" is not a participant of this competition.`);

      const byParticipant = new Map();
      awards.forEach((award) => {
        if (!byParticipant.has(award.registrationId)) byParticipant.set(award.registrationId, []);
        byParticipant.get(award.registrationId).push(award);
      });
      for (const participantAwards of byParticipant.values()) {
        if (participantAwards.length > 1) {
          throw new HttpError(
            400,
            'A participant who already won a title cannot receive another title. Choose a different voted winner.'
          );
        }
      }
    }
    const state = await getOrCreateState(prisma, competitionId);
    await prisma.liveCompetitionState.update({ where: { id: state.id }, data: { titleAwards: awards } });
    return { awards };
  });
}

export async function resetLiveScoring(competitionId) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    await loadCompetition(prisma, competitionId);
    await prisma.$transaction([
      prisma.liveHeat.deleteMany({ where: { competitionId } }),
      prisma.liveCompetitionState.deleteMany({ where: { competitionId } }),
    ]);
    return { reset: true };
  });
}

// ---------------------------------------------------------------------------
// Judge portal (token based, trunk numbers only)
// ---------------------------------------------------------------------------

async function resolveJudgeToken(prisma, token) {
  if (!token || typeof token !== 'string' || token.length < 10 || token.length > 100) {
    throw new HttpError(404, 'Invalid judge link.');
  }
  const assignment = await prisma.competitionJudge.findUnique({
    where: { accessToken: token },
    include: {
      judge: { select: { id: true, name: true, isActive: true } },
      competition: { select: { id: true, name: true, venue: true, eventDate: true, isCompleted: true } },
    },
  });
  if (!assignment || !assignment.judge) {
    throw new HttpError(404, 'This judge link is not valid any more. Please ask the admin for your new link.');
  }
  if (!assignment.judge.isActive) {
    throw new HttpError(403, 'Your judge profile is inactive. Please contact the admin.');
  }
  return assignment;
}

export async function getJudgeScoringState(token) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const assignment = await resolveJudgeToken(prisma, token);
    const competitionId = assignment.competitionId;

    const [openHeat, lastHeat] = await Promise.all([
      prisma.liveHeat.findFirst({
        where: { competitionId, status: LIVE_HEAT_STATUS.OPEN },
        orderBy: { openedAt: 'desc' },
      }),
      prisma.liveHeat.findFirst({
        where: { competitionId, status: { in: [LIVE_HEAT_STATUS.OPEN, LIVE_HEAT_STATUS.CLOSED] } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, status: true, label: true },
      }),
    ]);

    const base = {
      judge: { name: assignment.judge.name },
      competition: {
        name: assignment.competition.name,
        venue: assignment.competition.venue,
        eventDate: toIso(assignment.competition.eventDate),
      },
      serverTime: new Date().toISOString(),
    };

    if (!openHeat) {
      return {
        ...base,
        screen: lastHeat && lastHeat.status === LIVE_HEAT_STATUS.CLOSED ? 'LOCKED' : 'WAITING',
        heat: null,
        mySubmission: null,
      };
    }

    const [submission, regs] = await Promise.all([
      prisma.liveHeatSubmission.findUnique({
        where: { heatId_judgeId: { heatId: openHeat.id, judgeId: assignment.judgeId } },
      }),
      prisma.registration.findMany({
        where: { id: { in: asIdArray(openHeat.participantIds) } },
        select: { id: true, trunkNumber: true },
      }),
    ]);
    const participants = regs
      .map((r) => ({ id: r.id, trunkNumber: r.trunkNumber }))
      .sort(compareTrunk);

    let categoryName = null;
    if (openHeat.categoryId) {
      const cat = await prisma.competitionCategory.findUnique({
        where: { id: openHeat.categoryId },
        select: { name: true },
      });
      categoryName = cat?.name || null;
    }

    return {
      ...base,
      screen: submission ? 'SUBMITTED' : 'FORM',
      heat: {
        id: openHeat.id,
        round: openHeat.round,
        label: openHeat.label,
        categoryName,
        isTiebreak: openHeat.isTiebreak,
        selectionLimit: openHeat.selectionLimit,
        titles: Array.isArray(openHeat.titles) ? openHeat.titles : [],
        participants,
      },
      mySubmission: submission
        ? { submittedAt: toIso(submission.submittedAt), payload: submission.payload }
        : null,
    };
  });
}

function validateSubmissionPayload(heat, payload) {
  const allowed = new Set(asIdArray(heat.participantIds));
  const body = asObject(payload);

  if (heat.round === 1) {
    const selected = [...new Set(asIdArray(body.selected))];
    if (selected.length === 0) throw new HttpError(400, 'Mark at least one trunk number with X before submitting.');
    if (selected.some((id) => !allowed.has(id))) throw new HttpError(400, 'Invalid participant in your selection.');
    if (heat.selectionLimit && selected.length > heat.selectionLimit) {
      throw new HttpError(400, `You can mark at most ${heat.selectionLimit} participant(s) in this form.`);
    }
    return { selected };
  }

  if (heat.round === 2) {
    const ranks = asObject(body.ranks);
    const ids = [...allowed];
    const used = new Set();
    const clean = {};
    for (const id of ids) {
      const rank = Number(ranks[id]);
      if (!Number.isInteger(rank) || rank < 1 || rank > ids.length) {
        throw new HttpError(400, `Give every trunk number a score from 1 to ${ids.length}.`);
      }
      if (used.has(rank)) throw new HttpError(400, `Score ${rank} is used twice. Every score must be unique.`);
      used.add(rank);
      clean[id] = rank;
    }
    if (Object.keys(ranks).some((id) => !allowed.has(id))) {
      throw new HttpError(400, 'Invalid participant in your ranking.');
    }
    return { ranks: clean };
  }

  const titles = Array.isArray(heat.titles) ? heat.titles : [];
  const chosen = asObject(body.titles);
  const clean = {};
  for (const title of titles) {
    const regId = chosen[title];
    if (typeof regId !== 'string' || !allowed.has(regId)) {
      throw new HttpError(400, `Choose a trunk number for "${title}".`);
    }
    clean[title] = regId;
  }
  return { titles: clean };
}

export async function submitJudgeScores(token, body = {}) {
  return withMigrationHint(async () => {
    const prisma = getPrismaClient();
    const assignment = await resolveJudgeToken(prisma, token);
    const heatId = typeof body.heatId === 'string' ? body.heatId : '';
    const heat = await prisma.liveHeat.findUnique({ where: { id: heatId } });
    if (!heat || heat.competitionId !== assignment.competitionId) {
      throw new HttpError(404, 'This form is no longer available.');
    }
    if (heat.status !== LIVE_HEAT_STATUS.OPEN) {
      throw new HttpError(409, 'This form has been closed by the admin. Your sheet was not accepted.');
    }
    const payload = validateSubmissionPayload(heat, body.payload);
    const already = await prisma.liveHeatSubmission.findUnique({
      where: { heatId_judgeId: { heatId, judgeId: assignment.judgeId } },
      select: { id: true },
    });
    if (already) {
      throw new HttpError(409, 'You have already submitted this form. Ask the admin to reopen your sheet if you need to correct it.');
    }
    try {
      await prisma.liveHeatSubmission.create({
        data: { heatId, judgeId: assignment.judgeId, payload },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new HttpError(409, 'You have already submitted this form. Ask the admin to reopen your sheet if you need to correct it.');
      }
      throw err;
    }
    return { submitted: true };
  });
}
