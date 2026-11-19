import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminProfile, setAdminProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.adminSession()
      .then((data) => { if (active) setAdminProfile(data.profile); })
      .catch(() => { if (active) setAdminProfile(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      const data = await apiClient.adminLogin(email, password);
      setAdminProfile(data.profile);
      setAuthError('');
      return data.profile;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await apiClient.adminLogout(); }
    finally { setAdminProfile(null); setAuthError(''); }
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await apiClient.changeAdminPassword(currentPassword, newPassword);
    setAdminProfile(null);
  }, []);

  const sendPasswordResetEmail = useCallback(async (email) => {
    await apiClient.requestAdminPasswordReset(email || adminProfile?.email);
    return true;
  }, [adminProfile?.email]);

  const refreshAdminProfile = useCallback(async () => {
    const data = await apiClient.adminSession();
    setAdminProfile(data.profile);
    return data.profile;
  }, []);

  const value = useMemo(() => ({
    session: adminProfile ? { expires_at: null } : null,
    accessToken: adminProfile ? 'cookie-session' : '',
    adminProfile,
    isAuthenticated: Boolean(adminProfile),
    loading,
    authError,
    signIn,
    signOut,
    changePassword,
    sendPasswordResetEmail,
    refreshAdminProfile,
    setAdminProfile,
  }), [adminProfile, loading, authError, signIn, signOut, changePassword, sendPasswordResetEmail, refreshAdminProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
