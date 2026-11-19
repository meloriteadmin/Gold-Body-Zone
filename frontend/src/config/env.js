

function normalizeApiBaseUrl(raw) {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return import.meta.env.PROD ? '/api' : 'http://localhost:5001/api';
  // Ensure /api suffix exists if origin only was supplied
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
}

const rawApiUrl =
  import.meta.env.VITE_API_URL?.trim() ||
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  '';

const apiBaseUrl = normalizeApiBaseUrl(rawApiUrl);

export const env = {
  apiBaseUrl,
  portalName: import.meta.env.VITE_PORTAL_NAME?.trim() || 'GOLD BODY ZONE',
  contactPhone: import.meta.env.VITE_CONTACT_PHONE?.trim() || '+91 9822986005',
  contactLocation:
    import.meta.env.VITE_CONTACT_LOCATION?.trim() ||
    "4th Floor, Anjaneya Tower, Above Domino's, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.",
};
