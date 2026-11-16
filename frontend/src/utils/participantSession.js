const STORAGE_REG_PREFIX = 'ironstage_comp_reg_';
const STORAGE_IDENTITY_KEY = 'ironstage_participant_identity';

export function saveParticipantRegistration(competitionId, registration, statusToken = null) {
  if (!competitionId || !registration?.id) return;
  try {
    const payload = {
      id: registration.id,
      competitionId,
      registrationCode: registration.registrationCode,
      participantName: registration.participantName,
      email: registration.email,
      mobileNumber: registration.mobileNumber,
      registrationStatus: registration.registrationStatus,
      paymentStatus: registration.paymentStatus,
      statusToken: statusToken || registration.statusToken || null,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${STORAGE_REG_PREFIX}${competitionId}`, JSON.stringify(payload));

    // Also update participant identity
    saveParticipantIdentity({
      email: registration.email,
      mobileNumber: registration.mobileNumber,
      participantName: registration.participantName,
    });
  } catch {
    // Ignore storage errors (private mode / quotas)
  }
}

export function getParticipantRegistration(competitionId) {
  if (!competitionId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_REG_PREFIX}${competitionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveParticipantIdentity({ email, mobileNumber, participantName }) {
  try {
    const current = getParticipantIdentity() || {};
    const updated = {
      ...current,
      ...(email ? { email: String(email).trim().toLowerCase() } : {}),
      ...(mobileNumber ? { mobileNumber: String(mobileNumber).trim() } : {}),
      ...(participantName ? { participantName: String(participantName).trim() } : {}),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_IDENTITY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function getParticipantIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE_IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
