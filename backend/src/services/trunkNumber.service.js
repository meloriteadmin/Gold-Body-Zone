import { getPrismaClient } from '../config/prisma.js';
import {
  computeCompetitionStatus,
  computeRegistrationStatus,
} from '../utils/competitionValidation.js';
import { HttpError } from '../utils/httpError.js';
import { REGISTRATION_INCLUDE, serializeRegistration } from '../utils/serializers.js';

/**
 * Checks whether automatic trunk number assignment has already been initiated for a competition.
 * A competition is considered to have initiated trunk number assignment if:
 * 1. competition.trunkNumbersAssignedAt is set, OR
 * 2. Any registration in the competition already has a non-null trunkNumber.
 */
export async function hasTrunkNumbersAssigned(tx, competitionId) {
  if (tx.competition?.findUnique) {
    const comp = await tx.competition.findUnique({
      where: { id: competitionId },
      select: { trunkNumbersAssignedAt: true },
    });

    if (comp?.trunkNumbersAssignedAt) {
      return true;
    }
  }

  const existingWithNumber = await tx.registration.findMany({
    where: {
      competitionId,
      trunkNumber: { not: null },
    },
    take: 1,
    select: { id: true },
  });

  return Array.isArray(existingWithNumber) && existingWithNumber.length > 0;
}

/**
 * Finds the next genuinely available positive integer trunk number for a competition.
 * Starts from 1 and finds the lowest positive integer not currently assigned to any registration
 * (including cancelled or manual registrations) in this competition.
 * Never uses candidate count + 1.
 */
export async function getNextAvailableTrunkNumber(tx, competitionId) {
  const registrationsWithNumbers = await tx.registration.findMany({
    where: {
      competitionId,
      trunkNumber: { not: null },
    },
    select: {
      trunkNumber: true,
    },
  });

  const usedNumbers = new Set(
    registrationsWithNumbers
      .map((r) => r.trunkNumber)
      .filter((n) => typeof n === 'number' && n > 0)
  );

  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate++;
  }

  return candidate;
}

/**
 * Bulk assigns trunk numbers to all eligible, unassigned candidates in a competition.
 * Requirements:
 * - Only permitted after registration has closed.
 * - Only assigns to eligible candidates (CONFIRMED registrationStatus & PAID paymentStatus).
 * - Sorts unassigned eligible candidates by creation date (createdAt ASC, oldest first).
 * - Starts numbering from 1, filling genuinely available positive integers.
 * - Idempotent: Never overwrites existing numbers or renumbers candidates.
 * - Concurrency safe via transaction and PostgreSQL advisory lock.
 */
export async function assignTrunkNumbersForCompetition(competitionId) {
  const prisma = getPrismaClient();

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
  });

  if (!competition) {
    throw new HttpError(404, 'Competition not found.');
  }

  // 1. Enable bulk assignment only for competitions whose registration is CLOSED and which are not completed
  if (competition.isCompleted || computeCompetitionStatus(competition) === 'COMPLETED') {
    throw new HttpError(
      400,
      'Trunk numbers cannot be assigned for a completed competition.'
    );
  }

  const regStatus = computeRegistrationStatus(competition);
  if (regStatus !== 'CLOSED') {
    throw new HttpError(
      400,
      'Trunk numbers can only be bulk assigned after registration has closed.'
    );
  }

  return prisma.$transaction(async (tx) => {
    // Acquire transaction-scoped advisory lock in PostgreSQL to prevent simultaneous duplicate assignments
    try {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;
      }
    } catch {
      // Gracefully continue in environments where advisory locks are not supported (e.g. mock DBs)
    }

    // Fetch all registrations in this competition that already have a trunk number
    const existingWithNumbers = await tx.registration.findMany({
      where: {
        competitionId,
        trunkNumber: { not: null },
      },
      select: {
        id: true,
        trunkNumber: true,
      },
    });

    const usedNumbers = new Set(
      existingWithNumbers
        .map((r) => r.trunkNumber)
        .filter((n) => typeof n === 'number' && n > 0)
    );

    // Fetch all eligible candidates (CONFIRMED & PAID)
    const eligibleRegistrations = await tx.registration.findMany({
      where: {
        competitionId,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
      include: REGISTRATION_INCLUDE,
    });

    // Filter candidates who do not have a trunk number yet
    const unassignedCandidates = eligibleRegistrations.filter(
      (r) => r.trunkNumber === null || r.trunkNumber === undefined
    );

    let nextAvailable = 1;
    let newlyAssignedCount = 0;

    for (const candidate of unassignedCandidates) {
      while (usedNumbers.has(nextAvailable)) {
        nextAvailable++;
      }

      await tx.registration.update({
        where: { id: candidate.id },
        data: { trunkNumber: nextAvailable },
      });

      usedNumbers.add(nextAvailable);
      candidate.trunkNumber = nextAvailable;
      newlyAssignedCount++;
      nextAvailable++;
    }

    // Mark trunk numbers as assigned on competition record if not already marked
    let assignedAt = competition.trunkNumbersAssignedAt;
    if (!assignedAt) {
      assignedAt = new Date();
      await tx.competition.update({
        where: { id: competitionId },
        data: { trunkNumbersAssignedAt: assignedAt },
      });
    }

    // Refetch and serialize all eligible registrations
    const updatedEligible = await tx.registration.findMany({
      where: {
        competitionId,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
      orderBy: [
        { trunkNumber: 'asc' },
        { createdAt: 'asc' },
      ],
      include: REGISTRATION_INCLUDE,
    });

    return {
      competitionId,
      totalEligible: eligibleRegistrations.length,
      totalAssigned: usedNumbers.size,
      newlyAssignedCount,
      trunkNumbersAssignedAt: assignedAt.toISOString(),
      candidates: updatedEligible.map(serializeRegistration),
    };
  });
}

/**
 * Allows admin to manually edit an individual candidate's trunk number.
 * Validations:
 * - Positive whole number only.
 * - Rejects duplicates within the same competition.
 * - Does not change registration or payment status.
 * - Saves permanently.
 */
export async function editRegistrationTrunkNumber(competitionId, registrationId, rawNewNumber) {
  const newNumber = Number(rawNewNumber);
  if (!Number.isInteger(newNumber) || newNumber <= 0) {
    throw new HttpError(
      400,
      'Trunk number must be a positive whole number greater than 0.'
    );
  }

  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    // Acquire transaction-scoped advisory lock in PostgreSQL
    try {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;
      }
    } catch {
      // Mock environment fallback
    }

    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      include: REGISTRATION_INCLUDE,
    });

    if (!registration) {
      throw new HttpError(404, 'Registration not found.');
    }

    if (registration.competitionId !== competitionId) {
      throw new HttpError(
        400,
        'Registration does not belong to the specified competition.'
      );
    }

    // If unchanged, return existing
    if (registration.trunkNumber === newNumber) {
      return serializeRegistration(registration);
    }

    // Check for duplicate number in the same competition
    const duplicates = await tx.registration.findMany({
      where: {
        competitionId,
        trunkNumber: newNumber,
        NOT: { id: registrationId },
      },
      select: {
        id: true,
        participantName: true,
        registrationCode: true,
      },
      take: 1,
    });

    const duplicate = Array.isArray(duplicates) ? duplicates[0] : null;

    if (duplicate) {
      throw new HttpError(
        409,
        `Trunk number ${newNumber} is already assigned to participant "${duplicate.participantName}" (${duplicate.registrationCode}) in this competition.`
      );
    }

    // Ensure competition is marked as initiated if an admin manually assigns a number
    await tx.competition.updateMany({
      where: {
        id: competitionId,
        trunkNumbersAssignedAt: null,
      },
      data: {
        trunkNumbersAssignedAt: new Date(),
      },
    });

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { trunkNumber: newNumber },
      include: REGISTRATION_INCLUDE,
    });

    return serializeRegistration(updated);
  });
}
