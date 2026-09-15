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
