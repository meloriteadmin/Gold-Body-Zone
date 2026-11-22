import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  createJudge,
  deleteJudge,
  getJudgeById,
  listJudges,
  updateJudge,
} from '../src/services/judge.service.js';
import {
  generateJudgeAccessToken,
  getCategoryJudgingData,
  getCompetitionJudgingWorkspace,
  getJudgingSessionByToken,
  getSessionJudgeResults,
  getSessionProgression,
  identifyJudgeForSession,
  listEligibleJudgingCompetitions,
  revokeJudgingSession,
  saveJudgeRankings,
  saveJudgeSemifinalistSelections,
  saveJudgeWinnerTitles,
  sortJudgingCategories,
  startJudgingSession,
  submitEmptyCategory,
} from '../src/services/judgingSession.service.js';

describe('Judge Management & Initial Judging Workflow — GOLD BODY ZONE', () => {
  let mockJudges = [];
  let mockSessions = [];
  let mockSelections = [];
  let mockRankings = [];
  let mockSubmissions = [];
  let mockCompetitions = [];
  let mockRegistrations = [];

  const mockPrisma = {
    judge: {
      async findMany({ where = {} } = {}) {
        let list = [...mockJudges];
        if (where.isActive !== undefined) {
          list = list.filter((j) => j.isActive === where.isActive);
        }
        return list;
      },
      async count({ where = {} }) {
        const list = await mockPrisma.judge.findMany({ where });
        return list.length;
      },
      async findUnique({ where, include = {} }) {
        const j = mockJudges.find((x) => x.id === where.id);
        if (!j) return null;
        if (include._count) {
          return {
            ...j,
            _count: {
              selections: mockSelections.filter((s) => s.judgeId === j.id).length,
              rankings: mockRankings.filter((r) => r.judgeId === j.id).length,
              submissions: mockSubmissions.filter((sub) => sub.judgeId === j.id).length,
            },
          };
        }
        return j;
      },
      async create({ data }) {
        const newJudge = {
          id: `judge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockJudges.push(newJudge);
        return newJudge;
      },
      async update({ where, data }) {
        const j = mockJudges.find((x) => x.id === where.id);
        if (j) Object.assign(j, data, { updatedAt: new Date() });
        return j;
      },
      async delete({ where }) {
        const idx = mockJudges.findIndex((x) => x.id === where.id);
        if (idx !== -1) mockJudges.splice(idx, 1);
        return { id: where.id };
      },
    },

    competition: {
      async findMany({ where = {}, include = {} }) {
        let list = [...mockCompetitions];
        if (where.isPublished !== undefined) {
          list = list.filter((c) => c.isPublished === where.isPublished);
        }
        if (where.isCompleted !== undefined) {
          list = list.filter((c) => c.isCompleted === where.isCompleted);
        }
        return list.map((c) => ({
          ...c,
          categories: c.categories || [],
          registrations: mockRegistrations.filter(
            (r) =>
              r.competitionId === c.id &&
              r.registrationStatus === 'CONFIRMED' &&
              r.paymentStatus === 'PAID'
          ),
          judgingSessions: mockSessions
            .filter((s) => s.competitionId === c.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)),
        }));
      },
      async findUnique({ where, include = {} }) {
        const c = mockCompetitions.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          categories: c.categories || [],
          registrations: mockRegistrations.filter((r) => r.competitionId === c.id),
        };
      },
    },

    judgingSession: {
      async findMany({ where = {} }) {
        let list = [...mockSessions];
        if (where.competitionId) {
          list = list.filter((s) => s.competitionId === where.competitionId);
        }
        if (where.status) {
          list = list.filter((s) => s.status === where.status);
        }
        return list;
      },
      async findFirst({ where = {}, include = {} }) {
        const list = await mockPrisma.judgingSession.findMany({ where });
        const s = list[0] || null;
        if (!s) return null;
        if (include.competition) {
          const comp = mockCompetitions.find((c) => c.id === s.competitionId);
          return { ...s, competition: comp };
        }
        return s;
      },
      async findUnique({ where, include = {} }) {
        const s = mockSessions.find(
          (x) => (where.id && x.id === where.id) || (where.token && x.token === where.token)
        );
        if (!s) return null;
        if (include.competition) {
          const comp = mockCompetitions.find((c) => c.id === s.competitionId);
          return {
            ...s,
            competition: {
              ...comp,
              categories: comp?.categories || [],
            },
          };
        }
        return s;
      },
      async create({ data, include = {} }) {
        const newSession = {
          id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockSessions.push(newSession);
        if (include.competition) {
          const comp = mockCompetitions.find((c) => c.id === newSession.competitionId);
          return { ...newSession, competition: comp };
        }
        return newSession;
      },
      async update({ where, data, include = {} }) {
        const s = mockSessions.find((x) => x.id === where.id);
        if (s) Object.assign(s, data, { updatedAt: new Date() });
        if (include.competition) {
          const comp = mockCompetitions.find((c) => c.id === s?.competitionId);
          return { ...s, competition: comp };
        }
        return s;
      },
      async updateMany({ where, data }) {
        const targets = mockSessions.filter(
          (s) =>
            (!where.competitionId || s.competitionId === where.competitionId) &&
            (!where.status || s.status === where.status)
        );
        targets.forEach((s) => Object.assign(s, data));
        return { count: targets.length };
      },
    },

    registration: {
      async findMany({ where = {}, orderBy = {} }) {
        let list = [...mockRegistrations];
        if (where.competitionId) {
          list = list.filter((r) => r.competitionId === where.competitionId);
        }
        if (where.categoryId) {
          list = list.filter((r) => r.categoryId === where.categoryId);
        }
        if (where.groupId) {
          list = list.filter((r) => r.groupId === where.groupId);
        }
        if (where.registrationStatus) {
          list = list.filter((r) => r.registrationStatus === where.registrationStatus);
        }
        if (where.paymentStatus) {
          list = list.filter((r) => r.paymentStatus === where.paymentStatus);
        }
        if (where.trunkNumber) {
          list = list.filter((r) => r.trunkNumber !== null && r.trunkNumber !== undefined);
        }
        if (where.id && where.id.in) {
          list = list.filter((r) => where.id.in.includes(r.id));
        }
        return list;
      },
      async count({ where = {} }) {
        const list = await mockPrisma.registration.findMany({ where });
        return list.length;
      },
    },

    judgeSemifinalistSelection: {
      async findMany({ where = {}, include = {} }) {
        let list = [...mockSelections];
        if (where.sessionId) list = list.filter((s) => s.sessionId === where.sessionId);
        if (where.judgeId) list = list.filter((s) => s.judgeId === where.judgeId);
        if (where.categoryId) list = list.filter((s) => s.categoryId === where.categoryId);
        if (where.groupKey) list = list.filter((s) => s.groupKey === where.groupKey);

        if (include.registration) {
          list = list.map((s) => {
            const reg = mockRegistrations.find((r) => r.id === s.registrationId);
            return { ...s, registration: reg };
          });
        }
        return list;
      },
      async createMany({ data }) {
        data.forEach((item) => {
          mockSelections.push({
            id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ...item,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
        return { count: data.length };
      },
      async deleteMany({ where = {} }) {
        const prevCount = mockSelections.length;
        mockSelections = mockSelections.filter((s) => {
          if (where.sessionId && s.sessionId !== where.sessionId) return true;
          if (where.judgeId && s.judgeId !== where.judgeId) return true;
          if (where.categoryId && s.categoryId !== where.categoryId) return true;
          if (where.groupKey && s.groupKey !== where.groupKey) return true;
          return false;
        });
        return { count: prevCount - mockSelections.length };
      },
    },

    judgeRanking: {
      async findMany({ where = {}, include = {}, orderBy = {} }) {
        let list = [...mockRankings];
        if (where.sessionId) list = list.filter((r) => r.sessionId === where.sessionId);
        if (where.judgeId) list = list.filter((r) => r.judgeId === where.judgeId);
        if (where.categoryId) list = list.filter((r) => r.categoryId === where.categoryId);
        if (where.groupKey) list = list.filter((r) => r.groupKey === where.groupKey);

        if (include.registration) {
          list = list.map((rk) => {
            const reg = mockRegistrations.find((r) => r.id === rk.registrationId);
            return { ...rk, registration: reg };
          });
        }
        if (orderBy.rank === 'asc') {
          list.sort((a, b) => a.rank - b.rank);
        }
        return list;
      },
      async createMany({ data }) {
        data.forEach((item) => {
          mockRankings.push({
            id: `rank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ...item,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
        return { count: data.length };
      },
      async deleteMany({ where = {} }) {
        const prevCount = mockRankings.length;
        mockRankings = mockRankings.filter((rk) => {
          if (where.sessionId && rk.sessionId !== where.sessionId) return true;
          if (where.judgeId && rk.judgeId !== where.judgeId) return true;
          if (where.categoryId && rk.categoryId !== where.categoryId) return true;
          if (where.groupKey && rk.groupKey !== where.groupKey) return true;
          if (where.registrationId && where.registrationId.notIn) {
            return !where.registrationId.notIn.includes(rk.registrationId);
          }
          return false;
        });
        return { count: prevCount - mockRankings.length };
      },
      async update({ where, data }) {
        const rk = mockRankings.find((r) => r.id === where.id);
        if (rk) Object.assign(rk, data, { updatedAt: new Date() });
        return rk;
      },
    },

    judgeCategorySubmission: {
      async findMany({ where = {} }) {
        let list = [...mockSubmissions];
        if (where.sessionId) list = list.filter((s) => s.sessionId === where.sessionId);
        if (where.judgeId) list = list.filter((s) => s.judgeId === where.judgeId);
        if (where.categoryId) list = list.filter((s) => s.categoryId === where.categoryId);
        return list;
      },
      async findUnique({ where = {} }) {
        const key = where.sessionId_judgeId_categoryId_groupKey;
        if (!key) return null;
        return (
          mockSubmissions.find(
            (s) =>
              s.sessionId === key.sessionId &&
              s.judgeId === key.judgeId &&
              s.categoryId === key.categoryId &&
              (s.groupKey || 'DEFAULT') === (key.groupKey || 'DEFAULT')
          ) || null
        );
      },
      async upsert({ where, create, update }) {
        const key = where.sessionId_judgeId_categoryId_groupKey;
        let sub = mockSubmissions.find(
          (s) =>
            s.sessionId === key.sessionId &&
            s.judgeId === key.judgeId &&
            s.categoryId === key.categoryId &&
            (s.groupKey || 'DEFAULT') === (key.groupKey || 'DEFAULT')
        );
        if (sub) {
          Object.assign(sub, update);
        } else {
          sub = { ...create, createdAt: new Date() };
          mockSubmissions.push(sub);
        }
        return sub;
      },
    },

    async $transaction(fn) {
      return fn(mockPrisma);
    },
  };

  beforeEach(() => {
    globalThis.__prisma = mockPrisma;

    mockJudges = [];
    mockSessions = [];
    mockSelections = [];
    mockRankings = [];
    mockSubmissions = [];
    mockCompetitions = [];
    mockRegistrations = [];

    // Pre-populate an eligible competition
    mockCompetitions.push({
      id: 'comp-101',
      slug: 'dewali-shree-2026',
      name: 'Dewali Shree 2026',
      competitionType: 'Bodybuilding',
      venue: 'Shivaji Stadium, Pune',
      eventDate: new Date('2026-12-15T09:00:00Z'),
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      categories: [
        {
          id: 'cat-1',
          name: "Men's Bodybuilding",
          gender: 'MALE',
          categoryType: 'WEIGHT',
          groups: [
            { id: 'grp-under-65', name: 'Below 65kg' },
            { id: 'grp-above-65', name: 'Above 65kg' },
          ],
        },
      ],
    });

    // Add 8 eligible candidates with trunk numbers 1 to 8
    for (let i = 1; i <= 8; i++) {
      mockRegistrations.push({
        id: `reg-${i}`,
        competitionId: 'comp-101',
        categoryId: 'cat-1',
        groupId: 'grp-under-65',
        participantName: `Athlete ${i}`,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: i,
        gymName: `Gold Gym ${i}`,
        district: 'Pune',
      });
    }
  });

  // -------------------------------------------------------------
  // 1. JUDGE MANAGEMENT
  // -------------------------------------------------------------
  it('1. Admin can create, view, edit, and deactivate judges', async () => {
    // Create judge 1
    const judge1 = await createJudge({
      name: 'Vikram Shinde',
      email: 'vikram@example.com',
      phone: '9876543210',
      city: 'Pune',
      designation: 'Chief Judge',
    });
    assert.equal(judge1.name, 'Vikram Shinde');
    assert.equal(judge1.designation, 'Chief Judge');
    assert.equal(judge1.isActive, true);

    // Create judge 2
    const judge2 = await createJudge({
      name: 'Rohit Kadam',
      phone: '9123456789',
      designation: 'Judge',
    });
    assert.equal(judge2.name, 'Rohit Kadam');

    // List judges
    const allJudges = await listJudges();
    assert.equal(allJudges.length, 2);

    // Edit judge 1
    const updated1 = await updateJudge(judge1.id, {
      designation: 'International Chief Judge',
      city: 'Mumbai',
    });
    assert.equal(updated1.designation, 'International Chief Judge');
    assert.equal(updated1.city, 'Mumbai');

    // Deactivate judge 2
    await updateJudge(judge2.id, { isActive: false });
    const activeJudges = await listJudges({ activeOnly: true });
    assert.equal(activeJudges.length, 1);
    assert.equal(activeJudges[0].id, judge1.id);
  });

  it('2. Judge creation rejects invalid names or invalid email addresses', async () => {
    await assert.rejects(
      async () => createJudge({ name: '' }),
      (err) => err.statusCode === 400
    );

    await assert.rejects(
      async () => createJudge({ name: 'Valid Name', email: 'invalid-email-format' }),
      (err) => err.statusCode === 400
    );
  });

  // -------------------------------------------------------------
  // 2. START COMPETITION & TEMPORARY SESSION LINK
  // -------------------------------------------------------------
  it('3. Starts competition only if published, registration is closed and not completed', async () => {
    // Try on competition with OPEN registration
    mockCompetitions.push({
      id: 'comp-open',
      name: 'Open Competition',
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: false,
    });
    await assert.rejects(
      async () => startJudgingSession('comp-open'),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /registration has closed/);
        return true;
      }
    );

    // Try on COMPLETED competition
    mockCompetitions.push({
      id: 'comp-completed',
      name: 'Completed Competition',
      isPublished: true,
      isCompleted: true,
      isRegistrationClosed: true,
    });
    await assert.rejects(
      async () => startJudgingSession('comp-completed'),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /completed competition/);
        return true;
      }
    );

    // Eligible competition starts successfully and generates temporary token
    const session = await startJudgingSession('comp-101', { durationHours: 24 });
    assert.ok(session.token);
    assert.equal(session.status, 'ACTIVE');
    assert.equal(session.competitionId, 'comp-101');
    assert.ok(new Date(session.expiresAt) > new Date());
  });

  it('does not show or start judging before trunk numbers are assigned', async () => {
    mockCompetitions.push({
      id: 'comp-awaiting-numbers',
      name: 'Awaiting Trunk Numbers',
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      categories: [],
    });
    mockRegistrations.push({
      id: 'reg-awaiting-number',
      competitionId: 'comp-awaiting-numbers',
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      trunkNumber: null,
    });

    const listed = await listEligibleJudgingCompetitions();
    assert.equal(listed.some((comp) => comp.id === 'comp-awaiting-numbers'), false);
    await assert.rejects(
      () => startJudgingSession('comp-awaiting-numbers'),
      /Assign trunk numbers/
    );
  });

  it('4. Temporary session link can be validated and revoked', async () => {
    const session = await startJudgingSession('comp-101', { durationHours: 12 });

    // Validate link
    const sessionData = await getJudgingSessionByToken(session.token);
    assert.equal(sessionData.competition.id, 'comp-101');
    assert.equal(sessionData.session.status, 'ACTIVE');

    // Revoke link
    await revokeJudgingSession(session.id);

    // Validating revoked token throws 403
    await assert.rejects(
      async () => getJudgingSessionByToken(session.token),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /revoked/i);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // 3. JUDGE IDENTIFICATION & DASHBOARD
  // -------------------------------------------------------------
  it('5. Judge identifies securely from shared link without username/password', async () => {
    const judge = await createJudge({ name: 'Sanjay Pawar', designation: 'Senior Judge' });
    const session = await startJudgingSession('comp-101');

    // Identify judge
    const identified = await identifyJudgeForSession(session.token, judge.id);
    assert.equal(identified.judge.id, judge.id);
    assert.equal(identified.judge.name, 'Sanjay Pawar');
    assert.equal(identified.competition.name, 'Dewali Shree 2026');
  });

  // -------------------------------------------------------------
  // 4. SEMIFINALIST SELECTION (ISOLATION BETWEEN JUDGES)
  // -------------------------------------------------------------
  it('6. Judges can select semifinalists independently with trunk numbers displayed', async () => {
    const judgeA = await createJudge({ name: 'Judge Alpha' });
    const judgeB = await createJudge({ name: 'Judge Beta' });
    const session = await startJudgingSession('comp-101');

    // Load category data
    const catData = await getCategoryJudgingData({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
    });
    assert.equal(catData.participants.length, 8);
    assert.equal(catData.participants[0].trunkNumber, 1);
    assert.equal(catData.participants[7].trunkNumber, 8);

    // Judge A selects 5 semifinalists: 1, 2, 3, 4, 5
    const resA = await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
      selectedRegistrationIds: ['reg-1', 'reg-2', 'reg-3', 'reg-4', 'reg-5'],
    });
    assert.equal(resA.count, 5);

    // Judge B selects 5 different semifinalists: 3, 4, 6, 7, 8
    const resB = await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judgeB.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
      selectedRegistrationIds: ['reg-3', 'reg-4', 'reg-6', 'reg-7', 'reg-8'],
    });
    assert.equal(resB.count, 5);

    // Check isolation: Judge A's selections are unaffected by Judge B
    const judgeAData = await getCategoryJudgingData({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
    });
    assert.deepEqual(judgeAData.selectedRegistrationIds.sort(), [
      'reg-1',
      'reg-2',
      'reg-3',
      'reg-4',
      'reg-5',
    ]);

    const judgeBData = await getCategoryJudgingData({
      token: session.token,
      judgeId: judgeB.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
    });
    assert.deepEqual(judgeBData.selectedRegistrationIds.sort(), [
      'reg-3',
      'reg-4',
      'reg-6',
      'reg-7',
      'reg-8',
    ]);
  });

  // -------------------------------------------------------------
  // 5. RANKING PAGE & DUPLICATE RANK PREVENTION
  // -------------------------------------------------------------
  it('7. Ranking requires all selected semifinalists to receive unique ranks from 1 to N', async () => {
    const judge = await createJudge({ name: 'Chief Judge Nitin' });
    const session = await startJudgingSession('comp-101');

    // Select 5 semifinalists
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judge.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
      selectedRegistrationIds: ['reg-1', 'reg-2', 'reg-3', 'reg-4', 'reg-5'],
    });

    // 1. Attempt duplicate ranks (two athletes given rank 1) -> must fail
    await assert.rejects(
      async () =>
        saveJudgeRankings({
          token: session.token,
          judgeId: judge.id,
          categoryId: 'cat-1',
          groupId: 'grp-under-65',
          rankings: [
            { registrationId: 'reg-1', rank: 1 },
            { registrationId: 'reg-2', rank: 1 }, // Duplicate!
            { registrationId: 'reg-3', rank: 3 },
            { registrationId: 'reg-4', rank: 4 },
            { registrationId: 'reg-5', rank: 5 },
          ],
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Duplicate rank/i);
        return true;
      }
    );

    // 2. Attempt rank out of range (rank 6 when only 5 selected) -> must fail
    await assert.rejects(
      async () =>
        saveJudgeRankings({
          token: session.token,
          judgeId: judge.id,
          categoryId: 'cat-1',
          groupId: 'grp-under-65',
          rankings: [
            { registrationId: 'reg-1', rank: 1 },
            { registrationId: 'reg-2', rank: 2 },
            { registrationId: 'reg-3', rank: 3 },
            { registrationId: 'reg-4', rank: 4 },
            { registrationId: 'reg-5', rank: 6 }, // Out of range!
          ],
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /between 1 and 5/i);
        return true;
      }
    );

    // 3. Attempt ranking only 4 out of 5 selected semifinalists -> must fail
    await assert.rejects(
      async () =>
        saveJudgeRankings({
          token: session.token,
          judgeId: judge.id,
          categoryId: 'cat-1',
          groupId: 'grp-under-65',
          rankings: [
            { registrationId: 'reg-1', rank: 1 },
            { registrationId: 'reg-2', rank: 2 },
            { registrationId: 'reg-3', rank: 3 },
            { registrationId: 'reg-4', rank: 4 },
          ],
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /All 5 selected semifinalists must be ranked/i);
        return true;
      }
    );

    // 4. Valid unique ranks 1..5 -> succeeds!
    const validResult = await saveJudgeRankings({
      token: session.token,
      judgeId: judge.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
      rankings: [
        { registrationId: 'reg-1', rank: 2 },
        { registrationId: 'reg-2', rank: 1 },
        { registrationId: 'reg-3', rank: 4 },
        { registrationId: 'reg-4', rank: 3 },
        { registrationId: 'reg-5', rank: 5 },
      ],
    });
    assert.equal(validResult.count, 5);
    assert.equal(validResult.rankings[0].rank, 1);
    assert.equal(validResult.rankings[0].registration.participantName, 'Athlete 2');

    // 5. Verify persistence on page refresh / return
    const refreshedData = await getCategoryJudgingData({
      token: session.token,
      judgeId: judge.id,
      categoryId: 'cat-1',
      groupId: 'grp-under-65',
    });
    assert.equal(refreshedData.rankings.length, 5);
    assert.equal(
      refreshedData.rankings.find((r) => r.registrationId === 'reg-2')?.rank,
      1
    );
  });

  it('5. Synchronized category sequence: starts strictly with 40–45 kg for all judges', async () => {
    const rawCategories = [
      { id: 'cat-75', name: '75–85 kg', sortOrder: 3 },
      { id: 'cat-55', name: '55–65 kg', sortOrder: 1 },
      { id: 'cat-40', name: '40–45 kg', sortOrder: 0 },
      { id: 'cat-65', name: '65–75 kg', sortOrder: 2 },
    ];

    const sorted = sortJudgingCategories(rawCategories);
    assert.equal(sorted[0].name, '40–45 kg');
    assert.equal(sorted[1].name, '55–65 kg');
    assert.equal(sorted[2].name, '65–75 kg');
    assert.equal(sorted[3].name, '75–85 kg');
  });

  it('6. Independent judge progression: each judge moves to next category independently without waiting for others', async () => {
    // Setup competition with two categories: 40-45 kg and 55-65 kg
    const comp = {
      id: 'comp-progression-test',
      slug: 'progression-championship',
      name: 'Progression Championship',
      competitionType: 'Bodybuilding',
      venue: 'Gym Hub',
      eventDate: new Date('2026-12-01'),
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      categories: [
        { id: 'cat-40-prog', name: '40–45 kg', sortOrder: 0 },
        { id: 'cat-55-prog', name: '55–65 kg', sortOrder: 1 },
      ],
    };
    mockCompetitions.push(comp);

    // Setup 2 active judges: Judge A and Judge B
    const judgeA = await createJudge({ name: 'Judge Alpha', email: 'alpha@gbz.com' });
    const judgeB = await createJudge({ name: 'Judge Beta', email: 'beta@gbz.com' });

    // Setup 2 contestants in 40-45 kg
    mockRegistrations.push(
      {
        id: 'reg-prog-1',
        competitionId: comp.id,
        categoryId: 'cat-40-prog',
        participantName: 'Contestant 1',
        trunkNumber: 1,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
      {
        id: 'reg-prog-2',
        competitionId: comp.id,
        categoryId: 'cat-40-prog',
        participantName: 'Contestant 2',
        trunkNumber: 2,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      }
    );

    const session = await startJudgingSession(comp.id);

    // Initial progression check for Judge A
    const initialProgA = await getSessionProgression({
      token: session.token,
      judgeId: judgeA.id,
    });

    // Verify 40-45 kg is first and IN_PROGRESS, second category is LOCKED
    assert.equal(initialProgA.categories[0].name, '40–45 kg');
    assert.equal(initialProgA.categories[0].status, 'IN_PROGRESS');
    assert.equal(initialProgA.categories[1].status, 'LOCKED');
    assert.equal(initialProgA.currentActiveCategoryId, 'cat-40-prog');
    assert.equal(initialProgA.waitingForOtherJudges, false);

    // Judge A selects semifinalists and ranks 40-45 kg
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-prog',
      selectedRegistrationIds: ['reg-prog-1', 'reg-prog-2'],
    });

    await saveJudgeRankings({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-prog',
      rankings: [
        { registrationId: 'reg-prog-1', rank: 1 },
        { registrationId: 'reg-prog-2', rank: 2 },
      ],
    });

    // Judge A submits winner titles (Final Submit for 40-45 kg)
    const winnerRes = await saveJudgeWinnerTitles({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-prog',
      winnerTitles: [
        { registrationId: 'reg-prog-1', title: 'Best Poser' },
        { registrationId: 'reg-prog-2', title: 'Most Improved Body Builder' },
      ],
    });
    assert.equal(winnerRes.categoryEvaluationSubmitted, true);

    // Progression check for Judge A after final submitting:
    // INDEPENDENT PROGRESSION: Judge A does NOT wait for Judge B!
    // Category 1 is COMPLETED for Judge A, and Category 2 is immediately IN_PROGRESS!
    const progAfterJudgeASubmits = await getSessionProgression({
      token: session.token,
      judgeId: judgeA.id,
    });
    assert.equal(progAfterJudgeASubmits.categories[0].status, 'COMPLETED');
    assert.equal(progAfterJudgeASubmits.categories[1].status, 'IN_PROGRESS');
    assert.equal(progAfterJudgeASubmits.currentActiveCategoryId, 'cat-55-prog');
    assert.equal(progAfterJudgeASubmits.waitingForOtherJudges, false);

    // Meanwhile, Judge B has NOT submitted yet, so Judge B is still on Category 1!
    const progJudgeB = await getSessionProgression({
      token: session.token,
      judgeId: judgeB.id,
    });
    assert.equal(progJudgeB.categories[0].status, 'IN_PROGRESS');
    assert.equal(progJudgeB.categories[1].status, 'LOCKED');
    assert.equal(progJudgeB.currentActiveCategoryId, 'cat-40-prog');
    assert.equal(progJudgeB.waitingForOtherJudges, false);
  });

  it('7. View Judge Results: returns individual submissions, rankings and winner selections for each judge', async () => {
    const comp = {
      id: 'comp-results-test',
      slug: 'results-championship',
      name: 'Results Championship',
      competitionType: 'Bodybuilding',
      venue: 'Gym Hub',
      eventDate: new Date('2026-12-01'),
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      categories: [
        { id: 'cat-40-res', name: '40–45 kg', sortOrder: 0 },
        { id: 'cat-55-res', name: '55–65 kg', sortOrder: 1 },
      ],
    };
    mockCompetitions.push(comp);

    const judgeA = await createJudge({ name: 'Judge Results Alpha', email: 'alpha.res@gbz.com' });
    const judgeB = await createJudge({ name: 'Judge Results Beta', email: 'beta.res@gbz.com' });

    mockRegistrations.push(
      {
        id: 'reg-res-1',
        competitionId: comp.id,
        categoryId: 'cat-40-res',
        participantName: 'Athlete Winner 1',
        trunkNumber: 10,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
      {
        id: 'reg-res-2',
        competitionId: comp.id,
        categoryId: 'cat-40-res',
        participantName: 'Athlete Poser 2',
        trunkNumber: 20,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      }
    );

    const session = await startJudgingSession(comp.id);

    // Judge A selects semifinalists, ranks, and assigns winner titles
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-res',
      selectedRegistrationIds: ['reg-res-1', 'reg-res-2'],
    });

    await saveJudgeRankings({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-res',
      rankings: [
        { registrationId: 'reg-res-1', rank: 1 },
        { registrationId: 'reg-res-2', rank: 2 },
      ],
    });

    await saveJudgeWinnerTitles({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-40-res',
      winnerTitles: [
        { registrationId: 'reg-res-1', title: 'Best Poser' },
        { registrationId: 'reg-res-2', title: 'Most Improved Body Builder' },
      ],
    });

    const resultsData = await getSessionJudgeResults(session.id);
    assert.ok(resultsData.judgeResults.length >= 2);
    assert.equal(resultsData.overallProgress.totalCategories, 2);

    const judgeAResult = resultsData.judgeResults.find((j) => j.judge.id === judgeA.id);
    assert.ok(judgeAResult);
    assert.equal(judgeAResult.submittedCategoriesCount, 1);

    const cat40Eval = judgeAResult.categoryEvaluations.find((c) => c.categoryId === 'cat-40-res');
    assert.ok(cat40Eval);
    assert.equal(cat40Eval.isSubmitted, true);
    assert.equal(cat40Eval.rankings.length, 2);
    assert.equal(cat40Eval.winners.length, 2);
    assert.equal(cat40Eval.winners.find((w) => w.title === 'Best Poser')?.trunkNumber, 10);
    assert.equal(cat40Eval.winners.find((w) => w.title === 'Most Improved Body Builder')?.trunkNumber, 20);
  });

  it('8. Delete Judge preserves historical results, session completes when all judges submit, and gym name is formatted correctly', async () => {
    // 1. Gym / Club name formatting test
    const comp = {
      id: 'comp-del-test',
      name: 'Gold Body Zone Championship',
      competitionType: 'DISTRICT',
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      eventDate: new Date('2026-12-10'),
      venue: 'GBZ Arena',
      categories: [
        { id: 'cat-del-1', name: '40–45 kg', sortOrder: 1 },
      ],
    };
    mockCompetitions.push(comp);

    const judge1 = await createJudge({ name: 'Judge One', designation: 'Official Judge' });
    const judge2 = await createJudge({ name: 'Judge Two', designation: 'Panel Judge' });
    const judgeUnused = await createJudge({ name: 'Judge Unused', designation: 'Guest' });

    mockRegistrations.push(
      {
        id: 'reg-gym',
        competitionId: comp.id,
        categoryId: 'cat-del-1',
        participantName: 'Gym Member',
        trunkNumber: 1,
        representingType: 'GYM',
        gymName: 'Iron Paradise Fitness',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
      {
        id: 'reg-indiv',
        competitionId: comp.id,
        categoryId: 'cat-del-1',
        participantName: 'Independent Bodybuilder',
        trunkNumber: 2,
        representingType: 'INDIVIDUAL',
        gymName: 'Other / Individual',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      }
    );

    const session = await startJudgingSession(comp.id);

    // Verify category judging data formats gym/club accurately
    const catData = await getCategoryJudgingData({
      token: session.token,
      judgeId: judge1.id,
      categoryId: 'cat-del-1',
    });
    const gymCand = catData.participants.find((p) => p.id === 'reg-gym');
    const indivCand = catData.participants.find((p) => p.id === 'reg-indiv');
    assert.equal(gymCand.gymName, 'Iron Paradise Fitness');
    assert.equal(indivCand.gymName, 'Individual');

    // Delete unused judge without history -> hard deletes
    const deleteUnusedRes = await deleteJudge(judgeUnused.id);
    assert.equal(deleteUnusedRes.deleted, true);

    // Judge 1 submits category evaluation
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judge1.id,
      categoryId: 'cat-del-1',
      selectedRegistrationIds: ['reg-gym', 'reg-indiv'],
    });
    await saveJudgeRankings({
      token: session.token,
      judgeId: judge1.id,
      categoryId: 'cat-del-1',
      rankings: [
        { registrationId: 'reg-gym', rank: 1 },
        { registrationId: 'reg-indiv', rank: 2 },
      ],
    });
    await saveJudgeWinnerTitles({
      token: session.token,
      judgeId: judge1.id,
      categoryId: 'cat-del-1',
      winnerTitles: [
        { registrationId: 'reg-gym', title: 'Best Poser' },
      ],
    });

    // Delete judge1 who has historical evaluations -> deactivates and preserves history
    const deleteWithHistoryRes = await deleteJudge(judge1.id);
    assert.equal(deleteWithHistoryRes.deleted, true);
    assert.equal(deleteWithHistoryRes.preservedHistory, true);

    // Historical results for judge1 remain completely intact in results endpoint
    const midResults = await getSessionJudgeResults(session.id);
    const judge1InResults = midResults.judgeResults.find((j) => j.judge.id === judge1.id);
    assert.ok(judge1InResults);
    assert.equal(judge1InResults.submittedCategoriesCount, 1);
    assert.equal(judge1InResults.categoryEvaluations[0].winners[0].title, 'Best Poser');
    assert.equal(judge1InResults.categoryEvaluations[0].winners[0].gymName, 'Iron Paradise Fitness');

    // Judge 2 submits -> ALL judges have submitted ALL categories -> session marked COMPLETED
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judge2.id,
      categoryId: 'cat-del-1',
      selectedRegistrationIds: ['reg-gym', 'reg-indiv'],
    });
    await saveJudgeRankings({
      token: session.token,
      judgeId: judge2.id,
      categoryId: 'cat-del-1',
      rankings: [
        { registrationId: 'reg-gym', rank: 2 },
        { registrationId: 'reg-indiv', rank: 1 },
      ],
    });
    await saveJudgeWinnerTitles({
      token: session.token,
      judgeId: judge2.id,
      categoryId: 'cat-del-1',
      winnerTitles: [
        { registrationId: 'reg-indiv', title: 'Most Improved Body Builder' },
      ],
    });

    // Check session status is marked COMPLETED
    const sessionInDb = mockSessions.find((s) => s.id === session.id);
    assert.equal(sessionInDb.status, 'COMPLETED');
  });

  it('16. Winner Selection Bug Fix & Automatic Judging Status Lifecycle', async () => {
    // 1. Setup competition ready for judging
    const compId = 'comp-status-lifecycle';
    const comp = {
      id: compId,
      name: 'Status Lifecycle Championship',
      competitionType: "Men's Physique",
      registrationFee: 500,
      venue: 'Main Arena',
      eventDate: new Date('2026-12-25'),
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      categories: [
        { id: 'cat-life-1', name: '40–45 kg', gender: 'MALE', sortOrder: 1, groups: [] },
      ],
      registrations: [
        {
          id: 'reg-c1',
          competitionId: compId,
          categoryId: 'cat-life-1',
          participantName: 'Arjun Athlete',
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: 1,
        },
        {
          id: 'reg-c2',
          competitionId: compId,
          categoryId: 'cat-life-1',
          participantName: 'Bala Boxer',
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: 2,
        },
      ],
      judgingSessions: [],
    };
    mockCompetitions.push(comp);
    mockRegistrations.push(...comp.registrations);

    const judgeA = await createJudge({ name: 'Judge Alpha', isActive: true });

    // Initial state: No session started -> Status must be 'Judging Not Started'
    let comps = await listEligibleJudgingCompetitions();
    let currentComp = comps.find((c) => c.id === compId);
    assert.ok(currentComp);
    assert.equal(currentComp.judgingStatus, 'Judging Not Started');

    // 2. Admin starts competition session
    const session1 = await startJudgingSession(compId, { durationHours: 24 });
    assert.equal(session1.status, 'ACTIVE');

    // After start session -> Status must be 'Judging In Progress'
    comps = await listEligibleJudgingCompetitions();
    currentComp = comps.find((c) => c.id === compId);
    assert.equal(currentComp.judgingStatus, 'Judging In Progress');

    // 3. Panel Judge identifies and completes semifinalists + rankings
    await saveJudgeSemifinalistSelections({
      token: session1.token,
      judgeId: judgeA.id,
      categoryId: 'cat-life-1',
      selectedRegistrationIds: ['reg-c1', 'reg-c2'],
    });

    await saveJudgeRankings({
      token: session1.token,
      judgeId: judgeA.id,
      categoryId: 'cat-life-1',
      rankings: [
        { registrationId: 'reg-c1', rank: 1 },
        { registrationId: 'reg-c2', rank: 2 },
      ],
    });

    // CRITICAL: Saving rankings alone MUST NOT submit category or complete session
    const progAfterRankings = await getSessionProgression({
      token: session1.token,
      judgeId: judgeA.id,
    });
    const catProg = progAfterRankings.categories.find((c) => c.id === 'cat-life-1');
    assert.equal(catProg.isSubmittedByCurrentJudge, false, 'Category must NOT be marked submitted after only saving rankings');
    assert.equal(catProg.status, 'IN_PROGRESS', 'Category must remain IN_PROGRESS so judge can select winners');
    assert.equal(progAfterRankings.allCategoriesCompleted, false, 'All categories must NOT be marked completed before winner submit');

    // Session status must still be 'Judging In Progress'
    comps = await listEligibleJudgingCompetitions();
    currentComp = comps.find((c) => c.id === compId);
    assert.equal(currentComp.judgingStatus, 'Judging In Progress');

    // 4. Judge explicitly clicks Final Submit with Winner Titles
    await saveJudgeWinnerTitles({
      token: session1.token,
      judgeId: judgeA.id,
      categoryId: 'cat-life-1',
      winnerTitles: [
        { registrationId: 'reg-c1', title: 'Best Poser' },
      ],
    });

    // If other judges exist in mockJudges, complete them too to test full completion
    const otherActiveJudges = mockJudges.filter((j) => j.isActive && j.id !== judgeA.id);
    for (const otherJ of otherActiveJudges) {
      await saveJudgeSemifinalistSelections({
        token: session1.token,
        judgeId: otherJ.id,
        categoryId: 'cat-life-1',
        selectedRegistrationIds: ['reg-c1', 'reg-c2'],
      });
      await saveJudgeRankings({
        token: session1.token,
        judgeId: otherJ.id,
        categoryId: 'cat-life-1',
        rankings: [
          { registrationId: 'reg-c1', rank: 1 },
          { registrationId: 'reg-c2', rank: 2 },
        ],
      });
      await saveJudgeWinnerTitles({
        token: session1.token,
        judgeId: otherJ.id,
        categoryId: 'cat-life-1',
        winnerTitles: [
          { registrationId: 'reg-c1', title: 'Best Poser' },
        ],
      });
    }

    // Now ALL assigned judges have submitted ALL categories -> Status must be 'Evaluation Done'
    comps = await listEligibleJudgingCompetitions();
    currentComp = comps.find((c) => c.id === compId);
    assert.equal(currentComp.judgingStatus, 'Evaluation Done');
    assert.equal(currentComp.activeJudgingSession.status, 'COMPLETED');

    // 5. Start a new evaluation session (Requirement 10)
    const session2 = await startJudgingSession(compId, { durationHours: 24 });
    assert.equal(session2.status, 'ACTIVE');
    const s2InDb = mockSessions.find((s) => s.id === session2.id);
    if (s2InDb) s2InDb.createdAt = new Date(Date.now() + 1000);

    // Historical session1 MUST remain COMPLETED in the database
    const oldSession = mockSessions.find((s) => s.id === session1.id);
    assert.equal(oldSession.status, 'COMPLETED');

    // New evaluation has 0 submissions -> Status must transition back to 'Judging In Progress'
    comps = await listEligibleJudgingCompetitions();
    currentComp = comps.find((c) => c.id === compId);
    assert.equal(currentComp.judgingStatus, 'Judging In Progress');
  });

  it('generates separate unique judging links for each judge with automatic identification and independent submissions', async () => {
    const compId = 'comp-sep-links-test';
    mockCompetitions.push({
      id: compId,
      name: 'Separate Links Championship',
      competitionType: 'DISTRICT',
      eventDate: new Date('2026-12-25'),
      venue: 'Nashik Sports Arena',
      registrationFee: 500,
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true,
      categories: [
        {
          id: 'cat-sep-1',
          name: 'Men 55-60 kg',
          sortOrder: 1,
          groups: [],
        },
      ],
    });

    // Create 2 judges specifically assigned to this competition
    const judgeA = await createJudge({
      name: 'Anil Deshmukh',
      phone: '9876543210',
      city: 'Pune',
      competitionId: compId,
    });
    const judgeB = await createJudge({
      name: 'Babanrao Shinde',
      phone: '9876543211',
      city: 'Nashik',
      competitionId: compId,
    });

    mockRegistrations.push({
      id: 'reg-sep-1',
      competitionId: compId,
      categoryId: 'cat-sep-1',
      participantName: 'Suresh Patil',
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      trunkNumber: 1,
    });

    // Start competition session
    const session = await startJudgingSession(compId, { durationHours: 24 });
    assert.equal(session.status, 'ACTIVE');

    // 1. Verify access tokens are unique and deterministic per judge
    const tokenA = generateJudgeAccessToken(session.token, judgeA.id);
    const tokenB = generateJudgeAccessToken(session.token, judgeB.id);
    assert.ok(tokenA && tokenB);
    assert.notEqual(tokenA, tokenB);

    // 2. Fetch workspace and check assignedJudges have accessKey
    const workspace = await getCompetitionJudgingWorkspace(compId);
    const wsJudgeA = workspace.assignedJudges.find((j) => j.id === judgeA.id);
    const wsJudgeB = workspace.assignedJudges.find((j) => j.id === judgeB.id);
    assert.equal(wsJudgeA.accessKey, tokenA);
    assert.equal(wsJudgeB.accessKey, tokenB);

    // 3. Opening judgeA's unique link auto-identifies judgeA and isolates their view
    const sessionForA = await getJudgingSessionByToken(session.token, {
      judgeId: judgeA.id,
      key: tokenA,
    });
    assert.equal(sessionForA.identifiedJudge.id, judgeA.id);
    assert.equal(sessionForA.identifiedJudge.name, 'Anil Deshmukh');
    // Judges list is restricted to only judgeA
    assert.equal(sessionForA.judges.length, 1);
    assert.equal(sessionForA.judges[0].id, judgeA.id);

    // 4. Tampering with access key is rejected
    await assert.rejects(
      async () => {
        await getJudgingSessionByToken(session.token, {
          judgeId: judgeA.id,
          key: 'tampered-key-1234',
        });
      },
      { message: 'Invalid or unauthorized judge access key.' }
    );

    // 5. Inactive or unknown judge ID is rejected
    await assert.rejects(
      async () => {
        await getJudgingSessionByToken(session.token, {
          judgeId: 'non-existent-judge-id',
        });
      },
      { message: 'Judge profile not found or is currently inactive.' }
    );

    // 6. Submissions for judgeA do not affect judgeB
    await saveJudgeSemifinalistSelections({
      token: session.token,
      judgeId: judgeA.id,
      categoryId: 'cat-sep-1',
      selectedRegistrationIds: ['reg-sep-1'],
    });

    const progA = await getSessionProgression({ token: session.token, judgeId: judgeA.id });
    const progB = await getSessionProgression({ token: session.token, judgeId: judgeB.id });
    // Both progress independently
    assert.ok(progA);
    assert.ok(progB);

    // 7. Revoking session invalidates access for all judges
    await revokeJudgingSession(session.id);
    await assert.rejects(
      async () => {
        await getJudgingSessionByToken(session.token, {
          judgeId: judgeA.id,
          key: tokenA,
        });
      },
      { message: 'This judging session link has been revoked by the administrator.' }
    );
  });
});
