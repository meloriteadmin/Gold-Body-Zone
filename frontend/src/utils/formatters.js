export function formatDate(value) {
  if (!value) return 'Not Set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not Set';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return 'Not Provided';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not Provided';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateInputValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function formatFee(value) {
  if (value === null || value === undefined || value === '') return 'Not Set';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 'Not Set';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numeric);
}
