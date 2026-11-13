import { useEffect, useState } from 'react';
import { AlertCircle, Trophy } from 'lucide-react';
import { CompetitionPosterCard } from '../components/public/CompetitionPosterCard.jsx';
import { useParticipantAuth } from '../context/ParticipantAuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';

export function CompetitionsListPage() {
  const { registrationsByCompetitionId, accessToken, refreshRegistrations } =
    useParticipantAuth();
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (accessToken) {
      refreshRegistrations(accessToken).catch(() => {});
    }
  }, [accessToken, refreshRegistrations]);

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
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="bg-[#101010] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="mb-8 border-b border-white/[0.08] pb-8">
          <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
            Sanctioned Events
          </p>
          <h1 className="font-display mt-2 text-5xl font-extrabold tracking-wide text-white uppercase sm:text-6xl">
            Competitions
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[#A1A1AA]">
            Select any published competition poster to review full event rules,
            categories, eligibility requirements, and athlete registration.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
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
            className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200 sm:flex-row sm:items-center"
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
          <section className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#171717] px-6 py-24 text-center">
            <Trophy className="h-12 w-12 text-[#F15A24]" />
            <h2 className="font-display mt-4 text-3xl font-bold tracking-wide text-white uppercase">
              No Published Competitions Available
            </h2>
            <p className="mt-2 max-w-md text-sm text-[#A1A1AA]">
              Published competitions will appear here automatically once
              configured by the administrator.
            </p>
          </section>
        ) : (
          <section className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {competitions.map((comp) => (
              <CompetitionPosterCard
                key={comp.id}
                competition={comp}
                userRegistration={registrationsByCompetitionId[comp.id] || null}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
