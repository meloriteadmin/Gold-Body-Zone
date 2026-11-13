import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPETITION_TYPE_CONFIGS,
  FIXED_COMPETITION_TYPES,
} from '../src/constants/competitionTypes.js';

describe('Dynamic Competition Types & Presets', () => {
  it('exposes the three fixed competition types', () => {
    assert.deepEqual(FIXED_COMPETITION_TYPES, [
      'Bodybuilding',
      "Men's Physique",
      'Masters',
    ]);
  });

  it('configures Bodybuilding with 4 male weight categories and female open', () => {
    const config = COMPETITION_TYPE_CONFIGS.Bodybuilding;
    assert.ok(config);
    assert.equal(config.type, 'Bodybuilding');
    assert.equal(config.genderEligibility, 'ALL');
    assert.equal(config.ageEligibility, null);

    const maleWeightCats = config.categories.filter(
      (c) => c.gender === 'MALE' && c.categoryType === 'WEIGHT'
    );
    assert.equal(maleWeightCats.length, 4);
    assert.deepEqual(
      maleWeightCats.map((c) => c.name),
      ['55–65 kg', '65–75 kg', '75–85 kg', '85–100 kg']
    );

    const femaleCat = config.categories.find((c) => c.gender === 'FEMALE');
    assert.ok(femaleCat);
    assert.equal(femaleCat.name, 'Open category');
  });

  it("configures Men's Physique with two male height categories and female open", () => {
    const config = COMPETITION_TYPE_CONFIGS["Men's Physique"];
    assert.ok(config);
    assert.equal(config.type, "Men's Physique");

    const maleHeightCats = config.categories.filter(
      (c) => c.gender === 'MALE' && c.categoryType === 'HEIGHT'
    );
    assert.equal(maleHeightCats.length, 2);
    assert.deepEqual(
      maleHeightCats.map((c) => c.name),
      ['Under 175 cm', 'Above 175 cm']
    );
  });

  it('configures Masters with strict Above 40 eligibility and no weight/height categories', () => {
    const config = COMPETITION_TYPE_CONFIGS.Masters;
    assert.ok(config);
    assert.equal(config.type, 'Masters');
    assert.equal(config.ageEligibility, 'Above 40 years of age');

    const weightOrHeight = config.categories.filter(
      (c) => c.categoryType === 'WEIGHT' || c.categoryType === 'HEIGHT'
    );
    assert.equal(weightOrHeight.length, 0);

    const openCat = config.categories.find((c) => c.categoryType === 'OPEN');
    assert.ok(openCat);
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
});
