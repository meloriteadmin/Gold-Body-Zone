import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancingIds,
  computeRound1Results,
  computeRound2Results,
  computeRound3Results,
} from '../src/services/liveScoring.service.js';

const people = new Map(
  ['a', 'b', 'c', 'd'].map((id, i) => [id, { id, trunkNumber: i + 1, participantName: id.toUpperCase() }])
);
const sub = (judgeId, payload) => ({ judgeId, payload });

describe('Round 1 three-stage cutoffs', () => {
  const ids = Array.from({ length: 30 }, (_, index) => `p${index + 1}`);
  const entrants = new Map(ids.map((id, index) => [id, { id, trunkNumber: index + 1 }]));
  it('keeps all entrants when the category has exactly the requested 20', () => {
    const root = { id: 'twenty', label: 'Round 1 · Stage 1', selectionLimit: 20, participantIds: ids.slice(0, 20), submissions: [sub('j1', { selected: ids.slice(0, 10) })] };
    assert.deepEqual(advancingIds(root, [root], entrants), ids.slice(0, 20));
  });
  it('selects 20 of 30, then 5, then one', () => {
    const first = { id: 'first', label: 'Round 1 · Stage 1', selectionLimit: 20, participantIds: ids, submissions: [sub('j1', { selected: ids.slice(0, 20) })] };
    const firstWinners = advancingIds(first, [first], entrants);
    assert.deepEqual(firstWinners, ids.slice(0, 20));
    const second = { id: 'second', label: 'Round 1 · Stage 2', selectionLimit: 5, participantIds: firstWinners, submissions: [sub('j1', { selected: ids.slice(0, 5) })] };
    const secondWinners = advancingIds(second, [second], entrants);
    assert.deepEqual(secondWinners, ids.slice(0, 5));
    const third = { id: 'third', label: 'Round 1 · Stage 3', selectionLimit: 1, participantIds: secondWinners, submissions: [sub('j1', { selected: ['p3'] })] };
    assert.deepEqual(advancingIds(third, [third], entrants), ['p3']);
  });
  it('fills the cutoff by trunk order when equal votes cross it', () => {
    const root = { id: 'boundary', label: 'Round 1 · Stage 1', selectionLimit: 20, participantIds: ids, submissions: [sub('j1', { selected: ids.slice(0, 19) })] };
    assert.deepEqual(advancingIds(root, [root], entrants), ids.slice(0, 20));
  });
  it('fills every remaining place after a boundary re-vote without discarding extra tied entrants', () => {
    const root = { id: 'boundary-two', label: 'Round 1 · Stage 1', selectionLimit: 20, participantIds: ids, submissions: [sub('j1', { selected: ids.slice(0, 18) })] };
    const tie = { id: 'boundary-vote', parentHeatId: root.id, status: 'CLOSED', closedAt: new Date(), participantIds: ids.slice(18), submissions: [sub('j1', { selected: ['p19', 'p20'] })] };
    assert.deepEqual(advancingIds(root, [root, tie], entrants), ids.slice(0, 20));
  });
  it('selects the configured number even when fewer receive votes', () => {
    const root = { id: 'admin-fill', label: 'Round 1 · Stage 1', selectionLimit: 20, participantIds: ids, submissions: [sub('j1', { selected: ids.slice(0, 18) })] };
    assert.deepEqual(advancingIds(root, [root], entrants), ids.slice(0, 20));
  });
});

describe('Live scoring — Round 1 voting', () => {
  const root = {
    id: 'h1',
    participantIds: ['a', 'b', 'c', 'd'],
    submissions: [sub('j1', { selected: ['a', 'b'] }), sub('j2', { selected: ['a', 'b'] }), sub('j3', { selected: ['c'] })],
  };

  it('orders by votes and detects ties', () => {
    const r = computeRound1Results(root, [root], people);
    assert.deepEqual(r.rows.map((x) => [x.registrationId, x.votes, x.position]), [
      ['a', 2, 1], ['b', 2, 1], ['c', 1, 3], ['d', 0, 4],
    ]);
    assert.equal(r.leaderTie, true);
    assert.deepEqual(r.suggestedQualifierIds, []);
    assert.deepEqual(r.tieGroups, [{ position: 1, registrationIds: ['a', 'b'] }]);
  });

  it('tie-break winner keeps position, loser is OUT', () => {
    const tb = {
      id: 'h2', parentHeatId: 'h1', status: 'CLOSED', closedAt: new Date(),
      participantIds: ['a', 'b'],
      submissions: [sub('j1', { selected: ['b'] }), sub('j2', { selected: ['b'] }), sub('j3', { selected: ['a'] })],
    };
    const r = computeRound1Results(root, [root, tb], people);
    assert.equal(r.rows[0].registrationId, 'b');
    assert.equal(r.rows[0].position, 1);
    assert.deepEqual(r.suggestedQualifierIds, ['b']);
    const a = r.rows.find((x) => x.registrationId === 'a');
    assert.equal(a.eliminated, true);
    assert.equal(a.position, null);
    assert.equal(r.rows[r.rows.length - 1].registrationId, 'a');
  });
});

describe('Live scoring — Round 2 ranking', () => {
  const root = {
    id: 'r2', participantIds: ['a', 'b', 'c'],
    submissions: [
      sub('j1', { ranks: { a: 1, b: 2, c: 3 } }),
      sub('j2', { ranks: { a: 2, b: 1, c: 3 } }),
    ],
  };
  it('highest total wins, equal totals tie', () => {
    const r = computeRound2Results(root, [root], people);
    assert.deepEqual(r.rows.map((x) => [x.registrationId, x.total, x.position]), [['c', 6, 1], ['a', 3, 2], ['b', 3, 2]]);
  });
  it('tie-break re-ranks only tied finalists, no elimination', () => {
    const tb = { id: 't', parentHeatId: 'r2', status: 'CLOSED', closedAt: new Date(), participantIds: ['a', 'b'], submissions: [sub('j1', { ranks: { a: 2, b: 1 } }), sub('j2', { ranks: { a: 2, b: 1 } })] };
    const r = computeRound2Results(root, [root, tb], people);
    assert.deepEqual(r.rows.map((x) => [x.registrationId, x.position]), [['c', 1], ['a', 2], ['b', 3]]);
    assert.equal(r.tieGroups.length, 0);
  });
});

describe('Live scoring — Round 3 titles', () => {
  it('counts votes per title', () => {
    const heat = { titles: ['Best Poser'], submissions: [sub('j1', { titles: { 'Best Poser': 'a' } }), sub('j2', { titles: { 'Best Poser': 'a' } }), sub('j3', { titles: { 'Best Poser': 'b' } })] };
    const [t] = computeRound3Results(heat, people);
    assert.equal(t.winnerId, 'a');
    assert.equal(t.isTied, false);
  });

  it('detects a title tie and exposes only the tied participant ids', () => {
    const heat = {
      id: 'title-root',
      titles: ['Best Poser'],
      participantIds: ['a', 'b', 'c'],
      submissions: [
        sub('j1', { titles: { 'Best Poser': 'a' } }),
        sub('j2', { titles: { 'Best Poser': 'b' } }),
      ],
    };
    const [t] = computeRound3Results(heat, people, [heat]);
    assert.equal(t.winnerId, null);
    assert.equal(t.isTied, true);
    assert.deepEqual(t.tieRegistrationIds, ['a', 'b']);
  });

  it('resolves a title tie using only the tie-break votes', () => {
    const root = {
      id: 'title-root',
      titles: ['Best Poser'],
      participantIds: ['a', 'b', 'c'],
      submissions: [
        sub('j1', { titles: { 'Best Poser': 'a' } }),
        sub('j2', { titles: { 'Best Poser': 'b' } }),
      ],
    };
    const tie = {
      id: 'title-tie',
      parentHeatId: root.id,
      status: 'CLOSED',
      closedAt: new Date(),
      titles: ['Best Poser'],
      participantIds: ['a', 'b'],
      submissions: [
        sub('j1', { titles: { 'Best Poser': 'a' } }),
        sub('j2', { titles: { 'Best Poser': 'a' } }),
        sub('j3', { titles: { 'Best Poser': 'b' } }),
      ],
    };
    const [t] = computeRound3Results(root, people, [root, tie]);
    assert.equal(t.winnerId, 'a');
    assert.equal(t.isTied, false);
    assert.equal(t.tiebreaks.length, 1);
    assert.deepEqual(t.tiebreaks[0].votes.map((row) => [row.registrationId, row.votes]), [['a', 2], ['b', 1]]);
  });
});
