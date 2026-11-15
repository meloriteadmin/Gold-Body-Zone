const VARIANT_CLASSES = {
  published: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  paid: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  confirmed: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  completed: 'border-blue-500/35 bg-blue-500/15 text-blue-300',
  draft: 'border-white/15 bg-white/[0.06] text-[#A1A1AA]',
  pending: 'border-[#F15A24]/40 bg-[#F15A24]/15 text-orange-300',
  accent: 'border-[#F15A24]/40 bg-[#F15A24]/15 text-[#F15A24]',
  failed: 'border-red-500/40 bg-red-500/15 text-red-300',
  cancelled: 'border-red-500/40 bg-red-500/15 text-red-300',
  refunded: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
};

const DOT_CLASSES = {
  published: 'bg-emerald-400',
  paid: 'bg-emerald-400',
  confirmed: 'bg-emerald-400',
  completed: 'bg-blue-400',
  draft: 'bg-[#A1A1AA]',
  pending: 'bg-[#F15A24]',
  accent: 'bg-[#F15A24]',
  failed: 'bg-red-400',
  cancelled: 'bg-red-400',
  refunded: 'bg-sky-400',
};

export function StatusBadge({ variant = 'draft', children, withDot = true }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase ${
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.draft
      }`}
    >
      {withDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            DOT_CLASSES[variant] || DOT_CLASSES.draft
          }`}
        />
      )}
      {children}
    </span>
  );
}
