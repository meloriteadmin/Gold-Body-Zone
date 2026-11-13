const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:5001/api';

export const env = {
  apiBaseUrl,
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  portalName: import.meta.env.VITE_PORTAL_NAME?.trim() || 'IRONSTAGE',
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL?.trim() || '',
  contactPhone: import.meta.env.VITE_CONTACT_PHONE?.trim() || '',
  contactLocation: import.meta.env.VITE_CONTACT_LOCATION?.trim() || '',
};
