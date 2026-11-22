import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createCompetition, toggleCompetitionCompletion } from '../src/controllers/admin.controller.js';

const originalPrisma = globalThis.__prisma;
after(() => { globalThis.__prisma = originalPrisma; });

async function invoke(controller, body, id = 'event-1') {
  let result;
  let error;
  const res = {
    status(code) { result = { status: code }; return this; },
    json(data) { result = { ...result, ...data }; return this; },
  };
  await controller({ params: { id }, body }, res, (err) => { error = err; });
  return { result, error };
}

describe('competition lifecycle', () => {
  it('makes a newly created competition public immediately', async () => {
    let createdData;
    globalThis.__prisma = {
      competition: {
        async create({ data }) {
          createdData = data;
          return { id: 'event-1', ...data, categories: [], registrations: [] };
        },
      },
    };
    const { result, error } = await invoke(createCompetition, {
      name: 'Nashik Championship', competitionType: 'Bodybuilding',
      categories: [], isPublished: false,
    });
    assert.equal(error, undefined);
    assert.equal(result.status, 201);
    assert.equal(createdData.isPublished, true);
    assert.ok(createdData.publishedAt instanceof Date);
    assert.equal(result.competition.status, 'PUBLISHED');
  });

  it('keeps an event in Judging until evaluation is complete', async () => {
    const competition = {
      id: 'event-1', name: 'Nashik Championship', competitionType: 'Bodybuilding',
      isPublished: true, isRegistrationClosed: true, isCompleted: false,
    };
    let judgingFinished = false;
    globalThis.__prisma = {
      competition: {
        async findUnique() { return competition; },
        async update({ data }) { return { ...competition, ...data, categories: [], registrations: [] }; },
      },
      registration: { async count() { return 2; } },
      judgingSession: { async findFirst() { return judgingFinished ? { status: 'COMPLETED' } : null; } },
    };

    const premature = await invoke(toggleCompetitionCompletion, { isCompleted: true });
    assert.match(premature.error?.message || '', /Finish judging/);
    assert.equal(premature.result, undefined);

    judgingFinished = true;
    const finished = await invoke(toggleCompetitionCompletion, { isCompleted: true });
    assert.equal(finished.error, undefined);
    assert.equal(finished.result.competition.status, 'COMPLETED');
    assert.equal(finished.result.competition.isPublished, false);
  });
});
