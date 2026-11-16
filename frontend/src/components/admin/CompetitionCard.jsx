import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge.jsx';
import { getCompetitionPoster } from '../../utils/competitionHelpers.js';
import { formatDate, formatFee } from '../../utils/formatters.js';

export function CompetitionCard({
  competition,
  onClick,
}) {
  const navigate = useNavigate();
  const posterSrc = getCompetitionPoster(competition);

  const handleClick = () => {
    if (onClick) {
      onClick(competition);
    } else {
      navigate(`/admin/competitions/${competition.id}`);
    }
  };

  const statusVariant = competition.isCompleted
    ? 'completed'
    : competition.isPublished
      ? 'published'
      : 'draft';

  const statusLabel = competition.isCompleted
    ? 'Completed'
    : competition.isPublished
      ? 'Published'
      : 'Draft';

  return (
    <article
      onClick={handleClick}
      className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1a] shadow-lg transition-all duration-200 hover:-translate-y-1 hover:border-[#F15A24]/50 hover:shadow-xl hover:shadow-[#F15A24]/10"
    >
      {/* Poster Container */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#121212]">
        <img
          src={posterSrc}
          alt={`${competition.name} poster`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Top Badges Overlay */}
        <div className="absolute top-3 right-3 left-3 flex items-center justify-between gap-2">
          <span className="rounded-md border border-black/40 bg-black/60 px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#F15A24] uppercase backdrop-blur-md">
            {competition.competitionType}
          </span>
          <StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge>
        </div>

        {/* Bottom Fee Overlay */}
        <div className="absolute right-3 bottom-2.5">
          <span className="font-display text-lg font-extrabold text-[#F15A24] drop-shadow-md">
            {formatFee(competition.registrationFee)}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-wide text-white uppercase transition-colors group-hover:text-[#F15A24]">
            {competition.name}
          </h3>

          {/* Metadata details */}
          <div className="mt-2.5 space-y-1.5 text-xs text-[#A1A1AA]">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
              <span>Date: {formatDate(competition.eventDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F15A24]" />
              <span className="truncate">
                Venue: {competition.venue || 'Not specified'}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="flex items-center justify-end border-t border-white/[0.08] pt-3 text-xs">
          <span className="font-bold tracking-wider text-[#F15A24] uppercase text-[11px] transition-transform group-hover:translate-x-0.5">
            View Details →
          </span>
        </div>
      </div>
    </article>
  );
}
