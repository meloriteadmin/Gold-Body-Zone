import gymxHeroAthletes from '../assets/gymx-hero-athletes.jpg';
import neutralPlaceholderImg from '../assets/neutral-competition-placeholder.svg';

export const HERO_ATHLETES_IMAGE = gymxHeroAthletes;
export const NEUTRAL_COMPETITION_POSTER = neutralPlaceholderImg;

export const REGISTRATION_CLOSING_SOON_DAYS = 3;
export const REGISTRATION_CLOSING_SOON_MS =
  REGISTRATION_CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000;

export function getCompetitionStatus(competition) {
  if (!competition) return 'Draft';
  if (competition.isCompleted) return 'Completed';
  if (!competition.isPublished) {
    return competition.publishedAt ? 'Unpublished' : 'Draft';
  }
  if (competition.eventDate) {
    const eventDay = new Date(competition.eventDate);
    const now = new Date();
    const isSameDay =
      eventDay.getFullYear() === now.getFullYear() &&
      eventDay.getMonth() === now.getMonth() &&
      eventDay.getDate() === now.getDate();
    if (isSameDay) return 'Live';
  }
  return 'Published';
}

export function getRegistrationStatus(competition) {
  if (!competition) return 'Closed';
  if (competition.isCompleted) return 'Closed';
  if (!competition.isPublished) return 'Closed';
  if (competition.isRegistrationClosed) return 'Closed';

  if (competition.registrationDeadline) {
    const deadline = new Date(competition.registrationDeadline);
    deadline.setHours(23, 59, 59, 999);
    const now = new Date();
    if (now > deadline) return 'Closed';
    if (deadline.getTime() - now.getTime() <= REGISTRATION_CLOSING_SOON_MS) {
      return 'Closing Soon';
    }
  }

  return 'Open';
}

export function isRegistrationPermitted(competition) {
  const status = getRegistrationStatus(competition);
  return status === 'Open' || status === 'Closing Soon';
}

export function isDeadlineClosed(deadlineValue) {
  if (!deadlineValue) return false;
  const deadlineEnd = new Date(deadlineValue);
  if (Number.isNaN(deadlineEnd.getTime())) return false;
  deadlineEnd.setUTCHours(23, 59, 59, 999);
  return new Date() > deadlineEnd;
}

/**
 * Returns the exact poster URL stored on this specific competition record.
 * If the competition does not have a poster URL configured, returns the neutral placeholder.
 * Never infers or reuses posters based on competition type, name, or other competitions.
 */
export function getCompetitionPoster(competition) {
  if (
    competition?.posterUrl &&
    typeof competition.posterUrl === 'string' &&
    competition.posterUrl.trim().length > 0
  ) {
    return competition.posterUrl;
  }
  return NEUTRAL_COMPETITION_POSTER;
}

/**
 * Evaluates participant age against configured competition ageEligibility text
 * (e.g. "Above 40 years of age", "40+", "Minimum 18").
 */
export function checkAgeEligibility(ageEligibility, rawAge, competitionType = '') {
  if (
    competitionType === 'Masters' ||
    (ageEligibility && /above\s*40/i.test(ageEligibility))
  ) {
    if (rawAge === '' || rawAge === null || rawAge === undefined) {
      return { eligible: true, message: '' };
    }
    const numericAge = Number(rawAge);
    if (!Number.isNaN(numericAge) && numericAge <= 40) {
      return {
        eligible: false,
        message:
          'Ineligible: Masters competition eligibility strictly requires participant age to be above 40 years.',
      };
    }
  }

  if (!ageEligibility || rawAge === '' || rawAge === null || rawAge === undefined) {
    return { eligible: true, message: '' };
  }

  const numericAge = Number(rawAge);
  if (Number.isNaN(numericAge)) {
    return { eligible: true, message: '' };
  }

  const aboveMatch = /\babove\s+(\d+)\b/i.exec(ageEligibility);
  if (aboveMatch) {
    const threshold = Number.parseInt(aboveMatch[1], 10);
    if (numericAge <= threshold) {
      return {
        eligible: false,
        message: `Ineligible: ${ageEligibility} (your age must be over ${threshold}).`,
      };
    }
    return { eligible: true, message: '' };
  }

  const minMatch = /\b(?:at least|minimum|min\.?|over)\s+(\d+)\b|\b(\d+)\+/i.exec(
    ageEligibility
  );
  if (minMatch) {
    const threshold = Number.parseInt(minMatch[1] || minMatch[2], 10);
    if (numericAge < threshold) {
      return {
        eligible: false,
        message: `Ineligible: ${ageEligibility} (minimum age ${threshold}).`,
      };
    }
  }

  return { eligible: true, message: '' };
}

export function groupCategoriesByGender(categories = [], competitionType = '') {
  const isBodybuilding = competitionType === 'Bodybuilding';
  const isMaleOnly =
    isBodybuilding ||
    competitionType === "Men's Physique" ||
    competitionType === 'Masters';

  const groups = {
    MALE: [],
    FEMALE: [],
    OPEN: [],
  };

  for (const cat of categories) {
    if (isMaleOnly && (cat.gender === 'FEMALE' || /female/i.test(cat.name || ''))) {
      continue;
    }
    if (isBodybuilding && (/open/i.test(cat.name || '') || cat.categoryType === 'OPEN')) {
      continue;
    }

    if (groups[cat.gender]) {
      groups[cat.gender].push(cat);
    } else {
      groups.OPEN.push(cat);
    }
  }

  return [
    { key: 'MALE', label: 'Male Divisions', items: groups.MALE },
    { key: 'FEMALE', label: 'Female Divisions', items: groups.FEMALE },
    { key: 'OPEN', label: 'Open Divisions', items: groups.OPEN },
  ].filter((group) => group.items.length > 0);
}
