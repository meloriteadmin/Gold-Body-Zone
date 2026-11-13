import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout.jsx';
import { ProtectedAdminRoute } from '../components/auth/ProtectedAdminRoute.jsx';
import { PublicLayout } from '../components/public/PublicLayout.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ParticipantAuthProvider } from '../context/ParticipantAuthContext.jsx';
import { AdminLoginPage } from '../pages/AdminLoginPage.jsx';
import { AdminProfilePage } from '../pages/AdminProfilePage.jsx';
import { AdminResetPasswordPage } from '../pages/AdminResetPasswordPage.jsx';
import { CompetitionDetailsPage } from '../pages/CompetitionDetailsPage.jsx';
import { CompetitionsListPage } from '../pages/CompetitionsListPage.jsx';
import { DashboardOverviewPage } from '../pages/DashboardOverviewPage.jsx';
import { JudgePlaceholderPage } from '../pages/JudgePlaceholderPage.jsx';
import { ManageCompetitionsPage } from '../pages/ManageCompetitionsPage.jsx';
import { ParticipantLoginPage } from '../pages/ParticipantLoginPage.jsx';
import { ParticipantProfilePage } from '../pages/ParticipantProfilePage.jsx';
import { ParticipantSignupPage } from '../pages/ParticipantSignupPage.jsx';
import { PublicHomePage } from '../pages/PublicHomePage.jsx';
import { RegistrationsPage } from '../pages/RegistrationsPage.jsx';

function PublicPortalScope() {
  return (
    <ParticipantAuthProvider>
      <PublicLayout />
    </ParticipantAuthProvider>
  );
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
      <Routes>
        {/* Public Competition Portal */}
        <Route element={<PublicPortalScope />}>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/competitions" element={<CompetitionsListPage />} />
          <Route path="/competitions/:id" element={<CompetitionDetailsPage />} />
          <Route path="/login" element={<ParticipantLoginPage />} />
          <Route path="/signup" element={<ParticipantSignupPage />} />
          <Route path="/profile" element={<ParticipantProfilePage />} />
        </Route>

        {/* Separate Protected Admin Portal */}
        <Route element={<AdminPortalScope />}>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/reset-password" element={<AdminResetPasswordPage />} />
          <Route element={<ProtectedAdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardOverviewPage />} />
              <Route path="competitions" element={<ManageCompetitionsPage />} />
              <Route path="registrations" element={<RegistrationsPage />} />
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
