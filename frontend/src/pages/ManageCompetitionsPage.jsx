import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Check,
  Eye,
  EyeOff,
  ImageOff,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { CompetitionFormModal } from '../components/admin/CompetitionFormModal.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import {
  GENDER_ELIGIBILITY_LABELS,
} from '../constants/competitionOptions.js';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { getCompetitionPoster } from '../utils/competitionHelpers.js';
import { formatDate, formatFee } from '../utils/formatters.js';

export function ManageCompetitionsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  const handleTogglePublish = async (comp) => {
    setError('');
    setActionBusyId(comp.id);
    try {
      const res = await apiClient.setCompetitionPublish(
        accessToken,
        comp.id,
        !comp.isPublished
      );
      setCompetitions((prev) =>
        prev.map((c) => (c.id === comp.id ? res.competition : c))
      );
    } catch (err) {
      setError(err.message || 'Failed to update publication status.');
    } finally {
      setActionBusyId('');
    }
  };

  const handleDeleteCompetition = async (competitionId) => {
    setError('');
    setActionBusyId(competitionId);
    try {
      await apiClient.deleteCompetition(accessToken, competitionId);
      setCompetitions((prev) => prev.filter((c) => c.id !== competitionId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete competition.');
    } finally {
      setActionBusyId('');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#222222] p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
            All Competitions
          </h2>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Create, edit, publish, and configure competition categories and
            posters.
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
          Add Competition
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
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-[#222222] py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" />
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
        <div className="space-y-5">
          {competitions.map((comp) => {
            const busy = actionBusyId === comp.id;
            return (
              <article
                key={comp.id}
                className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#222222] transition-all duration-200 hover:border-[#F15A24]/40"
              >
                <div className="flex flex-col gap-6 p-5 md:flex-row">
                  {/* Poster Column */}
                  <div
                    onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                    className="w-full shrink-0 cursor-pointer md:w-44 group"
                  >
                    {comp.posterUrl ? (
                      <img
                        src={comp.posterUrl}
                        alt={`${comp.name} poster`}
                        className="h-52 w-full rounded-xl border border-white/10 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-52 w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#171717] p-4 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.04] text-zinc-500">
                          <ImageOff className="h-5 w-5" />
                        </div>
                        <span className="mt-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                          No Poster
                        </span>
                        <span className="mt-0.5 text-[10px] text-zinc-500">
                          Placeholder shown publicly
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content Column */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge variant="accent" withDot={false}>
                              {comp.competitionType}
                            </StatusBadge>
                            <StatusBadge
                              variant={
                                comp.isCompleted
                                  ? 'completed'
                                  : comp.isPublished
                                    ? 'published'
                                    : 'draft'
                              }
                            >
                              {comp.isCompleted
                                ? 'Completed'
                                : comp.isPublished
                                  ? 'Published'
                                  : 'Draft'}
                            </StatusBadge>
                          </div>

                          <h3
                            onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                            className="font-display mt-2 cursor-pointer text-3xl font-extrabold tracking-wide text-white uppercase transition-colors hover:text-[#F15A24]"
                          >
                            {comp.name}
                          </h3>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-[10px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
                            Registration Fee
                          </p>
                          <p className="font-display text-2xl font-bold text-[#F15A24]">
                            {formatFee(comp.registrationFee)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
                        {comp.description || 'Description: Not Set'}
                      </p>

                      {/* Metadata Grid */}
                      <div className="mt-4 grid grid-cols-1 gap-2.5 rounded-xl border border-white/[0.06] bg-[#171717] p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="flex items-center gap-2 text-zinc-200">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
                          <span>Date: {formatDate(comp.eventDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-200">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-[#E94B16]" />
                          <span>
                            Deadline: {formatDate(comp.registrationDeadline)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-200">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
                          <span>Venue: {comp.venue || 'Not Set'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-200">
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
                          <span>
                            {GENDER_ELIGIBILITY_LABELS[comp.genderEligibility] ||
                              'Male & Female'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-[#A1A1AA]">
                        {comp.ageEligibility && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#F15A24]/30 bg-[#F15A24]/10 px-2.5 py-1 font-medium text-orange-200">
                            <ShieldAlert className="h-3.5 w-3.5 text-[#F15A24]" />
                            Eligibility: {comp.ageEligibility}
                          </span>
                        )}
                        {comp.maxParticipants && (
                          <span className="inline-flex items-center rounded-lg border border-white/10 bg-[#171717] px-2.5 py-1 text-zinc-300">
                            Max Participants: {comp.maxParticipants}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] pt-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTogglePublish(comp)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                          comp.isPublished
                            ? 'border border-white/15 bg-[#171717] text-zinc-200 hover:bg-white/10'
                            : 'border border-emerald-500/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                        }`}
                      >
                        {comp.isPublished ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Publish
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingCompetition(comp);
                          setModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[#F15A24]" />
                        Edit
                      </button>

                      {confirmDeleteId === comp.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDeleteCompetition(comp.id)}
                            className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-500"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(comp.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
