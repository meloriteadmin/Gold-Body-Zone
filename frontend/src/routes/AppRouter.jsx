import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout.jsx';
import { ProtectedAdminRoute } from '../components/auth/ProtectedAdminRoute.jsx';
import { PublicLayout } from '../components/public/PublicLayout.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { AdminLoginPage } from '../pages/AdminLoginPage.jsx';
import { AdminProfilePage } from '../pages/AdminProfilePage.jsx';
import { AdminCompetitionDetailPage } from '../pages/AdminCompetitionDetailPage.jsx';
import { CompetitionDetailsPage } from '../pages/CompetitionDetailsPage.jsx';
import { CompetitionsListPage } from '../pages/CompetitionsListPage.jsx';
import { ContactPage } from '../pages/ContactPage.jsx';
import { DashboardOverviewPage } from '../pages/DashboardOverviewPage.jsx';
import { HistoryPage } from '../pages/HistoryPage.jsx';
import { JudgePlaceholderPage } from '../pages/JudgePlaceholderPage.jsx';
import { ManageCompetitionsPage } from '../pages/ManageCompetitionsPage.jsx';
import { PublicHomePage } from '../pages/PublicHomePage.jsx';
import { RegistrationsPage } from '../pages/RegistrationsPage.jsx';
import { TermsPage } from '../pages/TermsPage.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function AdminPortalScope() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public Competition Portal */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/competitions" element={<CompetitionsListPage />} />
          <Route path="/competitions/:id" element={<CompetitionDetailsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/terms-and-conditions" element={<TermsPage />} />
        </Route>

        {/* Separate Protected Admin Portal */}
        <Route element={<AdminPortalScope />}>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<ProtectedAdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardOverviewPage />} />
              <Route path="competitions" element={<ManageCompetitionsPage />} />
              <Route path="competitions/:id" element={<AdminCompetitionDetailPage />} />
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="judge" element={<JudgePlaceholderPage />} />
              <Route path="profile" element={<AdminProfilePage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
