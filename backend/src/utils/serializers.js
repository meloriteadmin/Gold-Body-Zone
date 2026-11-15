import {
  computeCompetitionStatus,
  computeRegistrationStatus,
} from './competitionValidation.js';

export function serializeCompetition(competition, options = {}) {
  if (!competition) return null;

  const paidRegistrations = (competition.registrations || []).filter(
    (r) => r.paymentStatus === 'PAID' || r.payment?.status === 'PAID'
  );
  const totalRevenue = paidRegistrations.reduce((sum, r) => {
    const amt = Number(r.payment?.amount ?? competition.registrationFee ?? 0);
    return sum + (Number.isNaN(amt) ? 0 : amt);
  }, 0);

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
    status: computeCompetitionStatus(competition),
    registrationStatus: computeRegistrationStatus(competition),
    isDefault: competition.isDefault,
    createdAt: competition.createdAt.toISOString(),
    updatedAt: competition.updatedAt.toISOString(),
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
        (r) => r.paymentStatus !== 'PAID' && r.payment?.status !== 'PAID'
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

export function serializeAdminProfile(profile, authUser = null) {
  if (!profile) return null;
  return {
    id: profile.id,
    authUserId: profile.authUserId,
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    role: profile.role,
    isActive: profile.isActive,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    lastSignInAt: authUser?.last_sign_in_at || null,
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
