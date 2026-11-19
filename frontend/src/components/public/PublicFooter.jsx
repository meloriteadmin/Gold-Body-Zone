import { MapPin, Phone } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const FOOTER_CONTACT = {
  businessName: 'GOLD BODY ZONE GYM',
  phone: '+91 9822986005',
  phoneClean: '+919822986005',
  address:
    "4th Floor, Anjaneya Tower, Above Domino's, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.",
};

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
    <footer className="border-t border-white/[0.08] bg-[#0c0c0c] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand & Description Column */}
          <div className="lg:col-span-5">
            <Link
              to="/"
              className="font-display inline-block text-2xl leading-none font-extrabold tracking-wide uppercase sm:text-3xl"
            >
              <span className="text-white">GOLD BODY </span>
              <span className="text-[#F15A24]">ZONE</span>
              <span className="ml-2 text-xs font-bold tracking-widest text-zinc-400 uppercase sm:text-sm">
                GYM
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#A1A1AA]">
              Nashik’s premier strength training center and competition arena. Dedicated to elite
              physique development, heavy lifting, and sanctioned championship bodybuilding events.
            </p>
          </div>

          {/* Quick Links Column */}
          <div className="lg:col-span-3">
            <p className="text-xs font-bold tracking-wider text-white uppercase">
              Quick Links
            </p>
            <nav
              aria-label="Footer Quick Links"
              className="mt-4 flex flex-col space-y-2.5 text-sm text-[#A1A1AA]"
            >
              <Link to="/" className="transition-colors hover:text-[#F15A24]">
                Home
              </Link>
              <button
                type="button"
                onClick={handleAboutClick}
                className="cursor-pointer text-left transition-colors hover:text-[#F15A24]"
              >
                About
              </button>
              <Link
                to="/competitions"
                className="transition-colors hover:text-[#F15A24]"
              >
                Competitions
              </Link>
              <Link
                to="/contact"
                className="transition-colors hover:text-[#F15A24]"
              >
                Contact Us
              </Link>
              <Link
                to="/terms"
                className="transition-colors hover:text-[#F15A24]"
              >
                Terms &amp; Conditions
              </Link>
            </nav>
          </div>

          {/* Contact Details Column */}
          <div className="lg:col-span-4">
            <p className="text-xs font-bold tracking-wider text-white uppercase">
              Contact Details
            </p>
            <div className="mt-4 space-y-3.5 text-sm text-[#A1A1AA]">
              {/* Phone */}
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#F15A24]" />
                <div>
                  <a
                    href={`tel:${FOOTER_CONTACT.phoneClean}`}
                    className="font-medium text-white transition-colors hover:text-[#F15A24]"
                  >
                    {FOOTER_CONTACT.phone}
                  </a>
                  <p className="text-[11px] text-zinc-500">Call for enquiries</p>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F15A24]" />
                <p className="text-xs leading-relaxed text-zinc-300">
                  {FOOTER_CONTACT.address}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Attribution */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-6 text-xs text-[#A1A1AA] sm:flex-row">
          <p>© {new Date().getFullYear()} GOLD BODY ZONE GYM. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/contact" className="transition-colors hover:text-white">
              Contact Us
            </Link>
            <Link to="/competitions" className="transition-colors hover:text-white">
              Competitions
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
