# Technical Design — 002 UI Redesign & ParkFlows Design System
Feature ID: 002 · Author: architect · Date: 2026-10-03 · Revision: **v1.3** (2026-10-13, see Changelog) · v1.0–v1.2 **APPROVED by user** (3 Oct, 8 Oct)
Inputs: `01-prd.md` v1.1 **APPROVED** (v1.2 of 7 Oct adds US-18 / AC-32, AC-32a–d) · `02-ux-design.md` **READY FOR TECH DESIGN** (steps 1–4 approved; AC-31 closed 3 Oct) · `design-system/tokens.json` + `design-system/components.css` (reference copies)
Code read: branch `feature/001-parkflows-platform-v1` @ `98c7fcc` (001 is **not yet merged**: `main` is still `d42af6f`, 58 commits behind). Files: `src/App.tsx`, `src/index.css`, `src/components/{LoginScreen,Header,Sidebar,SiteAdminOverview,LiveFloorPlan,EmployeeRegistration,MasterAdminSites,InventoryMaster,RoleHomePage,AnalyticsPredictive}.tsx`, `src/utils/{withSite,rbac}.ts`, `server.ts`, `src/server/{db,security}.ts`, `src/types.ts`, `package.json`, `vite.config.ts`, `ARCHITECTURE.md`, `KNOWN_ISSUES.md`.

This design plans **R1 (10 Oct)** in full. It gives **R1.1** (remaining console screens) and **R2** (Android apps) as direction plus task lists, refined before each one is built. 002 changes presentation only: the 001 flows, permissions and site isolation stay as they are (PRD out of scope).

---

## Changes in v1.1 (2026-10-03, after your answers to Q-1..Q-4)
- **Q-1/Q-2 ("Yes"):** I read this as: parkflows.in is live today, its source is the `website` folder in your home directory, and the new site moves to a **second Firebase Hosting site** in the same project. D1 now starts by reading that folder (folder access needed) to carry over anything live: domain/DNS settings, legal pages, analytics.
- **Q-3:** the contact details are **sales@parkflows.in** and **+91 98206 03518**. **"Book a demo" opens a form that records the prospect's details.** That is new product behaviour (a public form that stores personal data), so it gets a full design below: data model, a public API route, abuse controls, a Master-only console list, privacy and retention. New tasks: B6, F10, T6 change. **The PM should add a story/AC for it** (proposed US-18 / AC-32), because 002's PRD says "no new features".
- **Q-4 ("yes"):** add the Master-only **`POST /sites/update`** for name, city, address and contacts. New task B5; F7 shows **Edit site**.

**v1.1 approved by user on 2026-10-03.**

## Gaps found in PRD / UX
1. **The schedule doesn't fit as stated.** Code may start only after 001 is merged to `main` (PRD gap 2). Today (3 Oct) 001 is still in release: the hotfix is on the branch, and 58 commits are not merged. If the merge slips past **5 Oct**, R1 has under 4 working days for 8 shared components, the shell, 5 screens and the marketing site, plus review, QA and security. **Recommendation:** treat 5 Oct as the go/no-go for the 10 Oct date. Until then, only work that doesn't touch 001's files may start early, on its own branch (tokens, fonts, the component library in a new folder, the marketing site). See Release slicing.
2. **AC-14 is out of date.** The UX changed Live parking to paged cards (12/20/36/60 per page) by user direction. The PRD still says "all slots on one screen as tiles". **The PM needs to update AC-14.** This design builds the user-directed version.
3. **There are no URLs per screen.** AC-08 ("they type its URL") assumes deep links. Today the console switches screens with React state (`activeTab`) and has no routing. R1 adds **hash routes** (`#/overview`, `#/live-parking`, …) with no new dependency (task F2), so AC-08, nav links and the marketing site's "Sign in" all have stable targets.
4. **Data the mockups show that doesn't exist yet** (UX says it makes no data choices; this design decides each one, see Data changes):
   - **Slot length:** not in the model.
   - **Pallet level** ("Level n", top level first): there is no level field. Today pallets are grouped by `puzzleNumber` only.
   - **"In since":** occupied slots carry no time; it lives on the open `ParkingLog`.
   - **Overview KPIs:** entries/exits today, entries by hour, latest at the gate, and "parked over 12 hours" have no endpoint. `SiteAdminOverview` stubs them with TODOs.
   - **Sites table:** per-site occupancy, pending count and last activity have no endpoint.
5. **The mockups include features the product doesn't have:**
   - **Revoked** tab on Employees & vehicles: there is no REVOKED status (001 P2-2). It is **hidden in R1**.
   - **Up to 2 vehicles** per employee: the model has one `vehicleNumber` (001 P2-2). R1 shows one.
   - **"Forgot password?"** on Login: there is no self-service reset; only an admin can issue a reset link. R1 links it to the line "Ask your site admin to reset your password."
   - **"Edit site"** on Sites: there is no endpoint to edit a site's name, city, address or contacts (only onboard, status, pricing and delete). Open question Q-4.
   - **Overstay** ("parked over 12 hours"): the per-site overstay limit is 001 P2-3. R1 counts open entries older than **12 hours** (the 001 default) and labels them exactly that.
6. **The Login lockout copy is wrong.** The mockup says "after 5 attempts the account locks for 15 minutes". The server locks after 15 failures per IP+account (2-minute base lockout) or 20 per account in 15 minutes (`src/server/security.ts`). The UI must show the **server's** message, not fixed text.
7. **Hourly charts would use the wrong timezone.** `getPeakHours` uses `getHours()`, which is server time (UTC on Cloud Run). AC-13 says IST. Every new aggregation buckets by **Asia/Kolkata** (B2), and the old helper is fixed with it.
8. **`components.css` refers to a `tokens.css` that isn't in the folder.** It also `@import`s Google Fonts. The token pipeline (below) generates `tokens.css`, and the font import is dropped in the app.
9. **`tokens.json` has no SlotCard, segmented, level-button, bulk-bar, drawer, occupancy-bar or bar-chart entries.** UX says these "fold into the system after approval". `components.css` does contain `pf-slot*` (slot card B). The rest are defined in code as part of F4 and copied back into the reference page afterwards (UX to confirm).
10. **The marketing site has no known source or host.** The repo has no marketing code and no Firebase Hosting config (001 `08` gap 6). There is a `website` folder in the user's home directory; this design couldn't read it, and it may be the current parkflows.in. Open questions Q-1 to Q-3.
11. **Usability metrics weren't recorded** (review log, 3 Oct): there are no task times or trust ratings. Re-measuring T3/T6 and trust after R1 is a QA/UX item, not a build task.
12. **The Android apps exist in two places.** `src/mobile` in this repo is built with Capacitor. Alphatech's gate staff use an Android app whose last working source is a **separate folder** (`Downloads\attendant`, its own git repo, appId `in.parkflows.attendant`). R2 must first decide which source ships (001 `08` gap 7), or the tokens have to be copied into two codebases.

---

## Overview
**One token source, three outputs, one class layer.**
- `src/design-system/tokens.json` becomes the **only** source of design values. It is moved from `docs/…/design-system/`, and the docs copy becomes a pointer.
- A small Node script (no dependencies) generates:
  1. `tokens.css`: CSS custom properties, which the marketing site and the R2 apps use.
  2. `theme.css`: a Tailwind 4 `@theme` block that turns the same values into utilities and **removes Tailwind's default palette and sizes**, so off-system values don't compile.
- The approved `components.css` is ported as the **`pf-*` component class layer**. Thin React components in `src/design-system/components/` render those classes. Screens use the components, plus Tailwind utilities for layout only (flex, grid, gap, padding from the token scale).
- The approach rests on plain CSS classes, so the marketing site (static HTML) and the R2 mobile screens (Capacitor web views) use **exactly the same CSS and tokens**, with no second implementation.

**What R1 delivers.**
- Tokens, fonts and components.
- The new **AppShell**: top bar, grouped nav, page header, site switcher, viewing-as bar and hash routes.
- Five screens rebuilt on it: Login, Overview, Live parking, Employees & vehicles, Sites.
- Fabricated values removed product-wide wherever they sit in the shell or a removed screen (the launchpad, Sidebar, Header).
- Two read-only aggregation endpoints and two optional slot fields.
- The parkflows.in home page.

The other console screens render **inside the new shell with their current internals** until R1.1. This mix is accepted for 10 days.

---

## Data model changes (src/types.ts, Firestore collections, indexes, rules)
| Area | Change | Back-compat |
|---|---|---|
| `ParkingSlot.lengthM?: number` | Slot length in metres (e.g. `5.0`), shown as "5.0 m". Optional; missing → "—" on cards, rows and the modal. **Height stays a string** (`'2.5m'`, `'Standard (2.0m)'`). R1 also adds a read-only parsed `heightM` in the API response (`parseFloat` of the first number) so cards show "2.5 m" consistently. The stored value is unchanged. | Optional field; old docs work; no back-fill. |
| `ParkingSlot.palletLevel?: number` | Level within a puzzle stacker (1 = ground). Used for "Level n" and the top-first order. When missing, it is **derived** by one rule in `src/utils/slots.ts`: the trailing `-S<n>` in the slot number (`B1-P03-S2` → 2). If that fails too, the band shows the slot number and the order falls back to the slot number. | Optional; no back-fill. Site admins can fill it by CSV. |
| API-only (not stored) `inSince?: string` on `GET /slots` items | For `OCCUPIED` slots: `entryTime` of the `ACTIVE` `ParkingLog` with this `slotId` at the same site. Absent if none is found (legacy data) → the card shows "In since —". | Additive response field. |
| API-only `heightM?: number` | See above. | Additive. |
| Inventory CSV | Two **optional trailing columns**, `Length` and `PalletLevel`, after `Status`. Old 8-column files import unchanged. The template download includes them. `Length` accepts `5`, `5.0`, `5.0m` or `5.0 m`, stored as a number. A bad value is a row error (`"Length must be a number of metres"`), not a silent default. | Old files still valid. |
| `saveOrUpdateSlot` / `bulkUploadSlots` | Accept `lengthM` and `palletLevel` with validation (`0 < lengthM ≤ 20`, `1 ≤ palletLevel ≤ 10`, integers for level). **Also close the mass-assignment gap found while reading:** the update path spreads `...slotData` into the stored record, so a client with `INVENTORY:canEdit` can set fields the form never sends (e.g. `currentVehicle` without an entry log, or `cameraNumber`). The route's 001 site checks still apply. Replace the spread with the explicit field list. | Behaviour unchanged for valid input. |
| **(v1.1) `DemoRequest`** (new type) + new store collection **`demoRequests`** | `{ id, createdAt, name, company, workEmail, phone, city, facilityType ('Office park' \| 'Tech campus' \| 'Mall' \| 'Hospital' \| 'Residential' \| 'Other'), slotsApprox?: number, sitesApprox?: number, preferredContact ('Email' \| 'Phone'), message?: string (≤1000 chars), consentAt: string, source: 'parkflows.in', status ('NEW' \| 'CONTACTED' \| 'CLOSED'), handledBy?, handledAt?, note? }`. **No IP address and no user-agent are stored**; the IP is used in memory for rate limiting only. **Platform-level, not site-scoped:** a prospect isn't a site yet. This is a deliberate, documented exception to the `siteId` golden rule, made safe by making every read **Master Admin only**. **Retention:** deleted automatically 12 months after creation, by the same daily job style as other housekeeping. **(v1.2)** A Master Admin can also delete a single request at any time when the person asks (`DELETE /demo-requests/:id`, AC-32d). Both kinds of deletion remove the record from memory **and** its Firestore document, so it cannot come back on a cold start. The privacy note on the form says so. | New collection, created on first write; mirrored to Firestore by the existing `saveDB` path. |
| Firestore collections, indexes, `firestore.rules` | **No new indexes or rule changes.** `firestore.rules` stays deny-all (only the server writes). The only new collection is `demoRequests` (above). | — |
| `src/types.ts` new view types | `OverviewToday`, `SiteSummaryRow` (response shapes below). | Additive. |
| Env vars, deployment config | **None for the console.** The marketing site needs a hosting target (Q-1/Q-2). | — |

**Fabricated data (AC-04, AC-06): nothing server-side is removed in R1.**
- The predictive forecast endpoint stays, and its response gets `sample: true`. The UI labels every number "Sample data — not live".
- There is no PLC feed anywhere in the code: the PLC text is hard-coded in `LiveFloorPlan.tsx`. So the UI shows "Stacker controller (PLC) — not connected", with no API work.
- The compliance-summary claims (001 L7) belong to the Audit screen in R1.1.

---

## API contracts
Site scoping uses 001's `resolveSite()` everywhere. Error codes as in 001: `ERR_SITE_REQUIRED`, `ERR_SITE_FORBIDDEN`, `ERR_SITE_ALL_NOT_ALLOWED`, `ERR_MASTER_ONLY`, `ERR_VIEW_AS_READ_ONLY`.

| Method | Path | Role(s) | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/slots` (changed, additive) | as 001 | site required | Each slot adds `heightM?`, `lengthM?`, `palletLevel?`, and for OCCUPIED `inSince?` (ISO). `summary` unchanged. | as 001 |
| POST | `/api/v1/slots/save`, `/api/v1/slots/bulk-upload` (changed) | `INVENTORY:canEdit` / `canCreate` | accept `lengthM`, `palletLevel` | unchanged | 400 with a field message on invalid length/level; bulk returns per-row errors |
| GET | `/api/v1/overview` (**new**, read-only) | `FLOOR_PLAN:view` | site required; **no `ALL`** | `OverviewToday` = `{ siteId, asOf, timezone:'Asia/Kolkata', occupied, total, free, byLevel:[{level, occupied, total}], entriesToday, exitsToday, entriesByHour:number[24], pendingRequests, oldestPendingDays\|null, parkedOver12h, nonParkedAlerts, latest:[{vehicleNumber, slotNumber, entryTime, exitTime\|null, status}] }`. "Today" = IST calendar day. `latest` holds the 4 newest logs, plate masked by role exactly as `/logs` does. Counts are `0` only when the data says zero. A brand-new site with no logs returns `entriesToday: 0` **and** `hasHistory: false`, so the UI shows "—" + reason (AC-05). | shared site errors |
| GET | `/api/v1/sites/summary` (**new**, read-only) | **Master Admin only** (`requireMasterAdmin`) | — | `SiteSummaryRow[]` = `{ id, siteName, city, siteCode, status, holdReason?, onboardedAt, occupied, total, pendingRequests, lastActivityAt\|null }` for every site. Unscoped by design: Master only, same rule as 001 `/sites`. | 403 `ERR_MASTER_ONLY` |
| GET | `/api/v1/analytics/prediction` (changed, additive) | as 001 | as 001 | adds `sample: true` | as 001 |
| POST | `/api/v1/registrations/approve`, `/reject` | as 001 | unchanged | unchanged. Bulk approve/reject in the UI = one call per selected row, with per-row results (no bulk endpoint; small numbers) | as 001 |
| — | Every other endpoint | — | — | **unchanged** | — |

| POST | `/api/v1/sites/update` (**new, v1.1, Q-4**) | **Master Admin only** (`requireMasterAdmin` + `MASTER_CONFIG:canEdit`); refused under view-as (GET-only) | `{ siteId, siteName?, city?, address?, contactPerson?, contactEmail?, contactPhone? }`. **Only these fields**; anything else is ignored. `siteCode`, status, pricing and capacity keep their own routes. | `{ success, site }` | 400 per field (required non-empty name ≤80; email format; Indian phone `+91` 10 digits; each field ≤200 chars; trims); 404 unknown site; 403 `ERR_MASTER_ONLY`. Audit `SITE_UPDATED` with `siteId` and the changed field **names** (not values). |
| POST | `/api/v1/demo-requests` (**new, v1.1, public**) | **public for POST only** (v1.3: public *by method*, as built; adding the path to `PUBLIC_API_PATHS` would have made the Master GET public too) | JSON as `DemoRequest` minus server fields, plus `consent: true` and a honeypot field **`pf_hp_field`** that must be empty (v1.2: renamed from `website` to match the client and PRD AC-32a) | `{ success: true }` (nothing echoed back) | 400 with **per-field** messages, per PRD AC-32 (name 2–80; company 2–120; city 2–80; work email valid; phone `+91` + 10 digits or a 10-digit Indian number; facility type from the list; numbers 1–100,000; message ≤1000; consent required). A filled honeypot gets a **silent `success: true` with nothing stored**. 429 above **5 requests per 10 min per visitor IP** and **30 stored requests per hour platform-wide** (in-memory). **v1.3:** the visitor IP is chosen by the rule in "Demo-request client IP behind Firebase Hosting" below, **not** by `req.ip`; on Cloud Run a request that didn't come through the parkflows.in Hosting rewrite gets **403 `ERR_VIA_HOSTING_ONLY`**. Body limit 8 KB on this route. Strings are stored as plain text and never rendered as HTML. Only same-origin requests are accepted (see the marketing site section). |
| GET | `/api/v1/demo-requests` (**new, v1.1**) | **Master Admin only** | `?status=` optional | `{ requests: DemoRequest[] }`, newest first | 403 `ERR_MASTER_ONLY` |
| POST | `/api/v1/demo-requests/status` (**new, v1.1**) | **Master Admin only**, not under view-as | `{ id, status, note? }` | `{ success, request }` | 400 / 404 / 403. Audit `DEMO_REQUEST_UPDATED` (id + status, no personal data in the audit text). |
| GET | `/api/v1/demo-requests/export` (**new, v1.1**) | **Master Admin only** | — | CSV (formula-injection escaped, as 001's export) | 403 |
| DELETE | `/api/v1/demo-requests/:id` (**new, v1.2**, AC-32d) | **Master Admin only** (`requireMasterAdmin`, the real user); refused under view-as (non-GET) | path `id` only, no body | `{ success: true }`. **Hard delete:** the record is removed from the in-memory store **and** its `demoRequests` Firestore document is deleted (targeted delete, not left to a later full sync). Nothing about the request is returned. | 404 unknown id (no hint whether it ever existed); 403 `ERR_MASTER_ONLY`; 403 `ERR_VIEW_AS_READ_ONLY`. **Audit:** `DEMO_REQUEST_DELETED`, `status: SUCCESS`, `targetResource: demo-request/<id>`, details `"Demo request <id> deleted on request by <Master Admin email>."`. **No name, company, email, phone, city or message** in any audit field. The id is a random, non-identifying value. The 12-month automatic job writes one audit entry per run, `DEMO_REQUESTS_EXPIRED`, with the **count** only. |

No endpoint is removed in R1.

---

## Site scoping & authorisation
- **Server:** both new endpoints go through the 001 chain (`requireAuth` → `enforceSiteScope` → view-as). `/overview` calls `resolveSite({allowAll:false})` and filters every collection with 001's `filterBySite` helper. `/sites/summary` is `requireMasterAdmin` (the real user, never a viewed one). Under view-as a Master gets 403 there, which matches "render as the viewed user". The `inSince` join only reads logs whose `siteId` equals the slot's site. No new write paths, apart from the two validated slot fields on existing, already site-checked routes.
- **Client:** every new component reads 001's `useSiteContext()` and `useWriteGuard()`. `Button` takes a `guard` prop that applies the 001 write guard (disabled + tooltip) in All sites mode and in view-as (AC-24, AC-25). `SiteSwitcher` and `ViewingAsBar` are restyled versions of the existing `SiteSwitcher.tsx` / `ViewAsBanner.tsx`. Their logic and their `withSite` store calls are **moved, not rewritten**. The current site appears only in the switcher (AC-23): the page header line shows the date, not the site name.
- **Landing (AC-10):** after sign-in, route to the first permitted entry of `[sites (Master), overview (Site Admin / FLOOR_PLAN view + single site), live-parking, logs, reports]`. `RoleHomePage` (the launchpad) is deleted.
- **No access (AC-08):** an unknown or not-permitted hash route renders the existing `NoAccess` page inside the shell. The API still returns 403 (unchanged).

---

## Components / files to change

### Token pipeline (AC-01, AC-02)
| File | What |
|---|---|
| `src/design-system/tokens.json` | Moved from docs; the single source. |
| `scripts/build-tokens.mjs` (new, Node built-ins only) | Reads `tokens.json` and writes two generated, committed files: **`tokens.css`** (`:root { --navy-600: #1f3a93; … --font-text: …; --space-4: 16px; … }`, plus `@media (prefers-reduced-motion: reduce)` that sets the duration tokens to `0ms`) and **`theme.css`** (Tailwind 4 `@theme`). Run with `npm run tokens`. `npm run build` runs it first. **CI check:** `npm run tokens -- --check` fails if the generated files are stale. |
| `src/design-system/theme.css` (generated) | `@theme {` the ParkFlows values: `--color-navy-600`, `--color-success-50`, …; `--font-display/text/mono`; `--text-title-1: 24px; --text-title-1--line-height: 32px` …; `--spacing: 4px` (so `p-4` = 16px matches `space-4`); `--radius-md: 8px` …; `--shadow-1` …; `--breakpoint-sm: 360px; --breakpoint-md: 768px; --breakpoint-lg: 1024px; --breakpoint-xl: 1280px; }`. In **R1.1**, once no screen uses Tailwind's defaults, the script also emits `--color-*: initial; --font-*: initial; --text-*: initial; --radius-*: initial; --shadow-*: initial;`, so old-look classes (`text-rose-600`, `text-[10px]`) stop compiling at all. In R1, `lint:styles` enforces the same rule on R1 files only (K3). |
| `src/index.css` | `@import "tailwindcss"; @import "./design-system/theme.css"; @import "./design-system/tokens.css"; @import "./design-system/fonts.css"; @import "./design-system/components.css";` The old dark-scrollbar CSS goes. 001's `[data-write-guard]` rule moves into `components.css` on tokens. |
| `src/design-system/components.css` | Port of the approved `components.css`: no Google `@import`; wrapped in `@layer components`; `.is-hover/.is-focus` preview classes dropped (real `:hover`, `:focus-visible`, `[aria-*]` only). New classes for the UX additions (gap 9): `pf-seg`, `pf-level`, `pf-bulkbar`, `pf-drawer`, `pf-occ`, `pf-bars`, written only with token variables. |
| `scripts/check-styles.mjs` (new, no deps) + `npm run lint:styles` | Fails the build on the **R1 file list** (grows in R1.1) if it finds: `style={{` (except the one allowed form, `style={{ '--pf-…': value }}`, which passes a data value such as a bar's percentage), a hex/rgb colour literal, an arbitrary Tailwind value (`-[`), a non-token Tailwind colour, or `font-mono` outside `PlateText`/`SlotCode`/`IdText`. **Gate:** the step-4 checks become `lint`, `lint:styles`, `build`, `test:qa`. |

**Retiring inline styles:** the R1 screens are **rewritten, not converted**. Each is a new file built from components, and the old file is deleted in the same task (e.g. `SiteAdminOverview.tsx`: 79 inline blocks → 0; `MasterAdminSites.tsx`: 46 → 0; `LoginScreen.tsx`: 38 → 0). The ~640 inline blocks in R1.1 screens are removed in R1.1 by the same rule. The repo-wide count is reported in each `04` so AC-02's "gone from all in-scope screens" can be checked.

**Android (R2) uses the same tokens.** Both apps are Capacitor web views over React (`src/mobile`). R2 imports the same `tokens.css` + `components.css` (+ fonts) into `src/mobile`'s entry and replaces its `C` palette object. There is no native token export, because nothing is native. Only the launcher icon and splash need platform images, generated from the logo SVG. If R2 ships from the separate `attendant` repo (gap 12), the generated CSS files are copied in by a script, never edited there.

**Fonts (self-hosted, no npm dependency).** Sora (600, 700), IBM Plex Sans (400, 500, 600) and JetBrains Mono (500, 600) are downloaded once as **latin-subset WOFF2** files from the official OFL releases. They go in `src/design-system/fonts/` with their `OFL.txt` licences, and `fonts.css` declares them with `@font-face { font-display: swap; }`.
- Total ≈ 200–250 KB, cached after the first load. Vite fingerprints the files.
- **Why not Google-hosted:** it would be a third-party request on every console load (a privacy question for customer sites) and would block a strict CSP later (001 M5). It would also put sign-in at the mercy of an outside host.
- **Why not `@fontsource/*`:** that adds npm packages, and committed files do the same job.

**Icons.** `lucide-react` **is already a dependency** (`^0.546.0`, used in 22 files). No new package. Rule: outline icons, 2px stroke, 16/20/24px, through one `Icon` wrapper (`aria-hidden` unless labelled).

### Components (AC-03), in `src/design-system/components/`
Each component is a small typed React component that renders `pf-*` classes, forwards `ref`, `className` and `aria-*`, and has all states driven by native attributes (`disabled`, `aria-invalid`, `aria-busy`, `aria-selected`, `aria-current`). The modal and the side panel use the native **`<dialog>`** element (`showModal()`): focus trap, Esc and the backdrop come for free, with no dependency.

| Order | Component(s) | Notes |
|---|---|---|
| 1 | `Icon`, `Button` (primary/secondary/destructive/ghost; sm/md/lg; `loading`, `guard`), `IconButton` | `guard` applies the 001 write guard |
| 2 | `TextField` (incl. `mono` plate variant), `Select`, `Checkbox`, `Radio`, `Field` (label + help + error, `aria-describedby`) | visible label is required by type |
| 3 | `StatusChip` (Vacant/Occupied/Reserved/Maintenance/Pending/Approved/Rejected/On hold, mapped from enums), `CountBadge`, `SiteTag`, `PlateText`, `SlotCode` | the enum → words map lives in `src/utils/format.ts` |
| 4 | `Banner`, `ViewingAsBar`, `Toast` + `useToast()` (one region, `role=status`/`alert`), `EmptyState`, `ErrorState` (Retry), `Skeleton` | `ErrorState` never says "Offline" unless `navigator.onLine === false` (AC-27) |
| 5 | `Card`, `KpiCard` (value / "—" + reason / loading), `Tabs`, `SegmentedControl`, `LevelButtons`, `Pagination` (page sizes as a prop: 25/50 for tables, 12/20/36/60 for slots) | |
| 6 | `Table` (≤7 columns enforced by a dev-time warning; sort, row click, select-all, row menu, loading rows; becomes cards below 768px), `BulkBar`, `Modal`, `SidePanel` | `SidePanel` closes on Esc and outside click |
| 7 | `SlotCard` (B · status band; `compact` pallet variant), `SlotRow` (list D), `OccupancyBar`, `BarChart` (plain SVG bars on tokens, a value label on each bar, peak darker, no library) | |
| 8 | `AppShell` = `TopBar` + `NavGroupList` + `NavDrawer` (<1024px) + `PageHeader` (H1, description, "Updated Xs ago", one primary action + "⋯" menu) + `SiteSwitcher` | replaces `Header.tsx` and `Sidebar.tsx` |
| — | `src/utils/format.ts` | `formatDate` (DD MMM YYYY), `formatTime` (HH:mm), both `Intl` with `timeZone:'Asia/Kolkata'`; `formatINR` (`en-IN`, ₹1,77,000); `formatDuration` ("7d 22h", "45m"); `formatAgo`; `enumLabel` (AC-13) |
| — | `src/utils/useAutoRefresh.ts` | One refresh mechanism (AC-11): poll every **15 s** while the tab is visible, pause when hidden, and expose `updatedAt` for "Updated Xs ago". It replaces the per-screen refresh buttons. Stale responses are dropped with 001's generation check. |
| — | `src/routes.ts` | Hash routes ↔ module ids; `navigate()`; a `hashchange` listener in `App.tsx` |

A small `/design-system` hash route (Master only, dev and staging) shows every component in every state, so code review and QA can check AC-03 against the reference page.

### Screens (R1)
| Screen | New file(s) | Replaces | Data |
|---|---|---|---|
| Login | `screens/Login.tsx` | `LoginScreen.tsx` (removes the demo presets/`allUsers` prop, the version pill and the second logo) | `/auth/login`; error text from the server's message (gap 6); "Working at the gate?" → `/attendant/` |
| Overview | `screens/Overview.tsx` | `SiteAdminOverview.tsx` | `/overview` (one call; each card has its own error state) |
| Live parking | `screens/LiveParking/{index,SlotsView,PuzzleView,SlotModal}.tsx` | `LiveFloorPlan.tsx` (also removes `SiteAdminLiveSlots.tsx`, which is unused) | `/slots` (+ new fields), `/vehicles/entry` (with `targetSlotNumber`), `/vehicles/exit`, `/slots/update-status` |
| Employees & vehicles | `screens/Employees/{index,RequestsTab,RegisteredTab,RejectedTab,AddEmployeePanel}.tsx` | the `REGISTRATION` + `APPROVALS` modes of `EmployeeRegistration.tsx` (2,377 lines; CSV import, domains panel and add-employee are kept and moved) | `/registrations`, `/employees`, `/employees/save`, `/employees/bulk-upload`, `/registrations/approve\|reject`, `/domains/manage` |
| Sites (Master) | `screens/Sites/{index,SitePanel}.tsx` | `MasterAdminSites.tsx` (the domain panel moves into the side panel) | `/sites/summary`, `/sites`, `/sites/status`, `/sites/onboard`, `/rbac/users`, `/domains/manage?siteId=` |
| Shell | `AppShell` | `Header.tsx`, `Sidebar.tsx`, `RoleHomePage.tsx` (deleted) | — |

---

## Navigation & page template (AC-07..AC-11)
**Grouped nav.** Module ids are unchanged, so 001 permissions keep working. Labels equal the page titles.

| Group | Site Admin (and other site roles, by permission) | Master Admin |
|---|---|---|
| Operations | Overview · Live parking · Entry/exit log · Alerts · Reports · Valet | — |
| People | Employees & vehicles | Users & roles |
| Setup | Inventory · Site settings¹ | Sites · Billing · Audit log · Settings² |

¹ "Site settings" appears only once 001 P2-3 exists; hidden in R1. ² "Settings" = today's Master Site Config / Data tools (R1.1 restyle).

- **Badges:** counts only. Employees & vehicles = pending requests; Alerts = open alerts. No "Live"/"New" text badges.
- **Removed from nav (AC-11):** "ParkFlows Field" and "Employee Smart Pass" (the `MOBILE_APP` / `EMPLOYEE_MOBILE_APP` previews; the files stay in the repo for R2 reference but are unrouted), "Predictive Analytics" (stays reachable from Reports with the sample label until R1.1 decides its place), and "InfoSec & Privacy Defense" (renamed **Audit log**).
- **Entry and exit only on Live parking (AC-11):** remove the `onVehicleEntry` / `onVehicleExit` props and buttons from `ParkingLogs` (it becomes read-only + export) and `InventoryMaster` (no Mark exit). These are small removals done in **R1** even though the screens' restyle is R1.1, because AC-11 is product-wide.
- **Employees & vehicles** is one route, visible when the user has `REGISTRATION:view` **or** `APPROVALS:view`. The Requests tab needs `APPROVALS`; Registered and Rejected need `REGISTRATION`. Actions are gated by each module's edit rights (unchanged on the server).
- **Page template (AC-09):** every routed screen renders `PageHeader` + content. R1.1 screens get a `PageHeader` wrapper in R1 (title + description only), so the shell is consistent before their internals are rebuilt.

## Live parking
- **Views:** `SegmentedControl` "Live parking slots (n) · Puzzle wise status (n)". Inside the slots view, a **Cards | List** switch remembers its choice per viewer in `localStorage` (try/catch, default Cards).
- **Paging:** 12 / 20 / 36 / 60 per page, default **20**, one `Pagination` bar under the grid, "Showing 1–20 of 1,080". Filters reset to page 1. Puzzle view: **6 stackers per page**, 2 per row, pallets as compact `SlotCard`s ordered by `palletLevel` descending (gap 4 rule). **AC-14 is superseded by user direction; flagged for the PM (gap 2).**
- **Level buttons** come from `summary` (B1/B2/B3/Ground+Driveway free/total), as today. **Filters:** search (slot, plate, location), status, slot type. Sort: vacant first, then slot code. All of this is client-side, on the site's slot list (≤ a few thousand rows).
- **Card content (B):** band = status (+ "Level n" in the puzzle view); slot code (`SlotCode`); explainer line ("Puzzle 03 · Pallet 1" / "Ground · Bay 14", from `puzzleNumber` / `parkingType` / `floorLocation`); type chip + EV icon; plate (`PlateText`, largest) with "In since HH:mm" (`inSince`; "—" if missing); Height and Length boxes ("2.5 m" / "—"). **Mark exit** is an outlined destructive `Button` with `guard`.
- **Modal:** fields as in UX; "ANPR camera" shows `cameraNumber` or "—" (the `G-ANPR-CAM01` fallback is removed). There is one line **"Stacker controller (PLC) — not connected"**, and "Lock: OK", "Hydraulic Lift Ready", "Safety Sensor: CLEAR" and "PLC OPERATIONAL" are removed (AC-04, AC-06). If a PLC feed is ever added it gets its own design. Entry from the modal uses the existing `/vehicles/entry` with `targetSlotNumber` (001 server rules unchanged). Status buttons call `/slots/update-status`.
- **Refresh:** `useAutoRefresh` (15 s) replaces the manual refresh button. After the user's own action, refetch immediately. (001's ≤5 s live target, AC-18 of 001, stays a 001 Phase 2 item.)

## Marketing site parkflows.in (AC-30)
- **Where it lives:** a new folder **`marketing/`** in this repo, built by Vite as a **static multi-page site** (plain HTML + the shared `tokens.css`, `components.css` and `fonts/`, plus a few lines of vanilla JS for the nav drawer). No React, so the home page is fast and indexable. Copy lives in the HTML files, which matches the user's "content editable via files, no CMS" decision. Build: `npm run build:marketing` → `dist-marketing/`.
- **Product preview:** the hero's preview is static HTML made of the **real component classes** (slot cards, gate result, pending card) with **placeholder data** clearly marked as an example. It is not a screenshot and has no live numbers.
- **Sharing:** it imports the same generated files from `src/design-system/` at build time, so a token change rebuilds both. The logo is one SVG in `src/design-system/brand/`, shared by console, marketing, favicon and app icons (AC-21).
- **Hosting:** recommended, a **second Firebase Hosting site** (`parkflows.in` + `www`) in the same Firebase project that serves admin.parkflows.in. It is static, so no Cloud Run. Deploy: `firebase deploy --only hosting:marketing` by the user (or a Cloud Build step later).
  - This needs **two new config files** in the repo: `firebase.json` targets and `.firebaserc`. Today the hosting config lives only in GCP (001 `08` gap 6), so **devops must export the current admin hosting config first**, so the new file doesn't overwrite it. **Needs approval (rule 5).**
  - Alternative if parkflows.in is already hosted elsewhere (e.g. the `website` folder): keep that host and copy `dist-marketing/` there. See Q-1/Q-2.
- **"Sign in"** → `https://admin.parkflows.in/` (the console's Login; signed-in users go to their landing page).
- **Contact (v1.1):** **sales@parkflows.in** (`mailto:` link) and **+91 98206 03518** (`tel:+919820603518`), in the demo band and the footer.
- **"Book a demo" (v1.1)** opens a **form page** (`/demo/`), not a modal, so it can be linked and works without JavaScript tricks. Fields: name, company, work email, phone, city, facility type, approximate number of parking slots, number of sites, preferred contact (email/phone), message (optional), and a consent checkbox: "I agree that ParkFlows may contact me about a demo. We keep these details for up to 12 months." A link goes to a short privacy note.
  - All fields use the design-system field component and its errors.
  - On success: "Thanks — we'll contact you within one working day." (confirmed, Q-7).
  - On failure: the error state, with sales@parkflows.in as a fallback.
  - Submitting posts to **`/api/v1/demo-requests` on the parkflows.in origin itself**: the marketing Firebase Hosting site gets **one rewrite**, `/api/v1/demo-requests` → the existing Cloud Run service (`parking-management-solution-v2-git`, asia-south1). The browser sees a same-origin call, so **no CORS change** is needed and 001's cross-origin write block stays as it is. Only that one path is rewritten; every other `/api/*` request on parkflows.in returns 404.
  - **Firebase Hosting rewrites only send the `__session` cookie**, and this route needs no session, so nothing else is affected.
- **Where the leads go (v1.1):** a **Master Admin console page "Demo requests"** (Setup group; Master only) with a 7-column table (received, name, company, city, facility, slots, status), a side panel with all fields, status actions (New → Contacted → Closed) with a note, CSV export, and **(v1.2) Delete request** in the side panel's "⋯" menu for when the person asks to be removed (AC-32d). The nav badge shows the count of **New** requests.
  - **No email is sent** (user decision Q-6, 3 Oct): sales checks the console page. The server gets no mail provider, dependency or secret. Because nothing notifies sales, the **New** badge on the Master nav is the only signal, so sales must check it at least daily for the one-working-day promise to hold. Every claim is re-checked against the live product before deploy (the PM signs off the copy). Feature wording follows the UX's honest-claims list, e.g. "record entries and exits", not automatic pass checks.
- SEO basics: title, description, Open Graph image from the logo, `robots.txt`, `sitemap.xml`. No analytics script in R1 (not requested; it would need a privacy decision).

## Demo-request client IP behind Firebase Hosting (v1.3 — review M-1, m-3)
**Problem (05 R1b M-1).** `POST /api/v1/demo-requests` is reached through the parkflows.in Firebase Hosting rewrite. With 001's global `trust proxy` = 1 hop, `req.ip` there is the **Hosting egress address**, the same for every visitor, so the 5-per-10-minutes limit becomes one shared bucket. A single bot can then block every real prospect.

**Constraints:**
- Ingress must stay `all`. DevOps (08, 13 Oct) confirmed that Hosting rewrites for admin.parkflows.in and the D1 route reach Cloud Run over the public front end.
- Raising `TRUST_PROXY_HOPS` to 2 globally would make the direct `*.run.app` URL spoofable for every route.
- No new cloud resources.

**Decision: a route-only rule. The global `trust proxy` stays at 1 and nothing else changes.** For this one route the server reads the `X-Forwarded-For` chain itself:
- It trusts the entry Hosting appended **only when** the hop that connected to Google's front end is a known Hosting egress address.
- Any other request that reaches this route on Cloud Run is refused.
- The direct `*.run.app` URL can't be used to submit, so there is nothing to spoof there. Requests through Hosting are keyed on the address Hosting itself recorded, which the visitor can't change.

**Why the rightmost entry can be trusted:** Cloud Run's Google front end appends the address of the peer that opened the TCP connection to it. A client can put anything to the **left** of that entry, but can't change it. Through the rewrite, that peer is Hosting, and Hosting appends the visitor's real address just before it. This matches 001's own observation (`server.ts` note: 2 hops gives the real client through Hosting).

### The rule: `pickDemoClientIp()`
A **pure function** in `src/server/clientIp.ts`, used only by the demo POST:

```
input:  xff      = all X-Forwarded-For header values, joined with "," (order kept)
        socketIp = req.socket.remoteAddress
        onCloudRun = Boolean(process.env.K_SERVICE)
        hostingCidrs = parsed DEMO_HOSTING_EGRESS_CIDRS (IPv4/IPv6 CIDR list)
output: { ok: true, key } | { ok: false, reason }

1. If not onCloudRun (local dev, tests without K_SERVICE): IGNORE X-Forwarded-For entirely.
   key = norm(socketIp). ok.
2. hops = xff split on ",", each trimmed, empties dropped. Each hop = norm(hop):
   strip one "::ffff:" prefix from IPv4-mapped IPv6; strip a ":port" from IPv4; strip "[ ]" around IPv6;
   valid only if net.isIP() != 0.
3. If hops is empty, or the rightmost hop P is not a valid IP           → { ok:false, reason:'no-edge-hop' }
4. If hostingCidrs is empty, or P is not inside any CIDR in hostingCidrs → { ok:false, reason:'not-via-hosting' }
5. C = the hop immediately LEFT of P. If there is none, or C is invalid  → { ok:false, reason:'no-client-hop' }
6. key = IPv4 ? C : the /64 prefix of C (so one IPv6 allocation can't rotate through addresses).
   ok.
Never read: the leftmost XFF entries, X-Real-IP, Fastly-Client-IP, CF-Connecting-IP, Forwarded,
X-Forwarded-Host, Origin or Referer for this decision.
```

**How the route uses it:**
- It runs **first**, before the content-type and body checks, and before the per-visitor limiter.
- `ok:false` → **403** `{ success:false, errorCode:'ERR_VIA_HOSTING_ONLY', message:"Please use the form on parkflows.in." }`. Nothing is stored and no limiter bucket is touched. A security event `DEMO_REQUEST_NOT_VIA_HOSTING` (status `BLOCKED_UNAUTHORIZED`) is written with the `reason` only, and **no IP or user-agent** (m-3).
- `ok:true` → the route limiter uses the key `demo:<key>` (5 per 10 min). It is a **separate key space** from 001's `ip:`/`u:` keys, so other routes are untouched.

**How it's built:**
- `rateLimiterMiddleware` gains an optional second argument `{ key?: (req) => string, redactAudit?: boolean }`. The defaults keep today's behaviour for every 001 route.
- The demo POST passes `key` (the value picked above, stored on `res.locals`) and `redactAudit: true`.

**Configuration (CLAUDE.md rule 5; approved with this revision):** a new optional env var on the Cloud Run service, `DEMO_HOSTING_EGRESS_CIDRS`: a comma-separated CIDR list of the addresses Firebase Hosting uses to reach Cloud Run.
- **Unset or empty on Cloud Run → every demo POST gets 403.** This fails closed: the form shows its AC-32b fallback (email and phone), which is what visitors see today with the flag OFF.
- DevOps fills it from the provider's **published** egress ranges for Firebase Hosting, confirmed on the D1 preview (check below). The source of the list and the date it was taken go into `08`.
- An env change makes a new revision but needs no rebuild.

**What this does not change:** `TRUST_PROXY_HOPS` (stays 1), Cloud Run ingress (stays `all`), CORS and the cross-origin write block, the 30-stored-per-hour global cap, the honeypot, and every other route's rate limiting and audit.

**Residual risk (accepted).** Someone who runs **their own** service on the same CDN provider, pointed at our `*.run.app` URL, could forge the client hop and dodge the per-visitor limit. The remaining defences:
- the 30-stored-per-hour cap and the honeypot still apply;
- 001's global `/api/` limiter (600/min) is keyed on `req.ip`, which is that CDN's egress address, so it still bounds the junk rate.

If abuse shows up, the next step is a CAPTCHA (K9), which needs its own design.

**Alternatives rejected:**
- `TRUST_PROXY_HOPS=2` everywhere: the direct URL becomes spoofable for all routes.
- Ingress `internal-and-cloud-load-balancing`: it breaks admin.parkflows.in and D1 (08).
- An external HTTPS load balancer: a new cloud resource, with a cost.
- Trusting a Hosting-specific request header, or `X-Forwarded-Host`: anyone can send those on the direct URL.
- Keying on a cookie or fingerprint: a new tracking signal that conflicts with the privacy note.

### m-3 recommendation (for PM and security, step 7)
**Recommendation: no IP address and no user-agent in any audit or security event written by the public demo route.** That covers `RATE_LIMIT_EXCEEDED` when the demo limiter fires (`redactAudit: true`: `actor:'anonymous'`, `ipAddress:'redacted'`, no `userAgent`, `targetResource:'/api/v1/demo-requests'` with no query string) and the new `DEMO_REQUEST_NOT_VIA_HOSTING` event.

**Reasons:**
- AC-32d says the IP is "used in memory for rate limiting only", and the privacy note says no IP or browser details are stored with the request. An audit row that names the visitor's IP next to the time of their submission undercuts both.
- The security value is low. The demo limiter's window is 10 minutes, and abuse is already bounded by the global cap and the honeypot. A count of throttled events per hour (which the redacted events still give) is enough to notice an attack.
- It keeps the audit trail free of data the 12-month deletion and delete-on-request (AC-32d) would then also have to cover.

**Every other route keeps 001's full audit (IP + UA).** Those routes serve signed-in staff or login attempts, where the IP is part of the security record.

**Still for the PM:** Cloud Run's own request logs hold network addresses (Google keeps them for its standard log retention). DevOps reports in `08` which address the request log shows for the D1 path, and the PM words the privacy note so it stays true. "Not stored **with your request** or in the ParkFlows system" stays accurate. "We never record your IP anywhere" would not.

### Tests backend must add (B6b, `tests/qa/002-client-ip.test.mjs` + `002-backend.api.test.mjs`)
**Unit (pure function):**
- Off Cloud Run: no XFF → socket IP; XFF present → **still** socket IP (XFF ignored).
- On Cloud Run with `hostingCidrs = 198.51.100.0/24`:
  - `"203.0.113.9, 198.51.100.7"` → `203.0.113.9`.
  - Client-forged leading entries `"1.1.1.1, 9.9.9.9, 203.0.113.9, 198.51.100.7"` → `203.0.113.9`.
  - Rightmost hop outside the CIDR (`"203.0.113.9, 192.0.2.50"`) → `not-via-hosting`.
  - Only the Hosting hop (`"198.51.100.7"`) → `no-client-hop`.
  - Invalid client hop (`"unknown, 198.51.100.7"`) → `no-client-hop`.
  - Invalid rightmost hop → `no-edge-hop`.
  - Empty CIDR list → `not-via-hosting`.
- Normalisation:
  - `::ffff:203.0.113.9` → `203.0.113.9`; `203.0.113.9:5123` → `203.0.113.9`.
  - Two IPv6 addresses in one /64 → the same key; in different /64s → different keys.
  - Two XFF header lines are joined in order.
- CIDR parsing: a bad entry in the env var is **ignored with a startup warning** (the other entries still count); an IPv6 CIDR works.

**API (server started with `K_SERVICE=test`, `AUDIT_HMAC_SECRET`, `DEMO_HOSTING_EGRESS_CIDRS=198.51.100.0/24`), each test named after its AC:**
1. **Separate buckets (M-1):** 5 honeypot posts as client A via a Hosting hop → 200 each; the 6th from A → 429; then 1 from client B → 200. Repeat with a valid post from B: stored.
2. **Forged entries don't escape:** 6 posts from A, each with a different forged leftmost XFF entry → the 6th is 429.
3. **Direct URL refused:** rightmost hop not in the CIDR → 403 `ERR_VIA_HOSTING_ONLY`. Nothing stored; A's and B's buckets unchanged.
4. **Fails closed:** server started with no `DEMO_HOSTING_EGRESS_CIDRS` → every demo POST 403.
5. **m-3:** after a 429, the security log has a `RATE_LIMIT_EXCEEDED` for `/api/v1/demo-requests` with `ipAddress` `'redacted'`, no `userAgent`, and none of A's address text anywhere in the entry. `DEMO_REQUEST_NOT_VIA_HOSTING` has no IP either.
6. **No regression:** a 001 route (e.g. `POST /auth/login` throttle) still audits the real `req.ip` and UA. `app.get('trust proxy')` is still 1. The 001 suites keep their counts (`001-backend` 64/64, hotfix 6/6, platform 42/57 = the known 15).
7. **Order:** a request refused as not-via-Hosting doesn't consume the 30/h cap; a 415 or 413 from client A counts toward A's bucket only.

### DevOps check on the D1 preview (before the demo form flag goes ON)
**Preconditions:**
- The B6b fix is serving on the Cloud Run service, with the flag OFF.
- `DEMO_HOSTING_EGRESS_CIDRS` is set from the published list; record the list, its source URL and the date in `08`.
- The preview channel's rewrite reaches that revision.

Use **honeypot-filled** test posts (`pf_hp_field` set), so nothing is stored and the 30/h cap isn't touched.

1. **Through Hosting, machine A** (e.g. Cloud Shell): POST 6 times to `https://<preview>.web.app/api/v1/demo-requests` → five `200 {"success":true}`, then **429**.
2. **Different network, machine B** (e.g. a phone hotspot), within the same 10 minutes: one POST → **200**. *This is the M-1 pass/fail.*
3. **Forged header, from A:** wait for the window to reset, then send 6 posts, each with a different `X-Forwarded-For: 203.0.113.N` → the 6th is still **429** (the forged value isn't the key).
4. **Direct URL:** POST to `https://parking-management-solution-v2-git-…run.app/api/v1/demo-requests` (and the tagged revision URL, if used) → **403 `ERR_VIA_HOSTING_ONLY`**.
5. **Audit:** as Master, read the security audit → `RATE_LIMIT_EXCEEDED` rows for the demo route show `ipAddress: redacted` and no user-agent; `DEMO_REQUEST_NOT_VIA_HOSTING` rows show only a reason.
6. **No side effects:** admin.parkflows.in sign-in and the console smoke checks still pass, and a login throttle event still shows a real IP (001 behaviour).
7. **Record in `08`:** steps 1–6 pass/fail, and what address Cloud Run's request log shows for the D1 path (input for the PM's privacy wording, m-3).

**If step 1 returns 403:** the CIDR list doesn't match Hosting's real egress. Fix the list before anything else. The flag stays OFF.
**If step 2 returns 429:** the buckets are still shared. Stop and come back to the architect.

## No regression on 001 (AC-23..AC-26)
- **Site isolation:** no change to `resolveSite`, `withSite` or the fetch wrapper. The new endpoints use the 001 helpers. New screens read data only through the existing calls plus the two new read-only endpoints.
- **Permissions:** nav visibility uses `isModulePermitted` as today, and routes check the same function. The server is unchanged except for the two new endpoints, which carry their own permission checks.
- **Viewing-as:** `ViewingAsBar` is a restyle of `ViewAsBanner.tsx` that keeps its logic. View-as stays GET-only on the server. The Sites screen (Master only) shows "No access" when viewing as a non-Master, as 001 m-5 requires.
- **Tests:**
  - `npm run test:qa` must keep its current pass count (AC-26).
  - New backend tests in `tests/qa/002-backend.api.test.mjs`: `/overview` site scoping (no site 400, foreign 403, no ALL), IST bucketing, `hasHistory`; `/sites/summary` Master-only; `inSince` doesn't join across sites; length/level validation; the mass-assignment fix.
  - The browser checks in `tests/qa/browser/` (001) are re-run on the new shell: site switch race, All-sites disabled writes, view-as reload/exit, session-ended return.

## Release slicing
| Slice | When | Contents |
|---|---|---|
| **R1-pre** (may start before the 001 merge, own branch `feature/002-design-system`, touches **no** 001 files) | 3–5 Oct | Token script + generated CSS, fonts, `components.css` port, components 1–7 in `src/design-system/`, the `/design-system` preview (not routed yet), `marketing/` site. Rebased onto `main` once 001 merges. |
| **R1** (after 001 is merged to `main`) | merge → 9 Oct (code freeze); 10 Oct release | Shell + routes, Login, Overview, Live parking, Employees & vehicles, Sites, nav removals and AC-11 removals, backend B1–B4, marketing deploy |
| **R1.1** | date to set | Restyle the remaining console screens (Inventory, Logs, Alerts, Reports, Valet, Users & roles, Billing, Audit log, Settings, Predictive) onto components; extend `lint:styles` to the whole `src/components` |
| **R2** | after R1 | Android Attendant + Employee apps and the `/attendant` gate screens on the same CSS (gate result, AC-15..17, 28), after the source decision (gap 12) |

**Go/no-go for 10 Oct:** 001 merged to `main` by **5 Oct**, and Q-3 (contact details, demo destination) answered by **8 Oct**. Otherwise, either move R1 or ship the console part only and publish the marketing site when Q-3 is answered.

---

## Migration & backward compatibility
- **Data:** none. Both new slot fields are optional; existing slots show "—" until a site admin fills them by CSV or the form.
- **API:** additive only. The deployed Android apps (which call `/slots`) ignore the new fields.
- **Clients:** the console and server ship together on one Cloud Run revision. The marketing site is independent (static).
- **Bookmarks:** the console had no deep links before, so nothing breaks. `/` → landing.
- **`/attendant` web portal and the APK:** untouched in R1. They don't import the new CSS.

## Risks & alternatives
| # | Risk | Mitigation |
|---|---|---|
| K1 | **The 001 merge slips**, so R1 has too few days | R1-pre on its own branch; go/no-go 5 Oct; the slice can drop Sites or Employees to R1.1 (PM's call) rather than ship half-built screens |
| K2 | **The shell mixes old and new looks** for R1.1 screens | Accepted for ~10 days. The shell and PageHeader make the frame consistent. R1.1 is scheduled right after |
| K3 | **The Tailwind default reset** breaks the look of R1.1 screens that still use `bg-slate-*` etc. | **Reset in two steps.** R1: the reset applies **only to R1 files**. Generate the theme without `--color-*: initial`, and `lint:styles` forbids the defaults in R1 files. R1.1: add the reset once no file uses them. **This is the chosen approach.** |
| K4 | **Rewriting `EmployeeRegistration`** (2,377 lines) loses behaviour | Move the CSV import, domains panel and add-employee code as-is into the new screen files, and restyle in place. QA re-runs the 001 registration tests and the AC-57 checks |
| K5 | **Self-hosted fonts** add ~200–250 KB on first load | latin subsets, `swap`, only the weights used, long-cache fingerprinted files |
| K6 | **Hash routing** conflicts with `/attendant` or the server's fallback | Hash routes never reach the server; `/attendant*` stays a server route |
| K7 | **Marketing hosting config** overwrites admin hosting | Devops exports the live config first; a separate hosting target; a dry run with `--only hosting:marketing` |
| K9 | **(v1.1) Spam or abuse of the public demo form** | Honeypot, per-IP and global rate limits, size caps, no echo, Master-only reads. If spam gets through anyway, add a CAPTCHA in a later revision (that needs a provider and a privacy decision) |
| K10 | **(v1.1) Personal data of prospects** | Only the fields a sales call needs; consent text; no IP or user-agent stored; Master-only access; 12-month deletion; not shown to any site role |
| K8 | **Polling load** (1,080-slot list every 15 s per open admin tab) | Paused when the tab is hidden; ~300 KB per poll is acceptable at current scale. Server-side delta or ETag is a later optimisation |

**Alternatives considered:**
- *CSS-in-JS or CSS modules.* No: they add a dependency or a second styling idea next to Tailwind.
- *Tailwind-only components (no `pf-*` classes).* No: the marketing site and the R2 apps would need their own copies of every component.
- *A UI library (Radix, shadcn).* No: a new dependency, and `<dialog>` + the approved CSS cover what R1 needs.
- *Charts with a library.* No: one simple bar chart doesn't justify one.

## Rollback plan
- **Console:** shift Cloud Run traffic back to the previous revision (as in 001 `08`), then `git revert` the merge. No data shape changed. The new optional fields stay in Firestore and the old code ignores them (the old update path spreads unknown fields, so they persist harmlessly).
- **Marketing site:** `firebase hosting:rollback` on the marketing target only (or redeploy the previous `dist-marketing/`), without touching admin hosting.
- **Partial rollback:** each R1 screen is a separate route. A broken screen can be pointed back to its old component in `routes.ts` with a one-line revert, because the old files are deleted only in a **separate commit** at the end of R1, after QA passes.

---

## Task breakdown
All code tasks start on `feature/002-ui-redesign` from `main` **after 001 is merged**, except tasks marked **pre**, which run on `feature/002-design-system` and touch only new files. Every task: `lint`, `lint:styles` (once it exists), `build`, `test:qa`.

| # | Tag | Task | Done-when |
|---|---|---|---|
| T1 **pre** | [frontend] | Token pipeline: move `tokens.json` to `src/design-system/`, `scripts/build-tokens.mjs`, generated `tokens.css` + `theme.css` (no default reset yet, K3), `npm run tokens` + `--check`, reduce-motion block | Generated files match `tokens.json`; `--check` passes; Tailwind compiles `bg-navy-600`, `p-4` = 16px, `text-title-1` |
| T2 **pre** | [frontend] | Fonts: WOFF2 latin subsets + `OFL.txt` + `fonts.css`; logo SVGs (full, mark, single-colour, 16px favicon variant) in `src/design-system/brand/` | Fonts load with no network call to Google; favicon renders at 16px |
| T3 **pre** | [frontend] | Port `components.css` into `@layer components` (+ the UX-addition classes); `scripts/check-styles.mjs` + `npm run lint:styles` with the R1 file list | lint:styles passes on the design-system folder; flags a seeded inline style in a test file |
| T4 **pre** | [frontend] | Components 1–4 (Icon, Button, IconButton, fields, chips, Banner, ViewingAsBar, Toast, Empty/Error/Skeleton) + `src/utils/format.ts` (with unit tests in `tests/qa/002-format.test.mjs`) | Preview route shows all states; format tests cover IST dates/times, ₹ grouping, durations, enum words |
| T5 **pre** | [frontend] | Components 5–7 (Card, KpiCard, Tabs, SegmentedControl, LevelButtons, Pagination, Table, BulkBar, Modal, SidePanel, SlotCard, SlotRow, OccupancyBar, BarChart) | Preview shows all states; Modal/SidePanel close on Esc and outside click; keyboard focus visible everywhere |
| T6 **pre** | [frontend] | `marketing/` static site: home page per mockup S6 with the real contact details (v1.1), the **`/demo/` form page** and the privacy note, `npm run build:marketing`, SEO files. The form posts to `/api/v1/demo-requests` (works once B6 + D1 are live; until then it shows the error state with the email fallback) | Lighthouse a11y ≥ 95; 360/768/1280 without horizontal scroll; "Sign in" → admin.parkflows.in |
| B1 | [backend] | Slot fields: `lengthM`, `palletLevel` in `types.ts`, `saveOrUpdateSlot` (explicit field list, no spread), `bulkUploadSlots`, validation; response adds `heightM` | Tests: valid/invalid length and level; update can no longer set unlisted fields; old 8-column CSV unchanged |
| B2 | [backend] | `inSince` join in `GET /slots` (same-site ACTIVE log by `slotId`); IST helper in `src/server/time.ts`; fix `getPeakHours` to IST | Tests: occupied slot has `inSince`; no cross-site join; hour buckets in IST |
| B3 | [backend] | `GET /overview` (shape above, `FLOOR_PLAN:view`, site required, masked `latest`) | Tests: 400/403/ALL refused; counts match seeded logs; `hasHistory:false` on a new site |
| B4 | [backend] | `GET /sites/summary` (Master only); `/analytics/prediction` adds `sample:true` | Tests: Master 200; Site Admin 403; view-as non-Master 403 |
| F1 | [frontend] | `AppShell` (TopBar, grouped nav, NavDrawer, PageHeader, SiteSwitcher + ViewingAsBar moved from the 001 components), `useAutoRefresh`; delete `Header.tsx`, `Sidebar.tsx` | 001 browser checks pass; switcher reachable at 360/768/1280; current site shown only in the switcher |
| F2 | [frontend] | Hash routes (`routes.ts`), landing rule, `NoAccess` on unknown/forbidden routes, delete `RoleHomePage`; nav removals (Field, Smart Pass, InfoSec rename); `PageHeader` wrapper for R1.1 screens | AC-07, AC-08, AC-10 checks; deep links work after reload |
| F3 | [frontend] | Login screen | AC-19/21 checks; server lockout text shown; no presets/version pill |
| F4 | [frontend] | Overview screen on `/overview` | KPIs, levels, attention list, hourly chart, latest; "—" + reasons on a new site; phone layout at 390 |
| F5 | [frontend] | Live parking (cards/list, puzzle view, modal, paging, filters, PLC line, camera "—"); delete `LiveFloorPlan.tsx`, `SiteAdminLiveSlots.tsx`; Inventory form + CSV template gain Length / Pallet level | UX S3 behaviours; Mark exit/entry/status work with the write guard; no fabricated values (AC-04 grep) |
| F6 | [frontend] | Employees & vehicles (merged route, tabs without Revoked, bulk approve/reject with reason, add employee, CSV import, domains panel moved) | 001 registration + AC-57 tests pass; AC-11/12/13/27 checks |
| F7 | [frontend] | Master Sites (table from `/sites/summary`, side panel, status change, add site, **Edit site** via `POST /sites/update` (v1.1)) | AC-10/12/13/24 checks |
| F8 | [frontend] | Product-wide honesty and naming pass: remove the remaining AC-04 strings outside R1 screens (Header/Sidebar gone with F1; `AnalyticsPredictive` "Sample data — not live" banner + per-chart label; "LSTM" copy removed), rename to "ParkFlows" in `index.html`, `mobile.html`, `metadata.json`, UI strings (AC-21; `capacitor.config.ts` appName waits for R2); entry/exit removed from `ParkingLogs` and `InventoryMaster` (AC-11) | Grep for the AC-04 list, "ParkFlow\b" and "ParkOrbit" in UI strings returns 0 |
| F9 | [frontend] | Confirm `lint:styles` forbids Tailwind defaults on every R1 file (K3 step 1), and delete the replaced R1 component files in one separate commit | lint:styles is clean on the R1 list; inline-style count reported in `04` |
| B5 | [backend] | **(v1.1, Q-4)** `POST /sites/update` per the API table (`updateSiteDetails()` in `db.ts`, explicit field list, validation, audit with field names) | Tests: Master 200 and fields change; Site Admin 403; view-as POST 403; unknown fields ignored; bad email/phone 400 |
| B6 | [backend] | **(v1.1, Q-3)** Demo requests: `DemoRequest` type, `demoRequests` collection, public `POST /demo-requests` (validation, honeypot, per-IP + global limits, 8 KB body cap, nothing echoed), Master-only list / status / CSV export, **(v1.2) Master-only `DELETE /demo-requests/:id`** (memory + targeted Firestore delete, audit without personal data), 12-month cleanup in the existing housekeeping path (also deletes the Firestore documents; count-only audit). Honeypot field is **`pf_hp_field`** | **Acceptance = PRD AC-32a–d** (tests in `tests/qa/002-backend.api.test.mjs`, each named after its AC):<br>**AC-32a:** valid → stored + `{success:true}` with nothing echoed; each invalid field (incl. city, consent, numbers) → 400 with its own message; `pf_hp_field` filled → 200 and nothing stored; 6th request in 10 min from one IP → 429; 31st in an hour overall → 429.<br>**AC-32b:** server errors return a plain error body (no stack, no echo) so the page can show its fallback; 500 path tested with a forced store failure.<br>**AC-32c:** the route accepts POST + JSON body only; a GET with query-string fields → 404/405 and nothing stored.<br>**AC-32d:** stored record has no IP, user-agent or other browser field; non-Master GET/export/status/DELETE → 403; view-as DELETE → 403; Master DELETE → 200, record gone from the list **and** from Firestore (re-load the store and check), audit row `DEMO_REQUEST_DELETED` contains none of the submitted values; unknown id → 404; a record older than 12 months is removed by the cleanup run and its document deleted; export escapes `=cmd`. |
| B6b | [backend] | **(v1.3, review M-1/m-3)** `src/server/clientIp.ts` with `pickDemoClientIp()` (rule above); `rateLimiterMiddleware` gets an optional `{ key, redactAudit }` (defaults unchanged); the demo POST refuses non-Hosting requests on Cloud Run with 403 `ERR_VIA_HOSTING_ONLY` before any other check, then limits on `demo:<key>`; `DEMO_HOSTING_EGRESS_CIDRS` is parsed at startup (bad entries warned and skipped); `DEMO_REQUEST_NOT_VIA_HOSTING` and the demo-route `RATE_LIMIT_EXCEEDED` audit carry no IP or user-agent. **Fix m-1 and m-2 in the same round** (05). | The unit and API tests in "Tests backend must add" pass; `trust proxy` still 1; 001 suites unchanged; code review round 2 PASS; DevOps D1 preview check (steps 1–7) PASS **before the demo form flag goes ON** |
| F10 | [frontend] | **(v1.1)** Console "Demo requests" page (Master only, Setup group): table, side panel, status change with note, export, New-count badge. **(v1.2)** **Delete request** in the side panel "⋯" menu (destructive, `guard` so it is disabled in view-as): a confirmation `Modal` "Delete this request? This permanently removes {name}'s details from ParkFlows. Use this when the person asks to be removed." with **Delete** (destructive) / **Cancel**; on success the panel closes, the row leaves the table, toast "Request deleted" (no undo, since the data is gone); on error the standard ErrorState copy | Master sees requests; Site Admin has no nav item and gets No access on the route; Delete removes the row after confirmation and is disabled while viewing as another user; AC-32d console check |
| D1 | [backend] | Marketing hosting: (v1.1) first read the current parkflows.in source in the `website` folder (needs folder access) and list what must carry over (DNS/domain, legal pages, analytics); devops exports the live Firebase Hosting config; add `firebase.json` targets + `.firebaserc` (approved), including the **single rewrite** `/api/v1/demo-requests` → Cloud Run; deploy `dist-marketing/` to a preview channel, then move the parkflows.in domain to the new site | Preview URL serves the site and a test demo request lands in the console; admin hosting is unchanged; carry-over list signed off. **v1.3:** plus the M-1 check in "DevOps check on the D1 preview" (steps 1–7) recorded in `08`; the demo form flag stays OFF until it passes |
| R1.1-x | [frontend] | One task per remaining screen (list in Release slicing), then the full default reset in `theme.css` (K3 step 2) + `lint:styles` on all of `src/components` | AC-01/02 across the console |
| R2-0 | [mobile] | Decide the shipping Android source (gap 12); then import the tokens/components CSS into `src/mobile` and replace the `C` palette | Decision recorded in a 002 R2 design revision |
| R2-x | [mobile] | Gate result, gate screens, Employee pass/registration on components; app icon/splash from the logo; appName "ParkFlows" | AC-15..17, AC-28 |

Order: T1 → T2/T3 → T4 → T5 (T6 in parallel after T3). After the merge: B1–B6 in parallel → F1 → F2 → F3–F7 (in parallel, each needs F1/F2; F4 needs B3, F5 needs B1/B2, F7 needs B4 + B5, F10 needs B6) → F8 → F9. D1 any time after Q-1/Q-2.

## New dependencies
**No new npm packages.**
- **Icons:** `lucide-react` is already a dependency (`^0.546.0`). It is confirmed and stays the only icon set.
- **Fonts:** Sora, IBM Plex Sans and JetBrains Mono, **self-hosted** as committed WOFF2 files with their OFL licences (no npm package, no Google request). **Needs approval** as an asset addition.
- **(v1.3) New env var needing approval (rule 5):** `DEMO_HOSTING_EGRESS_CIDRS` on the Cloud Run service (fails closed when unset). `TRUST_PROXY_HOPS` and ingress are unchanged.
- **New config files needing approval (rule 5):** `firebase.json` hosting targets + `.firebaserc` for parkflows.in (D1), **including one rewrite** of `/api/v1/demo-requests` to the existing Cloud Run service (v1.1). **No mail provider** is added in R1 (Q-6). New npm scripts: `tokens`, `lint:styles`, `build:marketing` (no packages). **No Firestore rule or index changes.**

## Open questions
| # | Question | Needed by | Owner |
|---|---|---|---|
| Q-1 | ~~Is parkflows.in live, and is the `website` folder its source?~~ **Answered (yes), 3 Oct.** Folder access is needed for D1 | — | user |
| Q-2 | ~~Second Firebase Hosting site?~~ **Answered (yes), 3 Oct** | — | — |
| Q-3 | ~~Contact details and demo destination~~ **Answered 3 Oct:** sales@parkflows.in, +91 98206 03518, a demo form that records the customer's details | — | — |
| Q-4 | ~~Add `POST /sites/update`?~~ **Answered (yes), 3 Oct** | — | — |
| Q-6 | ~~Email new demo requests to sales@?~~ **Answered 3 Oct: no.** Sales checks the console "Demo requests" page. No mail provider is added | — | — |
| Q-7 | ~~Reply promise and privacy wording~~ **Answered 3 Oct: yes.** "Thanks — we'll contact you within one working day." and "We keep these details for up to 12 months." are final | — | — |
| Q-5 | AC-14 update to "paged cards, 12/20/36/60" (gap 2) | before QA | PM |

## Decisions log
| Date | Decision | By | Effect |
|---|---|---|---|
| 2026-10-03 | Brand B · Bay; design system; R1 mockups; Live parking slot card B + list D + "Puzzle wise status" | user (via UX) | Inputs to this design |
| 2026-10-03 | **Tech design v1.0 approved** (including self-hosted fonts and the Firebase Hosting config) | user | Build may start: R1-pre now, R1 after the 001 merge |
| 2026-10-03 | Q-1/Q-2: parkflows.in is live from the `website` folder and moves to a second Firebase Hosting site | user | D1 carry-over step |
| 2026-10-03 | Q-3: sales@parkflows.in, +91 98206 03518; "Book a demo" opens a form that records the customer's details | user | v1.1: demo-request data model, API, console page, tasks B6/F10; PM to add US-18/AC-32 |
| 2026-10-03 | Q-4: add Master-only `POST /sites/update` | user | v1.1: B5, F7 Edit site |
| 2026-10-03 | Q-6: no email for demo requests; sales checks the console page | user | No mail provider; the New badge is the only alert |
| 2026-10-03 | Q-7: reply promise "within one working day" and the 12-month privacy line are final | user | T6 copy final |
| 2026-10-13 | **M-1: demo-request client IP is picked by a route-only rule** (trust the Hosting-appended hop only when the edge hop is a configured Hosting egress address; otherwise 403 on Cloud Run); global `trust proxy` stays 1, ingress stays `all`, no new cloud resources | architect (v1.3, pending approval) | B6b, new env `DEMO_HOSTING_EGRESS_CIDRS`, D1 preview check |
| 2026-10-13 | **m-3: recommend no IP or user-agent in audit events from the public demo route** | architect (recommendation; PM and security to confirm) | `redactAudit` on the demo limiter; PM to check the privacy wording against Cloud Run request logs |
| 2026-10-08 | **Tech design v1.2 approved** (`pf_hp_field`, Master-only delete, F10 delete action, tests mapped to AC-32a–d) | user | B6 scope |
| 2026-10-03 | **Tech design v1.1 approved** (demo-request form, storage and console page; `POST /sites/update`; parkflows.in rewrite) | user | Gate 3 passed for 002. R1-pre tasks (T1–T6) may start now on `feature/002-design-system`; everything else waits for the 001 merge to `main` (go/no-go 5 Oct) |
| 2026-10-03 | OQ-11 (a): R1 = brand + design system + parkflows.in + 5 screens; OQ-12: apps in R2; OQ-13: Predictive stays, labelled "Sample data — not live" | user (via PM) | Release slicing; F8 |

## Changelog
| Version | Date | Change | By |
|---|---|---|---|
| v1.0 | 2026-10-03 | First design: token pipeline, components, R1 screens, data changes, marketing site, release slicing | architect (approved by user 3 Oct) |
| v1.1 | 2026-10-03 | Answers to Q-1..Q-7: demo-request form + storage + Master console page (B6, F10), `POST /sites/update` (B5), parkflows.in hosting rewrite, contact details | architect (approved by user 3 Oct) |
| v1.2 | 2026-10-08 | Per PRD v1.2 (AC-32a–d): honeypot field renamed `website` → **`pf_hp_field`**; **Master-only `DELETE /demo-requests/:id`** (hard delete from memory and Firestore, audit `DEMO_REQUEST_DELETED` with no personal data; count-only audit for the 12-month job) added to B6 and as a confirmed **Delete request** action in F10; city added to the server-side field checks to match AC-32; B6 acceptance tests now mapped to AC-32a–d | architect |
| v1.3 | 2026-10-13 | Review 05 R1b M-1: **route-only client-IP rule** for `POST /demo-requests` behind the Firebase Hosting rewrite (`pickDemoClientIp`, Hosting-egress allow-list `DEMO_HOSTING_EGRESS_CIDRS`, 403 `ERR_VIA_HOSTING_ONLY` for direct calls on Cloud Run, `demo:` limiter key, IPv6 /64), new task **B6b**, backend tests, D1 preview check; **m-3** recommendation (no IP/UA in demo-route audit events); API row aligned with the build (public by method; 30 **stored** per hour) | architect |

Status: READY FOR APPROVAL (v1.3 delta: demo-request client-IP rule + `DEMO_HOSTING_EGRESS_CIDRS`, task B6b, tests, D1 preview check, m-3 recommendation; v1.0–v1.2 APPROVED by user)
