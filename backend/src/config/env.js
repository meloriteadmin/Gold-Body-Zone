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
  port: Number.isNaN(port) ? 5000 : port,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  publicAppUrl:
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  directUrl: process.env.DIRECT_URL?.trim() || '',
  supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || '',

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
      (this.smtpUser ? `IRONSTAGE <${this.smtpUser}>` : '')
    );
  },
  set emailFrom(val) {
    this.smtpFrom = val ? String(val).trim() : '';
  },

  get isDatabaseConfigured() {
    return Boolean(this.databaseUrl);
  },
  get isSupabaseConfigured() {
    return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
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
