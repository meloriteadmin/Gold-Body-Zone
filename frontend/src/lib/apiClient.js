import { env } from '../config/env.js';
import { supabase } from './supabase.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function resolveToken(token) {
  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return data.session.access_token.trim();
      }
    } catch {
      // Ignore session read error
    }
  }
  return '';
}

async function request(
  path,
  { method = 'GET', token, body, isFormData = false, timeoutMs = 0 } = {}
) {
  const headers = {};
  const rawToken = await resolveToken(token);
  if (rawToken) {
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
  downloadRegistrationsExport: async (token, params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    const url = `${env.apiBaseUrl}/admin/registrations/export${qs ? `?${qs}` : ''}`;
    const rawToken = await resolveToken(token);
    const headers = {};
    if (rawToken) {
      headers.Authorization = rawToken.startsWith('Bearer ')
        ? rawToken
        : `Bearer ${rawToken}`;
    }
    const res = await fetch(url, { headers });
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
};
