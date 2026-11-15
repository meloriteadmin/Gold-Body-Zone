import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPETITION_TYPE_CONFIGS,
  FIXED_COMPETITION_TYPES,
} from '../src/constants/competitionTypes.js';
import { validatePublicRegistration } from '../src/utils/registrationValidation.js';
import {
  computeCompetitionStatus,
  computeRegistrationStatus,
  validateCompetitionPayload,
} from '../src/utils/competitionValidation.js';

describe('Dynamic Competition Types & Presets', () => {
  it('exposes the four fixed competition types including Women\'s Competition', () => {
    assert.deepEqual(FIXED_COMPETITION_TYPES, [
      'Bodybuilding',
      "Men's Physique",
      'Masters',
      "Women's Competition",
    ]);
  });

  it('configures Bodybuilding exclusively for male participants with 4 weight categories', () => {
    const config = COMPETITION_TYPE_CONFIGS.Bodybuilding;
    assert.ok(config);
    assert.equal(config.type, 'Bodybuilding');
    assert.equal(config.genderEligibility, 'MALE_ONLY');
    assert.equal(config.ageEligibility, null);

    const maleWeightCats = config.categories.filter(
      (c) => c.gender === 'MALE' && c.categoryType === 'WEIGHT'
    );
    assert.equal(maleWeightCats.length, 4);
    assert.deepEqual(
      maleWeightCats.map((c) => c.name),
      ['55–65 kg', '65–75 kg', '75–85 kg', '85–100 kg']
    );

    const femaleCats = config.categories.filter((c) => c.gender === 'FEMALE');
    assert.equal(femaleCats.length, 0, 'Must have zero female categories');
  });

  it("configures Men's Physique exclusively for male participants with 2 height categories", () => {
    const config = COMPETITION_TYPE_CONFIGS["Men's Physique"];
    assert.ok(config);
    assert.equal(config.type, "Men's Physique");
    assert.equal(config.genderEligibility, 'MALE_ONLY');

    const maleHeightCats = config.categories.filter(
      (c) => c.gender === 'MALE' && c.categoryType === 'HEIGHT'
    );
    assert.equal(maleHeightCats.length, 2);
    assert.deepEqual(
      maleHeightCats.map((c) => c.name),
      ['Under 175 cm', 'Above 175 cm']
    );

    const femaleCats = config.categories.filter((c) => c.gender === 'FEMALE');
    assert.equal(femaleCats.length, 0, 'Must have zero female categories');
  });

  it('configures Masters exclusively for male participants with Above 40 eligibility and no weight/height categories', () => {
    const config = COMPETITION_TYPE_CONFIGS.Masters;
    assert.ok(config);
    assert.equal(config.type, 'Masters');
    assert.equal(config.genderEligibility, 'MALE_ONLY');
    assert.equal(config.ageEligibility, 'Above 40 years of age');

    const weightOrHeight = config.categories.filter(
      (c) => c.categoryType === 'WEIGHT' || c.categoryType === 'HEIGHT'
    );
    assert.equal(weightOrHeight.length, 0);

    const openCat = config.categories.find((c) => c.categoryType === 'OPEN');
    assert.ok(openCat);
    assert.equal(openCat.gender, 'MALE');

    const femaleCats = config.categories.filter((c) => c.gender === 'FEMALE');
    assert.equal(femaleCats.length, 0, 'Must have zero female categories');
  });

  it("configures Women's Competition exclusively for female participants with Open categories only", () => {
    const config = COMPETITION_TYPE_CONFIGS["Women's Competition"];
    assert.ok(config);
    assert.equal(config.type, "Women's Competition");
    assert.equal(config.genderEligibility, 'FEMALE_ONLY');

    // All categories must be female and Open only
    for (const cat of config.categories) {
      assert.equal(cat.gender, 'FEMALE');
      assert.equal(cat.categoryType, 'OPEN');
      assert.equal(cat.minWeightKg, undefined);
      assert.equal(cat.maxWeightKg, undefined);
      assert.equal(cat.minHeightCm, undefined);
      assert.equal(cat.maxHeightCm, undefined);
    }

    const maleCats = config.categories.filter((c) => c.gender === 'MALE');
    assert.equal(maleCats.length, 0, 'Must have zero male categories');
  });

  it('ensures competition type presets do not bind default poster URLs', () => {
    for (const type of FIXED_COMPETITION_TYPES) {
      const config = COMPETITION_TYPE_CONFIGS[type];
      assert.equal(
        config.posterUrl,
        undefined,
        `Preset for ${type} must not hardcode or bind a posterUrl`
      );
    }
  });

  describe('Gender Restriction & Category Group Validation', () => {
    it('validates public registration payload and extracts groupId', () => {
      const validated = validatePublicRegistration({
        competitionId: 'comp-123',
        categoryId: 'cat-456',
        groupId: 'grp-789',
        participantName: 'Rajesh Sharma',
        email: 'rajesh@example.com',
        mobileNumber: '9876543210',
        gender: 'MALE',
        age: 28,
        weightKg: 78.5,
        heightCm: 175.2,
        district: 'Mumbai',
        representingType: 'GYM',
        gymName: 'Iron Fitness',
      });

      assert.equal(validated.participantName, 'Rajesh Sharma');
      assert.equal(validated.gender, 'MALE');
      assert.equal(validated.groupId, 'grp-789');
    });

    it('validates and normalizes category groups on competition payload', () => {
      const { categories } = validateCompetitionPayload(
        {
          name: 'Annual Championship',
          competitionType: 'Bodybuilding',
          registrationFee: 500,
          categories: [
            {
              name: 'Heavyweight',
              gender: 'MALE',
              categoryType: 'WEIGHT',
              groups: [
                { name: 'Group 1' },
                { name: 'Group 2' },
              ],
            },
          ],
        },
        { isUpdate: false }
      );

      assert.equal(categories.length, 1);
      assert.equal(categories[0].groups.length, 2);
      assert.equal(categories[0].groups[0].name, 'Group 1');
      assert.equal(categories[0].groups[1].name, 'Group 2');
    });

    it('enforces Women\'s Competition category rules in competition payload', () => {
      // Rejects non-OPEN categories for Women's Competition
      assert.throws(
        () => {
          validateCompetitionPayload(
            {
              name: 'Women Championship',
              competitionType: "Women's Competition",
              registrationFee: 500,
              categories: [
                {
                  name: 'Weight 60kg',
                  gender: 'FEMALE',
                  categoryType: 'WEIGHT',
                },
              ],
            },
            { isUpdate: false }
          );
        },
        /only allows Open categories/i
      );

      // Rejects MALE categories for Women's Competition
      assert.throws(
        () => {
          validateCompetitionPayload(
            {
              name: 'Women Championship',
              competitionType: "Women's Competition",
              registrationFee: 500,
              categories: [
                {
                  name: 'Open',
                  gender: 'MALE',
                  categoryType: 'OPEN',
                },
              ],
            },
            { isUpdate: false }
          );
        },
        /cannot have Male categories/i
      );
    });

    it('enforces Male-only competition category rules in competition payload', () => {
      assert.throws(
        () => {
          validateCompetitionPayload(
            {
              name: 'Men Physique Contest',
              competitionType: "Men's Physique",
              registrationFee: 500,
              categories: [
                {
                  name: 'Women Bikini Open',
                  gender: 'FEMALE',
                  categoryType: 'OPEN',
                },
              ],
            },
            { isUpdate: false }
          );
        },
        /cannot have Female categories/i
      );
    });

    it('allows Women\'s Competition registration without height or weight fields', () => {
      const womensComp = {
        id: 'comp-w-1',
        name: "State Women's Cup",
        competitionType: "Women's Competition",
        genderEligibility: 'FEMALE_ONLY',
      };

      const validated = validatePublicRegistration(
        {
          competitionId: womensComp.id,
          categoryId: 'cat-w-1',
          participantName: 'Priya Patel',
          email: 'priya@example.com',
          mobileNumber: '9876543210',
          gender: 'FEMALE',
          age: 24,
          district: 'Pune',
          representingType: 'GYM',
          gymName: 'Gold Fitness',
        },
        womensComp
      );

      assert.equal(validated.gender, 'FEMALE');
      assert.equal(validated.heightCm, null);
      assert.equal(validated.weightKg, null);
    });

    it('rejects Male gender registration on Women\'s Competition', () => {
      const womensComp = {
        id: 'comp-w-1',
        competitionType: "Women's Competition",
        genderEligibility: 'FEMALE_ONLY',
      };

      assert.throws(
        () => {
          validatePublicRegistration(
            {
              competitionId: womensComp.id,
              categoryId: 'cat-w-1',
              participantName: 'Rahul Verma',
              email: 'rahul@example.com',
              mobileNumber: '9876543210',
              gender: 'MALE',
              age: 26,
              district: 'Pune',
              representingType: 'INDIVIDUAL',
            },
            womensComp
          );
        },
        /Women's Competition accepts only Female participants/i
      );
    });

    it('rejects Female gender registration on Male-only competitions', () => {
      const maleComp = {
        id: 'comp-m-1',
        competitionType: 'Bodybuilding',
        genderEligibility: 'MALE_ONLY',
      };

      assert.throws(
        () => {
          validatePublicRegistration(
            {
              competitionId: maleComp.id,
              categoryId: 'cat-m-1',
              participantName: 'Pooja Sharma',
              email: 'pooja@example.com',
              mobileNumber: '9876543210',
              gender: 'FEMALE',
              age: 25,
              heightCm: 165,
              weightKg: 58,
              district: 'Pune',
              representingType: 'INDIVIDUAL',
            },
            maleComp
          );
        },
        /exclusive to Male participants/i
      );
    });

    it('computes competition status accurately across all states', () => {
      assert.equal(computeCompetitionStatus({ isCompleted: true }), 'COMPLETED');
      assert.equal(
        computeCompetitionStatus({ isCompleted: false, isPublished: false, publishedAt: null }),
        'DRAFT'
      );
      assert.equal(
        computeCompetitionStatus({ isCompleted: false, isPublished: false, publishedAt: new Date() }),
        'UNPUBLISHED'
      );
      assert.equal(
        computeCompetitionStatus({
          isCompleted: false,
          isPublished: true,
          eventDate: new Date(Date.now() + 864000000),
        }),
        'PUBLISHED'
      );
    });

    it('computes registration status and respects manual closure and deadlines', () => {
      // Completed -> Closed
      assert.equal(
        computeRegistrationStatus({ isCompleted: true, isPublished: true }),
        'CLOSED'
      );

      // Manually closed -> Closed
      assert.equal(
        computeRegistrationStatus({
          isCompleted: false,
          isPublished: true,
          isRegistrationClosed: true,
        }),
        'CLOSED'
      );

      // Deadline in past -> Closed
      assert.equal(
        computeRegistrationStatus({
          isCompleted: false,
          isPublished: true,
          isRegistrationClosed: false,
          registrationDeadline: new Date(Date.now() - 86400000),
        }),
        'CLOSED'
      );

      // Deadline in 2 days (<= 3 days) -> Closing Soon
      assert.equal(
        computeRegistrationStatus({
          isCompleted: false,
          isPublished: true,
          isRegistrationClosed: false,
          registrationDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        }),
        'CLOSING_SOON'
      );

      // Deadline in 10 days -> Open
      assert.equal(
        computeRegistrationStatus({
          isCompleted: false,
          isPublished: true,
          isRegistrationClosed: false,
          registrationDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        }),
        'OPEN'
      );
    });
  });

  describe('Admin Competition Detail Serialization', () => {
    it('serializes registration records safely without ReferenceError', async () => {
      const { serializeRegistration, serializeCompetition } = await import(
        '../src/utils/serializers.js'
      );

      const mockReg = {
        id: 'reg-test-1',
        registrationCode: 'REG-2026-TEST',
        competitionId: 'comp-1',
        categoryId: 'cat-1',
        groupId: null,
        participantName: 'Arjun Verma',
        email: 'arjun@example.com',
        mobileNumber: '9876543210',
        gender: 'MALE',
        age: 28,
        heightCm: 178,
        weightKg: 75,
        district: 'Pune',
        representingType: 'GYM',
        gymName: 'Iron Gym',
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const serialized = serializeRegistration(mockReg);
      assert.ok(serialized);
      assert.equal(serialized.id, 'reg-test-1');
      assert.equal(serialized.participantName, 'Arjun Verma');
      assert.equal(serialized.heightCm, 178);
      assert.equal(serialized.weightKg, 75);
    });
  });
});
