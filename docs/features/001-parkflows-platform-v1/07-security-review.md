# Security Review — ParkFlows Platform v1, Phase 1 (Option A, Alphatech, 1 Oct)
Feature ID: 001 · Reviewer: security-reviewer · Date: 2026-10-01 · Step 7. **This replaces the 25 Sep baseline audit** (H1–H9, M1–M10, L1–L8).
Code under test: `feature/001-parkflows-platform-v1` @ **`f8a3753`**. This is the review-approved code `712d74d` plus QA test and doc commits only; `git diff 712d74d f8a3753` touches no source file.
Inputs: `01-prd.md` (Addenda A–C), `03-tech-design.md` v1.0.1 (Phase 1 scope, API table, "Site scoping & authorisation"), `04-implementation-notes.md`, `05-code-review.md` rounds 2–5 (APPROVED), `06-test-report.md` (FAIL as tested; BUG-1 and BUG-4 deferred by the user on 1 Oct).

## Gaps found in inputs
1. **New cross-tenant leak that none of the earlier steps covered: `POST /alerts/trigger-cron` (S7-1, High).** It wasn't in the 25 Sep baseline, the `03` API table or the QA suite, so no step tested it. It is reachable from the Alerts page's **"Run cutoff scan"** button by the default Site Admin role. I missed it in the baseline too.
2. **`03` doesn't cover the remaining platform routes for non-Master `MASTER_CONFIG` holders** (`/invoices/status`, `/sites/onboard`). They only matter if a Master gives a custom role `MASTER_CONFIG`, which `05` N-1 shows is a realistic setup (S7-5).
3. **The QA browser runs (`06`) never pressed "Run cutoff scan".** AC-01 UI therefore passed without exercising S7-1.
4. **Uncommitted work on the device copy.** `05-code-review.md`, `08-release.md` and `review-log.md` have other roles' uncommitted edits. I only wrote this file and one review-log line. I didn't commit anything.
5. **Housekeeping on the device (no source impact).** A `git status` I ran on the device copy left a stale, empty `.git/index.lock` (the device sandbox can't unlink files by default). With the user's delete permission I removed it, plus an empty folder and a temporary bundle folder I had created. Nothing else was touched.

## Scope reviewed
**Method.**
- Clean clone of `f8a3753` from a `git bundle` into the cloud workspace, with Node 22.22.2 and Bun 1.4.2 (`bun install --frozen-lockfile` OK).
- `SITE_SCOPE_MODE` unset (strict); `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` blank; no ADC credentials in the workspace (BUG-8); `K_SERVICE` unset except for the B11 check.
- Repro scripts are throw-away and kept outside the repo. I made no source edits.

**Code read:** `server.ts` (every `/api/v1` route, view-as, `resolveSite` / `assertRecordSite` / `stampBulkRows`, RBAC guards), `src/server/security.ts`, `src/server/db.ts` (roster scan, registration, invoices, valet, seeding and Firestore paths), `src/server/firestoreClient.ts`, `src/sessionTokenFallback.ts`, `src/apiBase.ts`, `src/components/{SiteAdminReports,ParkingLogs,NonParkedAlerts}.tsx`.

**Results.**

| Check | Result |
|---|---|
| `npm run lint` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0; chunk-size warning only) |
| `npm run test:qa` (strict) | **117 tests: 102 pass, 15 fail**. Backend **60/60**; platform **42/57**. The 15 failures are exactly the Phase 2 list in `06` (FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27). |
| Attacker probes (own script, two sites, nine accounts incl. Master-made custom roles "Sec Site HR" = USER_MANAGEMENT and "Sec Ops Plus" = MASTER_CONFIG) | ~85 probes: **3 confirmed vulnerabilities** (S7-1, S7-5 invoice, BUG-4) plus the Minors below; every H1–H9 repro now refused |
| B11 start-up check | `K_SERVICE` set + `AUDIT_HMAC_SECRET` empty → **exit 1** with "Refusing to start" |
| `bun audit --prod` | 8 advisories (3 high, 4 moderate, 1 low). None reachable at runtime as High (see S7-9). |

**Tenant-isolation probe matrix (Site Admin A, strict mode).** Each of these routes was called with: no site, Site B id by query, Site B id by header, Site B **code** by header, `ALL`, and query=A + header=B:
- `/slots`, `/employees`, `/logs`, `/alerts/non-parked`, `/registrations`, `/valet/tickets`, `/slots/change-notifications`, `/domains/manage`, `/analytics/prediction`, `/reports/mix`, `/export/reports`, `/invoices`.

Every route answered 400 (no site / ALL), 403 (foreign id or code) and returned only Site A for query A + header B (query wins), with no Site B id anywhere in the body. Record-level writes by id, plate and email (single, bulk, B17 rows), view-as and session handling are covered by the re-check below and the findings.

## Baseline findings re-checked (25 Sep → Phase 1 build)
| ID | Baseline issue | Status | Repro on `f8a3753` |
|---|---|---|---|
| H1 | `/logs` unmasked via `?maskPII=false&userRole=` | **Fixed** | Gate Attendant A: `GET /logs?maskPII=false&userRole=MASTER_ADMIN` (site A) → 200, `piiMasked:true`, name "Ayy P.". Masking follows the server-side role; `LOGS:view` is required. |
| H2 | `/employees/profile?query=` BOLA bypass | **Fixed** | `?query=EA-1` → 400. Attendant `?employeeId=EA-1` (colleague) → 403 `ERR_BOLA_VIOLATION`. Site Admin A for `EB-1` with site B → 403, with site A → 403 + audit. |
| H3 | update-vehicle IDOR + auto-create | **Fixed** | `{email:<own>, employeeId:'EB-1'}` → 403. Naming a same-site colleague → 403. An account with no pass → 404 "No pass found — register first". Site B plate unchanged. |
| H4 | Cross-site overwrite by `id` (employees/slots, single + bulk) | **Fixed** | Site Admin A: `employees/save` and `slots/save` with Site B ids (body `siteId`=A) → 403. Bulk rows with a Site B id → 403, whole batch refused. Rows matching B by employeeId/plate/slot number without an id become new Site A records, and B is unchanged. |
| H5 | Global plate match on exit / entry dup | **Fixed** | Plate parked at B: exit by Attendant A → 404, no B data. Entry at A → 200 with no mention of B (audit `VEHICLE_ACTIVE_AT_OTHER_SITE`). Relocate into a Site B slot number → 400 "does not exist". |
| H6 | `/slots/change-notifications` unscoped | **Fixed** | Site required; Site B / `ALL` → 403 / 400; mobile masked unless `FULL_PII_ROLES`. |
| H7 | `/sites` returned every tenant + contact/pricing | **Fixed** | Site Admin A → only Site A; no `contact*` / `pricing` fields. |
| H8 | USER_MANAGEMENT self-escalation / takeover | **Fixed**; residual Lows R5-1 and R5-2 (S7-12) | As "Sec Site HR" (non-Master, USER_MANAGEMENT, Site A), all of these were refused:<br>- own role edit, own override, own role swap → 403;<br>- giving a same-site user a privileged role → 403;<br>- widening a user to Site B, ALL_SITES, or creating a user at B / ALL / Master → refused;<br>- toggle-module on Site B or A+B users → 403;<br>- reset token for Site B, privileged and A+B users → 403;<br>- delete Site B or a privileged user → 403. |
| H9 | Public submit disclosed plate owner | **Fixed** (disclosure); per-site whitelist built (AC-57). BUG-4 residual → S7-3. | Same-site ACTIVE plate → 400 "This vehicle can't be registered. Contact your site admin." with no name or ID. Mass-assigned `status:'APPROVED'` / `id` are ignored (stored PENDING, server id). |

**Mediums and Lows that `03` put in Phase 1:**

| ID | Status | Evidence |
|---|---|---|
| M1 (audit can be wiped) | **Partly fixed** (as designed) | `securityAuditLogs` is no longer clearable (BE B9/M1); clear-history is Master-only. The hash chain is Phase 2 (P2-4). |
| M2 (missing audit events) | **Partly fixed** (as designed) | Audited now: approve/reject, domain add/remove, profile lookup, plate change, RBAC refusals, cross-site denials (with `siteId`). Gate entry/exit is still not audited: FLOW-24 fails (Phase 2). |
| M3 (audit reads unscoped) | **Fixed** | `/security/*` is Master-only (`requireMasterAdmin` on the real user). Master viewing-as an Attendant → 403. |
| M4 (sessions) | **Partly fixed** | Logout now kills header/bearer tokens (probe: old `x-session-token` → 401 `ERR_SESSION_EXPIRED`). Not revoked on password reset (S7-6). Token in URL (S7-2). |
| M8 (valet retrieval) | **Fixed** (site-scoped) | Retrieval is matched within the resolved site only (BE B3 valet). The substring match on plate/phone remains (Low, Phase 2). |
| M10 (global domains) | **Fixed** | Per-site whitelist (AC-57). Site Admin A can't see or change B / platform-wide entries (PERM-02a–e). |
| L2 (slot-daily-vehicles) | **Fixed** | Foreign slot → 403 (BE B2/L2). |
| L3 (status enum) | **Fixed** | Invalid `newStatus` → 400 (BE B3/L3). |
| M5, M6, M7, M9, L1, L4, L5 | Phase 2 by design (`03` P2-1, P2-8) | Still present; see S7-7 … S7-9 and the Lows. |

## Findings
Severity scale: Critical / High / Medium / Low. Status: **Open** unless stated.

### Must fix for Phase 1 (or accept as a recorded risk with the stated control)
| Severity | Location | Risk | Fix | Status |
|---|---|---|---|---|
| **High** | **S7-1** `server.ts:1803-1821` `POST /api/v1/alerts/trigger-cron` → `src/server/db.ts:1928-1973` `runNonParkedRosterScan()`; UI `src/components/NonParkedAlerts.tsx:58-63` | **Cross-tenant PII disclosure and platform-wide write.** The route never calls `resolveSite`. The scan runs over **every site's** active employees, replaces the **whole** `alerts` collection, and returns all of them to the caller.<br>**Who can reach it:** `ALERTS:canEdit`, which the **default Site Facility Manager role has**. The Alerts page's "Run cutoff scan" button calls it and renders the returned list, so an ordinary click exposes other tenants' data.<br>**Repro (strict mode):** Site Admin A, `x-site-id: A`, `POST /alerts/trigger-cron` → **200**, 7 alerts, **6 from other sites**. Sample: `{siteId: <Site B>, name: "Bee Person", plate: "KA05MN1111", mobile: "+919876543210"}`, unmasked. It also works with **no site at all** (200), and the occupancy check uses plates parked at any site.<br>**Smaller issue:** the audit `actor` is taken from the client header `x-user-email` (forged value `someone.else@forged.test` was recorded).<br>**Impact at launch:** an Alphatech Site Admin sees Tech Park HQ employees' names, plates and mobiles (a DPDP-relevant breach between customers), and rewrites other sites' alert lists. Breaks the golden rule, AC-01, AC-02 and AC-06. | `resolveSite(req, res, {allowAll:false})`. Pass the site into `runNonParkedRosterScan(siteId)`: filter employees and occupied slots by `recordSite(x) === siteId`, replace only that site's alerts, return only them. Mask `mobile` per `piiAccess`. Audit `actor: req.user.email` with `siteId`. Add a test: Site Admin A gets 0 foreign rows and Site B's alerts are unchanged. About 15 lines plus a test, then a short code review.<br>**If it can't ship by go-live, accepted-risk control:** before go-live a Master Admin sets **ALERTS → canEdit = off** on the *Site Facility Manager* role (Role matrix, no deploy). `trigger-cron` is the only route that needs `ALERTS:canEdit`; Site Admins keep the read-only Alerts list. Devops verifies a Site Admin gets 403 on `POST /alerts/trigger-cron`. Master Admins must not run the scan either until fixed, because it rewrites every site's alerts. | Open |

### Go-live configuration checks (no code change; must be confirmed by devops or the Master Admin on 1 Oct)
| Severity | Location | Risk | Fix | Status |
|---|---|---|---|---|
| Medium | **S7-3** BUG-4: `src/server/db.ts:820-824`, `971-980`, `1189` (five demo platform-wide domains, re-seeded whenever the whitelist is empty); `submitRegistrationRequest` (no email-ownership proof) | **Repro:** fresh store → public `POST /registrations/submit` at Site A with `demo@corp.org` → **200 PENDING** "Domain Authenticated (@corp.org)". `GET /domains?siteId=A` lists `company.com, corp.org, techfirm.com, enterprise.io, parkos.ai`.<br>**Grading:** registration never proves that the person owns the email (no OTP or link), so the whitelist is a typed-string filter. Anyone can already type an address at Alphatech's real domain. The demo domains add little *access* risk, because Site Admin approval is the real control. They do **widen the public spam surface** and look like "verified" requests to an approver. If production's list is empty it re-seeds them, which breaks H9's fail-closed intent. | **The user's deferral of the code fix is acceptable, but revisit it to add one 5-minute ops step before go-live:**<br>1. The Master Admin adds Alphatech's real email domain(s) **for the Alphatech site**.<br>2. Then removes the five demo platform-wide entries.<br>The list then never becomes empty, so the demo domains don't return.<br>3. Site Admins must not treat "Domain Authenticated" as identity proof.<br>**Next upgrade:** remove the seed list; add email verification (OTP) before a request reaches the approver. | Open (deferred by user) |
| Medium | **S7-4** BUG-8: `src/server/firestoreClient.ts:36-48`, `src/server/db.ts:1165-1210` | With no project id configured, `getFirestoreDb()` still initialises firebase-admin with ADC ("[firestore] Connected." in my run). Meanwhile `isFirestoreConfigured()` is false, so `initDB` takes the **local/demo** branch: it seeds the 1,080-slot demo inventory, demo sites (`site-1`…) and demo domains, then `saveDB()` writes them with `merge:true`.<br>Anywhere ADC resolves a project, this writes **demo data over production documents with the same ids**. That covers a developer laptop with `gcloud` ADC for prod, or Cloud Run if `FIREBASE_PROJECT_ID` were ever removed.<br>In my workspace the writes failed only because no project could be detected. | **Go-live check (devops):** confirm `FIREBASE_PROJECT_ID` is set on the Cloud Run service (and keep it set). Never run the server or `test:qa` on a machine whose ADC points at production.<br>**Next upgrade:** return `null` from `getFirestoreDb()` when `!isFirestoreConfigured()`. | Open (verify) |
| Info | Secrets and config (Addendum R4, B11) | `AUDIT_HMAC_SECRET`: the Cloud Run fail-fast works (exit 1 when empty; reproduced). It doesn't check the secret's strength (`short` was accepted); the user confirmed a real secret on 28 Sep.<br>`BOOTSTRAP_ADMIN_PASSWORD`: when unset, the Master gets a random password; when it is the old default, it is rotated.<br>`SEED_DEMO_USERS`: demo accounts only when exactly `true`; closed by the user (R4).<br>**CORS:** explicit allowlist; an evil origin gets no `Access-Control-Allow-Origin`, and a cross-origin POST with the cookie → 403.<br>**Rate limits:** 600/min per user or IP per path; login 15 per IP+identifier and 20 per identifier; public submit 10/min. | Devops smoke S9: no fallback-secret warning and no demo seeding in the Cloud Run logs. | Verify at go-live |

### Phase 2 / next upgrade
| Severity | Location | Risk | Fix | Status |
|---|---|---|---|---|
| Medium | **S7-2** (code-review m-8) `src/server/security.ts:806` (`?token=` accepted on **any** GET); `src/components/SiteAdminReports.tsx:330-331`, `src/components/ParkingLogs.tsx:106-108` | The full 24 h session token goes in the URL for CSV export. It lands in Cloud Run request logs (readable by anyone with Logs Viewer on the project) and in the browser history of shared gate or office PCs.<br>The server accepts `?token=` on every GET route, not only export. **Probe:** `GET /employees?siteId=A&token=<Site Admin token>` → 200 with PII. | Replace it with a short-lived, single-use download token bound to `{user, site, type}` (or fetch + Blob download). Then drop `?token=` from `extractSessionToken`. **Accepted for 1 Oct:** gate staff sign out at shift end, and the token expires in 24 h. | Open |
| Medium | **S7-5** `server.ts:1460-1480` `POST /invoices/status` (no site check on `invoiceId`); `server.ts:1277` `POST /sites/onboard` | A **non-Master holding `MASTER_CONFIG`** (Master-created custom role) isn't tenant-scoped on these platform routes.<br>**Repro:** "Sec Ops Plus" (MASTER_CONFIG, Site A) → `POST /invoices/status {invoiceId:<Site B invoice>, status:'PAID'}` → **200**, and Site B's invoice is now PAID. The same user can onboard new platform sites (200).<br>`/sites/status`, `/sites/pricing`, `/sites/delete` and `/invoices/generate` for Site B (id or code) are correctly refused by `enforceSiteScope`. | Make `MASTER_CONFIG` platform routes Master-only in Phase 1 (`requireMasterAdmin`, as for clear-history). Otherwise add `assertRecordSite` on the invoice and refuse onboarding by scoped users.<br>**Operational control for 1 Oct (same as R4-1/R4-2):** no non-Master account holds `MASTER_CONFIG` or `USER_MANAGEMENT` (no custom role, no override). Devops/QA confirm on the live role list. | Open (control) |
| Medium | **S7-6** (M4 remainder) `security.ts` session store; `server.ts:2366` set-password; `saveAppUser` | Changing a password (reset token or Master `plainPassword`), role or sites doesn't end the user's existing sessions.<br>**Repro:** session T, then a reset-token password change → T still → **200**.<br>Suspension *is* enforced per request (403 `ERR_ACCOUNT_INACTIVE`, AC-10). | On password set, role/site/scope change, or suspension, destroy every session of that user (index sessions by userId). | Open (P2-8) |
| Medium | **S7-7** (baseline M6) GET `/registrations`, `/valet/tickets`, `/alerts/non-parked`, `/employees`, `/analytics/prediction` | These need only a session plus a site. Within their own site, a Gate Attendant reads **unmasked email and mobile** of pending registrations, valet guest phones and alert mobiles. This is same-site over-exposure, not cross-tenant. | `requirePermission('<module>','view')` on each list, and role masking as on `/employees`. | Open (P2-8) |
| Medium | **S7-8** (baseline M5) `src/server/security.ts:544-545` | CSP is still `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:`. There is no HSTS, and the session token is readable from `sessionStorage`. No HTML sink was found: React escapes, and there's no `dangerouslySetInnerHTML`. HTML submitted publicly as a registration name is stored verbatim but rendered as text. | A real CSP (nonces, explicit `connect-src`, `frame-ancestors`), HSTS, and validation of `name`/`mobile` on public submit. | Open (P2-8) |
| Medium | **S7-9** (baseline M9) dependencies, `bun audit --prod` | 3 high, 4 moderate, 1 low. The highs are not reachable at runtime here:<br>- `@grpc/grpc-js` GHSA-m9gg-hp2v-232j affects gRPC *servers* using `getAuthContext`; this app is a client only.<br>- `brace-expansion` ×2 is build-time only (`@capacitor/cli`).<br>Runtime-relevant: `qs` via `express` / `body-parser` (DoS, array-limit bypass) and `uuid` (moderate). | `bun audit fix` within ranges; upgrade `express` (pulls a fixed `qs`). `firebase-admin` 14.x per P2-8. Add `bun audit` to CI. | Open (P2-8) |
| Medium | (baseline M1/M2/M7) | No audit hash chain (AC-38). Gate entry/exit isn't audited (AC-37, FLOW-24). The gate admits any plate as VISITOR (AC-20, BUG-5). All accepted in Option A. | P2-4, P2-1 | Open (accepted, Option A) |
| Low | **S7-10** `server.ts:1712-1727` `POST /vehicles/scan-plate` | Returns the **full** matched employee record (email, mobile, employeeId, …) and the raw model text to anyone with `MOBILE_APP:canCreate`. Every other route masks email and mobile for Gate Attendants. Same-site only; needs `GEMINI_API_KEY` and a real plate photo (code-read, not run). | Return `{employeeId, name, vehicleType, vehicleBrand, status}` only, masked by `piiAccess`. Drop `rawAnalysis`. | Open |
| Low | **S7-11** frontend gap 6, `src/components/SiteAdminReports.tsx:322-331` | The Reports CSV export under view-as uses `window.open`, so `x-view-as` isn't sent and the download runs with the Master's own scope. It's the Master's data, so this isn't a leak, but the simulation isn't faithful. Also, `/export/reports` never masks (plates and names in full for any `ANALYTICS:canExport`). | Disable Reports export in view-as (as Logs does). Mask the export by role in P2-6. | Open |
| Low | **S7-12** (code-review R5-1, R5-2) `server.ts` `userSaveRefusal` (≈L2565-2583) | Both need a Master-made USER_MANAGEMENT role.<br>**R5-1 reproduced:** HR sets attendant A's **username** to attendant B's email → 200. Sign-in is order-dependent; in my run B still signed in as B. This is shadowing or DoS, not access.<br>**R5-2 reproduced:** HR re-points an in-scope account's email to a same-site employee's email → 200, then that account's self-service reaches that pass. This stays within the caller's own site. | Unique email + username across all accounts; only Master or REGISTRATION:canEdit may give an account an email that matches an employee. Link accounts to employees by id (P2-2). | Open (control as S7-5) |
| Low | **S7-13** `server.ts:2671-2700` toggle-module; `server.ts:2506-2530` `/rbac/users` | A non-Master can **disable** (or enable non-privileged) modules on a *privileged* same-site account (probe: 200). `/rbac/users` shows a multi-site user's other-site names (e.g. "Sec Site B") to a single-site HR. | Refuse toggles on `accountIsPrivileged` targets. Filter site names to the caller's sites. | Open |
| Low | **S7-14** `server.ts:233` view-as | `x-view-as` is ignored on `/auth/*`, so a Master in view-as can still `POST /auth/admin/generate-reset-token` (200). That acts as the real Master, so there is no escalation. Viewing as a **suspended** user works (QA observation). | Allow only `/auth/logout` and `/auth/me` through. Refuse a view-as target that isn't ACTIVE. | Open |
| Low | **S7-15** (`03` gap 16) public `/domains`, `/registrations/submit` | A made-up site id returns the platform-wide names, as designed. `submit` with a made-up `siteId` creates an **orphan PENDING request** (probe: 200) that only a Master in All-sites mode would see. This is a spam/pollution vector (rate limit 10/min/IP). **Gap 16 accepted** as designed for `/domains`. | Refuse `submit` for a site that doesn't exist or isn't ACTIVE (400, same generic text). | Open |
| Low | Code-review Minors R4-3, n-1 | **R4-3:** bulk `autoApprove` can create a second active pass for the same plate at one site (same-site, admin-only).<br>**n-1:** the Employee app preview shows hard-coded demo domains as valid (cosmetic; the server enforces the real list). | As in `05`. | Open (Phase 2) |
| Low | Baseline L1, L4, L5, L6, L8 | **L1:** public `/health` shows platform-wide counts (probe: 1,089 slots / 154 employees).<br>**L4:** PIN, unchanged.<br>**L5:** in-memory sessions and limits.<br>**L6:** `simulate-attack` writes fake incidents (now Master-only).<br>**L8:** Gemini raw text logged on parse failure. | P2-8 | Open |

## Decisions on the carried items (task item 4)
| Item | Grade | Decision |
|---|---|---|
| R4-3 | Low | Phase 2 (agree with the user). |
| R5-1 | Low | Phase 2. Reachable only via a Master-made USER_MANAGEMENT role (control in S7-5). |
| R5-2 | Low | Phase 2, same control. |
| n-1 | Low | Phase 2 (frontend, cosmetic). |
| m-8 | **Medium** (S7-2) | Accept for 1 Oct; fix in the next upgrade (short-lived download token). |
| BUG-4 | **Medium** (S7-3) | The code fix can stay deferred. **Revisit the decision for one ops step:** add Alphatech's real domain at Alphatech, then remove the five demo entries before go-live. |
| BUG-8 | **Medium** (S7-4) | Go-live check that `FIREBASE_PROJECT_ID` is set on Cloud Run; one-line fix in the next upgrade. |
| Frontend gap 6 | Low (S7-11) | Phase 2. |
| scan-plate full record | Low (S7-10) | Phase 2. |
| Secrets / config | OK | B11 verified. CORS, CSRF guard and rate limits verified. CSP/HSTS → S7-8 (Phase 2). |

## Notes for next roles
- **Backend dev:** S7-1 fix as above, with a test. Optionally S7-5 (`requireMasterAdmin` on `/invoices/status` and `/sites/onboard`) in the same commit.
- **Code reviewer:** short review of the S7-1 commit only.
- **QA:** add an API test (Site Admin A → trigger-cron returns 0 foreign rows; Site B alerts unchanged) and a browser check that "Run cutoff scan" at Site A shows only Site A.
- **Devops (08 go-live checklist):**
  - S7-1 control if not fixed: the role-matrix change, then verify 403.
  - S7-3 domain ops step.
  - S7-4: `FIREBASE_PROJECT_ID` set.
  - S7-5 / R4 control: no non-Master holds MASTER_CONFIG / USER_MANAGEMENT.
  - S9 log check.
  - BUG-1: open `/attendant/` once (`06`).

## Verdict: BLOCKED
**One High is open: S7-1** (`/alerts/trigger-cron` returns and rewrites every site's alerts, with names, plates and mobiles, to the default Site Admin role). There is no Critical. Every baseline High (H1–H9) is **fixed** and re-verified with a repro. Tenant isolation holds on every other `/api/v1` route I probed in strict mode, including by id, plate, email, bulk upload and view-as.

**It can become SIGNED OFF for 1 Oct in either of two ways:**
- **(a)** Fix S7-1 (about 15 lines plus a test, then a short code review); or
- **(b)** The user records a risk acceptance for S7-1 **with the control applied and verified before go-live**:
  1. *Site Facility Manager* role → ALERTS canEdit off; a Site Admin gets 403 on `POST /alerts/trigger-cron`.
  2. Masters don't run the scan.
  3. The fix lands in the first patch.

Without that control, I don't recommend accepting S7-1. It is a cross-customer PII exposure reachable from a normal button.

All Mediums can be launched with: S7-3 (ops step) and S7-4 (config check) verified at go-live, the S7-5 operational control, and S7-2/6/7/8/9 scheduled in P2-8.

## User decision (2026-10-01): S7-1 accepted as a recorded risk
The user accepted S7-1 for the 1 Oct launch under option (b). Because of that, the step-7 verdict becomes **SIGNED OFF — conditional**. **The High is not fixed**, and it stays Open in the findings table.

**Conditions.** All must be true at go-live. If any one is not met, the acceptance does not hold and the verdict reverts to BLOCKED.
1. **Before go-live:**
   - A Platform Master Admin sets **ALERTS → canEdit = off** on the *Site Facility Manager* role (User & RBAC → role matrix). The read-only Alerts list stays available.
   - No other role held by a non-Master has ALERTS canEdit.
2. **Devops verifies before go-live and records the result in `08-release.md`:**
   - Signed in as an Alphatech Site Admin, `POST /api/v1/alerts/trigger-cron` returns **403**.
   - The "Run cutoff scan" button no longer runs the scan for Site Admins.
3. **Master Admins do not run "Run cutoff scan"** until the fix ships. It rewrites every site's alerts and returns all sites' PII.
4. **The S7-1 fix ships in the first patch after launch.** It needs a test and a short code review, as described in the S7-1 row. After that, the role permission can be restored.

**What remains accepted (residual risk).** Until the patch ships, any account that is given ALERTS canEdit can read every site's alert PII (names, plates, mobiles) and rewrite every site's alert list. This includes a Master who presses the button, or a future custom role. The alert lists can also be wrong across sites (global occupancy check).

**Also carried with this sign-off:**
- Go-live checks S7-3 (demo domains ops step) and S7-4 (`FIREBASE_PROJECT_ID` set).
- The S7-5 control: no non-Master holds MASTER_CONFIG / USER_MANAGEMENT.
- The Phase 2 / next-upgrade items listed above.

## Final verdict: SIGNED OFF — conditional (S7-1 accepted as recorded risk, 2026-10-01)
