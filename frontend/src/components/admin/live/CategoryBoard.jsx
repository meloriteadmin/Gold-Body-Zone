import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { apiClient } from '../../../lib/apiClient.js';
import { CategoryBreakdownPanel } from '../CategoryBreakdownPanel.jsx';
import { ParticipantEditModal } from '../ParticipantEditModal.jsx';
import { VerificationDesk } from './VerificationDesk.jsx';
import { ManualRegistrationModal } from '../ManualRegistrationModal.jsx';
import { Banner, GhostButton } from './liveUi.jsx';

/**
 * Category-wise board for a competition: every category → its participants with
 * trunk numbers. Everything (including trunk numbers) can be edited.
 */
export function CategoryBoard({ competition, onBack }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [refreshAfterEdit, setRefreshAfterEdit] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [flash, setFlash] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCompetition, setManualCompetition] = useState(null);
  const [manualCategoryId, setManualCategoryId] = useState('');
  const [error, setError] = useState('');
  const openManual = async (categoryId = '') => {
    try {
      const result = await apiClient.fetchAdminCompetition(null, competition.id);
      setManualCompetition(result.competition);
      setManualCategoryId(categoryId);
      setManualOpen(true);
    } catch (err) {
      setError(err.message || 'Could not load competition categories.');
    }
  };
  const deleteParticipant = async (person) => {
    if (!window.confirm(`Delete ${person.participantName} from the active line-up? Their registration will be marked Cancelled and their payment record will be kept. You can restore them by editing the registration status.`)) return;
    try {
      await apiClient.updateRegistrationStatus(null, person.id, 'CANCELLED');
      setFlash(`${person.participantName} removed from the active line-up.`);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err.message || 'Could not remove participant.');
    }
  };
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(''), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    apiClient
      .fetchCategoryBoard(competition.id)
      .then((data) =>
        setCategories((data.categories || []).map((c) => ({ id: c.id, name: c.name, categoryType: c.categoryType, groups: c.groups })))
      )
      .catch(() => setCategories([]));
  }, [competition.id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#222222] to-[#171717] p-5">
        <GhostButton onClick={onBack} className="px-2.5" title="All competitions" aria-label="All competitions"><ArrowLeft className="h-4 w-4" /></GhostButton>
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">Category board</p>
          <h2 className="font-display text-2xl font-extrabold text-white uppercase">{competition.name}</h2>
        </div>
        <button type="button" onClick={() => openManual()} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#F15A24] px-3.5 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Manual registration</button>
      </div>
      {flash && <Banner tone="success" onClose={() => setFlash('')}>{flash}</Banner>}
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      <VerificationDesk competition={competition} embedded onBack={onBack} onManual={() => openManual()} onSaved={() => setRefreshKey((key) => key + 1)} />
      <CategoryBreakdownPanel
        competitionId={competition.id}
        mode="expand"
        refreshKey={refreshKey}
        title="Categories & Participants"
        onEditParticipant={(p, reload) => {
          setEditing(p);
          setRefreshAfterEdit(() => reload);
        }}
        onAddManual={openManual}
        onDeleteParticipant={deleteParticipant}
        hideCancelled
      />
      {editing && (
        <ParticipantEditModal
          participant={editing}
          categories={categories}
          competitionId={competition.id}
          onClose={() => {
            setEditing(null);
            refreshAfterEdit?.();
          }}
          onSaved={(updated) => {
            setEditing(null);
            setFlash(`${updated.participantName} updated.`);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {manualOpen && manualCompetition && <ManualRegistrationModal isOpen competitions={[manualCompetition]} selectedCompetitionId={competition.id} initialCategoryId={manualCategoryId} onClose={() => setManualOpen(false)} onSuccess={() => { setManualOpen(false); setFlash('Participant registered. Search to verify or edit the trunk number.'); setRefreshKey((k) => k + 1); }} />}
    </div>
  );
}
