import { useState } from 'react';
import { LogOut, Menu, User, X } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../context/ParticipantAuthContext.jsx';

export function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, user, signOut } = useParticipantAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleAnchorClick = (hash) => {
    setMobileOpen(false);
    if (location.pathname !== '/') {
      navigate(`/${hash}`);
      setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const displayName =
    user?.user_metadata?.full_name?.split(' ')[0] || 'Profile';

  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-9">
        <Link
          to="/"
          className="font-display text-3xl leading-none font-extrabold tracking-wide uppercase focus:outline-none sm:text-4xl"
        >
          <span className="text-white">IRON</span>
          <span className="text-[#F15A24]">STAGE</span>
        </Link>

        {/* Rounded Dark Navigation Pill */}
        <nav
          aria-label="Primary Navigation"
          className="hidden items-center gap-8 rounded-full border border-white/[0.06] bg-[#141414]/95 px-9 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.65)] md:flex"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm font-medium transition-colors duration-150 ${
                isActive && !location.hash
                  ? 'text-[#E85A1B]'
                  : 'text-zinc-300 hover:text-white'
              }`
            }
          >
            Home
          </NavLink>

          <button
            type="button"
            onClick={() => handleAnchorClick('#about')}
            className={`text-sm font-medium transition-colors duration-150 ${
              location.hash === '#about'
                ? 'text-[#E85A1B]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            About
          </button>

          <NavLink
            to="/competitions"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'text-[#E85A1B]'
                  : 'text-zinc-300 hover:text-white'
              }`
            }
          >
            Competitions
          </NavLink>
        </nav>

        {/* Auth Actions (Desktop) */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F15A24] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_20px_rgba(241,90,36,0.28)] transition-all hover:bg-[#ff672e]"
              >
                <User className="h-4 w-4 text-white" />
                {displayName}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                aria-label="Logout"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#141414] text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-[#F15A24] px-6 py-2.5 text-sm font-medium text-white shadow-[0_4px_20px_rgba(241,90,36,0.28)] transition-all hover:bg-[#ff672e]"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#171717] text-white md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/[0.08] bg-[#171717] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2" aria-label="Mobile Navigation">
            <NavLink
              to="/"
              end
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `rounded-xl px-4 py-3 text-xs font-bold tracking-wider uppercase transition-colors ${
                  isActive
                    ? 'bg-[#F15A24]/15 text-[#F15A24]'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                }`
              }
            >
              Home
            </NavLink>
            <button
              type="button"
              onClick={() => handleAnchorClick('#about')}
              className="rounded-xl px-4 py-3 text-left text-xs font-bold tracking-wider text-zinc-300 uppercase transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              About
            </button>
            <NavLink
              to="/competitions"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `rounded-xl px-4 py-3 text-xs font-bold tracking-wider uppercase transition-colors ${
                  isActive
                    ? 'bg-[#F15A24]/15 text-[#F15A24]'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                }`
              }
            >
              Competitions
            </NavLink>

            <div className="mt-2 border-t border-white/[0.08] pt-3">
              {isAuthenticated ? (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-[#222222] px-5 py-3 text-xs font-bold tracking-wider text-white uppercase"
                  >
                    <User className="h-4 w-4 text-[#F15A24]" />
                    My Profile &amp; Registrations
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      setMobileOpen(false);
                      await signOut();
                      navigate('/');
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-red-500/35 bg-red-500/10 px-5 py-3 text-xs font-bold tracking-wider text-red-200 uppercase"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-3 text-xs font-bold tracking-wider text-white uppercase"
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-3 text-xs font-bold tracking-wider text-white uppercase"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
