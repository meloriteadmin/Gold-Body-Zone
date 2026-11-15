export const FIXED_COMPETITION_TYPES = [
  'Bodybuilding',
  "Men's Physique",
  'Masters',
  "Women's Competition",
];

export const COMPETITION_TYPE_CONFIGS = {
  Bodybuilding: {
    type: 'Bodybuilding',
    label: 'Bodybuilding',
    defaultName: 'Bodybuilding Championship',
    genderEligibility: 'MALE_ONLY',
    ageEligibility: null,
    categories: [
      { categoryType: 'WEIGHT', gender: 'MALE', name: '55–65 kg', sortOrder: 1, groups: [] },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '65–75 kg', sortOrder: 2, groups: [] },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '75–85 kg', sortOrder: 3, groups: [] },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '85–100 kg', sortOrder: 4, groups: [] },
    ],
  },
  "Men's Physique": {
    type: "Men's Physique",
    label: "Men's Physique",
    defaultName: "Men's Physique Championship",
    genderEligibility: 'MALE_ONLY',
    ageEligibility: null,
    categories: [
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Under 175 cm', sortOrder: 1, groups: [] },
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Above 175 cm', sortOrder: 2, groups: [] },
    ],
  },
  Masters: {
    type: 'Masters',
    label: 'Masters',
    defaultName: 'Masters Championship',
    genderEligibility: 'MALE_ONLY',
    ageEligibility: 'Above 40 years of age',
    categories: [
      {
        categoryType: 'OPEN',
        gender: 'MALE',
        name: 'Masters Open',
        ruleNote: 'Strictly above 40 years of age',
        sortOrder: 1,
        groups: [],
      },
    ],
  },
  "Women's Competition": {
    type: "Women's Competition",
    label: "Women's Competition",
    defaultName: "Women's Championship",
    genderEligibility: 'FEMALE_ONLY',
    ageEligibility: null,
    categories: [
      {
        categoryType: 'OPEN',
        gender: 'FEMALE',
        name: 'Women Open',
        ruleNote: 'Exclusively female participants. Open category.',
        sortOrder: 1,
        groups: [],
      },
    ],
  },
};
