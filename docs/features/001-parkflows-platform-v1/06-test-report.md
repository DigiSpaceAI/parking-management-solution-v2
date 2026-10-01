# Test Report: ParkFlows Platform v1, Phase 1 (Option A, Alphatech, 1 Oct)
Feature: 001-parkflows-platform-v1 · Author: qa-engineer · Date: 2026-09-30 · Step 6.
Inputs: `01-prd.md` (incl. Addenda A–C, AC-01..AC-57), `02-ux-design.md` v1.1, `03-tech-design.md` v1.0.1, `04-implementation-notes.md`, `05-code-review.md` rounds 2–5 (APPROVED @ `712d74d`).
This replaces the 25 Sep baseline audit that was in this file.

## Gaps found in inputs
1. **No single list of "Phase 1 ACs".** The PRD release phasing says Phase 1 is "US-01 + all other P0 web stories". `02` §0 names the launch must-pass set: AC-01..07, 44, 45, 47, 52, 55. Addendum B adds AC-19..23 and AC-14 (toast-only gate), but `03` and this task move AC-14/20/22/23 to Phase 2 (P2-1). Addendum C adds AC-57.
   - **Rule used here.** "Phase 1" means the `02` §0 set, plus AC-57, plus AC-19 and AC-21 (Addendum B, as narrowed by `03`).
   - Other existing-screen P0 ACs (08, 10, 11, 12, 15, 25, 26, 27 dup, 28, 34, 36, 40) are tested as **regression on current screens**, as `02`/`03` say ("everything else runs on the current screens as they are").
   - **PM to confirm.** If PM counts those as Phase 1, AC-12 (BUG-3) also blocks.
2. **AC-41 and AC-42 (empty states) are in neither the task's Phase 2 list nor a named `03` epic.** `03` P2-9 covers "console P0/P1 screens from UX §3.2". I mark them **Phase 2 (P2-9)**, and the browser run confirms they are not met today (empty tables, no guidance). PM to confirm.
3. **AC-57 wording vs build (open since the 29 Sep prep).** AC-57 says a Site Admin "cannot see … platform-wide domains". `03`/F9 and the build show platform-wide entries to Site Admins **read-only**, without Remove. DOM-01 tests the `03` behaviour. PM to align the AC text.
4. **`03` F4 lists "Relocation Logs", but that page isn't mounted.** `MasterAdminRelocationLogs.tsx` isn't imported anywhere; relocations appear in Entry/Exit Logs (per commit `1959578`). So AS-07 is N/A.
5. **The `/attendant` portal couldn't be tested as served (BUG-1).** The M1 and Addendum B toast checks ran with a harness work-around that serves the portal's JS/CSS from `dist-mobile`. They validate the app logic, not the deployed page.
6. **Production is not reachable from the QA workspace** (egress policy). So I couldn't check whether BUG-1 also affects `admin.parkflows.in`.
7. **Other roles' uncommitted edits** (`05`, `08`, `review-log.md`) were not touched. My only commit is `1d62feb`: the prepared suite and the browser plan (step 1).
8. **Test data.** The public `/registrations/submit` limit is 10/min per client. The new LATE-* tests wait out a 429 instead of failing. The suite now takes about 65 s.

## Environment
| Item | Value |
|---|---|
| Code under test | `feature/001-parkflows-platform-v1` @ **`1d62feb`** = `712d74d` (review-approved code) + QA test commit. Clean clone from a `git bundle` into the QA cloud workspace; no source edits. |
| Runtime | Node **22.22.2**, Bun **1.4.2** (`bun install --frozen-lockfile` OK; Bun 1.3.13 can't, see `05` gap 5), Playwright **1.56** / Chromium 1194 (headless, not a repo dependency) |
| Server | `NODE_ENV=production node dist/server.cjs`, `SITE_SCOPE_MODE` **unset = strict**, Firestore variables blank (in-memory store), `SEED_DEMO_USERS=false`, `K_SERVICE` unset |
| Browser build | `VITE_API_BASE_URL=VITE_API_BASE=http://127.0.0.1:3950 npm run build` (frontend gap 2) |
| Seeded accounts (browser) | `tests/qa/browser/seed.mjs`: Master (bootstrap), `qa.admina` (Site Admin A), `qa.multiab` (Site Admin A+B, non-Master), `qa.atta` (Attendant A), `qa.nosite` (Site Admin, no site), **`qa.uma`** (non-Master, Master-created custom role "QA Site HR" with USER_MANAGEMENT at A, for M-2 UI / m-5 / R4-2), **`qa.nositeatt`** (Attendant, no site, for M1). Sites QAA/QAB (+QAE empty, +QAN via UI). Plate prefixes MH12QA… (A) / MH14QB… (B). |

## Test runs (command, pass/fail counts)
| Command | Result |
|---|---|
| `npm run lint` (tsc --noEmit) | **PASS**, exit 0 |
| `npm run build` (web + server + mobile) | **PASS**, exit 0 (chunk-size warning only). Leaves `dist-mobile/` untracked (BUG-7). |
| `npm run test:qa` (strict) | **117 tests: 102 pass, 15 fail** (84 s) |
| — `001-backend.api.test.mjs` | **60/60 pass** (B1–B17, C-1, M-1, M-2, N-1, R4-1, R4-2, …) |
| — `001-platform-v1.api.test.mjs` | **42/57 pass**. Every ISO-*, PERM-* and LATE-* test passes. The **15 failures are exactly the Phase 2 list**: FLOW-03 (AC-13), 04 (AC-14), 05 (AC-16), 06 (AC-17), 09+10 (AC-20), 11 (AC-22), 12 (AC-23), 14 (AC-24), 18 (AC-27 format), 20 (AC-29), 21 (AC-30), 22 (AC-32), 24 (AC-37), 27 (AC-39). **No failure outside that list.** |
| `SITE_SCOPE_MODE=fallback` platform suite | 40 pass, 15 fail (the same 15), 2 skipped (strict-only ISO-01b/01c): the kill-switch doesn't break anything |
| Browser checks (`tests/qa/browser/*.mjs`) | **77 checks: 72 PASS, 3 FAIL, 2 N/A.** The FAILs are the served `/attendant` page (BUG-1), AS-08.7 Predictive in All sites (BUG-2) and the AC-12 switcher refresh (BUG-3). AS-backstop is N/A in the UI: a forced click on a disabled guarded button sends no request, and the server's 400 on All-sites writes is covered by ISO-01c. AS-07 is N/A (gap 4). |

**New API tests added in step 6** (in `001-platform-v1`; unit-level cases for the same fixes are already in `001-backend`: B17 (1)–(4), C-1, R4-1, R4-2):
- LATE-01 [AC-27/B17]: a Site B pending request doesn't block Site A; a same-site duplicate is still refused, with no data in the message.
- LATE-02 [AC-48/B17]: an ACTIVE pass at A doesn't block registering at B; each admin sees only their own request.
- LATE-03 [AC-57/C-1]: public `/domains` gives 400 without a site or with `ALL`; with a site it returns `{domain}` names only (own + platform-wide), with no other site's domains.
- R4-1 and R4-2 need a Master-created USER_MANAGEMENT role; they are covered by `001-backend` "R4-1 …" and "R4-2 …" (re-run: pass). The console-side check "M-1/R4-2 from console" (`qa.uma` changing own email → 403 `ERR_MASTER_ONLY`) passes.

## Traceability
Legend: API = `001-platform-v1` (QA); BE = `001-backend`; BR = browser check (`tests/qa/browser`). **P1** = Phase 1 must-pass (gap 1); **Reg** = regression on current screens; **P2 (P2-x)** = Phase 2 per `03`, with its epic.

| AC | Scope | Test ID(s) | Type | Result |
|---|---|---|---|---|
| AC-01 | P1 | ISO-01; BR AC-01 UI (Site Admin A, 12 screens, 0 Site B names/plates/codes, 0 calls with a non-A site) | auto API + BR | **PASS** |
| AC-02 | P1 | ISO-01, 01b (400 `ERR_SITE_REQUIRED` for Site Admin and Master), 01c (ALL Master-only, read-only), 02 (siteId=B → 403), 03, 04, 05; BE B1/B2 | API, BE | **PASS** |
| AC-03 | P1 | ISO-07…13 (save/delete/status/exit/relocate/approve/employee edit cross-site → 403, unchanged, audited); BE B3/B4, R4-1 | API, BE | **PASS** |
| AC-04 | P1 | BR MAN-02a (Choose-a-site, no data calls), b/c (1.5 s latency: 0 stale A-under-B samples, 0 mixed samples on Inventory, Logs, Approvals and Floor plan; rapid A↔B), d (All sites: QAA/QAB chips, "ALL SITES · 2 sites · Select one site to make changes"), g (sign-out during slow refresh), i (remembered site); chip at 375/768/1280 px under L-1 below | BR | **PASS**. See BUG-2 (Predictive Analytics in All sites crashes the shell; one non-core page, Minor). |
| AC-05 | P1 | ISO-14 (`/my-sites`); BR MAN-02e (A+B user: only A and B, no "All sites"), MAN-02f (single-site: no switcher) | API, BR | **PASS** |
| AC-06 | P1 (Attendant) | ISO-06, 09, 10; BE B4; BR M1-b (portal calls carry only its own site) | API, BR | **PASS** (Attendant). Employee part → **P2 (P2-7)** |
| AC-07 | P1 | PERM-01 (onboard/status/pricing/users/invoices → 403); BR S-NA, sidebar hides InfoSec/Simulator for non-Master; domain part now AC-57 | API, BR | **PASS** |
| AC-08 | Reg | PERM-03 | API | **PASS** |
| AC-09 | P2 (P2-7) | — (no Employee role/login yet) | — | Phase 2 |
| AC-10 | Reg | FLOW-29; BE B11 | API, BE | **PASS** |
| AC-11 | Reg | PERM-04 | API | **PASS** |
| AC-12 | Reg | FLOW-01 (API); BR AC-12 (UI onboarding) | API, BR | **FAIL (UI part), Minor BUG-3.** The site is created ACTIVE and listed on the config page, but it **doesn't appear in the header site switcher until reload** (`/my-sites` isn't refetched). |
| AC-13 | P2 (P2-6) | FLOW-02 pass, FLOW-03 fail | API | Phase 2 |
| AC-14 | P2 (P2-1) | FLOW-04 | API | Phase 2 |
| AC-15 | Reg | fixtures (create user + role + sites → sign in); BR MAN-02e/f, AC-01 (modules and sites shown) | API, BR | **PASS** |
| AC-16 | P2 (P2-6) | FLOW-05 | API | Phase 2 |
| AC-17 | P2 (P2-6) | FLOW-06 | API | Phase 2 |
| AC-18 | P2 (P2-5) | (live ≤ 5 s floor plan not built) | — | Phase 2 |
| AC-19 | P1 (Add. B) | FLOW-07 (server); BR attendant gate loads with own site (M1-b) | API, BR | **PASS** |
| AC-20 | P2 (P2-1) | FLOW-09, FLOW-10 | API | Phase 2 |
| AC-21 | P1 (Add. B) | FLOW-08 (server); BR TOAST-1: "Vehicle MH12QA0002 is ALREADY parked in slot A-05 (B1)." shown inline in the manual-entry form, stays until the next action (> 9 s), 12 px | API, BR | **PASS** (on the harness; see BUG-1) |
| AC-22 | P2 (P2-1) | FLOW-11 | API | Phase 2 |
| AC-23 | P2 (P2-1) | FLOW-12; BR TOAST-2 shows "Invalid license plate format. Must be 4-10 alphanumeric characters." (persistent) for a too-short plate | API, BR | Phase 2 (copy mismatch BUG-6) |
| AC-24 | P2 (P2-5, P2-6) | FLOW-14 | API | Phase 2 |
| AC-25 | Reg | FLOW-15 (+ BE B4: plate matched within the site only) | API, BE | **PASS** |
| AC-26 | Reg | FLOW-16; PERM-02b | API | **PASS** |
| AC-27 | Reg (duplicates) / P2 (P2-2, format) | FLOW-17, LATE-01, LATE-02, BE B17 (1)(2) pass; FLOW-18 (format) fail | API, BE | **PASS** (duplicates, per site). Format → Phase 2 |
| AC-28 | Reg | FLOW-19 (pass at the request's site, audit-logged); BE B7, B17 (4) | API, BE | **PASS** |
| AC-29 | P2 (P2-2) | FLOW-20 | API | Phase 2 |
| AC-30 | P2 (P2-1/P2-2) | FLOW-21 | API | Phase 2 |
| AC-31 | P2 (P2-7) | — | — | Phase 2 |
| AC-32 | P2 (P2-6) | FLOW-22 (site scope OK, filters ignored) | API | Phase 2 |
| AC-33 | P2 (P2-3) | — | — | Phase 2 |
| AC-34 | Reg (scope) / P2 (P2-9, accuracy) | BE B2 (reports need a site, refuse others and ALL); BR AS-08.2 (Reports in All sites → "Select a specific site") | BE, BR | **PASS** (site scope). Manual-count accuracy → Phase 2 |
| AC-35 | Blocked (OQ-9) | FLOW-23 (generate + mark Paid pass) | API | Blocked (formula), not a launch blocker per PRD |
| AC-36 | Reg | FLOW-13 | API | **PASS** |
| AC-37 | P2 (P2-4) | FLOW-24 | API | Phase 2 |
| AC-38 | P2 (P2-4) | — | — | Phase 2 |
| AC-39 | P2 (P2-6) | FLOW-25, 26 pass; FLOW-27 fail | API | Phase 2 |
| AC-40 | Reg | FLOW-28 (Employee view → P2-7) | API | **PASS** |
| AC-41 | P2 (P2-9, gap 2) | BR EMPTY-* (site QAE, 0 slots): Inventory = empty table; Floor plan = "No parking slots found matching your query filter." | BR | Phase 2: **observed not met** |
| AC-42 | P2 (P2-9, gap 2) | BR EMPTY-* (Logs, Approvals, Alerts: empty tables / "0 Pending") | BR | Phase 2: **observed not met** |
| AC-43 | P2 (P2-7) | — | — | Phase 2 |
| AC-44 | P1 | ISO-15; BR AC-44 UI ("No site assigned · … Contact your administrator." + Sign out, 0 data calls) | API, BR | **PASS** |
| AC-45 | P1 | BR AC-45 ×7: connection refused / 503 on Logs, Inventory, Approvals, Floor plan, Predictive, Reports → "We couldn't load this" + Try again, recovers; save failure → "Couldn't save. Nothing was changed." | BR | **PASS** |
| AC-46 | P2 (P2-7) | — | — | Phase 2 |
| AC-47 | P1 | BR MAN-02h: token killed externally → next action goes to sign-in with "Your session ended. Sign in to continue." → back on Entry/Exit Logs, site B | BR | **PASS** |
| AC-48 | P2 (P2-2) | LATE-02 (per-site registration base, B17) | API | Phase 2 (base passes) |
| AC-49 | P2 (P2-2) | — | — | Phase 2 |
| AC-50 | P2 (P2-2) | — | — | Phase 2 |
| AC-51 | P2 (P2-3) | — | — | Phase 2 |
| AC-52 | P1 | BE B9 (non-Master → 403 `ERR_MASTER_ONLY`); BR S-NA (Site Admin deep link to InfoSec → "You don't have access to this page" + Go to Home), M-2 UI/m-5 (`qa.uma`: no Simulator tab, no InfoSec) | BE, BR | **PASS** |
| AC-53 | P2 (P2-4) | — | — | Phase 2 |
| AC-54 | P2 (APKs) | — | — | Phase 2 |
| AC-55 | P1 | BE B10; BR VA-01 (banner "Viewing as QA admina · Site Facility Manager · QA Site A — read-only", every call carries `x-view-as`, target's modules, no Site B data), VA-02 (22 guarded writes disabled, direct POST → 403 `ERR_VIEW_AS_READ_ONLY`, CSV export disabled), VA-03 (reload: banner kept, revalidated before data), VA-04 (Exit view: one click, own site B, no `x-view-as`, writes re-enabled), VA-05 (deleted target → "Couldn't start the view"), VA-06 (no-site target → S-0), VA-07 (sign-out clears view), AS-09 ×7 | BE, BR | **PASS** |
| AC-56 | Phase 3 | — | — | Phase 3 |
| AC-57 | P1 (Add. C) | PERM-02a–e, LATE-03; BE Domains/C-1; BR DOM-01 (Site Admin panel: own "This site" entry with Remove, platform-wide "All sites" without Remove, no Site B entry), DOM-02 (add + remove own domain in UI), DOM-03 (Master All sites: "New domains apply to every site.", site codes) | API, BE, BR | **PASS** (see gap 3) |

**Other Phase 1 browser checks (task list):**
- **"All sites = no enabled writes"** (L-3 / F4) passes:
  - AS-01 Inventory: 77 guarded, 0 enabled.
  - AS-02 Floor plan: 4 in the slot modal + 20 on occupied cards, 0 enabled.
  - AS-03 Logs: 23 guarded, 0 enabled.
  - AS-04a Registration: 2 guarded, 0 enabled.
  - AS-04b Approvals: 11 guarded, 0 enabled.
  - AS-05 Alerts: 6 guarded, 0 enabled.
  - AS-06 Valet: 4 guarded, 0 enabled.
  - All tooltips read "Select one site to make changes".
  - The **unguarded sweep** clicked every other enabled control with non-GET requests aborted. It found **0 site-scoped writes** on all 7 F4 pages and all 8 other tabs. Platform pages are exempt: 2 invoice-status calls from Master Site Config are platform-level.
  - Choosing Site A re-enables Inventory's controls (22/22).
- **L-1 chip:** visible at 375 / 768 / 1280 px for Master and Site Admin. It shows the code below 1024 px and "name · code" at 1280. No horizontal scroll. Below 1024 px it opens as a bottom sheet. Options are about 47 px tall, and Esc returns focus to the chip.
- **`/attendant` M1** passes on the harness (BUG-1):
  - M1-a, no site: "Couldn't load your site · Your account has no site assigned…" + Try again + Sign out, 0 gate calls.
  - M1-b, `/my-sites` 500: blocked, 0 gate calls, even after clicking every other button (M1-d).
  - Try again → Gate Terminal loads, with `x-site-id` = A on every call.
  - M1-c: Sign out returns to sign-in.
- **Addendum B toasts** pass on the harness:
  - Server refusals in the manual form are shown **inline and persist** (TOAST-1/2).
  - Non-modal toasts ("Scan failed: … try manual entry instead.") show for about **3.5 s at 12 px** (TOAST-3). That is readable, but short at a gate; see BUG-5.

## Bugs
New in step 6 (not fixed, as the role requires). Severity uses the code-review scale.

- **BUG-1 [Critical, launch blocker unless staging proves otherwise] The `/attendant` portal is blank when served by the server.** File: `vite.mobile.config.ts` (no `base`, so `dist-mobile/index.html` loads `/assets/mobile-*.js` from the site root) together with `server.ts` L2834 (the portal is served only under `/attendant`).
  - **Steps:** `npm run build && npm start` → open `/attendant/`.
  - **Expected:** the attendant sign-in.
  - **Actual:** a blank page. The console shows "Failed to load module script … MIME type text/html". `GET /assets/mobile-<hash>.js` returns the console's `index.html` (200 text/html). `GET /attendant/assets/mobile-<hash>.js` returns 200 JS.
  - This exists on `main` too (since `1959578`, 23 Sep); the branch didn't cause it. Addendum B makes `/attendant` the Phase 1 gate tool, and M1 lives there.
  - **Fix options (builder's choice):** web-build base `/attendant/`, or serve `dist-mobile/assets` at `/assets/mobile-*`. Then QA re-runs `att.mjs` without the work-around, which takes about 10 min.
  - **Devops:** check `admin.parkflows.in/attendant/` on staging or prod. If the hosting in front serves the assets differently, this can be downgraded.
- **BUG-2 [Minor; recommend fixing before launch] Predictive Analytics in All sites mode crashes the whole console shell.** File: `src/components/AnalyticsPredictive.tsx` L28 / L137. The 400 `ERR_SITE_ALL_NOT_ALLOWED` body is treated as a report, and `report.hourlyForecast.map` throws.
  - **Steps:** Master → All sites → Predictive Analytics.
  - **Expected:** a "Select a specific site" message, as Reports shows.
  - **Actual:** the root ErrorBoundary replaces the sidebar and header with "Something went wrong … reading 'map'". Try again recovers.
  - Master-only, no data risk. A network failure on the same page shows the proper ErrorCard.
- **BUG-3 [Minor] A new site doesn't appear in the site switcher until reload (AC-12).** File: `src/components/MasterAdminSites.tsx` `submitOnboard` (L100-131): it reloads only its own list and doesn't refresh the App's permitted sites (`/my-sites`).
  - **Steps:** Master → Master Site Config → Onboard site → Create site → open the header chip.
  - **Expected:** the new site is offered.
  - **Actual:** it isn't offered (0 `/my-sites` calls) until a reload.
- **BUG-4 [Major, go-live config / security] Five demo domains are platform-wide by default and come back whenever the whitelist is empty.** File: `src/server/db.ts` L820-824, L971-980 (load path) and L1189 (default store): `company.com`, `corp.org`, `techfirm.com`, `enterprise.io`, `parkos.ai`.
  - **Steps:** fresh store → Site Admin A's domain panel shows them as "All sites" → public registration at any site with `@corp.org` is accepted as PENDING.
  - **Expected:** no domains until an admin adds one ("Registration isn't open for this site yet").
  - **Actual:** open to these domains at every site, including Alphatech if production ever loaded an empty list. Removing every domain doesn't stick: they return on the next load. This defeats the H9 "fail closed" intent.
  - **Devops/security:** confirm production's `whitelistedDomains` before go-live.
- **BUG-5 [Minor] Gate toasts auto-hide after 3.5 s at 12 px.** File: `src/mobile/GateTerminal.tsx` L206-208 (timeout) and L520 (font).
  - This applies to messages outside the manual form: scan failed, exit, change-slot results.
  - Addendum B asks that toasts "stay visible long enough to read". 3.5 s for about 11 words is borderline for an attendant at a gate. **Recommend:** at least 6 s or tap-to-dismiss.
- **BUG-6 [Minor] Plate error copy doesn't match the rule.** File: `server.ts` L759 / L1588 ("Must be 4-10 alphanumeric characters") vs `src/server/security.ts` `isValidLicensePlate` (`{4,12}`).
- **BUG-7 [Minor] `npm run build` leaves `dist-mobile/` untracked.** File: `.gitignore` has `dist/` but not `dist-mobile/`.
- **BUG-8 [Minor, test safety / devops] Firestore can initialise with no project configured.** File: `src/server/firestoreClient.ts` L36-48: `getFirestoreDb()` initialises firebase-admin with application-default credentials even when no project id is set.
  - **Steps:** run the server or `npm run test:qa` with Firestore variables blank → the log shows "[firestore] Connected." and then tries ADC.
  - **Risk:** on a developer machine with `gcloud` ADC for the production project, a "local, in-memory" run (and the QA/backend suites, which claim they never touch real data) could read or write real Firestore.
  - **Suggest:** return `null` when `!isFirestoreConfigured()`.

**Observations (not graded; for UX / Phase 2):**
- On the `/attendant` **Exit** tab, "Enter vehicle manually" opens the **entry** form, so exits can't be done by typed plate; they go through scan or Live Slots. This was already the case before this branch and belongs to P2-1.
- The floor-plan slot modal doesn't close on Esc.
- View-as of a **suspended** (not deleted) user keeps working; F7 only covers deleted users.
- The Home "Enterprise sites" card shows hard-coded names ("Tech Park HQ, Cyber Tower, BKC Financial Center", `RoleHomePage.tsx` L518).
- The attendant sign-in placeholder shows a seeded demo email.

**Open Minors carried from code review (known, not blocking):**
- **R4-3:** bulk `autoApprove` skips the same-site duplicate-pass check (Phase 2).
- **R5-1:** account email/username uniqueness (Phase 2 / security).
- **R5-2:** same-site pass access by re-pointing an email (Phase 2 / security).
- **n-1:** Employee app preview shows hard-coded default domains as valid.
- **m-8:** CSV export puts the session token in the URL (security, step 7).

## Verdict: FAIL
- **Phase 1 criteria: every Phase 1 AC has a test and all pass.** That covers AC-01..07, 19, 21, 44, 45, 47, 52, 55 and 57, on the API, the backend and the browser. Site isolation holds under strict mode, including through a throttled site switch, All-sites mode and view-as.
- **The verdict is FAIL because of one Critical, BUG-1.** The `/attendant` gate portal, the Phase 1 gate tool under Addendum B and M1, is blank when served by this build. AC-19, AC-21 and M1 pass only with a harness work-around.
- **To reach PASS:**
  - Fix BUG-1, with a small code review.
  - QA re-runs `att.mjs` without the work-around (about 10 min).
  - PM confirms gaps 1–3.
- **Also recommended before 1 Oct:**
  - BUG-4: devops checks the production domain list.
  - BUG-2: a one-line guard.
- Everything else is Minor or Phase 2.

## User decision (2026-10-01)
**The user deferred BUG-1 to the next upgrade, along with the devops live check and the QA re-run.** They do not block launch. The QA verdict stays **FAIL as tested**, but the risk is accepted and step 7 can proceed.
**What this means at go-live:** if `/attendant` is also blank in production, Alphatech attendants have no gate app on 1 Oct. Before go-live, devops should open `/attendant/` once, and the site team should have a fallback ready: gate entry/exit from the web console (Entry / Exit Logs → Record Manual Entry / Process Exit Checkout), signed in as a site user with gate rights.
**BUG-4 (demo domains) is also not a blocker (user, 2026-10-01).** It moves to the next upgrade; the security reviewer may still grade it. The PM decisions (gaps 1–3) are unchanged.
