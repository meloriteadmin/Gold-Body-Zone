import { getPrismaClient } from '../config/prisma.js';
import { sendRegistrationConfirmationEmail } from '../services/email.service.js';
import { HttpError } from '../utils/httpError.js';
import { validateRegistrationStatusUpdate } from '../utils/registrationValidation.js';
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
    const registrationStatus =
      typeof req.query.registrationStatus === 'string'
        ? req.query.registrationStatus.trim().toUpperCase()
        : '';
    const paymentStatus =
      typeof req.query.paymentStatus === 'string'
        ? req.query.paymentStatus.trim().toUpperCase()
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

    if (
      registrationStatus &&
      VALID_REGISTRATION_STATUSES.has(registrationStatus)
    ) {
      where.registrationStatus = registrationStatus;
    }

    if (paymentStatus && VALID_PAYMENT_STATUSES.has(paymentStatus)) {
      where.paymentStatus = paymentStatus;
    }

    const [total, registrations] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        include: REGISTRATION_INCLUDE,
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
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
