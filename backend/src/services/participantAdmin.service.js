import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { REGISTRATION_INCLUDE, serializeRegistration } from '../utils/serializers.js';
import { categoryMatchesMeasurements, matchingCategory } from './categoryRules.js';

/**
 * Admin participant verification & category board.
 * Every change is written to the single `registrations` row, so it is reflected
 * everywhere (registrations list, exports, trunk numbers, judging, live scoring).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);
const REPRESENTING = new Set(['GYM', 'INDIVIDUAL']);
const REG_STATUSES = new Set(['PENDING', 'CONFIRMED', 'CANCELLED']);

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function serializeWithVerification(reg) {
  const base = serializeRegistration(reg);
  return {
    ...base,
    aadhaarLast4: reg.aadhaarLast4 || null,
    verifiedAt: reg.verifiedAt ? new Date(reg.verifiedAt).toISOString() : null,
  };
}

async function loadCompetitionWithCategories(prisma, competitionId) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { groups: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      },
    },
  });
  if (!competition) throw new HttpError(404, 'Competition not found.');
  return competition;
}

/**
 * Searches participants of one competition by name, email, phone, registration code,
 * trunk number, gym, district or Aadhaar last 4 digits.
 */
export async function searchCompetitionParticipants(competitionId, rawQuery) {
  const prisma = getPrismaClient();
  await loadCompetitionWithCategories(prisma, competitionId);
  const q = clean(rawQuery);
  if (!q) return { participants: [], query: '' };

  const or = [
    { participantName: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { mobileNumber: { contains: q } },
    { registrationCode: { contains: q, mode: 'insensitive' } },
    { gymName: { contains: q, mode: 'insensitive' } },
    { district: { contains: q, mode: 'insensitive' } },
  ];
  const digits = q.replace(/\D/g, '');
  // Phone numbers typed with spaces/dashes (e.g. "98765 43210")
  if (digits.length >= 4 && /^[\d\s+\-()]+$/.test(q)) {
    or.push({ mobileNumber: { contains: digits } });
  }
  if (/^#?\d{1,6}$/.test(q)) {
    or.push({ trunkNumber: Number(digits) });
  }
  if (/^\d{4}$/.test(q)) {
    or.push({ aadhaarLast4: q });
  }
  // Multi-word names in any order: every word must match the name
  const words = q.split(' ').filter((w) => w.length > 1);
  if (words.length > 1) {
    or.push({ AND: words.map((w) => ({ participantName: { contains: w, mode: 'insensitive' } })) });
  }

  const registrations = await prisma.registration.findMany({
    where: { competitionId, OR: or },
    include: REGISTRATION_INCLUDE,
    orderBy: [{ trunkNumber: 'asc' }, { participantName: 'asc' }],
    take: 50,
  });

  // Exact trunk-number matches first
  const exactTrunk = /^#?\d{1,6}$/.test(q) ? Number(digits) : null;
  registrations.sort((a, b) => {
    const ae = exactTrunk != null && a.trunkNumber === exactTrunk ? 0 : 1;
    const be = exactTrunk != null && b.trunkNumber === exactTrunk ? 0 : 1;
    return ae - be;
  });

  return { participants: registrations.map(serializeWithVerification), query: q };
}

/**
 * Category-wise board: every category (and group) of a competition with its participants.
 */
export async function getCompetitionCategoryBoard(competitionId) {
  const prisma = getPrismaClient();
  const competition = await loadCompetitionWithCategories(prisma, competitionId);
  const registrations = await prisma.registration.findMany({
    where: { competitionId },
    include: REGISTRATION_INCLUDE,
    orderBy: [{ trunkNumber: 'asc' }, { createdAt: 'asc' }],
  });
  const all = registrations.map(serializeWithVerification);
  const mismatch = all.filter((r) => {
    const category = competition.categories.find((c) => c.id === r.categoryId);
    return category && !categoryMatchesMeasurements(category, r.weightKg, r.heightCm);
  });

  const summarize = (list) => ({
    total: list.length,
    confirmedPaid: list.filter((r) => r.registrationStatus === 'CONFIRMED' && r.paymentStatus === 'PAID').length,
    pendingPayment: list.filter((r) => r.paymentStatus !== 'PAID' && r.registrationStatus !== 'CANCELLED').length,
    cancelled: list.filter((r) => r.registrationStatus === 'CANCELLED').length,
    withTrunk: list.filter((r) => r.trunkNumber != null).length,
    verified: list.filter((r) => r.verifiedAt).length,
  });

  const categories = competition.categories.map((cat) => {
    const inCat = all.filter((r) => r.categoryId === cat.id && !mismatch.includes(r));
    return {
      id: cat.id,
      name: cat.name,
      gender: cat.gender,
      categoryType: cat.categoryType,
      ruleNote: cat.ruleNote || null,
      sortOrder: cat.sortOrder,
      summary: summarize(inCat),
      groups: (cat.groups || []).map((g) => {
        const inGroup = inCat.filter((r) => r.groupId === g.id);
        return { id: g.id, name: g.name, summary: summarize(inGroup) };
      }),
      ungroupedCount: inCat.filter((r) => !r.groupId).length,
      participants: inCat,
    };
  });

  const knownCategoryIds = new Set(competition.categories.map((c) => c.id));
  const orphans = all.filter((r) => !knownCategoryIds.has(r.categoryId) || mismatch.includes(r));

  return {
    competition: {
      id: competition.id,
      name: competition.name,
      competitionType: competition.competitionType,
      venue: competition.venue,
      eventDate: competition.eventDate ? competition.eventDate.toISOString() : null,
      isCompleted: competition.isCompleted,
    },
    summary: summarize(all),
    categories,
    uncategorized: orphans,
  };
}

/**
 * Updates any participant detail. Only provided fields are changed.
 * Payment status is never editable here (it is controlled by verified payments).
 */
export async function updateParticipantDetails(registrationId, body = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!existing) throw new HttpError(404, 'Participant registration not found.');
  if (body.paymentStatus !== undefined) {
    throw new HttpError(403, 'Payment status cannot be edited here. It is updated only by verified payments.');
  }

  const competition = await loadCompetitionWithCategories(prisma, existing.competitionId);
  const data = {};

  if (body.participantName !== undefined) {
    const v = clean(body.participantName);
    if (v.length < 2 || v.length > 120) throw new HttpError(400, 'Full name must be between 2 and 120 characters.');
    data.participantName = v;
  }
  if (body.email !== undefined) {
    const v = clean(body.email).toLowerCase();
    if (!EMAIL_REGEX.test(v) || v.length > 160) throw new HttpError(400, 'Please enter a valid email address.');
    data.email = v;
  }
  if (body.mobileNumber !== undefined) {
    const v = clean(String(body.mobileNumber ?? '')).replace(/[^\d+]/g, '');
    const digits = v.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw new HttpError(400, 'Mobile number must contain 10 to 15 digits.');
    data.mobileNumber = v;
  }
  if (body.gender !== undefined) {
    const v = clean(body.gender).toUpperCase();
    if (!GENDERS.has(v)) throw new HttpError(400, 'Gender must be Male, Female or Other.');
    data.gender = v;
  }
  if (body.age !== undefined) {
    const v = Number(body.age);
    if (!Number.isInteger(v) || v < 10 || v > 100) throw new HttpError(400, 'Age must be a whole number between 10 and 100.');
    data.age = v;
  }
  if (body.heightCm !== undefined) {
    if (body.heightCm === null || body.heightCm === '') {
      data.heightCm = null;
    } else {
      const v = Number(body.heightCm);
      if (Number.isNaN(v) || v < 80 || v > 260) throw new HttpError(400, 'Height must be between 80 and 260 cm.');
      data.heightCm = Number(v.toFixed(2));
    }
  }
  if (body.weightKg !== undefined) {
    if (body.weightKg === null || body.weightKg === '') {
      data.weightKg = null;
    } else {
      const v = Number(body.weightKg);
      if (Number.isNaN(v) || v < 25 || v > 300) throw new HttpError(400, 'Weight must be between 25 and 300 kg.');
      data.weightKg = Number(v.toFixed(2));
    }
  }
  if (body.district !== undefined) {
    const v = clean(body.district);
    if (v.length < 2 || v.length > 100) throw new HttpError(400, 'District must be between 2 and 100 characters.');
    data.district = v;
  }

  const representingType =
    body.representingType !== undefined ? clean(body.representingType).toUpperCase() : existing.representingType;
  if (!REPRESENTING.has(representingType)) throw new HttpError(400, 'Representing must be Gym or Individual.');
  if (body.representingType !== undefined) data.representingType = representingType;
  if (body.gymName !== undefined || body.representingType !== undefined) {
    let gym = body.gymName !== undefined ? clean(body.gymName) : existing.gymName;
    if (representingType === 'INDIVIDUAL') {
      gym = gym || 'Other / Individual';
    } else if (gym.length < 2 || gym.length > 120) {
      throw new HttpError(400, 'Gym name must be between 2 and 120 characters.');
    }
    data.gymName = gym;
  }

  // Category & group (moving a participant to the correct category)
  let categoryId = body.categoryId !== undefined ? clean(body.categoryId) : existing.categoryId;
  let category = competition.categories.find((c) => c.id === categoryId);
  if (!category) throw new HttpError(400, 'Selected category does not belong to this competition.');
  const measuredWeight = data.weightKg !== undefined ? data.weightKg : existing.weightKg;
  const measuredHeight = data.heightCm !== undefined ? data.heightCm : existing.heightCm;
  if (!categoryMatchesMeasurements(category, measuredWeight, measuredHeight)) {
    const match = matchingCategory(competition.categories, category, measuredWeight, measuredHeight);
    if (!match) throw new HttpError(400, `Measurements do not fit ${category.name}. Choose a matching category or correct the measurements.`);
    category = match;
    categoryId = match.id;
  }
  if (categoryId !== existing.categoryId) data.categoryId = categoryId;
  if (categoryId !== existing.categoryId || body.groupId !== undefined) {
    let groupId = body.groupId !== undefined ? clean(body.groupId) || null : existing.groupId;
    let group = groupId ? category.groups.find((g) => g.id === groupId) : null;
    if (groupId && !group) {
      if (body.groupId !== undefined) {
        throw new HttpError(400, 'Selected group does not belong to the selected category.');
      }
      // Category changed and the old group belongs to the old category: clear it.
      groupId = null;
      group = null;
    }
    data.groupId = groupId;
    data.groupName = group ? group.name : null;
  }

  if (body.registrationStatus !== undefined) {
    const v = clean(body.registrationStatus).toUpperCase();
    if (!REG_STATUSES.has(v)) throw new HttpError(400, 'Invalid registration status.');
    data.registrationStatus = v;
  }

  if (body.verified !== undefined) {
    data.verifiedAt = body.verified ? existing.verifiedAt || new Date() : null;
  }

  let trunkChange = false;
  if (body.trunkNumber !== undefined) {
    if (body.trunkNumber === null || body.trunkNumber === '') {
      data.trunkNumber = null;
      trunkChange = existing.trunkNumber !== null;
    } else {
      const v = Number(body.trunkNumber);
      if (!Number.isInteger(v) || v <= 0 || v > 99999) {
        throw new HttpError(400, 'Trunk number must be a positive whole number.');
      }
      data.trunkNumber = v;
      trunkChange = existing.trunkNumber !== v;
    }
  }

  if (Object.keys(data).length === 0) {
    const current = await prisma.registration.findUnique({ where: { id: registrationId }, include: REGISTRATION_INCLUDE });
    return serializeWithVerification(current);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.competitionId}))`;
      } catch {
        /* ignore */
      }
      if (trunkChange && data.trunkNumber != null) {
        const duplicate = await tx.registration.findFirst({
          where: { competitionId: existing.competitionId, trunkNumber: data.trunkNumber, NOT: { id: registrationId } },
          select: { participantName: true, registrationCode: true },
        });
        if (duplicate) {
          throw new HttpError(
            409,
            `Trunk number ${data.trunkNumber} is already assigned to ${duplicate.participantName} (${duplicate.registrationCode}).`
          );
        }
        await tx.competition.updateMany({
          where: { id: existing.competitionId, trunkNumbersAssignedAt: null },
          data: { trunkNumbersAssignedAt: new Date() },
        });
      }
      if (data.email && data.email !== existing.email) {
        const dupEmail = await tx.registration.findFirst({
          where: { competitionId: existing.competitionId, email: data.email, NOT: { id: registrationId } },
          select: { participantName: true },
        });
        if (dupEmail) {
          throw new HttpError(409, `Email ${data.email} is already used by ${dupEmail.participantName} in this competition.`);
        }
      }
      return tx.registration.update({
        where: { id: registrationId },
        data,
        include: REGISTRATION_INCLUDE,
      });
    });
    return serializeWithVerification(updated);
  } catch (err) {
    if (err?.code === 'P2002') {
      throw new HttpError(409, 'Another participant already uses this trunk number or email in this competition.');
    }
    throw err;
  }
}

/**
 * Suggests the next free trunk number for a competition.
 */
export async function getNextFreeTrunkNumber(competitionId) {
  const prisma = getPrismaClient();
  const used = await prisma.registration.findMany({
    where: { competitionId, trunkNumber: { not: null } },
    select: { trunkNumber: true },
  });
  const set = new Set(used.map((r) => r.trunkNumber));
  let n = 1;
  while (set.has(n)) n++;
  return { nextTrunkNumber: n };
}
