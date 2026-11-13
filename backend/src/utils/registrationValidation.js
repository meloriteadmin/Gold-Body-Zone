import crypto from 'node:crypto';
import { HttpError } from './httpError.js';

const VALID_PARTICIPANT_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);
const VALID_REPRESENTING_TYPES = new Set(['GYM', 'INDIVIDUAL']);
const VALID_REGISTRATION_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function generateRegistrationCode() {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `REG-${ym}-${randomPart}`;
}

export function validatePublicRegistration(body) {
  const competitionId = cleanString(body?.competitionId);
  if (!competitionId) {
    throw new HttpError(400, 'Competition is required.');
  }

  const categoryId = cleanString(body?.categoryId);
  if (!categoryId) {
    throw new HttpError(400, 'Please select a competition category.');
  }

  const participantName = cleanString(body?.participantName);
  if (participantName.length < 2 || participantName.length > 120) {
    throw new HttpError(
      400,
      'Full Name must be between 2 and 120 characters.'
    );
  }

  const email = cleanString(body?.email).toLowerCase();
  if (!email || !EMAIL_REGEX.test(email) || email.length > 160) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }

  const rawMobile = cleanString(body?.mobileNumber);
  const mobileDigits = rawMobile.replace(/[^\d+]/g, '');
  const digitsOnly = mobileDigits.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new HttpError(
      400,
      'Mobile number must contain between 10 and 15 digits.'
    );
  }

  const gender = cleanString(body?.gender).toUpperCase();
  if (!VALID_PARTICIPANT_GENDERS.has(gender)) {
    throw new HttpError(400, 'Please select a valid gender.');
  }

  const age = Number(body?.age);
  if (!Number.isInteger(age) || age < 10 || age > 100) {
    throw new HttpError(400, 'Age must be a whole number between 10 and 100.');
  }

  const heightCm = Number(body?.heightCm);
  if (Number.isNaN(heightCm) || heightCm < 80 || heightCm > 260) {
    throw new HttpError(400, 'Height must be between 80 and 260 cm.');
  }

  const weightKg = Number(body?.weightKg);
  if (Number.isNaN(weightKg) || weightKg < 25 || weightKg > 300) {
    throw new HttpError(400, 'Weight must be between 25 and 300 kg.');
  }

  const district = cleanString(body?.district);
  if (district.length < 2 || district.length > 100) {
    throw new HttpError(
      400,
      'District (Zilha) must be between 2 and 100 characters.'
    );
  }

  const rawRepresenting = cleanString(
    body?.representingType || 'GYM'
  ).toUpperCase();
  if (!VALID_REPRESENTING_TYPES.has(rawRepresenting)) {
    throw new HttpError(
      400,
      'Representing must be either Gym or Individual.'
    );
  }

  const rawGymName = cleanString(body?.gymName);
  let gymName = rawGymName;
  if (rawRepresenting === 'INDIVIDUAL') {
    gymName = rawGymName || 'Other / Individual';
  } else if (rawGymName.length < 2 || rawGymName.length > 120) {
    throw new HttpError(
      400,
      'Please enter your Gym Name (minimum 2 characters).'
    );
  }

  return {
    competitionId,
    categoryId,
    participantName,
    email,
    mobileNumber: mobileDigits,
    gender,
    age,
    heightCm: Number(heightCm.toFixed(2)),
    weightKg: Number(weightKg.toFixed(2)),
    district,
    representingType: rawRepresenting,
    gymName,
  };
}

export function validateRegistrationStatusUpdate(status) {
  const normalized = cleanString(status).toUpperCase();
  if (!VALID_REGISTRATION_STATUSES.has(normalized)) {
    throw new HttpError(
      400,
      'Invalid registration status. Expected PENDING, CONFIRMED, or CANCELLED.'
    );
  }
  return normalized;
}
