import { env } from '../src/config/env.js';
import { getPrismaClient } from '../src/config/prisma.js';

const parsed = new URL(env.databaseUrl || '');
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname)) {
  throw new Error(`Refusing to seed non-local database host ${parsed.hostname}`);
}
const dryRun = process.argv.includes('--dry-run');
const prisma = getPrismaClient();

function measurements(category, index) {
  const name = category.name.toLowerCase().replace(/[–—]/g, '-');
  const range = name.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const upper = name.match(/(?:under|below|upto|up to|less than|<)\s*(\d+(?:\.\d+)?)/);
  const lower = name.match(/(?:above|over|more than|>)\s*(\d+(?:\.\d+)?)/) || name.match(/(\d+(?:\.\d+)?)\s*\+/);
  const value = range
    ? Number(range[1]) + (Number(range[2]) - Number(range[1])) * (index + 1) / 31
    : upper ? Number(upper[1]) - 1 - index % 8
    : lower ? Number(lower[1]) + 1 + index % 8 : null;
  if (category.categoryType === 'WEIGHT') return { weightKg: value === null ? 70 + index % 8 : Number(value.toFixed(2)), heightCm: 165 + index % 15 };
  if (category.categoryType === 'HEIGHT') return { heightCm: value === null ? 170 + index % 8 : Number(value.toFixed(2)), weightKg: 65 + index % 8 };
  return { weightKg: 65 + index % 12, heightCm: 165 + index % 15 };
}

try {
  const competitions = await prisma.competition.findMany({
    select: { id: true, name: true, genderEligibility: true, categories: { select: { id: true, name: true, categoryType: true, gender: true, groups: { select: { id: true, name: true } } } } },
  });
  for (const competition of competitions) {
    if (dryRun) {
      console.log(`${competition.name}: ${competition.categories.length} categories, up to ${competition.categories.length * 30} new records`);
      continue;
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competition.id}))`;
      const usedRows = await tx.registration.findMany({ where: { competitionId: competition.id, trunkNumber: { not: null } }, select: { trunkNumber: true } });
      const used = new Set(usedRows.map((row) => row.trunkNumber));
      let nextTrunk = 20000;
      let added = 0;
      const breakdown = [];
      for (const category of competition.categories) {
        const prefix = `TEST30-${category.id}-`;
        const existing = await tx.registration.findMany({ where: { competitionId: competition.id, registrationCode: { startsWith: prefix } }, select: { registrationCode: true } });
        const existingCodes = new Set(existing.map((row) => row.registrationCode));
        let categoryAdded = 0;
        for (let index = 0; index < 30; index++) {
          const number = String(index + 1).padStart(2, '0');
          const registrationCode = `${prefix}${number}`;
          if (existingCodes.has(registrationCode)) continue;
          while (used.has(nextTrunk)) nextTrunk++;
          if (nextTrunk > 99999) throw new Error(`No available test trunk number in ${competition.name}`);
          const trunkNumber = nextTrunk++;
          used.add(trunkNumber);
          const group = category.groups.length ? category.groups[index % category.groups.length] : null;
          const female = category.gender === 'FEMALE' || competition.genderEligibility === 'FEMALE_ONLY';
          await tx.registration.create({ data: {
            registrationCode, competitionId: competition.id, categoryId: category.id,
            groupId: group?.id || null, groupName: group?.name || null,
            participantName: `Test Athlete ${category.name} ${number}`,
            email: `test30.${category.id}.${number}@example.test`,
            mobileNumber: `98${String(70000000 + index).slice(-8)}`,
            gender: female ? 'FEMALE' : 'MALE', age: competition.name.toLowerCase().includes('master') ? 45 + index % 10 : 22 + index % 18,
            ...measurements(category, index), district: 'Nashik', representingType: 'GYM', gymName: 'Test Gym',
            registrationStatus: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'TEST_ONLY', isManual: true,
            trunkNumber,
          } });
          categoryAdded++;
          added++;
        }
        breakdown.push(`${category.name}: +${categoryAdded}`);
      }
      return { added, breakdown };
    }, { timeout: 120000 });
    console.log(`${competition.name}: +${result.added} (${result.breakdown.join(', ')})`);
  }
} finally {
  await prisma.$disconnect();
}
