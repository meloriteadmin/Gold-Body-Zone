import { Gavel } from 'lucide-react';

export function JudgePlaceholderPage() {
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-center py-16">
      <section className="w-full rounded-2xl border border-white/[0.08] bg-[#222222] px-8 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24]/25 to-[#E94B16]/10 ring-1 ring-[#F15A24]/40">
          <Gavel className="h-8 w-8 text-[#F15A24]" />
        </div>
        <h2 className="font-display mt-6 text-3xl font-extrabold tracking-wide text-white uppercase">
          Judge Management – Coming Soon
        </h2>
      </section>
    </div>
  );
}
