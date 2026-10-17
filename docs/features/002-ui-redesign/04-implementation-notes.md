# Implementation Notes — 002 UI Redesign & ParkFlows Design System

## Backend
### R1B-S1 production hotfix + R1B-S2 + BUG-R1B-7, backend-dev, 2026-10-17
Built in a separate clone; your checkout stays on `feature/001-parkflows-platform-v1`. **Not pushed, not merged.** The branches came back as refs plus the bundle `pf-r1b-s1-hotfix-a0410b1.bundle` (repo root).

| Item | Branch | Commit |
|---|---|---|
| **R1B-S1** (07, Medium, production hotfix) | **`hotfix/r1b-s1`** from `main` @ `84ec8ef` | **`bbfdbcc`** |
| R1B-S1, same change cherry-picked (`-x`) | `feature/002-r1b` after `535f6fa` | **`cfdff14`** (one conflict in the sign-in gate, resolved: the B6 demo check now uses the same normalised path) |
| **R1B-S2** (07, Low; PRD v1.7/v1.8 m-3) | `feature/002-r1b` | **`9dd406f`** |
| **BUG-R1B-7**, backend half (06) | `feature/002-r1b` | **`a0410b1`** |

**R1B-S1: the sign-in gate and the cold-start guard now decide the same way for every spelling of a path.** I did both of 07's suggestions; together it's still about 20 lines of `server.ts`.
1. **`app.set('case sensitive routing', true)`**, set right after `express()`, before the first `app.use`. Only lower-case paths reach a handler now. Every route is registered in lower case, and the console and the Android app call lower-case `/api/v1/...` (the only capitals in client URLs are inside query strings), so nothing they use changes. `app.use` mounts follow the same rule.
2. **`gatePath()`** lower-cases the path, collapses repeated slashes and drops a trailing slash. The 503 `ERR_STARTING` guard and the sign-in gate (`requireAuth` → view-as → site scope) both decide on it. So `/API/V1/x`, `/Api/v1/X`, `/api/v1/x/`, `//api/v1/x` and `/api//v1/x` are all gated like `/api/v1/x`:
   - protected routes return 401 without a session;
   - during a cold start, they return 503.

   Spellings that no longer route then get the normal "not found".
- **One behaviour change:** public routes now also work with a trailing slash. `POST /api/v1/auth/login/` used to hit the gate as a non-public path (401); it now logs in like the canonical path.
- **Tests:** new **`tests/qa/001-hotfix-r1b-s1.test.mjs` (4 tests; all 4 fail on the old code).**
  - Without a session, 5 protected routes × 8 spellings (upper, mixed, upper prefix, trailing slash, upper + trailing, `//` at the start, `//` after `/api`, `//` after `/v1`) → 401 `ERR_SESSION_EXPIRED`. That includes `/employees/profile`, which used to crash with a 500.
  - A signed-in caller can't reach the role matrix through `/API/V1/rbac/roles`.
  - Public routes still work: health, login, `/login` and login with a trailing slash; `/domains` reaches its handler. Upper-case public paths don't route.
  - During a cold start, 7 spellings → 503 `ERR_STARTING`.
- **Hotfix gates on `bbfdbcc`** (`main` + this commit): `npm run lint` 0 errors; `npm run build` OK; `001-backend` 64/64; `001-hotfix-coldstart` 6/6; `001-hotfix-r1b-s1` 4/4; `001-platform-v1` 42/57, the 15 known FLOW failures.
- **For devops:** no env var, config, dependency, `package.json` or `bun.lock` change. This needs the security delta the PM asked for before it's deployed.

**R1B-S2: the global `/api/` limiter (600/min) no longer runs for a demo POST that passed the demo front door** (the Hosting check plus that route's own per-visitor limit, `res.locals.demoClientKey`). On that path the global limiter was keyed on the Hosting egress address and logged the visitor's user-agent. Any other spelling of the demo path doesn't route; it still counts against the global limit (same buckets), but its audit is redacted.
- **Test (new, in `002-client-ip`):** 606 demo POSTs from 121 visitors in one minute → 605 × 200; the visitor's own 6th post → 429; no `RATE_LIMIT_EXCEEDED` carries a user-agent or an IP. It fails on the old code (the global limiter fired with the user-agent).

**BUG-R1B-7, backend half:** `onboardSite` no longer stores "<city> Parking Complex", "Site Facility Manager", `admin@<code>.com` or `+91 9800000000`. A missing (or non-text) address or contact stays `''`, and entered values are trimmed and kept. **Existing sites aren't changed**, so sites onboarded before this keep their made-up values until someone edits them (B5 Edit site); no backfill is planned.
- **Not changed (outside this item):** the other onboarding defaults that 06 also lists — pricing (₹50/h, ₹350/day, ₹3,000/month, 18%), puzzle/EV flags, total slots and basement levels — and the automatic ₹1,41,600 onboarding invoice. PM to decide whether they need the same treatment.
- **Test (new, in `002-backend.api`):** a bare onboarding stores empty contact fields and none of the four made-up values; entered values are kept trimmed; non-text input is stored as empty.

**Gates on `a0410b1` (feature/002-r1b), per file:**
- `npm run lint` 0 errors; `npm run build` OK; `lint:styles` clean (61 files).
- `001-backend` 64/64, `001-hotfix-coldstart` 6/6, **`001-hotfix-r1b-s1` 4/4**, `002-backend` **21/21**, `002-client-ip` **12/12**, `002-format` 10/10, `002-tokens-styles` 7/7.
- `001-platform-v1` 42/57: the same 15 known FLOW failures (03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27). **0 new failures.**

Builders don't review their own work. **Status: ready for code review** (one-commit review of `bbfdbcc`, plus `cfdff14..a0410b1` on r1b) and the R1B-S1 security delta.

### R1b (B1–B6), backend-dev, 2026-10-11
Branch **`feature/002-r1b`** (devops merge `2937fe6` = 002 @ `b4200a1` + `main` @ `84ec8ef`), one commit per task, **not pushed, nothing on `main`**. Built in a separate clone and fetched into this repo as a branch ref; this checkout stays on `feature/001-parkflows-platform-v1` with its uncommitted files untouched. D1 is not part of this hand-over.

| Task | Commit | What |
|---|---|---|
| B1 | `1ddc787` | `ParkingSlot.lengthM?` / `palletLevel?`; checked on `/slots/save` and bulk upload; `/slots` adds `heightM`; slot save takes an explicit field list (no mass assignment) |
| B2 | `ac1587e` | `src/server/time.ts` (IST, UTC+05:30); `inSince` on occupied slots in `/slots`; peak hours bucketed in IST |
| B3 | `6e16a79` | `GET /api/v1/overview` (today for one site, IST) |
| B4 | `9569105` | `GET /api/v1/sites/summary` (Master); `/analytics/prediction` adds `sample: true` |
| B5 | `1b3745c` | `POST /api/v1/sites/update` (Master) |
| B6 | `4347715` | Demo requests (public form API, Master console API, 12-month expiry) |

#### For devops (release items the hand-off brief asks for)
**New endpoints**
- `GET /api/v1/overview`: needs `siteId` (`ALL` refused, 400), FLOOR_PLAN view; plates masked unless the role may see them.
- `GET /api/v1/sites/summary`: Master only (and not while viewing as a non-Master). Returns a **bare `SiteSummaryRow[]`**, not wrapped.
- `POST /api/v1/sites/update`: real Master + MASTER_CONFIG edit; 400 `{errors}` / 404; audit `SITE_UPDATED` lists field names only.
- `POST /api/v1/demo-requests`: **public** (POST only). `GET /api/v1/demo-requests`, `GET /api/v1/demo-requests/export` (CSV): Master. `POST /api/v1/demo-requests/status`, `DELETE /api/v1/demo-requests/:id`: real Master, refused under view-as.

**Changed endpoints (additive only; the Android app's `/slots` call keeps working)**
- `GET /slots`: adds `heightM` (parsed from `height`), `lengthM`, `palletLevel` when set, and `inSince` on OCCUPIED slots.
- `POST /slots/save`: accepts `lengthM` / `palletLevel`; a bad value gives 400 `{ success:false, message, errors:{field} }`. It no longer copies other body fields (e.g. `cameraNumber`, `currentVehicle`) onto the slot.
- `POST /slots/bulk-upload`: bad rows are skipped and listed in `errors: ["Row n (SLOT): message"]`; old 8-column files behave as before.
- `GET /analytics/prediction`: adds `sample: true`.

**Firestore:** one new collection, **`demoRequests`** (created on first write). No index or `firestore.rules` change.

**Build and dependencies**
- **`package.json`: no script or build-output change** in B1–B6 (`dist/`, `dist-mobile/`, `dist-marketing/` as before).
- **`bun.lock` unchanged** (identical to `main` and to `b4200a1`; lockfileVersion 2). No new dependency, env var or secret.

**Backfill: none.** `lengthM`, `palletLevel` and `inSince` are optional; old slots just don't have them.

**For D1:** `https://parkflows.in` and `https://www.parkflows.in` are already allowed origins, so the rewritten POST passes the cross-origin write block. **Please check on the preview channel that the per-IP limit sees the visitor's IP through the Hosting → Cloud Run rewrite** (`trust proxy` is 1 hop). If it sees a Google front-end address, all visitors share one 5-per-10-minutes bucket.

#### B6 behaviour, as built
- `POST /demo-requests`, in this order:
  1. 5 per 10 min per IP (the 001 limiter);
  2. JSON only (415 otherwise; a GET without a session gets 405 `Allow: POST`);
  3. 8 KB body cap (413; broken JSON 400, plain body);
  4. honeypot `pf_hp_field` filled → 200 `{success:true}`, nothing stored;
  5. per-field 400 `{ success:false, message, errors:{field:message} }`, the same wording as `marketing/demo/demo.js`;
  6. 30 **stored** requests per hour platform-wide → 429;
  7. store → 200 `{success:true}` (nothing echoed). A store failure → plain 500 with no stack or echo.
- Phone numbers are stored as `+91XXXXXXXXXX`. `slotsApprox` also accepts "1,200". The DemoRequest record has **no IP, user-agent or browser field**.
- Hard delete and the 12-month expiry remove the record from memory, the local copy **and** its Firestore document (a new targeted delete that, like every sync, does nothing before the store has loaded). Audits:
  - `DEMO_REQUEST_DELETED`: details "Demo request <id> deleted on request by <email>.";
  - `DEMO_REQUEST_UPDATED`: id and status only;
  - `DEMO_REQUESTS_EXPIRED`: count only;
  - `DEMO_REQUESTS_EXPORTED`: count only.

#### Tests
- `tests/qa/002-backend.api.test.mjs` (new): **19/19**. 13 cover B1–B5; 6 cover B6, named after **AC-32a–d** (the 500 path uses a forced store failure; delete and expiry are checked against the fake Firestore's saved file and after a restart).
- Test support (test-only):
  - `fakeFirestore.mjs`: `persistFile` option;
  - `coldstart-harness.mjs`: `FAKE_DATA_FILE` (start from and save to a JSON file, so a test can "re-load Firestore") and `FAIL_NEXT_DEMO_SAVE=1`;
  - `db.ts`: `__failNextDemoRequestSaveForTests()`, which only the harness calls.
- Runs on `4347715`:
  - `npm run lint` 0 errors; `npm run build` OK; `lint:styles` clean (75/75 self-test, 37 files);
  - `001-backend` 64/64; `001-hotfix-coldstart` 6/6; `002-format` 10/10; `002-tokens-styles` 7/7; `002-backend` 19/19.
  - **`001-platform-v1` 42/57**: the same 15 FLOW failures as on the merge base `2937fe6` before any R1b change (FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27; known 001 Phase 2 items). **So `npm run test:qa` as a whole does not exit 0, on this branch or on its base.** R1b adds no new failure.

#### Gaps and decisions (read these)
1. **`test:qa` is not fully green** (see Tests). Those failures are in 001's FLOW suite and were there before R1b. PM/QA to decide: fix them, or mark them as expected for the R1b gate.
2. **No shared housekeeping job existed**, so the 12-month expiry is its own timer in `server.ts`, in the security module's style. It waits until the store is loaded, runs once, then runs every 24 h. On Cloud Run with scale-to-zero, it runs on every cold start as well, which is harmless.
3. **The global limit counts stored requests only**, so invalid or honeypot posts can't use up the 30 per hour and block real prospects. The per-IP limit counts every post.
4. **The 001 rate limiter's own audit entry** (`RATE_LIMIT_EXCEEDED`) records the IP and user-agent of a throttled caller, as it does for every route. Nothing about the person is in it, and the demo record itself never holds either. **PM/legal to confirm the privacy note's "no IP stored" wording** still holds with that (it is the security log, not the enquiry).
5. **POST is public by method**, not by adding the path to `PUBLIC_API_PATHS` (03's wording). Adding the path would also have made the Master GET public. Without a session, the other methods get 405.
6. **`requireMasterAdminView`** (B4, B6 reads): the real user must be a Master, and while viewing as someone, that user must also be a Master. Otherwise 403 `ERR_MASTER_ONLY`.
7. Not built here: the console page (F10), the marketing form changes (none needed, since the client already sends this shape) and the D1 rewrite.

#### Round 1 fixes (05 "R1b — backend B1–B6 (round 1)"), backend-dev, 2026-10-13
One commit, **`e4b0834`**, on `feature/002-r1b` after the frontend head `d10a055`. Not pushed, nothing on `main`. Built to 03 v1.3 (B6b), which the user's instruction treats as approved; 03's own status line still says "ready for approval".

| Finding | Fix |
|---|---|
| **M-1** | New `src/server/clientIp.ts`: `pickDemoClientIp()` as specified in 03 v1.3. It also has `parseHostingCidrs()` (Node's `net.BlockList`, no dependency) and `normalizeHop()`.<br>- **On Cloud Run** (`K_SERVICE` set), the demo POST trusts the X-Forwarded-For hop just left of the edge hop, **only** when the edge (rightmost) hop is in `DEMO_HOSTING_EGRESS_CIDRS`. Otherwise it returns **403 `ERR_VIA_HOSTING_ONLY`** ("Please use the form on parkflows.in."), with nothing stored and no limiter bucket used.<br>- **Off Cloud Run**, X-Forwarded-For is ignored and the socket address is used.<br>- IPv6 is keyed by its /64.<br>- Order: Hosting check → per-visitor limiter → 8 KB parser → route. The limiter key is `demo:<ip>`, through a new optional `rateLimiterMiddleware(max, window, { key, redactAudit })`; the defaults are unchanged for every 001 route. A 413/415 counts toward that visitor's bucket only.<br>- Until the store has loaded, this front door is skipped and the cold-start guard answers 503 `ERR_STARTING` as before.<br>- `trust proxy` stays 1 and ingress is untouched. |
| **m-3** (PRD v1.7) | The demo limiter's `RATE_LIMIT_EXCEEDED` and the new `DEMO_REQUEST_NOT_VIA_HOSTING` event (status `BLOCKED_UNAUTHORIZED`, reason only) are written with `actor: anonymous`, `ipAddress: 'redacted'`, **no `userAgent` field** and the path without a query string. This uses a new `logSecurityEvent({ redactClient: true })`; `userAgent` isn't in the integrity hash, so verification is unchanged. All other routes keep IP + user-agent. |
| **m-1** | `deleteDemoRequest` is now async. When Firestore is configured, it **awaits** the document delete first. If that fails, or Firestore is unavailable this run, the route returns **503 `ERR_DELETE_FAILED`** ("Couldn't delete the request. Try again."), keeps the record in memory and Firestore, and writes no `DEMO_REQUEST_DELETED` audit. On success it then removes the record from memory and the local copy and returns 200. With no Firestore configured (local dev), memory and the local copy are the only copies. The 12-month expiry is unchanged: it self-heals on the next run, as 05 noted. |
| **m-2** | The `/overview` test's ACTIVE "today" log is now at `max(todayStart, now − 1 h)`, so it is never "parked over 12 h" whatever the time of day. The test only changed; the code was right. |
| **n-2** | `GET /demo-requests?status=<unknown>` → **400** `{ errors: { status } }`. An empty `status` still means all. |
| n-1, n-3 | Not changed (nits; not in this round's brief). |

**For devops (changes to the release items above):**
- **New optional env var `DEMO_HOSTING_EGRESS_CIDRS`** on the Cloud Run service (03 v1.3, rule 5).
  - It is a comma-separated IPv4/IPv6 CIDR list; a bare address counts as /32 or /128.
  - Bad entries are skipped with a startup warning; the valid entries still count.
  - **Unset or empty on Cloud Run → every demo POST gets 403** (fails closed), with a startup warning.
  - Set it before the demo form flag goes ON, then run the 03 v1.3 D1 preview check. This replaces the per-IP check I asked for above.
- **New response codes on `POST /demo-requests`:** 403 `ERR_VIA_HOSTING_ONLY`. On `DELETE /demo-requests/:id`: 503 `ERR_DELETE_FAILED`. New audit action: `DEMO_REQUEST_NOT_VIA_HOSTING`.
- Still unchanged since `d10a055`: `package.json`, `bun.lock`, `firestore.rules`. No new dependency, collection or backfill.

**Gaps 4 and 5 above are now closed:** 4 by m-3 and PRD v1.7; 5 by 03 v1.3, which records "public by method".

**Tests:**
- **New `tests/qa/002-client-ip.test.mjs`: 11/11.**
  - Unit (4): off/on Cloud Run, forged leading entries, every refusal reason, normalisation, IPv6 /64, header lines joined in order, CIDR parsing with bad entries.
  - API (7, server started with `K_SERVICE` + CIDRs):
    - **two visitors through the Hosting hop get separate buckets** (A's 6th → 429, B → 200, B's valid post stored);
    - forged leading entries and the same IPv6 /64 share a bucket;
    - direct, edge-only and no-XFF posts → 403, with no bucket used and nothing stored;
    - redacted demo audit events, while the 001 `/registrations/submit` limiter still audits the rightmost hop and the user-agent (trust proxy 1);
    - 413/415 count for that visitor only, and 35 refused direct posts don't touch the 30/h cap;
    - fails closed (unset, or only bad entries);
    - off Cloud Run, rotating XFF can't dodge the limit.
- **`002-backend.api`: 20/20.**
  - The shared server now runs as Cloud Run with the Hosting range, and demo posts carry `<visitor>, <Hosting hop>`.
  - New AC-32d test: a forced Firestore delete failure (harness `FAKE_FAIL_DELETES=1`; fake Firestore `failDeletes`) → 503, the record is still in the list and in "Firestore", there's no delete audit, and a retry → 200 and the record is gone from "Firestore" before the response.
  - The n-2 check was added to the Master test, and m-2 is fixed.
- **Gates on `e4b0834`:**
  - `npm run lint` 0 errors; `npm run build` OK; `lint:styles` clean (75/75, 61 files).
  - `001-backend` 64/64, `001-hotfix-coldstart` 6/6, `002-format` 10/10, `002-tokens-styles` 7/7, `002-backend` 20/20, `002-client-ip` 11/11.
  - **`001-platform-v1` 42/57, the same 15 known FLOW failures** (03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27). 0 new failures.

Builders don't review their own work: **status is "ready for code review, round 2"** (re-review `d10a055..e4b0834` only).

## Frontend
### R1b frontend — BUG-R1B-6 and BUG-R1B-7 (UI half), frontend-dev, 2026-10-17
Branch `feature/002-r1b`, one commit per bug. HEAD `9ac2843`.
- **Base:** the brief said `535f6fa`, but the branch had moved on to `a0410b1`, adding the backend commits R1B-S1 `cfdff14`, R1B-S2 `9dd406f` and BUG-R1B-7 backend half `a0410b1`. I built on `a0410b1` so the UI half sits on top of its backend half and the branch doesn't fork.

| Commit | Bug | Files | Server | Demo form | Fetch wrapper |
|---|---|---|---|---|---|
| `af5832a` | BUG-R1B-6 | `src/screens/AppShell.tsx`, plus one doc comment in `src/design-system/components/Shell.tsx` | no | no | no |
| `9ac2843` | BUG-R1B-7 (UI half) | `src/screens/Sites/SitePanel.tsx` | no | no | no |

**BUG-R1B-6 (`af5832a`): axe `label-content-name-mismatch` (WCAG 2.5.3) on the bell and account buttons.** Each accessible name now starts with the text the button shows.
- **Bell:**
  - With something pending, the name starts with the badge text, for example "91 notifications: 31 pending pass requests, 60 open alerts".
  - Over 99 it starts "99+ …", matching `CountBadge`; for 1 it says "1 notification: …".
  - With nothing pending the bell shows no text, so the name stays "Notifications: nothing needs your attention".
- **Account:**
  - The name is "DA DigiSolutions Master Admin, Platform Master Admin: account".
  - axe counts the `aria-hidden` initials as visible text, and the two spans had no space between them ("DADigi…"). So the name starts with the initials, and a real space now separates initials and name. The visible text is then "DA" below 1024 px and "DA DigiSolutions Master Admin" from 1024 px. Both match.
  - Layout is unchanged, because a whitespace text node isn't laid out in the inline-flex button.
- **Tests:**
  - A synthetic axe check passes for wide, narrow, single-word and truncated names, and for "91" and "99+".
  - On the real console, the rule passes for Site Admin A, the Master and the Attendant at 360, 768 and 1280.
- **Not changed:** the per-row labels come from the attention list, which says "1 pending pass requests" (plural) for a count of 1. That predates this fix and isn't part of 2.5.3.

**BUG-R1B-7, UI half (`9ac2843`): the Sites panel shows no made-up contact values (AC-04/AC-05).**
- Address, Contact person, Contact email and Contact phone each have their own row, under City.
- Each row shows the entered value, or **"— not entered"**. If `GET /sites` failed, it shows "— couldn't load the site details". Before, the three contact values were joined on one line.
- **Sites onboarded before `a0410b1` still store the made-up values**, because the backend left existing sites alone. The panel treats exactly these four patterns as not entered and nothing else:
  - `<city> Parking Complex`;
  - `Site Facility Manager`;
  - `admin@<sitecode>.com`;
  - `+91 9800000000`.
- **Edit site** leaves those fields blank and shows a note: "Contact details that were filled in automatically when the site was onboarded are left blank here. Saving clears them; enter the real ones if you have them." Saving sends `''`, which `/sites/update` already accepts and stores.
- **Browser checks** (Master; three sites onboarded through the API):
  - A bare site: 4 × "— not entered".
  - A site with the four old made-up values: 4 × "— not entered". Edit site shows blank fields and the note. Saving with only a contact person typed stores `address`, `contactEmail` and `contactPhone` as `''` on the server and the person as entered. The panel then shows the person and 3 × "— not entered".
  - A site with real values: all four shown as entered.
- **Out of scope** (backend note, PM to decide): the billing and puzzle/EV onboarding defaults still show in the panel as entered values.

**Gates** (after each commit; cloud clone; Bun 1.4.2 lockfile):

| Gate | Result |
|---|---|
| `tokens --check` | exit 0 |
| lint (`tsc --noEmit`) | 0 errors (0 new) |
| `lint:styles` | 61 R1 files clean |
| `build` | pass |
| `build:marketing` | flag off pass, flag on pass |
| `test:qa` | 166/181 after each commit (181 tests now with the new backend tests). The 15 failures are the known 001 FLOW ones; 0 new |

**axe** (axe-core wcag2a/aa/21a/21aa/22aa) at 360, 768 and 1280, at HEAD:

| Screen | Roles | Result |
|---|---|---|
| Login, Overview, Live parking, Employees | Site Admin | 0 violations; no sideways scroll, external requests or small targets |
| Sites, Demo requests, Overview, Live parking, Employees | Master | 0 violations; no sideways scroll, external requests or small targets |
| Choose a site, No access | multi-site Site Admin | 0 violations |
| Sites panel: bare, made-up and real values, and the Edit form | Master | 0 violations |

`label-content-name-mismatch` now passes everywhere it failed in 06.

### R1b frontend — QA round fixes (06 "R1b": BUG-R1B-1, BUG-R1B-2, BUG-R1B-3), frontend-dev, 2026-10-15
Branch `feature/002-r1b`, on top of `a94eae5`. One commit per bug. HEAD `535f6fa`.

**Does a commit touch the server, the demo form (`marketing/demo/*`) or the fetch wrapper?** The security reviewer only re-reviews if one does.

| Commit | Bug | Files | Server | Demo form | Fetch wrapper |
|---|---|---|---|---|---|
| `38982d3` | BUG-R1B-1 | `src/App.tsx` | no | no | no |
| `53d8d1d` | BUG-R1B-2 | `src/App.tsx` | no | no | no |
| `535f6fa` | BUG-R1B-3 | `marketing/privacy/index.html` (flag-ON branch only) | no | no | no |

None of the three commits touches the server, the demo form or the fetch wrapper.

- **BUG-R1B-1 (`38982d3`): blank "Loading" at `/` for single-site users.**
  - **Cause (confirmed):** QA's guess was right. `fetchRoles` was guarded by the site request generation. The auto-select of the user's only site (`selectSite`) bumps that generation while `/rbac/roles` is in flight, so the roles answer was dropped. `rolesReady` then never became true and `landingReady` stayed false.
  - **Fix:** `fetchRoles` now has its own request counter, `rolesRequest`, which `clearSession` also bumps, so an old answer is never applied after sign-out. A site switch no longer drops it.
  - **Repro:** `/rbac/roles` delayed 0.8 s in the browser.
    - Before the fix, `qa.atta` and `qa.admina` were blank 4 of 4 times.
    - After the fix, both land on Overview 4 of 4 with the delay and 2 of 2 without it.
- **BUG-R1B-2 (`53d8d1d`): multi-site Site Admin with no remembered site, endless "Loading" at `/`.**
  - **Cause:** the landing page waited for a chosen site, which never comes for a user with several sites until they choose one.
  - **Fix:** "settled" now comes from the site resolution itself. `siteSettledFor` holds `${userId}|${viewAsId}` and is set when the resolution ends (ready, no-site or error). It is reset on sign-out. A user who is settled with no site gets **Choose a site**. Once they choose, the landing page is picked: Overview for a Site Admin (AC-10).
  - **Also:** a page the role can't open now shows **No access** straight away, without asking for a site first. This covers `#/sites` for a Site Admin and unknown routes, so code-review nit **n-5** is fixed as well.
  - **Browser checks (`qa.multiab`):**
    - `/` → "Choose a site", 4 of 4 with slow roles and 2 of 2 without.
    - Choosing site A → `#/overview`, "Overview".
    - `#/sites` → "No access".
    - `#/nope` → "No access".
    - `#/live-parking` → "Choose a site" prompt with the H1 "Live parking".
  - **No regressions:** the Master still lands on Sites. View-as a single-site Site Admin still lands on Overview (`d10a055`).
- **BUG-R1B-3 (`535f6fa`): PRD v1.7 privacy sentence missing from flag-ON `/privacy/`.**
  - **Fix:** the sentence "We don't store your IP address or browser details with your request." in the flag-ON "What we collect" paragraph is replaced word for word with the text from 01-prd "PM decision: IP and user-agent in logs". The page uses straight apostrophes, as the PRD does.
  - **Check:** the browser page text contains the exact PRD string at 360, 768 and 1280.
  - **Flag OFF:** `dist-marketing/` was built before and after the change. `privacy/index.html` is **byte-identical, raw**, without even needing to normalise asset hashes. Every other HTML file matches after hash normalising, and the file list is the same.
  - **Note for DevOps and the PM (no change from me):** the "30 days" depends on DevOps confirming the `_Default` log bucket retention in 08, as the PRD says.

**Gates** (after each commit; cloud clone; Bun 1.4.2 lockfile):

| Gate | Result |
|---|---|
| `tokens --check` | exit 0 |
| lint (`tsc --noEmit`) | exit 0, 0 errors (0 new) |
| `lint:styles` | 61 R1 files clean |
| `build` | pass |
| `build:marketing` | flag off pass, flag on pass |
| `test:qa` | 160/175 after each commit, with the same 15 known 001 FLOW failures and 0 new |

- **`test:qa` note:** on one run after the BUG-R1B-3 edit, the suite hung after test 147 ("AC-32d delete waits for Firestore…") until my 10-minute timeout. A rerun of the same tree passed 160/175 with 0 new failures. That commit only changes marketing HTML, which this suite does not load, so I count it as a one-off hang. QA may want to watch for it.

**axe** (axe-core wcag2a/aa/21a/21aa/22aa) at 360, 768 and 1280:

| Where | Pages | Result |
|---|---|---|
| Console at HEAD | Site Admin: login, Overview, Live parking, Employees. Master: Sites, Demo requests, Overview, Live parking, Employees. Multi-site Site Admin: Choose a site, No access | 0 violations, no sideways scroll, no external requests, no touch target under 24 px |
| `/privacy/`, flag off and flag on | — | 0 violations, no sideways scroll |

### R1b frontend — round 1 fixes (05 "R1b — frontend (round 1)"), frontend-dev, 2026-10-13
Branch `feature/002-r1b`, on top of `e4b0834` (backend B6b, already on the branch). One commit per finding. **Not pushed, not merged.** Brought back as `pf-002-r1b-fe-r1-a94eae5.bundle` (repo root) and fetched into `feature/002-r1b`.

| Finding | Commit | Fix |
|---|---|---|
| **m-1** Billing with no site | `eed000f` | **What changed:** `MasterAdminBilling` loads `GET /invoices` for the chosen site, or `?siteId=ALL` when none is chosen. That is the Master's default state on platform pages, and the route allows `ALL`. It reloads when the site changes.<br>**Before the first successful load:** the three KPIs show "—" instead of ₹0/0/0 (AC-05), and the table says "Invoices couldn't be loaded." instead of "No invoices yet."<br>**Checked in the browser:** with no site chosen there's one call (`/invoices?siteId=ALL` 200) and both sites' invoices are listed. With the call forced to 500, the error banner shows, the KPIs show "—" and there are no zeros. "Mark paid" is unchanged: `/invoices/status` is a platform route with no site. |
| **m-2** pages without an H1 | `a94eae5` | **What changed:** No access, Choose a site and No site assigned now render a `PageHeader` (H1).<br>- No access → "No access".<br>- Choose a site → the requested page's title (e.g. "Users & roles"), or "Choose a site" before a page is known, with the line "This page shows one site's data. Choose a site to continue."<br>- No site assigned → "No site assigned", both the full page and the in-shell version used while viewing as such a user.<br>**Checked at 360/768/1280:** Site Admin on `#/users`, Master on `#/users` with no site, a user with no site. Each has one H1, and focus lands on it after a hash navigation. 0 axe violations, no scroll, text ≥ 12px, no small targets. |

Not changed (nits for R1.1/R2, as 05 says): n-1 account-button label, n-2 `/design-system` gate, n-3 `capacitor.config.ts` appName (R2), n-4 the badge downloads the full NEW list, o-1 R1.1 screens.

**Gates after each fix** (`bun install --frozen-lockfile`, no lockfile change):
- tokens `--check` 0;
- lint 0 errors;
- `lint:styles` clean (61 R1 files);
- build OK;
- `build:marketing` OK with the flag off and on;
- `test:qa` 160/175. The 15 failures are the known 001 FLOW items, the same set as on `e4b0834` (run at 07:46 IST, so the B3 time-of-day flake didn't trigger). **0 new failures.**

**axe at 360/768/1280 on the R1 screens** after both fixes: Login, Overview, Live parking, Employees, Sites, Demo requests, as Site Admin A and as Master on site A. **0 violations**, no horizontal scroll, text ≥ 12px, 0 external hosts, no undersized targets. View-as a Site Admin still lands on Overview.

### R1b (prep, F1–F10, BUG-3), frontend-dev, 2026-10-11
Branch `feature/002-r1b`, built in a separate clone on top of the backend's `4347715` (B1–B6). One commit per task, the F9 deletions in their own commit. **Not pushed, not merged.** Brought back as `pf-002-r1b-d10a055.bundle` (repo root) and fetched into `feature/002-r1b`; this checkout stays on `feature/001-parkflows-platform-v1` and its uncommitted files are untouched.

| Task | Commit | What |
|---|---|---|
| prep | `7a66dd0` | 02 "Design-system decisions after R1-pre" (2026-10-06) applied: tokens.json additions (eyebrow, mono-xs/-xs-strong/-md/-plate, duration-spin, icon-xs/sm/md/lg, checkbox, tile-min-w, slot-card-min, modal-w, measure, underline-offset), components.css = 3-way merge of the reference copy onto the branch (rounds 2/3 kept), marketing/site.css on the new tokens |
| F1 | `afbb9e8` | App shell (TopBar, grouped NavGroupList, NavDrawer < 1024px, PageHeader, SiteSwitcher, ActionMenu "⋯"), `useAutoRefresh`, `guard.ts` → 001 `useWriteGuard`, design-system CSS imported in `index.css`, ToastProvider |
| F2 | `e26af3e` | `routes.ts` hash routes, landing rule, No access in the shell, nav removals/renames, PageHeader wrapper on R1.1 screens, `/design-system` route |
| F3 | `3bf1d2f` | Login |
| F4 | `fa19c3f` | Overview on `GET /overview` |
| F5 | `1293384` | Live parking (cards/list, puzzle wise, modal, paging, filters); Inventory Length / Pallet level + CSV columns |
| F6 | `11b5ed0` | Employees & vehicles |
| F7 | `2715f27` | Sites (+ Edit site via `POST /sites/update`) |
| F10 | `30c5ecf` | Demo requests (Master only), with Delete request |
| F8 | `b110fea` | Honesty and naming pass |
| F9 | `460f4e9` | **Delete commit only**: 19 replaced files, 7,044 lines |
| BUG-3 | `37553ef` | Flag-ON `/demo/`: noscript inline `<style>` → same-origin stylesheet |
| fix | `d10a055` | Landing page waits until the site is settled (found by the view-as browser check) |

**HEAD = `d10a055`.** The order was prep → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F10 → F8 → F9 → BUG-3, as in the hand-off brief (all backend tasks were already on the branch).

#### Gaps and decisions (read these first)
1. **Design-system decisions applied as a prep commit.** In 02 they are still marked "For approval" (2026-10-06), but PRD v1.3 records the user's approval of the UX 02 decisions, and the bar-chart contrast fix (#13: navy-100 bars were 1.3:1) is needed for AC-19. Commit `7a66dd0` is separate, so it can be reverted alone. **UX/PM: please confirm.**
2. **Master nav.** 03's table gives Master only Sites / Users & roles / Billing / Audit log / Settings. 001 AC-24 (All sites lists with disabled writes) needs the Operations pages, so a Master sees every module their role allows, plus the Master-only Setup items: Sites, Billing, Audit log, Settings and Demo requests. Master-only pages check the **viewer**, so viewing as a Site Admin gives No access (001 m-5). Settings = `MasterAdminData`, Audit log = `MasterAdminAudit` (the old SecurityAuditModule tabs); Sites/Billing were the MasterConfigModule tabs.
3. **Platform pages need no site.** Sites, Billing, Audit log, Settings and Demo requests render with no site chosen; the Master lands on Sites (AC-10) with the switcher on "Choose a site". **Users & roles still needs a site** (its 001 sub-pages call site-scoped endpoints); the F2 commit message says otherwise, and this line is the correct one.
4. **Write guard on platform pages.** 001's `useWriteGuard` disables everything when no site is chosen, so on platform pages writes are disabled only while viewing as another user (`isViewAs`), not with `guard`. This includes F10's Delete request (03 asks for `guard`; the effect is the same: disabled in view-as, and the server refuses it anyway).
5. **Site name only in the switcher (AC-23).** 02's copy names the site in a few places ("Today at Alphatech Pune …", "Review pass requests … at Alphatech Pune", "No pending requests for Alphatech Pune"). These now say "this site" / "Today · {date}". In All sites mode one info banner says "You're viewing all sites. Select one site to make changes."; the old eyebrow line is gone.
6. **Login.** A 401 shows "That email and password don't match. Check them and try again." Every other refusal (lockout, rate limit, suspended) shows the **server's own message** (03 gap 6, so no fixed lockout numbers). The **Employee-pass tab is removed**: it only opened the Employee Smart Pass preview, which AC-11 takes out of the console. A user with the Employee role who signs in to the console now gets No access (real Employee login is 001 P2-7). "Forgot password?" opens 001's reset-token form.
7. **Overview "Needs your attention".** `/overview` has no maintenance count, so the card lists pending requests, overstay (> 12 h) and vehicles not parked. A maintenance row needs a backend field (or a `/slots` call per refresh, which NFR-3 argues against).
8. **Sites side panel.** 02 asks for "On hold since {date}". No API field holds the hold date, so the panel shows "On hold. Reason: …" without a date. `onboardSite` (001) also stores made-up defaults ("Site Facility Manager", `admin@<code>.com`, "<city> Parking Complex") that the panel shows as the contact. That is **backend**: new sites should leave these empty.
9. **Employees.** There is no bulk endpoint, so bulk approve/reject loops `/registrations/approve|reject` per request (no API change). Revoked is not shown (03). The domains panel is rebuilt on components (`screens/shell/DomainsList.tsx`) and is also used in the Sites panel (with `?siteId=`).
10. **AC-14** is implemented as amended (paged cards 12/20/36/60, default 20; puzzle view 6 stackers/page, top level first). Puzzle view lists only `parkingType: PUZZLE` slots.
11. **B3 test flake** (code review m-2): "B3 /overview: counts match seeded logs…" fails after 13:00 IST. It fails on the base `4347715` too, so the gate below counts it as a known failure.
12. **NFR-3** (local, same machine and data, median of 4 runs, Site Admin): first contentful paint of sign-in **218 ms vs 162 ms** on the base (+56 ms, the self-hosted fonts and the larger CSS), sign-in → landing page rendered **416 ms vs 408 ms**. Bundles: main JS 518 KB vs 596 KB raw. All JS + CSS gzip is 172 KB vs 183 KB. The FCP difference should be re-measured on the deployed revision. If it holds, preload the two text-font files (no new dependency).
13. **Docs not updated:** `ARCHITECTURE.md`, `README.md` and `KNOWN_ISSUES.md` still name the deleted components (Header, Sidebar, LiveFloorPlan…). They are not frontend files, so they are left for the architect/devops.

#### For devops (hand-off brief items)
- **`package.json`: no script changes. `bun.lock`: unchanged.** No new dependencies, env vars, Firestore rules or deploy config.
- **Build output paths unchanged**: `dist/`, `dist-mobile/`, `dist-marketing/`. New output file: `dist-marketing/demo-noscript.css`, from `marketing/public/`, in both flag builds. It falls under the `**` header rule (no-cache), and nothing needs adding to `firebase.json`.
- **Endpoints the console now calls** (all from B1–B6, nothing new): `GET /overview`, `GET /sites/summary`, `POST /sites/update`, `GET /demo-requests` (+ `?status=NEW` for the badge, every 60 s for a Master), `GET /demo-requests/export`, `POST /demo-requests/status`, `DELETE /demo-requests/:id`. No new Firestore collections from the frontend; **no backfill** (the new slot fields are optional).
- The console title is now "ParkFlows · Console" and the gate page "ParkFlows · Gate". `metadata.json` has a plain description. `capacitor.config.ts` is untouched (R2).

#### Files
- **New:**
  - `src/routes.ts`, `src/utils/useAutoRefresh.ts`, `src/utils/slots.ts`;
  - `src/design-system/components/Shell.tsx`;
  - `src/screens/{AppShell,Login,Overview}.tsx`;
  - `src/screens/shell/{States,DomainsList}.tsx`;
  - `src/screens/LiveParking/{index,SlotsView,PuzzleView,SlotModal}.tsx`;
  - `src/screens/Employees/{index,RequestsTab,RegisteredTab,RejectedTab,AddEmployeePanel,ImportCsvModal,shared}`;
  - `src/screens/Sites/{index,SitePanel}.tsx`;
  - `src/screens/DemoRequests/index.tsx`;
  - `marketing/public/demo-noscript.css`.
- **Changed:**
  - `App.tsx` (routing, shell, data loading);
  - `main.tsx`, `index.css`;
  - `guard.ts`, `rbac.ts` (type import only);
  - `format.ts` (`formatDayDate`, `istHour`);
  - Card (KpiCard `href`), Table (column `width` for NFR-5), SlotCard/SlotRow (`siteCode`, decode line, Size column);
  - R1.1 screens touched only for AC-04/AC-11/F5: AnalyticsPredictive, ParkingLogs, InventoryMaster;
  - naming only: EmployeeMobileApp, AttendantMobileApp, MasterAdminRoles, ValetXModule;
  - `index.html`, `mobile.html`, `metadata.json`, `marketing/demo/index.html`.
- **Deleted (F9):** Header, Sidebar, RoleHomePage, LoginScreen, SiteAdminOverview, LiveFloorPlan, SiteAdminLiveSlots, MasterAdminSites, EmployeeRegistration, DomainWhitelistPanel, MasterConfigModule, SecurityAuditModule, ChooseSite, NoSiteAssigned, NoAccess, ListSkeleton, ErrorCard, SiteSwitcher, ViewAsBanner. Kept on purpose: AttendantMobileApp and EmployeeMobileApp (unrouted, R2 reference) and MasterAdminRelocationLogs (unused before 002).

#### Gates (after every task; the same result each time)
`bun install --frozen-lockfile` (no changes).

| Gate | Result |
|---|---|
| `tokens -- --check` | 0 |
| `lint` | 0 errors |
| `lint:styles` | clean; 61 R1 files at HEAD, including all of `src/screens`, `routes.ts`, `useAutoRefresh.ts`, `slots.ts` (F9: Tailwind defaults are forbidden on every R1 file) |
| `build` | OK |
| `build:marketing` | OK with the flag off and on |
| `test:qa` | 147/163, the same 16 failures as on the base `4347715` (15 known 001 FLOW items + the B3 time-of-day flake), **0 new** |

#### Browser checks
Chromium headless, axe-core (wcag2a/aa, 21a/aa, 22aa), at 360 / 768 / 1280. The server was in memory, seeded with `tests/qa/browser/seed.mjs`.
- **0 axe violations, no horizontal scroll, no text < 12px, 0 external hosts, no undersized targets** on:
  - Login (incl. error and reset);
  - Overview;
  - Live parking (cards, list, puzzle, modal vacant/occupied);
  - Employees (Requests, Registered, Rejected, reject modal, side panel, add panel, domains);
  - Sites (table, panel, edit, status modal, add);
  - Demo requests (table, panel, delete confirm);
  - the shell (switcher open, drawer, account and bell menus);
  - `/design-system`.
- **Flows checked:**
  - Live parking: entry with `targetSlotNumber`, exit, status change, empty filters with "Clear filters", Cards|List remembered after reload.
  - Employees: approve → toast "1 request approved"; bulk reject requires a reason ("Choose a reason. The employee needs to know why.").
  - Sites: Edit site shows the server's field errors; On hold requires a reason; Add site.
  - Demo requests: status → Contacted with a note; Delete → panel closes, row gone, "Request deleted", the badge drops. Site Admin gets No access and no nav item.
  - Routing:
    - deep link survives reload and sign-in;
    - unknown route and forbidden route → No access with "Go to {landing}";
    - Back works;
    - focus moves to the H1.
  - Landing: Site Admin → Overview, Master → Sites, view-as a Site Admin → Overview (after `d10a055`).
- **001 re-run on the new shell:**
  - **Site switch race:** 1.5 s latency on every `/api/v1` response, A→B→A→B 250/300 ms apart on Live parking, Employees, Inventory, Entry/exit log and Overview. 79 samples each: **0 samples with Site A plates under a B chip**, skeletons shown, final screen B only.
  - **All sites:**
    - every guarded control disabled on Live parking, Employees, Inventory, Logs, Alerts, Valet, Reports and Overview;
    - unguarded sweep, clicking every enabled button and the primary button of any dialog: **0 non-GET requests attempted**.
  - **View-as:** bar shown, 0 enabled writes ("Read-only while viewing as another user"), `#/sites` → No access, survives reload, Exit view restores the Master's site.
  - **Session ended:** the token is killed outside the browser. The next refresh shows "Your session ended. Sign in to continue." After sign-in the user is back on `#/logs`, site B.
  - **Sign out** leaves no session or token in storage.
- **BUG-3 / AC-32c (flag ON), under the D1 CSP headers:**
  - JS off at 360/1280: the form is not rendered (no box, no gap) and the email/phone banner shows. 0 CSP or console errors, 0 non-GET requests, 0 query strings.
  - JS on: unchanged.
  - Flag OFF: unchanged (no form, no `demo.js`).
  - No inline `<style>` or `<script>` in any built page.
  - 0 axe violations on `/`, `/demo/` and `/privacy/`.

#### Inline styles (AC-02, F9)
`style={{` in `src` (without `src/server`):
- **806 at the base → 583 at HEAD.**
- R1 files: **0**, apart from the allowed `'--pf-…'` form (Skeleton width, occupancy fill).
- What's left: 349 in R1.1 console screens (largest: SiteAdminReports 106, MasterAdminUsers 53, MasterAdminData 50) and 232 in `src/mobile` (R2).

#### Not done / for others
- **R1.1 screens** keep their own inner headings under the new PageHeader, and some still have a manual refresh button: Inventory, Logs, Alerts, Reports, Valet, Users & roles, Billing, Audit log, Settings, Predictive. AC-11's "one refresh mechanism" is complete only on the R1 screens.
- **Code review M-1** (shared rate-limit bucket behind the D1 rewrite) is backend/architect. It still blocks flag ON together with mail (01 v1.6 gates).

**R1-pre (T1–T6), frontend-dev, 2026-10-06.** Branch `feature/002-design-system` from `main` @ `d42af6f`, one commit per task, **not pushed and not merged**:

| Task | Commit |
|---|---|
| T1 | `9ab49e0` |
| T2 | `965959e` |
| T3 | `38b41f0` |
| T4 | `96d429a` |
| T5 | `b877098` |
| T6 | `2b68077` |

The branch was built in a separate clone and fetched into this repo from `pf-002-design-system-2b68077.bundle` (in the repo root). This checkout stays on `feature/001-parkflows-platform-v1` with its uncommitted edits untouched.

### Gaps found (read these first)
1. **001 is still not merged.** On 6 Oct `main` is `d42af6f`, 58 commits behind `feature/001-parkflows-platform-v1` @ `98c7fcc`. The 5 Oct go/no-go in 03 has passed, so **the 10 Oct date needs a decision (PM/user).** R1-pre is done and waits for the rebase.
2. **`npm run lint` can't pass on a `main`-based branch.** It fails with **24 errors that are already on `main`**, all in the orphan `src/components/App.tsx` (001 T0c deletes it). I can't edit it under "new files only". Every run below shows the same 24 errors and **0 new**. This clears on the rebase onto merged 001.
3. **`test:qa` doesn't exist on `main`** (no script, no `tests/`), so the "current pass count" there is 0.
   - I added `"test:qa": "node --test tests/qa/*.test.mjs"`, character-for-character the same as 001's B12 line, so the rebase merges cleanly.
   - Now: **8/8 pass** (`tests/qa/002-format.test.mjs`). After the rebase it must be 001's count + 8.
4. **Existing npm script changed:** `build` now runs `npm run tokens &&` first, so the generated CSS can't go stale in a deploy. This is the only edit to an existing line in `package.json`. The new scripts are `tokens`, `lint:styles`, `build:marketing` and `test:qa`.
5. **`useWriteGuard` isn't on `main`.** `Button`'s `guard` prop imports `useGuard` from `src/design-system/guard.ts`, a seam that marks `data-write-guard` and doesn't disable anything yet. **After the rebase, replace its body with** `export { useWriteGuard as useGuard } from '../utils/withSite'` (plus the type re-export). The file comment says so. That is the only wiring step.
6. **Tokens: values the approved CSS uses that aren't in `tokens.json`.** Kept as approved (UX to add or confirm):
   - Five off-scale font sizes: 600 12/14 mono (slot code, small), 500 12/14 mono (tile), 700 22/28 display (gate head), 600 18/24 mono (slot code), 600 20/26 mono (slot plate).
   - A few literal metrics in the ported CSS: spinner 800ms, select arrow padding 36px, check box 20px / 1.5px border, tile 48px / 56px min, 14px check icon.
   - Marketing additions: eyebrow tracking 0.08em, text measure 46rem, link underline offset 3px.
   - Media queries use the breakpoint token values as numbers (768/1024/1280), because CSS variables can't be used in `@media`.
7. **44px targets on desktop.** `control-md` is 40px and `control-sm` 32px (tokens: "desktop"), but 03/the rules ask for 44px targets.
   - I added one rule: under `(pointer: coarse)` or below 768px, every button, input, select, segment, page button and close button gets `min-height/size: var(--touch-min)` (44px).
   - On a desktop with a mouse, the token sizes stay. WCAG 2.2 AA (2.5.8) needs 24px, so this passes.
   - **UX to confirm** that 40px on desktop is intended.
8. **Logo files.**
   - The design-system page had the mark (full colour, reversed, single colour) and the 16px favicon as SVG, but **no "full" logo file**. I built `parkflows-logo.svg` and `-reversed.svg` from the mark plus the brand book's wordmark spec: "Park" Sora 700, "Flows" Sora 600, ink or white, outlined to paths so it needs no font.
   - The 16px favicon is the approved simplified drawing, copied as-is.
   - **UX to check the wordmark spacing.**
9. **Fonts.**
   - **Sora:** the upstream repo download was blocked, so it comes from the OFL distribution in `google/fonts` (METADATA points to upstream commit 7f9a9c5). It was instanced to 600/700 and Latin-subset locally. This is not a Google Fonts request.
   - **IBM Plex Sans:** "Plex" is a Reserved Font Name, so I used **IBM's own split WOFF2 files unmodified** (`@ibm/plex-sans` 1.1.0 zip from the official release) rather than re-subsetting them.
   - **₹:** Latin1 has no ₹. Plex Latin2 (has ₹ U+20B9) is declared with `unicode-range` and only downloads on a page that shows ₹. Sora and JetBrains Mono have no ₹; it falls back to Plex.
   - Sources, versions and sha256 are in `src/design-system/fonts/README.md`.
10. **The UX mockup S6 claims more than the product does.** Each line was checked against the 001 code (`server.ts`, `GateTerminal.tsx`, `SiteAdminLiveSlots.tsx`, valet and reports routes). Changes from the mockup:
    - **"Overstay alerts" card dropped.** The per-site limit is 001 P2-3. Replaced by "Many sites, one console" (true today: site switcher, assigned sites).
    - **"updated within seconds" → "The view refreshes on its own"** (it polls every 8 s today).
    - **"approve or reject with a reason" → "approves or rejects each request"**, because the reason is optional ("none given" in the audit).
    - **Reports:** "peak hours" left out (it buckets in UTC, 03 gap 7). The card says "utilisation, occupancy trend and vehicle mix … export the entry and exit log to CSV".
    - **Hero gate card:** "Allowed / Park in B1-042" → **"Entry recorded · KA 05 MN 1234 → B1-042"**, which is what the gate screen shows today (`plate → slot`). This keeps "record entries and exits" and doesn't imply automatic pass checks.
    - **Step 1:** "We add your site, levels and rates. You upload … and invite your site admin" → "We set up your site and your site admin's account. Your admin uploads the slot list as a CSV."
    - **Security:** "Roles you control" → "A role for each person". "Approvals, overrides and gate entries" → "Approvals, rejections and data exports are logged with who and when, and every entry and exit stays in the parking log" (there are no overrides).
    - **Preview:** labelled **"Example"**, with the caption "Example screens … with sample data". No "Updated 4s ago" line.
    - **No "Terms" link**, because the page doesn't exist. Footer: Book a demo, Privacy, Sign in.
    - **PM/user to sign off the copy** before D1 deploys it (03: "every claim is re-checked against the live product before deploy").
11. **The privacy note describes B6 as designed** (no IP stored, Master-only reads, 12-month deletion, deletion on request). It is only true once B6 is built that way. **PM/legal to review the wording** before launch; it is my draft from 03 v1.1.
12. **The demo form can't succeed yet.**
    - `/api/v1/demo-requests` comes with B6 + the D1 rewrite. Until then every submit shows the error state ("We couldn't send your request"), with sales@parkflows.in (a mailto **prefilled with what they typed**) and the phone number. Verified in the browser.
    - When B6 lands, its 400 response should be `{ errors: { <fieldName>: "message" } }` so the page puts each message on its field. The field names are those in the `DemoRequest` type. The client already handles that shape.
    - Two choices for B6 to match: the client sends phone **normalised to `+91XXXXXXXXXX`**, and the slot/site counts as numbers (it accepts "1,080").
13. **The `docs/…/design-system/tokens.json` reference copy** still sits here (untracked). T1 moved the source to `src/design-system/tokens.json`. Per 03, this copy should become a pointer or be deleted when the docs folder is committed, so the two can't drift. I didn't touch the docs copy.
14. **`.gitignore` on `main` doesn't ignore `dist-marketing/`** (nor `dist-mobile/`). I didn't commit any build output. Adding both lines is a one-line change to an existing file, so it's left for the post-merge branch.
15. **Dates use an unpadded day** ("6 Oct 2026") per the UX examples. Times use 24-hour "09:14", in IST everywhere (`format.ts` shifts +330 min, so it doesn't depend on the server timezone).

### Files added, per task
- **T1, token pipeline (AC-01/02):**
  - `src/design-system/tokens.json`, the source (copied unchanged from the approved reference).
  - `scripts/build-tokens.mjs` (Node built-ins only; `--check` exits 1 if a generated file is stale).
  - Generated and committed: `src/design-system/tokens.css` (`:root` vars, `--type-*` font shorthands, reduce-motion block that sets durations to 0ms) and `src/design-system/theme.css` (Tailwind 4 `@theme`, **no default reset**, K3).
  - npm `tokens`; `build` runs it first.
- **T2, fonts and brand:**
  - `src/design-system/fonts/{sora,ibm-plex-sans,jetbrains-mono}/` with the WOFF2 files and `OFL.txt` each.
  - `fonts/README.md` and `src/design-system/fonts.css` (`font-display: swap`, unicode-range).
  - `src/design-system/brand/`: `parkflows-logo.svg`, `parkflows-logo-reversed.svg`, `parkflows-mark.svg`, `parkflows-mark-reversed.svg`, `parkflows-mark-mono.svg` (single colour) and `parkflows-favicon.svg` (16px).
- **T3, component layer:**
  - `src/design-system/components.css`: the approved file inside `@layer components`, without the Google `@import` and the 16 `.is-*` preview selectors.
    - Font shorthands now use `--type-*` tokens; the select arrow is a currentColor mask (no colour literal).
    - Added on tokens only: `pf-seg`, `pf-level`, `pf-bulkbar`, `pf-drawer`, `pf-dialog` (modal/panel), `pf-occ`, `pf-bars`, `pf-toast-region`, table extras (sort, select column, phone cards) and `pf-sr-only`.
  - `scripts/check-styles.mjs` with the R1 file list from 03, plus `marketing/`. npm `lint:styles` runs a 17-case self-test first.
    - It flags inline `style={{}}` unless every key is `--pf-*`, any non-literal `style={…}`, HTML `style=` attributes, and scripts that set `.style.x`.
    - It also flags hex/rgb/hsl literals, Tailwind arbitrary values `-[…]`, non-token colour utilities, Tailwind default text sizes, and mono fonts outside PlateText/SlotCode/IdText.
- **T4, components 1–4 and format:**
  - `src/design-system/components/`: `Icon`, `Button` + `IconButton` (variants, sizes, loading, `guard`), `Field` / `TextField` / `Select`, `Checkbox` / `Radio`, `StatusChip` / `CountBadge` / `SiteTag`, `PlateText`, `SlotCode`, `IdText`, `Banner` / `ViewingAsBar`, `Toast` (provider + hook), and `States` (EmptyState, ErrorState, Skeleton).
  - Also `cx.ts`, `index.ts`, and `src/design-system/guard.ts` (gap 5).
  - `src/utils/format.ts`: IST date/time, `formatINR` with ₹ Indian grouping, durations, ago, plates, enum words, status tone.
  - `tests/qa/002-format.test.mjs`: 8 tests, which pass under TZ=UTC, America/Los_Angeles and Asia/Kolkata.
  - `src/design-system/preview/{DesignSystemPreview.tsx, sections14.tsx}`: the `/design-system` preview component, **not routed** (F2).
- **T5, components 5–7:**
  - `Card` / `KpiCard` ("—" + reason, loading), and `Tabs` / `TabPanel` / `SegmentedControl` / `LevelButtons` (roving arrow, Home and End keys).
  - `Pagination` (12/20/36/60, ellipsis) and `Table` (sort with aria-sort, select-all with indeterminate, row menu, 5 skeleton rows, empty, phone cards below 768px; a dev warning above 7 columns) with `BulkBar`.
  - `Dialog.tsx`: `Modal` and `SidePanel` on native `<dialog>` with `showModal()`. They close on Esc and on a backdrop click, and focus goes back to the opener.
  - `SlotCard` (all statuses + compact pallet), `SlotRow`, `Charts.tsx` (`OccupancyBar` as role=meter, red at ≥90%; `BarChart` with peak bar, value labels and an sr-only data table), and `preview/sections57.tsx`.
- **T6, parkflows.in (AC-30):**
  - `marketing/index.html` (S6, gap 10 copy), `marketing/demo/index.html` + `demo.js` (form), and `marketing/privacy/index.html`.
  - `marketing/site.css` (layers: base → components → site; tokens only) and `marketing/site.js` (nav drawer on `<dialog>`, progressive).
  - `marketing/partials/{head,header,footer}.html`: the shared header and footer, inlined at build time.
  - `marketing/public/{robots.txt, sitemap.xml, og-image.png}`. The OG image is 1200×630, drawn in Chromium from the reversed logo, tokens and fonts.
  - `marketing/vite.config.mjs`: a multi-page Vite build into `dist-marketing/`. It has no plugins from npm; one inline transform inlines the partials and the lucide icons from the already-installed `lucide-react`.
  - npm `build:marketing`.
  - **Demo form:** fields, consent line, privacy link, and the success and failure copy from 03 v1.1.
    - Client checks mirror the B6 rules: name 2–80, company 2–120, email, phone +91/10 digits, facility list, counts 1–1,00,000, message ≤1,000 with a counter, consent.
    - Honeypot `website` (off-screen, `tabindex=-1`, `aria-hidden`), JSON POST, and a `noscript` fallback with the email and phone.
  - "Sign in" → `https://admin.parkflows.in/`.
  - Contact details appear in the band and the footer: `mailto:sales@parkflows.in`, `tel:+919820603518`.

### Commands and results (after each task)
Run on the branch in the cloud clone (Node 22, Bun 1.4.2). Same results each time:

| Command | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| `npm run tokens -- --check` | pass | pass | pass | pass | pass | pass |
| `npm run lint` | 24 pre-existing (orphan `App.tsx`), **0 new** | same | same | same | same | same |
| `npm run lint:styles` | (from T3) | — | clean | clean | clean (27 files) | **clean (37 files)**, self-test 17/17 |
| `npm run build` | pass | pass | pass | pass | pass | pass |
| `npm run build:marketing` | — | — | — | — | — | **pass** (`dist-marketing/`, 3 pages) |
| `npm run test:qa` | 0 (none on main) | 0 | 0 | **8/8** | 8/8 | **8/8** |

`test:qa` was also run on this machine's Node 22.23.2 from the fetched branch: **8/8 pass**.

### Browser checks (Chromium, axe-core wcag2a/aa/21a/aa/22aa, Lighthouse 12)
- **`/design-system` preview** (built with a throwaway harness outside the repo, because the page isn't routed yet), at 360 / 768 / 1280:
  - No horizontal scroll; smallest text 12px; **no external hosts**; **0 axe violations**; all 7 font faces load from `fonts/`.
  - Focus ring: 2px white + 2px teal on every control.
  - Modal and SidePanel close on **Esc** and on an **outside click**, and focus returns to the opener.
  - The required-reason modal shows its field error.
  - Tabs move with the arrow, Home and End keys.
  - Every control is **≥44px at 360px**, except inline text links (exempt). Checkbox and radio labels are 44px rows.
  - Toasts land in the status and alert regions. With reduce-motion, `--duration-base` is 0.
  - Fixed during checks:
    - The segmented control pointed `aria-controls` at a missing panel. Now there is a `hasPanels` prop, and it is off for Cards/List.
    - Banner and toast close buttons were 20px. Now 32px on desktop and 44px on touch.
- **parkflows.in** (`dist-marketing/` served statically), at 360 / 768 / 1280, on `/`, `/demo/` and `/privacy/`:
  - No horizontal scroll; smallest text 12px; **no external hosts** (no Google Fonts, no analytics); **0 axe violations**; no console errors.
  - **Lighthouse accessibility 100 on all three pages**, mobile and desktop (03 asks for ≥95). SEO 100, best practices 100. Performance 87–100, served without compression.
  - The nav drawer appears below 1024px. It opens, sets `aria-expanded`, closes on Esc, on an outside click and when a link is followed, and returns focus to the menu button. "Sign in" goes to admin.parkflows.in.
  - **Form:**
    - An empty submit shows 7 field errors and focuses the first. Bad values give their messages; the counter shows "1,001 / 1,000".
    - **The real POST (no endpoint yet) shows the error state** with a prefilled mailto, and focus moves to it.
    - With mocked server responses: a 400 with `errors` puts the message on the field; a 429 shows "Too many requests right now"; a 200 with `success:true` shows "Thanks — we'll contact you within one working day." and focuses it.
  - Fixed during checks: the site's plain `a { color }` rule beat the layered `.pf-btn` colour and hid the button text. The site CSS is now in `@layer base / site` around `components`.

### Not done / for others
- **Rebase onto `main` after the 001 merge:** wire `guard.ts` (gap 5), then F1/F2 route `/design-system` and use the shell. Nothing is wired into `App.tsx` (as instructed).
- **Hosting (D1, devops):**
  - Second Firebase Hosting site, the `/api/v1/demo-requests` rewrite, and moving the parkflows.in domain.
  - Read the current `website` folder for carry-over items (legal pages, analytics, DNS). I didn't open it.
- **B6** (endpoint), **F10** (console page).
- **PM:** copy sign-off (gap 10), privacy wording (gap 11), US-18/AC-32, AC-14.
- **UX:**
  - Off-scale font and metric tokens, and the desktop 40px controls (gaps 6–7).
  - The wordmark (gap 8).
  - Fold the new classes (seg, level, bulkbar, drawer, occ, bars, dialog) back into the reference page.
- **Not done by me:** no push, no merge, no PR. The docs copy of `tokens.json` is unchanged (gap 13). `.gitignore` is unchanged (gap 14).

### Round 1 fixes (05-code-review.md round 1), frontend-dev, 2026-10-06
On `feature/002-design-system`, **one commit per finding**, on top of `2b68077` (`e4fa4b1..e449b82`, 12 commits). Not pushed or merged. Fetched into this repo from `pf-002-round1-e449b82.bundle`.

| Finding | Commit | What changed |
|---|---|---|
| **M-1** demo form → personal data in a URL | `e4fa4b1` | **`marketing/demo/index.html`:** the form ships `hidden`, with `method="post"` and **no** `novalidate` attribute. **`demo.js`:** sets `form.noValidate = true` and reveals the form only once it owns submit. Without JS (or before, or if, the module fails to load) only the `<noscript>` email/phone fallback is shown. |
| **M-2** AC-30 claims | `35d65e0` | **Employee passes card:** "Your site admin adds employees and their vehicles, one at a time or from a CSV, and approves or rejects each pass request."<br>**Step 2:** now "Add your employees", with the same sentence ending "approves each pass request".<br>**Valet:** "…and log retrieval requests at the valet desk." |
| **m-8** "stays in the parking log" | `a3eae49` | "…and every entry and exit **is recorded in** the parking log." |
| **M-3** `lint:styles` bypasses, K3 | `ca5fd84` | **Inline styles:**<br>- JSX `style={{…}}` with any spacing, and `.jsx` files;<br>- `style:` keys in **any** object literal (createElement props, spread props, plain objects), under the same `--pf-*`-only rule;<br>- the `{ style }` shorthand and `style: <expression>`;<br>- HTML `style=` in any letter case, quoted or not;<br>- DOM writes: `.style.x =`, `.style[…]`, `.style =`, `cssText`, `Object.assign(el.style…)`, `setAttribute('style'…)`, and `setProperty` of anything but `--pf-*`.<br>**Colours:** `oklch/oklab/lab/lch/hwb/color-mix/color()`, plus the **148 CSS named colours** in CSS declarations and HTML `<style>`, in colour attributes (`fill/stroke/color/stop-color/…`) and as string literals in code.<br>**K3:** these are now flagged:<br>- `rounded-*` / `shadow-*` values that aren't tokens.json names (allowed: `rounded-sm/md/lg/xl/full/none`, `shadow-1/2/3/focus-ring/none`, read from tokens.json);<br>- bare `rounded` / `shadow` in class strings;<br>- every `leading-*` and `tracking-*`;<br>- `font-thin…font-black` and `font-sans/serif`;<br>- the same inside CSS `@apply`.<br>**Self-test 17 → 57 cases:** one per bypass in M-3, plus checks that false positives don't fire (`var(--navy-600)`, prose like "amber", "a rounded card…", `content: "red"`). The 37 R1 files stay clean. A seeded probe file in `src/design-system/` and `marketing/` tripped 16 problems, then was removed. |
| **m-1** Dialog edge cases | `5e79443` | `useDialog` now handles every way a dialog can close:<br>- **native close we didn't start** (close-watcher, nested `form method="dialog"`): the `close` event calls `onClose` while `open` is still true;<br>- **backdrop:** closes only when the press both **started and ended** on the `<dialog>`;<br>- **focus:** returns to the opener on native close and on unmount. |
| **m-2** toast timing (WCAG 2.2.1) | `7731128` | A toast with an action (Undo / Try again) **stays until closed** by default, and never closes itself in under 10 s. All timers **pause** while the pointer or focus is in the toast region and resume on leave. The paused state resets when the region empties. |
| **m-3** `aria-label` on spans | `4206884` | `CountBadge`: visible count `aria-hidden` + visually hidden "128 pending requests". `KpiCard` empty: "—" `aria-hidden` + hidden "No data". |
| **m-4** tab stop; tab without a panel | `c7cfd60` | `Tabs`, `SegmentedControl` and `LevelButtons` give `tabIndex=0` to the selected item if it is enabled, otherwise to the **first enabled** item.<br>`SegmentedControl hasPanels={false}` (Cards / List) is now `role=radiogroup`/`radio` with `aria-checked`; with panels it stays a tablist. CSS: `.pf-seg-btn[aria-checked="true"]`. Preview example added. |
| **m-5** "−0", "1e,+21" | `ee882e1` | The sign is decided after rounding (−0.4 → "0", −0.001 → "₹0"). Values ≥ 1e21 → "—". New test; **test:qa 8 → 9**. |
| **m-9** "In since" with no date | `4a6fefe` | New `formatSince()` in `format.ts`: the time alone when it is **today in IST** ("09:14"), otherwise "3 Oct 2026, 09:14". Used by `SlotCard` and `SlotRow`. Test covers the IST-midnight edges; **test:qa 9 → 10**. **UX to confirm the wording.** |
| **m-6** honeypot name | `8a57257` | The field is now `name="pf_hp_field"`, label "Leave this empty", plus password-manager ignore hints. **Contract change for B6 / architect:** 03 v1.1 says the honeypot field is `website`; **B6 must read `pf_hp_field`** (03 to be updated by the architect). |
| **m-7** `new Function` in the marketing build | `e449b82` | The build-time icon helper does `await import()` of each lucide icon module and reads its exported `__iconNode`. The hook is async. **Built HTML is byte-identical** to before. |
| m-10, m-11 | — | Deferred to the rebase, as agreed: `eol=lf` comes with 001 T0b, then CI runs `tokens -- --check` before `build`; `engines.node >=22.18` comes with 001's Node pin. |

**Commands (on `e449b82`):**

| Check | Result |
|---|---|
| `npm run tokens -- --check` | pass |
| `npm run lint` | the 24 pre-existing errors in `src/components/App.tsx`, **0 new** |
| `npm run lint:styles` | self-test **57/57**, **37 R1 files clean** |
| `npm run build` | pass |
| `npm run build:marketing` | pass |
| `npm run test:qa` | **10/10** (was 8; +2 tests, none lost), also under TZ=UTC, America/Los_Angeles and Asia/Kolkata |

**Browser checks (Chromium):**
- **M-1:**
  - With JavaScript **off**, `/demo/` shows no form and no Send button, and the noscript email/phone banner is visible. The form markup is `method=post` without `novalidate`, and no URL with a query string ever appears.
  - With `demo.js` **blocked** (simulating a slow or failed load), the form stays hidden. Forced visible and submitted natively, it goes out as a POST and the URL stays `/demo/`.
  - With JS on, `noValidate` is true, an empty submit shows 7 field errors, and the page doesn't navigate.
- **Demo form after m-6:** the payload carries `pf_hp_field: ""`. Error state with prefilled mailto ✓, mocked 200 success ✓.
- **Marketing** (`/`, `/demo/`, `/privacy/` at 360/768/1280): no horizontal scroll, smallest text 12px, **no external hosts, 0 axe violations**, no console errors. **Lighthouse:** accessibility / best practices / SEO **100** on `/` and `/demo/`. Nav drawer ✓.
- **Preview** (harness build, 360/768/1280): no overflow, 12px minimum, **0 axe violations**.
  - **m-1:** after a native `dialog.close()` and after a `form method="dialog"` submit, the modal **reopens with one click** and focus returns to "Reject". A drag from the content onto the backdrop **stays open**. A backdrop click and Esc still close.
  - **m-2:** the Undo toast is still shown after 5 s. A plain toast survives 5 s of hover and closes about 4 s after the pointer leaves.
  - **m-3:** the badge reads "3 pending requests" from real text, and the empty KPI reads "No data".
  - **m-4:** the fallback example gives the first enabled tab `tabIndex=0`. Layout is a `radiogroup`, and ArrowRight moves to and selects "List". View stays a `tablist`.
  - **m-9:** "In since 3 Oct 2026, 09:14" for older entries, time only for today's.
  - The T5 checks still pass: SidePanel/Modal Esc and outside click, focus restore, 44px targets at 360.
- **Found and fixed during checks:** my preview's fallback example selected a tab with no panel (axe `aria-valid-attr-value`). The example now renders the panel, as real usage would.

**For others:**
- **Architect:** in 03, rename the honeypot `website` → `pf_hp_field` (m-6).
- **PM:** the M-2 copy changes are covered by your approval of "the trimmed copy". Re-check if you want the exact sentences.
- **UX:** "In since" wording (m-9).
- **Code reviewer:** round 2 covers the 12 fix commits `e4fa4b1..e449b82` only.

### Round 2 fixes (01 v1.3 R1a + PM sign-off + bug triage, 02 decisions 2026-10-08, 05 round 2, 06), frontend-dev, 2026-10-08
On `feature/002-design-system`: **one commit per task** on top of `e449b82`. **Branch HEAD `83402a2`.** Not pushed or merged. Brought back as `pf-002-round2-83402a2.bundle` (repo root) and fetched into `feature/002-design-system`.
(An earlier round-2 attempt on 7 Oct, `6e3d0bd..e995a91`, was never fetched into this repo. It is superseded by these commits, which re-apply that work adjusted to 01 v1.3 and the UX 02 decisions, plus the new R1a flag.)

| # | Task | Commit | What changed |
|---|---|---|---|
| 1 | **O-3** reports card | `be511f2` | `marketing/index.html` reads exactly "Utilisation, occupancy trend and the mix of registered and visitor vehicles for your site. Export the entry and exit log to CSV." |
| 2 | **BUG-1 / NFR-4** touch targets | `a27fdf1` | Per UX 02 §2.<br>**`.pf-check`:** on touch or below 768px every row is ≥44 wide. A label-less row (table card, table column) centres its 20px box in a **44×44** hit area. Table-row checkboxes and sort-header buttons are also 44px on touch tablets, because the desktop "row is the target" rule no longer applies there.<br>**`.pf-link` is standalone by default:** `inline-flex`, `min-height` 24px with a mouse, 44×44 on touch or below 768px. Text and underline don't move ("Forgot password?" 115×20 → **115×44** touch / 115×24 mouse).<br>**Exempt** (part of a sentence): the new **`.pf-link--inline`** opt-in class, or a link inside `.pf-field-help` / `.pf-state-text` (and `.mk-prose` on the marketing site). The preview has an in-sentence example. |
| 3 | **R1a contact panel** (01 v1.3) | `e5d97f6` | **One build-time flag, `PF_DEMO_FORM`**, off unless `1`/`on`/`true`/`yes`. `marketing/vite.config.mjs` resolves `<!-- @if demo-form --> … <!-- @else --> … <!-- @endif -->` before Vite processes the page; an unknown flag or unbalanced block fails the build.<br>**Off (default, 10 Oct):** `/demo/` is built with a **"Write or call us" contact panel**: `mailto:sales@parkflows.in` and `tel:+919820603518` as 44/48px buttons, and **no form**. The `demo.js` script tag is dropped, so it is **neither bundled nor requested**. Every "Book a demo" link already points to `/demo/`. Meta and OG descriptions don't promise a one-day reply in this mode.<br>**On** (`PF_DEMO_FORM=1 npm run build:marketing`): the form page as before (AC-32, 05 M-1).<br>Privacy note copy unchanged. |
| 4 | **BUG-2 / NFR-1** CLS and performance | `577b5ab` | **All pages:** a metric-matched **"Sora Fallback"** face sits second in the display font stack, so headings wrap the same before and after Sora loads. It's local Arial / Liberation Sans / Roboto Bold with `size-adjust` and ascent/descent overrides computed from the Sora 600/700 files over the site's heading text. The four above-the-fold faces (Sora 700, Plex 400/500/600 Latin1) are preloaded from the shared head, with the same hashed URLs as the CSS.<br>**`/demo/` with the flag on:** the form is laid out from the start but invisible and `inert` until `demo.js` takes over (no shift on reveal). A `<noscript>` style, in form builds only, removes it without JS, which keeps M-1. |
| 5 | **R2-1 / R2-2** `lint:styles` | `83402a2` | **R2-1:**<br>- arbitrary properties `[color:red]` / `hover:![border-radius:7px]` (no whitespace inside, so `[key: string]` isn't flagged);<br>- the Tailwind 4 shorthand `p-(--x)` / `bg-(--brand)`;<br>- `drop-/text-/inset-shadow-*` and the bare forms; tokens define box shadows only.<br>**R2-2:** code files are stripped of comments by a small scanner that knows `'…'`, `"…"` and `` `…` `` literals, so `"a//b"`, `src="//cdn…"` and `'x/*y'` no longer hide the rest of the line. URLs after `:` in JSX text are still not comments.<br>**Self-test 57 → 75.** QA's `tests/qa/002/tokens-styles.test.mjs` is **adopted as `tests/qa/002-tokens-styles.test.mjs`**, with the seven pinned probes of #8 moved into `SEEDED` and the known-misses test removed. It **fails against the previous script** and passes now. QA's original file in the working copy is untouched. |

**Token change, for UX's records:** `tokens.json` `type.families.display` is now `"Sora", "Sora Fallback", "IBM Plex Sans", system-ui, sans-serif`. `tokens.css` and `theme.css` were regenerated (`--check` ok). It has no visible effect once Sora has loaded.

**How to build each way:**
- `npm run build:marketing` gives R1a, the contact panel.
- `PF_DEMO_FORM=1 npm run build:marketing` gives the form; use it once B6 + D1 are live.
- DevOps: deploy the default build on 10 Oct.

**Gates after every task** (`tokens -- --check`, `lint:styles`, `build`, `build:marketing`, `test:qa`, `lint`) all passed. **Lint showed the 24 pre-existing `src/components/App.tsx` errors and 0 new** after each task.

| After task | lint:styles | test:qa |
|---|---|---|
| 1–4 | 37 R1 files clean | 10/10 |
| 5 | self-test 75/75, 37 files clean | **17/17** (10 + 7 adopted) |

**Browser checks** (Chromium 141, axe-core wcag2a/aa/21a/aa/22aa, Lighthouse 12):
- **0 axe violations, no external hosts, no horizontal scroll, text ≥12px** at 360/768/1280:
  - flag-off build: `/`, `/demo/`, `/privacy/`;
  - flag-on build: the same three pages;
  - the `/design-system` preview.
- **Lighthouse, python static server (no compression), CLS and performance, mobile/desktop:**

| Page | Flag off | Flag on |
|---|---|---|
| `/` | CLS 0.000/0.000, perf **96/100** | 0.000/0.000, **96/100** |
| `/demo/` | 0/0, **99/100** | 0.001/0, **98/100** |
| `/privacy/` | 0.001/0, **99/100** | 0.001/0, **99/100** |

  Accessibility, best practices and SEO are 100 everywhere. Before the fix (06), `/demo/` was CLS 0.60/0.37 and performance 76/82. **NFR-1 lab gate met on all 12 runs.**
  - Home mobile LCP is 2.56 s uncompressed; **2.0 s (performance 99) through a gzip static server**, as Firebase Hosting will serve it.
- **R1a flag off** (`/` and `/demo/`, JS on and off, 360/1280): every "Book a demo" link → `/demo/`. `/demo/` has **no `<form>`**, the contact panel is visible, mailto/tel buttons are 219×44 and 206×44 (48 tall at 1280), and **`demo.js` is never requested**.
- **Flag on, M-1 re-checked** (360 and 1280):
  - **JS off:** the form is `display: none` and the noscript email/phone show.
  - **demo.js blocked:** the form is invisible and inert. Tab never enters it, clicking and typing where it sits does nothing, and Enter sends nothing.
  - **All cases:** **no non-GET request and no query string.**
  - **JS on:** 7 errors on an empty submit, the payload carries `pf_hp_field`, and 400 (field message), 429 and 200 (success) all behave as before.
- **44px:** at 360 and 768 with touch, nothing interactive is under 44×44. The only smaller item is the in-sentence `.pf-link--inline` example, which is exempt by NFR-4.

**For others:**
- **QA:**
  - `browser/components.mjs` 44px check should exempt `.pf-link--inline` and links in help text (NFR-4 wording).
  - Its "axe modal open" should wait out the 200 ms fade.
  - Run NFR-1 on the D1 preview channel with the default (flag-off) build.
- **DevOps:**
  - Deploy the default build for R1a.
  - Add `dist-marketing/` and `dist-mobile/` to `.gitignore` after the rebase (06 O-4).
- **UX:** note the display-stack token change.

### Round 3 fix (01 v1.5 "PM copy for R1a"; 05 round 3 R3-1, R3-2, R3-3, R3-7), frontend-dev, 2026-10-09
**One commit: `b4200a1`** on `83402a2`; **branch HEAD `b4200a1`**. Not pushed or merged. Fetched from `pf-002-r3fix-b4200a1.bundle` at the repo root.
- **R3-1 `/privacy/`:** gated by the `demo-form` flag.
  - **Flag OFF** (R1a default build) carries the PM's sentences exactly: intro, what we collect, why we use it, who can see it, how long we keep it, and asking us to delete it sooner, with the mailto subject **"Delete my enquiry"**. Cookies/tracking and Contact are unchanged.
  - **Flag ON** keeps the current form-based text.
  - The page's meta description is gated the same way. Its flag-off wording ("What ParkFlows does with the details you send when you email or call us about a demo.") follows the PM's intro; **PM may want to confirm it.**
- **R3-7:** the flag-OFF `/demo/` "What happens next" reads "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it." Flag ON is unchanged.
- **R3-2:** `.mk-logo` is a 44px-tall target on touch or below 768px (`site.css`): **106×44** at 360, **142×44** at 768 with touch, 142×32 with a mouse.
- **R3-3:** `.pf-table th button.pf-sort` gets `min-width: var(--touch-min)` on touch. A short label ("Lv", like the reviewer's "Plate" 31×44) is now **44×44**; mouse sizes are unchanged.
- **Checks:**
  - **PM copy:** all 7 PM sentences were found verbatim in the built flag-off pages (script check against `01-prd.md`).
  - **Gates:** `tokens --check`, `lint:styles` (37 files clean), `build`, `build:marketing` with the flag **off and on**, and `test:qa` **17/17** all pass. Lint shows the 24 pre-existing `App.tsx` errors and **0 new**.
  - **Axe:** 0 violations, no external hosts and no horizontal scroll at 360/768/1280, on `/`, `/demo/` and `/privacy/` for both builds and on the preview.
  - **Lighthouse is unchanged.** CLS ≤ 0.004 and performance 96–100 on all three pages, mobile and desktop, for both builds.
- **Not in this commit, per the triage:** BUG-3 (the noscript inline `<style>` vs the D1 CSP) is due before the flag is turned on (R1b). R3-4..R3-6 are deferred to R1.1.

## Mobile
Not in R1-pre (R2).

## Build/lint results
See the Frontend table above. On the R1-pre branch: tokens `--check` pass · lint 24 pre-existing / 0 new · lint:styles clean (37 files) · build pass · build:marketing pass · test:qa 8/8.
