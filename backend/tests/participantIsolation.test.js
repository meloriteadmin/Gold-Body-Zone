import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
process.env.CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || 'test-only-checkout-secret';
process.env.CHECKOUT_TOKEN_SECRET = process.env.CHECKOUT_TOKEN_SECRET || 'test-only-checkout-secret';

const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = async (url, options = {}) => {
    const requestBody = options.body ? JSON.parse(options.body) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        order_id: requestBody.order_id || 'CF-TEST-123',
        order_status: 'ACTIVE',
        payment_session_id: 'session_mock_123',
      }),
    };
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

let capturedFindManyWhere = null;
let capturedFindUniqueWhere = null;
let newlyCreatedRegistration = null;

globalThis.__prisma = {
  registration: {
    async count() {
      return 0;
    },
    async update({ where, data }) {
      return { id: where?.id, ...data };
    },
    async updateMany() {
      return { count: 0 };
    },
    async findMany({ where }) {
      capturedFindManyWhere = where;
      return [];
    },
    async findUnique({ where }) {
      capturedFindUniqueWhere = where;
      if (where?.id && newlyCreatedRegistration?.id === where.id) {
        return newlyCreatedRegistration;
      }
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
  payment: {
    async upsert() {
      return {};
    },
  },
  async $queryRaw() {
    return [];
  },
  $transaction: async (arg) => {
    if (typeof arg === 'function') {
      return arg(globalThis.__prisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  },
  competition: {
    async findFirst({ where } = {}) {
      return {
        id: where?.id || 'comp-1',
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
    newlyCreatedRegistration = null;
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
    assert.equal(
      forwardedError.message,
      'This candidate is already registered for this competition.'
    );
  });

  it('allows candidate with different email (e.g. rahul@example.com) to proceed without error', async () => {
    const res = createMockRes();
    let forwardedError = null;

    globalThis.__prisma.registration.create = async ({ data }) => {
      newlyCreatedRegistration = {
        id: 'reg-rahul',
        registrationCode: 'REG-202611-RAHU01',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        competition: {
          id: data.competitionId,
          name: 'State Bodybuilding Championship',
          slug: 'state-bodybuilding',
          registrationFee: 1000,
        },
        payment: null,
      };
      return newlyCreatedRegistration;
    };

    await createPublicRegistration(
      {
        body: {
          competitionId: 'comp-1',
          categoryId: 'cat-1',
          participantName: 'Rahul',
          age: 26,
          email: 'rahul@example.com',
          gender: 'MALE',
          heightCm: 178,
          weightKg: 75,
          mobileNumber: '9876543210',
          district: 'Nashik',
          representingType: 'INDIVIDUAL',
        },
      },
      res,
      (err) => {
        forwardedError = err;
      }
    );

    assert.equal(forwardedError, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.registration.participantName, 'Rahul');
  });

  it('allows same email to register for a different competition', async () => {
    const res = createMockRes();
    let forwardedError = null;

    globalThis.__prisma.registration.create = async ({ data }) => {
      newlyCreatedRegistration = {
        id: 'reg-athlete-comp2',
        registrationCode: 'REG-202611-CMP201',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        competition: {
          id: data.competitionId,
          name: 'District Championship',
          slug: 'district-championship',
          registrationFee: 800,
        },
        payment: null,
      };
      return newlyCreatedRegistration;
    };

    await createPublicRegistration(
      {
        body: {
          competitionId: 'comp-2',
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

    assert.equal(forwardedError, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.registration.competitionId, 'comp-2');
  });
});
