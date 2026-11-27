import {
  computeCompetitionStatus,
  computeRegistrationStatus,
} from './competitionValidation.js';

export const REGISTRATION_INCLUDE = {
  competition: {
    select: {
      id: true,
      name: true,
      competitionType: true,
      registrationFee: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      gender: true,
      categoryType: true,
    },
  },
  group: {
    select: {
      id: true,
      name: true,
    },
  },
  payment: true,
};

export function formatTrunkNumbersSummary(numbers = []) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return 'Not Assigned';
  }

  const valid = numbers
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    return 'Not Assigned';
  }

  const ranges = [];
  let start = valid[0];
  let end = valid[0];

  for (let i = 1; i < valid.length; i++) {
    if (valid[i] === end + 1) {
      end = valid[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = valid[i];
      end = valid[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);

  return ranges.join(', ');
}

export function serializeCompetition(competition, options = {}) {
  if (!competition) return null;

  const paidRegistrations = (competition.registrations || []).filter(
    (r) =>
      (r.paymentStatus === 'PAID' || r.payment?.status === 'PAID') &&
      r.registrationStatus !== 'CANCELLED'
  );
  const totalRevenue = paidRegistrations.reduce((sum, r) => {
    const amt = Number(r.payment?.amount ?? competition.registrationFee ?? 0);
    return sum + (Number.isNaN(amt) ? 0 : amt);
  }, 0);

  const assignedTrunkNumbers = (competition.registrations || [])
    .map((r) => r.trunkNumber)
    .filter((n) => typeof n === 'number' && n > 0)
    .sort((a, b) => a - b);
  const trunkNumbersSummary = formatTrunkNumbersSummary(assignedTrunkNumbers);

  return {
    id: competition.id,
    slug: competition.slug,
    name: competition.name,
    competitionType: competition.competitionType,
    description: competition.description,
    posterUrl: competition.posterUrl,
    eventDate: competition.eventDate
      ? competition.eventDate.toISOString()
      : null,
    registrationDeadline: competition.registrationDeadline
      ? competition.registrationDeadline.toISOString()
      : null,
    venue: competition.venue,
    registrationFee:
      competition.registrationFee !== null &&
      competition.registrationFee !== undefined
        ? Number(competition.registrationFee)
        : null,
    maxParticipants: competition.maxParticipants,
    genderEligibility: competition.genderEligibility,
    ageEligibility: competition.ageEligibility,
    isPublished: competition.isPublished,
    publishedAt: competition.publishedAt
      ? competition.publishedAt.toISOString()
      : null,
    isCompleted: Boolean(competition.isCompleted),
    completedAt: competition.completedAt
      ? competition.completedAt.toISOString()
      : null,
    isRegistrationClosed: Boolean(competition.isRegistrationClosed),
    registrationClosedAt: competition.registrationClosedAt
      ? competition.registrationClosedAt.toISOString()
      : null,
    trunkNumbersAssignedAt: competition.trunkNumbersAssignedAt
      ? competition.trunkNumbersAssignedAt instanceof Date
        ? competition.trunkNumbersAssignedAt.toISOString()
        : new Date(competition.trunkNumbersAssignedAt).toISOString()
      : null,
    trunkNumbers: assignedTrunkNumbers,
    trunkNumbersCount: assignedTrunkNumbers.length,
    trunkNumbersSummary,
    status: computeCompetitionStatus(competition),
    registrationStatus: computeRegistrationStatus(competition),
    isDefault: competition.isDefault,
    createdAt: competition.createdAt
      ? competition.createdAt instanceof Date
        ? competition.createdAt.toISOString()
        : new Date(competition.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: competition.updatedAt
      ? competition.updatedAt instanceof Date
        ? competition.updatedAt.toISOString()
        : new Date(competition.updatedAt).toISOString()
      : new Date().toISOString(),
    registrationStats: {
      total: (competition.registrations || []).length,
      confirmed: (competition.registrations || []).filter(
        (r) => r.registrationStatus === 'CONFIRMED'
      ).length,
      pending: (competition.registrations || []).filter(
        (r) => r.registrationStatus === 'PENDING'
      ).length,
      paid: paidRegistrations.length,
      unpaid: (competition.registrations || []).filter(
        (r) =>
          (r.paymentStatus === 'PENDING' || r.paymentStatus === 'FAILED' || r.payment?.status === 'PENDING') &&
          r.registrationStatus !== 'CANCELLED'
      ).length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
    },
    categories: (competition.categories || [])
      .filter((cat) => {
        if (
          competition.competitionType === 'Bodybuilding' &&
          /female\s*open/i.test(cat.name || '')
        ) {
          return false;
        }
        if (!options.filterIneligible) return true;
        if (
          ['Bodybuilding', "Men's Physique", 'Masters'].includes(
            competition.competitionType
          )
        ) {
          if (cat.gender === 'FEMALE' || /female/i.test(cat.name || '')) {
            return false;
          }
          if (
            competition.competitionType === 'Bodybuilding' &&
            (cat.categoryType === 'OPEN' || /open/i.test(cat.name || ''))
          ) {
            return false;
          }
        }
        if (
          competition.competitionType === "Women's Competition" &&
          (cat.gender === 'MALE' || /male/i.test(cat.name || ''))
        ) {
          return false;
        }
        return true;
      })
      .map((cat) => ({
        id: cat.id,
        competitionId: cat.competitionId,
        categoryType: cat.categoryType,
        gender: cat.gender,
        name: cat.name,
        ruleNote: cat.ruleNote,
        sortOrder: cat.sortOrder,
        groups: (cat.groups || []).map((g) => ({
          id: g.id,
          categoryId: g.categoryId,
          name: g.name,
          sortOrder: g.sortOrder,
        })),
      })),
    photos: (competition.photos || []).map((p) => ({
      id: p.id,
      competitionId: p.competitionId,
      photoUrl: p.photoUrl,
      caption: p.caption,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt
        ? p.createdAt instanceof Date
          ? p.createdAt.toISOString()
          : String(p.createdAt)
        : null,
    })),
  };
}

export function serializeAdminProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    role: profile.role,
    isActive: profile.isActive,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function serializeRegistration(registration) {
  if (!registration) return null;
  return {
    id: registration.id,
    registrationCode: registration.registrationCode,
    competitionId: registration.competitionId,
    categoryId: registration.categoryId,
    groupId: registration.groupId || null,
    groupName: registration.groupName || registration.group?.name || null,
    participantName: registration.participantName,
    email: registration.email,
    mobileNumber: registration.mobileNumber,
    gender: registration.gender,
    age: registration.age,
    heightCm:
      registration.heightCm !== null && registration.heightCm !== undefined
        ? Number(registration.heightCm)
        : null,
    weightKg:
      registration.weightKg !== null && registration.weightKg !== undefined
        ? Number(registration.weightKg)
        : null,
    district: registration.district,
    representingType: registration.representingType || 'GYM',
    gymName: registration.gymName,
    confirmationEmailSentAt: registration.confirmationEmailSentAt
      ? registration.confirmationEmailSentAt.toISOString()
      : null,
    registrationStatus: registration.registrationStatus,
    paymentStatus: registration.paymentStatus,
    trunkNumber:
      registration.trunkNumber !== null && registration.trunkNumber !== undefined
        ? Number(registration.trunkNumber)
        : null,
    isManual: Boolean(
      registration.isManual ||
        registration.payment?.verificationSource === 'ADMIN_MANUAL'
    ),
    source: Boolean(
      registration.isManual ||
        registration.payment?.verificationSource === 'ADMIN_MANUAL'
    )
      ? 'MANUAL'
      : 'ONLINE',
    paymentMethod:
      registration.paymentMethod ||
      (registration.payment?.verificationSource === 'ADMIN_MANUAL'
        ? registration.payment?.currency === 'CASH'
          ? 'Cash'
          : registration.payment?.currency === 'UPI'
            ? 'UPI'
            : 'Pending'
        : registration.payment?.cashfreeOrderId
          ? 'Online'
          : 'N/A'),
    createdAt:
      registration.createdAt instanceof Date
        ? registration.createdAt.toISOString()
        : registration.createdAt
          ? new Date(registration.createdAt).toISOString()
          : new Date().toISOString(),
    updatedAt:
      registration.updatedAt instanceof Date
        ? registration.updatedAt.toISOString()
        : registration.updatedAt
          ? new Date(registration.updatedAt).toISOString()
          : new Date().toISOString(),
    competition: registration.competition
      ? {
          id: registration.competition.id,
          slug: registration.competition.slug || null,
          name: registration.competition.name,
          competitionType: registration.competition.competitionType,
          eventDate: registration.competition.eventDate
            ? registration.competition.eventDate.toISOString()
            : null,
          venue: registration.competition.venue || null,
          registrationFee:
            registration.competition.registrationFee !== null &&
            registration.competition.registrationFee !== undefined
              ? Number(registration.competition.registrationFee)
              : null,
        }
      : null,
    category: registration.category
      ? {
          id: registration.category.id,
          name: registration.category.name,
          gender: registration.category.gender,
          categoryType: registration.category.categoryType,
        }
      : null,
    group: registration.group
      ? {
          id: registration.group.id,
          name: registration.group.name,
        }
      : null,
    payment: registration.payment
      ? {
          id: registration.payment.id,
          cashfreeOrderId: registration.payment.cashfreeOrderId || null,
          cashfreePaymentId: registration.payment.cashfreePaymentId || null,
          amount:
            registration.payment.amount !== null &&
            registration.payment.amount !== undefined
              ? Number(registration.payment.amount)
              : null,
          currency: registration.payment.currency,
          status: registration.payment.status,
          paidAt: registration.payment.paidAt
            ? registration.payment.paidAt.toISOString()
            : null,
          verifiedAt: registration.payment.verifiedAt
            ? registration.payment.verifiedAt.toISOString()
            : null,
          verificationSource: registration.payment.verificationSource || null,
        }
      : null,
  };
}

/**
 * Restricted serializer for public/checkout verification responses.
 * Never exposes raw mobile numbers or internal admin metadata.
 */
export function serializePublicRegistration(registration) {
  if (!registration) return null;
  return {
    id: registration.id,
    registrationCode: registration.registrationCode,
    competitionId: registration.competitionId,
    categoryId: registration.categoryId,
    groupId: registration.groupId || null,
    groupName: registration.groupName || registration.group?.name || null,
    participantName: registration.participantName,
    representingType: registration.representingType || 'GYM',
    gymName: registration.gymName,
    registrationStatus: registration.registrationStatus,
    paymentStatus: registration.paymentStatus,
    trunkNumber:
      registration.trunkNumber !== null && registration.trunkNumber !== undefined
        ? Number(registration.trunkNumber)
        : null,
    isManual: Boolean(
      registration.isManual ||
        registration.payment?.verificationSource === 'ADMIN_MANUAL'
    ),
    source: Boolean(
      registration.isManual ||
        registration.payment?.verificationSource === 'ADMIN_MANUAL'
    )
      ? 'MANUAL'
      : 'ONLINE',
    paymentMethod:
      registration.paymentMethod ||
      (registration.payment?.verificationSource === 'ADMIN_MANUAL'
        ? registration.payment?.currency === 'CASH'
          ? 'Cash'
          : registration.payment?.currency === 'UPI'
            ? 'UPI'
            : 'Pending'
        : registration.payment?.cashfreeOrderId
          ? 'Online'
          : 'N/A'),
    createdAt: registration.createdAt.toISOString(),
    group: registration.group
      ? {
          id: registration.group.id,
          name: registration.group.name,
        }
      : null,
    competition: registration.competition
      ? {
          id: registration.competition.id,
          slug: registration.competition.slug || null,
          name: registration.competition.name,
          competitionType: registration.competition.competitionType,
          registrationFee:
            registration.competition.registrationFee !== null &&
            registration.competition.registrationFee !== undefined
              ? Number(registration.competition.registrationFee)
              : null,
        }
      : null,
    category: registration.category
      ? {
          id: registration.category.id,
          name: registration.category.name,
          gender: registration.category.gender,
          categoryType: registration.category.categoryType,
        }
      : null,
    payment: registration.payment
      ? {
          cashfreeOrderId: registration.payment.cashfreeOrderId,
          cashfreePaymentId: registration.payment.cashfreePaymentId,
          amount:
            registration.payment.amount !== null &&
            registration.payment.amount !== undefined
              ? Number(registration.payment.amount)
              : null,
          currency: registration.payment.currency,
          status: registration.payment.status,
          paidAt: registration.payment.paidAt
            ? registration.payment.paidAt.toISOString()
            : null,
        }
      : null,
  };
}

export function serializeJudge(judge) {
  if (!judge) return null;
  return {
    id: judge.id,
    name: judge.name,
    email: judge.email || null,
    phone: judge.phone || null,
    city: judge.city || null,
    designation: judge.designation || 'Judge',
    isActive: Boolean(judge.isActive),
    createdAt: judge.createdAt instanceof Date ? judge.createdAt.toISOString() : judge.createdAt,
    updatedAt: judge.updatedAt instanceof Date ? judge.updatedAt.toISOString() : judge.updatedAt,
  };
}

export function serializeJudgingSession(session) {
  if (!session) return null;
  const isExpired = new Date(session.expiresAt) <= new Date();
  const effectiveStatus = session.status === 'ACTIVE' && isExpired ? 'EXPIRED' : session.status;
  return {
    id: session.id,
    competitionId: session.competitionId,
    token: session.token,
    status: effectiveStatus,
    expiresAt: session.expiresAt instanceof Date ? session.expiresAt.toISOString() : session.expiresAt,
    revokedAt: session.revokedAt
      ? session.revokedAt instanceof Date
        ? session.revokedAt.toISOString()
        : session.revokedAt
      : null,
    createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
    updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt,
    competition: session.competition ? serializeCompetition(session.competition) : undefined,
  };
}

export function serializeJudgeSelection(selection) {
  if (!selection) return null;
  return {
    id: selection.id,
    sessionId: selection.sessionId,
    judgeId: selection.judgeId,
    registrationId: selection.registrationId,
    categoryId: selection.categoryId,
    groupId: selection.groupId || null,
    createdAt: selection.createdAt instanceof Date ? selection.createdAt.toISOString() : selection.createdAt,
  };
}

export function serializeJudgeRanking(ranking) {
  if (!ranking) return null;
  return {
    id: ranking.id,
    sessionId: ranking.sessionId,
    judgeId: ranking.judgeId,
    registrationId: ranking.registrationId,
    categoryId: ranking.categoryId,
    groupId: ranking.groupId || null,
    rank: ranking.rank,
    title: ranking.title || null,
    createdAt: ranking.createdAt instanceof Date ? ranking.createdAt.toISOString() : ranking.createdAt,
  };
}
