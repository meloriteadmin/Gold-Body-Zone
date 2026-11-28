# Gold Body Zone — What Changed & Complete Platform Guide

This guide covers **(A) every change made**, **(B) how to deploy it safely**, and **(C) how to use the whole platform on competition day**, step by step.

---

## A. What was changed

### 1. Admin pages no longer visibly reload
- **Registrations page:** the automatic refresh (every 15 s) is now **silent**. New registrations and payment updates appear in place. There is no spinner and the table doesn't flash.
- All Judging Control Room screens refresh silently too.
- The **Refresh** button still shows a spinner when you press it yourself.

### 2. Registration counters are now overall
In **Registrations → open a competition**, the four boxes **Total · Confirmed · Paid · Unpaid/Pending** now count the **whole competition**, not only the 15 rows on the current page. They follow the **All / Online / Manual** tab.

### 3. Category-wise participants (Manage Competitions + Registrations)
- **Registrations → competition:** a new **Participants by Category** panel shows every category from the competition setup (weight / height / open, plus groups). It shows counts for total, paid, pending, trunk numbers given and verified. **Click a category to filter the table**, and click it again (or the ✕ chip) to show all again.
- **Manage Competitions → open a competition → new “Categories” tab:** the same breakdown. Click a category to see its participants with trunk numbers, weight/height, gym and status. Each row has an **Edit** button.

### 4. Judging Control Room
First choose a competition. Only then do the following tabs appear:
| Tab | Purpose |
|---|---|
| **Category Line-up** | Search and verify participants, register someone manually if no match is found, and review category participants/trunk numbers |
| **Run Live Judging** | Create judges, share private links, and run Round 1 → Round 2 → Round 3 live |
| **Classic Tools** | The preserved old judge/session workflow |

### 5. New judge screen for judges
- Each judge gets a **separate private link**: `https://bodybuildingassociationnashik.site/score/<private-code>`.
- Judges see **only trunk numbers**. They never see names, gyms or any other participant details, and no judge can see another judge’s sheet.
- The screen looks like the paper forms: **Form 1** (Selection with X), **Form 2** (Rank) and **Form 3** (Title winner), each with the red circled form number.
- After the admin closes a form, every judge’s screen turns **black** until the next form opens.

### 6. Backend / database
- New migration `0013_add_live_scoring_and_verification`:
  - `registrations.verified_at` (the “verified at venue” marker)
  - `competition_judges.access_token` (each judge’s private link)
  - new tables `live_heats`, `live_heat_submissions`, `live_competition_states`
- New API routes: `/api/admin/live/...` (admin only) and `/api/scoring/:token` (the judge link).
- The admin request limit was raised (300 → 1000 per 15 min), and the live tools have their own higher limit, so the admin is never blocked on event day.
- Payment status still **cannot** be edited by hand. It is set only by verified payments, as before.

---

## B. Deployment (do this once, before the event)

> ⚠️ Take a database backup first.

On the VPS, inside the project folder:

```bash
# 1. Backup
docker compose exec -T db pg_dump -U gbz -Fc gold_body_zone > ~/gbz-backup-$(date +%F-%H%M).dump

# 2. Get the new code (git pull, or copy the changed files)
git pull

# 3. Rebuild images
docker compose build backend frontend

# 4. Apply the new database migration (additive, safe)
docker compose run --rm backend npx prisma migrate deploy

# 5. Restart
docker compose up -d backend frontend

# 6. Check
docker compose ps
curl -s https://bodybuildingassociationnashik.site/api/health
```

**If you skip step 4,** the Live Scoring screens show: *“Live scoring tables are missing. Please run the database migration”*. Run step 4 and refresh.

**Rehearse before the event:** run one full test (Round 1 → 2 → 3) on the real competition with test judges. Then press **Reset scoring** (type `RESET`). This clears only the scoring data. Participants, payments and trunk numbers are not touched.

---

## C. How to use the platform

### C1. Before the event — check registrations
1. **Admin → Registrations →** click the competition.
2. Check the four overall counters (Total / Confirmed / Paid / Unpaid).
3. Use the **Participants by Category** panel to see how many are in each category. Click a category to list only them.
4. **Somebody pays in cash at the venue:** click **Manual Registration** and enter the **same email** they registered with, with payment method **Cash**. The existing unpaid registration is updated to **Paid + Confirmed**, and no duplicate is created.

### C2. Trunk numbers
Two ways (both write to the same place, so they show up everywhere):
- **Bulk:** Manage Competitions → competition → **Trunk Numbers** tab → **Assign Trunk Numbers**. This needs registrations to be closed, and it never renumbers anyone.
- **One by one at the desk:** Judging Control Room → competition → **Category Line-up** (see C3). Type the number, or press **Next free** to get the lowest free number.

Trunk numbers must be unique inside a competition. The system blocks duplicates and tells you who already has that number.

### C3. Participant verification desk (check-in)
1. **Judging Control Room → choose the competition → Category Line-up.**
2. Nobody is listed. **Type to search:** name (any word order), email, mobile number, registration code (e.g. `REG-202611-3D47E6`), **trunk number**, gym, district or **Aadhaar last 4 digits**.
3. Click the participant → the **Verify & Edit** window opens. You can change **everything**:
   - Trunk number (with **Next free**)
   - Category and group
     - If you type the real **weight/height**, the system suggests the matching category (e.g. *“matching category is 55–60 kg → Move to 55–60 kg”*).
   - Weight, height, age, gender, name, email, mobile, district, gym / individual, registration status
4. Press **Save & Mark Verified** (or **Save Changes**). A blue shield ✓ marks the participant as verified.
5. **Changes apply everywhere immediately:** registrations list, exports, category panels, trunk-number list, and the judges’ forms. Example: a participant moved from 0–55 kg to 55–60 kg now appears only in 55–60 kg.

> Only **Confirmed + Paid** participants **with a trunk number** appear on judges’ forms.

### C4. Category board (during the event)
**Judging Control Room → choose the competition → Category Line-up →** click a category. This lists all participants of that category with trunk numbers. You can filter by group or by text. **Edit** opens the same edit window (trunk number included). The same view is available in **Manage Competitions → competition → Categories**. Search results are hidden until a search is entered; a failed search offers **Manual registration**, with an optional trunk number.
The **Manual registration** button also appears at the competition header and inside each opened category; the category is preselected. **Delete** removes a participant from the active line-up by marking the registration Cancelled. Payment history is retained, and **Show removed** lets an admin inspect the row and restore its status through Edit.

### C5. Create judges and share links
1. **Judging Control Room → choose the competition → Run Live Judging.**
2. In **Judges Panel** press **Create Judge**, choose the **competition** or **Assign this judge to all active competitions**, and enter name (+ phone for WhatsApp).
   - **Add existing** adds a judge from the directory instead.
3. Every judge gets a numbered card (J1, J2, J3 …) with:
   - **Copy** — copies the private link
   - **WhatsApp** — opens WhatsApp with the link (straight to the judge’s number if a phone was entered)
   - **↗** — opens the judge screen (to test)
   - **⟳** — makes a **new** link (the old one stops working, which is useful if a link was shared by mistake)
   - **Edit** — changes the judge’s name, email or phone
   - **Unassign** — removes the judge from this competition but keeps the judge in the directory
   - **Delete** — deletes an unused judge; if scoring history exists, safely deactivates the judge and preserves submitted sheets
4. Send **each judge only their own link**. A judge sees “Please wait” until you open a form.

### C6. ROUND 1 — Form 1 (voting / elimination), category by category
1. In **Run Live Judging**, open **Round 1 · Form 1**. Every category is listed with how many are ready. A warning shows if anyone has no trunk number.
2. **You choose which category competes first:** select **Stage 1 · Select 20**, then press **Start Stage 1** on that category. The default is 20; the admin can choose another cutoff. If 20 or fewer compete, nobody is eliminated at this stage.
3. The chosen number is also the maximum X marks each judge may give. If the category has groups, choose the intended division.
4. Press **Start on judges’ screens**. Every judge immediately sees Form 1 with the category’s trunk numbers in a two-column sheet (like paper) and taps **X** next to their choices → **Submit sheet**.
5. The orange **“Live on judges’ screens”** box shows **who has submitted** (✓) and who is pending.
   - If a judge made a mistake, press the small 🔓 next to their name to **reopen their sheet**.
   - **Cancel this form** discards it.
6. When everyone has submitted, press **Close & Show Results**. All judge screens turn **black**, and the results open:
   - **Position, trunk no., name, votes**, and **which judge marked whom** (J1 ✕, J2 ✕ …)
   - The highest votes are at the top.
7. Every equal-vote group offers an optional **Compete again (tie-break)** vote. The highest vote totals fill the stage quota automatically; if the last place is tied without a re-vote, trunk number decides its order. Entrants with zero votes can fill unused places. If the whole category has 20 or fewer entrants, all are selected.
8. Select **Stage 2 · Select 5**. The card now shows the number selected from Stage 1, and the form contains only those trunks. Vote again, optionally re-vote ties, then save exactly five (or all entrants if fewer than five) for Stage 3.
9. Select **Stage 3 · Select 1**. Only Stage 2's advancing participants appear. Resolve a top tie, then confirm the single Stage 3 winner for Round 2. Repeat all three stages for each category.

### C7. ROUND 2 — Form 2 (ranking, no elimination)
1. **Round 2 · Form 2.** It shows all **finalists** (one winner from each category).
2. Press **Start Form 2 (Ranking)**. The system warns if some category has no winner yet.
3. Judges see Form 2: each trunk number with point buttons (1, 2, 3 …). **The highest number is best.** Each point value can be used once, and duplicates are blocked → **Submit sheet**.
4. Press **Close & Show Results** → the judges’ screens go black. The result table shows each judge’s points per participant and the **Total**. **The highest total = 1st position.**
5. **Same total = same rank:** press **Compete again (Form 2)**. Only those finalists are ranked again among themselves and get new positions. Nobody is eliminated.

### C8. ROUND 3 — Form 3 (titles)
1. **Round 3 · Form 3.**
2. Choose **one title for this form**. A **searchable list** of standard titles opens (Overall Champion, Title Winner, Best Poser, Most Improved Body Builder, Most Muscular, Best Physique, Best Performer, Best Symmetry, Best Abs, Best Legs, … 40 titles).
   - Type to search.
   - To add your own title (e.g. “Mr. Nashik 2026”), type it and press **Add custom title**.
   - Press **Send Form 3 to judges**. Every judge sees that exact title and taps one trunk number → submit.
   - Close the form. That title is now completed and cannot be selected again.
3. **If the top vote is tied:** the result names every tied trunk number. Press **Approve tie-break** only if the admin wants them to compete again. Judges receive the same title with only those tied trunk numbers. Repeat if another tie occurs.
4. **Save the title winner:** use the judges’ resolved vote and save. That trunk number is automatically ineligible for future titles.
5. Return to step 2 for the next title. A judge can vote only for the title currently opened by the admin; titles are never combined in one form.

### C9. Final results
**Final Results** tab shows titles, the Round 2 final ranking and Round 1 category winners. **Print results** prints only this results sheet (black on white).

### C10. Several competitions live at the same time
Each competition has separate forms and results. Open each one from **Judging Control Room → competition → Run Live Judging**. A judge may be assigned to all live competitions. Cards show **“Form live”** or **“Round N”**.

### C11. Rules built into the system (to prevent mistakes)
- Only **one form open at a time** per competition.
- A form can’t start if any confirmed participant in that category has **no trunk number**.
- A judge can submit a sheet **only once** (the admin can reopen it). Sheets sent after closing are rejected.
- A tie-break is allowed **only between participants who are really tied**.
- Trunk numbers are unique across the entire competition, not separately per category. The same number can be reused only in a different competition.
- Each Form 3 contains exactly one title. A completed title cannot be reopened, and an excluded winner cannot appear in later title forms.
- Judges’ links never expose names; a removed judge’s link stops working immediately.
- Closing a form requires every assigned judge to submit their sheet.
- **Reset scoring** needs you to type `RESET`, and it never touches participants or payments.

### C12. Classic judge system (unchanged)
**Judging Control Room → competition → Classic Tools** is the previous workflow: judges directory, start session, temporary links, semifinalists, rankings, winner titles and results. Note that this old screen can show participant names to judges. For tomorrow, use **Run Live Judging**, which shows trunk numbers only.

---

## D. Quick troubleshooting
| Problem | Fix |
|---|---|
| “Live scoring tables are missing…” | Run `docker compose run --rm backend npx prisma migrate deploy`, then restart the backend |
| A judge says “Link not valid” | Their link was regenerated or they were removed; copy the current link from Judges Panel |
| A participant is missing from a judge’s form | They must be **Confirmed + Paid + have a trunk number** and be in that category; fix it in Category Line-up, then **Re-run Form 1** if the form already closed |
| A judge submitted wrong marks | While the form is open, press 🔓 next to their name; they submit again |
| A cash payer shows Pending | Manual Registration with the same email, method Cash |
| A wrong category/group was started | **Cancel this form**, then start the correct one |
