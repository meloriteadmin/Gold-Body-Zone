import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

/**
 * Format date for reports: "DD MMM YYYY, HH:mm IST"
 */
function formatReportDate(d) {
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
function getSourceLabel(reg) {
  const isManual = Boolean(
    reg.isManual || reg.payment?.verificationSource === 'ADMIN_MANUAL'
  );
  return isManual ? 'Manual' : 'Online';
}

/**
 * Normalizes payment method label
 */
function getPaymentMethodLabel(reg) {
  if (reg.paymentMethod) return reg.paymentMethod;
  if (reg.payment?.verificationSource === 'ADMIN_MANUAL') {
    return 'Cash';
  }
  if (reg.payment?.cashfreeOrderId) {
    return 'Online (Cashfree)';
  }
  return 'N/A';
}

/**
 * 1. CSV Generator
 */
export function generateRegistrationsCsv(competition, registrations, { sourceFilter = 'ALL', generatedAt = new Date() } = {}) {
  const competitionName = competition?.name || 'Competition';
  const formattedDate = formatReportDate(generatedAt);

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    `\uFEFF# IRONSTAGE COMPETITION MANAGEMENT SYSTEM`,
    `# Competition: ${escapeCsv(competitionName)}`,
    `# Export Date: ${escapeCsv(formattedDate)}`,
    `# Registration Source Filter: ${escapeCsv(sourceFilter)}`,
    `# Total Records: ${registrations.length}`,
    '',
    [
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
    ].map(escapeCsv).join(','),
  ];

  registrations.forEach((reg, index) => {
    const row = [
      index + 1,
      reg.participantName || '',
      reg.registrationCode || '',
      reg.mobileNumber || '',
      reg.email || '',
      reg.gender || '',
      competitionName,
      reg.category ? `${reg.category.gender}: ${reg.category.name}` : 'N/A',
      reg.groupName || reg.group?.name || 'N/A',
      formatReportDate(reg.createdAt),
      getSourceLabel(reg),
      getPaymentMethodLabel(reg),
      reg.paymentStatus || 'PENDING',
      reg.registrationStatus || 'PENDING',
      reg.payment?.amount ?? competition?.registrationFee ?? 0,
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

/**
 * 2. Excel (.xlsx) Generator
 */
export function generateRegistrationsExcel(competition, registrations, { sourceFilter = 'ALL', generatedAt = new Date() } = {}) {
  const competitionName = competition?.name || 'Competition';
  const formattedDate = formatReportDate(generatedAt);

  const rows = [
    ['IRONSTAGE COMPETITION MANAGEMENT SYSTEM - REGISTRATIONS REPORT'],
    [`Competition: ${competitionName}`, `Export Date: ${formattedDate}`],
    [`Source Filter: ${sourceFilter}`, `Total Records: ${registrations.length}`],
    [], // Blank separator
    [
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
    ],
  ];

  registrations.forEach((reg, index) => {
    rows.push([
      index + 1,
      reg.participantName || '',
      reg.registrationCode || '',
      reg.mobileNumber || '',
      reg.email || '',
      reg.gender || '',
      competitionName,
      reg.category ? `${reg.category.gender}: ${reg.category.name}` : 'N/A',
      reg.groupName || reg.group?.name || 'N/A',
      formatReportDate(reg.createdAt),
      getSourceLabel(reg),
      getPaymentMethodLabel(reg),
      reg.paymentStatus || 'PENDING',
      reg.registrationStatus || 'PENDING',
      Number(reg.payment?.amount ?? competition?.registrationFee ?? 0),
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set neat column widths
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

/**
 * 3. PDF Generator (Landscape A4 Table with Clean Ironstage Headers)
 */
export function generateRegistrationsPdf(competition, registrations, { sourceFilter = 'ALL', generatedAt = new Date() } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const competitionName = competition?.name || 'Competition';
      const formattedDate = formatReportDate(generatedAt);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 28,
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        resolve(result);
      });
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const leftMargin = 28;
      const contentWidth = pageWidth - leftMargin * 2; // ~785 pt

      // Header Banner
      doc.rect(leftMargin, 20, contentWidth, 54).fill('#171717');
      doc.fillColor('#F15A24').fontSize(14).font('Helvetica-Bold');
      doc.text('IRONSTAGE COMPETITION MANAGEMENT SYSTEM', leftMargin + 14, 28);

      doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold');
      doc.text(competitionName, leftMargin + 14, 46);

      doc.fillColor('#A1A1AA').fontSize(9).font('Helvetica');
      doc.text(
        `Exported: ${formattedDate}  |  Source: ${sourceFilter}  |  Total: ${registrations.length} Participant${registrations.length === 1 ? '' : 's'}`,
        leftMargin + 14,
        60
      );

      // Table layout definitions
      const startY = 86;
      let currentY = startY;
      const rowHeight = 22;

      const columns = [
        { header: '#', width: 28, align: 'center', key: 'srNo' },
        { header: 'Reg ID', width: 75, align: 'left', key: 'regCode' },
        { header: 'Participant Name', width: 130, align: 'left', key: 'name' },
        { header: 'Phone', width: 80, align: 'left', key: 'phone' },
        { header: 'Gender', width: 45, align: 'center', key: 'gender' },
        { header: 'Category', width: 120, align: 'left', key: 'category' },
        { header: 'Date', width: 95, align: 'left', key: 'date' },
        { header: 'Source', width: 55, align: 'center', key: 'source' },
        { header: 'Method', width: 65, align: 'center', key: 'method' },
        { header: 'Payment', width: 52, align: 'center', key: 'payment' },
        { header: 'Status', width: 40, align: 'center', key: 'status' },
      ];

      function drawTableHeader(y) {
        doc.rect(leftMargin, y, contentWidth, rowHeight).fill('#262626');
        doc.fillColor('#F15A24').fontSize(8.5).font('Helvetica-Bold');
        let x = leftMargin;
        for (const col of columns) {
          doc.text(col.header, x + 3, y + 6, {
            width: col.width - 6,
            align: col.align,
          });
          x += col.width;
        }
      }

      drawTableHeader(currentY);
      currentY += rowHeight;

      if (registrations.length === 0) {
        doc.fillColor('#71717A').fontSize(10).font('Helvetica');
        doc.text('No matching registrations found.', leftMargin, currentY + 14, {
          width: contentWidth,
          align: 'center',
        });
      } else {
        registrations.forEach((reg, index) => {
          // Page overflow check (A4 landscape height ~ 595pt)
          if (currentY + rowHeight > 540) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 });
            currentY = 28;
            drawTableHeader(currentY);
            currentY += rowHeight;
          }

          // Alternating row background
          if (index % 2 === 1) {
            doc.rect(leftMargin, currentY, contentWidth, rowHeight).fill('#1F1F1F');
          }

          doc.fillColor('#E4E4E7').fontSize(8).font('Helvetica');
          let x = leftMargin;

          const rowData = {
            srNo: String(index + 1),
            regCode: reg.registrationCode || '',
            name: reg.participantName || '',
            phone: reg.mobileNumber || '',
            gender: reg.gender ? reg.gender.slice(0, 1) : '',
            category: reg.category ? `${reg.category.gender?.slice(0, 1)}: ${reg.category.name}` : 'N/A',
            date: formatReportDate(reg.createdAt).slice(0, 11),
            source: getSourceLabel(reg),
            method: getPaymentMethodLabel(reg),
            payment: reg.paymentStatus || 'PENDING',
            status: reg.registrationStatus === 'CONFIRMED' ? 'CONF' : reg.registrationStatus || 'PEND',
          };

          for (const col of columns) {
            const val = rowData[col.key] || '';
            // Highlight payment status color
            if (col.key === 'payment') {
              if (val === 'PAID') doc.fillColor('#34D399');
              else if (val === 'FAILED') doc.fillColor('#F87171');
              else doc.fillColor('#FBBF24');
            } else if (col.key === 'source') {
              if (val === 'Manual') doc.fillColor('#60A5FA');
              else doc.fillColor('#A78BFA');
            } else if (col.key === 'regCode') {
              doc.fillColor('#F15A24');
            } else {
              doc.fillColor('#E4E4E7');
            }

            doc.text(val, x + 3, currentY + 6, {
              width: col.width - 6,
              align: col.align,
              lineBreak: false,
              ellipsis: true,
            });
            x += col.width;
          }

          // Row divider line
          doc.rect(leftMargin, currentY + rowHeight - 0.5, contentWidth, 0.5).fill('#2E2E2E');
          currentY += rowHeight;
        });
      }

      // Add page numbering on all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#71717A').fontSize(7.5).font('Helvetica');
        doc.text(
          `Page ${i + 1} of ${range.count}  —  Confidential IRONSTAGE Administrator Report`,
          leftMargin,
          565,
          { width: contentWidth, align: 'center' }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
