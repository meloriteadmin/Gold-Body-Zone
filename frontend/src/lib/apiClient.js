import { env } from '../config/env.js';

const adminChangesChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('gold-body-zone-admin-changes')
  : null;
if (adminChangesChannel) {
  adminChangesChannel.onmessage = (event) => {
    window.dispatchEvent(new CustomEvent('admin-data-changed', { detail: event.data }));
  };
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(
  path,
  { method = 'GET', token, body, isFormData = false, timeoutMs = 0, headers: customHeaders = {} } = {}
) {
  const headers = { ...customHeaders };
  if (token && typeof token === 'string' && token.trim() && token !== 'cookie-session') {
    const rawToken = token.trim();
    headers.Authorization = rawToken.startsWith('Bearer ')
      ? rawToken
      : `Bearer ${rawToken}`;
  }
  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      signal: controller?.signal,
      body: isFormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError(
        408,
        'Verification request timed out. Please retry payment status check.'
      );
    }
    throw new ApiError(0, 'Unable to reach the backend server.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.message || `Request failed with status ${response.status}`
    );
  }

  if (method !== 'GET' && path.startsWith('/admin/')) {
    window.dispatchEvent(new CustomEvent('admin-data-changed', { detail: { path } }));
    adminChangesChannel?.postMessage({ path });
  }

  return data;
}

let cachedCompetitions = null;
let cachedCompetitionsExpiry = 0;
let pendingCompetitionsPromise = null;

const competitionDetailCache = new Map();
const pendingDetailPromises = new Map();

export const apiClient = {
  adminLogin: (email, password) => request('/auth/admin/login', { method: 'POST', body: { email, password } }),
  adminSession: () => request('/auth/admin/session'),
  adminLogout: () => request('/auth/admin/logout', { method: 'POST' }),
  changeAdminPassword: (currentPassword, newPassword) => request('/auth/admin/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  requestAdminPasswordReset: (email) => request('/auth/admin/request-password-reset', { method: 'POST', body: { email } }),
  resetAdminPassword: (token, password) => request('/auth/admin/reset-password', { method: 'POST', body: { token, password } }),
  fetchAdminStorage: () => request('/admin/storage'),
  // Public
  fetchPublishedCompetitions: ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && cachedCompetitions && now < cachedCompetitionsExpiry) {
      return Promise.resolve(cachedCompetitions);
    }
    if (pendingCompetitionsPromise && !force) {
      return pendingCompetitionsPromise;
    }

    pendingCompetitionsPromise = request('/public/competitions', { timeoutMs: 12000 })
      .then((data) => {
        cachedCompetitions = data;
        cachedCompetitionsExpiry = Date.now() + 5000;
        return data;
      })
      .finally(() => {
        pendingCompetitionsPromise = null;
      });

    return pendingCompetitionsPromise;
  },
  invalidateCompetitionsCache: () => {
    cachedCompetitions = null;
    cachedCompetitionsExpiry = 0;
    competitionDetailCache.clear();
    pendingDetailPromises.clear();
  },
  fetchPublishedCompetitionById: (idOrSlug, { force = false } = {}) => {
    const key = String(idOrSlug).toLowerCase().trim();
    const now = Date.now();
    const cached = competitionDetailCache.get(key);

    if (!force && cached && now < cached.expiry) {
      return Promise.resolve(cached.data);
    }
    if (!force && pendingDetailPromises.has(key)) {
      return pendingDetailPromises.get(key);
    }

    const promise = request(`/public/competitions/${encodeURIComponent(idOrSlug)}`, { timeoutMs: 12000 })
      .then((data) => {
        if (data?.competition) {
          const entry = { data, expiry: Date.now() + 5000 };
          competitionDetailCache.set(key, entry);
          if (data.competition.id) {
            competitionDetailCache.set(String(data.competition.id).toLowerCase(), entry);
          }
          if (data.competition.slug) {
            competitionDetailCache.set(String(data.competition.slug).toLowerCase(), entry);
          }
        }
        return data;
      })
      .finally(() => {
        pendingDetailPromises.delete(key);
      });

    pendingDetailPromises.set(key, promise);
    return promise;
  },
  submitPublicRegistration: (payload, token) =>
    request('/public/registrations', { method: 'POST', token, body: payload }),
  checkCompetitionRegistration: (competitionId, payload = {}, token) =>
    request(`/public/competitions/${encodeURIComponent(competitionId)}/check-registration`, {
      method: 'POST',
      token,
      body: payload,
    }),
  retryRegistrationPayment: (registrationId, payload = {}, token) =>
    request(`/public/registrations/${encodeURIComponent(registrationId)}/retry-payment`, {
      method: 'POST',
      token,
      body: payload,
    }),
  verifyOrderPayment: (payload, token) =>
    request('/public/payments/verify-order', {
      method: 'POST',
      token,
      body: payload,
      timeoutMs: 20000,
    }),
  submitContactEnquiry: (payload) =>
    request('/public/contact/enquiry', {
      method: 'POST',
      body: payload,
    }),
  // Admin Dashboard & Profile
  fetchAdminDashboard: (token) => request('/admin/dashboard', { token }),
  fetchAdminProfile: (token) => request('/admin/profile', { token }),
  updateAdminProfile: (token, payload) =>
    request('/admin/profile', { method: 'PATCH', token, body: payload }),
  uploadAdminAvatar: (token, file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return request('/admin/profile/avatar', {
      method: 'POST',
      token,
      body: formData,
      isFormData: true,
    });
  },

  // Admin Competitions
  fetchAdminCompetitions: (token, params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return request(`/admin/competitions${qs ? `?${qs}` : ''}`, { token });
  },
  fetchAdminCompetition: (token, id) =>
    request(`/admin/competitions/${encodeURIComponent(id)}`, { token }),
  createCompetition: async (token, payload) => {
    const res = await request('/admin/competitions', {
      method: 'POST',
      token,
      body: payload,
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  updateCompetition: async (token, id, payload) => {
    const res = await request(`/admin/competitions/${id}`, {
      method: 'PATCH',
      token,
      body: payload,
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  deleteCompetition: async (token, id) => {
    const res = await request(`/admin/competitions/${id}`, {
      method: 'DELETE',
      token,
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  setCompetitionPublish: async (token, id, isPublished) => {
    const res = await request(`/admin/competitions/${id}/publish`, {
      method: 'PATCH',
      token,
      body: { isPublished },
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  setCompetitionRegistrationClosing: async (token, id, isRegistrationClosed, extra = {}) => {
    const res = await request(`/admin/competitions/${id}/registration-status`, {
      method: 'PATCH',
      token,
      body: { isRegistrationClosed, ...extra },
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  toggleCompetitionCompletion: async (token, id, isCompleted) => {
    const res = await request(`/admin/competitions/${id}/complete`, {
      method: 'PATCH',
      token,
      body: isCompleted !== undefined ? { isCompleted } : {},
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  uploadCompetitionPoster: async (token, id, file) => {
    const formData = new FormData();
    formData.append('poster', file);
    const res = await request(`/admin/competitions/${id}/poster`, {
      method: 'POST',
      token,
      body: formData,
      isFormData: true,
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  removeCompetitionPoster: async (token, id) => {
    const res = await request(`/admin/competitions/${id}/poster`, {
      method: 'DELETE',
      token,
    });
    apiClient.invalidateCompetitionsCache();
    return res;
  },

  // Admin Competition Photos
  fetchCompetitionPhotos: (token, id) =>
    request(`/admin/competitions/${encodeURIComponent(id)}/photos`, { token }),
  uploadCompetitionPhotos: async (token, id, files, caption = '') => {
    const formData = new FormData();
    const fileList = Array.isArray(files) ? files : [files];
    for (const file of fileList) {
      formData.append('photos', file);
    }
    if (caption) {
      formData.append('caption', caption);
    }
    const res = await request(
      `/admin/competitions/${encodeURIComponent(id)}/photos`,
      {
        method: 'POST',
        token,
        body: formData,
        isFormData: true,
      }
    );
    apiClient.invalidateCompetitionsCache();
    return res;
  },
  deleteCompetitionPhoto: async (token, id, photoId) => {
    const res = await request(
      `/admin/competitions/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
      {
        method: 'DELETE',
        token,
      }
    );
    apiClient.invalidateCompetitionsCache();
    return res;
  },

  // Admin Categories & Groups
  addCategory: (token, competitionId, payload) =>
    request(`/admin/competitions/${competitionId}/categories`, {
      method: 'POST',
      token,
      body: payload,
    }),
  updateCategory: (token, competitionId, categoryId, payload) =>
    request(`/admin/competitions/${competitionId}/categories/${categoryId}`, {
      method: 'PATCH',
      token,
      body: payload,
    }),
  deleteCategory: (token, competitionId, categoryId) =>
    request(`/admin/competitions/${competitionId}/categories/${categoryId}`, {
      method: 'DELETE',
      token,
    }),
  addCategoryGroup: (token, competitionId, categoryId, payload) =>
    request(
      `/admin/competitions/${competitionId}/categories/${categoryId}/groups`,
      {
        method: 'POST',
        token,
        body: payload,
      }
    ),
  updateCategoryGroup: (token, competitionId, categoryId, groupId, payload) =>
    request(
      `/admin/competitions/${competitionId}/categories/${categoryId}/groups/${groupId}`,
      {
        method: 'PATCH',
        token,
        body: payload,
      }
    ),
  deleteCategoryGroup: (token, competitionId, categoryId, groupId) =>
    request(
      `/admin/competitions/${competitionId}/categories/${categoryId}/groups/${groupId}`,
      {
        method: 'DELETE',
        token,
      }
    ),

  // Admin Registrations
  fetchAdminRegistrations: (token, params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return request(`/admin/registrations${qs ? `?${qs}` : ''}`, { token });
  },
  fetchAdminRegistrationById: (token, id) =>
    request(`/admin/registrations/${id}`, { token }),
  updateRegistrationStatus: (token, id, registrationStatus) =>
    request(`/admin/registrations/${id}/status`, {
      method: 'PATCH',
      token,
      body: { registrationStatus },
    }),
  createManualRegistration: (token, payload) =>
    request('/admin/registrations/manual', {
      method: 'POST',
      token,
      body: payload,
    }),
  verifyRegistrationPayment: (token, id) =>
    request(`/admin/registrations/${id}/verify-payment`, {
      method: 'POST',
      token,
    }),
  fetchRefunds: (id) => request(`/admin/registrations/${encodeURIComponent(id)}/refunds`),
  requestRefund: (id, payload) => request(`/admin/registrations/${encodeURIComponent(id)}/refunds`, {
    method: 'POST', body: payload,
  }),
  reconcileRefunds: (id) => request(`/admin/registrations/${encodeURIComponent(id)}/refunds/reconcile`, {
    method: 'POST',
  }),
  downloadRegistrationsExport: async (token, params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    const url = `${env.apiBaseUrl}/admin/registrations/export${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new ApiError(res.status, errData?.message || 'Export failed.');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    let filename = `registrations_export_${Date.now()}.${params.format || 'xlsx'}`;
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    if (match && match[1]) {
      filename = decodeURIComponent(match[1]);
    }
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
    return { success: true, filename };
  },

  // Admin Trunk Numbers
  fetchCompetitionTrunkNumbers: (token, competitionId) =>
    request(
      `/admin/competitions/${encodeURIComponent(competitionId)}/trunk-numbers`,
      { token }
    ),
  assignTrunkNumbers: (token, competitionId) =>
    request(
      `/admin/competitions/${encodeURIComponent(competitionId)}/trunk-numbers/assign`,
      {
        method: 'POST',
        token,
      }
    ),
  editTrunkNumber: (token, competitionId, registrationId, trunkNumber) =>
    request(
      `/admin/competitions/${encodeURIComponent(competitionId)}/registrations/${encodeURIComponent(registrationId)}/trunk-number`,
      {
        method: 'PATCH',
        token,
        body: { trunkNumber },
      }
    ),
  downloadTrunkNumbersExport: async (token, competitionId) => {
    const url = `${env.apiBaseUrl}/admin/competitions/${encodeURIComponent(competitionId)}/trunk-numbers/export`;
    const headers = {};
    if (token && typeof token === 'string' && token.trim() && token !== 'cookie-session') {
      const rawToken = token.trim();
      headers.Authorization = rawToken.startsWith('Bearer ')
        ? rawToken
        : `Bearer ${rawToken}`;
    }
    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new ApiError(
        res.status,
        errData?.message || 'Trunk numbers export failed.'
      );
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    let filename = `trunk_numbers_${competitionId}_${Date.now()}.xlsx`;
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    if (match && match[1]) {
      filename = decodeURIComponent(match[1]);
    }
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
    return { success: true, filename };
  },

  // -------------------------------------------------------------
  // JUDGE & JUDGING SESSIONS
  // -------------------------------------------------------------
  fetchAdminJudges: (token, { activeOnly = false, competitionId = null } = {}) => {
    const params = new URLSearchParams();
    if (activeOnly) params.set('active', 'true');
    if (competitionId) params.set('competitionId', competitionId);
    const qs = params.toString();
    return request(`/admin/judges${qs ? `?${qs}` : ''}`, { token });
  },

  createAdminJudge: (token, payload) =>
    request('/admin/judges', { method: 'POST', token, body: payload }),

  updateAdminJudge: (token, id, payload) =>
    request(`/admin/judges/${encodeURIComponent(id)}`, {
      method: 'PUT',
      token,
      body: payload,
    }),

  deleteAdminJudge: (token, id) =>
    request(`/admin/judges/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    }),

  assignJudgeToCompetition: (token, competitionId, judgeId) =>
    request(`/admin/competitions/${encodeURIComponent(competitionId)}/judges/assign`, {
      method: 'POST',
      token,
      body: { judgeId },
    }),

  removeJudgeFromCompetition: (token, competitionId, judgeId) =>
    request(`/admin/competitions/${encodeURIComponent(competitionId)}/judges/${encodeURIComponent(judgeId)}`, {
      method: 'DELETE',
      token,
    }),

  fetchEligibleJudgingCompetitions: (token) =>
    request('/admin/judging/competitions', { token }),

  fetchCompetitionJudgingWorkspace: (token, competitionId) =>
    request(`/admin/judging/competitions/${encodeURIComponent(competitionId)}/workspace`, {
      token,
    }),

  startJudgingSession: (token, { competitionId, durationHours = 24 }) =>
    request('/admin/judging/sessions', {
      method: 'POST',
      token,
      body: { competitionId, durationHours },
    }),

  revokeJudgingSession: (token, sessionId) =>
    request(`/admin/judging/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST',
      token,
    }),

  fetchJudgingSessionProgress: (token, sessionId) =>
    request(`/admin/judging/sessions/${encodeURIComponent(sessionId)}/progress`, {
      token,
    }),

  fetchJudgingSessionResults: (token, sessionId) =>
    request(`/admin/judging/sessions/${encodeURIComponent(sessionId)}/results`, {
      token,
    }),

  // -------------------------------------------------------------
  // PUBLIC / JUDGE PORTAL
  // -------------------------------------------------------------
  fetchJudgingSession: (sessionToken, options = {}) => {
    const q = new URLSearchParams();
    if (options.judgeId) q.set('judgeId', options.judgeId);
    if (options.key) q.set('key', options.key);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request(`/judging/session/${encodeURIComponent(sessionToken)}${qs}`, {
      headers: options.judgeId ? { 'x-judge-id': options.judgeId } : {},
    });
  },

  identifyJudge: (sessionToken, judgeId, key = null) =>
    request(`/judging/session/${encodeURIComponent(sessionToken)}/identify`, {
      method: 'POST',
      body: { judgeId, key },
      headers: judgeId ? { 'x-judge-id': judgeId } : {},
    }),

  fetchJudgingProgression: (sessionToken, judgeId) => {
    const q = new URLSearchParams();
    if (judgeId) q.set('judgeId', judgeId);
    return request(
      `/judging/session/${encodeURIComponent(sessionToken)}/progression?${q.toString()}`,
      {
        headers: judgeId ? { 'x-judge-id': judgeId } : {},
      }
    );
  },

  completeEmptyCategory: (sessionToken, { judgeId, categoryId }) =>
    request(
      `/judging/session/${encodeURIComponent(sessionToken)}/complete-empty-category`,
      {
        method: 'POST',
        body: { judgeId, categoryId },
        headers: judgeId ? { 'x-judge-id': judgeId } : {},
      }
    ),

  fetchCategoryJudgingData: (sessionToken, { judgeId, categoryId, groupId }) => {
    const q = new URLSearchParams({ categoryId });
    if (groupId) q.set('groupId', groupId);
    if (judgeId) q.set('judgeId', judgeId);
    return request(
      `/judging/session/${encodeURIComponent(sessionToken)}/category-data?${q.toString()}`,
      {
        headers: judgeId ? { 'x-judge-id': judgeId } : {},
      }
    );
  },

  saveSemifinalistSelections: (
    sessionToken,
    { judgeId, categoryId, groupId, selectedRegistrationIds }
  ) =>
    request(`/judging/session/${encodeURIComponent(sessionToken)}/semifinalists`, {
      method: 'POST',
      body: { judgeId, categoryId, groupId, selectedRegistrationIds },
      headers: judgeId ? { 'x-judge-id': judgeId } : {},
    }),

  saveJudgeRankings: (
    sessionToken,
    { judgeId, categoryId, groupId, rankings }
  ) =>
    request(`/judging/session/${encodeURIComponent(sessionToken)}/rankings`, {
      method: 'POST',
      body: { judgeId, categoryId, groupId, rankings },
      headers: judgeId ? { 'x-judge-id': judgeId } : {},
    }),

  saveJudgeWinnerTitles: (
    sessionToken,
    { judgeId, categoryId, groupId, winnerTitles }
  ) =>
    request(`/judging/session/${encodeURIComponent(sessionToken)}/winners`, {
      method: 'POST',
      body: { judgeId, categoryId, groupId, winnerTitles },
      headers: judgeId ? { 'x-judge-id': judgeId } : {},
    }),

  // -------------------------------------------------------------
  // LIVE ROUND SCORING (admin)
  // -------------------------------------------------------------
  fetchLiveCompetitions: () => request('/admin/live/competitions'),
  fetchLiveDashboard: (competitionId) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}`),
  openLiveHeat: (competitionId, payload) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/heats`, {
      method: 'POST',
      body: payload,
    }),
  closeLiveHeat: (heatId) =>
    request(`/admin/live/heats/${encodeURIComponent(heatId)}/close`, { method: 'POST' }),
  cancelLiveHeat: (heatId) =>
    request(`/admin/live/heats/${encodeURIComponent(heatId)}/cancel`, { method: 'POST' }),
  unlockLiveJudgeSheet: (heatId, judgeId) =>
    request(
      `/admin/live/heats/${encodeURIComponent(heatId)}/judges/${encodeURIComponent(judgeId)}/unlock`,
      { method: 'POST' }
    ),
  setLiveQualifiers: (competitionId, payload) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/qualifiers`, {
      method: 'PUT',
      body: payload,
    }),
  setLiveTitleAwards: (competitionId, awards) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/titles`, {
      method: 'PUT',
      body: { awards },
    }),
  resetLiveScoring: (competitionId) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/reset`, { method: 'POST' }),
  regenerateLiveJudgeLink: (competitionId, judgeId) =>
    request(
      `/admin/live/competitions/${encodeURIComponent(competitionId)}/judges/${encodeURIComponent(judgeId)}/regenerate-link`,
      { method: 'POST' }
    ),

  // Participant verification & category board (admin)
  searchCompetitionParticipants: (competitionId, q) =>
    request(
      `/admin/live/competitions/${encodeURIComponent(competitionId)}/participants/search?q=${encodeURIComponent(q)}`
    ),
  fetchCategoryBoard: (competitionId) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/category-board`),
  fetchNextTrunkNumber: (competitionId) =>
    request(`/admin/live/competitions/${encodeURIComponent(competitionId)}/next-trunk-number`),
  updateParticipant: (registrationId, payload) =>
    request(`/admin/live/registrations/${encodeURIComponent(registrationId)}`, {
      method: 'PATCH',
      body: payload,
    }),

  // Judge scoring portal (public, private token)
  fetchJudgeScoringState: (token) => request(`/scoring/${encodeURIComponent(token)}`),
  submitJudgeScoringSheet: (token, heatId, payload) =>
    request(`/scoring/${encodeURIComponent(token)}/submit`, {
      method: 'POST',
      body: { heatId, payload },
    }),
};
