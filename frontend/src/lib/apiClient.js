import { env } from '../config/env.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(
  path,
  { method = 'GET', token, body, isFormData = false, timeoutMs = 0 } = {}
) {
  const headers = {};
  if (token) {
    const rawToken = typeof token === 'string' ? token.trim() : '';
    if (rawToken) {
      headers.Authorization = rawToken.startsWith('Bearer ')
        ? rawToken
        : `Bearer ${rawToken}`;
    }
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

  return data;
}

let cachedCompetitions = null;
let cachedCompetitionsExpiry = 0;
let pendingCompetitionsPromise = null;

const competitionDetailCache = new Map();
const pendingDetailPromises = new Map();

let pendingMyRegistrationsPromise = null;
let lastMyRegistrationsToken = null;

export const apiClient = {
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
        cachedCompetitionsExpiry = Date.now() + 60000; // 60s in-memory cache
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
          const entry = { data, expiry: Date.now() + 60000 };
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
  fetchMyRegistrations: (token) => {
    const cleanToken = typeof token === 'string' ? token.trim() : '';
    if (
      pendingMyRegistrationsPromise &&
      lastMyRegistrationsToken === cleanToken
    ) {
      return pendingMyRegistrationsPromise;
    }

    lastMyRegistrationsToken = cleanToken;
    const promise = request('/public/my-registrations', {
      token: cleanToken,
      timeoutMs: 15000,
    }).finally(() => {
      if (pendingMyRegistrationsPromise === promise) {
        pendingMyRegistrationsPromise = null;
        lastMyRegistrationsToken = null;
      }
    });

    pendingMyRegistrationsPromise = promise;
    return promise;
  },

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
  fetchAdminCompetitions: (token) => request('/admin/competitions', { token }),
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

  // Admin Categories
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
};
