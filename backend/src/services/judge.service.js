import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { serializeJudge } from '../utils/serializers.js';

/**
 * Validates judge fields.
 */
function validateJudgePayload(payload = {}, isUpdate = false) {
  const { name, email, phone, city, designation, isActive } = payload;

  if (!isUpdate || name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new HttpError(400, 'Judge name is required and cannot be empty.');
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      throw new HttpError(400, 'Judge name must be between 2 and 100 characters.');
    }
  }

  if (email !== undefined && email !== null && email !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      throw new HttpError(400, 'Please provide a valid email address.');
    }
  }

  if (phone !== undefined && phone !== null && phone !== '') {
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length < 7 || cleaned.length > 15) {
      throw new HttpError(400, 'Phone number must contain between 7 and 15 digits.');
    }
  }

  return {
    name: name !== undefined ? name.trim() : undefined,
    email: email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : undefined,
    phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
    city: city !== undefined ? (city ? String(city).trim() : null) : undefined,
    designation: designation !== undefined ? (designation ? String(designation).trim() : 'Judge') : undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : undefined,
  };
}

export async function listJudges({ activeOnly = false, competitionId = null } = {}) {
  const prisma = getPrismaClient();
  let where = activeOnly ? { isActive: true } : {};

  if (competitionId) {
    where = {
      ...where,
      OR: [
        { competitionId },
        { assignments: { some: { competitionId } } },
      ],
    };
  }

  const judges = await prisma.judge.findMany({
    where,
    orderBy: [
      { isActive: 'desc' },
      { name: 'asc' },
    ],
  });

  return judges.map(serializeJudge);
}

export async function getJudgeById(id) {
  const prisma = getPrismaClient();
  const judge = await prisma.judge.findUnique({
    where: { id },
  });

  if (!judge) {
    throw new HttpError(404, 'Judge not found.');
  }

  return serializeJudge(judge);
}

export async function createJudge(payload) {
  const validated = validateJudgePayload(payload, false);
  const prisma = getPrismaClient();

  const competitionId = payload?.competitionId || null;
  const competitionIds = Array.isArray(payload?.competitionIds)
    ? [...new Set(payload.competitionIds.filter((id) => typeof id === 'string' && id))]
    : competitionId ? [competitionId] : [];
  if (Array.isArray(payload?.competitionIds)) {
    if (!competitionIds.length) throw new HttpError(400, 'Select at least one live competition.');
    const live = await prisma.competition.findMany({ where: { id: { in: competitionIds }, isPublished: true, isCompleted: false }, select: { id: true } });
    if (live.length !== competitionIds.length) throw new HttpError(400, 'One or more selected competitions are not live.');
  }

  const judge = await prisma.judge.create({
    data: {
      name: validated.name,
      email: validated.email || null,
      phone: validated.phone || null,
      city: validated.city || null,
      designation: validated.designation || 'Judge',
      isActive: validated.isActive !== undefined ? validated.isActive : true,
      competitionId: competitionIds[0] || null,
      assignments: competitionIds.length
        ? {
            create: competitionIds.map((id) => ({ competitionId: id })),
          }
        : undefined,
    },
  });

  return serializeJudge(judge);
}

export async function assignJudgeToCompetition({ competitionId, judgeId }) {
  if (!competitionId || !judgeId) {
    throw new HttpError(400, 'Both competitionId and judgeId are required.');
  }

  const prisma = getPrismaClient();
  const judge = await prisma.judge.findUnique({ where: { id: judgeId } });
  if (!judge) {
    throw new HttpError(404, 'Judge not found.');
  }

  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) {
    throw new HttpError(404, 'Competition not found.');
  }

  if (prisma.competitionJudge?.upsert) {
    await prisma.competitionJudge.upsert({
      where: {
        competitionId_judgeId: {
          competitionId,
          judgeId,
        },
      },
      create: {
        competitionId,
        judgeId,
      },
      update: {},
    });
  }

  return { message: 'Judge assigned to competition successfully.', judge: serializeJudge(judge) };
}

export async function removeJudgeFromCompetition({ competitionId, judgeId }) {
  if (!competitionId || !judgeId) {
    throw new HttpError(400, 'Both competitionId and judgeId are required.');
  }

  const prisma = getPrismaClient();

  if (prisma.competitionJudge?.deleteMany) {
    await prisma.competitionJudge.deleteMany({
      where: {
        competitionId,
        judgeId,
      },
    });
  }

  const judge = await prisma.judge.findUnique({ where: { id: judgeId } });
  if (judge && judge.competitionId === competitionId) {
    await prisma.judge.update({
      where: { id: judgeId },
      data: { competitionId: null },
    });
  }

  return { message: 'Judge removed from competition successfully.' };
}

export async function updateJudge(id, payload) {
  const validated = validateJudgePayload(payload, true);
  const prisma = getPrismaClient();

  const existing = await prisma.judge.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new HttpError(404, 'Judge not found.');
  }

  const updateData = {};
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.email !== undefined) updateData.email = validated.email;
  if (validated.phone !== undefined) updateData.phone = validated.phone;
  if (validated.city !== undefined) updateData.city = validated.city;
  if (validated.designation !== undefined) updateData.designation = validated.designation;
  if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

  const updated = await prisma.judge.update({
    where: { id },
    data: updateData,
  });

  return serializeJudge(updated);
}

export async function deleteJudge(id) {
  const prisma = getPrismaClient();

  const existing = await prisma.judge.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          selections: true,
          rankings: true,
          submissions: true,
          liveSubmissions: true,
        },
      },
    },
  });

  if (!existing) {
    throw new HttpError(404, 'Judge not found.');
  }

  const hasHistory =
    (existing._count?.selections || 0) > 0 ||
    (existing._count?.rankings || 0) > 0 ||
    (existing._count?.submissions || 0) > 0 ||
    (existing._count?.liveSubmissions || 0) > 0;

  // If judge has historical judging records, deactivate rather than hard delete to preserve audit history and historical results
  if (hasHistory) {
    await prisma.judge.update({
      where: { id },
      data: { isActive: false },
    });
    return {
      message: `Judge "${existing.name}" removed from active directory. Historical judging evaluations and submissions are preserved.`,
      deleted: true,
      preservedHistory: true,
    };
  }

  await prisma.judge.delete({
    where: { id },
  });

  return { message: `Judge "${existing.name}" deleted successfully.`, deleted: true };
}
