import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';

let capturedFindManyWhere = null;
let capturedFindUniqueWhere = null;

globalThis.__prisma = {
  registration: {
    async findMany({ where }) {
      capturedFindManyWhere = where;
      const allRecords = [
        {
          id: 'reg-a',
          registrationCode: 'REG-202611-AAAA01',
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Athlete A',
          age: 24,
          email: 'athlete.a@example.com',
          gender: 'MALE',
          heightCm: 175,
          weightKg: 72,
          mobileNumber: '9876543210',
          district: 'Pune',
          gymName: 'Iron Gym',
          representing: 'GYM',
          paymentStatus: 'PAID',
          registrationStatus: 'CONFIRMED',
          createdAt: new Date('2026-11-01T10:00:00Z'),
          competition: {
            id: 'comp-1',
            slug: 'state-bodybuilding',
            name: 'State Bodybuilding Championship',
            competitionType: 'Bodybuilding',
            venue: 'Mumbai',
            eventDate: new Date('2026-12-20T00:00:00Z'),
            registrationDeadline: new Date('2026-12-15T00:00:00Z'),
            registrationFee: 1000,
          },
          category: {
            id: 'cat-1',
            name: '65-75 kg',
            categoryType: 'WEIGHT',
            gender: 'MALE',
          },
          payments: [
            {
              id: 'pay-a',
              cashfreeOrderId: 'order_a',
              cfPaymentId: 'cf_a',
              amount: 1000,
              currency: 'INR',
              status: 'PAID',
              paidAt: new Date('2026-11-01T10:05:00Z'),
              createdAt: new Date('2026-11-01T10:00:00Z'),
            },
          ],
        },
        {
          id: 'reg-b',
          registrationCode: 'REG-202611-BBBB02',
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Athlete B',
          age: 26,
          email: 'athlete.b@example.com',
          gender: 'MALE',
          heightCm: 178,
          weightKg: 74,
          mobileNumber: '9876543211',
          district: 'Thane',
          gymName: null,
          representing: 'INDIVIDUAL',
          paymentStatus: 'PAID',
          registrationStatus: 'CONFIRMED',
          createdAt: new Date('2026-11-02T10:00:00Z'),
          competition: {
            id: 'comp-1',
            slug: 'state-bodybuilding',
            name: 'State Bodybuilding Championship',
            competitionType: 'Bodybuilding',
            venue: 'Mumbai',
            eventDate: new Date('2026-12-20T00:00:00Z'),
            registrationDeadline: new Date('2026-12-15T00:00:00Z'),
            registrationFee: 1000,
          },
          category: {
            id: 'cat-1',
            name: '65-75 kg',
            categoryType: 'WEIGHT',
            gender: 'MALE',
          },
          payments: [],
        },
      ];

      return allRecords.filter((rec) => rec.email === where.email);
    },
    async findUnique({ where }) {
      capturedFindUniqueWhere = where;
      if (
        where?.competitionId_email?.competitionId === 'comp-1' &&
        where?.competitionId_email?.email === 'athlete.a@example.com'
      ) {
        return {
          id: 'reg-a',
          registrationCode: 'REG-202611-AAAA01',
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Athlete A',
          email: 'athlete.a@example.com',
          paymentStatus: 'PAID',
          registrationStatus: 'CONFIRMED',
          payments: [],
        };
      }
      return null;
    },
  },
  competition: {
    async findFirst() {
      return {
        id: 'comp-1',
        slug: 'state-bodybuilding',
        name: 'State Bodybuilding Championship',
        competitionType: 'Bodybuilding',
        registrationDeadline: new Date('2099-12-15T00:00:00Z'),
        registrationFee: 1000,
        genderEligibility: 'ALL',
        ageEligibility: null,
        isPublished: true,
        categories: [
          {
            id: 'cat-1',
            name: '65-75 kg',
            categoryType: 'WEIGHT',
            gender: 'MALE',
          },
        ],
      };
    },
  },
};

const { requireParticipant } = await import(
  '../src/middleware/requireParticipant.js'
);
const { listMyRegistrations, createPublicRegistration } = await import(
  '../src/controllers/public.controller.js'
);

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

describe('Participant Auth & Registration Isolation', () => {
  beforeEach(() => {
    capturedFindManyWhere = null;
    capturedFindUniqueWhere = null;
  });

  it('requireParticipant rejects missing Authorization header with 401', async () => {
    let forwardedError = null;
    await requireParticipant(
      { headers: {} },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401);
  });

  it('listMyRegistrations scopes results strictly to req.participantEmail', async () => {
    const res = createMockRes();
    let forwardedError = null;

    await listMyRegistrations(
      { participantEmail: 'athlete.a@example.com' },
      res,
      (err) => {
        forwardedError = err;
      }
    );

    assert.equal(forwardedError, null);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedFindManyWhere, {
      email: 'athlete.a@example.com',
    });
    assert.equal(res.payload.registrations.length, 1);
    assert.equal(res.payload.registrations[0].participantName, 'Athlete A');
    assert.equal(res.payload.registrations[0].registrationCode, 'REG-202611-AAAA01');
  });

  it('createPublicRegistration binds email to req.participantEmail and rejects duplicate paid registration with 409', async () => {
    const res = createMockRes();
    let forwardedError = null;

    await createPublicRegistration(
      {
        participantEmail: 'athlete.a@example.com',
        body: {
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Spoofed Name',
          age: 25,
          email: 'spoofed.other@example.com',
          gender: 'MALE',
          heightCm: 175,
          weightKg: 72,
          mobileNumber: '9876543210',
          district: 'Pune',
          representingType: 'INDIVIDUAL',
        },
      },
      res,
      (err) => {
        forwardedError = err;
      }
    );

    assert.deepEqual(capturedFindUniqueWhere, {
      competitionId_email: {
        competitionId: 'comp-1',
        email: 'athlete.a@example.com',
      },
    });
    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 409);
  });
});
