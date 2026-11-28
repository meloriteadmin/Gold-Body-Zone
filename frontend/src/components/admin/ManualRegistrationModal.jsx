import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiClient } from '../../lib/apiClient.js';
import { launchCashfreeCheckout } from '../../utils/cashfreeCheckout.js';
import { checkAgeEligibility } from '../../utils/competitionHelpers.js';
import { formatFee } from '../../utils/formatters.js';

const MAHARASHTRA_DISTRICTS = [
  'Ahmednagar',
  'Akola',
  'Amravati',
  'Aurangabad (Chhatrapati Sambhaji Nagar)',
  'Beed',
  'Bhandara',
  'Buldhana',
  'Chandrapur',
  'Dhule',
  'Gadchiroli',
  'Gondia',
  'Hingoli',
  'Jalgaon',
  'Jalna',
  'Kolhapur',
  'Latur',
  'Mumbai City',
  'Mumbai Suburban',
  'Nagpur',
  'Nanded',
  'Nandurbar',
  'Nashik',
  'Osmanabad (Dharashiv)',
  'Palghar',
  'Parbhani',
  'Pune',
  'Raigad',
  'Ratnagiri',
  'Sangli',
  'Satara',
  'Sindhudurg',
  'Solapur',
  'Thane',
  'Wardha',
  'Washim',
  'Yavatmal',
  'Other / Outside Maharashtra',
];

export function ManualRegistrationModal({
  isOpen,
  competitions = [],
  selectedCompetitionId = '',
  initialCategoryId = '',
  onClose,
  onSuccess,
}) {
  const { accessToken } = useAuth();
  const wasOpen = useRef(false);

  // Wizard Step: 'DETAILS' (Step 1) | 'PAYMENT' (Step 2)
  const [step, setStep] = useState('DETAILS');

  // Step 1: Participant Form State
  const [competitionId, setCompetitionId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [gender, setGender] = useState('MALE');
  const [age, setAge] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [trunkNumber, setTrunkNumber] = useState('');
  const [groupId, setGroupId] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [district, setDistrict] = useState('');
  const [representingType, setRepresentingType] = useState('GYM');
  const [gymName, setGymName] = useState('');

  // Step 2: Payment Selection State (Exactly 2 options: 'UPI' or 'CASH')
  const [paymentOption, setPaymentOption] = useState('UPI'); // 'UPI' | 'CASH'
  const [cashConfirmed, setCashConfirmed] = useState(false);

  // Submission & Validation State
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Active / Cached Registration & UPI Session for Retry
  const [activeRegistration, setActiveRegistration] = useState(null);
  const [cashfreeData, setCashfreeData] = useState(null);
  const [paymentNotice, setPaymentNotice] = useState('');

  // Active Target Competition
  const activeCompetition = useMemo(() => {
    return (
      competitions.find((c) => c.id === competitionId) ||
      competitions[0] ||
      null
    );
  }, [competitions, competitionId]);

  // Refreshing the competition list must not erase an in-progress registration.
  useEffect(() => {
    if (!isOpen) {
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      if (selectedCompetitionId) {
        setCompetitionId(selectedCompetitionId);
      } else if (competitions.length > 0 && !competitionId) {
        setCompetitionId(competitions[0].id);
      }
      const initialCategory = competitions.find((item) => item.id === selectedCompetitionId)?.categories?.find((item) => item.id === initialCategoryId);
      setCategoryId(initialCategory?.id || '');
      setGender(initialCategory?.gender === 'FEMALE' ? 'FEMALE' : 'MALE');
      setParticipantName('');
      setEmail('');
      setMobileNumber('');
      setAge('');
      setHeightCm('');
      setWeightKg('');
      setDistrict('Nashik');
      setRepresentingType('GYM');
      setGymName('');
      setStep('DETAILS');
      setPaymentOption('UPI');
      setCashConfirmed(false);
      setFormError('');
      setFieldErrors({});
      setActiveRegistration(null);
      setCashfreeData(null);
      setPaymentNotice('');
    }
  }, [isOpen, selectedCompetitionId, initialCategoryId, competitions]);

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

  useEffect(() => {
    if (allowedGenders.length === 1) {
      setGender(allowedGenders[0]);
    } else if (!allowedGenders.includes(gender)) {
      setGender(allowedGenders[0] || 'MALE');
    }
  }, [allowedGenders, gender]);

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

  useEffect(() => {
    if (compatibleCategories.length === 1) {
      setCategoryId(compatibleCategories[0].id);
    } else if (
      categoryId &&
      !compatibleCategories.some((c) => c.id === categoryId)
    ) {
      setCategoryId(compatibleCategories[0]?.id || '');
    } else if (!categoryId && compatibleCategories.length > 0) {
      setCategoryId(compatibleCategories[0].id);
    }
  }, [compatibleCategories, categoryId]);

  const selectedCategory = useMemo(() => {
    return compatibleCategories.find((c) => c.id === categoryId) || null;
  }, [compatibleCategories, categoryId]);

  const availableGroups = useMemo(() => {
    return selectedCategory?.groups || [];
  }, [selectedCategory]);

  useEffect(() => {
    if (availableGroups.length > 0 && !groupId) {
      setGroupId(availableGroups[0].id);
    } else if (groupId && !availableGroups.some((g) => g.id === groupId)) {
      setGroupId(availableGroups[0]?.id || '');
    }
  }, [availableGroups, groupId]);

  const ageCheck = useMemo(
    () =>
      checkAgeEligibility(
        activeCompetition?.ageEligibility,
        age,
        activeCompetition?.competitionType
      ),
    [activeCompetition?.ageEligibility, activeCompetition?.competitionType, age]
  );

  const clearFieldError = (fieldName) => {
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setFormError('');
  };

  const validateParticipantDetails = () => {
    const errs = {};
    if (!activeCompetition?.id) errs.competitionId = 'Competition is required.';
    if (!participantName.trim() || participantName.trim().length < 2) {
      errs.participantName = 'Full Name must be at least 2 characters.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    const rawDigits = mobileNumber.replace(/\D/g, '');
    if (rawDigits.length !== 10) {
      errs.mobileNumber = 'Mobile number must be exactly 10 digits.';
    }
    const numericAge = Number.parseInt(age, 10);
    if (!age || Number.isNaN(numericAge) || numericAge < 10 || numericAge > 99) {
      errs.age = 'Age must be between 10 and 99.';
    } else if (ageCheck && !ageCheck.eligible) {
      errs.age = ageCheck.message;
    }

    if (!categoryId) {
      errs.categoryId = 'Please select a category.';
    }

    if (!isWomensCompetition) {
      const h = Number.parseFloat(heightCm);
      if (!heightCm || Number.isNaN(h) || h < 80 || h > 260) {
        errs.heightCm = 'Height must be between 80 and 260 cm.';
      }
      const w = Number.parseFloat(weightKg);
      if (!weightKg || Number.isNaN(w) || w < 25 || w > 300) {
        errs.weightKg = 'Weight must be between 25 and 300 kg.';
      }
    }

    if (!district || !district.trim() || district.trim().length < 2) {
      errs.district = 'District must be at least 2 characters.';
    }
    if (
      representingType === 'GYM' &&
      (!gymName.trim() || gymName.trim().length < 2)
    ) {
      errs.gymName = 'Gym name must be at least 2 characters.';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleProceedToPayment = (e) => {
    e.preventDefault();
    setFormError('');
    if (!validateParticipantDetails()) {
      setFormError('Please resolve the errors highlighted below.');
      return;
    }
    setStep('PAYMENT');
  };

  const buildPayload = (overrideMethod, extra = {}) => {
    return {
      competitionId: activeCompetition.id,
      categoryId,
      ...(trunkNumber.trim() ? { trunkNumber: Number(trunkNumber) } : {}),
      groupId: groupId || undefined,
      participantName: participantName.trim(),
      email: email.trim().toLowerCase(),
      mobileNumber: mobileNumber.replace(/\D/g, ''),
      gender,
      age: Number.parseInt(age, 10),
      heightCm: isWomensCompetition
        ? undefined
        : heightCm
          ? Number.parseFloat(heightCm)
          : undefined,
      weightKg: isWomensCompetition
        ? undefined
        : weightKg
          ? Number.parseFloat(weightKg)
          : undefined,
      district: district.trim(),
      representingType,
      gymName:
        representingType === 'GYM'
          ? gymName.trim()
          : 'Other / Individual',
      paymentMethod: overrideMethod,
      ...extra,
    };
  };

  // Option 1: UPI — Open Cashfree Checkout (same as public registration)
  const handleUpiCheckout = async () => {
    setFormError('');
    setPaymentNotice('');
    setSubmitting(true);
    try {
      const payload = buildPayload('UPI');
      const res = await apiClient.createManualRegistration(accessToken, payload);
      setActiveRegistration(res.registration);

      const cfInfo = res.cashfree || (res.upiQr ? {
        configured: true,
        mode: 'sandbox',
        paymentSessionId: res.upiQr.paymentSessionId,
        orderId: res.upiQr.orderId,
      } : null);

      setCashfreeData(cfInfo);

      if (!cfInfo?.paymentSessionId) {
        throw new Error('Cashfree payment session could not be initialized.');
      }

      // Launch existing Cashfree Checkout (modal or redirect)
      const outcome = await launchCashfreeCheckout({
        mode: cfInfo.mode || 'sandbox',
        paymentSessionId: cfInfo.paymentSessionId,
        orderId: cfInfo.orderId,
        registrationId: res.registration.id,
      });

      // Post-checkout: verify transaction through the backend before marking Confirmed/Paid
      const verifyRes = await apiClient.verifyRegistrationPayment(
        accessToken,
        res.registration.id
      );

      if (verifyRes.isPaid || verifyRes.registration?.paymentStatus === 'PAID') {
        if (onSuccess) {
          onSuccess({
            ...verifyRes.registration,
            competitionName: activeCompetition?.name,
          });
        }
        onClose();
      } else {
        // If payment was cancelled, failed, or pending: do not mark confirmed
        setPaymentNotice('Payment not completed. Please retry to confirm your registration.');
      }
    } catch (err) {
      setPaymentNotice(err.message || 'Payment not completed. Please retry to confirm your registration.');
    } finally {
      setSubmitting(false);
    }
  };

  // Option 2: Cash — Confirm cash received, directly save to DB as Paid
  const handleCashPayment = async () => {
    setFormError('');
    setPaymentNotice('');

    if (!cashConfirmed) {
      setFormError('Please check the confirmation box verifying cash receipt.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload('CASH', {
        offlineConfirmed: true,
      });

      const res = await apiClient.createManualRegistration(accessToken, payload);

      if (onSuccess) {
        onSuccess({
          ...res.registration,
          competitionName: activeCompetition?.name,
        });
      }
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to save cash registration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-reg-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#171717] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F15A24]/15 text-[#F15A24]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="manual-reg-modal-title"
                className="font-display text-xl font-bold tracking-wide text-white uppercase"
              >
                Manual Participant Registration
              </h2>
              <p className="text-xs text-[#A1A1AA]">
                {step === 'DETAILS'
                  ? 'Step 1 of 2: Participant Information & Category Selection'
                  : 'Step 2 of 2: Payment Collection (UPI or Cash)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wizard Stepper Tabs */}
        <div className="grid grid-cols-2 border-b border-white/[0.06] text-xs">
          <button
            type="button"
            onClick={() => setStep('DETAILS')}
            className={`flex items-center justify-center gap-2 py-2.5 font-bold transition-all ${
              step === 'DETAILS'
                ? 'border-b-2 border-[#F15A24] bg-white/[0.02] text-[#F15A24]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]">
              1
            </span>
            <span>1. Participant Details</span>
          </button>
          <button
            type="button"
            disabled={step === 'DETAILS'}
            onClick={() => {
              if (validateParticipantDetails()) setStep('PAYMENT');
            }}
            className={`flex items-center justify-center gap-2 py-2.5 font-bold transition-all ${
              step === 'PAYMENT'
                ? 'border-b-2 border-[#F15A24] bg-white/[0.02] text-[#F15A24]'
                : 'cursor-not-allowed opacity-50 text-zinc-500'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px]">
              2
            </span>
            <span>2. Payment (UPI / Cash)</span>
          </button>
        </div>

        {/* Top Alerts */}
        {formError && (
          <div className="px-6 pt-4">
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{formError}</span>
            </div>
          </div>
        )}

        {/* STEP 1: PARTICIPANT DETAILS */}
        {step === 'DETAILS' && (
          <form
            onSubmit={handleProceedToPayment}
            className="flex-1 overflow-y-auto p-6 space-y-6"
          >
            {/* Prominent Fee Card (Requirement 1) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[#F15A24]/30 bg-[#F15A24]/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F15A24]/20 text-[#F15A24]">
                  <Banknote className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-[#F15A24] uppercase">
                    Registration Fee Required
                  </span>
                  <p className="font-display text-2xl font-black text-white">
                    {formatFee(activeCompetition?.registrationFee)}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right text-xs">
                <p className="font-semibold text-white">
                  {activeCompetition?.name || 'Selected Competition'}
                </p>
                <p className="text-zinc-400">
                  Choose UPI or Cash at next step to confirm registration
                </p>
              </div>
            </div>

            {/* Target Competition */}
            <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-[#222222] p-4">
              <label
                htmlFor="manual-comp-select"
                className="text-xs font-bold tracking-wider text-[#F15A24] uppercase"
              >
                Select Target Competition *
              </label>
              <select
                id="manual-comp-select"
                value={activeCompetition?.id || ''}
                onChange={(e) => {
                  setCompetitionId(e.target.value);
                  setCategoryId('');
                  setGroupId('');
                }}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#171717] px-3.5 text-xs font-semibold text-white focus:border-[#F15A24] focus:outline-none"
              >
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.competitionType})
                    {c.isCompleted ? ' — [COMPLETED]' : ''} — Fee:{' '}
                    {formatFee(c.registrationFee)}
                  </option>
                ))}
              </select>

              {activeCompetition?.isCompleted && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-blue-400" />
                  <span>
                    <strong>Registration Closed:</strong> This competition is
                    marked as Completed. New manual registrations cannot be
                    submitted.
                  </span>
                </div>
              )}

              {activeCompetition?.ageEligibility && (
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Eligibility: {activeCompetition.ageEligibility}</span>
                </div>
              )}
            </div>

            {/* Participant Personal Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Participant Information
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={participantName}
                    onChange={(e) => {
                      setParticipantName(e.target.value);
                      clearFieldError('participantName');
                    }}
                    placeholder="e.g. Rahul Patil"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.participantName && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.participantName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    placeholder="athlete@example.com"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={mobileNumber}
                    onChange={(e) => {
                      setMobileNumber(e.target.value.replace(/\D/g, ''));
                      clearFieldError('mobileNumber');
                    }}
                    placeholder="9876543210"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.mobileNumber && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.mobileNumber}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Age (Years) *
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={99}
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value);
                      clearFieldError('age');
                    }}
                    placeholder="e.g. 25"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.age && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.age}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Gender *
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => {
                      setGender(e.target.value);
                      clearFieldError('gender');
                    }}
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
                  >
                    {allowedGenders.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    District (Zilha) *
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      clearFieldError('district');
                    }}
                    placeholder="e.g. Nashik, Pune, Mumbai"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.district && (
                    <p className="mt-1 text-[11px] text-red-400">{fieldErrors.district}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Categories & Groups */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Category &amp; Division Selection
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Competition Category *
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setGroupId('');
                      clearFieldError('categoryId');
                    }}
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
                  >
                    {compatibleCategories.length === 0 ? (
                      <option value="">No categories available</option>
                    ) : (
                      compatibleCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({cat.categoryType})
                        </option>
                      ))
                    )}
                  </select>
                  {fieldErrors.categoryId && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.categoryId}
                    </p>
                  )}
                </div>

                {availableGroups.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Group / Division (Optional)
                    </label>
                    <select
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white focus:border-[#F15A24] focus:outline-none"
                    >
                      <option value="">No Group</option>
                      {availableGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="max-w-xs">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Trunk number (optional)</label>
                <input type="number" min="1" max="99999" step="1" value={trunkNumber} onChange={(event) => setTrunkNumber(event.target.value)} placeholder="Assign now, or later in Category Line-up" className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white" />
                <p className="mt-1 text-[10px] text-zinc-500">Unique across the entire competition. Leave blank to assign later.</p>
              </div>

              {!isWomensCompetition && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Height (cm) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={heightCm}
                      onChange={(e) => {
                        setHeightCm(e.target.value);
                        clearFieldError('heightCm');
                      }}
                      placeholder="e.g. 175.5"
                      className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                    />
                    {fieldErrors.heightCm && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {fieldErrors.heightCm}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Weight (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={weightKg}
                      onChange={(e) => {
                        setWeightKg(e.target.value);
                        clearFieldError('weightKg');
                      }}
                      placeholder="e.g. 72.0"
                      className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                    />
                    {fieldErrors.weightKg && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {fieldErrors.weightKg}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Affiliation */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Affiliation
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRepresentingType('GYM')}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-colors ${
                    representingType === 'GYM'
                      ? 'border-[#F15A24] bg-[#F15A24]/15 text-[#F15A24]'
                      : 'border-white/10 bg-[#222222] text-zinc-400 hover:text-white'
                  }`}
                >
                  Representing Gym
                </button>
                <button
                  type="button"
                  onClick={() => setRepresentingType('INDIVIDUAL')}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-colors ${
                    representingType === 'INDIVIDUAL'
                      ? 'border-[#F15A24] bg-[#F15A24]/15 text-[#F15A24]'
                      : 'border-white/10 bg-[#222222] text-zinc-400 hover:text-white'
                  }`}
                >
                  Individual
                </button>
              </div>

              {representingType === 'GYM' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Gym Name *
                  </label>
                  <input
                    type="text"
                    value={gymName}
                    onChange={(e) => {
                      setGymName(e.target.value);
                      clearFieldError('gymName');
                    }}
                    placeholder="e.g. Iron Gym & Fitness"
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#222222] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                  />
                  {fieldErrors.gymName && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {fieldErrors.gymName}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Step 1 Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={activeCompetition?.isCompleted}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#F15A24]/20 hover:brightness-110 disabled:opacity-50"
              >
                <span>
                  Proceed to Payment (
                  {formatFee(activeCompetition?.registrationFee)})
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: EXACTLY TWO PAYMENT OPTIONS (UPI or Cash) */}
        {step === 'PAYMENT' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Review Summary Header */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#222222] p-4 text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-zinc-400">Participant:</span>
                <span className="font-bold text-white">
                  {participantName} ({email})
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-zinc-400">Competition &amp; Category:</span>
                <span className="font-medium text-zinc-200">
                  {activeCompetition?.name} • {selectedCategory?.name}
                  {groupId &&
                  availableGroups.find((g) => g.id === groupId)
                    ? ` (${availableGroups.find((g) => g.id === groupId)?.name})`
                    : ''}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                  Registration Fee Due:
                </span>
                <span className="font-display text-2xl font-black text-[#F15A24]">
                  {formatFee(activeCompetition?.registrationFee)}
                </span>
              </div>
            </div>

            {/* Exactly Two Payment Options Selector */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-[#F15A24] uppercase">
                Select Payment Option *
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* 1. UPI Option */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPaymentOption('UPI')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPaymentOption('UPI');
                    }
                  }}
                  className={`flex flex-col justify-between rounded-2xl border p-4 cursor-pointer transition-all ${
                    paymentOption === 'UPI'
                      ? 'border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
                      : 'border-white/10 bg-[#222222] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                        <Coins className="h-5 w-5" />
                      </div>
                      {paymentOption === 'UPI' && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">1. UPI</p>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        Cashfree Checkout (GPay, PhonePe, Paytm, BHIM, or QR).
                      </p>
                    </div>
                  </div>
                  <span className="mt-3 inline-block rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 w-fit">
                    Cashfree Checkout • Backend Verified
                  </span>
                </div>

                {/* 2. Cash Option */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPaymentOption('CASH')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPaymentOption('CASH');
                    }
                  }}
                  className={`flex flex-col justify-between rounded-2xl border p-4 cursor-pointer transition-all ${
                    paymentOption === 'CASH'
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'border-white/10 bg-[#222222] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                        <Banknote className="h-5 w-5" />
                      </div>
                      {paymentOption === 'CASH' && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">2. Cash</p>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        Confirm cash received directly at the desk. Saves to DB as Paid.
                      </p>
                    </div>
                  </div>
                  <span className="mt-3 inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 w-fit">
                    Direct DB Save • Marked as Paid
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Notice / Failure Notice with Retry */}
            {paymentNotice && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{paymentNotice}</span>
                </div>
                {paymentOption === 'UPI' && (
                  <button
                    type="button"
                    onClick={handleUpiCheckout}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1 font-bold text-white uppercase hover:bg-red-500/30 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${submitting ? 'animate-spin' : ''}`}
                    />
                    <span>Retry Payment</span>
                  </button>
                )}
              </div>
            )}

            {/* UPI Option Container */}
            {paymentOption === 'UPI' && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Coins className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-white">
                      Cashfree UPI Checkout
                    </p>
                    <p className="text-zinc-300 leading-relaxed">
                      Click below to open Cashfree Checkout. The participant can
                      complete payment using any UPI app (Google Pay, PhonePe, Paytm, BHIM)
                      or scan the Cashfree QR. Registration is confirmed <strong>only after</strong> successful backend verification.
                    </p>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-400">
                    Amount: <span className="text-white">{formatFee(activeCompetition?.registrationFee)}</span>
                  </p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleUpiCheckout}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:brightness-110 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Opening Cashfree Checkout...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="h-4 w-4" />
                        <span>Open Cashfree Checkout</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Cash Option Container */}
            {paymentOption === 'CASH' && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
                {/* Explicit Admin Confirmation Checkbox */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cashConfirmed}
                      onChange={(e) => setCashConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#171717] text-emerald-500 focus:ring-emerald-500"
                    />
                    <div className="text-xs leading-relaxed text-zinc-200">
                      <span className="font-bold text-white">
                        Confirm Cash Receipt:{' '}
                      </span>
                      I confirm that cash of{' '}
                      <strong className="text-emerald-400">
                        {formatFee(activeCompetition?.registrationFee)}
                      </strong>{' '}
                      has been received in full from{' '}
                      <span className="font-semibold text-white">
                        {participantName}
                      </span>
                      .
                    </div>
                  </label>
                </div>

                <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-400">
                    Status to Record:{' '}
                    <span className="text-emerald-400 font-bold">PAID</span>
                  </p>
                  <button
                    type="button"
                    disabled={submitting || !cashConfirmed}
                    onClick={handleCashPayment}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-40"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving Registration...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Confirm Cash Received &amp; Register</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 Footer Navigation */}
            <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={() => setStep('DETAILS')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Participant Details</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
