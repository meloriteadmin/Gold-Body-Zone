import {
  CreditCard,
  User,
  X,
} from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge.jsx';
import { formatDateTime, formatFee } from '../../utils/formatters.js';

export function getStatusBadgeVariant(status) {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'CONFIRMED':
      return 'confirmed';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}

export function formatStatusLabel(status, fallback = '—') {
  if (!status || typeof status !== 'string') return fallback;
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function RegistrationDetailModal({
  registration,
  onClose,
}) {
  if (!registration) return null;

  const payment = registration.payment;
  const effectivePaymentStatus = payment?.status || registration.paymentStatus;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-wider text-[#F15A24] uppercase">
              {registration.registrationCode}
            </p>
            <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
              {registration.participantName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#A1A1AA] hover:bg-white/5 hover:text-white"
            aria-label="Close registration details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Status Summary (Read-Only) */}
          <div className="rounded-xl border border-white/[0.08] bg-[#222222] p-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-[10px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
                  Registration Status
                </p>
                <div className="mt-1">
                  <StatusBadge
                    variant={getStatusBadgeVariant(
                      registration.registrationStatus
                    )}
                  >
                    {formatStatusLabel(registration.registrationStatus)}
                  </StatusBadge>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
                  Payment Status
                </p>
                <div className="mt-1">
                  <StatusBadge
                    variant={getStatusBadgeVariant(effectivePaymentStatus)}
                  >
                    {formatStatusLabel(effectivePaymentStatus)}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </div>

          {/* Participant & Competition Details */}
          <section className="rounded-xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
              <User className="h-4 w-4 text-[#F15A24]" />
              <h3 className="font-display text-lg font-bold tracking-wide text-white uppercase">
                Participant &amp; Competition Information
              </h3>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Trunk Number
                </dt>
                <dd className="mt-1 font-mono font-bold text-[#F15A24]">
                  {registration.trunkNumber !== null && registration.trunkNumber !== undefined
                    ? `${registration.trunkNumber}`
                    : 'Not Assigned'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Registration ID
                </dt>
                <dd className="mt-1 font-mono font-bold text-white">
                  {registration.registrationCode}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Participant Name
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {registration.participantName}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Email
                </dt>
                <dd className="mt-1 break-all text-white">
                  {registration.email}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Mobile Number
                </dt>
                <dd className="mt-1 text-white">{registration.mobileNumber}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Gender
                </dt>
                <dd className="mt-1 text-white">
                  {formatStatusLabel(registration.gender)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">Age</dt>
                <dd className="mt-1 text-white">{registration.age} years</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Height
                </dt>
                <dd className="mt-1 text-white">{registration.heightCm} cm</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Weight
                </dt>
                <dd className="mt-1 text-white">{registration.weightKg} kg</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  District
                </dt>
                <dd className="mt-1 text-white">{registration.district}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Representing &amp; Gym
                </dt>
                <dd className="mt-1 text-white">
                  {registration.representingType === 'INDIVIDUAL'
                    ? 'Individual'
                    : `Gym: ${registration.gymName || 'Not Specified'}`}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Competition Name
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {registration.competition?.name || 'Not Available'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Selected Category
                </dt>
                <dd className="mt-1 text-white">
                  {registration.category
                    ? `${registration.category.gender}: ${registration.category.name}`
                    : 'Not Available'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Group / Division
                </dt>
                <dd className="mt-1 text-white">
                  {registration.group?.name ||
                    registration.groupName ||
                    'None / Open'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Registration Source
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {registration.isManual
                    ? 'Admin Manual Registration'
                    : 'Online Registration'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Registration Date
                </dt>
                <dd className="mt-1 text-white">
                  {formatDateTime(registration.createdAt)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Payment Information (Strictly database-backed, read-only) */}
          <section className="rounded-xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#F15A24]" />
                <h3 className="font-display text-lg font-bold tracking-wide text-white uppercase">
                  Payment Information
                </h3>
              </div>
              <StatusBadge
                variant={getStatusBadgeVariant(effectivePaymentStatus)}
              >
                {formatStatusLabel(effectivePaymentStatus)}
              </StatusBadge>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Payment Method
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {registration.paymentMethod ||
                    (registration.isManual
                      ? 'Offline'
                      : payment?.cashfreeOrderId
                        ? 'Cashfree Gateway (Online)'
                        : 'Not Available')}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Cashfree Order ID
                </dt>
                <dd className="mt-1 font-mono text-white">
                  {payment?.cashfreeOrderId ||
                    (registration.isManual
                      ? 'Offline Transaction (No gateway required)'
                      : 'Not Available')}
                </dd>
              </div>
              {payment?.cashfreePaymentId && (
                <div>
                  <dt className="font-semibold text-[#A1A1AA] uppercase">
                    Cashfree Payment ID
                  </dt>
                  <dd className="mt-1 font-mono text-white">
                    {payment.cashfreePaymentId}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Transaction Amount
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {payment?.amount !== null && payment?.amount !== undefined
                    ? formatFee(payment.amount)
                    : 'Not Available'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Payment Date
                </dt>
                <dd className="mt-1 text-white">
                  {payment?.paidAt
                    ? formatDateTime(payment.paidAt)
                    : 'Not Available'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#A1A1AA] uppercase">
                  Payment Status
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {formatStatusLabel(effectivePaymentStatus)}
                </dd>
              </div>
            </dl>

            
          </section>
        </div>

        <div className="flex justify-end border-t border-white/[0.08] bg-[#101010] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-[#222222] px-5 py-2.5 text-xs font-semibold text-white hover:border-[#F15A24]/50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
