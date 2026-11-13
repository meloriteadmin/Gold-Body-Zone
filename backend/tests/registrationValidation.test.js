import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePublicRegistration } from '../src/utils/registrationValidation.js';

const BASE_PAYLOAD = {
  competitionId: 'comp-123',
  categoryId: 'cat-123',
  participantName: 'Aarav Sharma',
  email: 'aarav@example.com',
  mobileNumber: '9876543210',
  gender: 'MALE',
  age: 26,
  heightCm: 175,
  weightKg: 72.5,
  district: 'Pune',
  representingType: 'GYM',
  gymName: 'Iron Forge Gym',
};

describe('Public Registration Validation (No Aadhaar)', () => {
  it('accepts valid Gym registration payload without any Aadhaar fields', () => {
    const result = validatePublicRegistration(BASE_PAYLOAD);

    assert.equal(result.participantName, 'Aarav Sharma');
    assert.equal(result.email, 'aarav@example.com');
    assert.equal(result.representingType, 'GYM');
    assert.equal(result.gymName, 'Iron Forge Gym');
    assert.equal('aadhaarNumber' in result, false);
    assert.equal('aadhaarConsentAt' in result, false);
  });

  it('accepts Individual registration without requiring a custom gym name', () => {
    const result = validatePublicRegistration({
      ...BASE_PAYLOAD,
      representingType: 'INDIVIDUAL',
      gymName: '',
    });

    assert.equal(result.representingType, 'INDIVIDUAL');
    assert.equal(result.gymName, 'Other / Individual');
  });

  it('requires Gym Name when Representing is GYM', () => {
    assert.throws(
      () =>
        validatePublicRegistration({
          ...BASE_PAYLOAD,
          representingType: 'GYM',
          gymName: ' ',
        }),
      /Gym Name/i
    );
  });

  it('validates all required personal, physical, competition, and district fields', () => {
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, participantName: 'A' }),
      /Full Name/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, email: 'invalid-email' }),
      /email/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, mobileNumber: '12345' }),
      /Mobile number/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, age: 8 }),
      /Age/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, heightCm: 50 }),
      /Height/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, weightKg: 10 }),
      /Weight/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, district: 'A' }),
      /District/i
    );
    assert.throws(
      () => validatePublicRegistration({ ...BASE_PAYLOAD, categoryId: '' }),
      /category/i
    );
  });
});
