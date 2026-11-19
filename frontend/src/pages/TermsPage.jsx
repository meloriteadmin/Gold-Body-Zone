import {
  AlertTriangle,
  FileText,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const BUSINESS_DETAILS = {
  name: 'GOLD BODY ZONE GYM',
  phone: '+91 9822986005',
  phoneClean: '+919822986005',
  address:
    "4th Floor, Anjaneya Tower, Above Domino's, Opposite Atul Sweets, Upendra Nagar, CIDCO, Nashik, Maharashtra.",
};

export function TermsPage() {
  return (
    <main className="min-h-screen bg-[#101010] py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        {/* Page Header */}
        <div className="mb-12 border-b border-white/[0.08] pb-8">
          <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
            Official Competition Policy
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-wide text-white uppercase sm:text-6xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#A1A1AA]">
            Please review the official terms, conditions, and participation rules
            for all championships and competitions organized by{' '}
            <span className="font-semibold text-white">
              {BUSINESS_DETAILS.name}
            </span>
            .
          </p>
        </div>

        {/* Important Cancellation Notice Callout */}
        <div className="mb-10 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-wide text-white uppercase sm:text-2xl">
                Confirmed Registration Cancellation Policy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-red-200">
                <strong>Participants cannot cancel a confirmed registration.</strong> Once
                registration details and payment have been successfully submitted and confirmed
                in the system, the entry is final and secured for the registered athlete.
              </p>
            </div>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="space-y-8 text-sm leading-relaxed text-[#A1A1AA]">
          {/* Section 1: Organizer & Platform Identity */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F15A24]/15 text-[#F15A24]">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                1. Organizer Information
              </h2>
            </div>
            <p className="mt-4">
              All events, championships, and athlete registrations conducted on this website are
              managed and operated by <strong className="text-white">{BUSINESS_DETAILS.name}</strong>,
              located in Nashik, Maharashtra.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.06] bg-[#222222] p-4 text-xs sm:grid-cols-3">
              <div>
                <span className="text-zinc-500 block uppercase">Organizer</span>
                <span className="font-semibold text-white">{BUSINESS_DETAILS.name}</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase">Contact</span>
                <span className="font-semibold text-white">Call the organizer</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase">Official Phone</span>
                <a
                  href={`tel:${BUSINESS_DETAILS.phoneClean}`}
                  className="font-semibold text-[#F15A24] hover:underline"
                >
                  {BUSINESS_DETAILS.phone}
                </a>
              </div>
            </div>
          </section>

          {/* Section 2: Athlete Eligibility & Registration */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F15A24]/15 text-[#F15A24]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                2. Athlete Eligibility &amp; Division Rules
              </h2>
            </div>
            <ul className="mt-4 list-disc space-y-2.5 pl-5">
              <li>
                Athletes must meet all published eligibility criteria (including gender, age, and
                height/weight division requirements) for the selected competition category.
              </li>
              <li>
                For <strong className="text-white">Masters Competitions</strong>, participants must
                strictly be over 40 years of age as per official event requirements.
              </li>
              <li>
                All submitted participant details (full name, contact information, district, and gym
                affiliation) must be accurate, genuine, and verified.
              </li>
              <li>
                Only one confirmed registration is permitted per participant per competition.
              </li>
            </ul>
          </section>

          {/* Section 3: Official Weigh-In & Stage Entry */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F15A24]/15 text-[#F15A24]">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                3. Weigh-In &amp; Stage Check-In
              </h2>
            </div>
            <p className="mt-4">
              Upon successful registration and verified online payment, a unique{' '}
              <strong className="text-white">Registration ID</strong> (e.g. GBZ-M26-XXX) is issued.
              Participants must present their Registration ID along with valid government photo identification
              during the official event weigh-in and reporting stage at the competition venue.
            </p>
          </section>

          {/* Section 4: Notice Regarding Unspecified Policies */}
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                4. Policy Clarifications
              </h2>
            </div>
            <p className="mt-4 text-amber-100/90">
              While confirmed registrations cannot be cancelled, specific refund rules, cancellation charges,
              or entry transfer guidelines have not been published by the organizer. If you require policy
              clarification or assistance with an existing registration, please contact{' '}
              <strong className="text-white">{BUSINESS_DETAILS.name}</strong> directly before proceeding.
            </p>
          </section>

          {/* Section 5: Contact Information */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F15A24]/15 text-[#F15A24]">
                <Phone className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                5. Contact &amp; Enquiries
              </h2>
            </div>
            <p className="mt-4">
              For any questions regarding these Terms &amp; Conditions, competition schedules, or venue details,
              contact our administration desk:
            </p>
            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#F15A24]" />
                <div>
                  <a
                    href={`tel:${BUSINESS_DETAILS.phoneClean}`}
                    className="font-medium text-white hover:text-[#F15A24]"
                  >
                    {BUSINESS_DETAILS.phone}
                  </a>
                  <p className="text-xs text-zinc-500">Call for immediate enquiries</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F15A24]" />
                <p className="text-xs leading-relaxed text-zinc-300">
                  {BUSINESS_DETAILS.address}
                </p>
              </div>
            </div>
            <div className="mt-7">
              <Link
                to="/competitions"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-2.5 text-xs font-bold tracking-wider text-white uppercase hover:brightness-110"
              >
                View Published Competitions
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
