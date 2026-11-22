import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import {
  buildCashfreeOrderId,
  createCashfreeOrder,
  createCheckoutStatusToken,
  fetchCashfreeOrderState,
  verifyCheckoutStatusToken,
} from '../services/cashfree.service.js';
import {
  sendContactEnquiryEmail,
  sendRegistrationAcknowledgementEmail,
} from '../services/email.service.js';
import { settleVerifiedPayment } from '../services/paymentSettlement.service.js';
import { checkEnquiryRateLimit } from '../utils/enquiryRateLimiter.js';
import { HttpError } from '../utils/httpError.js';
import {
  generateRegistrationCode,
  validatePublicRegistration,
} from '../utils/registrationValidation.js';
import {
  serializeCompetition,
  serializePublicRegistration,
} from '../utils/serializers.js';

const PUBLIC_REG_INCLUDE = {
  competition: {
    select: {
      id: true,
      slug: true,
      name: true,
      competitionType: true,
      registrationFee: true,
      eventDate: true,
      venue: true,
      isPublished: true,
      registrationDeadline: true,
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

function validateCompetitionAgeEligibility(ageEligibility, participantAge) {
  if (!ageEligibility) return;
  const aboveMatch = /\babove\s+(\d+)\b/i.exec(ageEligibility);
  if (aboveMatch) {
    const threshold = Number.parseInt(aboveMatch[1], 10);
    if (participantAge <= threshold) {
      throw new HttpError(
        400,
        `Eligibility requirement not met: ${ageEligibility}.`
      );
    }
    return;
  }

  const minMatch = /\b(?:at least|minimum|min\.?|over)\s+(\d+)\b|\b(\d+)\+/i.exec(
    ageEligibility
  );
  if (minMatch) {
    const threshold = Number.parseInt(minMatch[1] || minMatch[2], 10);
    if (participantAge < threshold) {
      throw new HttpError(
        400,
        `Eligibility requirement not met: ${ageEligibility}.`
      );
    }
  }
}

function assertDeadlineOpen(registrationDeadline) {
  if (!registrationDeadline) return;
  const deadlineEnd = new Date(registrationDeadline);
  deadlineEnd.setUTCHours(23, 59, 59, 999);
  if (new Date() > deadlineEnd) {
    throw new HttpError(
      400,
      'Registration deadline for this competition has passed.'
    );
  }
}

async function initiatePaymentAttemptForRegistration(
  prisma,
  registration,
  { returnUrl: customReturnUrl, requestOrigin } = {}
) {
  const competition = registration.competition;

  if (!env.isCashfreeConfigured) {
    return {
      cashfree: {
        configured: false,
        mode: env.cashfreeEnv,
        paymentSessionId: null,
        orderId: null,
        message:
          'Cashfree gateway credentials are not configured yet. Your registration has been saved with Payment Pending status.',
      },
      statusToken: createCheckoutStatusToken(
        registration.id,
        registration.id
      ),
      registration,
    };
  }

  const feeNumber =
    competition?.registrationFee !== null &&
    competition?.registrationFee !== undefined
      ? Number(competition.registrationFee)
      : NaN;
  if (!Number.isFinite(feeNumber) || feeNumber <= 0) {
    throw new HttpError(
      400,
      'Registration fee is not configured for online Cashfree payment.'
    );
  }

  if (registration.payment?.cashfreeOrderId) {
    const priorOrderId = registration.payment.cashfreeOrderId;
    const priorState = await fetchCashfreeOrderState(priorOrderId);
    if (priorState.nextStatus === 'PAID') {
      const settled = await settleVerifiedPayment({
        orderId: priorOrderId,
        nextStatus: 'PAID',
        cfPaymentId: priorState.cfPaymentId,
        paymentAmount: priorState.paymentAmount,
        paymentTime: priorState.paymentTime,
        verificationSource: 'CASHFREE_ORDER_VERIFY',
      });
      return {
        registration: settled,
        cashfree: { configured: true, mode: env.cashfreeEnv, orderId: priorOrderId, paymentSessionId: null },
        statusToken: createCheckoutStatusToken(registration.id, priorOrderId),
      };
    }

    // An order can have several payment attempts. Keep its database mapping so
    // a delayed webhook cannot be orphaned by a replacement order.
    if (String(priorState.orderStatus).toUpperCase() === 'ACTIVE' && priorState.paymentSessionId) {
      return {
        registration,
        cashfree: {
          configured: true,
          mode: env.cashfreeEnv,
          orderId: priorOrderId,
          paymentSessionId: priorState.paymentSessionId,
          message: null,
        },
        statusToken: createCheckoutStatusToken(registration.id, priorOrderId),
      };
    }

    throw new HttpError(409, 'The previous payment order has expired. Contact the organizer to reopen payment.');
  }

  const compRouteKey = encodeURIComponent(
    competition.slug || competition.id
  );
  const cleanAppBase = env.publicAppUrl.replace(/\/+$/, '');

  // One stable order and one Cashfree idempotency key per registration. A
  // timed-out API call can be retried without creating a second remote order.
  const orderId = `CF-${registration.id}`;

  let returnUrl = `${cleanAppBase}/competitions/${compRouteKey}?order_id={order_id}`;

  if (customReturnUrl && typeof customReturnUrl === 'string') {
    try {
      const parsed = new URL(customReturnUrl, cleanAppBase);
      // Strictly prevent participant return URLs from pointing to admin routes
      if (!parsed.pathname.startsWith('/admin')) {
        const searchParams = new URLSearchParams(parsed.search);
        searchParams.set('order_id', '{order_id}');
        searchParams.delete('status_token');
        searchParams.delete('statusToken');
        const rawSearch = searchParams
          .toString()
          .replace('%7Border_id%7D', '{order_id}');
        returnUrl = `${cleanAppBase}${parsed.pathname}${rawSearch ? `?${rawSearch}` : ''}`;
      }
    } catch {
      // Keep default returnUrl if invalid
    }
  }

  const reservation = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM registrations WHERE id = ${registration.id} FOR UPDATE`;
    const current = await tx.registration.findUnique({
      where: { id: registration.id }, include: PUBLIC_REG_INCLUDE,
    });
    if (!current) throw new HttpError(404, 'Registration not found.');
    if (current.paymentStatus === 'REFUNDED' || current.registrationStatus === 'CANCELLED') {
      throw new HttpError(409, 'This registration cannot start a new payment. Contact the organizer.');
    }
    if (current.payment?.cashfreeOrderId || current.paymentStatus === 'PAID') {
      return { current };
    }

    let cfOrder;
    try {
      cfOrder = await createCashfreeOrder({
        orderId,
        idempotencyKey: registration.id,
        amount: feeNumber,
        customerId: registration.registrationCode,
        customerName: current.participantName,
        customerEmail: current.email,
        customerPhone: current.mobileNumber,
        returnUrl,
      });
    } catch (createError) {
      // Cashfree may have created the order before our connection timed out.
      // Recover the same stable order ID, never issue a new one.
      const recovered = await fetchCashfreeOrderState(orderId).catch(() => null);
      if (!recovered?.paymentSessionId || recovered.orderAmount !== feeNumber) throw createError;
      cfOrder = {
        orderId: recovered.orderId,
        paymentSessionId: recovered.paymentSessionId,
      };
    }
    if (cfOrder.orderId !== orderId || !cfOrder.paymentSessionId) {
      throw new HttpError(502, 'Cashfree did not return the expected payment order. Please retry.');
    }
    await tx.payment.upsert({
      where: { registrationId: registration.id },
      create: {
        registrationId: registration.id, cashfreeOrderId: orderId,
        amount: feeNumber, currency: 'INR', status: 'PENDING',
        verificationSource: 'CASHFREE_ORDER_CREATE',
      },
      update: {
        cashfreeOrderId: orderId, amount: feeNumber, currency: 'INR',
        status: 'PENDING', verificationSource: 'CASHFREE_ORDER_CREATE',
      },
    });
    await tx.registration.update({
      where: { id: registration.id }, data: { paymentStatus: 'PENDING' },
    });
    return { cfOrder };
  }, { timeout: 45_000, maxWait: 20_000 });

  if (reservation.current?.paymentStatus === 'PAID') {
    return {
      registration: reservation.current,
      cashfree: { configured: true, mode: env.cashfreeEnv, paymentSessionId: null,
        orderId: reservation.current.payment?.cashfreeOrderId || null },
      statusToken: createCheckoutStatusToken(registration.id, reservation.current.payment?.cashfreeOrderId || registration.id),
    };
  }
  if (reservation.current) {
    return initiatePaymentAttemptForRegistration(prisma, reservation.current, {
      returnUrl: customReturnUrl, requestOrigin,
    });
  }
  const { cfOrder } = reservation;

  const refreshed = await prisma.registration.findUnique({
    where: { id: registration.id },
    include: PUBLIC_REG_INCLUDE,
  });

  return {
    cashfree: {
      configured: true,
      mode: env.cashfreeEnv,
      paymentSessionId: cfOrder.paymentSessionId,
      orderId: cfOrder.orderId,
      message: null,
    },
    statusToken: createCheckoutStatusToken(registration.id, cfOrder.orderId),
    registration: refreshed || registration,
  };
}

export async function listPublishedCompetitions(_req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const prisma = getPrismaClient();
    const competitions = await prisma.competition.findMany({
      where: { isPublished: true, isCompleted: false },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            groups: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      competitions: competitions.map((comp) =>
        serializeCompetition(comp, { filterIneligible: true })
      ),
    });
  } catch (err) {
    next(err);
  }
}

export async function getPublishedCompetition(req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const prisma = getPrismaClient();
    const lookup = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const competition = await prisma.competition.findFirst({
      where: {
        isPublished: true,
        OR: [
          { id: lookup },
          { slug: lookup },
          { slug: lookup.toLowerCase() },
        ],
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            groups: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      competition: serializeCompetition(competition, { filterIneligible: true }),
    });
  } catch (err) {
    next(err);
  }
}

export async function createPublicRegistration(req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const competitionId = req.body?.competitionId;
    if (!competitionId) {
      throw new HttpError(400, 'Competition is required.');
    }

    const prisma = getPrismaClient();
    const competition = await prisma.competition.findFirst({
      where: {
        id: competitionId,
        isPublished: true,
      },
      include: {
        categories: {
          include: {
            groups: true,
          },
        },
      },
    });

    if (!competition) {
      throw new HttpError(
        404,
        'Published competition not found for registration.'
      );
    }

    if (competition.isCompleted) {
      throw new HttpError(
        400,
        'This competition has concluded and is no longer accepting new registrations.'
      );
    }

    if (competition.eventDate) {
      const eventDate = new Date(competition.eventDate);
      eventDate.setUTCHours(23, 59, 59, 999);
      if (new Date() > eventDate) {
        throw new HttpError(
          400,
          'This competition has already taken place. Registrations are closed.'
        );
      }
    }

    if (competition.isRegistrationClosed) {
      throw new HttpError(
        400,
        'Registrations for this competition have been closed by the organizer.'
      );
    }

    assertDeadlineOpen(competition.registrationDeadline);

    const input = validatePublicRegistration(req.body, competition);

    if (!input.categoryId && competition.competitionType === 'Masters' && competition.categories.length > 0) {
      input.categoryId = competition.categories[0].id;
    }

    const category = competition.categories.find(
      (cat) => cat.id === input.categoryId
    );
    if (!category) {
      throw new HttpError(
        400,
        'Selected category does not belong to this competition.'
      );
    }

    let resolvedGroup = null;
    if (input.groupId) {
      resolvedGroup = (category.groups || []).find((g) => g.id === input.groupId);
      if (!resolvedGroup) {
        throw new HttpError(
          400,
          'Selected group/division does not belong to this category.'
        );
      }
    }

    if (
      (competition.genderEligibility === 'MALE_ONLY' ||
        ['Bodybuilding', "Men's Physique", 'Masters'].includes(
          competition.competitionType
        )) &&
      (input.gender !== 'MALE' || category.gender === 'FEMALE')
    ) {
      throw new HttpError(
        400,
        'This competition is restricted to Male participants.'
      );
    }

    if (
      (competition.genderEligibility === 'FEMALE_ONLY' ||
        competition.competitionType === "Women's Competition") &&
      (input.gender !== 'FEMALE' || category.gender === 'MALE')
    ) {
      throw new HttpError(
        400,
        'This competition is restricted to Female participants.'
      );
    }

    if (category.gender === 'MALE' && input.gender !== 'MALE') {
      throw new HttpError(
        400,
        `Category "${category.name}" is restricted to Male participants.`
      );
    }

    if (category.gender === 'FEMALE' && input.gender !== 'FEMALE') {
      throw new HttpError(
        400,
        `Category "${category.name}" is restricted to Female participants.`
      );
    }

    validateCompetitionAgeEligibility(competition.ageEligibility, input.age);

    if (
      competition.competitionType === 'Masters' ||
      (competition.ageEligibility && /above\s*40/i.test(competition.ageEligibility))
    ) {
      if (input.age <= 40) {
        throw new HttpError(
          400,
          'Eligibility requirement not met: Masters competition eligibility strictly requires participant age to be above 40 years.'
        );
      }
    }

    // Check existing record before creating a new row so retries never duplicate registrations.
    const existing = await prisma.registration.findUnique({
      where: {
        competitionId_email: {
          competitionId: competition.id,
          email: input.email,
        },
      },
      include: PUBLIC_REG_INCLUDE,
    });

    if (existing) {
      if (existing.paymentStatus === 'REFUNDED') {
        throw new HttpError(409, 'This registration was refunded. Contact the organizer for a new payment.');
      }
      const existingToken = req.body?.statusToken;
      const ownsExistingCheckout =
        verifyCheckoutStatusToken(existingToken, existing.id, existing.id) ||
        (existing.payment?.cashfreeOrderId &&
          verifyCheckoutStatusToken(
            existingToken,
            existing.id,
            existing.payment.cashfreeOrderId
          ));

      if (
        existing.paymentStatus === 'PAID' &&
        existing.registrationStatus === 'CONFIRMED'
      ) {
        throw new HttpError(
          409,
          'This candidate is already registered for this competition.'
        );
      }

      if (!ownsExistingCheckout) {
        throw new HttpError(
          409,
          'A registration already exists for this email. Continue from your original checkout session.'
        );
      }

      // If an earlier Cashfree order exists, check server-side in case delayed notification succeeded.
      if (existing.payment?.cashfreeOrderId && env.isCashfreeConfigured) {
        const orderState = await fetchCashfreeOrderState(
          existing.payment.cashfreeOrderId
        );
        if (orderState.nextStatus === 'PAID') {
          await settleVerifiedPayment({
            orderId: existing.payment.cashfreeOrderId,
            nextStatus: 'PAID',
            cfPaymentId: orderState.cfPaymentId,
            paymentAmount: orderState.paymentAmount,
            paymentTime: orderState.paymentTime,
            verificationSource: 'CASHFREE_ORDER_VERIFY',
          });
          throw new HttpError(
            409,
            'This candidate is already registered for this competition.'
          );
        }
      }
    }

    const registrationRecord = await prisma.$transaction(async (tx) => {
      if (existing) {
        return tx.registration.update({
          where: { id: existing.id },
          data: {
            categoryId: category.id,
            groupId: resolvedGroup ? resolvedGroup.id : null,
            groupName: resolvedGroup ? resolvedGroup.name : null,
            participantName: input.participantName,
            mobileNumber: input.mobileNumber,
            gender: input.gender,
            age: input.age,
            heightCm: input.heightCm,
            weightKg: input.weightKg,
            district: input.district,
            representingType: input.representingType,
            gymName: input.gymName,
          },
          include: PUBLIC_REG_INCLUDE,
        });
      }

      if (competition.maxParticipants !== null) {
        const activeCount = await tx.registration.count({
          where: {
            competitionId: competition.id,
            registrationStatus: { not: 'CANCELLED' },
          },
        });
        if (activeCount >= competition.maxParticipants) {
          throw new HttpError(
            409,
            'This competition has reached its maximum participant limit.'
          );
        }
      }

      return tx.registration.create({
        data: {
          registrationCode: generateRegistrationCode(),
          competitionId: competition.id,
          categoryId: category.id,
          groupId: resolvedGroup ? resolvedGroup.id : null,
          groupName: resolvedGroup ? resolvedGroup.name : null,
          participantName: input.participantName,
          email: input.email,
          mobileNumber: input.mobileNumber,
          gender: input.gender,
          age: input.age,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          district: input.district,
          representingType: input.representingType,
          gymName: input.gymName,
          registrationStatus: 'PENDING',
          paymentStatus: 'PENDING',
        },
        include: PUBLIC_REG_INCLUDE,
      });
    });

    const paymentInit = await initiatePaymentAttemptForRegistration(
      prisma,
      registrationRecord,
      {
        returnUrl: req.body?.returnUrl,
        requestOrigin: req.headers?.origin,
      }
    );

    sendRegistrationAcknowledgementEmail(registrationRecord.id).catch(
      (emailErr) => {
        console.error(
          `[email] Async acknowledgement email failed for registration ${registrationRecord.id}:`,
          emailErr?.message || emailErr
        );
      }
    );

    res.status(existing ? 200 : 201).json({
      reusedPendingRegistration: Boolean(existing),
      registration: serializePublicRegistration(paymentInit.registration),
      cashfree: paymentInit.cashfree,
      statusToken: paymentInit.statusToken,
      acknowledgementEmail: { queued: true },
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      next(
        new HttpError(
          409,
          'This candidate is already registered for this competition.'
        )
      );
      return;
    }
    next(err);
  }
}

export async function retryRegistrationPayment(req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const prisma = getPrismaClient();
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: PUBLIC_REG_INCLUDE,
    });

    if (!registration || !registration.competition?.isPublished) {
      throw new HttpError(404, 'Registration not found.');
    }

    if (registration.paymentStatus === 'REFUNDED') {
      throw new HttpError(409, 'This registration was refunded. Contact the organizer for a new payment.');
    }

    if (registration.competition?.isCompleted) {
      throw new HttpError(
        400,
        'This competition has concluded. Payments are no longer accepted.'
      );
    }

    if (registration.competition?.eventDate) {
      const eventDate = new Date(registration.competition.eventDate);
      eventDate.setUTCHours(23, 59, 59, 999);
      if (new Date() > eventDate) {
        throw new HttpError(
          400,
          'This competition has already taken place. Payments are no longer accepted.'
        );
      }
    }

    if (registration.competition?.isRegistrationClosed) {
      throw new HttpError(
        400,
        'Registrations for this competition have been closed. Payments are no longer accepted.'
      );
    }

    if (registration.competition?.registrationDeadline) {
      const deadline = new Date(registration.competition.registrationDeadline);
      deadline.setUTCHours(23, 59, 59, 999);
      if (new Date() > deadline) {
        throw new HttpError(
          400,
          'Registration deadline has passed. Payments are no longer accepted.'
        );
      }
    }

    const bodyToken = req.body?.statusToken;
    const tokenAuthorized =
      verifyCheckoutStatusToken(bodyToken, registration.id, registration.id) ||
      (registration.payment?.cashfreeOrderId &&
        verifyCheckoutStatusToken(
          bodyToken,
          registration.id,
          registration.payment.cashfreeOrderId
        ));

    if (!tokenAuthorized) {
      throw new HttpError(
        403,
        'Invalid checkout session to retry payment.'
      );
    }

    if (
      registration.paymentStatus === 'PAID' &&
      registration.registrationStatus === 'CONFIRMED'
    ) {
      return res.status(200).json({
        alreadyPaid: true,
        registration: serializePublicRegistration(registration),
        cashfree: {
          configured: env.isCashfreeConfigured,
          mode: env.cashfreeEnv,
          paymentSessionId: null,
          orderId: registration.payment?.cashfreeOrderId || null,
          message: 'Payment is already verified and registration is confirmed.',
        },
        statusToken: createCheckoutStatusToken(
          registration.id,
          registration.payment?.cashfreeOrderId || registration.id
        ),
      });
    }

    assertDeadlineOpen(registration.competition.registrationDeadline);

    // Check existing order on Cashfree first in case a delayed payment actually completed.
    if (registration.payment?.cashfreeOrderId && env.isCashfreeConfigured) {
      const orderState = await fetchCashfreeOrderState(
        registration.payment.cashfreeOrderId
      );
      if (orderState.nextStatus === 'PAID') {
        const settled = await settleVerifiedPayment({
          orderId: registration.payment.cashfreeOrderId,
          nextStatus: 'PAID',
          cfPaymentId: orderState.cfPaymentId,
          paymentAmount: orderState.paymentAmount,
          paymentTime: orderState.paymentTime,
          verificationSource: 'CASHFREE_ORDER_VERIFY',
        });
        return res.status(200).json({
          alreadyPaid: true,
          registration: serializePublicRegistration(settled),
          cashfree: {
            configured: true,
            mode: env.cashfreeEnv,
            paymentSessionId: null,
            orderId: registration.payment.cashfreeOrderId,
            message: 'Payment was verified and your registration is confirmed.',
          },
          statusToken: createCheckoutStatusToken(
            settled.id,
            registration.payment.cashfreeOrderId
          ),
        });
      }
    }

    const paymentInit = await initiatePaymentAttemptForRegistration(
      prisma,
      registration,
      {
        returnUrl: req.body?.returnUrl,
        requestOrigin: req.headers?.origin,
      }
    );

    return res.status(200).json({
      alreadyPaid: false,
      registration: serializePublicRegistration(paymentInit.registration),
      cashfree: paymentInit.cashfree,
      statusToken: paymentInit.statusToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPublicOrderPayment(req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const orderId =
      typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    const statusToken = req.body?.statusToken;

    if (!orderId) {
      throw new HttpError(400, 'Cashfree orderId is required for verification.');
    }

    const prisma = getPrismaClient();
    const paymentRecord = await prisma.payment.findUnique({
      where: { cashfreeOrderId: orderId },
      include: {
        registration: {
          include: PUBLIC_REG_INCLUDE,
        },
      },
    });

    if (!paymentRecord) {
      throw new HttpError(404, 'Matching payment order not found.');
    }

    const effectiveToken = statusToken || req.body?.status_token;

    const tokenAuthorized = verifyCheckoutStatusToken(
      effectiveToken,
      paymentRecord.registrationId,
      orderId
    );
    if (!tokenAuthorized) {
      throw new HttpError(
        403,
        'Unable to verify this payment without an authorized session.'
      );
    }

    if (!env.isCashfreeConfigured) {
      throw new HttpError(
        503,
        'Cashfree payment verification credentials are not configured yet.'
      );
    }

    const cfState = await fetchCashfreeOrderState(orderId);

    const updatedRegistration = await settleVerifiedPayment({
      orderId,
      nextStatus: cfState.nextStatus,
      cfPaymentId: cfState.cfPaymentId,
      paymentAmount: cfState.paymentAmount,
      paymentTime: cfState.paymentTime,
      verificationSource: 'CASHFREE_ORDER_VERIFY',
    });

    res.status(200).json({
      verified: updatedRegistration.paymentStatus === 'PAID',
      orderStatus: cfState.orderStatus,
      registration: serializePublicRegistration(updatedRegistration),
      statusToken: createCheckoutStatusToken(updatedRegistration.id, orderId),
    });
  } catch (err) {
    next(err);
  }
}

export async function checkCompetitionRegistration(req, res, next) {
  try {
    if (!env.isDatabaseConfigured) {
      throw new HttpError(503, 'Database is not configured yet.');
    }

    const prisma = getPrismaClient();
    const lookup = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    const competition = await prisma.competition.findFirst({
      where: {
        isPublished: true,
        OR: [
          { id: lookup },
          { slug: lookup },
          { slug: lookup.toLowerCase() },
        ],
      },
      select: { id: true, name: true, isPublished: true },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    const email = String(req.body?.email || req.query.email || '')
      .trim()
      .toLowerCase();
    const statusToken = req.body?.statusToken || req.query.statusToken;

    if (!email) {
      return res.status(200).json({
        registered: false,
        registration: null,
      });
    }

    const registration = await prisma.registration.findFirst({
      where: {
        competitionId: competition.id,
        email,
        registrationStatus: { not: 'CANCELLED' },
      },
      include: PUBLIC_REG_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    if (!registration) {
      return res.status(200).json({
        registered: false,
        registration: null,
      });
    }

    const isPaid =
      registration.paymentStatus === 'PAID' &&
      registration.registrationStatus === 'CONFIRMED';

    const canRetryPayment = !isPaid && registration.registrationStatus !== 'CANCELLED';

    const tokenAuthorized =
      verifyCheckoutStatusToken(statusToken, registration.id, registration.id) ||
      (registration.payment?.cashfreeOrderId &&
        verifyCheckoutStatusToken(
          statusToken,
          registration.id,
          registration.payment.cashfreeOrderId
        ));

    if (!tokenAuthorized) {
      return res.status(200).json({ registered: false, registration: null });
    }

    return res.status(200).json({
      registered: true,
      isPaid,
      canRetryPayment,
      registration: serializePublicRegistration(registration),
      statusToken: createCheckoutStatusToken(
        registration.id,
        registration.payment?.cashfreeOrderId || registration.id
      ),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles public website contact enquiries.
 * Validates, sanitizes input, applies spam protection (honeypot + rate limiter),
 * and dispatches notification email to bodyzone82@gmail.com.
 */
export async function submitContactEnquiry(req, res, next) {
  try {
    const { name, email, phone, subject, message, hp_website } = req.body || {};

    // 1. Honeypot check (hidden field to trap automated bots)
    if (hp_website) {
      return res.status(400).json({
        success: false,
        message: 'Spam submission detected.',
      });
    }

    // 2. In-memory Rate Limiting per client IP
    const clientIp =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      'unknown';
    checkEnquiryRateLimit(clientIp);

    // 3. Validation & Sanitization
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
      throw new HttpError(
        400,
        'Please enter your full name (2 to 100 characters).'
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail) || trimmedEmail.length > 150) {
      throw new HttpError(400, 'Please enter a valid email address.');
    }

    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (!trimmedPhone || phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new HttpError(
        400,
        'Please enter a valid phone number with at least 10 digits.'
      );
    }

    if (!trimmedSubject || trimmedSubject.length < 3 || trimmedSubject.length > 150) {
      throw new HttpError(
        400,
        'Please enter a subject (3 to 150 characters).'
      );
    }

    if (!trimmedMessage || trimmedMessage.length < 10 || trimmedMessage.length > 3000) {
      throw new HttpError(
        400,
        'Please enter a message (10 to 3000 characters).'
      );
    }

    // 4. Send email notification to bodyzone82@gmail.com
    const result = await sendContactEnquiryEmail({
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      subject: trimmedSubject,
      message: trimmedMessage,
    });

    if (!result.sent) {
      if (result.reason === 'EMAIL_NOT_CONFIGURED') {
        throw new HttpError(503, result.message);
      }
      throw new HttpError(
        500,
        result.message || 'Failed to deliver enquiry email.'
      );
    }

    return res.status(200).json({
      success: true,
      message:
        'Thank you! Your enquiry has been received and our team will get in touch with you shortly.',
    });
  } catch (err) {
    next(err);
  }
}
