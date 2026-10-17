# Known Issues / Next-Release Debug Notes

## Inventory Master (and related header counts) are not site-scoped — shows every site's data combined

**Found:** 2026-09-15, while investigating why Live Slots showed no data for the
Alphatech site.

**Status: fixed for the FLOOR_PLAN (Live Parking Slots) screen and the
fetches it depends on**, in commit `2472379` ("Give every site the same
Live Parking Slots UI, scoped to its own data") — `fetchSlots`,
`fetchEmployees`, `fetchLogs`, `fetchAlerts`, `fetchPendingReqs`, and
`handleVehicleEntry`/`handleVehicleExit` in `App.tsx` are now site-scoped
via a `withSite()` helper, `refreshAll()` re-runs on site-context change,
and the Site Admin vs Master Admin UI split on the Live Slots tab was
removed (everyone now gets `LiveFloorPlan`; `SiteAdminLiveSlots` is no
longer used). **Not yet deployed** — this session has no push access to
this repo, so `admin.parkflows.in` is still running the old, unscoped
code as of this writing. The rest of this entry (root cause, repro, and
the parts of the fix direction below not yet covered — e.g. other pages
that read `slots`/`employees`/etc. from `App.tsx`'s state, if any exist
beyond what commit `2472379` touched) is kept for reference.

**Severity:** Data isolation gap, not just a display glitch. A logged-in Site
Admin (or a Master Admin simulating a site role via the Role View Simulator)
sees inventory/employee data from **every** site mixed together on the
Inventory Master page, not scoped to their own site.

### Root cause

`App.tsx`'s top-level data fetchers call these endpoints with no `siteId`
query param at all:

```
fetchSlots()       -> fetch('/api/v1/slots')
fetchEmployees()   -> fetch('/api/v1/employees')
fetchLogs()        -> fetch('/api/v1/logs')
fetchAlerts()      -> fetch('/api/v1/alerts/non-parked')
fetchPendingReqs() -> fetch('/api/v1/registrations')
```

(see `src/App.tsx` ~lines 162-220, all wired into `refreshAll()`)

The server endpoints *do* support a `siteId` filter (`getRequestedSiteId` in
`server.ts`), but these particular calls never pass it, so they always
return every site's records combined.

Downstream, `InventoryMaster.tsx`'s `filteredSlots` / `filteredEmployees`
(lines ~82-118) only filter the resulting array by basement/status/search/
department — never by `siteId` — so nothing on the client side re-scopes
the data either. The combined, cross-site list is what actually renders.

By contrast, `SiteAdminLiveSlots` and `SiteAdminReports` are passed
`siteId={currentSiteId}` directly as a prop and fetch their own
site-scoped data correctly (`App.tsx` lines ~409, ~425) — which is why
Live Slots looked fine while Inventory Master silently didn't. That
difference is what made this easy to miss.

### Confirmed repro (today's data)

- Tech Park HQ Main Hub (`site-1`): 1080 slots
- Alphatech (`site-1787676715259`): 1080 slots (separately loaded)
- `GET /api/v1/slots` (no filter): returns **2160** — both sites combined
- `GET /api/v1/slots?siteId=site-1`: correctly returns 1080
- `GET /api/v1/slots?siteId=site-1787676715259`: correctly returns 1080
- Inventory Master, opened as `alphatech.admin` (Site Facility Manager,
  scoped to Alphatech), showed the "1,080 Slots Inventory" badge and
  Tech Park HQ's `B1-EV-*` rows immediately after switching profile via
  the Role View Simulator — and still showed a combined/stale count
  after clicking the header refresh icon and after navigating away and
  back within the SPA. A full page reload reset the simulated profile
  back to the real logged-in user rather than fixing the scoping (the
  Role View Simulator's chosen profile is client-state only, not
  persisted — see below).

### Suggested fix direction

1. `fetchSlots`, `fetchEmployees`, `fetchLogs`, `fetchAlerts`,
   `fetchPendingReqs` in `App.tsx` should append
   `?siteId=${currentSiteId}` (matching what `SiteAdminLiveSlots` /
   `SiteAdminReports` already do), except when `currentSiteId === 'ALL'`
   for a genuine `ALL_SITES` Master Admin view.
2. These fetches currently only run on mount (`useEffect(() => {
   refreshAll(); }, [])`) and after mutations — they need to re-run
   whenever `currentSiteId` changes (add it as a dependency / call
   `refreshAll()` from the same effect that resets `currentSiteId` on
   user switch), so switching site context actually refetches
   site-scoped data instead of leaving the previous site's combined
   list on screen.
3. Separately: the Role View Simulator's selected profile
   (`MasterAdminRoleSimulator` → `onSelectSimulatedUser` →
   `setCurrentUser`) is in-memory React state only, not persisted
   (no localStorage/sessionStorage, no URL param). A full page
   reload silently drops back to the real logged-in user instead of
   keeping the simulated context or clearly indicating it was lost.
   Worth deciding whether that's intended (simulation should always be
   a from-scratch action) or whether it should persist across reload
   for a smoother testing flow.

### Related, already-fixed today

Not the same bug, but discovered in the same investigation: a large
amount of legacy seed inventory (1080 slots, 151 employees, 1920 logs,
3 valet tickets) was tagged with the internal placeholder
`siteId: 'site-default'`, which matched no real site, so it was
invisible to every site-scoped query. Fixed via the existing
"Migrate site data" tool (Security → Data & Retention →
`/api/v1/admin/migrate-site-data`), moving it to `site-1` (Tech Park HQ
Main Hub). Alphatech had no inventory of its own at all and was given a
fresh 1080-slot set via the standard CSV bulk-upload flow. Neither of
those was related to the cross-site data mixing described above — that
bug affects *any* two (or more) sites that each have real inventory,
which is exactly how it surfaced once Alphatech got its own slots.

## S7-1 (High, open): `POST /alerts/trigger-cron` ("Run cutoff scan") is not site-scoped

**Opened in backlog:** 2026-10-15 by devops (002 R1b security review asked for it). **Finding:** 001 `07-security-review.md` **S7-1**, High, risk accepted by the user 1 Oct 2026. It was meant to be fixed in the first patch after launch (001 `08`, first patch item 1) and hasn't been yet. It is still present on `main` (`server.ts:1817`) and `feature/002-r1b` (`server.ts:2138`).

**Owner: to be assigned by the architect.** Flow: backend-dev → code-reviewer → QA → devops → user.

**Problem:** the route only checks `requirePermission('ALERTS','canEdit')` and never calls `resolveSite`. `runNonParkedRosterScan()` (`src/server/db.ts`) scans every site's active employees, **replaces the whole `alerts` collection**, and returns every site's alerts (names, plates, mobiles) to the caller. That is cross-tenant PII disclosure plus a platform-wide write.

**Fix (from 001 07):**
- scope the route with `resolveSite` (no ALL for non-Masters);
- scan, replace and return per site only;
- mask mobiles as other routes do;
- audit actor = `req.user` (not the `x-user-email` header).

Tests:
- Site Admin A → 0 foreign rows, and Site B's alerts are unchanged;
- Master with a site → that site only.

Then a short code review and the QA browser check of "Run cutoff scan".

**Until fixed:** the control is no non-Master user with ALERTS Edit (custom role `role-1790920354180` for Alphatech), and Masters don't press the button. It is verified by V1b/V2 (002 `08` "001 S7-1 control through the R1b deploy"). Related risks:
- the R1b Sites panel lists only `role-site-manager` users as site admins (R1b-C1);
- new users default to `role-site-manager` (R1b-C2).

**After the fix ships:** restore ALERTS Edit on the site admin role (001 08 item a in reverse), retire V1b/V2's S7-1 part, and tell Masters the scan is usable again.

## Seeded user records: edits return 200 but are never written to Firestore (Major, open)

**Found:** 2026-10-17 by devops during the R1B-S1 hotfix deploy. Evidence is in 002 `08-release.md`, "Post-switch S7-1 checks".

**Owner: to be assigned by the architect** (backend-dev fix → code-reviewer → QA).

**Symptom:** suspending `usr-102` through `POST /api/v1/rbac/users` returned 200, and the in-memory record showed SUSPENDED. But the Firestore document kept its 22 Sep version, so after a revision restart the user was ACTIVE again.

Cloud Run log:
`[firestore] Targeted sync failed: Error: Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "customModuleOverrides")`

**Cause:**
- Seeded users (`getDefaultRolesAndUsers()`) were stored without `customModuleOverrides`.
- `saveAppUser` builds the record with `customModuleOverrides: pick('customModuleOverrides')`, which is `undefined` for them.
- The Firestore client isn't set up with `ignoreUndefinedProperties`, so the whole targeted write is rejected. The failure is only logged, and the API reports success.

**Affected (Firestore read 17 Oct, 11 docs):**
- `usr-digi-master` (Platform Master Admin)
- `usr-101` (seed Platform Master Admin)
- `usr-103`, `usr-104`, `usr-105`
- `usr-102` was fixed by the workaround below.

Any status, role, site or password change to these accounts is lost on the next restart. **That includes a Master password change.**

**Fix direction:**
- never write `undefined` (default `customModuleOverrides` to `{}` in `saveAppUser` and on load), or set `ignoreUndefinedProperties: true` on the Firestore client;
- surface a failed targeted sync to the caller (not 200);
- a one-off repair that adds `customModuleOverrides: {}` to every user document;
- test: edit a seeded user, reload the store from Firestore, and the change is kept.

**Workaround until fixed:** a Master saves the user once with `customModuleOverrides: {}` in the body (as done for `usr-102`, 15:35 UTC). After any change to these accounts, check the Firestore `updateTime`.

**Related:** seeded demo accounts `usr-101` (a second Platform Master Admin), `usr-103..105` are ACTIVE in production. Their seed passwords are rotated to random values at boot, but they should be reviewed and suspended or removed (PM/security decision).


## Whitelisted-domain removal is not durable (Minor, open)
**Found:** 2026-10-17 (devops).
`removeWhitelistedDomain()` (`src/server/db.ts`) removes the entry from memory and calls a full `saveDB()`. A full sync never deletes Firestore documents, so the removed domain's document stays and is loaded again on the next cold start. That is the real cause of `company.com` (`dom-1`) reappearing after restarts.
**Fix:** do a targeted Firestore delete, like B6's `deleteFirestoreDocs`, then test remove → reload → absent.
**Owner:** to be assigned by the architect.
