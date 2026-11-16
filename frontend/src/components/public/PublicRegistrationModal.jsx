import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Dumbbell,
  Loader2,
  RefreshCw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient.js';
import {
  launchCashfreeCheckout,
  saveCheckoutSession,
} from '../../utils/cashfreeCheckout.js';
import {
  checkAgeEligibility,
  isDeadlineClosed,
} from '../../utils/competitionHelpers.js';
import { formatFee } from '../../utils/formatters.js';
import { StatusBadge } from '../common/StatusBadge.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function getInputClassName(hasError, extra = '') {
  return [
    'h-11 w-full rounded-xl border bg-[#171717] px-3.5 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none',
    hasError
      ? 'border-red-500/70 focus:border-red-400'
      : 'border-white/10 focus:border-[#F15A24]',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-red-400">
      {message}
    </p>
  );
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-[#F15A24]" aria-hidden="true">
      *
    </span>
  );
}

export function PublicRegistrationModal({
  competition,
  competitions = [],
  onClose,
  onRegistrationUpdated,
}) {
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [gender, setGender] = useState('MALE');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [district, setDistrict] = useState('');
  const [representingType, setRepresentingType] = useState('GYM');
  const [gymNameInput, setGymNameInput] = useState('');
  const [individualOption, setIndividualOption] = useState('Other / Individual');
  const [categoryId, setCategoryId] = useState('');
  const [groupId, setGroupId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Holds { registration, cashfree, statusToken, reusedPendingRegistration }
  const [paymentResult, setPaymentResult] = useState(null);

  const openCompetitions = useMemo(() => {
    const source =
      competitions.length > 0 ? competitions : competition ? [competition] : [];
    return source.filter(
      (item) =>
        item &&
        !isDeadlineClosed(item.registrationDeadline) &&
        Array.isArray(item.categories) &&
        item.categories.length > 0
    );
  }, [competition, competitions]);

  const activeCompetition = useMemo(() => {
    if (!selectedCompetitionId) return competition || openCompetitions[0] || null;
    return (
      openCompetitions.find((c) => c.id === selectedCompetitionId) ||
      competition ||
      null
    );
  }, [selectedCompetitionId, openCompetitions, competition]);

  const isWomensCompetition = useMemo(() => {
    return (
      activeCompetition?.competitionType === "Women's Competition" ||
      activeCompetition?.genderEligibility === 'FEMALE_ONLY'
    );
  }, [activeCompetition]);

  const allowedGenders = useMemo(() => {
    if (!activeCompetition) return ['MALE', 'FEMALE', 'OTHER'];
    if (
      activeCompetition.genderEligibility === 'MALE_ONLY' ||
      ['Bodybuilding', "Men's Physique", 'Masters'].includes(
        activeCompetition.competitionType
      )
    ) {
      return ['MALE'];
    }
    if (isWomensCompetition) {
      return ['FEMALE'];
    }
    return ['MALE', 'FEMALE', 'OTHER'];
  }, [activeCompetition, isWomensCompetition]);

  const compatibleCategories = useMemo(() => {
    if (!activeCompetition?.categories) return [];
    return activeCompetition.categories.filter((cat) => {
      if (
        ['Bodybuilding', "Men's Physique", 'Masters'].includes(
          activeCompetition.competitionType
        )
      ) {
        if (cat.gender === 'FEMALE' || /female/i.test(cat.name || '')) {
          return false;
        }
        if (
          activeCompetition.competitionType === 'Bodybuilding' &&
          (/open/i.test(cat.name || '') || cat.categoryType === 'OPEN')
        ) {
          return false;
        }
        return cat.gender === 'MALE' || cat.gender === 'OPEN';
      }

      if (activeCompetition.competitionType === "Women's Competition") {
        if (cat.gender === 'MALE' || /male/i.test(cat.name || '')) {
          return false;
        }
        return cat.gender === 'FEMALE' || cat.gender === 'OPEN';
      }

      if (cat.gender === 'OPEN') return true;
      return cat.gender === gender;
    });
  }, [activeCompetition, gender]);

  const ageCheck = useMemo(
    () =>
      checkAgeEligibility(
        activeCompetition?.ageEligibility,
        age,
        activeCompetition?.competitionType
      ),
    [activeCompetition?.ageEligibility, activeCompetition?.competitionType, age]
  );

  useEffect(() => {
    if (!competition) return;
    setSelectedCompetitionId(competition.id);
    setParticipantName('');
    setEmail('');
    setMobileNumber('');
    const initialGender =
      competition.genderEligibility === 'FEMALE_ONLY' ? 'FEMALE' : 'MALE';
    setGender(initialGender);
    setAge('');
    setHeightCm('');
    setWeightKg('');
    setDistrict('');
    setRepresentingType('GYM');
    setGymNameInput('');
    setIndividualOption('Other / Individual');
    setFormError('');
    setFieldErrors({});
    setPaymentResult(null);
  }, [competition]);

  useEffect(() => {
    if (!allowedGenders.includes(gender)) {
      setGender(allowedGenders[0] || 'MALE');
    }
  }, [allowedGenders, gender]);

  useEffect(() => {
    if (!compatibleCategories.length) {
      setCategoryId('');
      return;
    }

    const isMasters = activeCompetition?.competitionType === 'Masters';
    if (isMasters && compatibleCategories.length > 0) {
      setCategoryId(compatibleCategories[0].id);
      return;
    }

    const isWomens =
      activeCompetition?.competitionType === "Women's Competition" ||
      isWomensCompetition;
    if (isWomens && compatibleCategories.length > 0) {
      setCategoryId(compatibleCategories[0].id);
      return;
    }

    const stillValid = compatibleCategories.some((c) => c.id === categoryId);
    if (!stillValid) {
      setCategoryId('');
      setGroupId('');
    }
  }, [compatibleCategories, categoryId, activeCompetition, gender]);

  const selectedCategory = useMemo(() => {
    return compatibleCategories.find((c) => c.id === categoryId) || null;
  }, [compatibleCategories, categoryId]);

  const categorySelectLabel = useMemo(() => {
    if (compatibleCategories.some((c) => c.categoryType === 'WEIGHT')) {
      return 'Select Weight Category';
    }
    if (compatibleCategories.some((c) => c.categoryType === 'HEIGHT')) {
      return 'Select Height Category';
    }
    return 'Select Category';
  }, [compatibleCategories]);

  if (!competition) return null;

  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateFields = () => {
    const errors = {};

    const cleanName = cleanText(participantName);
    if (cleanName.length < 2 || cleanName.length > 120) {
      errors.participantName = 'Full Name must be between 2 and 120 characters.';
    }

    const cleanEmail = cleanText(email).toLowerCase();
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 160) {
      errors.email = 'Please enter a valid email address.';
    }

    const mobileDigits = cleanText(mobileNumber).replace(/[^\d+]/g, '');
    const digitsOnly = mobileDigits.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      errors.mobileNumber = 'Mobile number must contain between 10 and 15 digits.';
    }

    const ageNum = Number(age);
    if (!age || !Number.isInteger(ageNum) || ageNum < 10 || ageNum > 100) {
      errors.age = 'Age must be a whole number between 10 and 100.';
    } else if (!ageCheck.eligible) {
      errors.age = ageCheck.message;
    }

    if (!isWomensCompetition) {
      const heightNum = Number(heightCm);
      if (
        heightCm === '' ||
        Number.isNaN(heightNum) ||
        heightNum < 80 ||
        heightNum > 260
      ) {
        errors.heightCm = 'Height must be between 80 and 260 cm.';
      }

      const weightNum = Number(weightKg);
      if (
        weightKg === '' ||
        Number.isNaN(weightNum) ||
        weightNum < 25 ||
        weightNum > 300
      ) {
        errors.weightKg = 'Weight must be between 25 and 300 kg.';
      }
    }

    if (!activeCompetition) {
      errors.competitionId = 'Please select an active competition.';
    }

    const isMasters = activeCompetition?.competitionType === 'Masters';
    if (isMasters) {
      if (!ageNum || ageNum <= 40) {
        errors.age =
          'Masters competition eligibility strictly requires participant age to be above 40 years.';
      }
      if (!categoryId && compatibleCategories[0]?.id) {
        setCategoryId(compatibleCategories[0].id);
      }
    } else if (!categoryId) {
      errors.categoryId = 'Please select an eligible category.';
    }

    const cleanDistrict = cleanText(district);
    if (cleanDistrict.length < 2 || cleanDistrict.length > 100) {
      errors.district = 'District must be between 2 and 100 characters.';
    }

    if (representingType === 'GYM') {
      const cleanGym = cleanText(gymNameInput);
      if (cleanGym.length < 2 || cleanGym.length > 120) {
        errors.gymName = 'Please enter your Gym Name (minimum 2 characters).';
      }
    }

    return errors;
  };

  const runCashfreeOrStoreResult = async (res) => {
    setPaymentResult(res);
    if (res?.registration?.id && res?.statusToken) {
      saveCheckoutSession({
        orderId: res.cashfree?.orderId || res.registration.id,
        statusToken: res.statusToken,
        registrationId: res.registration.id,
      });
    }

    if (onRegistrationUpdated) {
      onRegistrationUpdated(res.registration);
    }

    if (res.cashfree?.configured && res.cashfree?.paymentSessionId) {
      const checkoutOutcome = await launchCashfreeCheckout({
        mode: res.cashfree.mode,
        paymentSessionId: res.cashfree.paymentSessionId,
        orderId: res.cashfree.orderId,
        statusToken: res.statusToken,
        registrationId: res.registration.id,
      });

      if (checkoutOutcome?.error) {
        setFormError(
          checkoutOutcome.error.message ||
            'Payment not completed. Please retry to confirm your registration.'
        );
      } else if (checkoutOutcome?.paymentDetails && res.cashfree?.orderId) {
        // Verify with backend even after modal completion — never trust frontend payment success alone.
        const verifyRes = await apiClient.verifyOrderPayment({
          orderId: res.cashfree.orderId,
          statusToken: res.statusToken,
        });
        setPaymentResult({
          registration: verifyRes.registration,
          cashfree: res.cashfree,
          statusToken: verifyRes.statusToken,
        });
        if (onRegistrationUpdated) {
          onRegistrationUpdated(verifyRes.registration);
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const errors = validateFields();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please review the highlighted fields below.');
      return;
    }

    setFieldErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      const payload = {
        competitionId: activeCompetition.id,
        categoryId,
        groupId: groupId || null,
        participantName: cleanText(participantName),
        email: cleanText(email).toLowerCase(),
        mobileNumber: cleanText(mobileNumber),
        gender,
        age: Number.parseInt(age, 10),
        heightCm: isWomensCompetition
          ? null
          : heightCm
            ? Number(Number(heightCm).toFixed(2))
            : null,
        weightKg: isWomensCompetition
          ? null
          : weightKg
            ? Number(Number(weightKg).toFixed(2))
            : null,
        district: cleanText(district),
        representingType,
        gymName:
          representingType === 'INDIVIDUAL'
            ? individualOption
            : cleanText(gymNameInput),
      };

      const res = await apiClient.submitPublicRegistration(payload);
      await runCashfreeOrStoreResult(res);
    } catch (err) {
      setFormError(err.message || 'Failed to submit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryOrVerify = async () => {
    if (!paymentResult?.registration?.id || submitting) return;
    setFormError('');
    setSubmitting(true);
    try {
      const res = await apiClient.retryRegistrationPayment(
        paymentResult.registration.id,
        { statusToken: paymentResult.statusToken }
      );
      await runCashfreeOrStoreResult(res);
    } catch (err) {
      setFormError(err.message || 'Unable to initiate payment retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifiedPaid =
    paymentResult?.registration?.paymentStatus === 'PAID' &&
    paymentResult?.registration?.registrationStatus === 'CONFIRMED';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101010]/90 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] bg-[#101010] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F15A24]/15 px-2.5 py-0.5 text-[11px] font-bold tracking-widest text-[#F15A24] uppercase">
                <Dumbbell className="h-3 w-3" />
                {activeCompetition?.competitionType || competition.competitionType}
              </span>
              <span className="text-xs font-medium text-[#A1A1AA]">
                Official Athlete Registration
              </span>
            </div>
            <h2
              id="registration-modal-title"
              className="font-display mt-1.5 text-xl font-extrabold tracking-wide text-white uppercase sm:text-2xl"
            >
              {activeCompetition?.name || competition.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#A1A1AA] transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close registration modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {paymentResult ? (
          <div className="space-y-5 overflow-y-auto p-5 sm:p-7">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            {verifiedPaid ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                    Registration Successful
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                    Your payment has been verified by the backend and your
                    competition slot is officially confirmed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-[#F15A24]/40 bg-[#F15A24]/10 p-5">
                <Clock className="mt-0.5 h-6 w-6 shrink-0 text-[#F15A24]" />
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                    Payment Not Completed
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                    Payment not completed. Please retry to confirm your registration.
                  </p>
                </div>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#222222] p-5 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-[#A1A1AA] uppercase">Participant Name</dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {paymentResult.registration.participantName}
                </dd>
              </div>
              <div>
                <dt className="text-[#A1A1AA] uppercase">Registration ID</dt>
                <dd className="mt-1 font-mono text-sm font-bold text-[#F15A24]">
                  {paymentResult.registration.registrationCode}
                </dd>
              </div>
              <div>
                <dt className="text-[#A1A1AA] uppercase">Competition Name</dt>
                <dd className="mt-1 text-sm text-white">
                  {paymentResult.registration.competition?.name ||
                    activeCompetition?.name}
                </dd>
              </div>
              <div>
                <dt className="text-[#A1A1AA] uppercase">Selected Category</dt>
                <dd className="mt-1 text-sm text-white">
                  {paymentResult.registration.category?.gender}:{' '}
                  {paymentResult.registration.category?.name}
                </dd>
              </div>
              <div>
                <dt className="text-[#A1A1AA] uppercase">Registration Status</dt>
                <dd className="mt-1.5">
                  <StatusBadge variant={verifiedPaid ? 'confirmed' : 'pending'}>
                    {paymentResult.registration.registrationStatus}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-[#A1A1AA] uppercase">Payment Status</dt>
                <dd className="mt-1.5">
                  <StatusBadge
                    variant={
                      paymentResult.registration.paymentStatus === 'PAID'
                        ? 'paid'
                        : paymentResult.registration.paymentStatus === 'FAILED'
                          ? 'failed'
                          : 'pending'
                    }
                  >
                    {paymentResult.registration.paymentStatus}
                  </StatusBadge>
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#A1A1AA]">
                Entry Fee:{' '}
                <span className="font-semibold text-white">
                  {formatFee(activeCompetition?.registrationFee)}
                </span>
              </p>

              <div className="flex items-center gap-3">
                {!verifiedPaid && paymentResult.cashfree?.configured && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleRetryOrVerify}
                    className="inline-flex items-center gap-2 rounded-full border border-[#F15A24] bg-[#F15A24]/15 px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#F15A24] disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span>Retry Payment</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-2.5 text-xs font-bold tracking-wider text-white uppercase"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Personal Information */}
              <section
                aria-labelledby="section-personal-info"
                className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-[#F15A24]" />
                    <h3
                      id="section-personal-info"
                      className="text-sm font-bold tracking-wider text-white uppercase"
                    >
                      1. Personal Information
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#A1A1AA]">
                    <span className="text-[#F15A24]">*</span> Required
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-full-name"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Full Name <RequiredMark />
                    </label>
                    <input
                      id="reg-full-name"
                      type="text"
                      required
                      value={participantName}
                      onChange={(e) => {
                        setParticipantName(e.target.value);
                        clearFieldError('participantName');
                      }}
                      placeholder="e.g. Aarav Sharma"
                      aria-invalid={Boolean(fieldErrors.participantName)}
                      aria-describedby={
                        fieldErrors.participantName ? 'err-full-name' : undefined
                      }
                      className={getInputClassName(
                        Boolean(fieldErrors.participantName)
                      )}
                    />
                    <FieldError
                      id="err-full-name"
                      message={fieldErrors.participantName}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-age"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Age (Years) <RequiredMark />
                    </label>
                    <input
                      id="reg-age"
                      type="number"
                      required
                      min="10"
                      max="100"
                      inputMode="numeric"
                      value={age}
                      onChange={(e) => {
                        setAge(e.target.value);
                        clearFieldError('age');
                      }}
                      placeholder="e.g. 25"
                      aria-invalid={Boolean(
                        fieldErrors.age || !ageCheck.eligible
                      )}
                      aria-describedby={
                        fieldErrors.age || !ageCheck.eligible
                          ? 'err-age'
                          : undefined
                      }
                      className={getInputClassName(
                        Boolean(fieldErrors.age || !ageCheck.eligible)
                      )}
                    />
                    <FieldError
                      id="err-age"
                      message={
                        fieldErrors.age ||
                        (!ageCheck.eligible ? ageCheck.message : '')
                      }
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Email Address <RequiredMark />
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      placeholder="athlete@example.com"
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={
                        fieldErrors.email ? 'err-email' : undefined
                      }
                      className={getInputClassName(
                        Boolean(fieldErrors.email)
                      )}
                    />
                    <FieldError id="err-email" message={fieldErrors.email} />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-mobile"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Mobile Number <RequiredMark />
                    </label>
                    <input
                      id="reg-mobile"
                      type="tel"
                      required
                      inputMode="tel"
                      value={mobileNumber}
                      onChange={(e) => {
                        setMobileNumber(e.target.value);
                        clearFieldError('mobileNumber');
                      }}
                      placeholder="10-digit mobile number"
                      aria-invalid={Boolean(fieldErrors.mobileNumber)}
                      aria-describedby={
                        fieldErrors.mobileNumber ? 'err-mobile' : undefined
                      }
                      className={getInputClassName(
                        Boolean(fieldErrors.mobileNumber)
                      )}
                    />
                    <FieldError
                      id="err-mobile"
                      message={fieldErrors.mobileNumber}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="reg-gender"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Gender <RequiredMark />
                    </label>
                    <select
                      id="reg-gender"
                      value={gender}
                      onChange={(e) => {
                        setGender(e.target.value);
                        clearFieldError('categoryId');
                      }}
                      className={getInputClassName(false)}
                    >
                      {allowedGenders.map((g) => (
                        <option key={g} value={g}>
                          {g === 'MALE'
                            ? 'Male'
                            : g === 'FEMALE'
                              ? 'Female'
                              : 'Other'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 2: Physical Information (Hidden for Women's Competition) */}
              {!isWomensCompetition && (
                <section
                  aria-labelledby="section-physical-info"
                  className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 sm:p-5"
                >
                  <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                    <Ruler className="h-4 w-4 text-[#F15A24]" />
                    <h3
                      id="section-physical-info"
                      className="text-sm font-bold tracking-wider text-white uppercase"
                    >
                      2. Physical Information
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="reg-height"
                        className="mb-1.5 block text-xs font-semibold text-zinc-200"
                      >
                        Height (cm) <RequiredMark />
                      </label>
                      <input
                        id="reg-height"
                        type="number"
                        required
                        min="80"
                        max="260"
                        step="0.1"
                        inputMode="decimal"
                        value={heightCm}
                        onChange={(e) => {
                          setHeightCm(e.target.value);
                          clearFieldError('heightCm');
                        }}
                        placeholder="e.g. 175"
                        aria-invalid={Boolean(fieldErrors.heightCm)}
                        aria-describedby={
                          fieldErrors.heightCm ? 'err-height' : undefined
                        }
                        className={getInputClassName(
                          Boolean(fieldErrors.heightCm)
                        )}
                      />
                      <FieldError
                        id="err-height"
                        message={fieldErrors.heightCm}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reg-weight"
                        className="mb-1.5 block text-xs font-semibold text-zinc-200"
                      >
                        Weight (kg) <RequiredMark />
                      </label>
                      <input
                        id="reg-weight"
                        type="number"
                        required
                        min="25"
                        max="300"
                        step="0.1"
                        inputMode="decimal"
                        value={weightKg}
                        onChange={(e) => {
                          setWeightKg(e.target.value);
                          clearFieldError('weightKg');
                        }}
                        placeholder="e.g. 72.5"
                        aria-invalid={Boolean(fieldErrors.weightKg)}
                        aria-describedby={
                          fieldErrors.weightKg ? 'err-weight' : undefined
                        }
                        className={getInputClassName(
                          Boolean(fieldErrors.weightKg)
                        )}
                      />
                      <FieldError
                        id="err-weight"
                        message={fieldErrors.weightKg}
                      />
                    </div>
                  </div>
                </section>
              )}

              {/* Section 3: Representation Information */}
              <section
                aria-labelledby="section-representation-info"
                className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                  <Building2 className="h-4 w-4 text-[#F15A24]" />
                  <h3
                    id="section-representation-info"
                    className="text-sm font-bold tracking-wider text-white uppercase"
                  >
                    3. Representation Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-200">
                      Representing <RequiredMark />
                    </span>
                    <div
                      role="group"
                      aria-label="Representing type"
                      className="grid h-11 grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#171717] p-1"
                    >
                      {[
                        { value: 'GYM', label: 'Gym' },
                        { value: 'INDIVIDUAL', label: 'Individual' },
                      ].map((option) => {
                        const active = representingType === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              setRepresentingType(option.value);
                              clearFieldError('gymName');
                            }}
                            className={`rounded-lg text-xs font-bold tracking-wide uppercase transition-all ${
                              active
                                ? 'bg-[#F15A24] text-white shadow-sm'
                                : 'text-[#A1A1AA] hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-district"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      District (Zilha) <RequiredMark />
                    </label>
                    <input
                      id="reg-district"
                      type="text"
                      required
                      value={district}
                      onChange={(e) => {
                        setDistrict(e.target.value);
                        clearFieldError('district');
                      }}
                      placeholder="e.g. Pune"
                      aria-invalid={Boolean(fieldErrors.district)}
                      aria-describedby={
                        fieldErrors.district ? 'err-district' : undefined
                      }
                      className={getInputClassName(
                        Boolean(fieldErrors.district)
                      )}
                    />
                    <FieldError
                      id="err-district"
                      message={fieldErrors.district}
                    />
                  </div>

                  {representingType === 'GYM' && (
                    <div className="md:col-span-2">
                      <label
                        htmlFor="reg-gym-name"
                        className="mb-1.5 block text-xs font-semibold text-zinc-200"
                      >
                        Gym Name <RequiredMark />
                      </label>
                      <input
                        id="reg-gym-name"
                        type="text"
                        required
                        value={gymNameInput}
                        onChange={(e) => {
                          setGymNameInput(e.target.value);
                          clearFieldError('gymName');
                        }}
                        placeholder="Enter your gym or club name"
                        aria-invalid={Boolean(fieldErrors.gymName)}
                        aria-describedby={
                          fieldErrors.gymName ? 'err-gym-name' : undefined
                        }
                        className={getInputClassName(
                          Boolean(fieldErrors.gymName)
                        )}
                      />
                      <FieldError
                        id="err-gym-name"
                        message={fieldErrors.gymName}
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Section 4: Competition & Category Selection / Masters Eligibility */}
              <section
                aria-labelledby="section-competition-info"
                className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                  <Trophy className="h-4 w-4 text-[#F15A24]" />
                  <h3
                    id="section-competition-info"
                    className="text-sm font-bold tracking-wider text-white uppercase"
                  >
                    4. Competition &amp; Category Selection
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="reg-competition"
                      className="mb-1.5 block text-xs font-semibold text-zinc-200"
                    >
                      Competition <RequiredMark />
                    </label>
                    {openCompetitions.length > 1 ? (
                      <select
                        id="reg-competition"
                        value={activeCompetition?.id || ''}
                        onChange={(e) => {
                          setSelectedCompetitionId(e.target.value);
                          clearFieldError('competitionId');
                          clearFieldError('categoryId');
                        }}
                        aria-invalid={Boolean(fieldErrors.competitionId)}
                        className={getInputClassName(
                          Boolean(fieldErrors.competitionId)
                        )}
                      >
                        {openCompetitions.map((comp) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.name} ({comp.competitionType})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="reg-competition"
                        type="text"
                        readOnly
                        value={activeCompetition?.name || competition.name}
                        className={getInputClassName(
                          false,
                          'cursor-default font-semibold opacity-90'
                        )}
                      />
                    )}
                    <FieldError
                      id="err-competition"
                      message={fieldErrors.competitionId}
                    />
                  </div>

                  {/* Competition-Specific Configuration: Masters vs Bodybuilding vs Men's Physique */}
                  {activeCompetition?.competitionType === 'Masters' ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                            Masters Division — Open Category
                          </p>
                          <p className="text-[11px] text-zinc-300">
                            No weight or height divisions. All athletes compete in the Masters Open category.
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-amber-500/20 pt-2 text-xs">
                        <span className="font-semibold text-amber-300">Strict Eligibility Rule:</span>{' '}
                        <span className="text-white">Athlete must be strictly above 40 years of age.</span>
                      </div>

                      {age && (
                        <div className="pt-1">
                          {Number(age) <= 40 ? (
                            <div className="rounded-lg border border-red-500/40 bg-red-500/15 p-2.5 text-xs font-semibold text-red-200 flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                              <span>
                                Ineligible: Age must be strictly above 40 years to compete in Masters (entered: {age}).
                              </span>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-2.5 text-xs font-semibold text-emerald-200 flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span>
                                Eligible: Age {age} verified strictly above 40 years.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isWomensCompetition ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-zinc-200">
                        Category Selection <RequiredMark />
                      </label>
                      <div className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-[#171717] px-4 text-xs font-semibold text-white">
                        <span>Open Category (Female Division)</span>
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase">
                          Auto-Selected
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="reg-category"
                        className="mb-1.5 block text-xs font-semibold text-zinc-200"
                      >
                        {activeCompetition?.competitionType === 'Bodybuilding'
                          ? 'Select Weight Category'
                          : activeCompetition?.competitionType === "Men's Physique"
                            ? 'Select Height Category'
                            : categorySelectLabel}{' '}
                        <RequiredMark />
                      </label>
                      {compatibleCategories.length === 0 ? (
                        <div className="flex h-11 items-center rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 text-xs text-red-200">
                          No eligible categories for {gender.toLowerCase()}.
                        </div>
                      ) : (
                        <select
                          id="reg-category"
                          value={categoryId}
                          onChange={(e) => {
                            setCategoryId(e.target.value);
                            clearFieldError('categoryId');
                          }}
                          aria-invalid={Boolean(fieldErrors.categoryId)}
                          aria-describedby={
                            fieldErrors.categoryId ? 'err-category' : undefined
                          }
                          className={getInputClassName(
                            Boolean(fieldErrors.categoryId)
                          )}
                        >
                          <option value="">
                            --{' '}
                            {activeCompetition?.competitionType === 'Bodybuilding'
                              ? 'Select Weight Category'
                              : activeCompetition?.competitionType === "Men's Physique"
                                ? 'Select Height Category'
                                : categorySelectLabel}{' '}
                            --
                          </option>
                          {compatibleCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <FieldError
                        id="err-category"
                        message={fieldErrors.categoryId}
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Sticky Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#101010] px-5 py-4 sm:px-7">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
                  Registration Fee
                </p>
                <p className="text-base font-extrabold text-white">
                  {formatFee(activeCompetition?.registrationFee)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-11 rounded-full border border-white/15 px-5 text-xs font-semibold text-[#A1A1AA] transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    compatibleCategories.length === 0 ||
                    !ageCheck.eligible
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Submitting...' : 'Proceed to Payment'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
