import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  assignTrunkNumbersForCompetition,
  editRegistrationTrunkNumber,
  getNextAvailableTrunkNumber,
  hasTrunkNumbersAssigned,
} from '../src/services/trunkNumber.service.js';
import { generateTrunkNumbersExcel } from '../src/services/export.service.js';

describe('Trunk Number Assignment – GOLD BODY ZONE', () => {
  let mockCompetition1 = null;
  let mockCompetition2 = null;
  let mockRegistrations = [];

  // In-memory mock Prisma client
  const mockPrisma = {
    competition: {
      async findUnique({ where }) {
        if (where.id === mockCompetition1?.id) return mockCompetition1;
        if (where.id === mockCompetition2?.id) return mockCompetition2;
        return null;
      },
      async update({ where, data }) {
        const comp = where.id === mockCompetition1?.id ? mockCompetition1 : mockCompetition2;
        if (comp) Object.assign(comp, data);
        return comp;
      },
      async updateMany({ where, data }) {
        const targets = [mockCompetition1, mockCompetition2].filter(
          (c) => c && c.id === where.id && (where.trunkNumbersAssignedAt === null ? !c.trunkNumbersAssignedAt : true)
        );
        targets.forEach((c) => Object.assign(c, data));
        return { count: targets.length };
      },
    },
    registration: {
      async findUnique({ where }) {
        return mockRegistrations.find((r) => r.id === where.id) || null;
      },
      async findMany({ where = {}, orderBy = [] } = {}) {
        let list = [...mockRegistrations];
        if (where.competitionId) {
          list = list.filter((r) => r.competitionId === where.competitionId);
        }
        if (where.registrationStatus) {
          list = list.filter((r) => r.registrationStatus === where.registrationStatus);
        }
        if (where.paymentStatus) {
          list = list.filter((r) => r.paymentStatus === where.paymentStatus);
        }
        if (where.trunkNumber) {
          if (where.trunkNumber.not !== undefined) {
            list = list.filter((r) => r.trunkNumber !== null && r.trunkNumber !== undefined);
          } else {
            list = list.filter((r) => r.trunkNumber === where.trunkNumber);
          }
        }
        if (where.NOT) {
          if (where.NOT.id) {
            list = list.filter((r) => r.id !== where.NOT.id);
          }
        }
        if (where.OR) {
          list = list.filter((r) => {
            return where.OR.some((cond) => {
              if (cond.registrationStatus && cond.paymentStatus) {
                return (
                  r.registrationStatus === cond.registrationStatus &&
                  r.paymentStatus === cond.paymentStatus
                );
              }
              if (cond.trunkNumber && cond.trunkNumber.not !== undefined) {
                return r.trunkNumber !== null && r.trunkNumber !== undefined;
              }
              return false;
            });
          });
        }

        // Handle orderBy
        const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
        for (const order of orders) {
          if (order.createdAt) {
            const dir = order.createdAt === 'desc' ? -1 : 1;
            list.sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * dir);
          }
          if (order.trunkNumber) {
            const dir = order.trunkNumber === 'desc' ? -1 : 1;
            list.sort((a, b) => {
              const valA = a.trunkNumber ?? 999999;
              const valB = b.trunkNumber ?? 999999;
              return (valA - valB) * dir;
            });
          }
        }

        return list;
      },
      async update({ where, data }) {
        const reg = mockRegistrations.find((r) => r.id === where.id);
        if (reg) Object.assign(reg, data);
        return reg;
      },
    },
    async $transaction(fn) {
      return fn(mockPrisma);
    },
  };

  beforeEach(() => {
    globalThis.__prisma = mockPrisma;

    mockCompetition1 = {
      id: 'comp-closed-1',
      name: 'Dewali Shree 2026',
      competitionType: 'Bodybuilding',
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true, // Closed
      registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
      trunkNumbersAssignedAt: null,
      registrationFee: 200,
    };

    mockCompetition2 = {
      id: 'comp-closed-2',
      name: 'Nashik Classic 2026',
      competitionType: "Men's Physique",
      isPublished: true,
      isCompleted: false,
      isRegistrationClosed: true, // Closed
      registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
      trunkNumbersAssignedAt: null,
      registrationFee: 300,
    };

    mockRegistrations = [];
  });

  it('1. Ten eligible candidates receive numbers 1–10', async () => {
    for (let i = 1; i <= 10; i++) {
      mockRegistrations.push({
        id: `reg-${i}`,
        registrationCode: `GBZ-M26-${String(i).padStart(3, '0')}`,
        competitionId: 'comp-closed-1',
        participantName: `Candidate ${i}`,
        createdAt: new Date(2026, 0, i),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      });
    }

    const res = await assignTrunkNumbersForCompetition('comp-closed-1');
    assert.equal(res.totalEligible, 10);
    assert.equal(res.newlyAssignedCount, 10);

    for (let i = 1; i <= 10; i++) {
      const reg = mockRegistrations.find((r) => r.id === `reg-${i}`);
      assert.equal(reg.trunkNumber, i);
    }
  });

  it('2. Assignment strictly follows oldest registration first', async () => {
    // Add registrations out of chronological order
    mockRegistrations = [
      {
        id: 'reg-c',
        registrationCode: 'GBZ-003',
        competitionId: 'comp-closed-1',
        participantName: 'Late Candidate',
        createdAt: new Date('2026-02-10T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
      {
        id: 'reg-a',
        registrationCode: 'GBZ-001',
        competitionId: 'comp-closed-1',
        participantName: 'First Candidate',
        createdAt: new Date('2026-02-01T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
      {
        id: 'reg-b',
        registrationCode: 'GBZ-002',
        competitionId: 'comp-closed-1',
        participantName: 'Second Candidate',
        createdAt: new Date('2026-02-05T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
    ];

    await assignTrunkNumbersForCompetition('comp-closed-1');

    assert.equal(mockRegistrations.find((r) => r.id === 'reg-a').trunkNumber, 1);
    assert.equal(mockRegistrations.find((r) => r.id === 'reg-b').trunkNumber, 2);
    assert.equal(mockRegistrations.find((r) => r.id === 'reg-c').trunkNumber, 3);
  });

  it('3. Running assignment twice does not change existing numbers', async () => {
    mockRegistrations = [
      {
        id: 'reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 1',
        createdAt: new Date('2026-02-01T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 1, // Already has 1
      },
      {
        id: 'reg-2',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 2',
        createdAt: new Date('2026-02-02T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 2, // Already has 2
      },
    ];

    const run1 = await assignTrunkNumbersForCompetition('comp-closed-1');
    assert.equal(run1.newlyAssignedCount, 0);
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 2);

    const run2 = await assignTrunkNumbersForCompetition('comp-closed-1');
    assert.equal(run2.newlyAssignedCount, 0);
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 2);
  });

  it('4. Admin can edit a number successfully', async () => {
    mockRegistrations = [
      {
        id: 'reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 1',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 5,
      },
    ];

    const updated = await editRegistrationTrunkNumber('comp-closed-1', 'reg-1', 42);
    assert.equal(updated.trunkNumber, 42);
    assert.equal(mockRegistrations[0].trunkNumber, 42);
  });

  it('5. Duplicate numbers are rejected with clear error message', async () => {
    mockRegistrations = [
      {
        id: 'reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 1',
        registrationCode: 'GBZ-001',
        trunkNumber: 7,
      },
      {
        id: 'reg-2',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 2',
        registrationCode: 'GBZ-002',
        trunkNumber: 10,
      },
    ];

    await assert.rejects(
      async () => {
        await editRegistrationTrunkNumber('comp-closed-1', 'reg-2', 7);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /already assigned to participant "Candidate 1"/);
        return true;
      }
    );

    // Number remains untouched on reg-2
    assert.equal(mockRegistrations[1].trunkNumber, 10);
  });

  it('6. Next available positive integer is assigned after manual edits (not count + 1)', async () => {
    // 5 candidates, numbers edited to {1, 2, 4, 5, 8}
    mockRegistrations = [
      { id: 'r1', competitionId: 'comp-closed-1', trunkNumber: 1 },
      { id: 'r2', competitionId: 'comp-closed-1', trunkNumber: 2 },
      { id: 'r4', competitionId: 'comp-closed-1', trunkNumber: 4 },
      { id: 'r5', competitionId: 'comp-closed-1', trunkNumber: 5 },
      { id: 'r8', competitionId: 'comp-closed-1', trunkNumber: 8 },
    ];

    // Candidate count is 5, but next genuinely available integer starting from 1 is 3!
    const nextNum = await getNextAvailableTrunkNumber(mockPrisma, 'comp-closed-1');
    assert.equal(nextNum, 3);
  });

  it('7. Cancelled candidates do not cause other candidates to be renumbered, and cancelled numbers are not reused', async () => {
    mockRegistrations = [
      {
        id: 'reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 1',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 1,
      },
      {
        id: 'reg-2',
        competitionId: 'comp-closed-1',
        participantName: 'Cancelled Candidate',
        registrationStatus: 'CANCELLED', // Cancelled
        paymentStatus: 'PAID',
        trunkNumber: 2, // Retains number 2 in database history
      },
      {
        id: 'reg-3',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 3',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 3,
      },
      {
        id: 'reg-4',
        competitionId: 'comp-closed-1',
        participantName: 'New Unassigned Candidate',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null, // Needs assignment
      },
    ];

    await assignTrunkNumbersForCompetition('comp-closed-1');

    // Candidate 1 and 3 keep their numbers
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[2].trunkNumber, 3);
    // Cancelled candidate still has 2
    assert.equal(mockRegistrations[1].trunkNumber, 2);
    // Candidate 4 gets 4, NOT 2 (2 is preserved in history)
    assert.equal(mockRegistrations[3].trunkNumber, 4);
  });

  it('8. Different competitions have independent numbering sequences', async () => {
    mockRegistrations = [
      {
        id: 'c1-reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Comp 1 Athlete',
        createdAt: new Date('2026-02-01'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
      {
        id: 'c2-reg-1',
        competitionId: 'comp-closed-2',
        participantName: 'Comp 2 Athlete',
        createdAt: new Date('2026-02-01'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
    ];

    await assignTrunkNumbersForCompetition('comp-closed-1');
    await assignTrunkNumbersForCompetition('comp-closed-2');

    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 1); // Both start at 1 independently!
  });

  it('9. Rejects bulk assignment if registration is not closed', async () => {
    mockCompetition1.isRegistrationClosed = false;
    mockCompetition1.registrationDeadline = new Date(Date.now() + 86400000).toISOString(); // Future

    await assert.rejects(
      async () => {
        await assignTrunkNumbersForCompetition('comp-closed-1');
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /after registration has closed/);
        return true;
      }
    );
  });

  it('10. Does not assign trunk numbers to unpaid or unconfirmed candidates', async () => {
    mockRegistrations = [
      {
        id: 'unpaid-reg',
        competitionId: 'comp-closed-1',
        participantName: 'Unpaid User',
        createdAt: new Date('2026-02-01'),
        registrationStatus: 'PENDING',
        paymentStatus: 'PENDING',
        trunkNumber: null,
      },
      {
        id: 'paid-reg',
        competitionId: 'comp-closed-1',
        participantName: 'Paid User',
        createdAt: new Date('2026-02-02'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
    ];

    await assignTrunkNumbersForCompetition('comp-closed-1');

    assert.equal(mockRegistrations[0].trunkNumber, null); // Unpaid gets nothing
    assert.equal(mockRegistrations[1].trunkNumber, 1); // Paid gets 1
  });

  it('11. Generates valid Excel (.xlsx) file with trunk numbers and candidate details', () => {
    const sampleRegistrations = [
      {
        id: 'reg-1',
        registrationCode: 'GBZ-M26-001',
        participantName: 'Rahul Sharma',
        trunkNumber: 1,
        gender: 'MALE',
        age: 26,
        mobileNumber: '9822986005',
        district: 'Nashik',
        representingType: 'GYM',
        gymName: 'GOLD BODY ZONE',
        category: { gender: 'MALE', name: 'Under 70kg' },
        group: { name: 'Group A' },
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        createdAt: new Date(),
      },
    ];

    const buffer = generateTrunkNumbersExcel(mockCompetition1, sampleRegistrations);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 100);
  });

  it('12. Rejects bulk assignment if competition is completed', async () => {
    mockCompetition1.isCompleted = true;

    await assert.rejects(
      async () => {
        await assignTrunkNumbersForCompetition('comp-closed-1');
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /completed competition/);
        return true;
      }
    );
  });

  it('13. Clicking assign again when new eligible manual registration is added assigns only missing number (1-5 exist, new gets 6)', async () => {
    // 5 existing candidates with numbers 1 to 5
    mockRegistrations = [
      {
        id: 'reg-1',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 1',
        createdAt: new Date('2026-02-01T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 1,
      },
      {
        id: 'reg-2',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 2',
        createdAt: new Date('2026-02-01T11:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 2,
      },
      {
        id: 'reg-3',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 3',
        createdAt: new Date('2026-02-01T12:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 3,
      },
      {
        id: 'reg-4',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 4',
        createdAt: new Date('2026-02-01T13:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 4,
      },
      {
        id: 'reg-5',
        competitionId: 'comp-closed-1',
        participantName: 'Candidate 5',
        createdAt: new Date('2026-02-01T14:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 5,
      },
      // New manual registration added later with no trunk number
      {
        id: 'reg-new-manual',
        competitionId: 'comp-closed-1',
        participantName: 'New Manual Athlete',
        createdAt: new Date('2026-02-02T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
      },
    ];

    const result = await assignTrunkNumbersForCompetition('comp-closed-1');

    assert.equal(result.newlyAssignedCount, 1);
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 2);
    assert.equal(mockRegistrations[2].trunkNumber, 3);
    assert.equal(mockRegistrations[3].trunkNumber, 4);
    assert.equal(mockRegistrations[4].trunkNumber, 5);
    assert.equal(mockRegistrations[5].trunkNumber, 6); // New candidate gets exactly 6!
  });

  it('14. When new manual registration is added and paid/confirmed, does NOT auto-assign trunk number until bulk assign is triggered', async () => {
    mockRegistrations = [
      {
        id: 'reg-online-1',
        competitionId: 'comp-closed-1',
        participantName: 'Existing Athlete 1',
        createdAt: new Date('2026-02-01T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 1,
        isManual: false,
      },
      {
        id: 'reg-online-2',
        competitionId: 'comp-closed-1',
        participantName: 'Existing Athlete 2',
        createdAt: new Date('2026-02-01T11:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 2,
        isManual: false,
      },
      // New manual registration added: paid and confirmed, but NO auto-assigned trunk number
      {
        id: 'reg-manual-confirmed',
        competitionId: 'comp-closed-1',
        participantName: 'Manual Paid Athlete',
        createdAt: new Date('2026-02-02T12:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
        isManual: true,
      },
    ];

    // Assert that the manual registration initially has NO trunk number
    assert.equal(mockRegistrations[2].trunkNumber, null);

    // When admin clicks "Assign Trunk Numbers"
    const result = await assignTrunkNumbersForCompetition('comp-closed-1');

    assert.equal(result.newlyAssignedCount, 1);
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 2);
    // Newly assigned number for the manual registration is 3
    assert.equal(mockRegistrations[2].trunkNumber, 3);
  });

  it('15. When new online registration is paid and confirmed, does NOT auto-assign trunk number until bulk assign is triggered', async () => {
    mockRegistrations = [
      {
        id: 'reg-online-existing',
        competitionId: 'comp-closed-1',
        participantName: 'Existing Athlete 1',
        createdAt: new Date('2026-02-01T10:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: 1,
        isManual: false,
      },
      // New online registration added and paid, but NO auto-assigned trunk number
      {
        id: 'reg-online-new-paid',
        competitionId: 'comp-closed-1',
        participantName: 'Online Paid Athlete',
        createdAt: new Date('2026-02-02T15:00:00Z'),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        trunkNumber: null,
        isManual: false,
      },
    ];

    // Assert that the online registration has NO trunk number upon payment settlement
    assert.equal(mockRegistrations[1].trunkNumber, null);

    // When admin clicks "Assign Trunk Numbers"
    const result = await assignTrunkNumbersForCompetition('comp-closed-1');

    assert.equal(result.newlyAssignedCount, 1);
    assert.equal(mockRegistrations[0].trunkNumber, 1);
    assert.equal(mockRegistrations[1].trunkNumber, 2);
  });
});
