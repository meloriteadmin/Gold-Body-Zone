import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORY_GENDER_STYLES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_OPTIONS,
} from '../../constants/competitionOptions.js';

export function CategoryEditor({
  categories = [],
  onChange,
  competitionType = '',
  genderEligibility = 'ALL',
}) {
  const isWomensCompetition = competitionType === "Women's Competition";
  const isMaleOnlyCompetition =
    competitionType === 'Bodybuilding' ||
    competitionType === "Men's Physique" ||
    competitionType === 'Masters' ||
    genderEligibility === 'MALE_ONLY';

  const allowedCategoryTypeOptions = useMemo(() => {
    if (competitionType === 'Bodybuilding') {
      return [{ value: 'WEIGHT', label: 'Weight Category' }];
    }
    if (competitionType === "Men's Physique") {
      return [{ value: 'HEIGHT', label: 'Height Category' }];
    }
    if (competitionType === 'Masters' || competitionType === "Women's Competition") {
      return [{ value: 'OPEN', label: 'Open Category' }];
    }
    return CATEGORY_TYPE_OPTIONS;
  }, [competitionType]);

  const defaultCategoryType = useMemo(() => {
    if (competitionType === 'Bodybuilding') return 'WEIGHT';
    if (competitionType === "Men's Physique") return 'HEIGHT';
    if (competitionType === 'Masters' || competitionType === "Women's Competition") return 'OPEN';
    return 'WEIGHT';
  }, [competitionType]);

  const defaultGender = isWomensCompetition
    ? 'FEMALE'
    : 'MALE';

  const [categoryType, setCategoryType] = useState(defaultCategoryType);
  const [gender, setGender] = useState(defaultGender);
  const [name, setName] = useState('');
  const [ruleNote, setRuleNote] = useState('');

  // Track which category has its groups section expanded
  const [expandedGroupsCatIndex, setExpandedGroupsCatIndex] = useState(null);

  // Category Edit state
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState({
    categoryType: defaultCategoryType,
    gender: defaultGender,
    name: '',
    ruleNote: '',
  });

  // Group add/edit draft states
  const [newGroupNames, setNewGroupNames] = useState({});
  const [editingGroup, setEditingGroup] = useState({
    catIndex: null,
    groupIndex: null,
    name: '',
  });

  useEffect(() => {
    if (competitionType === 'Bodybuilding') {
      setCategoryType('WEIGHT');
      setGender('MALE');
    } else if (competitionType === "Men's Physique") {
      setCategoryType('HEIGHT');
      setGender('MALE');
    } else if (competitionType === 'Masters') {
      setCategoryType('OPEN');
      setGender('MALE');
    } else if (competitionType === "Women's Competition") {
      setCategoryType('OPEN');
      setGender('FEMALE');
    } else if (isMaleOnlyCompetition) {
      setGender('MALE');
    }
  }, [competitionType, isMaleOnlyCompetition]);

  const handleAddCategory = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const catGender = isWomensCompetition ? 'FEMALE' : 'MALE';
    const catType = allowedCategoryTypeOptions[0]?.value || categoryType;

    onChange([
      ...categories,
      {
        categoryType: catType,
        gender: catGender,
        name: trimmed,
        ruleNote: ruleNote.trim() || null,
        sortOrder: categories.length + 1,
        groups: [],
      },
    ]);
    setName('');
    setRuleNote('');
  };

  const startEditCategory = (index, cat) => {
    setEditingIndex(index);
    setEditDraft({
      categoryType: allowedCategoryTypeOptions[0]?.value || cat.categoryType || 'OPEN',
      gender: isWomensCompetition ? 'FEMALE' : 'MALE',
      name: cat.name || '',
      ruleNote: cat.ruleNote || '',
    });
  };

  const saveEditCategory = () => {
    const trimmed = editDraft.name.trim();
    if (!trimmed) return;
    onChange(
      categories.map((cat, idx) =>
        idx === editingIndex
          ? {
              ...cat,
              categoryType: allowedCategoryTypeOptions[0]?.value || editDraft.categoryType,
              gender: isWomensCompetition ? 'FEMALE' : 'MALE',
              name: trimmed,
              ruleNote: editDraft.ruleNote.trim() || null,
            }
          : cat
      )
    );
    setEditingIndex(null);
  };

  const handleRemoveCategory = (index) => {
    onChange(
      categories
        .filter((_, idx) => idx !== index)
        .map((cat, idx) => ({ ...cat, sortOrder: idx + 1 }))
    );
    if (editingIndex === index) setEditingIndex(null);
    if (expandedGroupsCatIndex === index) setExpandedGroupsCatIndex(null);
  };

  // Group Management Functions
  const handleAddGroup = (catIndex) => {
    const groupName = (newGroupNames[catIndex] || '').trim();
    if (!groupName) return;

    const targetCat = categories[catIndex];
    if (!targetCat) return;

    const existingGroups = targetCat.groups || [];
    const updatedGroups = [
      ...existingGroups,
      {
        name: groupName,
        sortOrder: existingGroups.length + 1,
      },
    ];

    onChange(
      categories.map((cat, idx) =>
        idx === catIndex ? { ...cat, groups: updatedGroups } : cat
      )
    );

    setNewGroupNames((prev) => ({ ...prev, [catIndex]: '' }));
  };

  const startEditGroup = (catIndex, groupIndex, group) => {
    setEditingGroup({
      catIndex,
      groupIndex,
      name: group.name || '',
    });
  };

  const saveEditGroup = (catIndex, groupIndex) => {
    const trimmed = editingGroup.name.trim();
    if (!trimmed) return;

    const targetCat = categories[catIndex];
    if (!targetCat) return;

    const updatedGroups = (targetCat.groups || []).map((g, gIdx) =>
      gIdx === groupIndex ? { ...g, name: trimmed } : g
    );

    onChange(
      categories.map((cat, idx) =>
        idx === catIndex ? { ...cat, groups: updatedGroups } : cat
      )
    );

    setEditingGroup({ catIndex: null, groupIndex: null, name: '' });
  };

  const handleDeleteGroup = (catIndex, groupIndex) => {
    const targetCat = categories[catIndex];
    if (!targetCat) return;

    const updatedGroups = (targetCat.groups || [])
      .filter((_, gIdx) => gIdx !== groupIndex)
      .map((g, gIdx) => ({ ...g, sortOrder: gIdx + 1 }));

    onChange(
      categories.map((cat, idx) =>
        idx === catIndex ? { ...cat, groups: updatedGroups } : cat
      )
    );

    if (
      editingGroup.catIndex === catIndex &&
      editingGroup.groupIndex === groupIndex
    ) {
      setEditingGroup({ catIndex: null, groupIndex: null, name: '' });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-[#171717] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold tracking-wider text-white uppercase">
            Categories & Groups ({categories.length})
          </span>
          <p className="mt-0.5 text-[11px] text-[#A1A1AA]">
            Customize categories and divisions for this specific competition.
          </p>
        </div>
        {isWomensCompetition && (
          <span className="rounded-md border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-pink-300 uppercase">
            Women's Open Only
          </span>
        )}
        {isMaleOnlyCompetition && (
          <span className="rounded-md border border-[#F15A24]/30 bg-[#F15A24]/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#F15A24] uppercase">
            Male Only
          </span>
        )}
      </div>

      {/* Add Category Controls */}
      <div className="rounded-lg border border-white/[0.08] bg-[#1e1e1e] p-3">
        <p className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
          Add New Category
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <select
            value={categoryType}
            onChange={(e) => {
              const nextType = e.target.value;
              setCategoryType(nextType);
              if (nextType === 'OPEN' && !name.trim()) {
                setName(competitionType === 'Masters' ? 'Masters Open' : isWomensCompetition ? 'Women Open' : 'Open Category');
              }
            }}
            disabled={allowedCategoryTypeOptions.length === 1}
            className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-2 text-xs text-white focus:border-[#F15A24] focus:outline-none disabled:opacity-85 sm:col-span-3"
            aria-label="Category type"
          >
            {allowedCategoryTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-lg border border-white/10 bg-[#222222] px-2.5 py-2 text-xs font-semibold text-zinc-300 sm:col-span-2">
            {isWomensCompetition ? 'Female' : 'Male'}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCategory();
              }
            }}
            placeholder={
              competitionType === 'Bodybuilding'
                ? 'e.g. 55–65 kg, 85–100 kg'
                : competitionType === "Men's Physique"
                  ? 'e.g. Under 175 cm, Above 175 cm'
                  : competitionType === 'Masters'
                    ? 'e.g. Masters Open'
                    : isWomensCompetition
                      ? 'e.g. Women Open, Bikini Open'
                      : 'Category name'
            }
            className="rounded-lg border border-white/10 bg-[#222222] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none sm:col-span-4"
          />

          <input
            type="text"
            value={ruleNote}
            onChange={(e) => setRuleNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCategory();
              }
            }}
            placeholder="Rule note (optional)"
            className="rounded-lg border border-white/10 bg-[#222222] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none sm:col-span-2"
          />

          <button
            type="button"
            onClick={handleAddCategory}
            disabled={!name.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-[#F15A24] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#E94B16] disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1"
            aria-label="Add category"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Category List */}
      {categories.length === 0 ? (
        <p className="py-4 text-center text-xs text-[#A1A1AA]">
          No categories configured yet. Add categories above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {categories.map((cat, index) => {
            const isEditing = editingIndex === index;
            const groups = cat.groups || [];
            const isExpanded =
              expandedGroupsCatIndex === index || groups.length > 0;

            return (
              <li
                key={cat.id || `${cat.name}-${index}`}
                className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#222222] transition-colors"
              >
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-12 sm:items-center">
                    <select
                      value={editDraft.categoryType}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          categoryType: e.target.value,
                        }))
                      }
                      disabled={allowedCategoryTypeOptions.length === 1}
                      className="rounded-md border border-white/15 bg-[#171717] px-2 py-1.5 text-xs text-white focus:border-[#F15A24] focus:outline-none disabled:opacity-85 sm:col-span-3"
                    >
                      {allowedCategoryTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <div className="text-xs font-semibold text-zinc-300 sm:col-span-2">
                      {isWomensCompetition ? 'Female' : 'Male'}
                    </div>

                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="rounded-md border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-4"
                    />

                    <input
                      type="text"
                      value={editDraft.ruleNote}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          ruleNote: e.target.value,
                        }))
                      }
                      placeholder="Rule note"
                      className="rounded-md border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none sm:col-span-2"
                    />

                    <div className="flex items-center justify-end gap-1 sm:col-span-1">
                      <button
                        type="button"
                        onClick={saveEditCategory}
                        className="rounded-md bg-emerald-500/20 p-1.5 text-emerald-300 hover:bg-emerald-500/30"
                        aria-label="Save category"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="rounded-md bg-white/5 p-1.5 text-[#A1A1AA] hover:text-white"
                        aria-label="Cancel category edit"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                            CATEGORY_GENDER_STYLES[cat.gender] ||
                            CATEGORY_GENDER_STYLES.OPEN
                          }`}
                        >
                          {cat.gender}
                        </span>
                        <span className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
                          {CATEGORY_TYPE_LABELS[cat.categoryType] || 'Open'}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {cat.name}
                        </span>
                        {cat.ruleNote && (
                          <span className="text-[11px] text-[#A1A1AA]">
                            · {cat.ruleNote}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroupsCatIndex(
                              expandedGroupsCatIndex === index ? null : index
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors hover:border-[#F15A24]/40 hover:text-white"
                        >
                          <Layers className="h-3 w-3 text-[#F15A24]" />
                          <span>{groups.length} Groups/Divisions</span>
                          {expandedGroupsCatIndex === index ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditCategory(index, cat)}
                          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-white/5 hover:text-[#F15A24]"
                          aria-label={`Edit ${cat.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(index)}
                          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-red-500/10 hover:text-red-400"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Nested Groups / Divisions Section */}
                    {isExpanded && (
                      <div className="mt-3 border-t border-white/[0.06] pt-3 pl-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
                            Groups / Divisions in "{cat.name}"
                          </span>
                        </div>

                        {/* Existing Groups in Category */}
                        {groups.length > 0 ? (
                          <div className="mb-2.5 flex flex-wrap gap-2">
                            {groups.map((group, gIdx) => {
                              const isEditingThisGroup =
                                editingGroup.catIndex === index &&
                                editingGroup.groupIndex === gIdx;

                              return isEditingThisGroup ? (
                                <div
                                  key={group.id || `group-edit-${gIdx}`}
                                  className="flex items-center gap-1 rounded-lg border border-[#F15A24]/50 bg-[#171717] px-2 py-1"
                                >
                                  <input
                                    type="text"
                                    value={editingGroup.name}
                                    onChange={(e) =>
                                      setEditingGroup((prev) => ({
                                        ...prev,
                                        name: e.target.value,
                                      }))
                                    }
                                    className="h-6 w-28 rounded bg-[#222222] px-1.5 text-xs text-white focus:outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => saveEditGroup(index, gIdx)}
                                    className="rounded p-1 text-emerald-400 hover:bg-emerald-500/20"
                                    aria-label="Save group name"
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingGroup({
                                        catIndex: null,
                                        groupIndex: null,
                                        name: '',
                                      })
                                    }
                                    className="rounded p-1 text-zinc-400 hover:text-white"
                                    aria-label="Cancel group edit"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  key={group.id || `group-${gIdx}`}
                                  className="group inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#171717] py-1 pr-1.5 pl-2.5 text-xs text-zinc-200"
                                >
                                  <span className="font-medium">
                                    {group.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditGroup(index, gIdx, group)
                                    }
                                    className="rounded p-0.5 text-zinc-400 opacity-60 transition-opacity hover:text-[#F15A24] group-hover:opacity-100"
                                    aria-label={`Edit ${group.name}`}
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteGroup(index, gIdx)
                                    }
                                    className="rounded p-0.5 text-zinc-400 opacity-60 transition-opacity hover:text-red-400 group-hover:opacity-100"
                                    aria-label={`Delete ${group.name}`}
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mb-2 text-[11px] text-zinc-500">
                            No groups or divisions added yet for this category.
                          </p>
                        )}

                        {/* Add Group Input */}
                        <div className="flex max-w-sm items-center gap-1.5">
                          <input
                            type="text"
                            value={newGroupNames[index] || ''}
                            onChange={(e) =>
                              setNewGroupNames((prev) => ({
                                ...prev,
                                [index]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddGroup(index);
                              }
                            }}
                            placeholder="Add group/division (e.g. Novice, Division A)"
                            className="h-7 w-full rounded-md border border-white/10 bg-[#171717] px-2 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddGroup(index)}
                            disabled={!(newGroupNames[index] || '').trim()}
                            className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-white/10 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#F15A24] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
