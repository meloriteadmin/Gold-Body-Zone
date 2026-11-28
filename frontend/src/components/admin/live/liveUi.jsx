import { useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';

export function Banner({ tone = 'info', children, onClose }) {
  const tones = {
    info: 'border-blue-500/40 bg-blue-500/10 text-blue-100',
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    error: 'border-red-500/40 bg-red-500/10 text-red-100',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${tones[tone]}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function TrunkBadge({ value, size = 'md' }) {
  const sizes = { sm: 'min-w-8 px-1.5 py-0.5 text-sm', md: 'min-w-10 px-2 py-1 text-base', lg: 'min-w-14 px-3 py-1.5 text-2xl' };
  if (value == null) {
    return <span className="rounded-lg border border-dashed border-white/20 px-2 py-1 text-[10px] text-zinc-500">No No.</span>;
  }
  return (
    <span className={`inline-flex justify-center rounded-lg bg-[#F15A24] font-display font-extrabold text-white ${sizes[size]}`}>
      {value}
    </span>
  );
}

export function SectionCard({ title, subtitle, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-[#171717] p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F15A24]/10 text-[#F15A24]">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 className="font-display text-base font-bold tracking-wide text-white uppercase">{title}</h3>
              {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#F15A24]/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-[#F15A24]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Searchable title picker: standard titles + custom text.
 */
export function TitleCombobox({ options = [], value = '', onChange, placeholder = 'Search or type a title…', exclude = [] }) {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(exclude.map((t) => t.toLowerCase())), [exclude]);
  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => !excluded.has(o.toLowerCase()) && (!q || o.toLowerCase().includes(q)));
  const exact = options.some((o) => o.toLowerCase() === q);
  const canCreateCustom = Boolean(query.trim()) && !exact && !excluded.has(q);

  const pick = (title) => {
    onChange?.(title);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (filtered.length === 1) {
      pick(filtered[0]);
    } else if (canCreateCustom) {
      pick(query.trim());
    }
  };

  return (
    <div className="space-y-2.5">
      {value && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-[#F15A24]/60 bg-[#F15A24]/15 px-3.5 py-2.5 text-sm font-bold text-white">
          <span className="flex min-w-0 items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-[#F15A24]" />
            <span className="truncate">Selected title: {value}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange?.('')}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-black/50 hover:text-white"
          >
            <X className="h-3 w-3" /> Change
          </button>
        </div>
      )}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#222222] pr-9 pl-9 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canCreateCustom && (
          <button
            type="button"
            onClick={() => pick(query.trim())}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#F15A24] px-3.5 text-xs font-bold text-white hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> Add “{query.trim()}”
          </button>
        )}
      </div>
      <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#141414] p-2 sm:grid-cols-2">
        {filtered.map((title) => {
          const active = title.toLowerCase() === value.toLowerCase();
          return (
            <button
              type="button"
              key={title}
              aria-pressed={active}
              onClick={() => pick(active ? '' : title)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                active
                  ? 'border-[#F15A24] bg-[#F15A24] text-white'
                  : 'border-white/[0.08] bg-[#1c1c1c] text-zinc-200 hover:border-[#F15A24]/50 hover:bg-[#242424]'
              }`}
            >
              <span className="truncate">{title}</span>
              {active && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}
        {filtered.length === 0 && !canCreateCustom && (
          <p className="col-span-full py-3 text-center text-xs text-zinc-500">
            {query.trim() ? 'This title was already used or completed.' : 'All standard titles have been used. Type above to add a custom title.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function participantLabel(p) {
  if (!p) return 'Unknown';
  return `#${p.trunkNumber ?? '—'} · ${p.participantName}`;
}
