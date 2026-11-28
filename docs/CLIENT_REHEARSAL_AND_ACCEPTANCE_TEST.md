# Gold Body Zone — Client Rehearsal & Acceptance Test

**Prepared:** 27 November 2026  
**Use for:** the final rehearsal before the 28 November 2026 client handoff

## 1. Safety boundary

- Use the local `[TEST] Client Rehearsal Championship` only.
- Its venue is `TEST VENUE — Do Not Use For Real Event` and every registration code starts with `TEST-GBZ-2026-`.
- Do not run the rehearsal seed against the deployed production database. The script refuses non-local database hosts.
- Do not change Cashfree to live mode or make a real payment during this rehearsal.
- Before any deployment or production migration, take and verify a database backup.

To restore the rehearsal participants to their starting values:

```powershell
cd backend
npm run seed:rehearsal
```

This command is idempotent. It creates or updates only the isolated test competition and its prefixed records. It does not delete or edit real participants. To clear completed test votes/forms, use **Judging Control Room → 3 · Run Live Judging → Reset scoring**, type `RESET`, and then run the seed again if participant details were edited.

## 2. Starting dataset and expected values

| Item | Expected |
| --- | ---: |
| Competition | `[TEST] Client Rehearsal Championship` |
| Participants | 19 |
| Confirmed | 17 |
| Paid | 17 |
| Unpaid / pending (all non-paid) | 2 |
| With trunk number | 16 |
| Verified | 12 |
| Categories | 4 |
| Category groups | 2 |
| Judges | 3 |
| Online records | 14 |
| Manual records | 5 |

Category distribution:

| Category | Type | Records | Notes |
| --- | --- | ---: | --- |
| 0–55 kg | Weight | 5 | One confirmed/paid participant deliberately has no trunk number |
| 55–65 kg | Weight | 5 | Includes one pending/unpaid participant |
| Under 175 cm | Height | 5 | Includes one cancelled/failed participant |
| Open Physique | Open | 4 | Two Novice and two Senior participants |

## 3. Implementation verdict against the Claude prompt

| Requirement | Verdict | Evidence / boundary |
| --- | --- | --- |
| Admin data refreshes without visible page reload | Implemented | Registration and new event screens poll silently and update state without a full-page refresh or loading flash. Manual Refresh still shows progress. |
| Registration header totals cover the whole competition, not the current 15-row page | Implemented | Counts are calculated separately from pagination and respect All / Online / Manual source tabs. |
| Category-wise participants in Registrations and Manage Competitions | Implemented | Both screens use the configured weight, height, open categories and groups. |
| Preserve old judge workflow | Implemented | Available as **Classic Tools**. |
| Search-first participant verification; no initial participant list | Implemented | Searches name, email, phone, code, trunk number, gym, district and Aadhaar last four digits. |
| Edit participant and assign trunk number | Implemented with safety limits | Name, contact, gender, age, weight, height, district, gym/individual, category/group, registration status, verification and trunk number are editable. Payment status is intentionally controlled only by verified payment flows. Aadhaar is not freely rewritten. |
| Category move reflects throughout the platform | Implemented for stored/current data | All screens read the same registration row. If a form is already open, cancel and restart that form because an open form intentionally keeps a stable participant snapshot. |
| Competition → category → participants with trunk number and edit | Implemented | **2 · Category Line-up** and Manage Competition → Categories provide this. |
| Create judges for one competition, separate private links | Implemented | Each competition assignment has its own revocable token; links can be copied, opened, shared or regenerated. |
| Judge sees only trunk numbers, not participant identity | Implemented in **Live Scoring** | The `/score/<private-code>` API returns registration ID and trunk number only. The preserved Classic workflow is intentionally unchanged and can show names; do not use Classic Sessions for tomorrow's event. |
| Round 1 Form 1: X voting, unlimited/5/10/15/20/custom limit | Implemented | Admin chooses the category/group and limit. Votes are private per judge. |
| Black judge screen after admin closes a form | Implemented | Judge state becomes locked until the next form opens. |
| Round 1 ordering, ties, optional re-compete and elimination | Implemented | Results sort by votes; tied participants can receive a Form 1 tie-break; losers are marked out. |
| One winner per category advances to Round 2 | Implemented | Admin confirms the category qualifier after reviewing results. |
| Round 2 Form 2: unique points, highest total wins, tie re-vote, no elimination | Implemented | Duplicate point values are rejected; only tied finalists can re-compete. |
| Round 3 Form 3 and searchable standard/custom titles | Implemented | The admin opens exactly one title at a time. A title cannot be opened twice, tied leaders are identified, and an admin-approved re-vote sends only those tied trunk numbers. The saved winner can be excluded from all later titles. |
| Multiple simultaneous competitions | Implemented | Judges, tokens, live state, heats, results and titles are scoped by competition. Only one form may be open per competition at a time. |

## 4. Deep acceptance test

Record **Pass / Fail**, a screenshot, and the exact time for every numbered section. Test once on desktop and repeat the judge form on at least one Android phone and one iPhone if available.

### A. Sidebar and navigation

1. Log in to Admin.
2. Confirm the sidebar label is **Judging Control Room**, not “Judge”.
3. Open it and confirm four tabs: **1 · Check-in & Verify**, **2 · Category Line-up**, **3 · Run Live Judging**, and **Classic Tools**.
4. Switch through all four tabs, then refresh the browser. Confirm the selected URL opens safely and there is no blank page.

### B. Silent refresh

1. Open Admin → Registrations → the test competition on one browser.
2. On a second browser, edit one test participant or create a harmless test record.
3. Wait at least 20 seconds without pressing Refresh.
4. Confirm the first screen updates without a full-page flash, scroll jump, or visible reloading screen.
5. Repeat on Judging Control Room → **2 · Category Line-up**.

### C. Overall registration totals and pagination

1. Open Registrations → `[TEST] Client Rehearsal Championship`.
2. On page 1 (rows 1–15), confirm the header remains **Total 19 / Confirmed 17 / Paid 17 / Unpaid-Pending 2**.
3. Go to page 2 (rows 16–19). Confirm the same four header totals remain; they must not change to the four rows on page 2.
4. Select **Online**. Expected: Total 14, Confirmed 12, Paid 12, Unpaid/Pending 2.
5. Select **Manual**. Expected: Total 5, Confirmed 5, Paid 5, Unpaid/Pending 0.
6. Test search and status filters. The table count may change, but the competition header is intentionally the overall source-tab count.

### D. Category breakdown

1. On Registrations, confirm all four category cards and the expected record counts from section 2.
2. Click each category and confirm the participant table filters to that category. Click again or clear the chip to show all.
3. Open Manage Competitions → the test competition → Categories.
4. Expand Open Physique and check the Novice and Senior groups.
5. Open Edit from a participant row and cancel without saving.

### E. Search-first verification and editing

1. Go to Judging Control Room → **1 · Check-in & Verify** → test competition.
2. Confirm no participant is listed before a search.
3. Find test record 017 using each method separately:
   - name: `Siddharth Thakur`
   - email: `rehearsal.participant017@example.test`
   - code: `TEST-GBZ-2026-017`
   - Aadhaar last four: `7017`
4. Open the record. Confirm it is confirmed and paid but has no trunk number and is unverified.
5. Enter trunk number `117`, tick verified, and save. Search again and confirm both values persist.
6. Search `117`; the same participant should be the first exact match.
7. Attempt to give another participant trunk `117`. Expected: a clear duplicate-number error naming the existing participant; no record is changed.
8. Edit test record 001, change weight to `60`, and confirm the UI suggests `55–65 kg`. Move it and save.
9. Check Registrations, **2 · Category Line-up**, and Manage Competition → Categories. It must move from 0–55 kg to 55–65 kg everywhere after the silent refresh.
10. Run `npm run seed:rehearsal` afterward to restore the original category.

### F. Judge privacy and link isolation

1. Open **3 · Run Live Judging** → test competition → Judges Panel.
2. Confirm three test judges and three different private links.
3. Open each link in a separate private/incognito window or separate phone.
4. Before a form starts, each judge should see a waiting screen.
5. Start a Form 1. Inspect every judge screen: it may show judge name, competition/category and trunk numbers, but it must not show participant name, email, phone, gym, district, Aadhaar or payment data.
6. Submit Judge One’s sheet. Confirm Judge Two and Judge Three cannot see it.
7. Regenerate Judge One’s link. Expected: the old link stops working and the new link works.
8. Do not share screenshots containing private judge links outside the test team.

### G. Round 1 — Form 1

1. Before assigning trunk 117, try to start 0–55 kg. Expected: start is blocked because one confirmed/paid participant has no trunk number.
2. After assigning 117, select **Stage 1 · Select 20** and start 0–55 kg. Confirm all eligible trunk numbers in that category appear; the default per-judge selection is 20 and can be changed.
3. Have all three judges submit different X selections. Close the form and inspect the vote order.
5. Confirm the admin can see which judges are pending/submitted but judges cannot see one another’s choices.
6. Reopen one submitted sheet, change it, and resubmit.
7. When the number of entrants is 20 or fewer, confirm everyone advances from Stage 1 without elimination even if their vote totals match.
8. On a category with over 20 entrants, create a tie crossing the 20th-place cutoff. Confirm only those tied trunk numbers compete again; resolve the number of remaining places before Stage 2 opens.
9. Select **Stage 2 · Select 5**. Confirm only Stage 1's advancing trunk numbers appear, then vote and resolve any tie crossing the fifth-place cutoff.
10. Select **Stage 3 · Select 1**. Confirm only Stage 2's advancing trunk numbers appear. Resolve a top tie if needed, then confirm exactly one Stage 3 winner for Round 2.
11. Repeat all three stages for every category. For a grouped category, deliberately verify the selected division.

### H. Round 2 — Form 2

1. Confirm the finalists are the Round 1 winners only.
2. Start Form 2. Each judge must give every finalist a unique point value, with the highest value best.
3. Try using the same rank twice on one sheet. Expected: the UI/API rejects it.
4. To create a tie between finalists A and B with three judges, use A/B ranks `2/1`, `3/2`, and `1/3`; both totals become 6. Fill the remaining finalists with unused ranks on each sheet.
5. Close the form. Confirm the highest total is first and the equal totals are flagged.
6. Re-rank only the tied finalists. Confirm nobody is eliminated and the new order is stored.

### I. Round 3 — Form 3 and final results

1. Search the title list for **Best Poser**, **Most Muscular**, and **Best Performer**. Select only one title, such as **Best Poser**.
2. Send Form 3. Confirm every judge screen says **Best Poser** and permits exactly one trunk-number vote.
3. While that form is open, confirm the admin cannot start another title. Close it and confirm judge screens lock.
4. Try to start **Best Poser** again. Expected: the completed title is no longer selectable and the API rejects a duplicate attempt.
5. Create an equal top vote for two or more trunk numbers. Confirm the admin sees **Tie** and the exact tied trunk numbers.
6. Press **Approve tie-break**. Confirm judges receive the same title and only the tied trunk numbers. Vote again and close; one winner must be resolved.
7. Use judges’ votes and save the resolved winner. The winner is always excluded from later titles.
8. Start **Most Muscular**. Confirm the previous winner is absent, while other eligible participants remain.
9. Add a custom title such as `Mr. Rehearsal 2026`, run it separately, and confirm judges cannot vote for a different title than the one shown on the open form.
10. Open Final Results. Verify all saved titles, Round 2 ranking and Round 1 winners.
11. Use Print Results and confirm only the clean results sheet prints, with no admin controls.

### J. Failure and recovery checks

1. Close a form while one judge is pending. Confirm the warning appears and the pending sheet is not counted.
2. Submit from a judge after the admin closes the form. Expected: rejected as closed.
3. Attempt a second submission from the same judge without admin unlock. Expected: rejected.
4. Disconnect one judge’s phone for 30 seconds, reconnect, and confirm the current form returns without exposing other submissions.
5. Refresh admin during an open form. Confirm the form and submission progress remain.
6. Try starting a second form in the same competition while one is open. Expected: blocked.
7. Reset scoring and type anything except `RESET`. Expected: nothing is deleted.
8. Reset again with `RESET`. Confirm participants, payment statuses and trunk numbers remain while forms/votes/results are cleared.

## 5. Release blockers that still require real staging

Do not declare production ready until all are completed:

- Apply migration `0013_add_live_scoring_and_verification` on a backed-up staging copy and verify it before production.
- Run Cashfree sandbox success, failure, cancellation, retry, delayed/duplicate webhook and refund tests. No live payment should be used for rehearsal.
- Verify SMTP registration confirmation and password reset delivery with the intended production mail account.
- Verify HTTPS, secure cookies, firewall, persistent image/database volumes, backup and restore on the actual VPS.
- Resolve or deliberately update the two failing `participantIsolation.test.js` mocks (`tx.$queryRaw` is absent in the mock). The production frontend build passes and all live-scoring tests pass, but a release should not be represented as having a completely green backend suite until this is addressed.
- Recheck the preserved Classic Sessions privacy behavior. For trunk-number-only judging, use **Live Scoring** exclusively.

## 6. Final handoff record

Before the client arrives, record:

- Git commit/deployment version
- Database backup filename and restore-test result
- Migration status
- Testers and devices/browsers used
- Cashfree sandbox evidence
- SMTP evidence
- All failures, owner and decision
- Confirmation that all private judge links were regenerated for the real event
- Confirmation that the `[TEST]` competition is unpublished or removed from the production deployment

