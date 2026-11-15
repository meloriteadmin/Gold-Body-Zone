import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { PublicRegistrationModal } from '../components/public/PublicRegistrationModal.jsx';
import {
  CATEGORY_GENDER_STYLES,
  CATEGORY_TYPE_LABELS,
  GENDER_ELIGIBILITY_LABELS,
} from '../constants/competitionOptions.js';
import { apiClient } from '../lib/apiClient.js';
import {
  launchCashfreeCheckout,
  readCheckoutSession,
  saveCheckoutSession,
} from '../utils/cashfreeCheckout.js';
import {
  getCompetitionPoster,
  getCompetitionStatus,
  getRegistrationStatus,
  groupCategoriesByGender,
  isDeadlineClosed,
  isRegistrationPermitted,
} from '../utils/competitionHelpers.js';
import { formatDate, formatFee } from '../utils/formatters.js';
import { verifyReturnedOrder } from '../utils/paymentReturn.js';

export function CompetitionDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [competition, setCompetition] = useState(null);
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [sessionRegistration, setSessionRegistration] = useState(null);
  const [checkoutToken, setCheckoutToken] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [lastReturnOrderId, setLastReturnOrderId] = useState('');
  const [paymentActionError, setPaymentActionError] = useState('');
  const [retryingPayment, setRetryingPayment] = useState(false);

  const mountedRef = useRef(true);
  const handledOrdersRef = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDetails = useCallback(
    async (force = false) => {
      setLoading(true);
      setError('');
      try {
        const detailRes = await apiClient.fetchPublishedCompetitionById(id, {
          force,
        });
        if (!mountedRef.current) return;
        setCompetition(detailRes.competition || null);
        if (detailRes.competition) {
          setAllCompetitions([detailRes.competition]);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err.message || 'Competition details could not be loaded.');
        setCompetition(null);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    loadDetails(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [loadDetails, id]);

  const runReturnVerification = useCallback(
    async (orderId) => {
      if (!orderId) return;
      setLastReturnOrderId(orderId);
      setVerifyingPayment(true);
      setPaymentActionError('');
      try {
        const outcome = await verifyReturnedOrder({
          orderId,
          readCheckoutSession,
          saveCheckoutSession,
          verifyOrderPayment: apiClient.verifyOrderPayment,
        });

        if (!mountedRef.current) return;

        if (outcome.registration) {
          setSessionRegistration(outcome.registration);
        }
        if (outcome.statusToken) {
          setCheckoutToken(outcome.statusToken);
        }
        if (outcome.status === 'error') {
          setPaymentActionError(outcome.error);
        }
      } finally {
        if (mountedRef.current) {
          setVerifyingPayment(false);
        }
      }
    },
    []
  );

  // Handle return URL from Cashfree Checkout (?order_id=...) safely without cancelling verification on URL cleanup.
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    if (!orderId || handledOrdersRef.current.has(orderId)) return;
    handledOrdersRef.current.add(orderId);

    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('order_id');
    setSearchParams(cleanParams, { replace: true });

    runReturnVerification(orderId);
  }, [searchParams, setSearchParams, runReturnVerification]);

  const activeRegistration = sessionRegistration;
  const hasActiveRegistration = Boolean(
    activeRegistration && activeRegistration.registrationStatus !== 'CANCELLED'
  );

  const groupedCategories = useMemo(
    () =>
      groupCategoriesByGender(
        competition?.categories || [],
        competition?.competitionType || ''
      ),
    [competition?.categories, competition?.competitionType]
  );

  const handleRetryPayment = async () => {
    if (!activeRegistration?.id) return;
    setPaymentActionError('');
    setRetryingPayment(true);
    try {
      const res = await apiClient.retryRegistrationPayment(
        activeRegistration.id,
        { statusToken: checkoutToken || undefined }
      );

      setSessionRegistration(res.registration);
      if (res.statusToken) {
        setCheckoutToken(res.statusToken);
      }

      if (res.alreadyPaid) {
        return;
      }

      if (!res.cashfree?.configured || !res.cashfree?.paymentSessionId) {
        setPaymentActionError(
          res.cashfree?.message ||
            'Cashfree gateway credentials are not configured yet.'
        );
        return;
      }

      await launchCashfreeCheckout({
        mode: res.cashfree.mode,
        paymentSessionId: res.cashfree.paymentSessionId,
        orderId: res.cashfree.orderId,
        statusToken: res.statusToken,
        registrationId: res.registration.id,
      });
    } catch (err) {
      setPaymentActionError(
        err.message || 'Failed to initiate payment retry.'
      );
    } finally {
      setRetryingPayment(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="h-6 w-32 animate-pulse rounded-md bg-[#222222]" />
            <div className="h-14 w-3/4 animate-pulse rounded-xl bg-[#222222]" />
            <div className="h-28 w-full animate-pulse rounded-2xl bg-[#222222]" />
            <div className="h-12 w-48 animate-pulse rounded-full bg-[#222222]" />
          </div>
          <div className="lg:col-span-5">
            <div className="aspect-[4/5] animate-pulse rounded-2xl bg-[#222222]" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !competition) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-20 sm:px-8">
        <div className="rounded-2xl border border-white/10 bg-[#171717] p-8 text-center sm:p-12">
          <Trophy className="mx-auto h-12 w-12 text-[#F15A24]" />
          <h1 className="font-display mt-4 text-4xl font-extrabold tracking-wide text-white uppercase">
            Competition Not Available
          </h1>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            {error || 'This competition is unpublished or does not exist.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => loadDetails(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#F15A24] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase hover:bg-[#ff672e]"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <Link
              to="/competitions"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#222222] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase hover:border-[#F15A24]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Competitions
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const deadlinePassed = isDeadlineClosed(competition?.registrationDeadline);
  const noCategories = !competition?.categories?.length;
  const compStatus = competition ? getCompetitionStatus(competition) : 'Draft';
  const regStatus = competition ? getRegistrationStatus(competition) : 'Closed';
  const registrationPermitted = Boolean(
    competition &&
      isRegistrationPermitted(competition) &&
      !noCategories &&
      !competition.isCompleted
  );

  const isRegisteredAndPaid = Boolean(
    activeRegistration &&
      activeRegistration.registrationStatus === 'CONFIRMED' &&
      activeRegistration.paymentStatus === 'PAID'
  );

  const isCancelledRegistration =
    activeRegistration?.registrationStatus === 'CANCELLED';

  const hasPendingPayment = Boolean(
    activeRegistration &&
      !isRegisteredAndPaid &&
      !isCancelledRegistration &&
      (activeRegistration.paymentStatus === 'PENDING' ||
        !activeRegistration.paymentStatus)
  );

  const hasFailedPayment = Boolean(
    activeRegistration &&
      !isRegisteredAndPaid &&
      !isCancelledRegistration &&
      activeRegistration.paymentStatus === 'FAILED'
  );

  let availabilityLabel = null;
  let availabilityVariant = 'cancelled';

  if (isRegisteredAndPaid) {
    availabilityLabel = 'ALREADY REGISTERED';
    availabilityVariant = 'confirmed';
  } else if (hasPendingPayment) {
    availabilityLabel = 'PAYMENT PENDING';
    availabilityVariant = 'pending';
  } else if (hasFailedPayment) {
    availabilityLabel = 'PAYMENT FAILED';
    availabilityVariant = 'failed';
  } else if (isCancelledRegistration) {
    availabilityLabel = 'CANCELLED';
    availabilityVariant = 'cancelled';
  } else if (competition?.isCompleted) {
    availabilityLabel = 'Competition Completed';
    availabilityVariant = 'cancelled';
  } else if (compStatus === 'Live') {
    availabilityLabel = 'Competition Live';
    availabilityVariant = 'accent';
  } else if (regStatus === 'Closing Soon') {
    availabilityLabel = 'Registration Closing Soon';
    availabilityVariant = 'pending';
  } else if (regStatus === 'Closed') {
    availabilityLabel = 'Registrations Closed';
    availabilityVariant = 'cancelled';
  } else if (regStatus === 'Open') {
    availabilityLabel = 'Registrations Open';
    availabilityVariant = 'confirmed';
  } else if (noCategories) {
    availabilityLabel = 'Categories Pending';
    availabilityVariant = 'cancelled';
  }

  const posterSrc = getCompetitionPoster(competition);

  const handleCtaClick = () => {
    if (hasPendingPayment || hasFailedPayment) {
      handleRetryPayment();
      return;
    }

    if (!isRegisteredAndPaid && registrationPermitted) {
      setModalOpen(true);
    }
  };

  return (
    <main className="bg-[#101010] pb-20">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-8">
        {verifyingPayment && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#F15A24]/35 bg-[#F15A24]/10 p-5 text-sm text-white">
            <Loader2 className="h-5 w-5 animate-spin text-[#F15A24]" />
            <span>
              Verifying payment securely with Cashfree backend servers...
            </span>
          </div>
        )}

        {paymentActionError && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-xs text-red-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <span>{paymentActionError}</span>
            </div>
            {lastReturnOrderId && !isRegisteredAndPaid && (
              <button
                type="button"
                disabled={verifyingPayment}
                onClick={() => runReturnVerification(lastReturnOrderId)}
                className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/20 px-4 py-2 text-[11px] font-bold tracking-wider text-white uppercase hover:bg-red-500/30 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Verification
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hero Banner */}
      <section className="relative overflow-hidden border-y border-white/[0.08] bg-[#171717]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 sm:px-8 lg:grid-cols-12 lg:py-16">
          <div className="lg:col-span-7">
            <Link
              to="/competitions"
              className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-[#A1A1AA] uppercase transition-colors hover:text-[#F15A24]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Published Competitions
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <StatusBadge variant="accent" withDot={false}>
                {competition.competitionType}
              </StatusBadge>
              {availabilityLabel && (
                <StatusBadge variant={availabilityVariant}>
                  {availabilityLabel}
                </StatusBadge>
              )}
            </div>

            <h1 className="font-display mt-4 text-5xl leading-[0.95] font-extrabold tracking-wide text-white uppercase sm:text-6xl lg:text-7xl">
              {competition.name}
            </h1>

            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
              <p className="text-[11px] font-bold tracking-[0.2em] text-[#F15A24] uppercase">
                Competition Overview
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                {competition.description || 'Not Set'}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={
                  isRegisteredAndPaid ||
                  !registrationPermitted ||
                  retryingPayment
                }
                onClick={handleCtaClick}
                className="inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-8 py-4 text-xs font-extrabold tracking-[0.18em] text-white uppercase shadow-[0_14px_38px_-10px_rgba(241,90,36,0.65)] transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                {retryingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Initiating Payment...</span>
                  </>
                ) : isRegisteredAndPaid ? (
                  <span>Already Registered</span>
                ) : hasPendingPayment ? (
                  <>
                    <span>Complete Payment</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : hasFailedPayment ? (
                  <>
                    <span>Retry Payment</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : competition?.isCompleted ? (
                  <span>Competition Completed</span>
                ) : compStatus === 'Live' && !registrationPermitted ? (
                  <span>Competition Live</span>
                ) : regStatus === 'Closed' ? (
                  <span>Registrations Closed</span>
                ) : noCategories ? (
                  <span>Categories Pending</span>
                ) : (
                  <>
                    <span>Register Now</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {regStatus === 'Closing Soon' && !isRegisteredAndPaid && (
                <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300">
                  <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    Registration Closing Soon — Closes on{' '}
                    {formatDate(competition.registrationDeadline)}
                  </span>
                </div>
              )}

              {deadlinePassed && !isRegisteredAndPaid && (
                <p className="inline-flex items-center gap-2 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  This competition is no longer accepting new entries.
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-[#222222] shadow-2xl">
              <img
                src={posterSrc}
                alt={`${competition.name} official poster`}
                className="h-full w-full object-cover object-top"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#101010]/70 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Actual Database Details Grid */}
      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
            Verified Event Specifications
          </p>
          <h2 className="font-display mt-1 text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
            Schedule, Venue &amp; Eligibility
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <CreditCard className="h-4 w-4 text-[#F15A24]" />
              Registration Fee
            </div>
            <p className="font-display mt-3 text-3xl font-extrabold text-[#F15A24]">
              {formatFee(competition.registrationFee)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <Calendar className="h-4 w-4 text-[#F15A24]" />
              Competition Date
            </div>
            <p className="font-display mt-3 text-3xl font-bold text-white">
              {formatDate(competition.eventDate)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <Clock className="h-4 w-4 text-[#E94B16]" />
              Registration Deadline
            </div>
            <p className="font-display mt-3 text-3xl font-bold text-white">
              {formatDate(competition.registrationDeadline)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <MapPin className="h-4 w-4 text-[#F15A24]" />
              Venue
            </div>
            <p className="mt-3 text-base font-semibold text-white">
              {competition.venue || 'Not Set'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <Users className="h-4 w-4 text-[#F15A24]" />
              Gender Eligibility
            </div>
            <p className="mt-3 text-base font-semibold text-white">
              {GENDER_ELIGIBILITY_LABELS[competition.genderEligibility] ||
                'Not Set'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
              <ShieldAlert className="h-4 w-4 text-[#F15A24]" />
              Eligibility Requirements
            </div>
            <p className="mt-3 text-base font-semibold text-white">
              {competition.ageEligibility || 'Not Set'}
            </p>
          </div>
        </div>
      </section>

      {/* Configured Divisions / Categories */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-8">
        <div className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
                Competition Classes
              </p>
              <h2 className="font-display mt-1 text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
                Available Categories
              </h2>
            </div>

            {competition.ageEligibility && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#F15A24]/30 bg-[#F15A24]/10 px-4 py-2 text-xs font-semibold text-orange-200">
                <ShieldAlert className="h-4 w-4 shrink-0 text-[#F15A24]" />
                <span>Eligibility Rule: {competition.ageEligibility}</span>
              </div>
            )}
          </div>

          {groupedCategories.length === 0 ? (
            <p className="mt-6 text-sm text-[#A1A1AA]">Not Set</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {groupedCategories.map((group) => (
                <div
                  key={group.key}
                  className="rounded-xl border border-white/[0.08] bg-[#222222] p-5"
                >
                  <h3 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                    {group.label}
                  </h3>
                  <div className="mt-4 space-y-2.5">
                    {group.items.map((cat) => {
                      const isCleanOpen =
                        cat.categoryType === 'OPEN' &&
                        cat.name?.toLowerCase().includes('open');
                      const displayName =
                        cat.name?.toLowerCase() === 'open category'
                          ? competition.competitionType === 'Masters'
                            ? 'Masters Open'
                            : 'Open Category'
                          : cat.name;

                      return (
                        <div
                          key={cat.id}
                          className="rounded-xl border border-white/[0.06] bg-[#171717] p-3.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white">
                              {displayName}
                            </span>
                            {!isCleanOpen && (
                              <span
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                                  CATEGORY_GENDER_STYLES[cat.gender] ||
                                  CATEGORY_GENDER_STYLES.OPEN
                                }`}
                              >
                                {CATEGORY_TYPE_LABELS[cat.categoryType] ||
                                  cat.categoryType}
                              </span>
                            )}
                          </div>
                          {cat.ruleNote && (
                            <p className="mt-1.5 text-xs text-[#A1A1AA]">
                              {cat.ruleNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PublicRegistrationModal
        competition={modalOpen ? competition : null}
        competitions={allCompetitions}
        onClose={() => setModalOpen(false)}
        onRegistrationUpdated={(reg) => setSessionRegistration(reg)}
      />
    </main>
  );
}
