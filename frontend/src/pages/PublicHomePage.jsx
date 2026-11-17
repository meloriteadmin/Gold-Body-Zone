import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  ClipboardCheck,
  Loader2,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import dewaliShreePoster from '../assets/images/Dewali Shree 2026 Bodybuilding Poster (1).png';
import { CompetitionPosterCard } from '../components/public/CompetitionPosterCard.jsx';
import { apiClient } from '../lib/apiClient.js';
import './PublicHomeHero.css';

const EMBERS = [
  { left: '8%', top: '34%', size: 4, opacity: 0.85 },
  { left: '14%', top: '22%', size: 3, opacity: 0.7 },
  { left: '19%', top: '54%', size: 5, opacity: 0.6 },
  { left: '24%', top: '18%', size: 3, opacity: 0.65 },
  { left: '72%', top: '20%', size: 4, opacity: 0.75 },
  { left: '78%', top: '31%', size: 3, opacity: 0.8 },
  { left: '84%', top: '48%', size: 5, opacity: 0.65 },
  { left: '89%', top: '26%', size: 3, opacity: 0.7 },
  { left: '12%', top: '76%', size: 4, opacity: 0.7 },
  { left: '86%', top: '72%', size: 4, opacity: 0.75 },
  { left: '46%', top: '78%', size: 3, opacity: 0.55 },
  { left: '61%', top: '74%', size: 4, opacity: 0.6 },
];

export function PublicHomePage() {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCompetitions = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.fetchPublishedCompetitions({ force });
      setCompetitions(data.competitions || []);
    } catch (err) {
      setError(err.message || 'Unable to load published competitions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function initLoad() {
      setLoading(true);
      setError('');
      try {
        const data = await apiClient.fetchPublishedCompetitions();
        if (active) {
          setCompetitions(data.competitions || []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load published competitions.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initLoad();

    const handleFocus = () => {
      apiClient
        .fetchPublishedCompetitions({ force: true })
        .then((data) => {
          if (active && data?.competitions) {
            setCompetitions(data.competitions);
          }
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <main className="overflow-x-hidden bg-[#101010]">
      {/* GOLD BODY ZONE Hero Section */}
      <section className="gymx-hero-stage" aria-label="Hero">
        {/* Background Artwork, Fire Smoke & Floating Embers */}
        <div className="gymx-hero-bg" aria-hidden="true">
          <div className="gymx-spotlight" />
          <div className="gymx-smoke-left" />
          <div className="gymx-smoke-right" />

          <div className="gymx-top-vignette" />

          <div className="gymx-embers">
            {EMBERS.map((ember, index) => (
              <span
                key={index}
                className="gymx-ember"
                style={{
                  left: ember.left,
                  top: ember.top,
                  width: `${ember.size}px`,
                  height: `${ember.size}px`,
                  opacity: ember.opacity,
                }}
              />
            ))}
          </div>
        </div>

        {/* Centered Overlapping Hero Heading & Competition Posters */}
        <div className="gymx-hero-content">
          <h1 className="gymx-hero-title">
            <span className="gymx-hero-line gymx-text-orange">YOUR STAGE.</span>
            <span className="gymx-hero-line gymx-text-white">YOUR STRENGTH.</span>
            <span className="gymx-hero-line gymx-text-orange">
              YOUR CHAMPIONSHIP.
            </span>
          </h1>

          {/* Dewali Shree 2026 Grand Championship Official Poster - Seamless on Hero Background */}
          <div className="gymx-hero-poster-wrap">
            <img
              src={dewaliShreePoster}
              alt="Dewali Shree 2026 - Men's Bodybuilding & Men's Physique Grand District Level Championship"
              className="gymx-hero-poster-img"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* About Section (#171717 Band) */}
      <section
        id="about"
        className="scroll-mt-20 border-b border-white/[0.06] bg-[#171717] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
              About The Platform
            </p>
            <h2 className="font-display mt-2 text-4xl font-extrabold tracking-wide text-white uppercase sm:text-5xl">
              Built For Competitive Athletes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
              Review sanctioned bodybuilding, men&apos;s physique, and masters
              events with transparent category rules, instant online checkout,
              and verified stage entry tracking.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-[#222222] p-7 transition-colors hover:border-[#F15A24]/40">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F15A24]/15 text-[#F15A24]">
                <Award className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-2xl font-bold tracking-wide text-white uppercase">
                Multiple Competition Divisions
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
Compete in Bodybuilding, Men's Physique, Masters and Women's categories.              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#222222] p-7 transition-colors hover:border-[#F15A24]/40">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F15A24]/15 text-[#F15A24]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-2xl font-bold tracking-wide text-white uppercase">
               Category-Based Eligibility
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
Choose eligible categories based on age, gender and competition rules.              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#222222] p-7 transition-colors hover:border-[#F15A24]/40">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F15A24]/15 text-[#F15A24]">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-2xl font-bold tracking-wide text-white uppercase">
                Registration Confirmation & Stage Check-In
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
                Receive instant confirmation with a verified Registration ID for stage entry and weigh-in verification.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Active Published Competitions Preview */}
      <section className="bg-[#101010] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="flex flex-col justify-between gap-6 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
                Active Championships
              </p>
              <h2 className="font-display mt-2 text-4xl font-extrabold tracking-wide text-white uppercase sm:text-5xl">
                Published Competitions
              </h2>
            </div>

            <Link
              to="/competitions"
              className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-[#F15A24] uppercase transition-colors hover:text-white"
            >
              View All Competitions
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="aspect-[4/5] animate-pulse rounded-2xl border border-white/[0.08] bg-[#171717]"
                />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200 sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => loadCompetitions(true)}
                className="rounded-full bg-[#F15A24] px-5 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#ff672e]"
              >
                Retry
              </button>
            </div>
          ) : competitions.length === 0 ? (
            <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#171717] px-6 py-20 text-center">
              <Trophy className="h-12 w-12 text-[#F15A24]" />
              <h3 className="font-display mt-4 text-3xl font-bold tracking-wide text-white uppercase">
                No Published Competitions Available
              </h3>
              <p className="mt-2 max-w-md text-sm text-[#A1A1AA]">
                Upcoming official events will appear here automatically once
                published by the organizer.
              </p>
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {competitions.map((comp) => (
                <CompetitionPosterCard
                  key={comp.id}
                  competition={comp}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
