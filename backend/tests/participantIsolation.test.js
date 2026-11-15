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
      return [];
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

const { createPublicRegistration } = await import(
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

describe('Public Registration Uniqueness and Duplicate Protection', () => {
  beforeEach(() => {
    capturedFindManyWhere = null;
    capturedFindUniqueWhere = null;
  });

  it('createPublicRegistration rejects duplicate paid registration with 409', async () => {
    const res = createMockRes();
    let forwardedError = null;

    await createPublicRegistration(
      {
        body: {
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Athlete A',
          age: 25,
          email: 'athlete.a@example.com',
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
