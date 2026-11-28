// Measurement ranges are inferred only for categories that explicitly state a unit and bound.
export function categoryMatchesMeasurements(category, weightKg, heightCm) {
  const type = category.categoryType;
  if (type !== 'WEIGHT' && type !== 'HEIGHT') return true;
  const value = Number(type === 'WEIGHT' ? weightKg : heightCm);
  if (!Number.isFinite(value) || value <= 0) return true;
  const unit = type === 'WEIGHT' ? 'kg' : 'cm';
  const name = String(category.name || '').toLowerCase().replace(/[–—]/g, '-');
  if (!name.includes(unit)) return true;
  let match = name.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (match) return value >= Number(match[1]) && value <= Number(match[2]);
  match = name.match(/(?:under|below|upto|up to|less than|<)\s*(\d+(?:\.\d+)?)/);
  if (match) return value <= Number(match[1]);
  match = name.match(/(?:above|over|more than|>)\s*(\d+(?:\.\d+)?)/);
  if (match) return value > Number(match[1]);
  match = name.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (match) return value >= Number(match[1]);
  return true;
}

export function matchingCategory(categories, current, weightKg, heightCm) {
  if (categoryMatchesMeasurements(current, weightKg, heightCm)) return current;
  const matches = categories.filter((category) =>
    category.categoryType === current.categoryType &&
    category.gender === current.gender &&
    categoryMatchesMeasurements(category, weightKg, heightCm)
  );
  return matches.length === 1 ? matches[0] : null;
}
