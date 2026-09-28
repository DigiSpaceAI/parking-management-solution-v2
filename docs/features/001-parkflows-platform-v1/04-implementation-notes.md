# Implementation Notes — ParkFlows Platform v1 (baseline)
## Backend
_Author: backend-dev · Date: 2026-09-28 · Status: **DONE: T0a–T0e + B1–B12 on `feature/001-parkflows-platform-v1`; ready for code review (step 5)**. Not self-reviewed. `main` untouched, nothing pushed._
_History: blocked on 25 Sep and early 28 Sep (no approved 03 yet). This section replaces those notes._

### Gaps found in inputs
1. **T0b "done-when" was wrong.** 03 expected `add --renormalize` to touch only `.gitattributes` + `src/App.tsx`. In fact 47 tracked files were stored with **CRLF in git** (not just the 26 churn files), so renormalising converts all 47 to LF. I kept that in its own commit (`6dba91b chore: enforce LF line endings`, whitespace only: `git diff --ignore-cr-at-eol` shows only `.gitattributes`). Reviewers can skip that commit.
2. **B12 script as written fails on Node 22.** `node --test tests/qa/` treats the directory as a module path. I used `node --test tests/qa/*.test.mjs` instead (Node expands the pattern itself on Windows cmd).
3. **T0a–T0c are tagged [frontend]** but block everything else. On the user's instruction ("do step 0 first") backend-dev did them exactly as written.
4. **PERM-02 (AC-07, domain whitelist): RESOLVED by user decision, 28 Sep 2026: "Site Admin can allow the domain for his site".** This is not in 03 (the per-site whitelist was Phase 2, M10/US-13), so it's built on the user's direct approval. **Architect: please record it in 03.** See "Per-site domain whitelist" below.
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
- **Per-site domain whitelist (user decision 28 Sep):**
  - `WhitelistedDomain.siteId?`: absent means every site, so existing entries are unchanged.
  - `POST /domains/add|remove` (REGISTRATION canEdit) acts on the selected site. Another site gives 403 + audit; missing site gives 400.
  - Platform-wide entries are Master Admin only (403 `ERR_MASTER_ONLY`). A Master with no single site selected adds platform-wide.
  - `addedBy` comes from the session, not the body.
  - Registration (single and bulk) accepts the site's domains plus platform-wide ones, and still fails closed when that set is empty.
  - Public `GET /domains?siteId=` returns the site's domains plus platform-wide ones; without a site it returns all (unchanged).
  - Adds and removes are audit-logged as `DOMAIN_WHITELIST_ADDED/REMOVED` with `siteId`.

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
- Frontend: the domain screens (`EmployeeRegistration.tsx`, `MasterAdminSites.tsx`) should show which entries are "this site" vs "all sites", and hide Remove on all-sites entries for non-Masters. The calls themselves need no change once F1 sends `x-site-id`.
- QA: `PERM-02` must be rewritten to match the decision. A Site Admin CAN add a domain for their own site, but gets 403 for another site or for a platform-wide entry.
- Frontend: `MasterAdminData.tsx` still offers "Security Audit Log" in clear-history, and the server now answers 400 if it is ticked. Remove that option.
- Mobile (M1): `/attendant` must block when the site can't be resolved, because a header-less call is now a 400.
- `LoginScreen.tsx`'s employee sign-in calls `/employees/profile` before a session exists (401 today as well); that's Phase 2 (P2-7).
- `scan-plate` still returns the full matched employee record (email/mobile) to the attendant. It's same-site now, but PII masking there is a Phase 2 / security follow-up.
- Phase 2 items that QA's suite still fails, as expected: AC-13, AC-14, AC-16/17, AC-19–23, AC-24, AC-27, AC-29, AC-30, AC-32, AC-37, AC-39 (valet enum).
- D1 (docs refresh) is scheduled after launch; not done.

### Round 2 fixes (code review round 2, 2026-09-28)
_Scope: C-1, M-1, M-2 (backend parts) and Minors m-1…m-4. One commit per finding, oldest first. Not self-reviewed; for re-review in round 3._

| Finding | Commit | Change | Test (`001-backend.api.test.mjs`) |
|---|---|---|---|
| **C-1** (Critical) | `af00706` | Public `GET /domains` now **requires a site**: without one, or with `ALL`, it returns 400 `ERR_SITE_REQUIRED`. It returns only `[{ domain }]`: that site's active entries plus platform-wide ones, with no `id`, `siteId`, `addedBy` or `createdAt`. New **`GET /domains/manage`**: authenticated, `REGISTRATION:view`, `resolveSite({allowAll:true})`. It returns full rows for the admin panels (the site's entries plus platform-wide ones; everything for a Master using `ALL`). | "C-1 public GET /domains…", "C-1 GET /domains/manage…" |
| **M-1** (Major) | `72be703` | `POST /rbac/users` checks for a non-Master caller. It refuses: changing **their own** `roleId`, `customModuleOverrides`, `siteScopeType`, `assignedSiteIds` or `status`; turning on a MASTER_CONFIG / USER_MANAGEMENT / SECURITY_AUDIT override for anyone; and assigning a role that grants those rights or has `siteScope: ALL_SITES`. Refusal is 403 `ERR_MASTER_ONLY` + `RBAC_PRIVILEGE_ESCALATION_BLOCKED`. **Unchanged values pass**, so re-saving a loaded record (e.g. only the name changed) still works. | "M-1 /rbac/users…" covers both of the reviewer's repros |
| **M-2** (Major) | `25927dd` | `POST /rbac/roles` and `DELETE /rbac/roles/:id` are **Master-only for Phase 1** (403 `ERR_MASTER_ONLY` + audit). This replaces B8's finer role checks; the B8 test was updated to match. | "M-2 creating, editing and deleting roles is Master-only…" |
| m-1 | `0dc2d0d` | `bulkUploadRegistrations` fails closed: with an empty allowed set, each row is refused with "Registration isn't open for this site yet." | added to "B7/H9 registration fails closed…" |
| m-2 | `c5cd6e9` | A Master move (`siteForSave`) needs a known site id (or `site-default`); otherwise 400 and nothing changes. | "m-2 a Master Admin cannot move a record…" |
| m-3 | `98e4a2c` | toggle-module / generate-reset-token: self and privileged refusals now return `ERR_MASTER_ONLY`. `ERR_SITE_FORBIDDEN` only for a target outside the caller's sites. | "m-3 self / privileged refusals…" |
| m-4 | `5bf3523` | Deleted the dead `denyForeignSite`; fixed the `/slots/change` comment. No behaviour change. | none (dead code; lint covers it) |

**Checks on `5bf3523`:**
- `npm run lint`: exit 0. `npm run build`: exit 0.
- `npm run test:qa`: 97 tests. `001-backend.api.test.mjs` passes **49/49**. `001-platform-v1.api.test.mjs` is 0/48 under strict mode (known: QA fixtures send no site, backend gap 5).
- QA suite with `SITE_SCOPE_MODE=fallback`: **32/48**, unchanged, 0 new failures.

**Hand-offs from round 2:**
- **Frontend (C-1 c, blocking):** `DomainWhitelistPanel.tsx` and the domain management in `EmployeeRegistration.tsx` must read from **`GET /domains/manage`**. The public `/domains` no longer returns `id`/`siteId`/`addedBy`, so the panels can't label or remove entries until they switch. The registration forms (`EmployeeRegistration.tsx:298`, `EmployeeMobileApp.tsx:185`) must send the chosen site to the public route (they get 400 without one) and use only `domain`.
- **Frontend (M-2):** role create/edit/delete buttons should be hidden for non-Masters. The server now refuses them.
- **Security (step 7):** please re-check C-1 and M-1 as the review asks.
- Not in this task and left open: M-3 (mobile M1), m-5 (frontend), m-6 (PM/architect decision), m-7/m-8 (frontend/security).

## Frontend
_Author: frontend-dev · Date: 2026-09-28 · Status: **Round 2 frontend fixes done (C-1 c, m-5, m-7, M-2 UI); ready for code review round 3**. F1–F8 + PRD Addendum C done earlier. Not self-reviewed. `main` untouched, nothing pushed._
_History: blocked on 25 Sep (no approved 02/03). This section replaces that note._

### Round 2 fixes (code review round 2, 2026-09-28)
_Scope: the frontend parts of round 2: C-1 (c), m-5, m-7, plus the backend hand-off to hide role editing for non-Masters (M-2 UI). One commit per finding. Not self-reviewed; for re-review in round 3._

| Finding | Commit | Change |
|---|---|---|
| **C-1 (c)** (Critical) | `17ececd` | **`DomainWhitelistPanel`** reads the authenticated **`GET /domains/manage`**. Its full rows keep the "This site" / "All sites" / site-code labels and Remove working. **`EmployeeRegistration`** and **`EmployeeMobileApp`** call the public `GET /domains?siteId=<chosen site>` and use only `domain`. |
| **m-5** (Minor) | `5386121` | `UserManagementModule` gets `isMaster={isMasterAdmin(viewer)}`, so the Role View Simulator tab follows the viewed user and is hidden while viewing as a non-Master. |
| **m-7** (Minor) | `9657b47` | The fetch wrapper adds `x-session-token` only for the page's own origin and the `API_BASE` origin. `API_BASE` moved from `LoginScreen.tsx` to a new shared `src/apiBase.ts`, so the sign-in URL and the token rule can't drift apart. `x-site-id` / `x-view-as` stay same-origin `/api/v1/*` only, as before. |
| **M-2 UI** (backend hand-off) | `a485dda` | `MasterAdminRoles` is read-only for non-Masters, since the server now refuses role changes from them. Save role, Clone and New custom role are hidden, all toggles are locked, and a note reads "Roles can be changed by a Master Admin only." |

**Behaviour the public route change needs on the page (C-1):**
- **Registration form:** the public list returns names only, with no `isActive`. The old filter on `isActive` would have marked every email "not whitelisted" and blocked registration, so the form now uses the names as returned.
- **No single site chosen** (All sites mode, or the Employee preview with no site context): the page doesn't call the public route, which would answer 400. It doesn't pre-judge the email either; the server decides on submit and fails closed. The domains banner says "Checked for the employee's site when the request is submitted."
- **Approvals Valid / Invalid badge:** now checked against **the request's own site** (its entries plus platform-wide ones) from `/domains/manage`. Before, it used the one list for the chosen site, which was wrong for rows in All sites mode. If that list can't be loaded (no REGISTRATION view), the badge is neutral (just the domain) and makes no claim.

**Gaps found in round 2 inputs (for others):**
1. **Mobile and console use different override variables.** `src/mobile/api.ts` reads `VITE_API_BASE` while the console reads `VITE_API_BASE_URL`, so one build setting doesn't cover both. Mobile's call (M-3 / M1 owner). I did not change mobile code.
2. **`EmployeeMobileApp` (the in-console Employee Smart Pass preview) still has a hard-coded fallback domain list** when its list is empty. It was already there, it only affects the preview, and the server enforces domains on submit. Phase 2 (P2-7) replaces this app.
3. **m-5 and M-2 UI couldn't be checked in the browser.** No seeded account is a non-Master with USER_MANAGEMENT. They were checked in code only; QA should add such an account to the fixtures.
4. Not frontend, still open: **M-3** (mobile M1), **m-6** (PM/architect decision), **m-8** (security reviewer).

**Checks after each fix** (`17ececd` → `a485dda`): `npm run lint` exit 0 · `npm run build` exit 0 · `npm run test:qa` 97 tests: `001-backend` **49/49**, `001-platform-v1` 0/48 under strict mode (known: QA fixtures send no site, backend gap 5).

**Browser-checked** in headless Chromium against a server built from `a485dda`:
- **Site Admin:** the panel lists and labels entries from `/domains/manage`, and Remove appears only on "This site" entries. The registration form calls `/domains?siteId=site-1` and lists that site's plus platform-wide domains. A site-1 request from `@alphatech.in` shows "Valid" on Approvals.
- **Master Admin in All sites mode:** the panel shows site codes, and there is no public `/domains` call anywhere, so no 400s.
- **m-7:** a fetch to a third-party origin carries no `x-session-token`; same-origin `/api/v1` still does.

### Gaps found in inputs
1. **Legacy `site-default` records can't be chosen.** Under strict mode they show only in All sites mode, which is read-only. `/my-sites` never lists `site-default`, so no one can select it or edit those records. In the local seed, all 1,080 slots are `site-default`. **Devops/QA:** the R11 check must confirm Alphatech has no strays, or run `/admin/migrate-site-data` first.
2. **Sign-in goes to an absolute Cloud Run URL.** `LoginScreen.tsx` and `src/mobile/api.ts` post to the `run.app` URL unless `VITE_API_BASE_URL` is set, so sign-in is cross-origin. That is correct for the wrapper, which only adds `x-site-id` / `x-view-as` to same-origin `/api/v1/*` calls. For local testing, build with `VITE_API_BASE_URL=http://localhost:<port>`, otherwise sign-in tries production.
3. **Addendum C has no UX spec for a Site Admin domain screen.** It was built as a small panel on Approvals → Registration Requests, reusing UX §5 copy where it exists (for example "Enter a domain like company.com"). **UX to review these new strings:** "Allowed email domains", "Employees can self-register only with an email from these domains.", "This site" / "All sites", "New domains apply to {site} only." / "…to every site.", "To allow a domain for every site, switch to All sites.", "Domains marked All sites are managed by your Master Admin.", "No domains allowed yet. Registration stays closed until one is added."
4. **F1 changed what "Add domain" does for Master Admin.** With one site chosen, Add creates a domain for that site only; before, it was always platform-wide. In All sites mode it adds a platform-wide domain. The panel says which one will happen.
5. **The suspended message only appears for an existing session.** The server answers sign-in for a suspended account with the generic "Invalid credentials." to prevent account enumeration. So "Your account is suspended…" shows only when an existing session is rejected (`ERR_ACCOUNT_INACTIVE`, AC-10). Sign-in is still refused, as AC-10 requires.
6. **Two exports can't send headers.** The Logs CSV export used `window.open` with no site or token, so strict mode would reject it with 400. It now passes `siteId` and the token in the query, the same pattern Reports already uses. It is disabled while viewing as another user, because `x-view-as` can't be sent. The Reports export (`SiteAdminReports`) is not in F4's list and is unchanged. Under view-as it would export with Master Admin's masking. Low risk; flag for security review.
7. **F8 went slightly wider than asked.** The same made-up "1,080" figure was also removed from the Inventory tab label, the Logs subtitle and the Inventory Home tile description.
8. **The header needed room for the chip at every width (L-1).** Below 640 px it hides the PF logo tile (Home stays in the sidebar), the refresh button and the profile chevron. Below 1024 px it hides the version badge and the tagline. UX §6's "⋯ menu" for header actions is Phase 2.
9. **UX copy for save errors is only on the shared handlers.** "Couldn't save. Nothing was changed.", the cross-site message and the read-only messages apply to the App-level entry, exit and slot-status actions. Pages that save on their own still show the server's `message` (Phase 2, P2-9).

### What was built (per task)
- **F1** — `src/utils/withSite.ts` (new):
  - The site / view-as store and the request-generation counter.
  - `withSite(url)` and a `SiteContext` + `useSiteContext()` React context.
  - `useWriteGuard()`, the `ReturnTo` storage helpers and the UX error copy.

  `src/sessionTokenFallback.ts`: the global fetch wrapper adds `x-site-id` / `x-view-as` to same-origin `/api/v1/*` calls. It never overrides a header or a `?siteId=` the caller set. A 401 `ERR_SESSION_EXPIRED` or 403 `ERR_ACCOUNT_INACTIVE` raises `parkflows:session-ended`; sign-in, set-password and logout calls are excluded.
- **F2** — `App.tsx`:
  - Site is `string | null`. Permitted sites come from `/my-sites`: 0 → S-0; 1 → auto-select; 2+ or Master Admin → the remembered site if still permitted, else Choose-a-site, with **no data calls** before a choice.
  - Switching bumps the generation, clears lists straight away and shows skeletons. The page content is keyed by site, so pages that fetch their own data remount.
  - Every fetcher drops stale results. `/rbac/users` no longer refreshes the current user; `/auth/me` does, and it can't sign a previous user back in (the `05` Major).
  - No unauthenticated mount fetch. Loading runs from effects keyed on the user id and the site (the `05` Minors).
  - The Employee sign-in path skips admin calls.
  - Sign-out now also calls `POST /auth/logout`, so the server destroys the session.
- **F3** — `SiteSwitcher.tsx` (new) + `Header.tsx`:
  - The chip is visible at every width: "{Site name} · {CODE}" at ≥ 1024 px, the code alone below that, and "All sites" or "Choose a site" when relevant. Below 1024 px the list opens as a bottom sheet.
  - The list is a real listbox (↑/↓, Home/End, Enter, Esc returns focus to the chip, 44 px rows). Options come from `/my-sites`, with "All sites" for Master Admin only.
  - The page eyebrow shows the site name or "ALL SITES · n sites".
  - The unused `allUsers` / `onSelectUser` props are removed.
- **F4** — `SiteCodeChip.tsx` (new) on rows in Inventory, Live Floor Plan, Logs, Registration/Approvals (requests and employees), Alerts, Valet and Relocation Logs. `useWriteGuard()` is spread on every write action in those pages (38 buttons):
  - In All sites mode they are disabled with the tooltip "Select one site to make changes".
  - Under view-as the tooltip reads "Read-only while viewing as another user".
  - Where a button already had its own `disabled`, the two conditions are combined.

  In All sites mode the eyebrow also says "· Select one site to make changes", because tooltips on disabled buttons can't be reached from the keyboard.
- **PRD Addendum C** — `DomainWhitelistPanel.tsx` (new):
  - Every domain carries a scope label: "This site", a site code (in All sites mode) or "All sites".
  - Add targets the chosen site (or, for Master Admin in All sites mode, every site).
  - Remove appears only where the server will accept it: a Site Admin sees it only on their own site's entries. Nothing is editable under view-as.
  - The panel replaces the old domain section in Master Site Config, which read `d.active` although the API sends `isActive`, so every domain showed as "inactive". It was also added to Approvals for Site Admins.
- **F5** — `rbac.ts` gets `canOpenTab()` and `MASTER_ONLY_TABS` (InfoSec & audit). They are used by the Sidebar, Home tiles and header shortcuts (bell items appear only for pages the role can open; pending approvals now opens Approvals). A page the role can't open renders `NoAccess.tsx` (S-NA) with Go to Home. The Role View Simulator tab is Master Admin only. Clear-history no longer offers the Security Audit Log, which the server refuses since B9.
- **F6** — `ErrorCard.tsx` (new):
  - A list failure (network or 5xx) shows "We couldn't load this…" + **Try again**, and the old rows are greyed out.
  - A list 403 `ERR_SITE_FORBIDDEN` means the user's site assignment changed, so the site is resolved again.
  - `saveErrorMessage()` maps error codes to the UX copy.
  - When a session ends, `{tab, siteId, userId}` is stored, the user goes to sign-in with the notice ("Your session ended. Sign in to continue." or the suspended message), and after sign-in the same account returns to the same page and site.
- **F7** — `ViewAsBanner.tsx` (new):
  - "View as" (no longer `setCurrentUser`) sets the view-as target. The purple banner (`role=status`) reads "Viewing as {user} · {role} · {site} — read-only" with **Exit view**.
  - The console renders as the viewed user: their modules, sites and Home. The header profile stays the real Master Admin, and all writes are disabled.
  - `localStorage['parkflows.viewAs']` is checked again against `/rbac/users` on reload; if the user no longer exists, the view ends with "Couldn't start the view. Try again."
  - Exit view restores the Master Admin's own site, and their page too unless the browser was reloaded (then Home).
  - Viewing a user with no site shows S-0 inside the shell, with no Sign out button.
- **F8** — The Sidebar footer no longer shows "System healthy / 100% ANPR & sensor uptime". The Inventory description is now "Slots, levels & bulk upload" (plus gap 7).

### Files changed
New: `src/utils/withSite.ts`, `src/components/{ChooseSite,NoSiteAssigned,ListSkeleton,SiteSwitcher,SiteCodeChip,DomainWhitelistPanel,NoAccess,ErrorCard,ViewAsBanner}.tsx`.
Changed: `src/App.tsx`, `src/sessionTokenFallback.ts`, `src/utils/rbac.ts` (additive: `canOpenTab`, `MASTER_ONLY_TABS`), `src/index.css` (disabled style for guarded buttons), `src/components/{Header,Sidebar,RoleHomePage,InventoryMaster,LiveFloorPlan,ParkingLogs,EmployeeRegistration,NonParkedAlerts,ValetXModule,MasterAdminRelocationLogs,MasterAdminSites,MasterAdminData,MasterAdminRoleSimulator,UserManagementModule,LoginScreen}.tsx`.
No new dependencies. No server, Firestore rules or deploy config changes.

### Commits (on the branch, oldest first)
`164d67e` F1 · `a5fc0e7` F2 · `ee823e7` F3 · `b54fb02` F4 + Addendum C · `1dcff00` F5 · `d397523` F6 · `b75265f` F7 · `0dd8643` F8.

### Screens affected
The app shell (header chip and bottom sheet, eyebrow, banner, S-0, Choose-a-site, S-NA, error card, skeletons), the sign-in notice, Home (tiles), Live Parking Status, Inventory Master, Entry/Exit Logs, Employee Registration, Approvals (plus the domain panel), Non-Parked Alerts, ValetX, Relocation Logs, Master Site Config (domain panel), User & RBAC (simulator), and InfoSec (Data & Retention).

### How to test manually
Build with `VITE_API_BASE_URL=http://localhost:<port> npm run build` (see gap 2). Then run `npm start` with `SEED_DEMO_USERS=true DEMO_USER_PASSWORD=… BOOTSTRAP_ADMIN_PASSWORD=…`. Accounts: `digisolutions` (Master Admin), `ananya.site` (Site Admin, 1 site), `suresh.valet` (2 sites, not Master), `rajesh.audit` (all sites, not Master), `ramesh.gate` (Attendant).
1. **Site resolution (AC-02/04/05/44/47).**
   - Master Admin: "Choose a site" appears, and the Network tab shows only `/my-sites` + `/rbac/roles` until a choice is made. After choosing, every list call carries `x-site-id`.
   - ananya: her site is auto-selected and the chip has no chevron.
   - suresh: gets the prompt without an "All sites" option.
   - Sign out and back in: the last site is remembered.
2. **Chip (L-1).** At 375, 768 and 1280 px the chip shows the site code or name, with no horizontal scroll. Below 1024 px it opens as a bottom sheet. Keyboard: ↑/↓/Enter/Esc work.
3. **All sites (L-3).**
   - Master Admin → All sites: rows carry a site-code chip, and every write button is disabled with "Select one site to make changes" (checked: 0 enabled across the 6 pages).
   - Choose one site: the buttons are enabled again.
4. **Race (MAN-02).**
   - With 1.5 s latency, switch sites quickly: skeletons show at once, and there are never old rows under the new name.
   - Sign out during a slow refresh: you stay signed out, and the stored session stays empty.
5. **S-NA / L-5.**
   - InfoSec and the Role View Simulator show only for Master Admin; other roles' sidebars and Home tiles hide them.
   - Stale-tab S-NA check: set sessionStorage `parkflows.returnTo` to `{"tab":"SECURITY_AUDIT","siteId":null,"userId":"usr-102"}`, then sign in as ananya. S-NA appears, and Go to Home works.
6. **Errors / session (L-6, AC-45/47).**
   - Stop the server and press refresh: the error card appears with Try again, and old rows are greyed out.
   - Kill a session with `POST /auth/logout` using its token, then refresh: sign-in shows "Your session ended…", and after sign-in you're back on the same page and site.
7. **View as (L-8, AC-55).**
   - Master Admin → User & RBAC → Role View Simulator → View as ananya: the purple banner appears, with her site and modules, and every call carries `x-view-as`. Writes are disabled with "Read-only while viewing as another user".
   - A direct POST gets 403 `ERR_VIEW_AS_READ_ONLY`.
   - Reload: the banner stays. Exit view: your own site comes back and the header is gone from later calls.
8. **Domains (Addendum C, AC-57).**
   - ananya → Approvals: an invalid domain shows "Enter a domain like company.com"; adding `alphatech.in` labels it "This site" with a Remove button. Platform-wide entries say "All sites" and have no Remove.
   - Master Admin → All sites → Master Site Config: site entries show site codes, and the hint reads "New domains apply to every site."

I ran steps 1–8 in headless Chromium against a local server built from this branch. The scripts are ad hoc and not committed; a browser test harness is QA's call.
## Mobile
## Build/lint results

**Backend (2026-09-28, on `0180e3e`):** `bun install --frozen-lockfile` OK · `npm run lint` exit 0 · `npm run build` exit 0 · `tests/qa/001-backend.api.test.mjs` **43/43 pass** (incl. domain whitelist) · QA suite `001-platform-v1` with `SITE_SCOPE_MODE=fallback`: **32/48 pass** (was 21/48 on 25 Sep; 0 new failures; the 16 left are Phase 2 ACs plus PERM-02, which now fails by design and is to be rewritten by QA; see Backend gap 4). QA suite under strict mode: fixtures need a site (Backend gap 5).

**Frontend (2026-09-28, on `0dd8643`):** `bun install --frozen-lockfile` OK · `npm run lint` exit 0 · `npm run build` exit 0 · `npm run test:qa` after every task F1–F8: `001-backend` **43/43 pass** (unchanged); `001-platform-v1` **0/48** under strict mode, unchanged from before F1: its `before()` hook sends no site (Backend gap 5; QA-owned fixtures). No frontend change touches the server, so these suites can't move with F1–F8.

**Frontend round 2 (2026-09-28, on `a485dda`):** `npm run lint` exit 0 · `npm run build` exit 0 · `npm run test:qa`: `001-backend` **49/49**; `001-platform-v1` 0/48 under strict mode (unchanged, QA fixtures).
