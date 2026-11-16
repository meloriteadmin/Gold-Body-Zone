import { useEffect, useMemo, useState } from 'react';
import {
  ImageOff,
  ImagePlus,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import {
  COMPETITION_TYPE_CONFIGS,
  FIXED_COMPETITION_TYPES,
  GENDER_ELIGIBILITY_OPTIONS,
} from '../../constants/competitionOptions.js';
import { CategoryEditor } from './CategoryEditor.jsx';
import { NEUTRAL_COMPETITION_POSTER } from '../../utils/competitionHelpers.js';
import { toDateInputValue } from '../../utils/formatters.js';

export function CompetitionFormModal({
  isOpen,
  editingCompetition,
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const [competitionType, setCompetitionType] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [venue, setVenue] = useState('');
  const [registrationFee, setRegistrationFee] = useState('');
  const [genderEligibility, setGenderEligibility] = useState('ALL');
  const [ageEligibility, setAgeEligibility] = useState('');
  const [categories, setCategories] = useState([]);
  const [isPublished, setIsPublished] = useState(false);

  const [posterFile, setPosterFile] = useState(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState('');
  const [isPosterRemoved, setIsPosterRemoved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (editingCompetition) {
      setName(editingCompetition.name || '');
      setCompetitionType(editingCompetition.competitionType || '');
      setDescription(editingCompetition.description || '');
      setEventDate(toDateInputValue(editingCompetition.eventDate));
      setRegistrationDeadline(
        toDateInputValue(editingCompetition.registrationDeadline)
      );
      setVenue(editingCompetition.venue || '');
      setRegistrationFee(
        editingCompetition.registrationFee !== null &&
          editingCompetition.registrationFee !== undefined
          ? String(editingCompetition.registrationFee)
          : ''
      );
      setGenderEligibility(editingCompetition.genderEligibility || 'ALL');
      setAgeEligibility(editingCompetition.ageEligibility || '');
      setCategories(editingCompetition.categories || []);
      setIsPublished(Boolean(editingCompetition.isPublished));
      setPosterFile(null);
      setPosterPreviewUrl(editingCompetition.posterUrl || '');
      setIsPosterRemoved(false);
      setError('');
      return;
    }

    // Default to first preset type: Bodybuilding
    const defaultType = FIXED_COMPETITION_TYPES[0] || 'Bodybuilding';
    const defaultConfig = COMPETITION_TYPE_CONFIGS[defaultType];

    setName(defaultConfig?.defaultName || '');
    setCompetitionType(defaultType);
    setDescription('');
    setEventDate('');
    setRegistrationDeadline('');
    setVenue('');
    setRegistrationFee('');
    setGenderEligibility(defaultConfig?.genderEligibility || 'ALL');
    setAgeEligibility(defaultConfig?.ageEligibility || '');
    setCategories(defaultConfig?.categories || []);
    setIsPublished(false);
    setPosterFile(null);
    setPosterPreviewUrl('');
    setIsPosterRemoved(false);
    setError('');
  }, [isOpen, editingCompetition]);

  useEffect(() => {
    return () => {
      if (posterPreviewUrl && posterPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(posterPreviewUrl);
      }
    };
  }, [posterPreviewUrl]);

  const availableGenderOptions = useMemo(() => {
    if (['Bodybuilding', "Men's Physique", 'Masters'].includes(competitionType)) {
      return [{ value: 'MALE_ONLY', label: 'Male Only' }];
    }
    if (competitionType === "Women's Competition") {
      return [{ value: 'FEMALE_ONLY', label: 'Female Only' }];
    }
    return GENDER_ELIGIBILITY_OPTIONS;
  }, [competitionType]);

  if (!isOpen) return null;

  const handleCompetitionTypeChange = (selectedType) => {
    setCompetitionType(selectedType);
    const config = COMPETITION_TYPE_CONFIGS[selectedType];
    if (config) {
      // Auto-populate default name if name was empty or matched a previous type default
      const prevTypeDefaults = Object.values(COMPETITION_TYPE_CONFIGS).map(
        (c) => c.defaultName
      );
      if (!name || prevTypeDefaults.includes(name)) {
        setName(config.defaultName);
      }
      setGenderEligibility(config.genderEligibility || 'ALL');
      setAgeEligibility(config.ageEligibility || '');
      setCategories(config.categories || []);
    }
  };

  const handlePosterSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Poster must be a JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Poster image must be 5 MB or smaller.');
      return;
    }

    if (posterPreviewUrl && posterPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(posterPreviewUrl);
    }

    setPosterFile(file);
    setPosterPreviewUrl(URL.createObjectURL(file));
    setError('');
  };

  const validateForm = () => {
    if (!competitionType.trim()) {
      return 'Please select a Competition Type.';
    }
    if (!name.trim()) {
      return 'Competition name is required.';
    }
    if (registrationFee !== '') {
      const feeNum = Number(registrationFee);
      if (Number.isNaN(feeNum) || feeNum < 0) {
        return 'Registration fee must be 0 or greater.';
      }
    }
    if (eventDate && registrationDeadline) {
      if (new Date(registrationDeadline) > new Date(eventDate)) {
        return 'Registration deadline cannot be after the competition date.';
      }
    }
    if (competitionType === 'Masters') {
      if (!ageEligibility.trim()) {
        setAgeEligibility('Above 40 years of age');
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        competitionType: competitionType.trim(),
        description: description.trim() || null,
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        registrationDeadline: registrationDeadline
          ? new Date(registrationDeadline).toISOString()
          : null,
        venue: venue.trim() || null,
        registrationFee:
          registrationFee !== '' ? Number(registrationFee) : null,
        genderEligibility,
        ageEligibility:
          competitionType === 'Masters'
            ? 'Above 40 years of age'
            : ageEligibility.trim() || null,
        isPublished: editingCompetition ? isPublished : false,
        categories: categories.map((cat, index) => ({
          ...(cat.id ? { id: cat.id } : {}),
          categoryType: cat.categoryType,
          gender: cat.gender,
          name: cat.name,
          ruleNote: cat.ruleNote || null,
          sortOrder: index + 1,
          groups: (cat.groups || []).map((grp, gIndex) => ({
            ...(grp.id ? { id: grp.id } : {}),
            name: grp.name,
            sortOrder: gIndex + 1,
          })),
        })),
      };

      await onSave(payload, {
        posterFile,
        removePoster: isPosterRemoved,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save competition.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
              {editingCompetition ? 'Edit Competition' : 'Add Competition'}
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              {editingCompetition
                ? 'Update competition settings and manage poster.'
                : 'Configure a new dynamic competition with preset categories and rules.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#A1A1AA] hover:bg-white/5 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
              >
                {error}
              </div>
            )}

            {/* Competition Type & Competition Name */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Competition Type *
                </label>
                <select
                  required
                  value={competitionType}
                  onChange={(e) => handleCompetitionTypeChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm font-semibold text-white focus:border-[#F15A24] focus:outline-none"
                >
                  <option value="">-- Select Competition Type * --</option>
                  {FIXED_COMPETITION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">
                  Reusable competition type with automatic category and eligibility rules.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Competition Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bodybuilding Championship 2026"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Competition overview, rules, weigh-in schedule..."
                className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
              />
            </div>

            {/* Dates, Fee */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Competition Date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white focus:border-[#F15A24] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Registration Deadline
                </label>
                <input
                  type="date"
                  value={registrationDeadline}
                  onChange={(e) => setRegistrationDeadline(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white focus:border-[#F15A24] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Registration Fee (INR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={registrationFee}
                  onChange={(e) => setRegistrationFee(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
              </div>
            </div>

            {/* Venue, Gender Eligibility, Age Eligibility */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Venue
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Arena / City"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Gender Eligibility
                </label>
                <select
                  value={genderEligibility}
                  onChange={(e) => setGenderEligibility(e.target.value)}
                  disabled={availableGenderOptions.length === 1}
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white focus:border-[#F15A24] focus:outline-none disabled:opacity-85"
                >
                  {availableGenderOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Age Eligibility
                </label>
                <input
                  type="text"
                  value={ageEligibility}
                  onChange={(e) => setAgeEligibility(e.target.value)}
                  placeholder="e.g. Above 40 years of age"
                  className="w-full rounded-xl border border-white/10 bg-[#222222] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                />
              </div>
            </div>

            {/* Categories & Groups Management */}
            <div>
              <CategoryEditor
                categories={categories}
                onChange={setCategories}
                competitionType={competitionType}
                genderEligibility={genderEligibility}
              />
            </div>

            {/* Poster Upload & Management */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                {editingCompetition
                  ? 'Competition Poster'
                  : 'Upload Competition Poster (Optional)'}
              </label>

              {editingCompetition ? (
                /* Edit Competition Poster Controls */
                isPosterRemoved ? (
                  <div className="flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-[#222222] p-4 sm:flex-row sm:items-center">
                    <div className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-amber-500/40 bg-[#171717] text-amber-500/70">
                      <ImageOff className="h-8 w-8" />
                      <span className="mt-2 text-[10px] font-semibold tracking-wider uppercase text-amber-400">
                        Poster Removed
                      </span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                        Poster marked for removal
                      </div>
                      <p className="text-xs font-semibold text-white">
                        Neutral placeholder will be displayed on the website
                      </p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        The poster reference will be cleared upon saving changes.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPosterRemoved(false);
                            setPosterPreviewUrl(
                              editingCompetition.posterUrl || ''
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-[#F15A24]" />
                          Undo Removal
                        </button>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-[#F15A24]" />
                          Upload New Poster
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              setIsPosterRemoved(false);
                              handlePosterSelect(e);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ) : posterPreviewUrl ? (
                  <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#222222] p-4 sm:flex-row sm:items-center">
                    <img
                      src={posterPreviewUrl}
                      alt="Poster preview"
                      className="h-36 w-28 rounded-lg border border-white/10 object-cover shadow-md"
                    />
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-semibold text-white">
                        {posterFile
                          ? `New Image Selected: ${posterFile.name}`
                          : 'Current Competition Poster'}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        {posterFile
                          ? `File size: ${(posterFile.size / (1024 * 1024)).toFixed(2)} MB. This image will replace the current poster upon saving.`
                          : 'Stored in Supabase Storage. You can replace it with a new file or remove it completely.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-[#F15A24]" />
                          Replace Poster
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePosterSelect}
                            className="hidden"
                          />
                        </label>

                        {posterFile ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                posterPreviewUrl &&
                                posterPreviewUrl.startsWith('blob:')
                              ) {
                                URL.revokeObjectURL(posterPreviewUrl);
                              }
                              setPosterFile(null);
                              setPosterPreviewUrl(
                                editingCompetition?.posterUrl || ''
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Discard Replacement
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsPosterRemoved(true);
                              setPosterFile(null);
                              setPosterPreviewUrl('');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-300 hover:border-red-500/60 hover:text-red-200 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            Remove Poster
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 rounded-xl border border-dashed border-white/15 bg-[#222222] p-4 sm:flex-row sm:items-center">
                    <div className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#171717] text-zinc-500">
                      <ImageOff className="h-8 w-8" />
                      <span className="mt-2 text-[10px] font-semibold tracking-wider uppercase text-zinc-400">
                        No Poster
                      </span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-semibold text-white">
                        No Poster Assigned
                      </p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        This competition currently has no poster. Public pages display a neutral placeholder. You can upload a poster at any time.
                      </p>
                      <div className="pt-1">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-[#F15A24]" />
                          Upload Poster
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePosterSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                /* Add Competition Poster Controls */
                posterPreviewUrl ? (
                  <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#222222] p-4 sm:flex-row sm:items-center">
                    <img
                      src={posterPreviewUrl}
                      alt="Selected poster preview"
                      className="h-36 w-28 rounded-lg border border-white/10 object-cover shadow-md"
                    />
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-semibold text-white">
                        Selected: {posterFile?.name || 'Poster image'}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        {posterFile
                          ? `File size: ${(posterFile.size / (1024 * 1024)).toFixed(2)} MB. `
                          : ''}
                        This image will be uploaded automatically to Supabase Storage and saved against this competition.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#F15A24]/50 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-[#F15A24]" />
                          Change Image
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePosterSelect}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              posterPreviewUrl &&
                              posterPreviewUrl.startsWith('blob:')
                            ) {
                              URL.revokeObjectURL(posterPreviewUrl);
                            }
                            setPosterFile(null);
                            setPosterPreviewUrl('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          Remove Selected Image
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#222222] px-6 py-8 text-center transition-colors hover:border-[#F15A24]/60">
                    <ImagePlus className="h-8 w-8 text-[#F15A24]" />
                    <p className="mt-2 text-xs font-bold text-white uppercase tracking-wider">
                      Upload Competition Poster
                    </p>
                    <p className="mt-1 text-[11px] text-[#A1A1AA]">
                      Click to select JPG, JPEG, PNG, or WebP up to 5 MB from your Mac.
                      <br />
                      If left empty, a neutral GOLD BODY ZONE placeholder will be displayed automatically.
                    </p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePosterSelect}
                      className="hidden"
                    />
                  </label>
                )
              )}
            </div>

            {/* Publication Status */}
            {editingCompetition ? (
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#222222] p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Publish Competition
                  </p>
                  <p className="text-xs text-[#A1A1AA]">
                    Published competitions are visible on the public website.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-5 w-5 accent-[#F15A24]"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#222222]/60 p-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-300">
                    Status: Draft
                  </p>
                  <p className="text-xs text-[#A1A1AA]">
                    New competitions are always created as Draft. You can explicitly publish the competition from its details page when ready.
                  </p>
                </div>
                <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-400 uppercase">
                  Draft
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] bg-[#101010] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-[#A1A1AA] hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-6 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-lg shadow-[#F15A24]/25 transition-all hover:brightness-110 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingCompetition ? 'Save Changes' : 'Create Competition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
