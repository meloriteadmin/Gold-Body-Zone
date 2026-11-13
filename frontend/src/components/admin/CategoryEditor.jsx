import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  CATEGORY_GENDER_OPTIONS,
  CATEGORY_GENDER_STYLES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_OPTIONS,
} from '../../constants/competitionOptions.js';

export function CategoryEditor({ categories = [], onChange }) {
  const [categoryType, setCategoryType] = useState('WEIGHT');
  const [gender, setGender] = useState('MALE');
  const [name, setName] = useState('');
  const [ruleNote, setRuleNote] = useState('');

  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState({
    categoryType: 'WEIGHT',
    gender: 'MALE',
    name: '',
    ruleNote: '',
  });

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([
      ...categories,
      {
        categoryType,
        gender,
        name: trimmed,
        ruleNote: ruleNote.trim() || null,
        sortOrder: categories.length + 1,
      },
    ]);
    setName('');
    setRuleNote('');
  };

  const startEdit = (index, cat) => {
    setEditingIndex(index);
    setEditDraft({
      categoryType: cat.categoryType || 'OPEN',
      gender: cat.gender || 'OPEN',
      name: cat.name || '',
      ruleNote: cat.ruleNote || '',
    });
  };

  const saveEdit = () => {
    const trimmed = editDraft.name.trim();
    if (!trimmed) return;
    onChange(
      categories.map((cat, idx) =>
        idx === editingIndex
          ? {
              ...cat,
              categoryType: editDraft.categoryType,
              gender: editDraft.gender,
              name: trimmed,
              ruleNote: editDraft.ruleNote.trim() || null,
            }
          : cat
      )
    );
    setEditingIndex(null);
  };

  const handleRemove = (index) => {
    onChange(
      categories
        .filter((_, idx) => idx !== index)
        .map((cat, idx) => ({ ...cat, sortOrder: idx + 1 }))
    );
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-[#171717] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          Categories ({categories.length})
        </span>
      </div>

      {/* Add Category Controls */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <select
          value={categoryType}
          onChange={(e) => {
            const nextType = e.target.value;
            setCategoryType(nextType);
            if (nextType === 'OPEN' && !name.trim()) {
              setName('Open category');
            }
          }}
          className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-2 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-3"
          aria-label="Category type"
        >
          {CATEGORY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#222222] px-2.5 py-2 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-2"
          aria-label="Category gender"
        >
          {CATEGORY_GENDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="e.g. 55–65 kg, Under 175 cm, Open category"
          className="rounded-lg border border-white/10 bg-[#222222] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none sm:col-span-4"
        />

        <input
          type="text"
          value={ruleNote}
          onChange={(e) => setRuleNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Rule note (optional)"
          className="rounded-lg border border-white/10 bg-[#222222] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#F15A24] focus:outline-none sm:col-span-2"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-[#F15A24] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#E94B16] disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1"
          aria-label="Add category"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Category List */}
      {categories.length === 0 ? (
        <p className="py-3 text-center text-xs text-[#A1A1AA]">
          No categories added yet. Add Weight, Height, or Open categories above.
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((cat, index) => {
            const isEditing = editingIndex === index;
            return (
              <li
                key={cat.id || `${cat.name}-${index}`}
                className="rounded-lg border border-white/[0.08] bg-[#222222] px-3 py-2.5"
              >
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                    <select
                      value={editDraft.categoryType}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          categoryType: e.target.value,
                        }))
                      }
                      className="rounded-md border border-white/15 bg-[#171717] px-2 py-1.5 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-3"
                    >
                      {CATEGORY_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editDraft.gender}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          gender: e.target.value,
                        }))
                      }
                      className="rounded-md border border-white/15 bg-[#171717] px-2 py-1.5 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-2"
                    >
                      {CATEGORY_GENDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="rounded-md border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs text-white focus:border-[#F15A24] focus:outline-none sm:col-span-3"
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
                    <div className="flex items-center justify-end gap-1 sm:col-span-2">
                      <button
                        type="button"
                        onClick={saveEdit}
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
                      <span className="text-xs font-semibold text-white">
                        {cat.name}
                      </span>
                      {cat.ruleNote && (
                        <span className="text-[11px] text-[#A1A1AA]">
                          · {cat.ruleNote}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(index, cat)}
                        className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-white/5 hover:text-[#F15A24]"
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(index)}
                        className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
