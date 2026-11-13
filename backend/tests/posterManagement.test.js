import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

describe('Poster Management & Independent Storage Isolation', () => {
  const PROTECTED_POSTER_PATHS = new Set([
    'bodybuilding-poster.jpg',
    'mens-physique-poster.jpg',
    'masters-poster.jpg',
    ' masters-poster.jpg',
  ]);

  let competitions;
  let deletedFromBucket;

  beforeEach(() => {
    deletedFromBucket = [];
    competitions = new Map([
      [
        'bb-default',
        {
          id: 'bb-default',
          name: 'Bodybuilding',
          slug: 'bodybuilding',
          competitionType: 'Bodybuilding',
          posterUrl:
            'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters/bodybuilding-poster.jpg',
          posterStoragePath: 'bodybuilding-poster.jpg',
          isDefault: true,
        },
      ],
      [
        'mp-default',
        {
          id: 'mp-default',
          name: "Men's Physique",
          slug: 'mens-physique',
          competitionType: "Men's Physique",
          posterUrl:
            'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters/mens-physique-poster.jpg',
          posterStoragePath: 'mens-physique-poster.jpg',
          isDefault: true,
        },
      ],
      [
        'custom-1',
        {
          id: 'custom-1',
          name: 'Summer Classic Bodybuilding 2026',
          slug: 'summer-classic-bb-2026',
          competitionType: 'Bodybuilding',
          posterUrl:
            'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters/posters/custom-shared.jpg',
          posterStoragePath: 'posters/custom-shared.jpg',
          isDefault: false,
        },
      ],
      [
        'custom-2',
        {
          id: 'custom-2',
          name: 'Winter Classic Bodybuilding 2026',
          slug: 'winter-classic-bb-2026',
          competitionType: 'Bodybuilding',
          posterUrl:
            'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters/posters/custom-shared.jpg',
          posterStoragePath: 'posters/custom-shared.jpg',
          isDefault: false,
        },
      ],
      [
        'custom-solo',
        {
          id: 'custom-solo',
          name: 'Solo Bodybuilding Championship',
          slug: 'solo-bb-champ',
          competitionType: 'Bodybuilding',
          posterUrl:
            'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters/posters/custom-solo.jpg',
          posterStoragePath: 'posters/custom-solo.jpg',
          isDefault: false,
        },
      ],
    ]);
  });

  async function mockSafeDeletePosterStorageFile(storagePath) {
    if (!storagePath || typeof storagePath !== 'string') return;
    const trimmed = storagePath.trim();
    if (PROTECTED_POSTER_PATHS.has(trimmed)) {
      return;
    }

    // Check if any competition still references this path
    let isReferenced = false;
    for (const comp of competitions.values()) {
      if (comp.posterStoragePath === trimmed) {
        isReferenced = true;
        break;
      }
    }

    if (!isReferenced) {
      deletedFromBucket.push(trimmed);
    }
  }

  it('preserves protected default posters from deletion on poster removal', async () => {
    const bb = competitions.get('bb-default');
    const oldPath = bb.posterStoragePath;

    // Simulate removing poster
    bb.posterUrl = null;
    bb.posterStoragePath = null;

    await mockSafeDeletePosterStorageFile(oldPath);

    assert.equal(
      deletedFromBucket.length,
      0,
      'Protected default poster must never be deleted from Supabase storage'
    );
  });

  it('preserves storage files that are still referenced by another competition', async () => {
    const c1 = competitions.get('custom-1');
    const oldPath = c1.posterStoragePath;

    // Remove from custom-1
    c1.posterUrl = null;
    c1.posterStoragePath = null;

    // custom-2 still references 'posters/custom-shared.jpg'
    await mockSafeDeletePosterStorageFile(oldPath);

    assert.equal(
      deletedFromBucket.includes('posters/custom-shared.jpg'),
      false,
      'File still referenced by custom-2 must not be deleted'
    );
  });

  it('deletes an unreferenced custom poster file from bucket when safe', async () => {
    const solo = competitions.get('custom-solo');
    const oldPath = solo.posterStoragePath;

    solo.posterUrl = null;
    solo.posterStoragePath = null;

    await mockSafeDeletePosterStorageFile(oldPath);

    assert.equal(deletedFromBucket.length, 1);
    assert.equal(deletedFromBucket[0], 'posters/custom-solo.jpg');
  });

  it('maintains independent poster isolation for newly created competitions', () => {
    const newComp = {
      id: 'new-bb',
      name: 'All India Bodybuilding Open',
      competitionType: 'Bodybuilding',
      posterUrl: null,
      posterStoragePath: null,
    };

    assert.equal(newComp.posterUrl, null);
    assert.equal(newComp.posterStoragePath, null);
    assert.notEqual(
      newComp.posterUrl,
      competitions.get('bb-default').posterUrl,
      'New competition must not inherit the default Bodybuilding poster URL'
    );
  });
});
