import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import {
  buildCashfreeOrderId,
  createCashfreeOrder,
  createCashfreeUpiQr,
  fetchCashfreeOrderState,
} from '../services/cashfree.service.js';
import { sendRegistrationConfirmationEmail } from '../services/email.service.js';
import {
  generateRegistrationsCsv,
  generateRegistrationsExcel,
} from '../services/export.service.js';
import { settleVerifiedPayment } from '../services/paymentSettlement.service.js';
import { categoryMatchesMeasurements } from '../services/categoryRules.js';
import { HttpError } from '../utils/httpError.js';
import {
  generateRegistrationCode,
  validatePublicRegistration,
  validateRegistrationStatusUpdate,
} from '../utils/registrationValidation.js';
import { serializeRegistration } from '../utils/serializers.js';

const REGISTRATION_INCLUDE = {
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

const VALID_PAYMENT_STATUSES = new Set([
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
]);

const VALID_REGISTRATION_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
]);

/**
 * Overall registration counts for a competition (independent of pagination,
 * search and status filters). Respects the All / Online / Manual source tab.
 */
async function buildRegistrationSummary(prisma, competitionId, source) {
  const base = { competitionId };
  if (source === 'ONLINE') base.isManual = false;
  else if (source === 'MANUAL') base.isManual = true;

  const [total, confirmed, paid, unpaid, cancelled] = await Promise.all([
    prisma.registration.count({ where: base }),
    prisma.registration.count({ where: { ...base, registrationStatus: 'CONFIRMED' } }),
    prisma.registration.count({ where: { ...base, paymentStatus: 'PAID' } }),
    prisma.registration.count({ where: { ...base, paymentStatus: { not: 'PAID' } } }),
    prisma.registration.count({ where: { ...base, registrationStatus: 'CANCELLED' } }),
  ]);

  return { total, confirmed, paid, unpaid, cancelled };
}

export async function listRegistrations(req, res, next) {
  try {
    const prisma = getPrismaClient();

    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const competitionId =
      typeof req.query.competitionId === 'string'
        ? req.query.competitionId.trim()
        : '';
    const categoryId =
      typeof req.query.categoryId === 'string'
        ? req.query.categoryId.trim()
        : '';
    const groupId =
      typeof req.query.groupId === 'string'
        ? req.query.groupId.trim()
        : '';
    const registrationStatus =
      typeof req.query.registrationStatus === 'string'
        ? req.query.registrationStatus.trim().toUpperCase()
        : '';
    const paymentStatus =
      typeof req.query.paymentStatus === 'string'
        ? req.query.paymentStatus.trim().toUpperCase()
        : '';
    const source =
      typeof req.query.source === 'string'
        ? req.query.source.trim().toUpperCase()
        : '';
    const sortOrder = req.query.sort === 'oldest' ? 'asc' : 'desc';

    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit || '15', 10) || 15)
    );

    const where = {};

    if (search) {
      where.OR = [
        { participantName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search, mode: 'insensitive' } },
        { registrationCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (competitionId) {
      where.competitionId = competitionId;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (groupId) {
      where.groupId = groupId;
    }

    if (
      registrationStatus &&
      VALID_REGISTRATION_STATUSES.has(registrationStatus)
    ) {
      where.registrationStatus = registrationStatus;
    }

    if (paymentStatus && VALID_PAYMENT_STATUSES.has(paymentStatus)) {
      where.paymentStatus = paymentStatus;
    }

    if (source === 'ONLINE') {
      where.isManual = false;
    } else if (source === 'MANUAL') {
      where.isManual = true;
    }

    const [total, registrations, summary] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        include: REGISTRATION_INCLUDE,
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      competitionId ? buildRegistrationSummary(prisma, competitionId, source) : null,
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.status(200).json({
      registrations: registrations.map(serializeRegistration),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      // Overall counts for the whole competition (not only the current page).
      summary,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRegistrationById(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: REGISTRATION_INCLUDE,
    });

    if (!registration) {
      throw new HttpError(404, 'Registration not found.');
    }

    res.status(200).json({
      registration: serializeRegistration(registration),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRegistrationStatus(req, res, next) {
  try {
    if (req.body.paymentStatus !== undefined) {
      throw new HttpError(
        403,
        'Payment status can only be updated by verified backend payment checks or Cashfree webhooks.'
      );
    }

    const nextStatus = validateRegistrationStatusUpdate(
      req.body.registrationStatus
    );
    const prisma = getPrismaClient();

    const existing = await prisma.registration.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Registration not found.');
    }

    if (nextStatus === 'CANCELLED') {
      const openHeat = await prisma.liveHeat.findFirst({ where: { competitionId: existing.competitionId, status: 'OPEN' }, select: { participantIds: true } });
      if (Array.isArray(openHeat?.participantIds) && openHeat.participantIds.includes(existing.id)) {
        throw new HttpError(400, 'Close or cancel the active judging form before removing this participant.');
      }
    }

    const updated = await prisma.registration.update({
      where: { id: existing.id },
      data: {
        registrationStatus: nextStatus,
      },
      include: REGISTRATION_INCLUDE,
    });

    res.status(200).json({
      registration: serializeRegistration(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function resendRegistrationConfirmationEmail(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.registration.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Registration not found.');
    }

    if (
      existing.paymentStatus !== 'PAID' ||
      existing.registrationStatus !== 'CONFIRMED'
    ) {
      throw new HttpError(
        400,
        'Confirmation email can only be sent for confirmed registrations with PAID status.'
      );
    }

    if (existing.confirmationEmailSentAt) {
      return res.status(200).json({
        sent: false,
        alreadySent: true,
        confirmationEmailSentAt: existing.confirmationEmailSentAt.toISOString(),
      });
    }

    const emailResult = await sendRegistrationConfirmationEmail(existing.id);

    if (emailResult.reason === 'EMAIL_NOT_CONFIGURED') {
      throw new HttpError(
        503,
        emailResult.message || 'SMTP email credentials are not configured.'
      );
    }

    if (!emailResult.sent) {
      throw new HttpError(
        502,
        emailResult.message || 'Failed to send confirmation email via SMTP.'
      );
    }

    return res.status(200).json({
      sent: true,
      alreadySent: false,
    });
  } catch (err) {
    next(err);
  }
}

function validateCompetitionAgeEligibility(ageEligibility, participantAge) {
  if (!ageEligibility) return;
  const aboveMatch = /\babove\s+(\d+)\b/i.exec(ageEligibility);
  if (aboveMatch) {
    const threshold = Number.parseInt(aboveMatch[1], 10);
    if (participantAge <= threshold) {
      throw new HttpError(
        400,
        `Ineligible: ${ageEligibility} (participant must be above ${threshold} years).`
      );
    }
  }
}

export async function createManualRegistration(req, res, next) {
  try {
    const prisma = getPrismaClient();

    const competitionId = req.body?.competitionId;
    if (!competitionId) {
      throw new HttpError(400, 'Competition is required.');
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        categories: {
          include: {
            groups: true,
          },
        },
      },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    if (competition.isCompleted) {
      throw new HttpError(
        400,
        'Cannot create manual registration for a completed competition.'
      );
    }

    if (competition.eventDate) {
      const eventDate = new Date(competition.eventDate);
      eventDate.setUTCHours(23, 59, 59, 999);
      if (new Date() > eventDate) {
        throw new HttpError(
          400,
          'Cannot create manual registration for a competition that has already taken place.'
        );
      }
    }

    const VALID_MANUAL_PAYMENT_METHODS = new Set([
      'CASH',
      'UPI',
      'PENDING',
      'OFFLINE',
      'ONLINE',
    ]);
    const rawMethod =
      typeof req.body?.paymentMethod === 'string'
        ? req.body.paymentMethod.trim().toUpperCase()
        : '';
    if (!VALID_MANUAL_PAYMENT_METHODS.has(rawMethod)) {
      throw new HttpError(
        400,
        'Invalid payment method. Expected Cash, UPI, Offline, Online, or Pending.'
      );
    }

    const validated = validatePublicRegistration(req.body, competition);

    validateCompetitionAgeEligibility(
      competition.ageEligibility,
      validated.age
    );

    const targetCategory = competition.categories.find(
      (c) => c.id === validated.categoryId
    );
    if (!targetCategory) {
      throw new HttpError(
        400,
        'The selected category does not belong to this competition.'
      );
    }
    if (!categoryMatchesMeasurements(targetCategory, validated.weightKg, validated.heightCm)) {
      throw new HttpError(400, `Measurements do not fit ${targetCategory.name}. Select the matching category.`);
    }

    let targetGroup = null;
    if (validated.groupId) {
      targetGroup = (targetCategory.groups || []).find(
        (g) => g.id === validated.groupId
      );
      if (!targetGroup) {
        throw new HttpError(
          400,
          'The selected group does not belong to the chosen category.'
        );
      }
    }

    const existing = await prisma.registration.findUnique({
      where: {
        competitionId_email: {
          competitionId: competition.id,
          email: validated.email,
        },
      },
      include: { payment: true },
    });

    if (existing && existing.paymentStatus === 'PAID') {
      throw new HttpError(
        409,
        `Participant with email "${validated.email}" is already registered and confirmed for this competition.`
      );
    }

    const registrationCode = existing?.registrationCode || generateRegistrationCode();

    const isOnline = rawMethod === 'UPI' || rawMethod === 'ONLINE';
    const isOffline = rawMethod === 'CASH' || rawMethod === 'OFFLINE';

    let isPaid = false;
    let regStatus = 'PENDING';
    let payStatus = 'PENDING';
    let verificationSource = 'ADMIN_MANUAL';
    let paymentMethodStored = rawMethod;

    if (isOffline) {
      // Offline payment marked Paid only after admin confirmation
      isPaid =
        req.body.offlineConfirmed !== undefined
          ? Boolean(req.body.offlineConfirmed)
          : true;
      regStatus = isPaid ? 'CONFIRMED' : 'PENDING';
      payStatus = isPaid ? 'PAID' : 'PENDING';

      const refText =
        typeof req.body.paymentReference === 'string' &&
        req.body.paymentReference.trim()
          ? req.body.paymentReference.trim()
          : '';
      verificationSource = refText
        ? (rawMethod === 'CASH' ? `ADMIN_MANUAL (${refText})` : `ADMIN_OFFLINE (${refText})`)
        : 'ADMIN_MANUAL';

      const offType =
        typeof req.body.offlinePaymentMethod === 'string' &&
        req.body.offlinePaymentMethod.trim()
          ? req.body.offlinePaymentMethod.trim()
          : (rawMethod === 'CASH' ? 'CASH' : 'Cash');
      paymentMethodStored = rawMethod === 'CASH' && !req.body.offlinePaymentMethod ? 'CASH' : offType;
    } else if (isOnline) {
      // Online payment via Cashfree must be verified before marking Confirmed / Paid
      isPaid = false;
      regStatus = 'PENDING';
      payStatus = 'PENDING';
      verificationSource = 'ADMIN_MANUAL_UPI_QR';
      paymentMethodStored = 'UPI';
    } else {
      isPaid = false;
      regStatus = 'PENDING';
      payStatus = 'PENDING';
      verificationSource = 'ADMIN_MANUAL_PENDING';
      paymentMethodStored = 'PENDING';
    }

    const cashfreeOrderId = isOnline
      ? buildCashfreeOrderId(registrationCode)
      : null;

    const registration = await prisma.$transaction(async (tx) => {
      const requestedTrunk = req.body.trunkNumber === '' || req.body.trunkNumber == null ? null : Number(req.body.trunkNumber);
      if (requestedTrunk !== null && (!Number.isInteger(requestedTrunk) || requestedTrunk < 1 || requestedTrunk > 99999)) {
        throw new HttpError(400, 'Trunk number must be a positive whole number.');
      }
      const trunkNumberToAssign = requestedTrunk ?? existing?.trunkNumber ?? undefined;
      if (requestedTrunk !== null) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competition.id}))`;
        const duplicate = await tx.registration.findFirst({ where: { competitionId: competition.id, trunkNumber: requestedTrunk, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { participantName: true } });
        if (duplicate) throw new HttpError(409, `Trunk number ${requestedTrunk} is already assigned to ${duplicate.participantName} in this competition.`);
      }

      if (existing) {
        await tx.payment.deleteMany({ where: { registrationId: existing.id } });
        return tx.registration.update({
          where: { id: existing.id },
          data: {
            categoryId: targetCategory.id,
            groupId: targetGroup?.id || null,
            groupName: targetGroup?.name || null,
            participantName: validated.participantName,
            email: validated.email,
            mobileNumber: validated.mobileNumber,
            gender: validated.gender,
            age: validated.age,
            heightCm: validated.heightCm,
            weightKg: validated.weightKg,
            district: validated.district,
            representingType: validated.representingType,
            gymName: validated.gymName,
            registrationStatus: regStatus,
            paymentStatus: payStatus,
            ...(trunkNumberToAssign !== undefined
              ? { trunkNumber: trunkNumberToAssign }
              : {}),
            isManual: true,
            paymentMethod: paymentMethodStored,
            payment: {
              create: {
                amount: competition.registrationFee,
                currency: 'INR',
                status: payStatus,
                cashfreeOrderId,
                paidAt: isPaid ? new Date() : null,
                verifiedAt: isPaid ? new Date() : null,
                verificationSource,
              },
            },
          },
          include: REGISTRATION_INCLUDE,
        });
      }

      return tx.registration.create({
        data: {
          registrationCode,
          competitionId: competition.id,
          categoryId: targetCategory.id,
          groupId: targetGroup?.id || null,
          groupName: targetGroup?.name || null,
          participantName: validated.participantName,
          email: validated.email,
          mobileNumber: validated.mobileNumber,
          gender: validated.gender,
          age: validated.age,
          heightCm: validated.heightCm,
          weightKg: validated.weightKg,
          district: validated.district,
          representingType: validated.representingType,
          gymName: validated.gymName,
          registrationStatus: regStatus,
          paymentStatus: payStatus,
          ...(trunkNumberToAssign !== undefined
            ? { trunkNumber: trunkNumberToAssign }
            : {}),
          isManual: true,
          paymentMethod: paymentMethodStored,
          payment: {
            create: {
              amount: competition.registrationFee,
              currency: 'INR',
              status: payStatus,
              cashfreeOrderId,
              paidAt: isPaid ? new Date() : null,
              verifiedAt: isPaid ? new Date() : null,
              verificationSource,
            },
          },
        },
        include: REGISTRATION_INCLUDE,
      });
    });

    if (isPaid) {
      sendRegistrationConfirmationEmail(registration.id).catch((e) => {
        console.warn(
          `[email] Failed to send confirmation email for manual registration ${registration.id}:`,
          e.message
        );
      });
    }

    let upiQr = null;
    if (isOnline) {
      if (env.isCashfreeConfigured) {
        try {
          const compRouteKey = encodeURIComponent(
            competition.slug || competition.id
          );
          const cleanAppBase = (
            env.publicAppUrl || 'https://gold-body-zone.vercel.app'
          ).replace(/\/+$/, '');
          const cfOrder = await createCashfreeOrder({
            orderId: cashfreeOrderId,
            amount: competition.registrationFee,
            customerId: registration.id,
            customerName: registration.participantName,
            customerEmail: registration.email,
            customerPhone: registration.mobileNumber,
            returnUrl: `${cleanAppBase}/competitions/${compRouteKey}?order_id=${encodeURIComponent(cashfreeOrderId)}`,
          });

          const qrRes = await createCashfreeUpiQr({
            paymentSessionId: cfOrder.paymentSessionId,
          });

          upiQr = {
            orderId: cashfreeOrderId,
            cfPaymentId: qrRes.cfPaymentId,
            qrDataUrl: qrRes.qrDataUrl,
            amount: Number(competition.registrationFee),
            paymentSessionId: cfOrder.paymentSessionId,
          };
        } catch (cfErr) {
          if (!existing) {
            await prisma.payment
              .deleteMany({ where: { registrationId: registration.id } })
              .catch(() => {});
            await prisma.registration
              .delete({ where: { id: registration.id } })
              .catch(() => {});
          }
          throw new HttpError(
            cfErr.status || 502,
            `Failed to generate Cashfree UPI QR: ${cfErr.message || 'Payment gateway communication failure.'}`
          );
        }
      } else {
        const QRCode = (await import('qrcode')).default;
        const dummyPayload = `upi://pay?pa=cashfree@icici&pn=GOLD+BODY+ZONE&tr=${cashfreeOrderId}&am=${competition.registrationFee}&cu=INR`;
        const qrDataUrl = await QRCode.toDataURL(dummyPayload, {
          margin: 2,
          width: 320,
        });
        upiQr = {
          orderId: cashfreeOrderId,
          cfPaymentId: null,
          qrDataUrl,
          amount: Number(competition.registrationFee),
          paymentSessionId: `session-${cashfreeOrderId}`,
        };
      }
    }

    res.status(201).json({
      registration: serializeRegistration(registration),
      upiQr,
      cashfree: isOnline
        ? {
            configured: env.isCashfreeConfigured,
            mode: env.cashfreeEnv,
            paymentSessionId: upiQr?.paymentSessionId || null,
            orderId: cashfreeOrderId,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify payment status with Cashfree for a registration.
 * If Cashfree reports PAID, automatically settles the payment and sends confirmation email.
 */
export async function verifyRegistrationPayment(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: REGISTRATION_INCLUDE,
    });

    if (!registration) {
      throw new HttpError(404, 'Registration not found.');
    }

    if (registration.paymentStatus === 'PAID') {
      return res.status(200).json({
        isPaid: true,
        status: 'PAID',
        registration: serializeRegistration(registration),
      });
    }

    const cashfreeOrderId = registration.payment?.cashfreeOrderId;
    if (!cashfreeOrderId) {
      return res.status(200).json({
        isPaid: false,
        status: registration.paymentStatus,
        registration: serializeRegistration(registration),
      });
    }

    const cfState = await fetchCashfreeOrderState(cashfreeOrderId);

    if (cfState.nextStatus === 'PAID') {
      const settled = await settleVerifiedPayment({
        orderId: cashfreeOrderId,
        nextStatus: 'PAID',
        cfPaymentId: cfState.cfPaymentId,
        paymentAmount: cfState.paymentAmount,
        paymentTime: cfState.paymentTime,
        verificationSource: 'ADMIN_MANUAL_UPI_QR_VERIFY',
      });

      return res.status(200).json({
        isPaid: true,
        status: 'PAID',
        registration: serializeRegistration(settled),
      });
    }

    res.status(200).json({
      isPaid: false,
      status: cfState.nextStatus || registration.paymentStatus,
      orderStatus: cfState.orderStatus,
      registration: serializeRegistration(registration),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Export competition registration list in Excel (.xlsx) or CSV (.csv).
 * Exports all matching records respecting search, category, group, status, and source filters.
 */
export async function exportRegistrations(req, res, next) {
  try {
    const prisma = getPrismaClient();

    const format =
      typeof req.query.format === 'string'
        ? req.query.format.trim().toLowerCase()
        : 'xlsx';

    if (!['xlsx', 'csv'].includes(format)) {
      throw new HttpError(
        400,
        'Invalid export format. Expected xlsx or csv.'
      );
    }

    const competitionId =
      typeof req.query.competitionId === 'string'
        ? req.query.competitionId.trim()
        : '';
    const categoryId =
      typeof req.query.categoryId === 'string'
        ? req.query.categoryId.trim()
        : '';
    const groupId =
      typeof req.query.groupId === 'string' ? req.query.groupId.trim() : '';
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const source =
      typeof req.query.source === 'string'
        ? req.query.source.trim().toUpperCase()
        : 'ALL';
    const registrationStatus =
      typeof req.query.registrationStatus === 'string'
        ? req.query.registrationStatus.trim().toUpperCase()
        : '';
    const paymentStatus =
      typeof req.query.paymentStatus === 'string'
        ? req.query.paymentStatus.trim().toUpperCase()
        : '';

    const where = {};

    if (search) {
      where.OR = [
        { participantName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search, mode: 'insensitive' } },
        { registrationCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (competitionId) {
      where.competitionId = competitionId;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (groupId) {
      where.groupId = groupId;
    }

    if (
      registrationStatus &&
      VALID_REGISTRATION_STATUSES.has(registrationStatus)
    ) {
      where.registrationStatus = registrationStatus;
    }

    if (paymentStatus && VALID_PAYMENT_STATUSES.has(paymentStatus)) {
      where.paymentStatus = paymentStatus;
    }

    if (source === 'ONLINE') {
      where.isManual = false;
    } else if (source === 'MANUAL') {
      where.isManual = true;
    }

    const [competition, registrations] = await Promise.all([
      competitionId
        ? prisma.competition.findUnique({
            where: { id: competitionId },
            select: { id: true, name: true, registrationFee: true },
          })
        : null,
      prisma.registration.findMany({
        where,
        include: REGISTRATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const compName = competition?.name || 'All_Competitions';
    const safeCompName = compName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const sourceLabel = source === 'ONLINE' ? 'Online' : source === 'MANUAL' ? 'Manual' : 'All';
    const filename = `GOLD_BODY_ZONE_${safeCompName}_Registrations_${sourceLabel}_${dateStr}`;

    const options = {
      sourceFilter: sourceLabel,
      generatedAt: new Date(),
    };

    if (format === 'csv') {
      const buffer = generateRegistrationsCsv(competition, registrations, options);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`
      );
      return res.status(200).send(buffer);
    }

    if (format === 'xlsx') {
      const buffer = await generateRegistrationsExcel(competition, registrations, options);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.xlsx"`
      );
      return res.status(200).send(buffer);
    }
  } catch (err) {
    next(err);
  }
}
