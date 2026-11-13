export const GENDER_ELIGIBILITY_OPTIONS = [
  { value: 'ALL', label: 'All Genders (Male & Female)' },
  { value: 'MALE_ONLY', label: 'Male Only' },
  { value: 'FEMALE_ONLY', label: 'Female Only' },
];

export const GENDER_ELIGIBILITY_LABELS = {
  ALL: 'Male & Female',
  MALE_ONLY: 'Male Only',
  FEMALE_ONLY: 'Female Only',
};

export const CATEGORY_TYPE_OPTIONS = [
  { value: 'WEIGHT', label: 'Weight Category' },
  { value: 'HEIGHT', label: 'Height Category' },
  { value: 'OPEN', label: 'Open Category' },
];

export const CATEGORY_TYPE_LABELS = {
  WEIGHT: 'Weight',
  HEIGHT: 'Height',
  OPEN: 'Open',
};

export const CATEGORY_GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OPEN', label: 'Open' },
];

export const CATEGORY_GENDER_STYLES = {
  MALE: 'border-[#F15A24]/35 bg-[#F15A24]/10 text-[#F15A24]',
  FEMALE: 'border-[#E94B16]/40 bg-[#E94B16]/15 text-orange-300',
  OPEN: 'border-white/15 bg-white/[0.06] text-zinc-200',
};

export const FIXED_COMPETITION_TYPES = [
  'Bodybuilding',
  "Men's Physique",
  'Masters',
];

export const COMPETITION_TYPE_PRESETS = FIXED_COMPETITION_TYPES;

export const COMPETITION_TYPE_CONFIGS = {
  Bodybuilding: {
    type: 'Bodybuilding',
    label: 'Bodybuilding',
    defaultName: 'Bodybuilding Championship',
    genderEligibility: 'ALL',
    ageEligibility: '',
    categorySummary:
      'Male weight categories (55–65 kg, 65–75 kg, 75–85 kg, 85–100 kg) & Female Open Category',
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
    ageEligibility: '',
    categorySummary:
      'Two configured male height categories (Under 175 cm, Above 175 cm) & Female Open Category',
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
    categorySummary:
      'No weight or height categories. Strict eligibility: strictly above 40 years of age.',
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
