import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { submitContactEnquiry } from '../src/controllers/public.controller.js';
import { sendContactEnquiryEmail } from '../src/services/email.service.js';
import { resetEnquiryRateLimit } from '../src/utils/enquiryRateLimiter.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

describe('Contact Section & Real-Time Enquiry Handling', () => {
  beforeEach(() => {
    resetEnquiryRateLimit();
  });

  describe('Form Validation & Spam Protection', () => {
    it('rejects submissions with invalid or empty name', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: ' ',
            email: 'athlete@example.com',
            phone: '9822986005',
            subject: 'Membership enquiry',
            message: 'I would like to inquire about gym membership fees.',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 400);
      assert.ok(caughtErr.message.includes('full name'));
    });

    it('rejects submissions with invalid email format', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: 'Vikas Patil',
            email: 'not-an-email',
            phone: '9822986005',
            subject: 'Membership enquiry',
            message: 'I would like to inquire about gym membership fees.',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 400);
      assert.ok(caughtErr.message.includes('valid email'));
    });

    it('rejects submissions with invalid phone number (< 10 digits)', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: 'Vikas Patil',
            email: 'vikas@example.com',
            phone: '12345',
            subject: 'Membership enquiry',
            message: 'I would like to inquire about gym membership fees.',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 400);
      assert.ok(caughtErr.message.includes('valid phone number'));
    });

    it('rejects submissions with missing or short subject', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: 'Vikas Patil',
            email: 'vikas@example.com',
            phone: '9822986005',
            subject: 'Hi',
            message: 'I would like to inquire about gym membership fees.',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 400);
      assert.ok(caughtErr.message.includes('subject'));
    });

    it('rejects submissions with missing or short message (< 10 chars)', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: 'Vikas Patil',
            email: 'vikas@example.com',
            phone: '9822986005',
            subject: 'Membership enquiry',
            message: 'Hello!',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 400);
      assert.ok(caughtErr.message.includes('message'));
    });

    it('traps bots via honeypot field hp_website', async () => {
      let caughtErr = null;
      const res = createMockRes();
      await submitContactEnquiry(
        {
          body: {
            name: 'Bot Runner',
            email: 'bot@spam.com',
            phone: '9822986005',
            subject: 'Spam Subject',
            message: 'Buy cheap watches now!',
            hp_website: 'http://spamlink.com',
          },
          ip: '127.0.0.1',
        },
        res,
        (err) => {
          caughtErr = err;
        }
      );

      assert.equal(caughtErr, null);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.message.includes('Spam submission detected'));
    });

    it('enforces rate limiting after 5 requests from the same IP', async () => {
      const validPayload = {
        name: 'Vikas Patil',
        email: 'vikas@example.com',
        phone: '9822986005',
        subject: 'Membership enquiry',
        message: 'I would like to inquire about gym membership fees and timings.',
      };

      // Mock transporter for rate limit test
      const mockTransporter = {
        async sendMail() {
          return { messageId: 'msg-test-123' };
        },
      };

      // Perform 5 requests from same IP
      for (let i = 0; i < 5; i++) {
        let err = null;
        const res = createMockRes();
        await submitContactEnquiry(
          { body: validPayload, ip: '192.168.1.100' },
          res,
          (e) => {
            err = e;
          }
        );
      }

      // 6th request from same IP must be rate-limited (429)
      let sixthErr = null;
      const res6 = createMockRes();
      await submitContactEnquiry(
        { body: validPayload, ip: '192.168.1.100' },
        res6,
        (e) => {
          sixthErr = e;
        }
      );

      assert.ok(sixthErr);
      assert.equal(sixthErr.statusCode, 429);
      assert.ok(sixthErr.message.includes('Too many enquiry submissions'));

      // Different IP should still be allowed
      let diffIpErr = null;
      const resDiff = createMockRes();
      await submitContactEnquiry(
        { body: validPayload, ip: '192.168.1.101' },
        resDiff,
        (e) => {
          diffIpErr = e;
        }
      );
      // If SMTP is not configured in test env, it may return 503, but NOT 429
      if (diffIpErr) {
        assert.notEqual(diffIpErr.statusCode, 429);
      }
    });
  });

  describe('Email Notification Service', () => {
    it('sends enquiry email to bodyzone82@gmail.com with reply-to and correct details', async () => {
      let sentMailOptions = null;
      const mockTransporter = {
        async sendMail(opts) {
          sentMailOptions = opts;
          return { messageId: 'msg-enquiry-001' };
        },
      };

      const result = await sendContactEnquiryEmail(
        {
          name: 'Yugandhara Patil',
          email: 'yugandhara@example.com',
          phone: '+91 9822986005',
          subject: 'Championship Registration Question',
          message: 'Can I register for both Masters and Open Bodybuilding categories?',
        },
        { transporter: mockTransporter }
      );

      assert.equal(result.sent, true);
      assert.ok(sentMailOptions);
      assert.equal(sentMailOptions.to, 'bodyzone82@gmail.com');
      assert.equal(sentMailOptions.replyTo, 'Yugandhara Patil <yugandhara@example.com>');
      assert.ok(sentMailOptions.subject.includes('Championship Registration Question'));
      assert.ok(sentMailOptions.subject.includes('Yugandhara Patil'));
      assert.ok(sentMailOptions.text.includes('+91 9822986005'));
      assert.ok(sentMailOptions.text.includes('yugandhara@example.com'));
      assert.ok(sentMailOptions.text.includes('Can I register for both Masters and Open'));
      assert.ok(sentMailOptions.html.includes('GOLD BODY ZONE GYM'));
    });

    it('returns EMAIL_NOT_CONFIGURED when transporter is unavailable', async () => {
      // Pass null custom transporter when env.isEmailConfigured might be false
      const originalHost = env.smtpHost;
      env.smtpHost = ''; // simulate unconfigured SMTP

      const result = await sendContactEnquiryEmail(
        {
          name: 'Rahul Sharma',
          email: 'rahul@example.com',
          phone: '9822986005',
          subject: 'Training Question',
          message: 'What are the personal trainer rates available?',
        },
        { transporter: null }
      );

      env.smtpHost = originalHost; // restore

      assert.equal(result.sent, false);
      assert.equal(result.reason, 'EMAIL_NOT_CONFIGURED');
      assert.ok(result.message.includes('bodyzone82@gmail.com'));
      assert.ok(result.message.includes('+91 9822986005'));
    });

    it('returns SEND_FAILED when SMTP transport throws an error', async () => {
      const failingTransporter = {
        async sendMail() {
          throw new Error('Connection refused to SMTP server');
        },
      };

      const result = await sendContactEnquiryEmail(
        {
          name: 'Rahul Sharma',
          email: 'rahul@example.com',
          phone: '9822986005',
          subject: 'Training Question',
          message: 'What are the personal trainer rates available?',
        },
        { transporter: failingTransporter }
      );

      assert.equal(result.sent, false);
      assert.equal(result.reason, 'SEND_FAILED');
      assert.ok(result.message.includes('bodyzone82@gmail.com'));
      assert.ok(result.message.includes('+91 9822986005'));
    });
  });
});
