import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/orders/sessions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          action: 'custom',
          channel: 'qrcode',
          cf_payment_id: 'cf_pay_mock_123',
          data: {
            payload: {
              qrcode:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            },
          },
        }),
      };
    }
    if (urlStr.includes('/orders')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          order_id: 'CF-TEST-123',
          order_status: 'ACTIVE',
          payment_session_id: 'session_mock_123',
        }),
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    };
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

let mockRegistrations = [];
let mockPayments = [];
let mockCompetition = null;

globalThis.__prisma = {
  competition: {
    async findUnique({ where }) {
      if (where.id === mockCompetition?.id) {
        return mockCompetition;
      }
      return null;
    },
    async count({ where } = {}) {
      if (where?.isCompleted === true) return 1;
      if (where?.isPublished === true) return 1;
      return 2;
    },
    async findMany() {
      return mockCompetition ? [mockCompetition] : [];
    },
  },
  registration: {
    async findUnique({ where }) {
      if (where.competitionId_email) {
        const { competitionId, email } = where.competitionId_email;
        return (
          mockRegistrations.find(
            (r) => r.competitionId === competitionId && r.email === email
          ) || null
        );
      }
      if (where.id) {
        return mockRegistrations.find((r) => r.id === where.id) || null;
      }
      return null;
    },
    async count({ where } = {}) {
      let filtered = mockRegistrations;
      if (where?.isManual !== undefined) {
        filtered = filtered.filter((r) => Boolean(r.isManual) === where.isManual);
      }
      return filtered.length;
    },
    async findMany({ where } = {}) {
      let filtered = mockRegistrations;
      if (where?.isManual !== undefined) {
        filtered = filtered.filter((r) => Boolean(r.isManual) === where.isManual);
      }
      return filtered;
    },
    async create({ data }) {
      const regId = 'reg-manual-' + (mockRegistrations.length + 1);
      const newReg = {
        id: regId,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        competition: {
          id: mockCompetition.id,
          name: mockCompetition.name,
          competitionType: mockCompetition.competitionType,
          registrationFee: mockCompetition.registrationFee,
        },
        category: {
          id: data.categoryId,
          name: '65-75 kg',
          gender: 'MALE',
          categoryType: 'WEIGHT',
        },
        group: null,
        payment: data.payment?.create
          ? {
              id: 'pay-manual-' + (mockPayments.length + 1),
              registrationId: regId,
              ...data.payment.create,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null,
      };
      mockRegistrations.push(newReg);
      if (newReg.payment) mockPayments.push(newReg.payment);
      return newReg;
    },
    async delete() {
      return {};
    },
    async update({ where, data }) {
      const idx = mockRegistrations.findIndex((r) => r.id === where.id);
      if (idx !== -1) {
        const existing = mockRegistrations[idx];
        const updated = {
          ...existing,
          ...data,
          updatedAt: new Date(),
          payment: data.payment?.create
            ? {
                id: 'pay-manual-' + (mockPayments.length + 1),
                registrationId: existing.id,
                ...data.payment.create,
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : existing.payment,
        };
        mockRegistrations[idx] = updated;
        if (updated.payment) mockPayments.push(updated.payment);
        return updated;
      }
      return {};
    },
    async updateMany() {
      return { count: 1 };
    },
  },
  payment: {
    async deleteMany() {
      return {};
    },
  },
  $transaction(callback) {
    return callback(globalThis.__prisma);
  },
};

const {
  createManualRegistration,
  listRegistrations,
  exportRegistrations,
} = await import('../src/controllers/adminRegistrations.controller.js');

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

describe('Admin Manual Registration & Offline Payments', () => {
  beforeEach(() => {
    mockRegistrations = [];
    mockPayments = [];
    mockCompetition = {
      id: 'comp-bodybuilding',
      slug: 'bodybuilding',
      name: 'State Bodybuilding',
      competitionType: 'Bodybuilding',
      registrationFee: 500,
      genderEligibility: 'MALE_ONLY',
      ageEligibility: null,
      isPublished: true,
      isCompleted: false,
      categories: [
        {
          id: 'cat-weight-1',
          name: '65-75 kg',
          categoryType: 'WEIGHT',
          gender: 'MALE',
          groups: [],
        },
      ],
    };
  });

  it('creates manual registration with Cash payment and marks PAID without Cashfree order', async () => {
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Vikas Patil',
          email: 'vikas.patil@example.com',
          mobileNumber: '9876543210',
          gender: 'MALE',
          age: 26,
          heightCm: 172,
          weightKg: 70,
          district: 'Nashik',
          representingType: 'GYM',
          gymName: 'Muscle Factory',
          paymentMethod: 'CASH',
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    assert.equal(err, null);
    assert.equal(res.statusCode, 201);
    assert.ok(res.payload?.registration);
    const reg = res.payload.registration;
    assert.equal(reg.participantName, 'Vikas Patil');
    assert.equal(reg.paymentStatus, 'PAID');
    assert.equal(reg.registrationStatus, 'CONFIRMED');
    assert.equal(reg.isManual, true);
    assert.equal(reg.paymentMethod, 'CASH');
    assert.equal(reg.payment.cashfreeOrderId, null);
    assert.equal(reg.payment.verificationSource, 'ADMIN_MANUAL');
  });

  it('creates manual registration with UPI payment and generates Cashfree Dynamic QR', async () => {
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Amit Deshmukh',
          email: 'amit.deshmukh@example.com',
          mobileNumber: '9876543211',
          gender: 'MALE',
          age: 24,
          heightCm: 175,
          weightKg: 72,
          district: 'Pune',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'UPI',
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    assert.equal(err, null);
    assert.equal(res.statusCode, 201);
    const reg = res.payload.registration;
    assert.equal(reg.paymentStatus, 'PENDING');
    assert.equal(reg.registrationStatus, 'PENDING');
    assert.equal(reg.isManual, true);
    assert.equal(reg.source, 'MANUAL');
    assert.equal(reg.paymentMethod, 'UPI');
    assert.ok(reg.payment.cashfreeOrderId);
    assert.ok(reg.payment.cashfreeOrderId.startsWith('CF-'));
    assert.ok(res.payload.upiQr);
    assert.equal(res.payload.upiQr.orderId, reg.payment.cashfreeOrderId);
    assert.equal(res.payload.upiQr.amount, 500);
    assert.ok(res.payload.upiQr.qrDataUrl.startsWith('data:image/'));
  });

  it('creates manual registration with Pending payment and marks PENDING without Cashfree order', async () => {
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Sanjay Shinde',
          email: 'sanjay.shinde@example.com',
          mobileNumber: '9876543212',
          gender: 'MALE',
          age: 28,
          heightCm: 178,
          weightKg: 74,
          district: 'Thane',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'PENDING',
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    assert.equal(err, null);
    assert.equal(res.statusCode, 201);
    const reg = res.payload.registration;
    assert.equal(reg.paymentStatus, 'PENDING');
    assert.equal(reg.registrationStatus, 'PENDING');
    assert.equal(reg.isManual, true);
    assert.equal(reg.paymentMethod, 'PENDING');
    assert.equal(reg.payment.cashfreeOrderId, null);
  });

  it('rejects manual registration with invalid payment method', async () => {
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Test Athlete',
          email: 'test@example.com',
          mobileNumber: '9876543210',
          gender: 'MALE',
          age: 25,
          district: 'Pune',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'INVALID_GATEWAY',
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    assert.ok(err);
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /Invalid payment method/i);
  });

  it('records offline payment with reference and marks PAID when admin confirms', async () => {
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Rajesh Kulkarni',
          email: 'rajesh.k@example.com',
          mobileNumber: '9876543233',
          gender: 'MALE',
          age: 27,
          heightCm: 176,
          weightKg: 73,
          district: 'Nashik',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'OFFLINE',
          offlinePaymentMethod: 'Bank Transfer (IMPS)',
          paymentReference: 'UTR99887766',
          offlineConfirmed: true,
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    assert.equal(err, null);
    assert.equal(res.statusCode, 201);
    const reg = res.payload.registration;
    assert.equal(reg.participantName, 'Rajesh Kulkarni');
    assert.equal(reg.paymentStatus, 'PAID');
    assert.equal(reg.registrationStatus, 'CONFIRMED');
    assert.equal(reg.paymentMethod, 'Bank Transfer (IMPS)');
    assert.equal(reg.payment.verificationSource, 'ADMIN_OFFLINE (UTR99887766)');
  });

  it('reuses existing pending registration on retry without creating duplicate', async () => {
    // First: create pending online UPI registration
    const res1 = createMockRes();
    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Kiran Shinde',
          email: 'kiran.s@example.com',
          mobileNumber: '9876543244',
          gender: 'MALE',
          age: 25,
          heightCm: 174,
          weightKg: 71,
          district: 'Pune',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'UPI',
        },
      },
      res1,
      () => {}
    );

    const initialReg = res1.payload.registration;
    assert.equal(initialReg.paymentStatus, 'PENDING');
    assert.equal(initialReg.registrationStatus, 'PENDING');
    const initialCode = initialReg.registrationCode;

    // Second: retry / switch to offline cash payment for same participant
    const res2 = createMockRes();
    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Kiran Shinde',
          email: 'kiran.s@example.com',
          mobileNumber: '9876543244',
          gender: 'MALE',
          age: 25,
          heightCm: 174,
          weightKg: 71,
          district: 'Pune',
          representingType: 'INDIVIDUAL',
          paymentMethod: 'CASH',
        },
      },
      res2,
      () => {}
    );

    const updatedReg = res2.payload.registration;
    assert.equal(updatedReg.paymentStatus, 'PAID');
    assert.equal(updatedReg.registrationStatus, 'CONFIRMED');
    assert.equal(updatedReg.registrationCode, initialCode);
    assert.equal(mockRegistrations.filter((r) => r.email === 'kiran.s@example.com').length, 1);
  });

  it('rejects manual registration for a completed competition with 400 error', async () => {
    mockCompetition.isCompleted = true;
    const res = createMockRes();
    let err = null;

    await createManualRegistration(
      {
        body: {
          competitionId: 'comp-bodybuilding',
          categoryId: 'cat-weight-1',
          participantName: 'Late Athlete',
          email: 'late@example.com',
          mobileNumber: '9876543219',
          gender: 'MALE',
          age: 26,
          heightCm: 175,
          weightKg: 72,
          district: 'Pune',
          representing: 'INDIVIDUAL',
          paymentMethod: 'CASH',
        },
      },
      res,
      (e) => {
        err = e;
      }
    );

    mockCompetition.isCompleted = false;
    assert.ok(err);
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /completed competition/i);
  });

  it('filters registrations by source: ALL, ONLINE, and MANUAL', async () => {
    mockRegistrations = [
      {
        id: 'reg-online-1',
        registrationCode: 'REG-ONLINE-1',
        competitionId: 'comp-bodybuilding',
        participantName: 'Online Athlete',
        email: 'online@example.com',
        mobileNumber: '9999999991',
        gender: 'MALE',
        age: 25,
        district: 'Nashik',
        isManual: false,
        paymentStatus: 'PAID',
        registrationStatus: 'CONFIRMED',
        createdAt: new Date(),
        updatedAt: new Date(),
        competition: mockCompetition,
        category: mockCompetition.categories[0],
        group: null,
        payment: { amount: 500, status: 'PAID', cashfreeOrderId: 'CF-1' },
      },
      {
        id: 'reg-manual-1',
        registrationCode: 'REG-MANUAL-1',
        competitionId: 'comp-bodybuilding',
        participantName: 'Manual Athlete',
        email: 'manual@example.com',
        mobileNumber: '9999999992',
        gender: 'MALE',
        age: 26,
        district: 'Pune',
        isManual: true,
        paymentStatus: 'PAID',
        registrationStatus: 'CONFIRMED',
        createdAt: new Date(),
        updatedAt: new Date(),
        competition: mockCompetition,
        category: mockCompetition.categories[0],
        group: null,
        payment: { amount: 500, status: 'PAID', verificationSource: 'ADMIN_MANUAL' },
      },
    ];

    // Filter ALL
    const resAll = createMockRes();
    await listRegistrations({ query: { competitionId: 'comp-bodybuilding', source: 'ALL' } }, resAll, () => {});
    assert.equal(resAll.statusCode, 200);
    assert.equal(resAll.payload.registrations.length, 2);

    // Filter ONLINE
    const resOnline = createMockRes();
    await listRegistrations({ query: { competitionId: 'comp-bodybuilding', source: 'ONLINE' } }, resOnline, () => {});
    assert.equal(resOnline.statusCode, 200);
    assert.equal(resOnline.payload.registrations.length, 1);
    assert.equal(resOnline.payload.registrations[0].source, 'ONLINE');
    assert.equal(resOnline.payload.registrations[0].isManual, false);

    // Filter MANUAL
    const resManual = createMockRes();
    await listRegistrations({ query: { competitionId: 'comp-bodybuilding', source: 'MANUAL' } }, resManual, () => {});
    assert.equal(resManual.statusCode, 200);
    assert.equal(resManual.payload.registrations.length, 1);
    assert.equal(resManual.payload.registrations[0].source, 'MANUAL');
    assert.equal(resManual.payload.registrations[0].isManual, true);
  });

  it('exports registrations to CSV and Excel (Row 1 headings, no metadata banners, exactly N data rows)', async () => {
    function createExportMockRes() {
      return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, val) {
          this.headers[name] = val;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(data) {
          this.body = data;
          return this;
        },
      };
    }

    const XLSX = (await import('xlsx')).default || (await import('xlsx'));

    // Populate mock registrations with 2 records
    mockRegistrations = [
      {
        id: 'reg-export-1',
        participantName: 'Vikas Patil',
        registrationCode: 'GBZ-BB-001',
        mobileNumber: '9876543210',
        email: 'vikas@example.com',
        gender: 'MALE',
        competitionId: 'comp-bodybuilding',
        competition: { name: 'State Bodybuilding', registrationFee: 500 },
        category: { name: '65-75 kg', gender: 'MALE' },
        groupName: 'Group A',
        isManual: true,
        paymentStatus: 'PAID',
        registrationStatus: 'CONFIRMED',
        createdAt: new Date('2026-11-16T10:00:00Z'),
        payment: { amount: 500, verificationSource: 'ADMIN_MANUAL' },
      },
      {
        id: 'reg-export-2',
        participantName: 'Rahul Sharma',
        registrationCode: 'GBZ-BB-002',
        mobileNumber: '9123456780',
        email: 'rahul@example.com',
        gender: 'MALE',
        competitionId: 'comp-bodybuilding',
        competition: { name: 'State Bodybuilding', registrationFee: 500 },
        category: { name: '75-85 kg', gender: 'MALE' },
        groupName: 'Group B',
        isManual: false,
        paymentStatus: 'PAID',
        registrationStatus: 'CONFIRMED',
        createdAt: new Date('2026-11-16T11:00:00Z'),
        payment: { amount: 500, cashfreeOrderId: 'CF-123' },
      },
    ];

    const expectedHeaders = [
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

    // CSV with 2 records -> exactly 1 header line + 2 data lines = 3 lines
    const resCsv = createExportMockRes();
    await exportRegistrations({ query: { competitionId: 'comp-bodybuilding', format: 'csv', source: 'ALL' } }, resCsv, () => {});
    assert.equal(resCsv.statusCode, 200);
    assert.ok(resCsv.headers['Content-Disposition'].includes('.csv'));
    const csvLines = resCsv.body.toString('utf-8').trim().split('\r\n');
    assert.equal(csvLines.length, 3);
    assert.equal(csvLines[0], expectedHeaders.join(','));
    assert.ok(csvLines[1].includes('Vikas Patil'));
    assert.ok(csvLines[1].includes('9876543210'));
    assert.ok(csvLines[2].includes('Rahul Sharma'));

    // Excel (.xlsx) with 2 records -> exactly 1 header row + 2 data rows = 3 rows
    const resXlsx = createExportMockRes();
    await exportRegistrations({ query: { competitionId: 'comp-bodybuilding', format: 'xlsx', source: 'ALL' } }, resXlsx, () => {});
    assert.equal(resXlsx.statusCode, 200);
    assert.ok(resXlsx.headers['Content-Disposition'].includes('.xlsx'));
    assert.ok(Buffer.isBuffer(resXlsx.body));
    const wb = XLSX.read(resXlsx.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const excelRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    assert.equal(excelRows.length, 3);
    assert.deepEqual(excelRows[0], expectedHeaders);
    assert.equal(excelRows[1][1], 'Vikas Patil');
    assert.equal(excelRows[1][3], '9876543210');
    assert.equal(excelRows[2][1], 'Rahul Sharma');

    // PDF (.pdf) is rejected with 400
    let pdfErr = null;
    const resPdf = createExportMockRes();
    await exportRegistrations(
      { query: { competitionId: 'comp-bodybuilding', format: 'pdf', source: 'ALL' } },
      resPdf,
      (err) => {
        pdfErr = err;
      }
    );
    assert.ok(pdfErr);
    assert.equal(pdfErr.statusCode, 400);
    assert.ok(pdfErr.message.includes('Expected xlsx or csv'));
  });
});
