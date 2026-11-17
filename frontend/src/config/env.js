
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

function normalizeApiBaseUrl(raw) {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return 'http://localhost:5001/api';
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
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  portalName: import.meta.env.VITE_PORTAL_NAME?.trim() || 'GOLD BODY ZONE',
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'bodyzone82@gmail.com',
  contactPhone: import.meta.env.VITE_CONTACT_PHONE?.trim() || '+91 9822986005',
  contactLocation:
    import.meta.env.VITE_CONTACT_LOCATION?.trim() ||
    "4th Floor, Anjaneya Tower, Above Domino's, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.",
};
