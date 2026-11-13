import { Link } from 'react-router-dom';
import {
  getCompetitionPoster,
  isDeadlineClosed,
} from '../../utils/competitionHelpers.js';
import { formatDate, formatFee } from '../../utils/formatters.js';

function getParticipantCardBadge(userRegistration) {
  if (!userRegistration) return null;
  if (userRegistration.registrationStatus === 'CANCELLED') {
    return {
      label: 'CANCELLED',
      classes: 'border-zinc-400/50 bg-zinc-700/60 text-zinc-200 shadow-lg',
    };
  }
  if (
    userRegistration.paymentStatus === 'PAID' &&
    userRegistration.registrationStatus === 'CONFIRMED'
  ) {
    return {
      label: 'ALREADY REGISTERED',
      classes:
        'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 shadow-lg',
    };
  }
  if (userRegistration.paymentStatus === 'FAILED') {
    return {
      label: 'PAYMENT FAILED',
      classes: 'border-red-400/50 bg-red-500/20 text-red-200 shadow-lg',
    };
  }
  return {
    label: 'PAYMENT PENDING',
    classes: 'border-[#F15A24]/60 bg-[#F15A24]/25 text-orange-100 shadow-lg',
  };
}

/**
 * Competition poster card backed strictly by live database competition values:
 * - Competition Name
 * - Registration Deadline ("Not Set" when unconfigured)
 * - Registration Fee ("Not Set" when unconfigured)
 * - Authenticated participant's personal registration status when present
 */
export function CompetitionPosterCard({ competition, userRegistration = null }) {
  const posterSrc = getCompetitionPoster(competition);
  const formattedDeadline = competition.registrationDeadline
    ? formatDate(competition.registrationDeadline)
    : 'Not Set';
  const deadlineClosed = isDeadlineClosed(competition.registrationDeadline);
  const statusBadge = getParticipantCardBadge(userRegistration);

  return (
    <Link
      to={`/competitions/${competition.slug || competition.id}`}
      className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#222222] shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#F15A24]/70 hover:shadow-[0_20px_50px_-15px_rgba(241,90,36,0.3)] focus:outline-none focus:ring-2 focus:ring-[#F15A24]"
    >
      <img
        src={posterSrc}
        alt={competition.name}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#F15A24] to-[#E94B16] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2">
        {deadlineClosed ? (
          <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/20 px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-red-200 backdrop-blur-md">
            Registration Closed
          </span>
        ) : (
          <span />
        )}

        {statusBadge && (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-extrabold tracking-widest uppercase backdrop-blur-md ${statusBadge.classes}`}
          >
            {statusBadge.label}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
        <h3 className="font-display text-3xl leading-none font-extrabold tracking-wide text-white uppercase transition-colors duration-200 group-hover:text-[#F15A24] sm:text-4xl">
          {competition.name}
        </h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <span>
            Deadline: <span className="text-white">{formattedDeadline}</span>
          </span>
          <span className="text-[#F15A24]">
            Fee: {formatFee(competition.registrationFee)}
          </span>
        </div>
      </div>
    </Link>
  );
}
