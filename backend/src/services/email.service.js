import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';

let cachedTransporter = null;

function getTransporter() {
  if (!env.isEmailConfigured) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  return cachedTransporter;
}

export async function sendLocalAuthEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) return false;
  await transporter.sendMail({ from: env.emailFrom, to, subject, text, html });
  return true;
}

function formatInr(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return 'Not Set';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Sends a registration confirmation email strictly ONCE after payment verification.
 * Uses an atomic PostgreSQL conditional update on confirmationEmailSentAt so concurrent
 * webhooks and return-URL verification requests never send duplicate emails.
 */
export async function sendRegistrationConfirmationEmail(
  registrationId,
  { transporter: customTransporter } = {}
) {
  const transporter = customTransporter || getTransporter();
  if (!transporter) {
    const missing = [
      !env.smtpHost && 'SMTP_HOST',
      !env.smtpUser && 'SMTP_USER',
      !env.smtpPass && 'SMTP_PASS',
      !env.emailFrom && 'EMAIL_FROM',
    ].filter(Boolean);
    console.warn(
      `[email] SMTP is not configured (missing: ${missing.join(', ') || 'SMTP config'}); skipped confirmation email for registration ${registrationId}.`
    );
    return {
      sent: false,
      reason: 'EMAIL_NOT_CONFIGURED',
      message: 'SMTP email credentials are not configured.',
    };
  }

  const prisma = getPrismaClient();
  const claimTime = new Date();

  const claimed = await prisma.registration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: 'PAID',
      registrationStatus: 'CONFIRMED',
      confirmationEmailSentAt: null,
    },
    data: {
      confirmationEmailSentAt: claimTime,
    },
  });

  if (claimed.count === 0) {
    return { sent: false, reason: 'ALREADY_SENT_OR_UNPAID' };
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        competition: {
          select: {
            name: true,
            registrationFee: true,
            eventDate: true,
            venue: true,
          },
        },
        category: {
          select: {
            name: true,
            gender: true,
          },
        },
        payment: {
          select: {
            cashfreePaymentId: true,
            cashfreeOrderId: true,
            amount: true,
          },
        },
      },
    });

    if (!registration) {
      return { sent: false, reason: 'NOT_FOUND' };
    }

    const feeDisplay = formatInr(
      registration.payment?.amount ?? registration.competition?.registrationFee
    );
    const paymentReference =
      registration.payment?.cashfreePaymentId ||
      registration.payment?.cashfreeOrderId ||
      'Verified';
    const categoryDisplay = registration.category
      ? `${registration.category.gender}: ${registration.category.name}`
      : 'Selected Category';
    const competitionName = registration.competition?.name || 'Competition';

    const subject = `Registration Confirmed — ${competitionName} (${registration.registrationCode})`;

    const text = [
      `Hello ${registration.participantName},`,
      '',
      'Your competition registration and payment have been verified and confirmed.',
      '',
      `Participant Name: ${registration.participantName}`,
      `Registration ID: ${registration.registrationCode}`,
      `Competition Name: ${competitionName}`,
      `Selected Category: ${categoryDisplay}`,
      `Registration Fee: ${feeDisplay}`,
      `Payment Reference: ${paymentReference}`,
      'Registration Status: CONFIRMED (Payment PAID)',
      '',
      'Please retain your Registration ID for stage check-in and weigh-in.',
    ].join('\n');

    const html = `
      <div style="background:#101010;color:#ffffff;font-family:Arial,sans-serif;padding:32px;">
        <div style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:16px;padding:28px;">
          <p style="margin:0;color:#F15A24;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
            Registration Confirmed
          </p>
          <h1 style="margin:8px 0 16px;font-size:24px;color:#ffffff;">
            ${escapeHtml(competitionName)}
          </h1>
          <p style="margin:0 0 20px;color:#d4d4d8;font-size:14px;line-height:1.6;">
            Hello ${escapeHtml(registration.participantName)}, your entry and payment have been successfully verified.
          </p>
          <table style="width:100%;border-collapse:collapse;background:#222222;border-radius:12px;overflow:hidden;font-size:13px;">
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Participant Name</td><td style="padding:10px 14px;color:#ffffff;font-weight:600;">${escapeHtml(registration.participantName)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Registration ID</td><td style="padding:10px 14px;color:#F15A24;font-weight:700;">${escapeHtml(registration.registrationCode)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Competition</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(competitionName)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Selected Category</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(categoryDisplay)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Registration Fee</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(feeDisplay)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Payment Reference</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(paymentReference)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Confirmation Status</td><td style="padding:10px 14px;color:#34d399;font-weight:700;">CONFIRMED (PAID)</td></tr>
          </table>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: env.emailFrom,
      to: registration.email,
      subject,
      text,
      html,
    });

    return { sent: true };
  } catch (err) {
    // Release claim so a retry or webhook can try again if SMTP failed transiently.
    await prisma.registration
      .updateMany({
        where: {
          id: registrationId,
          confirmationEmailSentAt: claimTime,
        },
        data: {
          confirmationEmailSentAt: null,
        },
      })
      .catch(() => {});

    console.error(
      `[email] Failed sending confirmation email for registration ${registrationId}:`,
      {
        code: err?.code || null,
        responseCode: err?.responseCode || null,
        message: err?.message || String(err),
      }
    );
    return {
      sent: false,
      reason: 'SEND_FAILED',
      message: err?.message || 'Failed to deliver confirmation email.',
    };
  }
}

/**
 * Sends Email 1 ("Registration Received") once after a valid registration is saved.
 * Tracked separately via acknowledgementEmailSentAt and clearly states that registration
 * is not confirmed until payment is verified.
 */
export async function sendRegistrationAcknowledgementEmail(
  registrationId,
  { transporter: customTransporter } = {}
) {
  const transporter = customTransporter || getTransporter();
  if (!transporter) {
    const missing = [
      !env.smtpHost && 'SMTP_HOST',
      !env.smtpUser && 'SMTP_USER',
      !env.smtpPass && 'SMTP_PASS',
      !env.emailFrom && 'EMAIL_FROM',
    ].filter(Boolean);
    console.warn(
      `[email] SMTP is not configured (missing: ${missing.join(', ') || 'SMTP config'}); skipped acknowledgement email for registration ${registrationId}.`
    );
    return {
      sent: false,
      reason: 'EMAIL_NOT_CONFIGURED',
      message: 'SMTP email credentials are not configured.',
    };
  }

  const prisma = getPrismaClient();
  const claimTime = new Date();

  const claimed = await prisma.registration.updateMany({
    where: {
      id: registrationId,
      acknowledgementEmailSentAt: null,
    },
    data: {
      acknowledgementEmailSentAt: claimTime,
    },
  });

  if (claimed.count === 0) {
    return { sent: false, reason: 'ALREADY_SENT' };
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        competition: {
          select: {
            name: true,
            registrationFee: true,
          },
        },
        category: {
          select: {
            name: true,
            gender: true,
          },
        },
      },
    });

    if (!registration) {
      return { sent: false, reason: 'NOT_FOUND' };
    }

    const competitionName = registration.competition?.name || 'Competition';
    const categoryDisplay = registration.category
      ? `${registration.category.gender}: ${registration.category.name}`
      : 'Selected Category';
    const feeDisplay = formatInr(registration.competition?.registrationFee);
    const isPendingPayment = registration.paymentStatus !== 'PAID';

    const subject = `Registration Received — ${competitionName} (${registration.registrationCode})`;

    const paymentInstruction = isPendingPayment
      ? 'Payment Instructions: Your payment is currently PENDING. Please complete your online payment via Cashfree checkout. Your registration is NOT confirmed until payment is successfully verified.'
      : 'Payment has been received. Your registration confirmation will follow once final verification completes.';

    const text = [
      `Hello ${registration.participantName},`,
      '',
      'We have received your competition registration details.',
      '',
      `Participant Name: ${registration.participantName}`,
      `Registration ID: ${registration.registrationCode}`,
      `Competition Name: ${competitionName}`,
      `Selected Category: ${categoryDisplay}`,
      `Entry Fee: ${feeDisplay}`,
      `Registration Status: ${registration.registrationStatus}`,
      `Payment Status: ${registration.paymentStatus}`,
      '',
      paymentInstruction,
    ].join('\n');

    const html = `
      <div style="background:#101010;color:#ffffff;font-family:Arial,sans-serif;padding:32px;">
        <div style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:16px;padding:28px;">
          <p style="margin:0;color:#F15A24;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
            Registration Received
          </p>
          <h1 style="margin:8px 0 16px;font-size:24px;color:#ffffff;">
            ${escapeHtml(competitionName)}
          </h1>
          <p style="margin:0 0 20px;color:#d4d4d8;font-size:14px;line-height:1.6;">
            Hello ${escapeHtml(registration.participantName)}, we have received your registration. Please note that your entry is <strong>not confirmed until payment is successfully verified</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;background:#222222;border-radius:12px;overflow:hidden;font-size:13px;">
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Participant Name</td><td style="padding:10px 14px;color:#ffffff;font-weight:600;">${escapeHtml(registration.participantName)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Registration ID</td><td style="padding:10px 14px;color:#F15A24;font-weight:700;">${escapeHtml(registration.registrationCode)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Competition</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(competitionName)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Selected Category</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(categoryDisplay)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Entry Fee</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(feeDisplay)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Registration Status</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(registration.registrationStatus)}</td></tr>
            <tr><td style="padding:10px 14px;color:#a1a1aa;">Payment Status</td><td style="padding:10px 14px;color:#fbbf24;font-weight:700;">${escapeHtml(registration.paymentStatus)}</td></tr>
          </table>
          <p style="margin:20px 0 0;color:#d4d4d8;font-size:13px;line-height:1.6;">
            ${escapeHtml(paymentInstruction)}
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: env.emailFrom,
      to: registration.email,
      subject,
      text,
      html,
    });

    return { sent: true };
  } catch (err) {
    await prisma.registration
      .updateMany({
        where: {
          id: registrationId,
          acknowledgementEmailSentAt: claimTime,
        },
        data: {
          acknowledgementEmailSentAt: null,
        },
      })
      .catch(() => {});

    console.error(
      `[email] Failed sending acknowledgement email for registration ${registrationId}:`,
      {
        code: err?.code || null,
        responseCode: err?.responseCode || null,
        message: err?.message || String(err),
      }
    );
    return {
      sent: false,
      reason: 'SEND_FAILED',
      message: err?.message || 'Failed to deliver acknowledgement email.',
    };
  }
}

/**
 * Safely verifies SMTP connection and authentication with the configured server.
 * Never exposes passwords or credentials in returned result or logs.
 */
export async function verifySmtpConnection({
  transporter: customTransporter,
} = {}) {
  const transporter = customTransporter || getTransporter();
  if (!transporter) {
    const missing = [
      !env.smtpHost && 'SMTP_HOST',
      !env.smtpUser && 'SMTP_USER',
      !env.smtpPass && 'SMTP_PASS',
      !env.emailFrom && 'SMTP_FROM',
    ].filter(Boolean);
    return {
      success: false,
      configured: false,
      missing,
      message: `SMTP is not configured (missing: ${missing.join(', ') || 'SMTP config'})`,
    };
  }

  try {
    await transporter.verify();
    return {
      success: true,
      configured: true,
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      user: env.smtpUser,
      from: env.emailFrom,
      message: 'SMTP connection and authentication verified successfully.',
    };
  } catch (err) {
    console.error('[email] SMTP connection verification failed:', {
      code: err?.code || null,
      responseCode: err?.responseCode || null,
      message: err?.message || String(err),
    });
    return {
      success: false,
      configured: true,
      host: env.smtpHost,
      port: env.smtpPort,
      code: err?.code || null,
      responseCode: err?.responseCode || null,
      message: err?.message || 'SMTP connection verification failed.',
    };
  }
}

/**
 * Sends a test email to verify end-to-end delivery.
 * Does not expose credentials.
 */
export async function sendTestEmail(
  targetEmail,
  { transporter: customTransporter } = {}
) {
  const transporter = customTransporter || getTransporter();
  const recipient = targetEmail || env.smtpUser;
  if (!transporter || !recipient) {
    return {
      sent: false,
      message: 'SMTP is not configured or recipient email is missing.',
    };
  }

  const subject = 'GOLD BODY ZONE — SMTP Verification Test Email';
  const timestamp = new Date().toISOString();
  const text = [
    'Hello,',
    '',
    'This is a test email from your GOLD BODY ZONE backend to verify that Nodemailer SMTP settings are working properly.',
    '',
    `SMTP Host: ${env.smtpHost}`,
    `SMTP Port: ${env.smtpPort}`,
    `SMTP Secure: ${env.smtpSecure}`,
    `Sender: ${env.emailFrom}`,
    `Recipient: ${recipient}`,
    `Timestamp: ${timestamp}`,
    '',
    'All systems operational.',
  ].join('\n');

  const html = `
    <div style="background:#101010;color:#ffffff;font-family:Arial,sans-serif;padding:32px;">
      <div style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:16px;padding:28px;">
        <p style="margin:0;color:#F15A24;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
          GOLD BODY ZONE System Test
        </p>
        <h1 style="margin:8px 0 16px;font-size:22px;color:#ffffff;">
          SMTP Delivery Verified
        </h1>
        <p style="margin:0 0 16px;color:#d4d4d8;font-size:14px;line-height:1.6;">
          This test email confirms that Nodemailer SMTP delivery is properly configured and functioning on your backend.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#222222;border-radius:12px;overflow:hidden;font-size:13px;">
          <tr><td style="padding:10px 14px;color:#a1a1aa;">SMTP Host</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(env.smtpHost)}</td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">SMTP Port</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(env.smtpPort)}</td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Sender</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(env.emailFrom)}</td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Recipient</td><td style="padding:10px 14px;color:#34d399;font-weight:600;">${escapeHtml(recipient)}</td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Verified At</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(timestamp)}</td></tr>
        </table>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: env.emailFrom,
      to: recipient,
      subject,
      text,
      html,
    });
    return {
      sent: true,
      messageId: info.messageId,
      recipient,
      response: info.response,
    };
  } catch (err) {
    console.error('[email] Test email delivery failed:', {
      code: err?.code || null,
      message: err?.message || String(err),
    });
    return {
      sent: false,
      message: err?.message || 'Failed to send test email.',
    };
  }
}

/**
 * Sends a website contact enquiry notification to bodyzone82@gmail.com.
 * Safely sanitizes input and uses reply-to header so admin can respond directly.
 */
export async function sendContactEnquiryEmail(
  { name, email, phone, subject, message },
  { transporter: customTransporter } = {}
) {
  const transporter = customTransporter || getTransporter();
  if (!transporter) {
    const missing = [
      !env.smtpHost && 'SMTP_HOST',
      !env.smtpUser && 'SMTP_USER',
      !env.smtpPass && 'SMTP_PASS',
      !env.emailFrom && 'EMAIL_FROM',
    ].filter(Boolean);
    console.warn(
      `[email] SMTP is not configured (missing: ${missing.join(', ') || 'SMTP config'}); skipped contact enquiry notification.`
    );
    return {
      sent: false,
      reason: 'EMAIL_NOT_CONFIGURED',
      message:
        'Email service is not currently configured on the server. Please contact us directly at bodyzone82@gmail.com or call +91 9822986005.',
    };
  }

  const recipient = 'bodyzone82@gmail.com';
  const mailSubject = `[Website Enquiry] ${subject} — ${name}`;
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const text = [
    'NEW WEBSITE ENQUIRY — GOLD BODY ZONE GYM',
    '========================================',
    '',
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone}`,
    `Subject: ${subject}`,
    `Date:    ${timestamp}`,
    '',
    'Message:',
    '--------',
    message,
    '',
    '========================================',
    'This enquiry was submitted via the GOLD BODY ZONE GYM website contact form.',
  ].join('\n');

  const html = `
    <div style="background:#101010;color:#ffffff;font-family:Arial,sans-serif;padding:32px;">
      <div style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:16px;padding:28px;">
        <p style="margin:0;color:#F15A24;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
          GOLD BODY ZONE GYM • Website Enquiry
        </p>
        <h1 style="margin:8px 0 16px;font-size:22px;color:#ffffff;">
          ${escapeHtml(subject)}
        </h1>
        <p style="margin:0 0 20px;color:#a1a1aa;font-size:13px;">
          Received on ${escapeHtml(timestamp)}
        </p>
        <table style="width:100%;border-collapse:collapse;background:#222222;border-radius:12px;overflow:hidden;font-size:13px;margin-bottom:20px;">
          <tr><td style="padding:10px 14px;color:#a1a1aa;width:120px;">From</td><td style="padding:10px 14px;color:#ffffff;font-weight:600;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Email</td><td style="padding:10px 14px;color:#ffffff;"><a href="mailto:${escapeHtml(email)}" style="color:#F15A24;text-decoration:none;">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Phone</td><td style="padding:10px 14px;color:#ffffff;"><a href="tel:${escapeHtml(phone)}" style="color:#F15A24;text-decoration:none;">${escapeHtml(phone)}</a></td></tr>
          <tr><td style="padding:10px 14px;color:#a1a1aa;">Subject</td><td style="padding:10px 14px;color:#ffffff;">${escapeHtml(subject)}</td></tr>
        </table>
        <div style="background:#222222;border-radius:12px;padding:16px;border-left:4px solid #F15A24;">
          <p style="margin:0 0 8px;color:#a1a1aa;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
            Message Content
          </p>
          <p style="margin:0;color:#e4e4e7;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: env.emailFrom,
      to: recipient,
      replyTo: `${name} <${email}>`,
      subject: mailSubject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed sending contact enquiry notification email:', {
      code: err?.code || null,
      responseCode: err?.responseCode || null,
      message: err?.message || String(err),
    });
    return {
      sent: false,
      reason: 'SEND_FAILED',
      message:
        'Failed to deliver enquiry email. Please contact us directly at bodyzone82@gmail.com or call +91 9822986005.',
    };
  }
}
