import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Trophy,
  User,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useParticipantAuth } from '../context/ParticipantAuthContext.jsx';
import { apiClient } from '../lib/apiClient.js';
import {
  launchCashfreeCheckout,
  readCheckoutSession,
  saveCheckoutSession,
} from '../utils/cashfreeCheckout.js';
import { formatDate, formatFee } from '../utils/formatters.js';
import { verifyReturnedOrder } from '../utils/paymentReturn.js';

function getRegBadgeVariant(status) {
  if (status === 'CONFIRMED') return 'confirmed';
  if (status === 'CANCELLED') return 'cancelled';
  return 'pending';
}

function getPayBadgeVariant(status) {
  if (status === 'PAID') return 'paid';
  if (status === 'FAILED') return 'failed';
  return 'pending';
}

export function ParticipantProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    user,
    accessToken,
    isAuthenticated,
    loading,
    registrations,
    loadingRegistrations,
    registrationsError,
    refreshRegistrations,
    signOut,
  } = useParticipantAuth();

  const [processingRegId, setProcessingRegId] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState(null);
  const handledOrdersRef = useRef(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login', { replace: true, state: { from: '/profile' } });
    }
  }, [loading, isAuthenticated, navigate]);

  const runReturnVerification = useCallback(
    async (orderId) => {
      if (!orderId) return;
      setVerifyingPayment(true);
      setPaymentNotice(null);
      try {
        const outcome = await verifyReturnedOrder({
          orderId,
          readCheckoutSession,
          saveCheckoutSession,
          verifyOrderPayment: apiClient.verifyOrderPayment,
          accessToken,
          refreshRegistrations,
        });

        if (!mountedRef.current) return;

        if (outcome.status === 'confirmed') {
          const compName = outcome.registration?.competition?.name;
          const regCode = outcome.registration?.registrationCode;
          setPaymentNotice({
            type: 'success',
            message: `Payment verified successfully! Registration ${regCode ? `(${regCode}) ` : ''}${compName ? `for ${compName} ` : ''}is now CONFIRMED.`,
          });
        } else if (outcome.status === 'failed') {
          setPaymentNotice({
            type: 'warning',
            message:
              'Payment attempt was marked failed or incomplete by Cashfree. You can retry payment whenever you are ready.',
          });
        } else if (outcome.status === 'pending') {
          setPaymentNotice({
            type: 'info',
            message:
              'Payment was cancelled or is pending gateway confirmation. Your registration remains saved so you can retry payment anytime.',
          });
        } else if (outcome.status === 'error') {
          setPaymentNotice({
            type: 'error',
            message:
              outcome.error ||
              'Unable to verify payment status with Cashfree. Please retry or refresh.',
          });
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setPaymentNotice({
          type: 'error',
          message: err?.message || 'Failed to verify payment with Cashfree.',
        });
      } finally {
        if (mountedRef.current) {
          setVerifyingPayment(false);
        }
      }
    },
    [accessToken, refreshRegistrations]
  );

  // Handle return URL from Cashfree Checkout (?order_id=...)
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    if (!orderId || handledOrdersRef.current.has(orderId)) return;
    handledOrdersRef.current.add(orderId);

    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('order_id');
    setSearchParams(cleanParams, { replace: true });

    runReturnVerification(orderId);
  }, [searchParams, setSearchParams, runReturnVerification]);

  const handleCompletePayment = async (reg) => {
    if (!reg?.id) return;
    setPaymentNotice(null);
    setProcessingRegId(reg.id);
    try {
      const returnUrl = `${window.location.origin}/profile?order_id={order_id}`;
      const res = await apiClient.retryRegistrationPayment(
        reg.id,
        { returnUrl },
        accessToken
      );

      if (res.alreadyPaid) {
        setPaymentNotice({
          type: 'success',
          message: `Payment is already verified! Registration ${reg.registrationCode} is confirmed.`,
        });
        await refreshRegistrations();
        return;
      }

      if (!res.cashfree?.configured || !res.cashfree?.paymentSessionId) {
        setPaymentNotice({
          type: 'error',
          message:
            res.cashfree?.message ||
            'Cashfree payment gateway is not configured yet. Please try again later.',
        });
        return;
      }

      await launchCashfreeCheckout({
        mode: res.cashfree.mode,
        paymentSessionId: res.cashfree.paymentSessionId,
        orderId: res.cashfree.orderId,
        statusToken: res.statusToken,
        registrationId: reg.id,
      });
    } catch (err) {
      setPaymentNotice({
        type: 'error',
        message: err?.message || 'Failed to initiate Cashfree payment retry.',
      });
    } finally {
      setProcessingRegId('');
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <main className="bg-[#101010] px-4 py-20 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-center rounded-2xl border border-white/10 bg-[#171717] py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#F15A24]" />
        </div>
      </main>
    );
  }

  const displayName =
    user?.user_metadata?.full_name ||
    registrations[0]?.participantName ||
    'Athlete';

  return (
    <main className="bg-[#101010] py-12 sm:py-16">
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-8">
        {/* Profile Header Card */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F15A24] to-[#E94B16] shadow-lg shadow-[#F15A24]/25">
                <User className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-[0.22em] text-[#F15A24] uppercase">
                  Athlete Profile
                </p>
                <h1 className="font-display text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
                  {displayName}
                </h1>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#A1A1AA]">
                  <Mail className="h-3.5 w-3.5 text-[#F15A24]" />
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/competitions"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:border-[#F15A24]"
              >
                Browse Competitions
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-5 text-xs font-bold tracking-wider text-red-200 uppercase transition-colors hover:bg-red-500/20"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </div>
        </section>

        {/* My Registrations */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-[#F15A24] uppercase">
                Competition Entries
              </p>
              <h2 className="font-display mt-1 text-3xl font-extrabold tracking-wide text-white uppercase">
                My Registrations
              </h2>
            </div>

            <button
              type="button"
              disabled={loadingRegistrations}
              onClick={() => refreshRegistrations()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-[#222222] px-4 text-xs font-semibold text-white transition-colors hover:border-[#F15A24] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingRegistrations ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>

          {verifyingPayment && (
            <div
              role="status"
              className="mt-5 flex items-center gap-3 rounded-xl border border-[#F15A24]/40 bg-[#F15A24]/10 p-4 text-xs text-white"
            >
              <Loader2 className="h-5 w-5 animate-spin text-[#F15A24] shrink-0" />
              <div>
                <p className="font-semibold text-white">
                  Verifying your payment with Cashfree...
                </p>
                <p className="text-[11px] text-[#A1A1AA]">
                  Please wait a moment while we confirm your transaction and update your registration status.
                </p>
              </div>
            </div>
          )}

          {paymentNotice && (
            <div
              role="alert"
              className={`mt-5 flex items-start justify-between gap-3 rounded-xl border p-4 text-xs ${
                paymentNotice.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                  : paymentNotice.type === 'warning' || paymentNotice.type === 'info'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                    : 'border-red-500/40 bg-red-500/10 text-red-100'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {paymentNotice.type === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <p className="font-medium leading-relaxed">
                  {paymentNotice.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentNotice(null)}
                className="text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {registrationsError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{registrationsError}</span>
            </div>
          )}

          {loadingRegistrations ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#F15A24]" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#222222]/60 px-6 py-16 text-center">
              <Trophy className="h-10 w-10 text-[#F15A24]" />
              <h3 className="font-display mt-4 text-2xl font-bold tracking-wide text-white uppercase">
                No Registrations Yet
              </h3>
              <p className="mt-1.5 max-w-md text-xs text-[#A1A1AA]">
                You have not registered for any competitions yet. Browse
                published events to lock in your stage entry.
              </p>
              <Link
                to="/competitions"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase"
              >
                Explore Competitions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {registrations.map((reg) => {
                const paymentRef =
                  reg.payment?.cashfreePaymentId ||
                  reg.payment?.cashfreeOrderId ||
                  'Not Set';
                const needsPayment =
                  reg.registrationStatus !== 'CANCELLED' &&
                  reg.paymentStatus !== 'PAID';

                return (
                  <article
                    key={reg.id}
                    className="rounded-2xl border border-white/[0.08] bg-[#222222] p-5 transition-colors hover:border-[#F15A24]/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
                      <div>
                        <p className="font-mono text-xs font-bold text-[#F15A24]">
                          {reg.registrationCode}
                        </p>
                        <h3 className="font-display mt-1 text-2xl font-bold tracking-wide text-white uppercase">
                          {reg.competition?.name || 'Competition'}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          variant={getRegBadgeVariant(reg.registrationStatus)}
                        >
                          {reg.registrationStatus}
                        </StatusBadge>
                        <StatusBadge
                          variant={getPayBadgeVariant(reg.paymentStatus)}
                        >
                          {reg.paymentStatus}
                        </StatusBadge>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-[#A1A1AA] uppercase">
                          Selected Category
                        </dt>
                        <dd className="mt-1 font-semibold text-white">
                          {reg.category
                            ? `${reg.category.gender}: ${reg.category.name}`
                            : 'Not Set'}
                        </dd>
                      </div>

                      <div>
                        <dt className="flex items-center gap-1 text-[#A1A1AA] uppercase">
                          <Calendar className="h-3.5 w-3.5 text-[#F15A24]" />
                          Registration Date
                        </dt>
                        <dd className="mt-1 font-semibold text-white">
                          {formatDate(reg.createdAt)}
                        </dd>
                      </div>

                      <div>
                        <dt className="flex items-center gap-1 text-[#A1A1AA] uppercase">
                          <CreditCard className="h-3.5 w-3.5 text-[#F15A24]" />
                          Entry Fee
                        </dt>
                        <dd className="mt-1 font-semibold text-white">
                          {formatFee(
                            reg.payment?.amount ??
                              reg.competition?.registrationFee
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[#A1A1AA] uppercase">
                          Payment Reference
                        </dt>
                        <dd className="mt-1 font-mono text-white">
                          {paymentRef}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.06] pt-4">
                      <Link
                        to={`/competitions/${reg.competition?.slug || reg.competitionId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                      >
                        View Competition
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>

                      {needsPayment && (
                        <button
                          type="button"
                          disabled={Boolean(processingRegId) || verifyingPayment}
                          onClick={() => handleCompletePayment(reg)}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-60 cursor-pointer"
                        >
                          {processingRegId === reg.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Opening Checkout...
                            </>
                          ) : reg.paymentStatus === 'FAILED' ? (
                            <>
                              <CreditCard className="h-3.5 w-3.5" />
                              Retry Payment
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3.5 w-3.5" />
                              Complete Payment
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
