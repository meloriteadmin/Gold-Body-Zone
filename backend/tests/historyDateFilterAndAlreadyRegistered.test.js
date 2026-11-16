import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('History Date Range Filtering & Boundaries', () => {
  const competitions = [
    { id: 'c1', name: 'Event A', eventDate: '2026-11-10T00:00:00.000Z', isCompleted: true },
    { id: 'c2', name: 'Event B', eventDate: '2026-11-15T14:30:00.000Z', isCompleted: true },
    { id: 'c3', name: 'Event C', eventDate: '2026-11-20T23:59:59.000Z', isCompleted: true },
    { id: 'c4', name: 'Event D', eventDate: '2026-11-25T00:00:00.000Z', isCompleted: true },
  ];

  function filterByDates(comps, startDate, endDate) {
    return comps.filter((comp) => {
      if (startDate || endDate) {
        const compDateRaw = comp.eventDate || comp.completedAt;
        if (!compDateRaw) return false;

        const target = new Date(compDateRaw);
        if (Number.isNaN(target.getTime())) return false;

        const localY = target.getFullYear();
        const localM = String(target.getMonth() + 1).padStart(2, '0');
        const localD = String(target.getDate()).padStart(2, '0');
        const localYMD = `${localY}-${localM}-${localD}`;
        const utcYMD = target.toISOString().slice(0, 10);

        if (startDate) {
          const matchesStart = localYMD >= startDate || utcYMD >= startDate;
          if (!matchesStart) return false;
        }

        if (endDate) {
          const matchesEnd = localYMD <= endDate || utcYMD <= endDate;
          if (!matchesEnd) return false;
        }
      }
      return true;
    });
  }

  it('filters records starting from the selected date (From filter independently)', () => {
    const results = filterByDates(competitions, '2026-11-15', '');
    assert.deepEqual(
      results.map((c) => c.id),
      ['c2', 'c3', 'c4'],
      'Should include all events from 2026-11-15 onwards including the boundary date'
    );
  });

  it('includes records up to and including the selected date (To filter independently)', () => {
    const results = filterByDates(competitions, '', '2026-11-20');
    assert.deepEqual(
      results.map((c) => c.id),
      ['c1', 'c2', 'c3'],
      'Should include all events up to and including 2026-11-20'
    );
  });

  it('filters records within a bounded date range (both From and To filters together)', () => {
    const results = filterByDates(competitions, '2026-11-15', '2026-11-20');
    assert.deepEqual(
      results.map((c) => c.id),
      ['c2', 'c3'],
      'Should include events falling exactly on or between 2026-11-15 and 2026-11-20'
    );
  });

  it('includes single-day events when From and To are set to the same date', () => {
    const results = filterByDates(competitions, '2026-11-15', '2026-11-15');
    assert.deepEqual(
      results.map((c) => c.id),
      ['c2'],
      'Should match event on that exact day'
    );
  });

  it('returns all records when neither filter is set', () => {
    const results = filterByDates(competitions, '', '');
    assert.equal(results.length, 4);
  });
});

describe('Already Registered & Duplicate Prevention Logic', () => {
  const registrations = [
    {
      id: 'reg-paid',
      competitionId: 'comp-1',
      email: 'athlete@example.com',
      mobileNumber: '9876543210',
      registrationStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    },
    {
      id: 'reg-pending',
      competitionId: 'comp-1',
      email: 'pending@example.com',
      mobileNumber: '9123456789',
      registrationStatus: 'PENDING',
      paymentStatus: 'PENDING',
    },
  ];

  function evaluateRegistration(reg) {
    if (!reg) return { status: 'open', canRegister: true };
    const isPaid = reg.paymentStatus === 'PAID' && reg.registrationStatus === 'CONFIRMED';
    const isPending = reg.paymentStatus === 'PENDING' || reg.paymentStatus === 'FAILED';
    if (isPaid) {
      return { status: 'already_registered', canRegister: false, canRetryPayment: false };
    }
    if (isPending) {
      return { status: 'retry_payment', canRegister: false, canRetryPayment: true };
    }
    return { status: 'open', canRegister: true };
  }

  it('shows Already Registered and prevents duplicate registration when participant has paid', () => {
    const reg = registrations.find((r) => r.email === 'athlete@example.com');
    const outcome = evaluateRegistration(reg);
    assert.equal(outcome.status, 'already_registered');
    assert.equal(outcome.canRegister, false);
    assert.equal(outcome.canRetryPayment, false);
  });

  it('allows participant to retry payment when payment is pending or failed', () => {
    const reg = registrations.find((r) => r.email === 'pending@example.com');
    const outcome = evaluateRegistration(reg);
    assert.equal(outcome.status, 'retry_payment');
    assert.equal(outcome.canRetryPayment, true);
    assert.equal(outcome.canRegister, false);
  });

  it('shows Register Now for participants with no existing registration', () => {
    const reg = registrations.find((r) => r.email === 'new@example.com');
    const outcome = evaluateRegistration(reg);
    assert.equal(outcome.status, 'open');
    assert.equal(outcome.canRegister, true);
  });
});
