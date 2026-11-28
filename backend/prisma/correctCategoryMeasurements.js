import { env } from '../src/config/env.js';
import { getPrismaClient } from '../src/config/prisma.js';
import { categoryMatchesMeasurements, matchingCategory } from '../src/services/categoryRules.js';

const host = new URL(env.databaseUrl || '').hostname;
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) throw new Error('Category correction runs only on a local database.');
const apply = process.argv.includes('--apply');
const prisma = getPrismaClient();
function normalizedDummyMeasurement(category, person) {
  const name = category.name.toLowerCase().replace(/[–—]/g, '-');
  const range = name.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const upper = name.match(/(?:under|below|upto|up to|less than|<)\s*(\d+(?:\.\d+)?)/);
  const lower = name.match(/(?:above|over|more than|>)\s*(\d+(?:\.\d+)?)/) || name.match(/(\d+(?:\.\d+)?)\s*\+/);
  const field = category.categoryType === 'WEIGHT' ? 'weightKg' : category.categoryType === 'HEIGHT' ? 'heightCm' : null;
  if (!field) return null;
  const current = Number(person[field]);
  let value = null;
  if (range) value = current < Number(range[1]) ? Number(range[1]) + 1 : Number(range[2]) - 1;
  else if (upper) value = Number(upper[1]) - 1;
  else if (lower) value = Number(lower[1]) + 1;
  return value === null ? null : { [field]: value };
}
try {
  const competitions = await prisma.competition.findMany({ include: { categories: { include: { groups: true } } } });
  for (const competition of competitions) {
    const registrations = await prisma.registration.findMany({ where: { competitionId: competition.id }, select: { id: true, registrationCode: true, participantName: true, categoryId: true, groupId: true, weightKg: true, heightCm: true } });
    const changes = [];
    const dummyMeasurements = [];
    const unresolved = [];
    for (const person of registrations) {
      const current = competition.categories.find((category) => category.id === person.categoryId);
      if (!current || categoryMatchesMeasurements(current, person.weightKg, person.heightCm)) continue;
      const target = matchingCategory(competition.categories, current, person.weightKg, person.heightCm);
      if (!target) {
        const normalized = person.registrationCode.startsWith('TEST-') ? normalizedDummyMeasurement(current, person) : null;
        if (normalized) dummyMeasurements.push({ person, current, normalized });
        else unresolved.push(`${person.participantName} (${current.name})`);
        continue;
      }
      changes.push({ person, current, target });
    }
    if (apply && (changes.length || dummyMeasurements.length)) {
      const open = await prisma.liveHeat.findFirst({ where: { competitionId: competition.id, status: 'OPEN' } });
      if (open) throw new Error(`${competition.name}: close the active judging form before changing category membership.`);
      await prisma.$transaction(async (tx) => {
        for (const { person, target } of changes) {
          const group = target.groups.find((item) => item.id === person.groupId);
          await tx.registration.update({ where: { id: person.id }, data: { categoryId: target.id, groupId: group?.id || null, groupName: group?.name || null } });
        }
        for (const { person, normalized } of dummyMeasurements) {
          await tx.registration.update({ where: { id: person.id }, data: normalized });
        }
      });
    }
    console.log(`${competition.name}: ${changes.length} category moves, ${dummyMeasurements.length} dummy measurements ${apply ? 'corrected' : 'to correct'}, ${unresolved.length} need manual review`);
    for (const { person, current, target } of changes) console.log(`  ${person.participantName}: ${current.name} -> ${target.name}`);
    for (const item of unresolved) console.log(`  REVIEW ${item}`);
    for (const { person, normalized } of dummyMeasurements) console.log(`  TEST ${person.participantName}: ${JSON.stringify(normalized)}`);
  }
} finally { await prisma.$disconnect(); }
