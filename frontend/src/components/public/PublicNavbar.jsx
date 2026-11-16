import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

export function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
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

  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md">
      <div className="relative mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-9">
        <Link
          to="/"
          className="font-display text-2xl leading-none font-extrabold tracking-wide uppercase focus:outline-none sm:text-4xl"
        >
          <span className="text-white">GOLD BODY </span>
          <span className="text-[#F15A24]">ZONE</span>
        </Link>

        {/* Rounded Dark Navigation Pill - Centred Horizontally */}
        <nav
          aria-label="Primary Navigation"
          className="hidden items-center gap-8 rounded-full border border-white/[0.06] bg-[#141414]/95 px-9 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.65)] md:flex md:absolute md:left-1/2 md:-translate-x-1/2"
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
            className={`cursor-pointer text-sm font-medium transition-colors duration-150 ${
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

        {/* Mobile Menu Trigger */}
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
          </nav>
        </div>
      )}
    </header>
  );
}
