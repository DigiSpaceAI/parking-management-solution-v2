# Security Review — 002 UI Redesign & ParkFlows Design System

## R1b — 2026-10-15 · `feature/002-r1b` @ `a94eae5`
Reviewer: security-reviewer · Step 7 · Inputs:
- `01-prd.md` **v1.7** (AC-32a–d, m-3 decision);
- `03-tech-design.md` **v1.3** (API contracts, "Site scoping & authorisation", "Marketing site", "Demo-request client IP behind Firebase Hosting", m-3);
- `04-implementation-notes.md` (B1–B6, B6b, F1–F10);
- `05-code-review.md` (R1b rounds 1–2, APPROVED);
- `06-test-report.md` (R1b);
- `d1/firebase.json`.

### Gaps found in inputs
1. **There is no "commit QA passed" for R1b.** QA's only R1b run (`06`, 14 Oct) tested `a94eae5` and returned **FAIL** on three Majors:
   - BUG-R1B-1 and BUG-R1B-2: blank landing page;
   - BUG-R1B-3: the flag-ON privacy sentence is missing.
   `feature/002-r1b` has no commit after `a94eae5`. I reviewed **`a94eae5`**, the commit QA tested and code review approved.
   The fixes for BUG-R1B-1/2 are console landing code. They need **no** security re-review unless they touch `server.ts`, `src/server/*`, `marketing/` or the fetch wrapper.
   The fix for BUG-R1B-3 is privacy copy, which this review depends on (m-3): see **R1B-S7**.
2. **The D1 preview checks (`03` v1.3, steps 1–7) haven't run yet, and `DEMO_HOSTING_EGRESS_CIDRS` isn't in `08`.** I could only test the client-IP rule locally, with `K_SERVICE` set and a test CIDR. Whether Hosting really appends the visitor hop, and which ranges are used, is a DevOps gate: see **R1B-S3**.
3. **The demo route fails closed until that's done.** Without the CIDR list, every demo POST on Cloud Run gets 403, so shipping the server with the flag OFF is safe.
4. **No source edits.** I made no commits.
   - The 002 docs folder is untracked in the device working copy (it is checked out on `feature/001-parkflows-platform-v1`). This file was written there, next to `01`–`08`.
   - A temporary bundle `pf-sec-002-r1b-a94eae5.bundle` is left in the repo root. It is git-ignored (`*.bundle`), and the sandbox can't delete it.

### Scope reviewed
**Method.**
- Clean clone of `a94eae5` from a bundle into the cloud workspace; Node 22.22.2, Bun 1.4.2, `bun install --frozen-lockfile`.
- `SITE_SCOPE_MODE` unset (strict), Firestore variables blank, no ADC.
- My own throw-away probe scripts (≈75 probes) run outside the repo. Most probes ran with `K_SERVICE=parkflows-test` and `DEMO_HOSTING_EGRESS_CIDRS=198.51.100.0/24`, so the Cloud Run code path is the one exercised.

**Code read:**
- `server.ts`: demo front door L211–251, auth gate L296–312, global limiter L277, `/sites/update` L1451, demo routes L1483–1613, `/sites/summary` L2095, `/overview` L2103, `csvCell` L2257;
- `src/server/clientIp.ts`;
- `src/server/db.ts`: `validateDemoRequest`, create, list, status, `deleteDemoRequest`, `expireDemoRequests`, `getSiteOverview`, `getSiteSummaries`, `updateSiteDetails`;
- `src/server/security.ts`: `redactClient`, limiter `key` / `redactAudit`;
- `marketing/demo/demo.js` (DOM sinks), the built `dist-marketing/*.html` (flag OFF and ON), `d1/firebase.json`.

**Gates.**
| Check | Result |
|---|---|
| `npm run lint` · `npm run build` · `build:marketing` (flag OFF and `PF_DEMO_FORM=on`) | all **PASS** |
| `npm run test:qa` (strict) | **160/175**. The 15 failures are exactly the known 001 Phase 2 FLOW list (FLOW-03…27); 0 new. |
| `firestore.rules`, `bun.lock`, dependencies | unchanged since `f8a3753` (rules deny-all; no new package). `package.json` adds only scripts. `bun audit --prod` is unchanged from 001 S7-9. |

### Focus areas: result
**Public `POST /demo-requests` — PASS.**
- **Validation.** Per-field 400s with **no input echoed** (script tags, a bad email and a bad facility type all absent from the reply). Arrays and `__proto__`/`constructor` bodies → 400, and no prototype pollution. Mass-assigned `status`, `id`, `createdAt`, `consentAt`, `source`, `handledBy` and `note` are ignored (stored NEW, server id, server time).
- **Honeypot.** `pf_hp_field` filled → `{"success":true}`, nothing stored.
- **Body cap and content type.**
  - Over 8 KB → 413 "The request is too large." with no echo.
  - Malformed JSON → 400 "The request could not be read." with no stack.
  - `text/plain` and form-encoded → **415**, so a cross-site HTML form can't post a "simple" request.
  - A cross-origin `Origin` → 403. `https://parkflows.in` → allowed.
- **Success reply** is exactly `{"success":true}`.
- **Rate limits (M-1, built per `03` v1.3).**
  - On Cloud Run, rejected with **403 `ERR_VIA_HOSTING_ONLY`**: no XFF, an edge hop outside the CIDR, the Hosting hop alone, and `X-Real-IP` / `Forwarded` tricks.
  - Per-visitor limit 5/10 min keyed on the hop left of the Hosting hop. Six posts whose **leftmost XFF entries were forged** still hit 429 on the 6th; another visitor → 200.
  - An IPv6 visitor rotating inside one /64 → 429 on the 6th.
  - The 30-stored-per-hour cap fires.
  - `trust proxy` stays 1.
- **GET submits** (no session) → 405. A POST to `/demo-requests/` (trailing slash) → 401, so it fails closed. See R1B-S3 for the D1 `trailingSlash` check.

**Personal data and 12-month expiry — PASS.**
- **What's stored.** Exactly the `03` field list; no IP, UA or extra fields.
- **Audit.** No demo personal data in any audit row (checked for name, email, phone, city, message). `DEMO_REQUEST_UPDATED` / `DELETED` carry the id only; `DEMO_REQUESTS_EXPIRED` carries the count only.
- **Delete is a hard delete.** Memory, the local JSON copy and (awaited) Firestore. A second DELETE → 404 with no hint.
- **Expiry.** A record back-dated to 12 months + 1 day was removed at start-up; an 11-month one was kept. The audit shows the count.
- Firestore expiry is fire-and-forget but self-heals (R1B-S6).

**Master-only list, export, status, DELETE — PASS.**
- Refused with 403 for list, export, status and DELETE: Site Admin, a non-Master with a Master-made `MASTER_CONFIG` custom role, and a Master viewing as a Site Admin.
- **CSV export** escapes `=`, `+`, `-`, `@`, tab and CR at the start of a cell, after trimming. `=HYPERLINK(...)`, `+1+1`, `-2+3`, `@SUM(1)`, `\t=1+1`, `\r=1+1` and `" =1+1"` all come out with a `'` prefix.
- `|calc` and a full-width `＝` are not formulas in Excel or Sheets, so no escape is needed. Note: phones show as `'+91…` in the CSV, which is cosmetic.

**View-as write blocking — PASS.**
- Under `x-view-as`, `POST /demo-requests/status`, `DELETE /demo-requests/:id` and `POST /sites/update` → **403 `ERR_VIEW_AS_READ_ONLY`**, and the record is kept.
- Master-only reads under view-as of a non-Master → 403 (`requireMasterAdminView`).
- `/overview` under view-as → 200, scoped to the target's site; the target's other site → 403.

**`/overview`, `/sites/summary`, `/sites/update` — PASS.**
- **`/overview`** (`FLOOR_PLAN:view`):
  - no site → 400; foreign site id or code → 403; `ALL` → 400; query A + header B → A only;
  - every collection is filtered by site;
  - `latest` plates are masked per `piiAccess`, and the endpoint never returns names, emails or phones.
- **`/sites/summary`**: Master only (real user and not viewing as a non-Master); Site Admin and custom `MASTER_CONFIG` → 403; it returns no contact or pricing fields.
- **`/sites/update`** (`requireMasterAdmin` + `MASTER_CONFIG:canEdit`):
  - Site Admin and custom `MASTER_CONFIG` → 403; view-as → 403; unknown site → 404;
  - `siteCode`, `status`, `pricing`, `id` and `totalSlots` in the body are **ignored** (stored values unchanged);
  - field validation works (name, email, `+91` phone);
  - audit `SITE_UPDATED` lists field **names** only.

**D1 rewrite and CSP — PASS** (config file; live check is DevOps).
- Marketing CSP: `default-src 'self'; script-src 'self'; style-src 'self'; … connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, plus nosniff, `X-Frame-Options: DENY`, Referrer-Policy and Permissions-Policy. HSTS is added by Firebase (seen live in `08`, 13 Oct).
- The flag-ON build has **no inline script or style**; both pages load one same-origin module.
- `demo.js` writes server text with `textContent` only; its one `innerHTML` is a constant SVG.
- The rewrite exposes **only** `/api/v1/demo-requests`; the admin target is unchanged.

**m-3 (PM decision, 13 Oct) — PASS, with one Low gap (R1B-S2).**
- Both demo-route events (`RATE_LIMIT_EXCEEDED` from the demo limiter, `DEMO_REQUEST_NOT_VIA_HOSTING`) have `actor:'anonymous'`, `ipAddress:'redacted'`, no `userAgent`, and no query string. None of the visitor addresses appears anywhere in the entry.
- 001 routes keep full IP and UA (`002-client-ip` test 6).

### Findings
| Severity | Location | Risk | Fix | Status |
|---|---|---|---|---|
| **Medium** | **R1B-S1** `server.ts:300` (auth gate) and `:268` (cold-start guard). This predates R1b (001); R1b's new routes sit behind it. | **The global sign-in gate compares the path case-sensitively, but Express 4 routes match case-insensitively.**<br>`/API/V1/...` (or any mixed case) skips `requireAuth`, `applyViewAs` and `enforceSiteScope` and still reaches the handler.<br>**Repro (no session):** `GET /API/V1/rbac/roles` → **200**, the full role/permission matrix. `GET /API/V1/employees/profile?email=a@b.c` → **500**, a crash because there's no `req.user`.<br>**Every R1b route re-checks the user and still refuses:** `/API/V1/demo-requests`, `/export`, `/status`, DELETE, `/sites/summary` → 403. I swept all 78 routes in uppercase; the only 200s are public routes, `/rbac/roles`, empty `/sites` and `/my-sites` lists, and logout.<br>During a cold start, uppercase paths also skip the 503 `ERR_STARTING` guard.<br>No tenant data leaks today, but a future route that relies on the gate alone would be public. Reachable through admin.parkflows.in (`**` rewrite). | Before routes are registered: `app.set('case sensitive routing', true)`. Also make the gate and the cold-start guard compare `req.path.toLowerCase()`, or 404 any `/api/` path that isn't lower-case. Add a test: `/API/V1/rbac/roles` unauthenticated → 401/404. One small commit plus a one-commit code review. **Recommended with the BUG-R1B fixes. Not a step-7 gate** (Medium). | Open |
| Low | **R1B-S2** (m-3) `server.ts:277` global `/api/` limiter (600/min) | The global limiter runs **after** the demo front door, keyed on `req.ip` (the Hosting egress address), and logs unredacted. If it ever fires on the demo path, its `RATE_LIMIT_EXCEEDED` row holds the **visitor's user-agent**, the Hosting IP and the full URL. That contradicts the PM's m-3 rule ("no IP or user-agent for all events from public POST /demo-requests").<br>It only fires above 600 demo POSTs a minute that each pass the 5/10-min per-visitor limit, i.e. more than about 120 distinct visitor addresses a minute. That is unlikely, so this is code-read and not reproduced. | Skip the global limiter for `DEMO_REQUESTS_PATH`, since the route has its own limits; or pass `redactAudit` when `req.path` is the demo path. R1.1. | Open |
| Low | **R1B-S3** config (DevOps gate): `DEMO_HOSTING_EGRESS_CIDRS`; `d1/firebase.json` `trailingSlash:true` | The M-1 protection is only as tight as the CIDR list. A broad Google-wide range would let anyone with a host inside it reach the `*.run.app` URL and forge the visitor hop, dodging the per-visitor limit. This is `03`'s accepted residual; the 30/h cap and the honeypot still apply.<br>Separately, `trailingSlash:true` could 301 the POST to `/api/v1/demo-requests/`. The server refuses that path (401), so the risk is a broken form, not a bypass. | **Before the flag goes ON:**<br>- use the **narrowest published** Firebase Hosting egress list;<br>- record its source and date in `08`;<br>- run `03` D1 preview steps 1–7 (incl. machine B = 200 and the direct URL = 403);<br>- confirm the POST isn't redirected.<br>Unset = every POST refused (fails closed), so the server can ship with the flag OFF. | Open (verify) |
| Low | **R1B-S4** `server.ts` demo cap (30 stored/hour, platform-wide) | A bot that rotates visitor addresses (or IPv6 /64s) and leaves the honeypot empty can fill the 30/h cap. Real prospects then get 429 for up to an hour. This is availability only, not data exposure, and `03` K9 accepts it. | Watch `RATE_LIMIT_EXCEEDED` counts for the demo path. If abuse appears, add the CAPTCHA (K9). The 429 page already shows email and phone. | Accepted (03 K9) |
| Low | **R1B-S5** `db.ts deleteDemoRequest` (05 n-6) | During the awaited Firestore delete the record is still in memory. A concurrent full or targeted sync could write it back, which would undo a delete-on-request. It is safe while Cloud Run runs **`max-instances=1`** (05). | Remove the record from memory before the await (and restore it on failure). **Keep `max-instances=1` until fixed.** R1.1. | Open |
| Low | **R1B-S6** `db.ts expireDemoRequests` | The Firestore delete for expired requests is fire-and-forget. On failure, the documents stay in Firestore and come back into memory on the next cold start, where the start-up run deletes them again. So expired data can outlive 12 months by up to one cold start or day. | Accept, or await with retry. R1.1. | Accepted |
| Info | **R1B-S7** (m-3 / PRD v1.7): marketing `privacy/index.html` (= QA **BUG-R1B-3**); Cloud logging | The flag-ON privacy page still has the R1a sentence. The v1.7 sentence, which says Google Cloud keeps request logs with network addresses for up to 30 days, is missing. The m-3 decision depends on that disclosure being true and published. | **Before the flag goes ON:**<br>- BUG-R1B-3 fixed;<br>- DevOps confirms `_Default` log-bucket retention ≤ 30 days and no sink/export (PM gate in the review log, 13 Oct).<br>No security re-review needed for a copy-only commit. | Open (gate, tracked by QA) |
| Info | Carried from 001 (not R1b scope) | **001 S7-1 (High, accepted 1 Oct)** is still unpatched on this branch: `server.ts:2138` `/alerts/trigger-cron` is still unscoped. R1b doesn't make it worse, but the 001 control (ALERTS Edit off on every non-Master role; Masters don't run the scan) **must stay in place** through the R1b deploy. The fix belongs to the first 001 patch. | Keep the control and re-check script V2 (403) after the R1b deploy. | Accepted (001) |

**No Critical or High findings.** Every R1b focus area passes. R1B-S1 is the only Medium, and it predates R1b.

### Verdict: SIGNED OFF (R1b @ `a94eae5`)
No High or Critical findings are open.

**Conditions (not security fixes, but required before the demo form flag goes ON):**
1. QA re-runs and passes BUG-R1B-1/2/3. A security delta check is needed only if those commits touch server, marketing-form or fetch-wrapper code.
2. DevOps completes R1B-S3: the CIDR list recorded in `08`, the D1 preview steps 1–7 pass, and the POST isn't redirected.
3. R1B-S7: privacy copy and log retention.
4. The 001 S7-1 control stays in place.

**Recommended in the same patch:** R1B-S1, a one-line fix plus a test.

---

## Delta review — R1B-S1 hotfix and R1B-S2 · 2026-10-17
Reviewer: security-reviewer · Report only. No source edits and no commits.

**Commits reviewed:**
- `hotfix/r1b-s1` @ **`bbfdbcc`** (on `main` @ `84ec8ef`): R1B-S1.
- `feature/002-r1b` @ **`9ac2843`**:
  - **`cfdff14`**: cherry-pick of R1B-S1. The `server.ts` and test hunks are identical to `bbfdbcc`, except one line where the R1b gate's demo branch now compares the normalised path (`p === DEMO_REQUESTS_PATH`). That is a correct adaptation.
  - **`9dd406f`**: R1B-S2.
- `a0410b1` (BUG-R1B-7 backend) and the frontend commits are not part of this delta.

**Method:**
- Clean clones of both branches from one bundle into the cloud workspace; Node 22.22.2, Bun 1.4.2, `bun install --frozen-lockfile`.
- `SITE_SCOPE_MODE` unset (strict), Firestore variables blank.
- Throw-away probes outside the repo. Requests were sent with the raw path exactly as written (Node `http.request`, no client normalisation).
- I ran the R1B-S2 probe with `K_SERVICE` set and a test `DEMO_HOSTING_EGRESS_CIDRS`, so the Cloud Run path is exercised.

**Gaps found in inputs:**
1. **The deployed Android APK's source isn't in this repo.** I verified the lower-case `/api/v1` calls that the in-repo attendant app makes (`src/mobile`), plus every authentication mode it can use. That covers the API contract the APK shares, but not the APK binary itself. See the go-live note.
2. **One unrelated test failed once.** `002-backend` "AC-32d delete waits for Firestore" failed in the full `test:qa` run on `9ac2843` with "seed file written": the fake-Firestore boot didn't finish in time under load. The file alone passes 21/21, twice. It's not a security issue; QA should note it as a harness flake.

### Gates
| Branch | lint | build | `test:qa` |
|---|---|---|---|
| `hotfix/r1b-s1` @ `bbfdbcc` | PASS | PASS | **116/131**. The 15 failures are the known 001 Phase 2 FLOW list. The new `001-hotfix-r1b-s1` **4/4** pass. |
| `feature/002-r1b` @ `9ac2843` | PASS | PASS | **165/181**. The same 15 known FLOW failures, plus the one harness flake above. R1B-S1 4/4 and the R1B-S2 test pass. |

### R1B-S1 (auth gate vs case-insensitive routes): **Fixed** on both branches
**What changed (read in full):**
- `app.set('case sensitive routing', true)`, set before the first `app.use`, so non-canonical spellings no longer route.
- The sign-in gate and the cold-start guard decide on `gatePath()`: lower case, repeated slashes collapsed, trailing slash dropped. So every spelling Express could still route gets the same decision as the canonical path. `strict routing` stays off, so a trailing slash still routes and is gated.

**Repro re-run, no session, on both builds:**
- **1,110 requests** across **22 protected routes**, including every R1b route (`/demo-requests` GET, export, status and DELETE; `/sites/summary`; `/sites/update`; `/overview`) and 001's `/rbac/*`, `/security/audit-logs`, `/employees/profile`, `/slots`, `/logs`, `/registrations`, `/vehicles/entry`, `/alerts/trigger-cron` and `/slots/save`.
- Each route was tried with about 30 spellings, GET plus HEAD:
  - all upper case; `/API/V1`, `/Api/V1`, `/api/V1`, `/API/v1`; last segment upper case; first segment capitalised;
  - a trailing `/` or `//`; a leading `//`; `/api//v1`, `/v1//` and `/v1///`;
  - `./` and `x/../` segments;
  - `%61pi`, `%2F`, a percent-encoded letter, `;x`, `%00`, `%20`, `.json`, `#`, a backslash;
  - absolute-form request targets;
  - `X-HTTP-Method-Override` on POSTs.
- **Result: 0 leaks and 0 HTTP 500s.** Every response was 401, 403, 404 or 405, or a non-API HTML response with no data.
- **The 15 Oct repro is now closed.** All of these → **401 `ERR_SESSION_EXPIRED`** (was 200 or 500): `GET /API/V1/rbac/roles`, `/Api/V1/rbac/roles`, `/api/v1/rbac/ROLES`, `/api/v1/rbac/roles/`, `//api/v1/rbac/roles`, `/api//v1/rbac/roles`, `/API/V1/employees/profile?email=…`, `/API/V1/sites`, `/API/V1/my-sites`.

**Signed in as Site Admin A:**
- `/api/v1/slots/?siteId=B`, `/api//v1/slots?siteId=B` and `/API/V1/slots?siteId=B` → **403** (site scoping still applies).
- `/api/v1/sites/summary/`, `/api/v1/demo-requests/` and `/api/v1/security/audit-logs/` → **403**.
- `/API/V1/sites/summary` → 404 (it doesn't route).
- View-as is still applied on a trailing-slash spelling.

**Public routes still work:**
- `GET /api/v1/health` (and with a trailing slash) 200; `GET /api/v1/domains?siteId=` (and with a trailing slash) 200.
- `POST /api/v1/auth/login` 200; `POST /login` 200.
- `set-password` and `registrations/submit` reach their handlers (400 on an empty body).
- Upper-case public paths don't route (404).

**Cold start:** the hotfix's own test 4 (non-canonical spellings → 503 `ERR_STARTING`) passes.

### Deployed Android app (lower-case `/api/v1`): **works**
On both builds, a Gate Attendant account sending `x-site-id`, exactly as `src/mobile/api.ts` does, got:
- `POST /api/v1/auth/login` 200;
- `GET /api/v1/auth/me` 200, `/my-sites` 200, `/slots` 200 (also with `?basement=ALL&status=ALL`), `/employees` 200;
- `POST /api/v1/vehicles/entry` 200, `/vehicles/exit` 200;
- `/slots/change` reached its handler (400 is a business rule, not a routing failure);
- `/auth/logout` 200.

All three session transports still work: `x-session-token`, `Authorization: Bearer`, and the `__session` cookie. The CORS preflight from `capacitor://localhost` → 204.

**Go-live note (DevOps):** after the hotfix deploy, run the attendant smoke on one real installed APK: sign in, slot list, one entry and exit. That closes gap 1.

### R1B-S2 (global limiter on the demo path): **Fixed**
**What changed:**
- A demo POST that passed the demo front door (Hosting check plus its own per-visitor limit, `res.locals.demoClientKey` set) now **skips** the global 600/min `/api/` limiter.
- Any other spelling of the demo path (which doesn't route) still counts in the same buckets, but with a **redacted** audit (`gatePath(req.baseUrl + req.path)`).

**Probe on `9ac2843`** (Cloud Run path, test CIDR, a distinctive visitor user-agent):

| Case | Result |
|---|---|
| 610 honeypot demo POSTs through Hosting from 122 visitors within a minute | all **200**; the global limiter no longer fires |
| The same visitor's 6th POST | **429**: the per-visitor limit still applies |
| `/api/v1/demo-requests/` (trailing slash) | handled by the front door → 200 |
| 605 × `POST /API/V1/DEMO-REQUESTS?email=…` | all 404 (doesn't route) |
| 605 × `GET /api//v1/demo-requests?email=…` | 600 × 405, then **429** from the redacted global limiter |

**Audit afterwards:**
- 6 demo-path events (`RATE_LIMIT_EXCEEDED`) for the canonical path and the `//` spelling. **None** carries an IP other than `'redacted'`, a `userAgent`, a visitor address, or the query string.
- No event anywhere carries the demo visitor's user-agent.
- A 001 route (the login throttle) still audits the IP and user-agent, as 001 requires.
- The backend's own test (606 POSTs from 121 visitors, no UA in any event) passes and fails on the old code.

### New findings from this delta
| Severity | Location | Risk | Fix | Status |
|---|---|---|---|---|
| Low | **R1B-S8** `server.ts` `app.use('/api/', …)` global limiter + `case sensitive routing` | With case-sensitive routing the `/api/` mount no longer matches `/API/…` or `/Api/…`, so **non-canonical-case requests skip the global 600/min limiter**. They are all refused at the gate (401) or don't route (404), so nothing is reachable. But unauthenticated junk in that spelling isn't throttled or audited by the limiter. Upper-case login paths don't route, so this gives no password-guessing path. | Mount the global limiter as a plain `app.use` that checks `gatePath(req.path).startsWith('/api/')`, so every spelling counts. R1.1 / next hotfix. | Open |
| Low | **R1B-S9** `server.ts` R1B-S2 skip of the global limiter for demo POSTs | `03` v1.3 named the global 600/min limiter as a backstop for its accepted residual: a host inside the Hosting egress ranges forging the visitor hop. Demo POSTs now skip it entirely.<br>What's left bounds *stored* requests (30/h cap, honeypot, 8 KB body) and limits each real visitor. It doesn't bound the request *rate* from such a forger, so the impact is CPU and bandwidth only (no data, no audit leak). | Instead of skipping, count demo POSTs in a separate key space on the same 600/min bound with `redactAudit: true`. That keeps m-3 and restores the backstop. R1.1. Until then, keep `DEMO_HOSTING_EGRESS_CIDRS` as narrow as possible (R1B-S3). | Open |

**R1B-S1 and R1B-S2 are closed.** The R1b findings table above keeps R1B-S3 to S7 as they were. There are no Critical or High findings.

### Verdict (delta): SIGNED OFF
- **`hotfix/r1b-s1` (`bbfdbcc`) can go to production.**
  - Follow-up: the APK smoke above.
  - Keep the 001 S7-1 control (ALERTS Edit off on non-Master roles) in place through the hotfix deploy.
- **`feature/002-r1b` (`9ac2843`):** the R1B-S1 cherry-pick and R1B-S2 are signed off. The R1b flag-ON conditions from the 15 Oct verdict still apply (D1 preview and CIDR list, log retention, S7-1 control).
