export function serializeCompetition(competition) {
  if (!competition) return null;
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
    isDefault: competition.isDefault,
    createdAt: competition.createdAt.toISOString(),
    updatedAt: competition.updatedAt.toISOString(),
    categories: (competition.categories || []).map((cat) => ({
      id: cat.id,
      competitionId: cat.competitionId,
      categoryType: cat.categoryType,
      gender: cat.gender,
      name: cat.name,
      ruleNote: cat.ruleNote,
      sortOrder: cat.sortOrder,
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
    participantName: registration.participantName,
    email: registration.email,
    mobileNumber: registration.mobileNumber,
    gender: registration.gender,
    age: registration.age,
    heightCm: Number(registration.heightCm),
    weightKg: Number(registration.weightKg),
    district: registration.district,
    representingType: registration.representingType || 'GYM',
    gymName: registration.gymName,
    confirmationEmailSentAt: registration.confirmationEmailSentAt
      ? registration.confirmationEmailSentAt.toISOString()
      : null,
    registrationStatus: registration.registrationStatus,
    paymentStatus: registration.paymentStatus,
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
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
    payment: registration.payment
      ? {
          id: registration.payment.id,
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
    participantName: registration.participantName,
    representingType: registration.representingType || 'GYM',
    gymName: registration.gymName,
    registrationStatus: registration.registrationStatus,
    paymentStatus: registration.paymentStatus,
    createdAt: registration.createdAt.toISOString(),
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
