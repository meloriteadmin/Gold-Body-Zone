import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Eye,
  FileEdit,
  HardDrive,
  Images,
  Loader2,
  MapPin,
  Plus,
  Trophy,
  Users,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import { formatDate, formatFee } from '../utils/formatters.js';

export function DashboardOverviewPage() {
  const navigate = useNavigate();
  const { accessToken, adminProfile } = useAuth();

  const [stats, setStats] = useState({
    totalCompetitions: 0,
    publishedCompetitions: 0,
    draftCompetitions: 0,
  });
  const [competitions, setCompetitions] = useState([]);
  const [storage, setStorage] = useState(null);
  const [storageError, setStorageError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const data = await apiClient.fetchAdminDashboard(accessToken);
      setStats(
        data.stats || {
          totalCompetitions: 0,
          publishedCompetitions: 0,
          draftCompetitions: 0,
        }
      );
      setCompetitions(data.competitions || []);
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load dashboard overview.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => loadDashboard({ silent: true });
    window.addEventListener('admin-data-changed', refresh);
    return () => window.removeEventListener('admin-data-changed', refresh);
  }, [loadDashboard]);

  useEffect(() => {
    let active = true;
    const load = () => apiClient.fetchAdminStorage()
      .then((data) => { if (active) { setStorage(data); setStorageError(''); } })
      .catch((err) => { if (active) setStorageError(err.message); });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const adminDisplayName = adminProfile?.fullName?.trim();

  const statCards = [
    {
      label: 'Total Competitions',
      value: stats.totalCompetitions,
      icon: Trophy,
      accent: 'from-[#F15A24]/25 to-[#E94B16]/10 text-[#F15A24]',
    },
    {
      label: 'Published Competitions',
      value: stats.publishedCompetitions,
      icon: Eye,
      accent: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400',
    },
    {
      label: 'Draft Competitions',
      value: stats.draftCompetitions,
      icon: FileEdit,
      accent: 'from-white/15 to-white/5 text-[#A1A1AA]',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Welcome Banner */}
      <section className="flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-gradient-to-br from-[#222222] via-[#1b1b1b] to-[#171717] p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-[#F15A24] uppercase">
            Administration Overview
          </p>
          <h2 className="font-display mt-1 text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
            {adminDisplayName
              ? `Welcome back, ${adminDisplayName}`
              : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Manage competitions, categories, and public listings from one place.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin/competitions?add=1')}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-3 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Add Competition
        </button>
      </section>

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
      ) : (
        <>
          {/* Real Database Statistics */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6 transition-all duration-200 hover:border-[#F15A24]/45"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
                        {card.label}
                      </p>
                      <p className="font-display mt-3 text-4xl font-extrabold text-white tabular-nums">
                        {card.value}
                      </p>
                    </div>
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6">
            <h3 className="font-display text-2xl font-bold text-white uppercase">Storage Usage</h3>
            {storageError && <p role="alert" className="mt-3 text-sm text-red-300">{storageError}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Image Storage', icon: Images, data: storage?.images, unit: 'GB' },
                { label: 'Database Storage', icon: HardDrive, data: storage?.database, unit: 'MB' },
              ].map(({ label, icon: Icon, data, unit }) => {
                const divisor = unit === 'GB' ? 1073741824 : 1048576;
                const used = data ? (data.usedBytes / divisor).toFixed(2) : '—';
                const remaining = data ? (data.remainingBytes / divisor).toFixed(2) : '—';
                const warning = data && (data.warningLevel >= 70 || data.percent >= 70);
                return <div key={label} className="rounded-xl border border-white/10 bg-[#171717] p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-white"><Icon className="h-5 w-5 text-[#F15A24]" />{label}: {used} / {unit === 'GB' ? '1 GB' : '500 MB'}</div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${warning ? 'bg-amber-400' : 'bg-[#F15A24]'}`} style={{ width: `${Math.min(100, data?.percent || 0)}%` }} /></div>
                  <p className="mt-2 text-xs text-zinc-300">{data?.percent ?? '—'}% used · {remaining} {unit} remaining</p>
                  {warning && <p className="mt-2 text-xs font-semibold text-amber-300">Storage warning: {data?.warningLevel || 70}% threshold reached</p>}
                </div>;
              })}
            </div>
            <p className="mt-3 text-xs text-zinc-400">Last successful measurement: {storage?.measuredAt ? new Date(storage.measuredAt).toLocaleString() : 'Waiting for measurement'}</p>
          </section>

          {/* Competition Overview */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#222222] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <h3 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                Competition Overview
              </h3>
              <button
                type="button"
                onClick={() => navigate('/admin/competitions')}
                className="text-xs font-semibold text-[#F15A24] transition-colors hover:text-[#E94B16]"
              >
                Open Manage Competitions →
              </button>
            </div>

            {competitions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold text-white">
                  No competitions found in the database.
                </p>
                <p className="mt-1 text-xs text-[#A1A1AA]">
                  Use Add Competition to create your first event.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-white/[0.08]">
                {competitions.map((comp) => (
                  <div
                    key={comp.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/admin/competitions/${comp.id}`);
                      }
                    }}
                    className="group flex flex-col justify-between gap-3 -mx-3 rounded-xl px-3 py-4 cursor-pointer transition-colors hover:bg-white/[0.04] sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white group-hover:text-[#F15A24] transition-colors">
                          {comp.name}
                        </span>
                        <span className="rounded-md border border-[#F15A24]/30 bg-[#F15A24]/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">
                          {comp.competitionType}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#A1A1AA]">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                          {formatDate(comp.eventDate)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#F15A24]" />
                          {comp.venue || 'Not Set'}
                        </span>
                        <span>Fee: {formatFee(comp.registrationFee)}</span>
                        <span>
                          Categories: {comp.categories?.length || 0}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
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
                      <ChevronRight className="h-4 w-4 text-[#A1A1AA] transition-transform group-hover:translate-x-0.5 group-hover:text-[#F15A24]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
