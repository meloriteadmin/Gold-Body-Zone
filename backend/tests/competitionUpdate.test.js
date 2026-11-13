import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

function buildCompetitionState() {
  const competitions = new Map();
  const categories = new Map();
  const registrations = new Map();
  const payments = new Map();
  let nextCatSeq = 1;

  function seed() {
    competitions.clear();
    categories.clear();
    registrations.clear();
    payments.clear();
    nextCatSeq = 1;

    competitions.set('comp-1', {
      id: 'comp-1',
      slug: 'state-bodybuilding',
      name: 'State Bodybuilding Championship',
      competitionType: 'Bodybuilding',
      description: 'Annual championship',
      venue: 'Mumbai',
      eventDate: new Date('2026-12-15T00:00:00Z'),
      registrationDeadline: new Date('2026-12-10T00:00:00Z'),
      registrationFee: 1000,
      maxParticipants: 200,
      genderEligibility: 'ALL',
      ageEligibility: null,
      posterUrl: null,
      posterStoragePath: null,
      isPublished: true,
      isDefault: false,
      publishedAt: new Date('2026-11-01T00:00:00Z'),
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    });

    categories.set('cat-used', {
      id: 'cat-used',
      competitionId: 'comp-1',
      categoryType: 'WEIGHT',
      gender: 'MALE',
      name: '65-75 kg',
      ruleNote: null,
      sortOrder: 1,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    });

    categories.set('cat-unused', {
      id: 'cat-unused',
      competitionId: 'comp-1',
      categoryType: 'WEIGHT',
      gender: 'FEMALE',
      name: 'Open',
      ruleNote: null,
      sortOrder: 2,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    });

    registrations.set('reg-1', {
      id: 'reg-1',
      competitionId: 'comp-1',
      categoryId: 'cat-used',
      participantName: 'Aarav Sharma',
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    });

    payments.set('pay-1', {
      id: 'pay-1',
      registrationId: 'reg-1',
      amount: 1000,
      status: 'PAID',
      cashfreeOrderId: 'order_123',
      cashfreePaymentId: 'cf_pay_123',
    });
  }

  function createClient(store, counters) {
    return {
      competition: {
        async findUnique({ where }) {
          const item = store.competitions.get(where.id);
          return item ? { ...item } : null;
        },
        async update({ where, data, include }) {
          const item = store.competitions.get(where.id);
          if (!item) throw new Error('Competition not found');
          Object.assign(item, data, { updatedAt: new Date() });
          const cats = [...store.categories.values()]
            .filter((c) => c.competitionId === item.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => ({ ...c }));
          return {
            ...item,
            ...(include?.categories ? { categories: cats } : {}),
          };
        },
      },
      competitionCategory: {
        async findMany({ where }) {
          return [...store.categories.values()]
            .filter((c) => c.competitionId === where.competitionId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => ({
              ...c,
              _count: {
                registrations: [...store.registrations.values()].filter(
                  (r) => r.categoryId === c.id
                ).length,
              },
            }));
        },
        async update({ where, data }) {
          counters.updated += 1;
          const item = store.categories.get(where.id);
          if (!item) throw new Error(`Category not found: ${where.id}`);
          Object.assign(item, data, { updatedAt: new Date() });
          return { ...item };
        },
        async create({ data }) {
          counters.created += 1;
          const id = `cat-new-${nextCatSeq++}`;
          const created = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.categories.set(id, created);
          return { ...created };
        },
        async deleteMany({ where }) {
          counters.deleted += 1;
          const ids = where.id?.in || [];
          for (const id of ids) {
            const linkedRegs = [...store.registrations.values()].filter(
              (r) => r.categoryId === id
            );
            if (linkedRegs.length > 0) {
              throw new Error(
                'Foreign key constraint violated on: registrations_category_id_fkey'
              );
            }
            store.categories.delete(id);
          }
          return { count: ids.length };
        },
      },
    };
  }

  const counters = { updated: 0, created: 0, deleted: 0 };
  const baseStore = { competitions, categories, registrations, payments };

  const prismaMock = {
    ...createClient(baseStore, counters),
    async $transaction(fn) {
      // Snapshot for atomic rollback semantics on error
      const snapshot = {
        competitions: new Map(
          [...competitions.entries()].map(([k, v]) => [k, { ...v }])
        ),
        categories: new Map(
          [...categories.entries()].map(([k, v]) => [k, { ...v }])
        ),
        registrations: new Map(
          [...registrations.entries()].map(([k, v]) => [k, { ...v }])
        ),
        payments: new Map(
          [...payments.entries()].map(([k, v]) => [k, { ...v }])
        ),
      };
      const tx = createClient(snapshot, counters);
      const result = await fn(tx);
      // Commit snapshot back to live maps
      competitions.clear();
      categories.clear();
      registrations.clear();
      payments.clear();
      for (const [k, v] of snapshot.competitions) competitions.set(k, v);
      for (const [k, v] of snapshot.categories) categories.set(k, v);
      for (const [k, v] of snapshot.registrations) registrations.set(k, v);
      for (const [k, v] of snapshot.payments) payments.set(k, v);
      return result;
    },
  };

  return {
    seed,
    counters,
    competitions,
    categories,
    registrations,
    payments,
    prismaMock,
  };
}

const state = buildCompetitionState();
globalThis.__prisma = state.prismaMock;

const { updateCompetition } = await import(
  '../src/controllers/admin.controller.js'
);

async function invokeUpdate(id, body) {
  let statusCode = 200;
  let jsonBody = null;
  let capturedErr = null;

  const req = { params: { id }, body };
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      jsonBody = payload;
      return res;
    },
  };

  await updateCompetition(req, res, (err) => {
    capturedErr = err;
  });

  return { statusCode, jsonBody, err: capturedErr };
}

describe('Admin Competition Update & Category Synchronization', () => {
  beforeEach(() => {
    state.seed();
    state.counters.updated = 0;
    state.counters.created = 0;
    state.counters.deleted = 0;
  });

  it('updates competition name and registration fee without deleting or recreating unchanged categories', async () => {
    const { statusCode, jsonBody, err } = await invokeUpdate('comp-1', {
      name: 'State Bodybuilding Pro 2026',
      registrationFee: 1500,
      categories: [
        {
          id: 'cat-used',
          categoryType: 'WEIGHT',
          gender: 'MALE',
          name: '65-75 kg',
          ruleNote: null,
          sortOrder: 1,
        },
        {
          id: 'cat-unused',
          categoryType: 'WEIGHT',
          gender: 'FEMALE',
          name: 'Open',
          ruleNote: null,
          sortOrder: 2,
        },
      ],
    });

    assert.equal(err, null);
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.competition.name, 'State Bodybuilding Pro 2026');
    assert.equal(jsonBody.competition.registrationFee, 1500);
    assert.equal(state.counters.deleted, 0);
    assert.equal(state.counters.created, 0);
    assert.equal(state.counters.updated, 0);
    assert.equal(state.registrations.get('reg-1').categoryId, 'cat-used');
    assert.equal(state.payments.get('pay-1').status, 'PAID');
  });

  it('updates an existing category while preserving its ID and linked registration/payment', async () => {
    const { statusCode, jsonBody, err } = await invokeUpdate('comp-1', {
      categories: [
        {
          id: 'cat-used',
          categoryType: 'WEIGHT',
          gender: 'MALE',
          name: '65-75 kg (Updated)',
          ruleNote: 'Weigh-in at 7 AM',
          sortOrder: 1,
        },
        {
          id: 'cat-unused',
          categoryType: 'WEIGHT',
          gender: 'FEMALE',
          name: 'Open',
          ruleNote: null,
          sortOrder: 2,
        },
      ],
    });

    assert.equal(err, null);
    assert.equal(statusCode, 200);
    assert.equal(state.counters.updated, 1);
    assert.equal(state.counters.deleted, 0);
    assert.equal(
      state.categories.get('cat-used').name,
      '65-75 kg (Updated)'
    );
    assert.equal(
      jsonBody.competition.categories.find((c) => c.id === 'cat-used').name,
      '65-75 kg (Updated)'
    );
    assert.equal(state.registrations.get('reg-1').categoryId, 'cat-used');
    assert.equal(state.payments.get('pay-1').cashfreePaymentId, 'cf_pay_123');
  });

  it('adds a new category while preserving existing categories and registrations', async () => {
    const { statusCode, jsonBody, err } = await invokeUpdate('comp-1', {
      categories: [
        {
          id: 'cat-used',
          categoryType: 'WEIGHT',
          gender: 'MALE',
          name: '65-75 kg',
          ruleNote: null,
          sortOrder: 1,
        },
        {
          id: 'cat-unused',
          categoryType: 'WEIGHT',
          gender: 'FEMALE',
          name: 'Open',
          ruleNote: null,
          sortOrder: 2,
        },
        {
          categoryType: 'WEIGHT',
          gender: 'MALE',
          name: '75-85 kg',
          ruleNote: null,
          sortOrder: 3,
        },
      ],
    });

    assert.equal(err, null);
    assert.equal(statusCode, 200);
    assert.equal(state.counters.created, 1);
    assert.equal(jsonBody.competition.categories.length, 3);
    assert.ok(
      jsonBody.competition.categories.some((c) => c.name === '75-85 kg')
    );
    assert.equal(state.registrations.get('reg-1').categoryId, 'cat-used');
  });

  it('rejects removal of a category that has existing registrations and rolls back cleanly', async () => {
    const { err } = await invokeUpdate('comp-1', {
      name: 'Should Roll Back',
      categories: [
        {
          id: 'cat-unused',
          categoryType: 'WEIGHT',
          gender: 'FEMALE',
          name: 'Open',
          ruleNote: null,
          sortOrder: 1,
        },
      ],
    });

    assert.ok(err);
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /cannot remove category with existing registrations/i);
    assert.match(err.message, /65-75 kg/i);
    assert.equal(
      state.competitions.get('comp-1').name,
      'State Bodybuilding Championship'
    );
    assert.ok(state.categories.has('cat-used'));
    assert.equal(state.registrations.get('reg-1').categoryId, 'cat-used');
    assert.equal(state.payments.get('pay-1').status, 'PAID');
  });

  it('deletes an unused category without affecting categories that have registrations', async () => {
    const { statusCode, jsonBody, err } = await invokeUpdate('comp-1', {
      categories: [
        {
          id: 'cat-used',
          categoryType: 'WEIGHT',
          gender: 'MALE',
          name: '65-75 kg',
          ruleNote: null,
          sortOrder: 1,
        },
      ],
    });

    assert.equal(err, null);
    assert.equal(statusCode, 200);
    assert.equal(state.counters.deleted, 1);
    assert.equal(state.categories.has('cat-unused'), false);
    assert.equal(state.categories.has('cat-used'), true);
    assert.equal(jsonBody.competition.categories.length, 1);
    assert.equal(state.registrations.get('reg-1').categoryId, 'cat-used');
    assert.equal(state.payments.get('pay-1').status, 'PAID');
  });
});
