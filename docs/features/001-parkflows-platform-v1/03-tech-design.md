# Technical Design — ParkFlows Platform v1 (baseline) · Phase 1 launch (Option A)
Feature ID: 001 · Author: architect · Date: 2026-09-28 · Revision: v1.0 · **APPROVED by user 2026-09-28**
Inputs: `01-prd.md` v1.2 **APPROVED** + Addendum A (R1–R11) · `02-ux-design.md` v1.1 · `05-code-review.md` (round 1, CHANGES) · `06-test-report.md` (FAIL, 31 bugs) · `07-security-review.md` (BLOCKED, H1–H9) · `08-release.md` (NOT READY)
Code read: `main` @ `d42af6f` + working tree (28 Sep 2026): `server.ts`, `src/server/{db,security}.ts`, `src/App.tsx`, `src/sessionTokenFallback.ts`, `src/utils/rbac.ts`, `src/types.ts`, `src/components/{Header,Sidebar,MasterAdminRoleSimulator,…}.tsx`, `src/mobile/{api,siteContext}.ts`.

**Launch scope decision: Option A** = PRD OQ-13 option (a): on **1 Oct 2026** ship the **web console + site-isolation fix** for **Alphatech**. Android APKs follow (Phase 2), iOS/stores later (Phase 3). Existing flows (the `/attendant` web portal, employee registration) stay as they work today (OQ-16).

This document is **fully detailed for Phase 1**. Phase 2 is set out as data-model direction and epics only. It will be refined in a v1.1 of this file before any Phase 2 build starts.

---

## Gaps found in PRD / UX
1. **`withSite()` does not exist.** `.claude/agents/architect.md` and `KNOWN_ISSUES.md` refer to it (commit `2472379`), but neither the commit nor the helper is in this repo. `src/App.tsx` still fetches `/slots`, `/employees`, `/logs`, `/alerts/non-parked` and `/registrations` with no site (Addendum R1, QA BUG-18). This design re-introduces it (`src/utils/withSite.ts`, task F1). It does **not** assume the lost commit will be recovered.
2. **How I read "Option A".** I read it as OQ-13 option (a). It also settles UX **G-17**: Phase 1 adds **no new gate UI**. Gate outcomes at Alphatech stay as today's red/green toasts, and AC-14 and AC-19..AC-23 move to Phase 2. **PM/QA must accept this**, because today's `/attendant` portal admits *any* plate as a VISITOR (QA BUG-5). That is today's behaviour, and it continues until Phase 2.
3. **The UX Phase 1 list leaves out the security gate.** UX §0 lists AC-01..07, 44, 45, 47, 52 and 55 as must-pass. But step 7 cannot pass with **High** findings open, and H1–H9 in `07` are live today, several of them cross-site. So **H1–H9 are in Phase 1**. They are all small, route-level changes. For H9, only the disclosure fix is in Phase 1; the per-site whitelist (US-13, M10) is Phase 2.
4. **Strict `siteId` (AC-02) vs the deployed clients.** Addendum R2 proposed deferring the strict reject. UX v1.1 puts AC-02 in Phase 1. I follow the approved PRD and UX (strict). A **kill-switch** env var (`SITE_SCOPE_MODE`) reverts to today's fallback without a rebuild (see Risks).
5. **The Role View Simulator is client-only.** `MasterAdminRoleSimulator` calls `setCurrentUser(u)` in the browser, but the server session is still the Master Admin's. So a "simulated" Site Admin sees **Master-scope data**, and **writes run as Master**. This is the real cause of R1's "don't demo the simulator". The design adds a server-enforced, read-only `x-view-as` header (B10, F7).
6. **Audit records have no `siteId`.** AC-03 needs refused cross-site writes to be audit-logged. `SecurityAuditLog` has no site field, and `/security/audit-logs` is unscoped (M3, BUG-7). Phase 1 adds an optional `siteId` and makes the audit reads Master-only. The hash chain (AC-38, M1) is Phase 2.
7. **`/sites` returns every tenant to any signed-in user (H7).** The console switcher uses it and filters client-side. Phase 1 changes `/sites` to return only the caller's sites.
8. **Schedule.** Today is 28 Sep and launch is 1 Oct. This design must be approved **today** for step 4 to finish by 29 Sep and leave room for the Addendum R5 dry-run deploy. If that slips, see "Minimum cut" under Risks.
9. **Package manager.** The Cloud Build config is not in the repo. `d42af6f` ("Regenerate bun.lock … fixes Cloud Build") suggests the deploy installs with Bun. Step 0 keeps `bun.lock` and removes `package-lock.json`. **The R5 dry-run must confirm this**, and if Cloud Build uses npm, swap which lockfile is kept.
10. **The UX field/status mismatches G-1, G-3, G-4 and G-5** (site status values, Revoked state, site billing fields, slot fields) are Phase 2 screens. They are addressed in the Phase 2 data model below, not built now.
11. **The downstream docs predate this design.** `05`–`08` were baseline audits run without a design. They must be **re-run** against the step-4 diff on the feature branch. The Mobile section of `04` is empty.
12. `ARCHITECTURE.md` (route table), `README.md` and `KNOWN_ISSUES.md` are stale (R10). The doc refresh is task D1, after launch.

---

## Overview
**How the system works today (relevant to this design).** Express (`server.ts`) keeps the **whole dataset in memory** (`getStore()`) and mirrors it to Firestore through `saveDB()` (debounced full sync plus targeted writes). All reads are in-process array filters. Firestore rules deny all client access. Every `/api/v1/*` route except the six public ones goes through `requireAuth` → `enforceSiteScope`. Scoped users already can't *claim* a foreign `siteId`. But:
- (a) a missing or `ALL` site silently falls back to the user's first site, or for Master Admin, to every site;
- (b) routes that find records **by id or by plate** never check that record's own site (H4, H5, BUG-1..4);
- (c) several routes are not scoped at all (H6, H7, M3, L2).

The web console never sends a site, so Master Admin always sees combined data, and a multi-site user is pinned to their first site (BUG-18).

**Phase 1 design in five parts.**
1. **One server-side site resolver** (`resolveSite()`). Every list and write route calls it. It enforces AC-02 strictly: missing site → 400, foreign site → 403 + audit, `ALL` → Master Admin reads only.
2. **Record-level ownership checks** on every route that touches a record by id or by plate. The *stored* `siteId` decides access, never the body.
3. **One client site context.** `src/utils/withSite.ts` holds the active site. It extends the existing global `fetch` wrapper (`installSessionTokenFallback`) to attach `x-site-id` (and `x-view-as`) to every `/api/v1` call, so the ~70 existing call sites need no edits. A **request generation guard** drops stale responses after a site switch, logout or view-as change. This also fixes the logout race Major in `05`.
4. **The UX Phase 1 changes L-1..L-8**, built on that context.
5. **Security Highs H1–H9** and the Addendum go/no-go items (R1, R3, R4, R5, R6), plus the **step 0** repo clean-up.

**Explicitly not in Phase 1:** gate authorisation and override (AC-19..23), site-status gate block (AC-14), 2-vehicle passes, multi-site passes and the Revoked state, per-site domain whitelist, overstay settings and notifications, retention/archive, audit hash chain, live 5 s floor plan, CSV import results, APK builds.

---

## Data model changes (src/types.ts, Firestore collections, indexes, rules)

### Phase 1
| Area | Change | Back-compat |
|---|---|---|
| `src/types.ts` · `SecurityAuditLog` | Add `siteId?: string` (the site the action targeted; absent for platform-level events). **Not** part of the `integrityHash` payload, so existing hashes still verify. | Optional field. Old entries are unaffected. |
| `src/types.ts` · new `ApiErrorCode` | `'ERR_SITE_REQUIRED' \| 'ERR_SITE_FORBIDDEN' \| 'ERR_SITE_ALL_NOT_ALLOWED' \| 'ERR_VIEW_AS_READ_ONLY' \| 'ERR_MASTER_ONLY' \| 'ERR_SESSION_EXPIRED' \| 'ERR_ACCOUNT_INACTIVE'`. Error bodies stay `{ success:false, message, errorCode }`. | Additive. Clients that read only `message` still work. |
| `src/server/security.ts` · Express `Request` augmentation | Add `viewAs?: AppUser` and `effectiveUser?: AppUser` (= `viewAs ?? user`). | Internal. |
| `src/utils/rbac.ts` | Add `isMasterAdmin(user)`: `roleId === 'role-master-admin'` (the same rule `getAllowedSiteIds` uses). Client and server share this one definition. | Additive. |
| Firestore collections | **None added.** `securityAuditLogs` docs may carry `siteId`. | — |
| Firestore indexes | **None.** All queries run in memory. There is no `where/orderBy` on Firestore at request time. | — |
| `firestore.rules` | **No change** (it stays deny-all). | — |
| Env vars | New, optional: `SITE_SCOPE_MODE=strict\|fallback` (default `strict`). Existing, now **required on Cloud Run**: `AUDIT_HMAC_SECRET` (the server refuses to start without it when `K_SERVICE` is set, see B11). | Unset = strict. |
| Browser storage | `localStorage['parkflows.site.<userId>']` (last chosen site, for AC-47) and `localStorage['parkflows.viewAs']` (the simulated userId, for AC-55). Both are validated against the server on load, and both are conveniences only. | New keys. |

**No back-fill is needed.** Records without `siteId` keep resolving to `site-default` (`DEFAULT_SITE_ID`), exactly as today. Under strict mode, a Master Admin sees them only by choosing that site explicitly. The pre-launch R11 spot-check must confirm Alphatech's slots, employees and registrations all carry Alphatech's `siteId`. Use `/admin/migrate-site-data` (Master Admin, existing) only if the check finds strays.

### Phase 2 direction (to be detailed in v1.1; nothing built now)
- `SiteStatus` → `'ACTIVE' | 'ON_HOLD' | 'MAINTENANCE' | 'DECOMMISSIONED'`. Map the legacy value `DEACTIVATED` to `DECOMMISSIONED` on read (G-1).
- `SiteConfig` + `overstayLimitHours` (default 12), `capacity2W`, `capacity4W`, `facilityType`, `billingType` (G-4, US-26).
- `RegistrationStatus` + `REVOKED`. `Employee.vehicles: {number, type, status}[]` (max 2), keeping `vehicleNumber` as a mirror of `vehicles[0]` for the deployed apps (G-3, AC-50).
- `WhitelistedDomain.siteId` (per-site whitelist, M10, US-13, AC-49).
- `ParkingLog.override?: {reason, by}` (AC-20).
- New `employeeNotifications` collection (AC-33).
- `archived` flag + archive job for records older than 1 year (AC-53).
- `SecurityAuditLog.prevHash` + `seq` for the chain (AC-38).

---

## API contracts
All routes are under `/api/v1`. "Site" means the value resolved by `resolveSite()` from `?siteId=` (which wins) or the `x-site-id` header. Only new or changed behaviour is listed.

**Shared errors (every scoped route):**
- 400 `ERR_SITE_REQUIRED`: no site sent.
- 403 `ERR_SITE_FORBIDDEN`: the site is not one of the caller's sites, or the target record belongs to another site. Audit-logged.
- 400 `ERR_SITE_ALL_NOT_ALLOWED`: `ALL` sent on a write, report or single-site route, or `ALL` sent by a scoped user.
- 403 `ERR_VIEW_AS_READ_ONLY`: any non-GET while `x-view-as` is set.

| Method | Path | Role(s) | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/slots`, `/employees`, `/logs`, `/alerts/non-parked`, `/registrations`, `/valet/tickets` | authenticated (today's permissions) + `/logs` now needs `LOGS:view` | site required; `ALL` allowed for Master Admin only | Unchanged shape. In `ALL` mode every row already carries `siteId` (the client renders the chip). | shared; 403 missing `LOGS:view` |
| GET | `/logs` (H1) | as above | `maskPII` and `userRole` query params are **ignored** | Masking comes from the effective user's role (`FULL_PII_ROLES` / `PLATE_VISIBLE_ROLES`, as `/employees` does) | shared |
| GET | `/slots/change-notifications` (H6) | `FLOOR_PLAN:view` or `MOBILE_APP:view` | site required (`ALL` for Master) | `{notifications}` filtered by site; `mobile` masked unless the role is in `FULL_PII_ROLES` | shared, 403 |
| GET | `/export/reports` | `ANALYTICS:canExport` | site required; **no `ALL`** | CSV for one site (filters unchanged; BUG-25 is Phase 2) | shared |
| GET | `/reports/{mix,violations,utilization,occupancy-trend,peak-hours,overnight-requests}` | `REPORTS:view` | site required; **no `ALL`**; the `\|\| DEFAULT_SITE_ID` fallback is removed | unchanged | shared |
| GET | `/reports/slot-daily-vehicles` (L2, BUG-9) | `REPORTS:view` | `slotId` + site | unchanged | 403 if the slot's stored `siteId` ≠ the resolved site |
| GET | `/analytics/prediction` | authenticated | site required; no `ALL` | forecast computed from that site's slots/logs only (`generate24HourPredictiveForecast(siteId)`) | shared |
| POST | `/ai/recommend` | `ANALYTICS:view` | site required; no `ALL` | context built from that site only | shared |
| GET | `/invoices` | `MASTER_CONFIG:view` | site or `ALL` (Master) | unchanged | shared |
| GET | `/sites` (H7) | authenticated | — | **Only the caller's sites** (all sites for Master/ALL_SITES). `contactPerson/Email/Phone` and `pricing` are removed unless the caller has `MASTER_CONFIG:view`. | — |
| GET | `/my-sites` | authenticated | — | unchanged (already scoped). Uses the effective user under view-as. | — |
| POST | `/slots/save`, `/employees/save` (H4, BUG-1/2) | unchanged | body as today | unchanged | 403 `ERR_SITE_FORBIDDEN` if `id` matches a record whose **stored** site ≠ the resolved site. The body `siteId` can't move an existing record (non-Master: forced to the stored value; Master: allowed and audit-logged). |
| POST | `/slots/bulk-upload`, `/employees/bulk-upload`, `/registrations/bulk-upload` | unchanged | rows as today | unchanged | the **whole batch** is rejected with 403 if any row targets another site's record by `id`, or carries a foreign `siteId`; nothing is written |
| POST | `/slots/update-status`, `/slots/delete`, `/valet/status`, `/registrations/approve\|reject`, `/reports/overnight-requests/review` | unchanged | unchanged | unchanged | existing `denyForeignSite` checks stay; 403s are now audit-logged. `update-status` validates `newStatus` against `SlotStatus` (400, L3) |
| POST | `/registrations/approve` (BUG-12) | `APPROVALS:canEdit` | `{requestId}` | the pass is created in the **request's** `siteId` (today it lands in `site-default`); `REGISTRATION_APPROVED` is audit-logged with `siteId` | 403 |
| POST | `/registrations/reject` | `APPROVALS:canEdit` | `{requestId, reason}` | `REGISTRATION_REJECTED` is audit-logged (the mandatory reason, BUG-24, is Phase 2) | 403 |
| POST | `/vehicles/entry` (H5) | `MOBILE_APP:canCreate` | site required; no `ALL` | The "already parked" check is scoped to this site. If the plate is also occupied at another site, entry still proceeds here, the response never mentions the other site, and a `VEHICLE_ACTIVE_AT_OTHER_SITE` event is audit-logged. The employee lookup is scoped to this site. | shared |
| POST | `/vehicles/exit` (H5, BUG-3) | `MOBILE_APP:canCreate` | site required | The plate is matched **only within this site** | 404 "No active occupied vehicle found…" (same text as today, no foreign data) |
| POST | `/slots/change` (BUG-4) | `MOBILE_APP:canEdit` | site required | the plate is matched only within this site | 400 as today |
| POST | `/vehicles/scan-plate` (BUG-10, R8) | `MOBILE_APP:canCreate` | site required | Any employee match is scoped to this site. With no image, or no `GEMINI_API_KEY`, it returns `{success:false, message:'No plate detected. Type it in.'}`: it **never** returns a random or mock plate | 400 |
| GET | `/employees/profile` (H2) | authenticated | `email` or `employeeId` only; **`query` is removed** | A non-admin gets only their own record. Anyone else needs `REGISTRATION:view` or `APPROVALS:view` + a site check on the **resolved** record. The response is masked by role. | 403, 400 |
| POST | `/employees/update-vehicle` (H3) | authenticated | a non-admin may not send `employeeId`/`email`; the target is resolved from the session email | Updates only the resolved record. **No auto-create**: if no record matches, 404 "No pass found — register first". Old and new plate are audit-logged. | 403, 404, 400 |
| POST | `/registrations/submit` (H9, public) | public | unchanged | A duplicate plate returns the generic "This vehicle can't be registered. Contact your site admin." **with no owner name or ID**. An empty whitelist **fails closed** ("Registration isn't open for this site yet.") | 400 |
| POST | `/rbac/roles` (H8) | `USER_MANAGEMENT:canCreate` | unchanged | unchanged | 403 `ERR_MASTER_ONLY` if a non-Master edits a system/default role, edits their **own** role, or grants `MASTER_CONFIG`, `USER_MANAGEMENT` or `SECURITY_AUDIT` rights |
| POST | `/rbac/users/toggle-module`, `/auth/admin/generate-reset-token` (H8) | `USER_MANAGEMENT:canEdit` | unchanged | unchanged | 403 if the target user is outside the caller's sites (reuse `siteScopeViolation`) or is the caller themself |
| POST | `/security/simulate-attack`, `/admin/clear-history`, `/admin/migrate-site-data` (AC-52) | **Master Admin only** (`requireMasterAdmin`) | unchanged | unchanged. `securityAuditLogs` is **removed** from `CLEARABLE_COLLECTIONS` (M1, OQ-11c still open, so be conservative) | 403 `ERR_MASTER_ONLY` |
| GET/POST | `/security/audit-logs`, `/security/compliance-summary`, `/security/verify-audit-chain` (M3, BUG-7) | **Master Admin only** in Phase 1 (plus `SECURITY_AUDIT:view`) | unchanged | unchanged | 403 `ERR_MASTER_ONLY` |
| any | any `/api/v1/*` with header `x-view-as: <userId>` (AC-55) | caller must be Master Admin | GET only | Scope, module permissions and PII masking are evaluated as the **target** user (`req.effectiveUser`); the audit actor stays the Master Admin | 403 `ERR_MASTER_ONLY` (not Master), 404 (unknown user), 403 `ERR_VIEW_AS_READ_ONLY` (non-GET) |
| POST | `/auth/logout` (M4, partial) | authenticated | — | Destroys the session token **from any source** (cookie, bearer, `x-session-token`) | — |
| any | `requireAuth` responses | — | — | 401 now carries `errorCode:'ERR_SESSION_EXPIRED'`; 403 for suspended/locked carries `ERR_ACCOUNT_INACTIVE` | — |

---

## Site scoping & authorisation
**Rule: the server decides. The client only states which of the caller's sites it wants.** New helpers go in `server.ts`, next to the existing `getAllowedSiteIds` / `denyForeignSite`:

```ts
// Resolves the one site a request acts on. Never trusts the client beyond "which of my sites".
resolveSite(req, res, { allowAll: boolean }): string | 'ALL' | null   // null = response already sent
  raw  = query.siteId ?? header['x-site-id']
  user = req.effectiveUser            // viewAs ?? user
  allowed = getAllowedSiteIds(user)   // null = unrestricted (Master / ALL_SITES)
  if SITE_SCOPE_MODE === 'fallback' → return legacy getRequestedSiteId(req)       // kill-switch only
  if !raw                → 400 ERR_SITE_REQUIRED
  if raw === 'ALL'       → allowed === null && allowAll ? 'ALL' : 400 ERR_SITE_ALL_NOT_ALLOWED
  canonical = site id for raw (accept id or siteCode; 'site-default' allowed for unrestricted users)
  if allowed !== null && !allowed.includes(raw) && !allowed.includes(canonical)
                         → auditDenied(req, canonical); 403 ERR_SITE_FORBIDDEN
  if allowed === null && !knownSite(canonical) → 403 ERR_SITE_FORBIDDEN
  return canonical

assertRecordSite(req, res, recordSiteId, resolvedSite): boolean   // record-level check
  (recordSiteId || DEFAULT_SITE_ID) === resolvedSite, or 'ALL' is not allowed for writes → else auditDenied + 403

auditDenied(req, siteId) → logSecurityEvent({ action:'CROSS_SITE_ACCESS_DENIED', status:'BLOCKED_UNAUTHORIZED',
                                              actor:req.user.email, siteId, targetResource:req.path })
requireMasterAdmin → 403 ERR_MASTER_ONLY unless isMasterAdmin(req.user)   // the real user, never viewAs
```

| Route family | Read filter | Write check |
|---|---|---|
| Lists (slots, employees, logs, alerts, registrations, valet tickets, change notifications, invoices) | `resolveSite({allowAll:true})`; filter `(x.siteId \|\| DEFAULT_SITE_ID) === site` unless `'ALL'` | — |
| Reports, export, analytics, AI | `resolveSite({allowAll:false})` | — |
| Create (slots/employees save without `id`, valet check-in, overnight request, bulk rows without `id`) | — | `resolveSite({allowAll:false})`; the record gets that site (this replaces `SITE_INJECT_PATHS`' "first allowed site" fallback) |
| Update/delete by id (slot save/update-status/delete, employee save, valet status, approve/reject, overnight review, bulk rows with `id`) | — | `resolveSite({allowAll:false})` + `assertRecordSite(stored.siteId)`; the body `siteId` can't change the stored one (non-Master) |
| Match by plate (entry dup check, exit, relocation, scan-plate, employee lookup at gate) | only records where `siteId === site` | same |
| Employee self-service (profile, update-vehicle) | own record resolved from `req.user.email`; admins: role + `assertRecordSite` | same |
| Platform (sites write, pricing, invoices generate, domains, RBAC) | `/sites` filtered to allowed | existing permission + H8 rules; domains stay global in Phase 1 (M10 → Phase 2) |
| Test tools, audit | Master Admin only | Master Admin only |

`enforceSiteScope` (the global middleware) **stays** as defence in depth, since it already rejects foreign claimed sites. Its "inject first allowed site" branch is replaced by the explicit `resolveSite` in each create route, so there is one source of truth.

**Role checks.**
- Master Admin = `isMasterAdmin(req.user)`.
- Module rights use the existing `requirePermission`, evaluated against `req.effectiveUser` so the simulator shows exactly what the target sees.
- Suspension is already enforced per request in `requireAuth` (AC-10 passes). Phase 1 only adds the error code, so the client can show the right message.

**Client (never trusted, UX only).** `withSite` puts the active site on every call. The UI hides entry points (`isModulePermitted`) and disables writes in `ALL` mode and in view-as. The server enforces all of these independently.

---

## Components / files to change
| File | Change | Task |
|---|---|---|
| `.gitattributes` (new), `.gitignore`, `package-lock.json` (delete), `src/components/App.tsx` (delete) | Step 0 hygiene | T0a–e |
| `server.ts` | `resolveSite`, `assertRecordSite`, `auditDenied`, `requireMasterAdmin`, view-as middleware; route changes per the API table | B1–B10 |
| `src/server/db.ts` | `processVehicleEntry` / `processVehicleExit` / `changeVehicleSlot`: site-scoped plate match. `approveRegistrationRequest`: pass the request's `siteId`. `updateEmployeeVehicle`: no auto-create. `saveAppRole` / `toggleUserModuleOverride`: H8 guards. `generate24HourPredictiveForecast(siteId)`. `submitRegistrationRequest`: generic duplicate message, fail-closed whitelist. | B3, B4, B6–B8 |
| `src/server/security.ts` | `logSecurityEvent({… siteId})`; `requireAuth` error codes; `extractSessionToken`-based logout destroy; `AUDIT_HMAC_SECRET` fail-fast on Cloud Run; `Request` augmentation | B1, B11 |
| `src/types.ts` | `SecurityAuditLog.siteId?`, `ApiErrorCode` | B1 |
| `src/utils/rbac.ts` | `isMasterAdmin()` | B9 |
| `src/utils/withSite.ts` (new) | Active-site + view-as store, `withSite(url)` helper, request-generation counter, `useSiteContext()` React context (`siteId`, `isAllSites`, `isViewAs`, `canWrite`) | F1 |
| `src/sessionTokenFallback.ts` | The existing global fetch wrapper also attaches `x-site-id` / `x-view-as` to same-origin `/api/v1/*` calls (unless already set), and turns 401 `ERR_SESSION_EXPIRED` / 403 `ERR_ACCOUNT_INACTIVE` into a `parkflows:session-ended` event | F1, F6 |
| `src/App.tsx` | Site state `string \| null` (`null` = not chosen); Choose-a-site prompt; S-0; clear-then-refetch on switch; fetchers use the generation guard; no unauthenticated mount fetch; `refreshAll` from an effect keyed on `currentUser?.id` + site (fixes the `05` Minors); S-NA routing; view-as state; session-ended handling with return-to page+site | F2, F5–F7 |
| `src/components/Header.tsx` | Site chip at every width, bottom sheet < 1024 px (L-1); options from `/my-sites`; "All sites" only for Master; remove the unused `allUsers` / `onSelectUser` props | F3 |
| `src/components/Sidebar.tsx` | Remove the "100% uptime" and "1,080 slot" copy (L-7); hide Audit/InfoSec/Simulator for non-Master | F5, F8 |
| `src/components/{InventoryMaster,LiveFloorPlan,ParkingLogs,EmployeeRegistration,NonParkedAlerts,ValetXModule,MasterAdminRelocationLogs}.tsx` | Site-code chip per row in `ALL` mode; write buttons disabled with "Select one site to make changes" (L-3) via `useSiteContext().canWrite` | F4 |
| `src/components/{UserManagementModule,MasterAdminRoleSimulator}.tsx` | Simulator Master-only; "switch" sets view-as (not `setCurrentUser`) | F7 |
| `src/components/{ErrorCard,NoSiteAssigned,NoAccess,ChooseSite,ViewAsBanner}.tsx` (new, small) | Shared states from UX §3.0/§3.2/§4 with the copy from §5 | F2, F5–F7 |
| `src/components/LoginScreen.tsx` | "Your session ended…" / "Your account is suspended…" notices | F6 |
| `src/mobile/siteContext.ts`, `src/mobile/ParkFlowsApp.tsx` | If `/my-sites` fails or returns no site: blocking "Couldn't load your site" + **Try again**, instead of silently sending no header (which is now a 400) | M1 |
| `package.json` | Add script `"test:qa": "node --test tests/qa/"` (no new dependency) | B12 |
| `tests/qa/001-platform-v1.api.test.mjs` | QA-owned: the strict-site cases (400 without site; `ALL` for Master only; view-as read-only) | (QA, step 6) |

---

## Migration & backward compatibility
- **Data:** no migration and no back-fill (see Data model). Records without `siteId` stay in `site-default`.
- **Web console:** ships together with the server change (same build, same Cloud Run revision). The client and server can't drift.
- **`/attendant` portal (`src/mobile`, same build):** already sends `x-site-id` through `apiFetch` once `resolveSiteContext` succeeds. M1 closes the one gap (a failed resolve).
- **Deployed Android APK / separate `attendant` project:** not visible in this repo (08 gap 7). If an installed build sends no `x-site-id`, strict mode returns 400 on its list, entry and exit calls. **Mitigation:** Phase 2 is the first APK release (US-28), so Phase 1 assumes Alphatech gate staff use the `/attendant` web portal (OQ-16). Before 1 Oct, devops confirms no APK is in live use at Alphatech. If one is, set `SITE_SCOPE_MODE=fallback` on Cloud Run (a new revision, no rebuild). That keeps today's behaviour for everyone, and all other Phase 1 fixes stay in place.
- **Existing sessions:** unaffected. In-memory sessions reset on deploy, as today, so everyone signs in again once. The old `localStorage` session keys are read as today.
- **API consumers reading `message` only:** unaffected. `errorCode` is additive.
- **`/sites` narrowing:** Master-only screens (MasterAdminSites, Users, SiteAllocation, Data) keep the full list, because Master is unrestricted. Contact and pricing fields are kept for `MASTER_CONFIG:view` holders.
- **Rollback:** revert to the previous Cloud Run revision (`08` plan). There is no data shape change to undo. Audit entries with `siteId` are harmless to the old code.

---

## Risks & alternatives
| # | Risk | Mitigation |
|---|---|---|
| K1 | **3 days to launch.** Step 4 + re-runs of steps 5–8 + the R5 dry-run by 29 Sep. | Approve today. Tasks are ordered so each is reviewable alone. **Minimum cut** if time runs out (in order): T0 → B1–B6 → F1–F3 → B9, B11 → the rest. Items outside the minimum cut (F4 chips/disabled writes, F7 simulator banner, B8) mean: don't use `ALL` mode or the simulator at Alphatech until they ship. |
| K2 | Strict mode breaks a client that doesn't send a site. | `SITE_SCOPE_MODE=fallback` kill-switch (env only). QA runs the `/attendant` smoke (08 S6) on staging with strict on. |
| K3 | Global fetch-wrapper injection sends `x-site-id` to calls where it doesn't belong (login, `/my-sites`, `/sites`). | The server ignores the header on routes that don't call `resolveSite`. The wrapper touches only same-origin `/api/v1/*` and never overrides an explicit `?siteId=` or header. |
| K4 | Stale responses after a switch or logout show the wrong site's rows. | Generation counter captured before `await`; results are dropped when it changes. Lists are cleared on switch (L-2). QA repeats MAN-02 on a throttled network. |
| K5 | View-as mis-scoping or writes as Master. | Server-enforced: GET only, effective-user scope. Header honoured only for a Master session. Actor stays the Master in audit. |
| K6 | Gate still admits unauthorised plates at Alphatech (BUG-5); AC-14 and AC-19..23 not met. | Accepted by Option A/OQ-16 (Gap 2). Phase 2 epic P2-1. PM/QA sign-off required. |
| K7 | Lockfile choice wrong for Cloud Build. | R5 dry-run on 29 Sep; swap the kept lockfile if it fails. |
| K8 | `AUDIT_HMAC_SECRET` fail-fast stops the deploy. | Intended: Cloud Run keeps serving the old revision if the new one fails to start. Devops confirms the secret **before** deploy (R4). **Confirmed set by user, 2026-09-28.** |

**Alternatives considered.**
- *Pass `siteId` explicitly at each of the ~70 fetch call sites (a pure `withSite(url)` refactor).* Rejected for Phase 1: a large diff, easy to miss a call, and 3 days. The helper still exists for explicit use, and the wrapper covers the rest.
- *Keep the silent first-site fallback (Addendum R2).* Rejected: it contradicts approved AC-02 and hides bugs. It is kept only as the env kill-switch.
- *Make the simulator a real server session for the target user (impersonation token).* Rejected: a heavier security surface, and writes would become possible. The read-only header is enough for AC-55.
- *Scope audit logs by site now.* Deferred: the entries have no site history. Master-only reads are the safe Phase 1 answer.

---

## Task breakdown
Branch for all work: `feature/001-parkflows-platform-v1`. One commit (or small PR) per task. Each builder runs `npm run lint` and `npm run build` per task.

### Step 0 — repository clean-up (do first; no behaviour change except T0a)
| # | Tag | Task | Done-when |
|---|---|---|---|
| T0a | [frontend] | **Move the uncommitted work onto the feature branch.** `git switch -c feature/001-parkflows-platform-v1` (this carries the working tree over). Confirm `git diff --ignore-cr-at-eol --stat` shows **only** `src/App.tsx` (+16) (verified 28 Sep). After T0b, commit the `src/App.tsx` hunk alone: `fix(console): refetch after sign-in, clear state on sign-out`. Commit `CLAUDE.md`, `.claude/`, `docs/` and `tests/` in a separate `chore(team): workflow docs and QA suite` commit. `main` is left untouched. | On the branch: `git log main..` shows these commits, and `git diff main -- src/App.tsx --ignore-cr-at-eol` = the 16 lines. `git status` on `main` is not changed by anyone. |
| T0b | [frontend] | **Normalise line endings.** Add `.gitattributes`: `* text=auto eol=lf`, plus `*.png *.jpg *.jpeg *.gif *.ico *.webp *.jar *.keystore *.apk binary`. Run `git config core.autocrlf false` (local). Stage the App.tsx change, then `git add --renormalize .`. Check that `git diff --cached --stat` lists only `.gitattributes` and `src/App.tsx`, and that the other 26 files show **no** diff. Commit `chore: enforce LF line endings`. If `git status` still lists files afterwards, run `git checkout -- .` (safe: all real changes are committed). | `git status` clean; `git diff main --stat` shows no whitespace-only files; `git diff main --ignore-cr-at-eol` == `git diff main`. |
| T0c | [frontend] | **Delete the stray `src/components/App.tsx`** (`git rm`). Nothing imports it: `src/main.tsx` imports `./App.tsx`, and a grep for `components/App` finds nothing. | `npm run lint` exits 0 (was 24–26 errors, all in this file). |
| T0d | [backend] | **Keep one lockfile: `bun.lock`.** `git rm package-lock.json`; add `package-lock.json` to `.gitignore` with a comment "deploy uses bun.lock (d42af6f)". Update CLAUDE.md's "Checks available" line to `bun install --frozen-lockfile`, then `npm run lint`, `npm run build`. | `bun install --frozen-lockfile && npm run lint && npm run build` pass on a clean clone. Devops' R5 dry-run deploy on 29 Sep is green (if it isn't, swap the kept lockfile and redo). |
| T0e | [backend] | **Remove local junk.** Add `node_modules*/` to `.gitignore` (`*.log` is already there). Delete the untracked `node_modules_broken_1790127678/`, `node_modules_partial_bun_1790185674/`, `node_modules_trash_1790128273/`, `npm_install_verbose.log` and `npm_install_verbose2.log` (local only, ~340 MB; needs the user's OK to delete). | `git status --ignored` shows none of them; nothing to commit but `.gitignore`. |

### Phase 1 — build (1 Oct, Alphatech)
| # | Tag | Task | Done-when |
|---|---|---|---|
| B1 | [backend] | Add `resolveSite`, `assertRecordSite`, `auditDenied`, `SITE_SCOPE_MODE`, `ApiErrorCode`, and `SecurityAuditLog.siteId?` (with `logSecurityEvent` accepting `siteId`). Unit-level cases go in `tests/qa`: missing → 400, foreign → 403 + audit row, `ALL` Master-only, code→id normalisation, fallback mode = legacy behaviour. | Tests pass; lint/build pass. |
| B2 | [backend] | Apply `resolveSite` to every list/report/export/analytics/AI route in the API table. Remove each `\|\| DEFAULT_SITE_ID` fallback on reports. `/logs`: role-based masking + `LOGS:view` (H1). `/slots/change-notifications`: scoped + permission + mobile masking (H6). `slot-daily-vehicles`: slot site check (L2). `/invoices` via the resolver. | QA ISO-01..05 pass, including new strict cases (AC-02). |
| B3 | [backend] | Record-level checks on writes: slots/employees save by `id`, all three bulk uploads (whole batch rejected), update-status (+ enum validation, L3), delete, valet status, approve/reject, overnight review. Create routes take their site from `resolveSite` (this replaces `SITE_INJECT_PATHS`). | QA ISO-07, 12, 13 pass (BUG-1, 2, 14); AC-03. |
| B4 | [backend] | Site-scope the plate matches in `processVehicleEntry` (dup check + employee lookup), `processVehicleExit`, `changeVehicleSlot`, and the `scan-plate` fallback (no random or mock plate, R8). `VEHICLE_ACTIVE_AT_OTHER_SITE` audit event. | QA ISO-06, 09, 10 pass (BUG-3, 4, 10); AC-06. |
| B5 | [backend] | `/sites` returns allowed sites only, with contact and pricing fields stripped without `MASTER_CONFIG:view` (H7). `/my-sites` uses the effective user. | Site Admin A's `/sites` contains only A; AC-05 API. |
| B6 | [backend] | `/employees/profile`: drop `query`, own-record rule, role masking (H2). `/employees/update-vehicle`: target from session, no auto-create, audit old/new plate (H3). | Security H2/H3 repro fails (403/404). |
| B7 | [backend] | `approveRegistrationRequest` creates the pass in the request's site (BUG-12); audit approve/reject with `siteId`. `/registrations/submit`: generic duplicate message, fail-closed on empty whitelist (H9). | QA FLOW-19 passes; H9 repro shows no owner data. |
| B8 | [backend] | H8 guards: role edit (system roles, own role, privileged modules → Master only); toggle-module and generate-reset-token respect target site scope and forbid self. | Security H8 repro returns 403 for a USER_MANAGEMENT non-Master. |
| B9 | [backend] | `isMasterAdmin` in `rbac.ts`; `requireMasterAdmin` on simulate-attack, clear-history, migrate-site-data and `/security/*` reads; remove `securityAuditLogs` from `CLEARABLE_COLLECTIONS`. | AC-52 API: non-Master → 403 `ERR_MASTER_ONLY`; QA ISO-05/BUG-7 pass. |
| B10 | [backend] | View-as middleware: `x-view-as` honoured only for a Master session; sets `req.viewAs`/`req.effectiveUser`; non-GET → 403 `ERR_VIEW_AS_READ_ONLY`; `resolveSite`, `requirePermission` and masking use `effectiveUser`; audit actor stays the real user. | QA: Master + `x-view-as: <siteAdminA>` sees only A, and a POST is refused. |
| B11 | [backend] | `requireAuth` error codes; `/auth/logout` destroys header/bearer tokens too (M4 partial); on Cloud Run (`K_SERVICE` set) refuse to start without `AUDIT_HMAC_SECRET` (R4). | Logout → the old `x-session-token` gets 401; a local start without `K_SERVICE` still works. |
| B12 | [backend] | Add `"test:qa": "node --test tests/qa/"` to `package.json`. | `npm run test:qa` runs the suite. |
| F1 | [frontend] | `src/utils/withSite.ts` (site + view-as store, `withSite(url)`, generation counter, `SiteContext`/`useSiteContext`). Extend the fetch wrapper in `sessionTokenFallback.ts` to inject `x-site-id`/`x-view-as` on same-origin `/api/v1/*` (never overriding explicit values) and emit `parkflows:session-ended` on `ERR_SESSION_EXPIRED`/`ERR_ACCOUNT_INACTIVE`. | Network tab: every console `/api/v1` list call carries the active site. |
| F2 | [frontend] | `App.tsx`: `currentSiteId: string \| null`. Resolve permitted sites from `/my-sites`: 0 → S-0 (AC-44); 1 → auto-select; 2+ or Master → remembered site if still permitted, else Choose-a-site (L-3) with **no data calls**. On switch: bump generation, clear lists → skeletons, refetch (L-2, AC-04). Fetchers drop stale results; `fetchUsers` never calls `setCurrentUser` for a different generation (`05` Major). Remove the unauthenticated mount fetch; `refreshAll` runs from an effect on `currentUser?.id` + site; Employee-redirect logins skip admin fetches (`05` Minors). | MAN-02 on a throttled network shows no stale rows; logout during a slow refresh never restores the old user. |
| F3 | [frontend] | Header site chip at every width; compact chip + bottom sheet below 1024 px (L-1); options = permitted sites (+ "All sites" for Master only, AC-05); page eyebrow shows site / "ALL SITES · n sites". Remove the unused `allUsers`/`onSelectUser` props. | UX §3.0 matches at 375, 768 and 1280 px. |
| F4 | [frontend] | `ALL` mode: site-code chip on rows and write actions disabled with the tooltip "Select one site to make changes" in Inventory, Live Floor Plan, Logs, Registration/Approvals, Alerts, Valet and Relocation Logs (L-3). | In `ALL`, no write button is enabled; the server also 400s any attempt. |
| F5 | [frontend] | S-NA page when `activeTab` is not permitted (deep link, stale tab); Sidebar, Home tiles and Header hide non-permitted modules; Audit, InfoSec tools and Role View Simulator are Master-only (L-5, AC-07 UI, AC-52 UI). | Site Admin sees no test tools; a deep link shows S-NA. |
| F6 | [frontend] | Shared `ErrorCard` + **Try again** for list load failures; cross-site 403 banner copy; save errors "Couldn't save. Nothing was changed."; on `parkflows:session-ended` store `{tab, siteId}` in sessionStorage → sign-in with notice → restore after login (AC-45, AC-47, AC-10 message) (L-6). | MAN-11 and MAN-13 pass. |
| F7 | [frontend] | Simulator: "View as" sets view-as (not `setCurrentUser`); purple `ViewAsBanner` with **Exit view** (role=status); persisted in `localStorage['parkflows.viewAs']` and revalidated on reload; the UI renders as the target user's modules/sites; all writes disabled (L-8, AC-55). | Reload keeps the banner; Exit view returns to own profile + site in one click; the server refuses writes. |
| F8 | [frontend] | Sidebar: remove "System healthy · 100% ANPR & sensor uptime"; Inventory description → "Slots, levels & bulk upload" (L-7). | Copy gone. |
| M1 | [mobile] | `/attendant` portal: if the site can't be resolved, show a blocking "Couldn't load your site" + **Try again** (and sign-out), never a silent header-less session. | With `/my-sites` failing, no gate action is possible and the message shows. |
| D1 | [backend] | After launch: refresh the `ARCHITECTURE.md` route table, README (React 19, ParkFlows) and `KNOWN_ISSUES.md` (cite this design, not `2472379`) (R10). | Docs match `server.ts`. |

Order and dependencies: **T0a→T0e**, then B1 → (B2, B3, B4, B5, B6, B7, B8, B9, B10, B11 in any order) and F1 → F2 → (F3–F8). F2 needs B1+B2 on staging. F7 needs B10. M1 needs B1. B12 any time.

### Phase 2 — epics (refined in 03 v1.1 before build; listed so nothing is lost)
| # | Tag | Epic | Covers |
|---|---|---|---|
| P2-1 | [backend][mobile] | Gate decision: pass status/site check, "not authorised", override with reason + Override flag + audit, site-status block, vehicle-type-correct allocation, Indian plate validation, gate result sheet | AC-14, 19–23, 30; M7; BUG-5, 13, 16, 21 |
| P2-2 | [backend][frontend][mobile] | Pass model: `vehicles[]` (max 2), REVOKED, multi-site passes, per-site domain whitelist, mandatory reject reason, OQ-4c | AC-26–30, 48–50; H9 rest; M10; BUG-11, 23, 24 |
| P2-3 | [backend][frontend][mobile] | Site settings (overstay limit) + overstay job + employee in-app notifications | AC-33, 51 |
| P2-4 | [backend][frontend] | Audit chain (`prevHash`, `seq`, verify over Firestore, first broken record), audit for all AC-37 actions with server identity, per-site audit reads, retention/archive + Archived records view | AC-37, 38, 53; M1, M2, M3; BUG-15 |
| P2-5 | [frontend] | Live floor plan ≤ 5 s (polling at 4 s, reusing the existing `SiteAdminLiveSlots` poller) | AC-18, 24 |
| P2-6 | [backend][frontend] | CSV import preview/results (skip duplicates), log export filters/date range, site onboarding validation, amount due on exit, valet status enum | AC-13, 16, 17, 24, 32, 39; BUG-17, 22, 25–27, 30 |
| P2-7 | [mobile][backend] | Employee role + login; Attendant/Employee APKs (`in.parkflows.attendant` appId, update check), site context on mobile | AC-09, 31, 43, 46, 54; 08 gap 7 |
| P2-8 | [backend] | Hardening: permission guards on remaining list routes (M6), real CSP + HSTS (M5), persisted sessions and shared rate limits (L5), `express` upgrade (M9), `/health` minimal (L1), full session revocation (M4) | security Mediums/Lows |
| P2-9 | [frontend][backend] | Console P0/P1 screens from UX §3.2 (site drawer, users drawer, approvals, logs, reports) and the G-1/G-4/G-5 field mapping | US-02..06, 10, 12, 14, 15 UI |

---

## New dependencies
**None.** The QA harness uses Node's built-in `node:test`. Step 0 *removes* `package-lock.json` (no package changes). The `firebase-admin` 14.x and `express` upgrades (M9) are deferred to Phase 2 epic P2-8 and will be listed there with their justification.

**Config/deploy items needing approval with this design (CLAUDE.md rule 5):** the new optional env var `SITE_SCOPE_MODE`; `AUDIT_HMAC_SECRET` becomes mandatory on Cloud Run; `.gitattributes` added; `package-lock.json` removed; `test:qa` script added. **No Firestore rules or index changes.**

Status: APPROVED (by user, 2026-09-28)
