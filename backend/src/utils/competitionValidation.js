import crypto from 'node:crypto';
import { HttpError } from './httpError.js';

const VALID_GENDER_ELIGIBILITY = new Set(['ALL', 'MALE_ONLY', 'FEMALE_ONLY']);
const VALID_CATEGORY_GENDER = new Set(['MALE', 'FEMALE', 'OPEN']);
const VALID_CATEGORY_TYPE = new Set(['WEIGHT', 'HEIGHT', 'OPEN']);

export const CLOSING_SOON_THRESHOLD_DAYS = 3;
export const CLOSING_SOON_THRESHOLD_MS =
  CLOSING_SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export function computeCompetitionStatus(competition) {
  if (!competition) return 'DRAFT';
  if (competition.isCompleted) return 'COMPLETED';
  if (!competition.isPublished) {
    return competition.publishedAt ? 'UNPUBLISHED' : 'DRAFT';
  }
  if (competition.eventDate) {
    const eventDay = new Date(competition.eventDate);
    const now = new Date();
    const isSameDay =
      eventDay.getUTCFullYear() === now.getUTCFullYear() &&
      eventDay.getUTCMonth() === now.getUTCMonth() &&
      eventDay.getUTCDate() === now.getUTCDate();
    if (isSameDay) return 'LIVE';
  }
  return 'PUBLISHED';
}

export function isPastEvent(eventDateValue) {
  if (!eventDateValue) return false;
  const eventDay = new Date(eventDateValue);
  if (Number.isNaN(eventDay.getTime())) return false;
  eventDay.setUTCHours(23, 59, 59, 999);
  return new Date() > eventDay;
}

export function computeRegistrationStatus(competition) {
  if (!competition) return 'CLOSED';
  if (competition.isCompleted) return 'CLOSED';
  if (!competition.isPublished) return 'CLOSED';
  if (competition.isRegistrationClosed) return 'CLOSED';
  if (isPastEvent(competition.eventDate)) return 'CLOSED';

  if (competition.registrationDeadline) {
    const deadline = new Date(competition.registrationDeadline);
    deadline.setUTCHours(23, 59, 59, 999);
    const now = new Date();
    if (now > deadline) return 'CLOSED';
    if (deadline.getTime() - now.getTime() <= CLOSING_SOON_THRESHOLD_MS) {
      return 'CLOSING_SOON';
    }
  }

  return 'OPEN';
}

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function makeUniqueSlug(name) {
  const base = slugify(name) || 'competition';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

export function parseOptionalDate(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid date.`);
  }
  return parsed;
}

function parseOptionalDecimal(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative number.`);
  }
  return num;
}

function parseOptionalInt(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new HttpError(400, `${fieldName} must be a positive integer.`);
  }
  return num;
}

export function normalizeGroupInput(grp, index = 0) {
  const name = typeof grp?.name === 'string' ? grp.name.trim() : '';
  if (!name) {
    throw new HttpError(400, 'Each group/division must have a non-empty name.');
  }
  const id =
    typeof grp?.id === 'string' && grp.id.trim() ? grp.id.trim() : undefined;

  return {
    ...(id ? { id } : {}),
    name,
    sortOrder: Number.isInteger(grp?.sortOrder) ? grp.sortOrder : index + 1,
  };
}

export function normalizeCategoryInput(cat, index = 0) {
  const name = typeof cat?.name === 'string' ? cat.name.trim() : '';
  if (!name) {
    throw new HttpError(400, 'Each category must have a non-empty name.');
  }

  const categoryType = VALID_CATEGORY_TYPE.has(cat?.categoryType)
    ? cat.categoryType
    : 'OPEN';
  const gender = VALID_CATEGORY_GENDER.has(cat?.gender)
    ? cat.gender
    : 'OPEN';
  const ruleNote =
    typeof cat?.ruleNote === 'string' && cat.ruleNote.trim()
      ? cat.ruleNote.trim()
      : null;

  const id =
    typeof cat?.id === 'string' && cat.id.trim() ? cat.id.trim() : undefined;

  const groups = Array.isArray(cat?.groups)
    ? cat.groups.map((grp, gIdx) => normalizeGroupInput(grp, gIdx))
    : [];

  return {
    ...(id ? { id } : {}),
    categoryType,
    gender,
    name,
    ruleNote,
    sortOrder: Number.isInteger(cat?.sortOrder) ? cat.sortOrder : index + 1,
    groups,
  };
}

export function validateCompetitionPayload(body, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new HttpError(400, 'Competition name is required.');
    }
    data.name = name;
  }

  if (!isUpdate || body.competitionType !== undefined) {
    const competitionType =
      typeof body.competitionType === 'string'
        ? body.competitionType.trim()
        : '';
    if (!isUpdate && !competitionType) {
      data.competitionType = data.name;
    } else if (competitionType) {
      data.competitionType = competitionType;
    } else if (isUpdate && body.competitionType !== undefined) {
      throw new HttpError(400, 'Competition type cannot be empty.');
    }
  }

  if (body.description !== undefined) {
    data.description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null;
  }

  if (body.venue !== undefined) {
    data.venue =
      typeof body.venue === 'string' && body.venue.trim()
        ? body.venue.trim()
        : null;
  }

  if (body.ageEligibility !== undefined) {
    data.ageEligibility =
      typeof body.ageEligibility === 'string' && body.ageEligibility.trim()
        ? body.ageEligibility.trim()
        : null;
  }

  if (body.genderEligibility !== undefined) {
    if (!VALID_GENDER_ELIGIBILITY.has(body.genderEligibility)) {
      throw new HttpError(
        400,
        'Invalid gender eligibility. Expected ALL, MALE_ONLY, or FEMALE_ONLY.'
      );
    }
    data.genderEligibility = body.genderEligibility;
  }

  const eventDate = parseOptionalDate(body.eventDate, 'Competition date');
  if (eventDate !== undefined) data.eventDate = eventDate;

  const registrationDeadline = parseOptionalDate(
    body.registrationDeadline,
    'Registration deadline'
  );
  if (registrationDeadline !== undefined) {
    data.registrationDeadline = registrationDeadline;
  }

  const registrationFee = parseOptionalDecimal(
    body.registrationFee,
    'Registration fee'
  );
  if (registrationFee !== undefined) data.registrationFee = registrationFee;

  const maxParticipants = parseOptionalInt(
    body.maxParticipants,
    'Maximum participants'
  );
  if (maxParticipants !== undefined) data.maxParticipants = maxParticipants;

  if (!isUpdate) {
    // New competitions must always be saved as Draft. Admin must explicitly publish them.
    data.isPublished = false;
    data.publishedAt = null;
    data.isCompleted = false;
    data.completedAt = null;
    data.isRegistrationClosed = false;
    data.registrationClosedAt = null;
  } else {
    if (body.isPublished !== undefined) {
      data.isPublished = Boolean(body.isPublished);
      data.publishedAt = data.isPublished ? new Date() : null;
    }

    if (body.isCompleted !== undefined) {
      data.isCompleted = Boolean(body.isCompleted);
      data.completedAt = data.isCompleted ? new Date() : null;
    }

    if (body.isRegistrationClosed !== undefined) {
      data.isRegistrationClosed = Boolean(body.isRegistrationClosed);
      data.registrationClosedAt = data.isRegistrationClosed ? new Date() : null;
    }
  }

  let categories;
  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories)) {
      throw new HttpError(400, 'Categories must be an array.');
    }
    categories = body.categories.map((cat, idx) =>
      normalizeCategoryInput(cat, idx)
    );
  }

  // Enforce type-specific gender and category constraints
  const compType = data.competitionType || (isUpdate ? undefined : body.competitionType);
  if (compType === "Women's Competition") {
    data.genderEligibility = 'FEMALE_ONLY';
    if (categories) {
      for (const cat of categories) {
        if (cat.categoryType !== 'OPEN') {
          throw new HttpError(
            400,
            "Women's Competition only allows Open categories (no height or weight categories)."
          );
        }
        if (cat.gender === 'MALE') {
          throw new HttpError(
            400,
            "Women's Competition cannot have Male categories."
          );
        }
        cat.gender = 'FEMALE';
      }
    }
  } else if (
    compType === 'Bodybuilding' ||
    compType === "Men's Physique" ||
    compType === 'Masters'
  ) {
    data.genderEligibility = 'MALE_ONLY';
    if (categories) {
      for (const cat of categories) {
        if (cat.gender === 'FEMALE' || /female/i.test(cat.name || '')) {
          throw new HttpError(
            400,
            `${compType} is restricted to Male participants and cannot have Female categories.`
          );
        }
        if (
          compType === 'Bodybuilding' &&
          (cat.categoryType === 'OPEN' || /open/i.test(cat.name || ''))
        ) {
          throw new HttpError(
            400,
            'Bodybuilding only allows Male Weight categories (no Female Open or Open categories).'
          );
        }
        if (cat.gender === 'OPEN') {
          cat.gender = 'MALE';
        }
      }
    }
  }

  return { data, categories };
}
