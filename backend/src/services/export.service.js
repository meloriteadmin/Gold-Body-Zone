import ExcelJS from 'exceljs';

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
    // Spreadsheet apps can evaluate formulas in CSV cells supplied by participants.
    const raw = String(val);
    const str = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? `'${raw}` : raw;
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
export async function generateRegistrationsExcel(competition, registrations = [], _options = {}) {
  const rows = [EXPORT_HEADERS];

  registrations.forEach((reg, index) => {
    rows.push(mapRegistrationRow(reg, index, competition));
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Registrations');
  rows.forEach((row) => ws.addRow(row));

  // Set clean column widths
  [8, 26, 20, 16, 28, 10, 26, 24, 18, 22, 18, 18, 16, 18, 12]
    .forEach((width, index) => { ws.getColumn(index + 1).width = width; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const TRUNK_NUMBER_HEADERS = [
  'Trunk Number',
  'Candidate Name',
  'Registration ID',
  'Category',
  'Group',
  'Gender',
  'Age',
  'Mobile Number',
  'District',
  'Representing',
  'Gym Name',
  'Registration Date',
  'Registration Status',
  'Payment Status',
];

/**
 * 3. Trunk Numbers Excel (.xlsx) Generator
 * - Column headings in Row 1
 * - Sorted by Trunk Number ascending (unassigned candidates at the end)
 * - Contains candidate details and assigned trunk numbers
 */
export function generateTrunkNumbersExcel(competition, registrations = []) {
  const rows = [TRUNK_NUMBER_HEADERS];

  const sorted = [...registrations].sort((a, b) => {
    const numA = a.trunkNumber !== null && a.trunkNumber !== undefined ? a.trunkNumber : 999999;
    const numB = b.trunkNumber !== null && b.trunkNumber !== undefined ? b.trunkNumber : 999999;
    if (numA !== numB) return numA - numB;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  sorted.forEach((reg) => {
    const categoryLabel = reg.category
      ? `${reg.category.gender || ''} - ${reg.category.name || ''}`.replace(/^[\s-]+|[\s-]+$/g, '')
      : 'Open';
    const groupLabel = reg.group?.name || reg.groupName || 'None';
    const repType = reg.representingType === 'INDIVIDUAL' ? 'Individual' : 'Gym';
    const gym = reg.representingType === 'INDIVIDUAL' ? '—' : reg.gymName || '—';

    rows.push([
      reg.trunkNumber !== null && reg.trunkNumber !== undefined ? reg.trunkNumber : 'Unassigned',
      reg.participantName || '',
      reg.registrationCode || reg.id || '',
      categoryLabel,
      groupLabel,
      reg.gender || '',
      reg.age !== null && reg.age !== undefined ? reg.age : '',
      reg.mobileNumber || '',
      reg.district || '',
      repType,
      gym,
      formatReportDate(reg.createdAt),
      reg.registrationStatus || 'PENDING',
      reg.paymentStatus || 'PENDING',
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 14 }, // Trunk Number
    { wch: 26 }, // Candidate Name
    { wch: 20 }, // Registration ID
    { wch: 24 }, // Category
    { wch: 18 }, // Group
    { wch: 10 }, // Gender
    { wch: 8 },  // Age
    { wch: 16 }, // Mobile Number
    { wch: 18 }, // District
    { wch: 14 }, // Representing
    { wch: 24 }, // Gym Name
    { wch: 22 }, // Registration Date
    { wch: 18 }, // Registration Status
    { wch: 16 }, // Payment Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Trunk Numbers');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
