import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import XLSX from 'xlsx';
import {
  EXPORT_HEADERS,
  generateRegistrationsCsv,
  generateRegistrationsExcel,
} from '../src/services/export.service.js';

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

describe('Strict Registration Export Verification (Excel & CSV)', () => {
  const mockCompetition = {
    id: 'comp-masters-2026',
    name: 'Masters Bodybuilding Championship',
    registrationFee: 750,
  };

  const sampleReg1 = {
    id: 'reg-001',
    participantName: 'Yugandhara Patil',
    registrationCode: 'GBZ-MAS-001',
    mobileNumber: '9876543210',
    email: 'yugandhara@example.com',
    gender: 'FEMALE',
    createdAt: new Date('2026-11-16T14:30:00.000Z'),
    isManual: false,
    paymentStatus: 'PAID',
    registrationStatus: 'CONFIRMED',
    category: { name: 'Above 40 Years', gender: 'FEMALE' },
    groupName: 'Group Alpha',
    payment: {
      amount: 750,
      cashfreeOrderId: 'order_cf_12345',
      paymentMode: 'Online (Cashfree)',
    },
  };

  const sampleReg2 = {
    id: 'reg-002',
    participantName: 'Rahul Sharma',
    registrationCode: 'GBZ-MAS-002',
    mobileNumber: '09123456789',
    email: 'rahul@example.com',
    gender: 'MALE',
    createdAt: new Date('2026-11-16T15:45:00.000Z'),
    isManual: true,
    paymentStatus: 'PAID',
    registrationStatus: 'CONFIRMED',
    category: { name: 'Under 50 Years', gender: 'MALE' },
    groupName: 'Group Beta',
    payment: {
      amount: 750,
      verificationSource: 'ADMIN_MANUAL',
    },
  };

  it('has exactly 15 column headings', () => {
    assert.equal(EXPORT_HEADERS.length, 15);
    assert.deepEqual(EXPORT_HEADERS, [
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
    ]);
  });

  describe('Testing with 0 registrations', () => {
    it('exports CSV with Row 1 as headings and exactly 0 data rows', () => {
      const csvBuffer = generateRegistrationsCsv(mockCompetition, []);
      const csvContent = csvBuffer.toString('utf-8');
      const lines = csvContent.split('\r\n');

      assert.equal(lines.length, 1, 'CSV must have exactly 1 row (the header row)');
      assert.deepEqual(parseCsvLine(lines[0]), EXPORT_HEADERS);
      assert.ok(!csvContent.includes('GOLD BODY ZONE'), 'No title or metadata banner rows');
      assert.ok(!csvContent.includes('#'), 'No comment or metadata lines');
    });

    it('exports Excel with Row 1 as headings and exactly 0 data rows', () => {
      const xlsxBuffer = generateRegistrationsExcel(mockCompetition, []);
      const wb = XLSX.read(xlsxBuffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      assert.equal(rows.length, 1, 'Excel must have exactly 1 row (the header row)');
      assert.deepEqual(rows[0], EXPORT_HEADERS);
    });
  });

  describe('Testing with 1 registration', () => {
    it('exports CSV with Row 1 as headings and exactly 1 data row', () => {
      const csvBuffer = generateRegistrationsCsv(mockCompetition, [sampleReg1]);
      const csvContent = csvBuffer.toString('utf-8');
      const lines = csvContent.split('\r\n');

      assert.equal(lines.length, 2, 'CSV must have exactly 2 lines: 1 header + 1 data row');
      assert.deepEqual(parseCsvLine(lines[0]), EXPORT_HEADERS);

      const dataRow = parseCsvLine(lines[1]);
      assert.equal(dataRow.length, 15, 'Data row must have exactly 15 columns');
      assert.equal(dataRow[0], '1'); // Sr No
      assert.equal(dataRow[1], 'Yugandhara Patil'); // Participant Name
      assert.equal(dataRow[2], 'GBZ-MAS-001'); // Registration ID
      assert.equal(dataRow[3], '9876543210'); // Phone Number preserved
      assert.equal(dataRow[4], 'yugandhara@example.com'); // Email
      assert.equal(dataRow[5], 'FEMALE'); // Gender
      assert.equal(dataRow[6], 'Masters Bodybuilding Championship'); // Competition Name
      assert.equal(dataRow[7], 'FEMALE: Above 40 Years'); // Category
      assert.equal(dataRow[8], 'Group Alpha'); // Group
      assert.ok(dataRow[9].includes('2026'), 'Registration Date formatted');
      assert.equal(dataRow[10], 'Online'); // Registration Source
      assert.equal(dataRow[11], 'Online (Cashfree)'); // Payment Method
      assert.equal(dataRow[12], 'PAID'); // Payment Status
      assert.equal(dataRow[13], 'CONFIRMED'); // Registration Status
      assert.equal(dataRow[14], '750'); // Fee (INR)
    });

    it('exports Excel with Row 1 as headings and exactly 1 data row with all 15 columns correctly mapped', () => {
      const xlsxBuffer = generateRegistrationsExcel(mockCompetition, [sampleReg1]);
      const wb = XLSX.read(xlsxBuffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      assert.equal(rows.length, 2, 'Excel must have exactly 2 rows: 1 header + 1 data row');
      assert.deepEqual(rows[0], EXPORT_HEADERS);

      const row = rows[1];
      assert.equal(row.length, 15, 'Data row must have exactly 15 columns');
      assert.equal(row[0], 1); // Sr No
      assert.equal(row[1], 'Yugandhara Patil'); // Participant Name
      assert.equal(row[2], 'GBZ-MAS-001'); // Registration ID
      assert.equal(row[3], '9876543210'); // Phone Number preserved as string
      assert.equal(row[4], 'yugandhara@example.com'); // Email
      assert.equal(row[5], 'FEMALE'); // Gender
      assert.equal(row[6], 'Masters Bodybuilding Championship'); // Competition Name
      assert.equal(row[7], 'FEMALE: Above 40 Years'); // Category
      assert.equal(row[8], 'Group Alpha'); // Group
      assert.ok(row[9].includes('2026'), 'Registration Date');
      assert.equal(row[10], 'Online'); // Registration Source
      assert.equal(row[11], 'Online (Cashfree)'); // Payment Method
      assert.equal(row[12], 'PAID'); // Payment Status
      assert.equal(row[13], 'CONFIRMED'); // Registration Status
      assert.equal(row[14], 750); // Fee (INR)
    });
  });

  describe('Testing with 2 registrations', () => {
    it('exports CSV with Row 1 as headings and exactly 2 data rows', () => {
      const csvBuffer = generateRegistrationsCsv(mockCompetition, [sampleReg1, sampleReg2]);
      const csvContent = csvBuffer.toString('utf-8');
      const lines = csvContent.split('\r\n');

      assert.equal(lines.length, 3, 'CSV must have exactly 3 lines: 1 header + 2 data rows');
      assert.deepEqual(parseCsvLine(lines[0]), EXPORT_HEADERS);

      // Row 1
      const row1 = parseCsvLine(lines[1]);
      assert.equal(row1.length, 15);
      assert.equal(row1[0], '1');
      assert.equal(row1[1], 'Yugandhara Patil');
      assert.equal(row1[2], 'GBZ-MAS-001');
      assert.equal(row1[3], '9876543210');
      assert.equal(row1[10], 'Online');
      assert.equal(row1[11], 'Online (Cashfree)');

      // Row 2
      const row2 = parseCsvLine(lines[2]);
      assert.equal(row2.length, 15);
      assert.equal(row2[0], '2');
      assert.equal(row2[1], 'Rahul Sharma');
      assert.equal(row2[2], 'GBZ-MAS-002');
      assert.equal(row2[3], '09123456789'); // Leading zero preserved in CSV
      assert.equal(row2[10], 'Manual');
      assert.equal(row2[11], 'Cash');
      assert.equal(row2[14], '750');
    });

    it('exports Excel with Row 1 as headings and exactly 2 data rows', () => {
      const xlsxBuffer = generateRegistrationsExcel(mockCompetition, [sampleReg1, sampleReg2]);
      const wb = XLSX.read(xlsxBuffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      assert.equal(rows.length, 3, 'Excel must have exactly 3 rows: 1 header + 2 data rows');
      assert.deepEqual(rows[0], EXPORT_HEADERS);

      // Data Row 1
      assert.equal(rows[1].length, 15);
      assert.equal(rows[1][0], 1);
      assert.equal(rows[1][1], 'Yugandhara Patil');
      assert.equal(rows[1][2], 'GBZ-MAS-001');
      assert.equal(rows[1][3], '9876543210');
      assert.equal(rows[1][10], 'Online');

      // Data Row 2
      assert.equal(rows[2].length, 15);
      assert.equal(rows[2][0], 2);
      assert.equal(rows[2][1], 'Rahul Sharma');
      assert.equal(rows[2][2], 'GBZ-MAS-002');
      assert.equal(rows[2][3], '09123456789'); // Leading zero preserved as string
      assert.equal(rows[2][10], 'Manual');
      assert.equal(rows[2][11], 'Cash');
      assert.equal(rows[2][14], 750);
    });
  });
});
