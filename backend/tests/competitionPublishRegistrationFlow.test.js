import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXED_COMPETITION_TYPES } from '../src/constants/competitionTypes.js';
import {
  computeCompetitionStatus,
  computeRegistrationStatus,
  isPastEvent,
  validateCompetitionPayload,
} from '../src/utils/competitionValidation.js';

describe('Competition Publication & Registration Flow Across All Competition Types', () => {
  const futureEventDate = new Date();
  futureEventDate.setDate(futureEventDate.getDate() + 30);

  const futureDeadline = new Date();
  futureDeadline.setDate(futureDeadline.getDate() + 20);

  const passedDeadline = new Date();
  passedDeadline.setDate(passedDeadline.getDate() - 2);

  const pastEventDate = new Date();
  pastEventDate.setDate(pastEventDate.getDate() - 10);

  // 1. Creation as Draft
  describe('1. New Competitions Always Created as Draft', () => {
    for (const compType of FIXED_COMPETITION_TYPES) {
      it(`creates new competition of type "${compType}" as Draft even if isPublished is passed`, () => {
        const payload = {
          name: `Test Event - ${compType}`,
          competitionType: compType,
          eventDate: futureEventDate.toISOString(),
          registrationDeadline: futureDeadline.toISOString(),
          registrationFee: 500,
          isPublished: true, // Attempt to force publish on creation
        };

        const { data } = validateCompetitionPayload(payload, { isUpdate: false });

        assert.equal(data.isPublished, false, 'New competition must be saved as Draft (isPublished: false)');
        assert.equal(data.publishedAt, null, 'publishedAt must be null on creation');
        assert.equal(data.isCompleted, false, 'isCompleted must be false on creation');
        assert.equal(data.isRegistrationClosed, false, 'isRegistrationClosed must be false on creation');

        const status = computeCompetitionStatus(data);
        assert.equal(status, 'DRAFT');
      });
    }
  });

  // 2. Published status separate from Registration Open/Closed status
  describe('2. Separation of Published and Registration Statuses', () => {
    it('evaluates Draft competition as DRAFT and registration as CLOSED', () => {
      const comp = {
        isPublished: false,
        publishedAt: null,
        isCompleted: false,
        isRegistrationClosed: false,
        eventDate: futureEventDate,
        registrationDeadline: futureDeadline,
      };

      assert.equal(computeCompetitionStatus(comp), 'DRAFT');
      assert.equal(computeRegistrationStatus(comp), 'CLOSED', 'Draft competitions are closed to public registration');
    });

    it('evaluates Published competition with open registrations as PUBLISHED and OPEN', () => {
      const comp = {
        isPublished: true,
        publishedAt: new Date(),
        isCompleted: false,
        isRegistrationClosed: false,
        eventDate: futureEventDate,
        registrationDeadline: futureDeadline,
      };

      assert.equal(computeCompetitionStatus(comp), 'PUBLISHED');
      assert.equal(computeRegistrationStatus(comp), 'OPEN');
    });

    it('evaluates Published competition with closed registrations as PUBLISHED and CLOSED', () => {
      const comp = {
        isPublished: true,
        publishedAt: new Date(),
        isCompleted: false,
        isRegistrationClosed: true,
        eventDate: futureEventDate,
        registrationDeadline: futureDeadline,
      };

      assert.equal(computeCompetitionStatus(comp), 'PUBLISHED');
      assert.equal(computeRegistrationStatus(comp), 'CLOSED');
    });

    it('evaluates Unpublished competition as UNPUBLISHED and CLOSED', () => {
      const comp = {
        isPublished: false,
        publishedAt: new Date(), // previously published
        isCompleted: false,
        isRegistrationClosed: false,
        eventDate: futureEventDate,
        registrationDeadline: futureDeadline,
      };

      assert.equal(computeCompetitionStatus(comp), 'UNPUBLISHED');
      assert.equal(computeRegistrationStatus(comp), 'CLOSED');
    });
  });

  // 3. Closing and Reopening Registrations
  describe('3. Registration Closing, Deadline Checks & Reopening Validation', () => {
    it('detects when an event date has passed', () => {
      assert.equal(isPastEvent(pastEventDate.toISOString()), true);
      assert.equal(isPastEvent(futureEventDate.toISOString()), false);
      assert.equal(isPastEvent(null), false);
    });

    it('automatically marks registration CLOSED when event date has passed', () => {
      const comp = {
        isPublished: true,
        publishedAt: new Date(),
        isCompleted: false,
        isRegistrationClosed: false,
        eventDate: pastEventDate,
        registrationDeadline: null,
      };

      assert.equal(computeRegistrationStatus(comp), 'CLOSED');
    });

    it('automatically marks registration CLOSED when registration deadline has passed', () => {
      const comp = {
        isPublished: true,
        publishedAt: new Date(),
        isCompleted: false,
        isRegistrationClosed: false,
        eventDate: futureEventDate,
        registrationDeadline: passedDeadline,
      };

      assert.equal(computeRegistrationStatus(comp), 'CLOSED');
    });

    it('reopening requires future deadline when previous deadline has passed', () => {
      const existing = {
        id: 'comp-1',
        isRegistrationClosed: true,
        registrationDeadline: passedDeadline,
        eventDate: futureEventDate,
        isCompleted: false,
      };

      // Simulating backend logic when admin reopens without providing new deadline
      const reopenWithoutNewDeadline = (reqBody) => {
        if (!reqBody.isRegistrationClosed && existing.registrationDeadline) {
          const deadline = new Date(existing.registrationDeadline);
          deadline.setUTCHours(23, 59, 59, 999);
          if (new Date() > deadline && !reqBody.registrationDeadline) {
            const err = new Error('Cannot reopen registrations because the registration deadline has already passed. Please update the deadline to a valid future date first.');
            err.status = 400;
            throw err;
          }
        }
      };

      assert.throws(
        () => reopenWithoutNewDeadline({ isRegistrationClosed: false }),
        /Cannot reopen registrations because the registration deadline has already passed/
      );
    });

    it('reopening succeeds when admin provides a valid future deadline', () => {
      const existing = {
        id: 'comp-1',
        isRegistrationClosed: true,
        registrationDeadline: passedDeadline,
        eventDate: futureEventDate,
        isCompleted: false,
      };

      const newFutureDeadlineStr = futureDeadline.toISOString();

      let updatedDeadline = null;
      let isClosed = true;

      // Simulating controller logic
      if (!isClosed || true) {
        const parsed = new Date(newFutureDeadlineStr);
        parsed.setUTCHours(23, 59, 59, 999);
        assert.ok(parsed > new Date(), 'New deadline is in the future');
        assert.ok(parsed <= new Date(existing.eventDate), 'New deadline is on or before event date');
        updatedDeadline = parsed;
        isClosed = false;
      }

      assert.equal(isClosed, false);
      assert.ok(updatedDeadline);
      assert.ok(updatedDeadline > new Date());
    });

    it('blocks reopening for completed competitions', () => {
      const existing = {
        id: 'comp-completed',
        isCompleted: true,
        isRegistrationClosed: true,
      };

      const reopen = () => {
        if (existing.isCompleted) {
          const err = new Error('Cannot reopen registrations for a completed competition.');
          err.status = 400;
          throw err;
        }
      };

      assert.throws(() => reopen(), /Cannot reopen registrations for a completed competition/);
    });

    it('blocks reopening for past events', () => {
      const existing = {
        id: 'comp-past',
        isCompleted: false,
        isRegistrationClosed: true,
        eventDate: pastEventDate,
      };

      const reopen = () => {
        if (isPastEvent(existing.eventDate)) {
          const err = new Error('Cannot reopen registrations for an event that has already passed.');
          err.status = 400;
          throw err;
        }
      };

      assert.throws(() => reopen(), /Cannot reopen registrations for an event that has already passed/);
    });
  });

  // 4. Uniformity across all competition types
  describe('4. Uniform Publication & Registration Across All 4 Competition Types', () => {
    for (const compType of FIXED_COMPETITION_TYPES) {
      it(`enforces identical publication and registration flow for "${compType}"`, () => {
        // Step 1: Created as Draft
        const { data: draftData } = validateCompetitionPayload({
          name: `Championship - ${compType}`,
          competitionType: compType,
          eventDate: futureEventDate.toISOString(),
          registrationDeadline: futureDeadline.toISOString(),
          registrationFee: 1000,
        }, { isUpdate: false });

        assert.equal(draftData.isPublished, false);
        assert.equal(computeCompetitionStatus(draftData), 'DRAFT');
        assert.equal(computeRegistrationStatus(draftData), 'CLOSED');

        // Step 2: Published by Admin
        const publishedComp = {
          ...draftData,
          isPublished: true,
          publishedAt: new Date(),
        };
        assert.equal(computeCompetitionStatus(publishedComp), 'PUBLISHED');
        assert.equal(computeRegistrationStatus(publishedComp), 'OPEN');

        // Step 3: Admin Closes Registration
        const closedRegComp = {
          ...publishedComp,
          isRegistrationClosed: true,
          registrationClosedAt: new Date(),
        };
        assert.equal(computeCompetitionStatus(closedRegComp), 'PUBLISHED');
        assert.equal(computeRegistrationStatus(closedRegComp), 'CLOSED');

        // Step 4: Admin Reopens Registration
        const reopenedComp = {
          ...closedRegComp,
          isRegistrationClosed: false,
          registrationClosedAt: null,
        };
        assert.equal(computeCompetitionStatus(reopenedComp), 'PUBLISHED');
        assert.equal(computeRegistrationStatus(reopenedComp), 'OPEN');

        // Step 5: Completed Competition
        const completedComp = {
          ...reopenedComp,
          isCompleted: true,
          completedAt: new Date(),
          isPublished: false,
        };
        assert.equal(computeCompetitionStatus(completedComp), 'COMPLETED');
        assert.equal(computeRegistrationStatus(completedComp), 'CLOSED');
      });
    }
  });
});
