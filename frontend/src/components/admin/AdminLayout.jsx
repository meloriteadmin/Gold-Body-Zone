import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Dumbbell,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAdminInactivity } from '../../hooks/useAdminInactivity.js';
import { AdminSessionWarningModal } from './AdminSessionWarningModal.jsx';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    to: '/admin/competitions',
    label: 'Manage Competitions',
    icon: Trophy,
    end: false,
  },
  {
    to: '/admin/registrations',
    label: 'Registrations',
    icon: ClipboardList,
    end: false,
  },
  { to: '/admin/judge', label: 'Judge', icon: Gavel, end: false },
  {
    to: '/admin/profile',
    label: 'Admin Profile',
    icon: UserCheck,
    end: false,
  },
];

const ROUTE_TITLES = {
  '/admin': 'Dashboard',
  '/admin/competitions': 'Manage Competitions',
  '/admin/registrations': 'Registrations',
  '/admin/judge': 'Judge',
  '/admin/profile': 'Admin Profile',
};

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { isWarningOpen, secondsRemaining, extendSession, performLogout } =
    useAdminInactivity();

  const pageTitle = ROUTE_TITLES[location.pathname] || 'Admin Dashboard';

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#101010] text-white lg:flex">
      <AdminSessionWarningModal
        isOpen={isWarningOpen}
        secondsRemaining={secondsRemaining}
        onExtend={extendSession}
        onLogout={performLogout}
      />
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-[#171717] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F15A24] to-[#E94B16] shadow-lg shadow-[#F15A24]/25">
              <Dumbbell className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-display text-xl font-extrabold tracking-wider text-white uppercase">
                IRONSTAGE
              </p>
              <p className="text-[11px] font-semibold tracking-widest text-[#F15A24] uppercase">
                Admin Panel
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-[#A1A1AA] hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation - Strictly the 5 sections + Logout */}
        <nav
          className="flex-1 space-y-1.5 px-4 py-6"
          aria-label="Admin Navigation"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#F15A24]/20 to-[#E94B16]/10 text-white ring-1 ring-[#F15A24]/50'
                      : 'text-[#A1A1AA] hover:bg-[#222222] hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? 'text-[#F15A24]' : 'text-[#A1A1AA]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Logout (6th sidebar option) */}
        <div className="border-t border-white/[0.08] p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E94B16]/40 bg-[#E94B16]/10 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#E94B16]/25"
          >
            <LogOut className="h-4 w-4 text-[#F15A24]" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.08] bg-[#101010]/90 px-4 py-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-white/10 bg-[#222222] p-2 text-white lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase sm:text-3xl">
              {pageTitle}
            </h1>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
