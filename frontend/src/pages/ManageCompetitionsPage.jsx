import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
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
  const [successMsg, setSuccessMsg] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);

  // Delete modal state
  const [competitionToDelete, setCompetitionToDelete] = useState(null);
  const [deletingCompetition, setDeletingCompetition] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const handleConfirmDelete = async () => {
    if (!competitionToDelete) return;
    setDeletingCompetition(true);
    setDeleteError('');
    try {
      await apiClient.deleteCompetition(accessToken, competitionToDelete.id);
      setSuccessMsg(
        `Competition "${competitionToDelete.name}" deleted successfully.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
      setCompetitionToDelete(null);
      await loadCompetitions();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete competition.');
    } finally {
      setDeletingCompetition(false);
    }
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

      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

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
            <CompetitionCard
              key={comp.id}
              competition={comp}
              showDelete={true}
              onDelete={(c) => {
                setDeleteError('');
                setCompetitionToDelete(c);
              }}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {competitionToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#171717] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-500/10 p-2.5">
                {(competitionToDelete.registrationStats?.total ?? 0) > 0 ? (
                  <AlertCircle className="h-6 w-6 text-amber-400" />
                ) : (
                  <Trash2 className="h-6 w-6 text-red-400" />
                )}
              </div>
              <div>
                <h3
                  id="delete-dialog-title"
                  className="font-display text-lg font-bold text-white uppercase"
                >
                  {(competitionToDelete.registrationStats?.total ?? 0) > 0
                    ? 'Deletion Restricted'
                    : 'Delete Competition?'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {(competitionToDelete.registrationStats?.total ?? 0) > 0
                    ? 'Competitions with participant records cannot be deleted'
                    : 'This action cannot be undone.'}
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                {deleteError}
              </div>
            )}

            {(competitionToDelete.registrationStats?.total ?? 0) > 0 ? (
              <div className="space-y-3 text-xs text-[#A1A1AA] leading-relaxed">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-200">
                  <p className="font-semibold text-amber-300">
                    This competition cannot be deleted because participant registrations exist.
                  </p>
                  <p className="mt-1 text-[11px] text-amber-200/80">
                    This competition contains{' '}
                    <strong>{competitionToDelete.registrationStats?.total}</strong> registered participant record(s). To preserve athlete records, category allocations, and payment audit history, competitions with registrations cannot be permanently deleted.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-white">"{competitionToDelete.name}"</strong>?
                This competition has 0 registrations and will be permanently removed along with all its categories and event photos.
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  setCompetitionToDelete(null);
                  setDeleteError('');
                }}
                disabled={deletingCompetition}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {(competitionToDelete.registrationStats?.total ?? 0) === 0 && (
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingCompetition}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white uppercase transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {deletingCompetition ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Competition</span>
                  )}
                </button>
              )}
            </div>
          </div>
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
