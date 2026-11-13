import { Clock, LogOut, ShieldAlert } from 'lucide-react';

export function AdminSessionWarningModal({
  isOpen,
  secondsRemaining,
  onExtend,
  onLogout,
}) {
  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-warning-title"
      aria-describedby="inactivity-warning-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#171717] p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2
              id="inactivity-warning-title"
              className="text-lg font-bold text-white uppercase tracking-wide"
            >
              Session Inactivity Warning
            </h2>
            <p
              id="inactivity-warning-desc"
              className="mt-1 text-xs leading-relaxed text-zinc-400"
            >
              You have been inactive for 28 minutes. To protect administrative
              data, your session will automatically terminate in:
            </p>
          </div>
        </div>

        {/* Big Countdown Timer */}
        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#222222] py-4 text-center">
          <Clock className="h-5 w-5 text-amber-400 animate-pulse" />
          <span className="font-mono text-2xl font-extrabold tracking-widest text-amber-400">
            {formattedTime}
          </span>
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-500">
          Click below to continue your session, or you will be redirected to the sign-in page.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out Now
          </button>
          <button
            type="button"
            onClick={onExtend}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-[#F15A24]/20 transition-all hover:brightness-110"
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}
