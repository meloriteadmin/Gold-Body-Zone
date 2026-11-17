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

  const compRouteKey = encodeURIComponent(
    competition.slug || competition.id
  );
  const cleanAppBase = (
    env.publicAppUrl || 'https://gold-body-zone.vercel.app'
  ).replace(/\/+$/, '');

  let returnUrl = `${cleanAppBase}/competitions/${compRouteKey}?order_id={order_id}`;

  if (customReturnUrl && typeof customReturnUrl === 'string') {
    try {
      const parsed = new URL(customReturnUrl, cleanAppBase);
      const searchParams = new URLSearchParams(parsed.search);
      if (!searchParams.has('order_id')) {
        searchParams.set('order_id', '{order_id}');
      }
      const rawSearch = searchParams
        .toString()
        .replace('%7Border_id%7D', '{order_id}');
      returnUrl = `${cleanAppBase}${parsed.pathname}${rawSearch ? `?${rawSearch}` : ''}`;
    } catch {
      // Keep default returnUrl if invalid
    }
  }

  // Always generate a fresh Cashfree order and session for the payment attempt
  // while reusing the existing registration and database record.
  const orderId = buildCashfreeOrderId(registration.registrationCode);
  const cfOrder = await createCashfreeOrder({
    orderId,
    amount: feeNumber,
    customerId: registration.registrationCode,
    customerName: registration.participantName,
    customerEmail: registration.email,
    customerPhone: registration.mobileNumber,
    returnUrl,
  });

  await prisma.$transaction([
    prisma.payment.upsert({
      where: { registrationId: registration.id },
      create: {
        registrationId: registration.id,
        cashfreeOrderId: cfOrder.orderId,
        cashfreePaymentId: null,
        amount: feeNumber,
        currency: 'INR',
        status: 'PENDING',
        paidAt: null,
        verifiedAt: null,
        verificationSource: 'CASHFREE_ORDER_CREATE',
      },
      update: {
        cashfreeOrderId: cfOrder.orderId,
        cashfreePaymentId: null,
        amount: feeNumber,
        currency: 'INR',
        status: 'PENDING',
        paidAt: null,
        verifiedAt: null,
        verificationSource: 'CASHFREE_ORDER_CREATE',
      },
    }),
    prisma.registration.update({
      where: { id: registration.id },
      data: { paymentStatus: 'PENDING' },
    }),
  ]);

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

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
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

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
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
      if (
        existing.paymentStatus === 'PAID' &&
        existing.registrationStatus === 'CONFIRMED'
      ) {
        throw new HttpError(
          409,
          'This candidate is already registered for this competition.'
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

    if (bodyToken && !tokenAuthorized) {
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

    const tokenAuthorized = verifyCheckoutStatusToken(
      statusToken,
      paymentRecord.registrationId,
      orderId
    );
    const jwtAuthorized =
      Boolean(req.participantEmail) &&
      req.participantEmail === paymentRecord.registration.email;

    if (!tokenAuthorized && !jwtAuthorized) {
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

function parseJwtClaimsSafely(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
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

    let authEmail = null;
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const claims = parseJwtClaimsSafely(authHeader.slice(7).trim());
      if (claims?.email) {
        authEmail = claims.email.trim().toLowerCase();
      }
    }

    const email = (req.body?.email || req.query.email || authEmail || '')
      .trim()
      .toLowerCase();
    const mobileNumber = String(req.body?.mobileNumber || req.query.mobileNumber || '').trim();
    const registrationId = String(req.body?.registrationId || req.query.registrationId || '').trim();

    if (!email && !mobileNumber && !registrationId) {
      return res.status(200).json({
        registered: false,
        registration: null,
      });
    }

    const orConditions = [];
    if (registrationId) orConditions.push({ id: registrationId });
    if (email) {
      orConditions.push({ email });
    } else if (mobileNumber) {
      orConditions.push({ mobileNumber });
    }

    const registration = await prisma.registration.findFirst({
      where: {
        competitionId: competition.id,
        OR: orConditions,
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

    const statusToken = createCheckoutStatusToken(
      registration.id,
      registration.payment?.cashfreeOrderId || registration.id
    );

    return res.status(200).json({
      registered: true,
      isPaid,
      canRetryPayment,
      registration: serializePublicRegistration(registration),
      statusToken,
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
