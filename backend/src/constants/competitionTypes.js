export const FIXED_COMPETITION_TYPES = [
  'Bodybuilding',
  "Men's Physique",
  'Masters',
];

export const COMPETITION_TYPE_CONFIGS = {
  Bodybuilding: {
    type: 'Bodybuilding',
    label: 'Bodybuilding',
    defaultName: 'Bodybuilding Championship',
    genderEligibility: 'ALL',
    ageEligibility: null,
    categories: [
      { categoryType: 'WEIGHT', gender: 'MALE', name: '55–65 kg', sortOrder: 1 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '65–75 kg', sortOrder: 2 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '75–85 kg', sortOrder: 3 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '85–100 kg', sortOrder: 4 },
      { categoryType: 'OPEN', gender: 'FEMALE', name: 'Open category', sortOrder: 5 },
    ],
  },
  "Men's Physique": {
    type: "Men's Physique",
    label: "Men's Physique",
    defaultName: "Men's Physique Championship",
    genderEligibility: 'ALL',
    ageEligibility: null,
    categories: [
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Under 175 cm', sortOrder: 1 },
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Above 175 cm', sortOrder: 2 },
      { categoryType: 'OPEN', gender: 'FEMALE', name: 'Open category', sortOrder: 3 },
    ],
  },
  Masters: {
    type: 'Masters',
    label: 'Masters',
    defaultName: 'Masters Championship',
    genderEligibility: 'ALL',
    ageEligibility: 'Above 40 years of age',
    categories: [
      {
        categoryType: 'OPEN',
        gender: 'OPEN',
        name: 'Open category',
        ruleNote: 'Strictly above 40 years of age',
        sortOrder: 1,
      },
    ],
  },
};
