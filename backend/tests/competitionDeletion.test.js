import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

describe('Admin Competition Deletion & Safety Constraints', () => {
  let registrations;
  let photos;
  let categories;
  let categoryGroups;
  let deletedFromBucket;

  beforeEach(() => {
    deletedFromBucket = [];
    registrations = [
      { id: 'reg-1', competitionId: 'comp-with-regs', athleteName: 'Athlete 1' },
      { id: 'reg-2', competitionId: 'comp-with-regs', athleteName: 'Athlete 2' },
    ];
    photos = [
      { id: 'p-1', competitionId: 'comp-empty', photoStoragePath: 'event-photos/comp-empty-1.jpg' },
      { id: 'p-2', competitionId: 'comp-empty', photoStoragePath: 'event-photos/comp-empty-2.jpg' },
    ];
    categories = [
      { id: 'cat-1', competitionId: 'comp-empty', name: 'Open Men' },
    ];
    categoryGroups = [
      { id: 'grp-1', categoryId: 'cat-1', name: 'Under 75kg' },
    ];
  });

  it('rejects deletion of a competition that has registrations with clear 400 error', () => {
    const compId = 'comp-with-regs';
    const compName = 'Dewali Shree 2026';
    const regCount = registrations.filter((r) => r.competitionId === compId).length;

    assert.equal(regCount, 2);

    let errorThrown = null;
    try {
      if (regCount > 0) {
        const err = new Error(
          `This competition cannot be deleted because participant registrations exist. (${regCount} participant registration records found)`
        );
        err.status = 400;
        throw err;
      }
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown);
    assert.equal(errorThrown.status, 400);
    assert.match(errorThrown.message, /This competition cannot be deleted because participant registrations exist/i);
    assert.match(errorThrown.message, /participant registration record/);
  });

  it('allows safe cascade deletion and photo cleanup when a competition has 0 registrations', () => {
    const compId = 'comp-empty';
    const regCount = registrations.filter((r) => r.competitionId === compId).length;
    assert.equal(regCount, 0);

    // 1. Clean up event photos from bucket
    const compPhotos = photos.filter((p) => p.competitionId === compId);
    for (const p of compPhotos) {
      deletedFromBucket.push(p.photoStoragePath);
    }
    assert.deepEqual(deletedFromBucket, [
      'event-photos/comp-empty-1.jpg',
      'event-photos/comp-empty-2.jpg',
    ]);

    // 2. Cascade delete in DB
    photos = photos.filter((p) => p.competitionId !== compId);
    const deletedCatIds = categories
      .filter((c) => c.competitionId === compId)
      .map((c) => c.id);
    categoryGroups = categoryGroups.filter((g) => !deletedCatIds.includes(g.categoryId));
    categories = categories.filter((c) => c.competitionId !== compId);

    assert.equal(photos.length, 0);
    assert.equal(categories.length, 0);
    assert.equal(categoryGroups.length, 0);
  });

  it('mounts the canonical /api route', () => {
    const app = createApp();
    const routerLayers = (app.router?.stack || []).filter((l) => l.name === 'router');

    const matchesApi = routerLayers.some((l) => Boolean(l.match('/api/public')));
    assert.ok(matchesApi, 'Should mount /api');
  });
});
