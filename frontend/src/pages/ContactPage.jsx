import { MapPin, Phone } from 'lucide-react';

const phone = '+919822986005';

export function ContactPage() {
  return (
    <main className="min-h-screen bg-[#101010] px-4 py-14 text-white sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">Get In Touch</p>
        <h1 className="font-display mt-2 text-4xl font-extrabold uppercase sm:text-6xl">Contact Us</h1>
        <p className="mt-4 text-sm text-[#A1A1AA]">For membership, competition, or training questions, call GOLD BODY ZONE GYM directly.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6">
            <Phone className="h-6 w-6 text-[#F15A24]" />
            <h2 className="mt-4 text-lg font-bold">Phone Support</h2>
            <a href={`tel:${phone}`} className="mt-2 block text-lg text-[#F15A24] hover:underline">+91 9822986005</a>
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6">
            <MapPin className="h-6 w-6 text-[#F15A24]" />
            <h2 className="mt-4 text-lg font-bold">Gym Location</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">4th Floor, Anjaneya Tower, Above Domino&apos;s, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
