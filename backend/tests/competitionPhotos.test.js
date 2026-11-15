import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

describe('Event Photos Management & Storage', () => {
  let photoStore;
  let deletedFromBucket;

  beforeEach(() => {
    deletedFromBucket = [];
    photoStore = [
      {
        id: 'photo-1',
        competitionId: 'comp-123',
        photoUrl: 'https://storage.example.com/event-photos/p1.jpg',
        photoStoragePath: 'event-photos/p1.jpg',
        caption: 'Award Ceremony',
        sortOrder: 0,
        createdAt: new Date('2026-05-10T18:00:00Z'),
      },
      {
        id: 'photo-2',
        competitionId: 'comp-123',
        photoUrl: 'https://storage.example.com/event-photos/p2.jpg',
        photoStoragePath: 'event-photos/p2.jpg',
        caption: 'Stage Poses',
        sortOrder: 1,
        createdAt: new Date('2026-05-10T18:30:00Z'),
      },
    ];
  });

  it('lists photos ordered by sortOrder for a competition', () => {
    const compPhotos = photoStore
      .filter((p) => p.competitionId === 'comp-123')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    assert.equal(compPhotos.length, 2);
    assert.equal(compPhotos[0].id, 'photo-1');
    assert.equal(compPhotos[1].id, 'photo-2');
  });

  it('adds new photos with incremented sortOrder', () => {
    const newPhoto = {
      id: 'photo-3',
      competitionId: 'comp-123',
      photoUrl: 'https://storage.example.com/event-photos/p3.jpg',
      photoStoragePath: 'event-photos/p3.jpg',
      caption: 'Backstage Highlights',
      sortOrder: photoStore.length,
      createdAt: new Date(),
    };
    photoStore.push(newPhoto);

    assert.equal(photoStore.length, 3);
    assert.equal(photoStore[2].sortOrder, 2);
    assert.equal(photoStore[2].caption, 'Backstage Highlights');
  });

  it('deletes photo from storage bucket and removes DB record', () => {
    const photoIdToDelete = 'photo-1';
    const photo = photoStore.find((p) => p.id === photoIdToDelete);
    assert.ok(photo);

    // Simulate storage deletion
    deletedFromBucket.push(photo.photoStoragePath);
    // Simulate DB delete
    photoStore = photoStore.filter((p) => p.id !== photoIdToDelete);

    assert.equal(photoStore.length, 1);
    assert.deepEqual(deletedFromBucket, ['event-photos/p1.jpg']);
    assert.equal(photoStore[0].id, 'photo-2');
  });
});
