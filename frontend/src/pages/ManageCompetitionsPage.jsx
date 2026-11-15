import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Loader2,
  Plus,
  Trophy,
} from 'lucide-react';
import { CompetitionCard } from '../components/admin/CompetitionCard.jsx';
import { CompetitionFormModal } from '../components/admin/CompetitionFormModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';

export function ManageCompetitionsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);

  const loadCompetitions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.fetchAdminCompetitions(accessToken, {
        history: false,
      });
      setCompetitions(data.competitions || []);
    } catch (err) {
      setError(err.message || 'Failed to load competitions.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditingCompetition(null);
      setModalOpen(true);
      searchParams.delete('add');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSaveCompetition = async (
    payload,
    { posterFile, removePoster } = {}
  ) => {
    let savedCompetition;
    if (editingCompetition) {
      const res = await apiClient.updateCompetition(
        accessToken,
        editingCompetition.id,
        payload
      );
      savedCompetition = res.competition;

      if (removePoster) {
        const removeRes = await apiClient.removeCompetitionPoster(
          accessToken,
          editingCompetition.id
        );
        savedCompetition = removeRes.competition;
      } else if (posterFile) {
        const posterRes = await apiClient.uploadCompetitionPoster(
          accessToken,
          editingCompetition.id,
          posterFile
        );
        savedCompetition = posterRes.competition;
      }
    } else {
      const res = await apiClient.createCompetition(accessToken, payload);
      savedCompetition = res.competition;

      if (posterFile && savedCompetition?.id) {
        const posterRes = await apiClient.uploadCompetitionPoster(
          accessToken,
          savedCompetition.id,
          posterFile
        );
        savedCompetition = posterRes.competition;
      }
    }

    await loadCompetitions();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
            All Competitions
          </h2>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Click on any competition card to view registrations, edit details, or
            manage publication settings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingCompetition(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          <span>Add Competition</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#222222] py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
        </div>
      ) : competitions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#222222] px-6 py-16 text-center">
          <Trophy className="h-10 w-10 text-[#F15A24]" />
          <h3 className="font-display mt-4 text-2xl font-bold tracking-wide text-white uppercase">
            No Competitions Yet
          </h3>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Click Add Competition to create a competition in the database.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {competitions.map((comp) => (
            <CompetitionCard key={comp.id} competition={comp} />
          ))}
        </div>
      )}

      {/* Add / Edit Competition Modal */}
      <CompetitionFormModal
        isOpen={modalOpen}
        editingCompetition={editingCompetition}
        onClose={() => {
          setModalOpen(false);
          setEditingCompetition(null);
        }}
        onSave={handleSaveCompetition}
      />
    </div>
  );
}
