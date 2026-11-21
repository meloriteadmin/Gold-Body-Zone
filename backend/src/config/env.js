import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const port = Number.parseInt(process.env.PORT || '5000', 10);
const smtpPort = Number.parseInt(process.env.SMTP_PORT || '587', 10);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  stagingMode: process.env.STAGING_MODE === 'true',
  stagingRegistrationsEnabled: process.env.STAGING_REGISTRATIONS_ENABLED === 'true',
  port: Number.isNaN(port) ? 5000 : port,
  host: process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'),
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  publicAppUrl:
    process.env.PUBLIC_APP_URL?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  directUrl: process.env.DIRECT_URL?.trim() || '',
  checkoutTokenSecret: process.env.CHECKOUT_TOKEN_SECRET?.trim() || '',
  aadhaarEncryptionKey: process.env.AADHAAR_ENCRYPTION_KEY?.trim() || '',
  uploadDirectory: process.env.UPLOAD_DIRECTORY?.trim() || path.resolve(__dirname, '../../uploads'),
  imageQuotaBytes: 1073741824,
  databaseQuotaBytes: 524288000,

  // Cashfree Payment Gateway
  cashfreeAppId: process.env.CASHFREE_APP_ID?.trim() || '',
  cashfreeSecretKey: process.env.CASHFREE_SECRET_KEY?.trim() || '',
  cashfreeEnv:
    process.env.CASHFREE_ENV?.trim().toLowerCase() === 'production'
      ? 'production'
      : 'sandbox',

  // Backend Email Service (SMTP via Nodemailer)
  smtpHost: process.env.SMTP_HOST?.trim() || '',
  smtpPort: Number.isNaN(smtpPort) ? 587 : smtpPort,
  smtpSecure: process.env.SMTP_SECURE?.trim().toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER?.trim() || '',
  smtpPass: process.env.SMTP_PASS?.trim() || '',
  smtpFrom:
    process.env.SMTP_FROM?.trim() || process.env.EMAIL_FROM?.trim() || '',
  get emailFrom() {
    return (
      this.smtpFrom ||
      (this.smtpUser ? `GOLD BODY ZONE <${this.smtpUser}>` : '')
    );
  },
  set emailFrom(val) {
    this.smtpFrom = val ? String(val).trim() : '';
  },

  get isDatabaseConfigured() {
    return Boolean(this.databaseUrl);
  },
  get isCashfreeConfigured() {
    return Boolean(this.cashfreeAppId && this.cashfreeSecretKey);
  },
  get isEmailConfigured() {
    return Boolean(
      this.smtpHost && this.smtpUser && this.smtpPass && this.emailFrom
    );
  },
};
