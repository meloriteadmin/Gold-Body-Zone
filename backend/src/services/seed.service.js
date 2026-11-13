import { getPrismaClient } from '../config/prisma.js';

const SUPABASE_STORAGE_BASE = 'https://egaajqbbxrsnquniwang.supabase.co/storage/v1/object/public/competition-posters';

export const DEFAULT_COMPETITIONS = [
  {
    slug: 'bodybuilding',
    name: 'Bodybuilding',
    competitionType: 'Bodybuilding',
    genderEligibility: 'ALL',
    ageEligibility: null,
    isPublished: true,
    isDefault: true,
    posterStoragePath: 'bodybuilding-poster.jpg',
    posterUrl: `${SUPABASE_STORAGE_BASE}/bodybuilding-poster.jpg`,
    categories: [
      { categoryType: 'WEIGHT', gender: 'MALE', name: '55–65 kg', sortOrder: 1 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '65–75 kg', sortOrder: 2 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '75–85 kg', sortOrder: 3 },
      { categoryType: 'WEIGHT', gender: 'MALE', name: '85–100 kg', sortOrder: 4 },
      { categoryType: 'OPEN', gender: 'FEMALE', name: 'Open category', sortOrder: 5 },
    ],
  },
  {
    slug: 'mens-physique',
    name: "Men's Physique",
    competitionType: "Men's Physique",
    genderEligibility: 'ALL',
    ageEligibility: null,
    isPublished: true,
    isDefault: true,
    posterStoragePath: 'mens-physique-poster.jpg',
    posterUrl: `${SUPABASE_STORAGE_BASE}/mens-physique-poster.jpg`,
    categories: [
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Under 175 cm', sortOrder: 1 },
      { categoryType: 'HEIGHT', gender: 'MALE', name: 'Above 175 cm', sortOrder: 2 },
      { categoryType: 'OPEN', gender: 'FEMALE', name: 'Open category', sortOrder: 3 },
    ],
  },
  {
    slug: 'masters',
    name: 'Masters',
    competitionType: 'Masters',
    genderEligibility: 'ALL',
    ageEligibility: 'Above 40 years of age',
    isPublished: true,
    isDefault: true,
    posterStoragePath: 'masters-poster.jpg',
    posterUrl: `${SUPABASE_STORAGE_BASE}/masters-poster.jpg`,
    categories: [
      {
        categoryType: 'OPEN',
        gender: 'OPEN',
        name: 'Open category',
        ruleNote: 'Open category unless additional categories are configured',
        sortOrder: 1,
      },
    ],
  },
];

/**
 * Idempotently seeds the 3 default competitions if they do not already exist.
 * Uses upsert with empty update so existing admin edits are never overwritten.
 */
export async function seedDefaultCompetitions(prismaClient) {
  const prisma = prismaClient || getPrismaClient();
  const now = new Date();

  for (const item of DEFAULT_COMPETITIONS) {
    const existing = await prisma.competition.findUnique({
      where: { slug: item.slug },
      select: { id: true, posterUrl: true },
    });

    if (existing) {
      if (!existing.posterUrl && item.posterUrl) {
        await prisma.competition.update({
          where: { id: existing.id },
          data: {
            posterStoragePath: item.posterStoragePath || null,
            posterUrl: item.posterUrl || null,
          },
        });
      }
    } else {
      await prisma.competition.create({
        data: {
          slug: item.slug,
          name: item.name,
          competitionType: item.competitionType,
          genderEligibility: item.genderEligibility,
          ageEligibility: item.ageEligibility,
          isPublished: item.isPublished,
          publishedAt: item.isPublished ? now : null,
          isDefault: item.isDefault,
          posterStoragePath: item.posterStoragePath || null,
          posterUrl: item.posterUrl || null,
          categories: {
            create: item.categories.map((cat) => ({
              categoryType: cat.categoryType,
              gender: cat.gender,
              name: cat.name,
              ruleNote: cat.ruleNote || null,
              sortOrder: cat.sortOrder,
            })),
          },
        },
      });
    }
  }
}
