import { Link, useLocation, useNavigate } from 'react-router-dom';

export function PublicFooter() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleAboutClick = () => {
    if (location.pathname !== '/') {
      navigate('/#about');
      setTimeout(() => {
        document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="border-t border-white/[0.08] bg-[#101010] text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div>
            <Link
              to="/"
              className="font-display inline-block text-2xl leading-none font-extrabold tracking-wide uppercase sm:text-3xl"
            >
              <span className="text-white">GOLD BODY </span>
              <span className="text-[#F15A24]">ZONE</span>
            </Link>
            <p className="mt-3 text-sm text-[#A1A1AA]">
              Built for athletes. Driven by competition.
            </p>
          </div>

          <nav
            aria-label="Footer Navigation"
            className="flex flex-wrap items-center gap-6 text-sm font-medium text-[#A1A1AA]"
          >
            <Link to="/" className="transition-colors hover:text-[#F15A24]">
              Home
            </Link>
            <button
              type="button"
              onClick={handleAboutClick}
              className="cursor-pointer transition-colors hover:text-[#F15A24]"
            >
              About
            </button>
            <Link
              to="/competitions"
              className="transition-colors hover:text-[#F15A24]"
            >
              Competitions
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/[0.08] pt-6 text-xs text-[#A1A1AA]">
          <p>© {new Date().getFullYear()} GOLD BODY ZONE. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
