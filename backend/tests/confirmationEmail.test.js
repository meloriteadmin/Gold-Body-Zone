import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

function createEmailTestDb() {
  const registrations = new Map();
  const payments = new Map();

  function seed({
    id = 'reg-email-1',
    paymentStatus = 'PAID',
    registrationStatus = 'CONFIRMED',
    confirmationEmailSentAt = null,
  } = {}) {
    const payment = {
      id: `pay-${id}`,
      registrationId: id,
      cashfreeOrderId: `order_${id}`,
      cashfreePaymentId: `cf_pay_${id}`,
      amount: 1200,
      status: paymentStatus,
    };
    const reg = {
      id,
      registrationCode: 'REG-202611-EMAIL1',
      participantName: 'Rohan Patil',
      email: 'rohan@example.com',
      paymentStatus,
      registrationStatus,
      acknowledgementEmailSentAt: null,
      confirmationEmailSentAt,
      competition: {
        name: 'State Bodybuilding Championship',
        registrationFee: 1200,
        eventDate: new Date('2026-12-15T00:00:00Z'),
        venue: 'Pune',
      },
      category: {
        name: '65-75 kg',
        gender: 'MALE',
      },
      payment,
    };
    registrations.set(id, reg);
    payments.set(payment.id, payment);
  }

  const prismaMock = {
    registration: {
      async findUnique({ where }) {
        const reg = registrations.get(where.id);
        return reg ? { ...reg } : null;
      },
      async updateMany({ where, data }) {
        const reg = registrations.get(where.id);
        if (!reg) return { count: 0 };

        if (
          where.paymentStatus &&
          reg.paymentStatus !== where.paymentStatus
        ) {
          return { count: 0 };
        }
        if (
          where.registrationStatus &&
          reg.registrationStatus !== where.registrationStatus
        ) {
          return { count: 0 };
        }
        if (
          where.acknowledgementEmailSentAt === null &&
          reg.acknowledgementEmailSentAt !== null
        ) {
          return { count: 0 };
        }
        if (
          where.acknowledgementEmailSentAt instanceof Date &&
          (!reg.acknowledgementEmailSentAt ||
            reg.acknowledgementEmailSentAt.getTime() !==
              where.acknowledgementEmailSentAt.getTime())
        ) {
          return { count: 0 };
        }
        if (
          where.confirmationEmailSentAt === null &&
          reg.confirmationEmailSentAt !== null
        ) {
          return { count: 0 };
        }
        if (
          where.confirmationEmailSentAt instanceof Date &&
          (!reg.confirmationEmailSentAt ||
            reg.confirmationEmailSentAt.getTime() !==
              where.confirmationEmailSentAt.getTime())
        ) {
          return { count: 0 };
        }

        Object.assign(reg, data);
        return { count: 1 };
      },
    },
  };

  return { registrations, payments, seed, prismaMock };
}

const db = createEmailTestDb();
globalThis.__prisma = db.prismaMock;

const { env } = await import('../src/config/env.js');
const {
  sendRegistrationAcknowledgementEmail,
  sendRegistrationConfirmationEmail,
} = await import('../src/services/email.service.js');
const { resendRegistrationConfirmationEmail } = await import(
  '../src/controllers/adminRegistrations.controller.js'
);

describe('Registration Confirmation Email & Safe Retry', () => {
  beforeEach(() => {
    db.registrations.clear();
    db.payments.clear();
    env.smtpHost = 'smtp.example.com';
    env.smtpUser = 'noreply@example.com';
    env.smtpPass = 'dummy_smtp_password';
    env.emailFrom = 'GymX <noreply@example.com>';
  });

  it('sends exactly one confirmation email with registration and payment details on verified PAID registration', async () => {
    db.seed();
    const sentMessages = [];
    const fakeTransporter = {
      async sendMail(msg) {
        sentMessages.push(msg);
      },
    };

    const first = await sendRegistrationConfirmationEmail('reg-email-1', {
      transporter: fakeTransporter,
    });
    const duplicate = await sendRegistrationConfirmationEmail('reg-email-1', {
      transporter: fakeTransporter,
    });

    assert.equal(first.sent, true);
    assert.equal(duplicate.sent, false);
    assert.equal(duplicate.reason, 'ALREADY_SENT_OR_UNPAID');
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /Rohan Patil/);
    assert.match(sentMessages[0].text, /REG-202611-EMAIL1/);
    assert.match(sentMessages[0].text, /State Bodybuilding Championship/);
    assert.match(sentMessages[0].text, /65-75 kg/);
    assert.match(sentMessages[0].text, /1,200/);
    assert.match(sentMessages[0].text, /PAID/);
    assert.ok(db.registrations.get('reg-email-1').confirmationEmailSentAt);
  });

  it('does not send confirmation email for PENDING or FAILED registrations', async () => {
    db.seed({ id: 'reg-pending', paymentStatus: 'PENDING', registrationStatus: 'PENDING' });
    const sentMessages = [];
    const fakeTransporter = {
      async sendMail(msg) {
        sentMessages.push(msg);
      },
    };

    const res = await sendRegistrationConfirmationEmail('reg-pending', {
      transporter: fakeTransporter,
    });

    assert.equal(res.sent, false);
    assert.equal(res.reason, 'ALREADY_SENT_OR_UNPAID');
    assert.equal(sentMessages.length, 0);
  });

  it('releases claim on SMTP failure so confirmation email can be retried safely without duplicating registration or payment', async () => {
    db.seed();
    let attempt = 0;
    const fakeTransporter = {
      async sendMail() {
        attempt += 1;
        if (attempt === 1) {
          const err = new Error('SMTP connection refused');
          err.code = 'ECONNREFUSED';
          throw err;
        }
      },
    };

    const failedResult = await sendRegistrationConfirmationEmail('reg-email-1', {
      transporter: fakeTransporter,
    });
    assert.equal(failedResult.sent, false);
    assert.equal(failedResult.reason, 'SEND_FAILED');
    assert.equal(db.registrations.get('reg-email-1').confirmationEmailSentAt, null);
    assert.equal(db.registrations.size, 1);
    assert.equal(db.payments.size, 1);

    const retryResult = await sendRegistrationConfirmationEmail('reg-email-1', {
      transporter: fakeTransporter,
    });
    assert.equal(retryResult.sent, true);
    assert.ok(db.registrations.get('reg-email-1').confirmationEmailSentAt);
    assert.equal(db.registrations.size, 1);
    assert.equal(db.payments.size, 1);
  });

  it('reports clearly when SMTP is not configured on admin resend without pretending email was sent', async () => {
    db.seed();
    env.smtpHost = '';
    env.smtpUser = '';
    env.smtpPass = '';
    env.emailFrom = '';

    let capturedErr = null;
    await resendRegistrationConfirmationEmail(
      { params: { id: 'reg-email-1' } },
      { status: () => ({ json: () => {} }) },
      (err) => {
        capturedErr = err;
      }
    );

    assert.ok(capturedErr);
    assert.equal(capturedErr.statusCode, 503);
    assert.match(capturedErr.message, /SMTP/i);
    assert.equal(db.registrations.get('reg-email-1').confirmationEmailSentAt, null);
  });

  it('sends Email 1 (Registration Received) once with payment instructions and tracks acknowledgement separately from confirmation', async () => {
    db.seed({
      id: 'reg-ack-1',
      paymentStatus: 'PENDING',
      registrationStatus: 'PENDING',
    });
    const sentMessages = [];
    const fakeTransporter = {
      async sendMail(msg) {
        sentMessages.push(msg);
      },
    };

    const ack1 = await sendRegistrationAcknowledgementEmail('reg-ack-1', {
      transporter: fakeTransporter,
    });
    const ackDup = await sendRegistrationAcknowledgementEmail('reg-ack-1', {
      transporter: fakeTransporter,
    });

    assert.equal(ack1.sent, true);
    assert.equal(ackDup.sent, false);
    assert.equal(ackDup.reason, 'ALREADY_SENT');
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].subject, /Registration Received/i);
    assert.match(sentMessages[0].text, /not confirmed until payment is successfully verified/i);
    assert.match(sentMessages[0].text, /Payment Status: PENDING/i);
    assert.ok(db.registrations.get('reg-ack-1').acknowledgementEmailSentAt);
    assert.equal(db.registrations.get('reg-ack-1').confirmationEmailSentAt, null);
  });
});
