# Implementation Notes — ParkFlows Platform v1 (baseline)
## Backend
_Author: backend-dev · Date: 2026-09-28 · Status: **DONE: T0a–T0e + B1–B12 on `feature/001-parkflows-platform-v1`; ready for code review (step 5)**. Not self-reviewed. `main` untouched, nothing pushed._
_History: blocked on 25 Sep and early 28 Sep (no approved 03 yet). This section replaces those notes._

### Gaps found in inputs
1. **T0b "done-when" was wrong.** 03 expected `add --renormalize` to touch only `.gitattributes` + `src/App.tsx`. In fact 47 tracked files were stored with **CRLF in git** (not just the 26 churn files), so renormalising converts all 47 to LF. I kept that in its own commit (`6dba91b chore: enforce LF line endings`, whitespace only: `git diff --ignore-cr-at-eol` shows only `.gitattributes`). Reviewers can skip that commit.
2. **B12 script as written fails on Node 22.** `node --test tests/qa/` treats the directory as a module path. I used `node --test tests/qa/*.test.mjs` instead (Node expands the pattern itself on Windows cmd).
3. **T0a–T0c are tagged [frontend]** but block everything else. On the user's instruction ("do step 0 first") backend-dev did them exactly as written.
4. **PERM-02 (AC-07: Site Admin can edit the corporate domain whitelist)** is not covered by 03: domains "stay global in Phase 1", with no task restricting `/domains/add|remove`. Default `role-site-manager` has REGISTRATION:canEdit, so a Site Admin can still change the platform-wide list. **Architect/PM decision needed**. Not changed.
5. QA's `tests/qa/001-platform-v1.api.test.mjs` fixtures send no site, so under strict mode (the default) its `before()` fails with `ERR_SITE_REQUIRED`. QA must update the fixtures in step 6, as 03 plans. Until then it can be run with `SITE_SCOPE_MODE=fallback`.

### Commits (on the branch, oldest first)
| Commit | Task |
|---|---|
| `9675111` fix(console): refetch after sign-in, clear state on sign-out | T0a (the 16-line App.tsx fix, done for frontend) |
| `6dba91b` chore: enforce LF line endings | T0b |
| `be0daaa` chore(team): workflow docs and QA suite | T0a |
| `7ba3d4e` chore: delete stray src/components/App.tsx | T0c |
| `2878b95` chore: keep bun.lock as the only lockfile | T0d (+ `node_modules*/` in `.gitignore`, T0e) |
| `b3bcbd5` … `0180e3e` | B1 … B12, one commit each |

T0e local junk (3 `node_modules_*` folders and 2 `npm_install_verbose*.log` files, ~340 MB) was deleted with the user's permission. It was untracked, so there's no commit.

### Files changed
`server.ts`, `src/server/db.ts`, `src/server/security.ts`, `src/types.ts`, `src/utils/rbac.ts` (adds `isMasterAdmin`; the `Header` import is now `import type`, so the server bundle stays React-free), `package.json` (`test:qa`), `CLAUDE.md` (check line), `.gitattributes`, `.gitignore`, new `tests/qa/001-backend.api.test.mjs`. Deleted: `package-lock.json`, `src/components/App.tsx`.

### Endpoints added/changed
Shared errors are as in 03: `ERR_SITE_REQUIRED` 400, `ERR_SITE_FORBIDDEN` 403 (audit-logged as `CROSS_SITE_ACCESS_DENIED` with `siteId`), `ERR_SITE_ALL_NOT_ALLOWED` 400, `ERR_VIEW_AS_READ_ONLY` 403, `ERR_MASTER_ONLY` 403, `ERR_SESSION_EXPIRED` 401, `ERR_ACCOUNT_INACTIVE` 403.
- **B1:** `resolveSite` / `assertRecordSite` / `auditDenied` / `filterBySite` in `server.ts`. `SITE_SCOPE_MODE=strict|fallback` (default strict). `SecurityAuditLog.siteId?` (outside the HMAC payload), `ApiErrorCode`, and `Request.viewAs/effectiveUser`. The `enforceSiteScope` 403 is now audit-logged too.
- **B2:** site required on `/slots`, `/employees`, `/logs`, `/alerts/non-parked`, `/registrations`, `/valet/tickets`, `/slots/change-notifications`, `/invoices` (`ALL` = Master reads only), and on `/export/reports`, `/reports/*`, `/analytics/prediction`, `/ai/recommend` (no `ALL`; the `|| DEFAULT_SITE_ID` fallbacks are removed). Also:
  - `/logs`: needs `LOGS:view`; `maskPII`/`userRole` are ignored and masking comes from the role (H1).
  - change-notifications: needs FLOOR_PLAN or MOBILE_APP view, masks mobile numbers (H6).
  - `slot-daily-vehicles`: checks the slot's own site (L2).
  - The forecast and AI context are computed per site.
- **B3:** `slots/save`, `employees/save`: stored record by id must be in the selected site. A body `siteId` can't move a record; a Master Admin can, and that is audit-logged as `RECORD_SITE_MOVED`. Bulk uploads (slots, employees, registrations): the whole batch is refused on any foreign row (by id, by siteId, or a registration matched by plate/email), before any write. Record-site checks also cover `update-status` (with `SlotStatus` validation, L3), delete, valet status, valet request-retrieval, approve/reject and overnight review. Create routes take the resolved site; `SITE_INJECT_PATHS` is gone.
- **B4:**
  - Entry: the dup check and employee lookup are per site. A plate still parked at another site enters here, the reply hides that site, and `VEHICLE_ACTIVE_AT_OTHER_SITE` is audit-logged.
  - Exit and `/slots/change` match plate and slot number per site only.
  - `scan-plate` is per site and never returns a mock plate (400 "No plate detected. Type it in.").
  - `findBestSlot` and valet auto-assign now count slots with no `siteId` as `site-default`. Without this, legacy slots would never be allocated under strict mode.
- **B5:** `/sites` returns only the caller's sites and strips contact/pricing without `MASTER_CONFIG:view` (H7). `/my-sites` uses the effective user.
- **B6:** `/employees/profile`: `query` is removed; non-admins get only their own record; admins need REGISTRATION or APPROVALS view plus the site check; replies are masked by role (H2). `/employees/update-vehicle`: the target comes from the session email; naming anyone else needs REGISTRATION:canEdit plus the site check. There is no auto-create (404 "No pass found — register first"), a linked request is no longer silently set APPROVED, and the old/new plate is audit-logged (H3).
- **B7:** approval creates the pass in the request's site (bulk auto-approve too, BUG-12). `REGISTRATION_APPROVED/REJECTED` are audit-logged with `siteId`. `/registrations/submit` gives a generic duplicate message and fails closed when no domain is whitelisted (H9).
- **B8:** a non-Master with USER_MANAGEMENT can't edit built-in roles or their own role, grant MASTER_CONFIG/USER_MANAGEMENT/SECURITY_AUDIT (or an all-sites role), toggle modules for themselves or for accounts outside their sites, or reset themselves or accounts outside their sites. Refusals are 403 + `RBAC_PRIVILEGE_ESCALATION_BLOCKED` (H8). *Beyond 03's wording:* granting those three privileged modules through a per-user override is also blocked, because it's the same escalation.
- **B9:** `requireMasterAdmin` (real user) on simulate-attack, clear-history, migrate-site-data and `/security/*`. `securityAuditLogs` can no longer be cleared.
- **B10:** `x-view-as` works for Master sessions only. It is GET-only; scope, permissions and masking follow the target, and the audit actor stays the Master. *Not in 03:* it is ignored on `/api/v1/auth/*` (so sign-out works while viewing as someone), and it was added to the CORS allowed headers.
- **B11:** error codes on `requireAuth`; logout destroys cookie, bearer and `x-session-token` sessions; on Cloud Run (`K_SERVICE`) the server exits at start without `AUDIT_HMAC_SECRET` (the user confirmed it is set).
- **B12:** `npm run test:qa`.

### How to test manually
1. `bun install --frozen-lockfile && npm run lint && npm run build && npm run test:qa` (see results below).
2. `npm run dev`, sign in as Master. Then:
   - `GET /api/v1/slots` → 400 `ERR_SITE_REQUIRED`
   - `?siteId=ALL` → all sites
   - as a Site Admin, `?siteId=<other site>` → 403, and a `CROSS_SITE_ACCESS_DENIED` row in `/security/audit-logs`
3. With `x-site-id: <A>`, POST `/slots/save` with the id of a site-B slot → 403.
4. Master + `x-view-as: <site admin id>`: GET works with the target's scope; any POST → 403 `ERR_VIEW_AS_READ_ONLY`.
5. Kill-switch: start with `SITE_SCOPE_MODE=fallback` → requests without a site behave as before.

### Known limitations / hand-offs
- **Frontend (F1–F8) must ship with this.** Under strict mode the current console sends no site, so its list calls get 400 until F1's fetch wrapper adds `x-site-id`. Do not deploy the backend alone; if you must, set `SITE_SCOPE_MODE=fallback`.
- Frontend: `MasterAdminData.tsx` still offers "Security Audit Log" in clear-history, and the server now answers 400 if it is ticked. Remove that option.
- Mobile (M1): `/attendant` must block when the site can't be resolved, because a header-less call is now a 400.
- `LoginScreen.tsx`'s employee sign-in calls `/employees/profile` before a session exists (401 today as well); that's Phase 2 (P2-7).
- `scan-plate` still returns the full matched employee record (email/mobile) to the attendant. It's same-site now, but PII masking there is a Phase 2 / security follow-up.
- Phase 2 items that QA's suite still fails, as expected: AC-13, AC-14, AC-16/17, AC-19–23, AC-24, AC-27, AC-29, AC-30, AC-32, AC-37, AC-39 (valet enum).
- D1 (docs refresh) is scheduled after launch; not done.

## Frontend
_Author: frontend-dev · Date: 2026-09-25 · Status: **BLOCKED — no code changed**_

### Gaps found in inputs
1. `03-tech-design.md` does not exist, so there are no `[frontend]` tasks to implement. My role implements ONLY those tasks.
2. `02-ux-design.md` does not exist, so there is no approved layout, set of states or copy to follow.
3. `01-prd.md` is still marked "Awaiting user approval" in `docs/team/review-log.md`. Its gate (STOP: user approves PRD) and the tech-design gate have not been passed. 12 open questions are unresolved, including OQ-3 (server- vs client-enforced site scope), which decides how the frontend passes and refetches site context.

### Files changed
None.

### Screens affected
None.

### How to test manually
N/A. Nothing was implemented.

### Needed to unblock
- User approves `01-prd.md` (step 1), or amends it.
- ux-designer writes `02-ux-design.md` (step 2).
- architect writes `03-tech-design.md` with `[frontend]` tasks, and the user approves it (step 3).
- Then re-run frontend-dev on this feature.

Frontend-side notes for the architect: the PRD points at P0 frontend-heavy work. That covers site-scoped lists via `withSite()` with a refetch on site change (US-01, AC-01..06), role-based hiding of entry points (AC-07, AC-08), and the floor plan, pass approval and log export screens (US-06, US-10, US-12). Please break these into explicit `[frontend]` tasks with file-level scope.
## Mobile
## Build/lint results
Not run for frontend. No frontend changes were made.

**Backend (2026-09-28, on `0180e3e`):** `bun install --frozen-lockfile` OK · `npm run lint` exit 0 · `npm run build` exit 0 · `tests/qa/001-backend.api.test.mjs` **41/41 pass** · QA suite `001-platform-v1` with `SITE_SCOPE_MODE=fallback`: **32/48 pass** (was 21/48 on 25 Sep; 0 new failures; the 16 left are Phase 2 ACs plus PERM-02, see Backend gap 4). QA suite under strict mode: fixtures need a site (Backend gap 5).
