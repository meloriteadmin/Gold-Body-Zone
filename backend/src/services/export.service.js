import XLSX from 'xlsx';

export const EXPORT_HEADERS = [
  'Sr No',
  'Participant Name',
  'Registration ID',
  'Phone Number',
  'Email',
  'Gender',
  'Competition Name',
  'Category',
  'Group',
  'Registration Date',
  'Registration Source',
  'Payment Method',
  'Payment Status',
  'Registration Status',
  'Fee (INR)',
];

/**
 * Format date for reports: "DD MMM YYYY, HH:mm IST"
 */
export function formatReportDate(d) {
  if (!d) return 'N/A';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Normalizes registration source label
 */
export function getSourceLabel(reg) {
  const isManual = Boolean(
    reg.isManual || reg.payment?.verificationSource === 'ADMIN_MANUAL'
  );
  return isManual ? 'Manual' : 'Online';
}

/**
 * Normalizes payment method label
 */
export function getPaymentMethodLabel(reg) {
  if (reg.paymentMethod) return reg.paymentMethod;
  if (reg.payment?.paymentMode) return reg.payment.paymentMode;
  if (reg.payment?.verificationSource === 'ADMIN_MANUAL') {
    return 'Cash';
  }
  if (reg.payment?.cashfreeOrderId) {
    return 'Online (Cashfree)';
  }
  return 'N/A';
}

/**
 * Maps a single registration into the standard 15-column tuple
 */
function mapRegistrationRow(reg, index, competition) {
  const compName = reg.competition?.name || competition?.name || 'Competition';
  let categoryLabel = 'N/A';
  if (reg.category) {
    const genderPart = reg.category.gender ? `${reg.category.gender}: ` : '';
    categoryLabel = `${genderPart}${reg.category.name || ''}`.trim() || 'N/A';
  } else if (reg.categoryName) {
    categoryLabel = reg.categoryName;
  }

  const groupLabel = reg.groupName || reg.group?.name || 'N/A';
  const phone = reg.mobileNumber ? String(reg.mobileNumber) : '';
  const regCode = reg.registrationCode ? String(reg.registrationCode) : '';
  const fee = Number(
    reg.payment?.amount ??
      reg.competition?.registrationFee ??
      competition?.registrationFee ??
      0
  );

  return [
    index + 1,
    reg.participantName || '',
    regCode,
    phone,
    reg.email || '',
    reg.gender || '',
    compName,
    categoryLabel,
    groupLabel,
    formatReportDate(reg.createdAt),
    getSourceLabel(reg),
    getPaymentMethodLabel(reg),
    reg.paymentStatus || 'PENDING',
    reg.registrationStatus || 'PENDING',
    fee,
  ];
}

/**
 * 1. CSV Generator
 * - Column headings in Row 1
 * - No metadata, blank rows, or title rows
 * - Exactly N data rows for N registrations
 */
export function generateRegistrationsCsv(competition, registrations = [], _options = {}) {
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [EXPORT_HEADERS.map(escapeCsv).join(',')];

  registrations.forEach((reg, index) => {
    const row = mapRegistrationRow(reg, index, competition);
    lines.push(row.map(escapeCsv).join(','));
  });

  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

/**
 * 2. Excel (.xlsx) Generator
 * - Column headings in Row 1
 * - No metadata, blank rows, or title rows
 * - Exactly N data rows for N registrations
 */
export function generateRegistrationsExcel(competition, registrations = [], _options = {}) {
  const rows = [EXPORT_HEADERS];

  registrations.forEach((reg, index) => {
    rows.push(mapRegistrationRow(reg, index, competition));
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set clean column widths
  ws['!cols'] = [
    { wch: 8 },  // Sr No
    { wch: 26 }, // Participant Name
    { wch: 20 }, // Registration ID
    { wch: 16 }, // Phone Number
    { wch: 28 }, // Email
    { wch: 10 }, // Gender
    { wch: 26 }, // Competition Name
    { wch: 24 }, // Category
    { wch: 18 }, // Group
    { wch: 22 }, // Registration Date
    { wch: 18 }, // Source
    { wch: 18 }, // Payment Method
    { wch: 16 }, // Payment Status
    { wch: 18 }, // Registration Status
    { wch: 12 }, // Fee
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
