# Test Report — ParkFlows Platform v1 (baseline) · 001-parkflows-platform-v1
Author: qa-engineer · Date: 2026-09-25 · Input: `01-prd.md` (47 AC)

## Gaps found in inputs
1. **The gates before QA are not passed.** The PRD is still "READY FOR APPROVAL", and there is no `03-tech-design.md`. `04-implementation-notes.md` says every builder was blocked and changed no code. `05-code-review.md` is CHANGES (round 1). `02-ux-design.md` exists. The workflow gate says QA runs after code review passes. I ran QA now because the user asked for it directly. So this report is a **baseline audit of the current code against the PRD**, not the sign-off of a finished feature.
2. **What was tested.** Branch `main` @ `d42af6f` plus the uncommitted working tree. Per `05-code-review.md`, the only real change is `src/App.tsx` (+16 lines); the other 26 modified files are CRLF churn. These results hold for that snapshot only. Re-run them when code is committed on a `feature/001-*` branch.
3. **Other reviews overlap with this one.** `07-security-review.md` independently reports several of the same defects (BUG-1/2, 3, 8, 28, 31 here). I kept them here because each one breaks an acceptance criterion, and the matching test gives a reproduction.
4. **KNOWN_ISSUES.md cites commit `2472379`** (client `withSite()` fix). That commit is not in this repo's history (`git` reports "malformed object name"), and `src/App.tsx` still calls `/api/v1/slots`, `/employees`, `/logs`, `/alerts/non-parked` and `/registrations` without a `siteId`.
5. **No Employee role or login exists.** The seeded roles are Master Admin, Site Facility Manager, ValetX Lead, MIS Auditor and Gate Attendant. Employee-app criteria (AC-09, AC-31, AC-43) are blocked until OQ-2 is answered.
6. **Open questions block these AC:** OQ-9 (invoice formula) blocks AC-35. OQ-10 (overstay limit) blocks AC-33: there is no overstay concept in the code, only the "non-parked" roster alert. OQ-5 (override) affects AC-20.
7. **Test runner.** No test runner existed. To avoid adding dependencies without approval, I used Node's **built-in `node:test` + `fetch`**, which needs no new packages. The suite starts `server.ts` in a temp directory with the Firestore variables blanked, so it runs on an in-memory store and never touches production. **Proposal for the orchestrator:** add `"test:qa": "node --test tests/qa/001-platform-v1.api.test.mjs"` to `package.json` (I did not change it). Later, Vitest + supertest could replace this when UI component tests are needed. That needs dependency approval.

## Traceability
Legend: auto = `tests/qa/001-platform-v1.api.test.mjs` · static = code review of the behaviour, confirmed by reading the code path · manual = script below, not executed (needs a browser or device).

| AC ID | Pri | Test ID | Type | Result |
|---|---|---|---|---|
| AC-01 | P0 | MAN-01 | manual | NOT RUN (UI). Note: the API leaks in ISO-03/05 feed Relocation Logs and Security Audit screens |
| AC-02 | P0 | ISO-01, ISO-02, ISO-03, ISO-04, ISO-05 | auto | **FAIL**. ISO-01/02 pass; notifications, per-slot report and audit log leak Site B (BUG-7, 8, 9) |
| AC-03 | P0 | ISO-07, ISO-08, ISO-09, ISO-10, ISO-11, ISO-12, ISO-13 | auto | **FAIL**. Delete/status/approve are guarded; save-by-id, exit, relocation and employee edit cross sites; refusals are not audited (BUG-1–4, 14) |
| AC-04 | P0 | STAT-01 (+MAN-02) | static | **FAIL**. The client never sends `siteId`, so Master sees combined data on every site and a multi-site user is pinned to their first site (BUG-18) |
| AC-05 | P0 | ISO-14 (+MAN-03) | auto | PASS (API `/my-sites`; Header filters client-side) |
| AC-06 | P0 | ISO-06 | auto | **FAIL**. Attendant A's plate scan returned 35 other-site employee records with PII (BUG-10) |
| AC-07 | P0 | PERM-01, PERM-02 | auto | **FAIL**. Onboard/status/pricing/users/invoices return 403, but the domain whitelist is editable by Site Admin (BUG-11) |
| AC-08 | P0 | PERM-03 | auto | PASS (API; UI hiding not run) |
| AC-09 | P0 | — | — | BLOCKED (no Employee role/login, OQ-2) |
| AC-10 | P0 | FLOW-29 | auto | PASS |
| AC-11 | P2 | PERM-04 | auto | PASS |
| AC-12 | P0 | FLOW-01 | auto | PASS (API; "without reload" not run) |
| AC-13 | P0 | FLOW-02, FLOW-03 | auto | **FAIL**. Negative or non-numeric capacity and negative rate are accepted (BUG-22) |
| AC-14 | P0 | FLOW-04 | auto | **FAIL**. Entry granted at an ON_HOLD site (BUG-13) |
| AC-15 | P0 | setup + ISO-01, ISO-14 (+MAN-04) | auto | PASS (API: user created with role and sites, signs in, scoped) |
| AC-16 | P0 | FLOW-05 | auto | **FAIL**. Existing slot overwritten; no skipped/failed counts (BUG-17) |
| AC-17 | P0 | FLOW-06 | auto | **FAIL**. No per-row errors; unknown slot type imported (BUG-17) |
| AC-18 | P0 | STAT-02 | static | **FAIL**. `LiveFloorPlan` has no polling or push; refresh only after own actions (BUG-19) |
| AC-19 | P0 | FLOW-07 | auto | PASS |
| AC-20 | P0 | FLOW-09, FLOW-10 | auto | **FAIL**. Unregistered plate and other-site pass both admitted (BUG-5) |
| AC-21 | P0 | FLOW-08 | auto | PASS |
| AC-22 | P0 | FLOW-11 | auto | **FAIL**. Two-wheeler put into a non-2W slot (BUG-16) |
| AC-23 | P0 | FLOW-12 | auto | **FAIL**. `ABCD`, `12345678`, `XX99` accepted (BUG-21) |
| AC-24 | P0 | FLOW-14 | auto | **FAIL**. Exit time and duration OK, but no amount due (BUG-26); the 5 s refresh is the same issue as AC-18 |
| AC-25 | P0 | FLOW-15 | auto | PASS (but see ISO-09: exit by plate is not site-scoped) |
| AC-26 | P0 | FLOW-16 | auto | PASS (whitelist is global, not per site; see BUG-11) |
| AC-27 | P0 | FLOW-17, FLOW-18 | auto | **FAIL**. Bad domain and duplicate plate are refused, but malformed phone and plate are accepted (BUG-23) |
| AC-28 | P0 | FLOW-19 | auto | **FAIL**. Pass created at `site-default`, not Site A; approval not audit-logged (BUG-12) |
| AC-29 | P0 | FLOW-20 | auto | **FAIL**. Reject without reason succeeds (BUG-24) |
| AC-30 | P0 | FLOW-21 | auto | **FAIL**. INACTIVE pass still admitted (BUG-5) |
| AC-31 | P0 | MAN-05 | — | BLOCKED (OQ-2) |
| AC-32 | P0 | FLOW-22 | auto | **FAIL**. Export ignores plate/date filters (site scope OK) (BUG-25) |
| AC-33 | P1 | — | — | BLOCKED (OQ-10; no overstay rule exists) |
| AC-34 | P1 | MAN-06 | manual | NOT RUN |
| AC-35 | P1 | FLOW-23 | auto | BLOCKED on formula (OQ-9); generate and mark Paid PASS. Static: `taxPercentage: 0` is billed at 18% (BUG-30) |
| AC-36 | P1 | FLOW-13 | auto | PASS |
| AC-37 | P1 | FLOW-24 | auto | **FAIL**. No audit entry for entry/exit; audit rows have no site (BUG-15) |
| AC-38 | P1 | STAT-03 | static | **FAIL**. Each row is HMAC'd independently (no chain), so deleted rows go undetected and the result gives a count, not the first broken record (BUG-15) |
| AC-39 | P1 | FLOW-25, FLOW-26, FLOW-27 | auto | **FAIL**. Cross-site retrieval; any status string accepted; no Checked-in state (BUG-6, 27) |
| AC-40 | P1 | FLOW-28 | auto | PASS (Employee visibility not run) |
| AC-41 | P0 | MAN-07 | manual | NOT RUN |
| AC-42 | P0 | MAN-08 | manual | NOT RUN |
| AC-43 | P0 | MAN-09 | — | BLOCKED (OQ-2) |
| AC-44 | P0 | ISO-15 (+MAN-10) | auto | PASS (API returns no data; UI message not run) |
| AC-45 | P0 | MAN-11 | manual | NOT RUN |
| AC-46 | P0 | MAN-12 | manual | NOT RUN |
| AC-47 | P0 | MAN-13 | manual | NOT RUN |

**AC summary (47):** PASS 13 · **FAIL 22** · BLOCKED 5 · NOT RUN 7. **P0 criteria failing: 19.** P0 criteria blocked or not run: 9.

## Test runs (command, pass/fail counts)
All runs were on a clean copy of the working tree with a fresh `npm install` (the repo's `node_modules` is missing, and `npm ci` fails; see BUG-29).

| Command | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **FAIL**: exit 2, **24 errors**, all in `src/components/App.tsx` (stray tracked duplicate of `src/App.tsx` with wrong relative imports; BUG-20) |
| `npm run build` | PASS: exit 0 (web, server and mobile bundles; chunk-size warning only) |
| `node --test tests/qa/001-platform-v1.api.test.mjs` | **48 tests: 21 pass, 27 fail**, ~4 s |

Failing tests: ISO-03, 04, 05, 06, 07, 09, 10, 12, 13 · PERM-02 · FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 19, 20, 21, 22, 24, 25, 27.

### Manual scripts (not executed; run on staging with Site A and Site B)
- **MAN-01 (AC-01):** Log in as Site Admin A. Visit Live Slots, Inventory Master, Employees, Logs, Alerts, Registrations, Reports, Valet, Relocation Logs and Security Audit. Search each for a known Site B plate, slot and employee. Expect 0 hits, and header counts that match Site A totals.
- **MAN-02 (AC-04):** Log in as Master and switch A → B → All sites. Check that every list refetches, shows only B rows, and that "All" labels each row with its site.
- **MAN-03/04/10 (AC-05, 15, 44):** Log in as a 2-site user, a new user and a no-site user. Check the switcher options, the visible modules, and the "no site assigned" message.
- **MAN-06 (AC-34):** Seed 20 known logs for Site A. Compare each report figure with a hand count.
- **MAN-07/08 (AC-41, 42):** Use a new site with 0 slots, 0 requests, 0 logs and 0 alerts. Each screen should show an explanatory empty state, not a blank grid or spinner.
- **MAN-11/12 (AC-45, 46):** Stop the server or turn on airplane mode on the Attendant device, then scan or save. Expect a readable error with retry, and no "Entry Granted".
- **MAN-13 (AC-47):** Expire the session (restart the server, since sessions are in memory), act, sign in again. Expect to land in the same site context.

## Bugs
Each bug is written as steps / expected / actual. Repro = the named test, which runs the exact steps.

- **BUG-1 [Critical] Site Admin can overwrite a Site B slot and move it into Site A.** Steps: Site Admin A `POST /slots/save {slot:{id:<B slot id>, status:"MAINTENANCE"}}` (ISO-07). Expected: 403. Actual: 200; the Site B slot's `siteId` becomes Site A and its status MAINTENANCE. Cause: `enforceSiteScope` injects the caller's `siteId`, then `saveOrUpdateSlot` matches by `id` with no site check.
- **BUG-2 [Critical] Same for employees.** `POST /employees/save {employee:{id:<B employee id>, name:"QA Tampered"}}` (ISO-12). Expected: 403. Actual: 200; the Site B employee is renamed and moved to Site A.
- **BUG-3 [Critical] Attendant A can exit a vehicle parked at Site B.** `POST /vehicles/exit {vehicleNumberOrSlot:<B plate>}` (ISO-09). Expected: refused, B slot still occupied. Actual: 200; the B slot is freed and the B log closed. `processVehicleExit` matches plates across all sites.
- **BUG-4 [Critical] Attendant A can relocate a Site B vehicle into a Site A slot.** `POST /slots/change {vehicleNumberOrSlot:<B plate>, newSlotNumber:"A-03"}` (ISO-10). Expected: refused. Actual: success; the B slot is vacated and A-03 occupied.
- **BUG-5 [Critical] No authorisation check at the gate.** `POST /vehicles/entry` with an unregistered plate (FLOW-09), a plate whose pass is at Site B (FLOW-10), or an INACTIVE pass (FLOW-21). Expected: "not authorised", nothing written. Actual: "Entry Granted", slot occupied. `processVehicleEntry` never checks pass status or site; unknown plates are treated as visitors.
- **BUG-6 [Major] Valet retrieval is cross-site and fuzzy.** Site Admin A `POST /valet/request-retrieval {query:"9111111111"}` against a Site B ticket (FLOW-25). Expected: refused. Actual: the B ticket moves to RETRIEVAL_REQUESTED. The match also uses `includes()` on the plate, so a one-character query hits the first ticket.
- **BUG-7 [Major] Site Admin reads every site's security audit log.** `GET /security/audit-logs` (ISO-05). Expected: own site only, or 403. Actual: Site B user and site activity returned. The site-manager role has SECURITY_AUDIT view, and the log is unscoped.
- **BUG-8 [Major] `GET /slots/change-notifications` is unscoped** (ISO-03). It returns Site B relocations, including driver mobile numbers.
- **BUG-9 [Major] `GET /reports/slot-daily-vehicles?slotId=<B slot>` returns 200 for Site A** (ISO-04). There is no site check on `slotId`.
- **BUG-10 [Major] `POST /vehicles/scan-plate` (no image / fallback path) returns full, unmasked employee records from any site** (ISO-06: 35 foreign records in 40 calls). The fallback picks a random employee from the whole store.
- **BUG-11 [Major] Site Admin can add or remove corporate email domains** (PERM-02, 200). The whitelist is one global list, so Site A's edits change Site B's registration rules. AC-07 and US-13 put this with Master, per site.
- **BUG-12 [Major] Approving a Site A request creates the pass at `site-default`** (FLOW-19). `approveRegistrationRequest` does not pass `req.siteId` to `saveOrUpdateEmployee`. Approve and reject are not audit-logged either.
- **BUG-13 [Major] Entry is accepted at an ON_HOLD site** (FLOW-04). There is no site-status check in the entry path.
- **BUG-14 [Major] Refused cross-site writes are not audit-logged** (ISO-13). `enforceSiteScope` and `denyForeignSite` return 403 silently.
- **BUG-15 [Major] The audit trail does not meet US-18.** Entry and exit are never logged (FLOW-24). Entries have no `siteId`. `verifyAuditTrailIntegrity` checks each row's own HMAC with no link to the previous row, so deleting or reordering rows is undetectable, and it reports a count, not the first broken record (STAT-03). The hardcoded fallback secret is noted in `.env.example` (for security-reviewer).
- **BUG-16 [Major] Wrong vehicle-type allocation.** A TWO_WHEELER entry at a site with no 2W slot gets any vacant slot (FLOW-11). `findBestSlot` falls back to any vacant slot instead of reporting full.
- **BUG-17 [Major] Slot bulk upload overwrites existing slots** (FLOW-05: `floorLocation` became "OVERWRITTEN"). It returns only added/updated counts, silently skips rows without a number, and imports unknown `slotType` values (FLOW-06).
- **BUG-18 [Major] Site switching is broken for Master and multi-site users** (STAT-01). `src/App.tsx` fetchers (lines ~219–259) send no `siteId`. The server then returns all sites for Master and the first assigned site for others, whatever the switcher shows. This is the root cause from KNOWN_ISSUES, and the fix it references (`2472379`) is not in the repo.
- **BUG-19 [Major] The floor plan is not live** (STAT-02). `LiveFloorPlan` (now used for all roles) has no polling or push. The only 8 s poller is in the unused `SiteAdminLiveSlots`.
- **BUG-20 [Major] `npm run lint` fails with 24 errors** from the tracked stray file `src/components/App.tsx`. This breaks the step-4 gate for every feature.
- **BUG-21 [Minor] Plate validation is `^[A-Z0-9]{4,12}$`, not Indian format** (FLOW-12).
- **BUG-22 [Minor] Site onboarding accepts `totalSlots: -5`, `"abc"` and a negative hourly rate** (FLOW-03). `updateSiteStatus` also accepts any status string.
- **BUG-23 [Minor] Registration accepts mobile "not-a-phone" and plate "!!??"** (FLOW-18).
- **BUG-24 [Minor] Reject without a reason succeeds** with the default "Rejected by Parking Admin" (FLOW-20).
- **BUG-25 [Minor] `GET /export/reports` ignores `search` and has no date range** (FLOW-22). It always exports every log of the site.
- **BUG-26 [Minor] Exit returns no amount due** for a site with hourly pricing (FLOW-14).
- **BUG-27 [Minor] `POST /valet/status` stores any string** ("BANANA", FLOW-27). Check-in jumps straight to PARKED, with no Checked-in state.
- **BUG-28 [Major, for security-reviewer] `GET /logs` decides PII masking from client query params `userRole` / `maskPII`** (static, `server.ts` ~1301). `?userRole=MASTER_ADMIN&maskPII=false` unmasks for any caller. This is the same class of bug already fixed in `/employees`.
- **BUG-29 [Minor] `package-lock.json` is out of sync with `package.json`** (missing `tesseract.js@5.1.1` and 9 transitive packages), so `npm ci` fails. The deploy uses `bun.lock`, so the two lockfiles disagree.
- **BUG-30 [Minor] `generateSiteInvoice` uses `taxPercentage || 18`**, so a 0% tax site is billed 18% (static).
- **BUG-31 [Minor] `GET /api/v1/sites` returns every customer site** (names, contacts, pricing) to any signed-in user, attendants included (static).

Also noted, not graded: several record ids use `Date.now()` (`log-`, `req-`, `usr-`, `valet-`). Two writes in the same millisecond collide, which is a risk for fast duplicate submissions.

## Verdict: FAIL
19 P0 criteria fail. That includes the launch blocker **US-01 site isolation** (AC-02, 03, 04, 06), with 4 Critical cross-site write bugs, plus gate authorisation (AC-20, 30) and the lint gate. Another 9 P0 criteria cannot be verified yet (blocked or UI-only). Recommended order: BUG-1–5, BUG-18 and BUG-20 first, then the rest of the P0 list. Then complete steps 2–5 and re-run this suite on the feature branch.
