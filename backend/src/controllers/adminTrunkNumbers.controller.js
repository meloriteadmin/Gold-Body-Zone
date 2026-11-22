import { getPrismaClient } from '../config/prisma.js';
import { generateTrunkNumbersExcel } from '../services/export.service.js';
import {
  assignTrunkNumbersForCompetition,
  editRegistrationTrunkNumber,
} from '../services/trunkNumber.service.js';
import { HttpError } from '../utils/httpError.js';
import { REGISTRATION_INCLUDE, serializeRegistration } from '../utils/serializers.js';

export async function assignTrunkNumbersHandler(req, res, next) {
  try {
    const competitionId = req.params.id;
    if (!competitionId) {
      throw new HttpError(400, 'Competition ID is required.');
    }

    const result = await assignTrunkNumbersForCompetition(competitionId);
    res.status(200).json({
      success: true,
      message:
        result.newlyAssignedCount > 0
          ? `Successfully assigned trunk numbers to ${result.newlyAssignedCount} candidate(s).`
          : 'All eligible candidates already have trunk numbers assigned. No changes were made.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCompetitionTrunkNumbersHandler(req, res, next) {
  try {
    const competitionId = req.params.id;
    if (!competitionId) {
      throw new HttpError(400, 'Competition ID is required.');
    }

    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        trunkNumbersAssignedAt: true,
      },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    const registrations = await prisma.registration.findMany({
      where: {
        competitionId,
        OR: [
          { registrationStatus: 'CONFIRMED', paymentStatus: 'PAID' },
          { trunkNumber: { not: null } },
        ],
      },
      include: REGISTRATION_INCLUDE,
      orderBy: [
        { trunkNumber: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    res.status(200).json({
      competitionId,
      trunkNumbersAssignedAt: competition.trunkNumbersAssignedAt
        ? competition.trunkNumbersAssignedAt instanceof Date
          ? competition.trunkNumbersAssignedAt.toISOString()
          : new Date(competition.trunkNumbersAssignedAt).toISOString()
        : null,
      candidates: registrations.map(serializeRegistration),
    });
  } catch (err) {
    next(err);
  }
}

export async function editTrunkNumberHandler(req, res, next) {
  try {
    const competitionId = req.params.id;
    const registrationId = req.params.registrationId;
    const trunkNumber = req.body?.trunkNumber;

    if (!competitionId) {
      throw new HttpError(400, 'Competition ID is required.');
    }
    if (!registrationId) {
      throw new HttpError(400, 'Registration ID is required.');
    }
    if (trunkNumber === undefined || trunkNumber === null || trunkNumber === '') {
      throw new HttpError(400, 'Trunk number is required.');
    }

    const updated = await editRegistrationTrunkNumber(
      competitionId,
      registrationId,
      trunkNumber
    );

    res.status(200).json({
      success: true,
      message: `Trunk number updated to ${updated.trunkNumber}.`,
      registration: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function exportTrunkNumbersExcelHandler(req, res, next) {
  try {
    const competitionId = req.params.id;
    if (!competitionId) {
      throw new HttpError(400, 'Competition ID is required.');
    }

    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    // Export eligible confirmed and paid registrations (or all assigned registrations)
    const registrations = await prisma.registration.findMany({
      where: {
        competitionId,
        OR: [
          { registrationStatus: 'CONFIRMED', paymentStatus: 'PAID' },
          { trunkNumber: { not: null } },
        ],
      },
      include: REGISTRATION_INCLUDE,
      orderBy: [
        { trunkNumber: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const excelBuffer = generateTrunkNumbersExcel(competition, registrations);

    const safeSlug = (competition.slug || competition.name || 'competition')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Trunk_Numbers_${safeSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.status(200).send(excelBuffer);
  } catch (err) {
    next(err);
  }
}
