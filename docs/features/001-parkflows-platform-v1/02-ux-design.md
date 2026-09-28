# UX Design — ParkFlows Platform v1 (baseline)
Feature ID: 001 · Author: ux-designer · Revision: **v1.1** (2026-09-28) · Input: `01-prd.md` **v1.2, APPROVED** (29 stories, 56 AC) + Addendum A

Surfaces covered: **Web console** (`src/components`, Sidebar + Header shell) for Master Admin and Site Admin · **Attendant app** (`src/mobile`, served as the web portal at `/attendant` in Phase 1 and as a Capacitor APK in Phase 2: Gate / Slots / Levels) · **Employee app** (same mobile shell; Phase 2).

**Changes in v1.1** (the v1.0 design was written against PRD v1.1 before it was approved):
- Added the **release-phasing plan** (§0), which sets what UX ships on 1 Oct and what follows.
- Added flows, screens, copy and traceability for **US-25 to US-29** and **AC-48 to AC-56**.
- Updated the flows for the user decisions:
  - Override is allowed for Attendants, with a mandatory reason, and the log entry is flagged as Override (AC-20).
  - A pass can hold up to 2 vehicles, and an employee can hold passes at several sites (US-25).
  - The overstay limit is set by the **Site Admin**, not the Master Admin, and the employee is notified (US-26, AC-33).
  - Test tools are Master Admin only, and the simulator persists across reload (AC-52, AC-55).
  - Records are kept for 1 year and then archived, with no delete action for Site Admins (US-27).
  - Invoicing is not a launch blocker (AC-35).
  - Offline queueing is out of scope (OQ-7).
- Closed or updated gaps G-0, G-2 and G-6 to G-10; added G-17 to G-20.

---

## 0. Release phasing — what UX ships when
PRD v1.2 splits the release into three phases, and OQ-16 says existing flows stay as they are for 1 Oct (**no new build**). This design is therefore split the same way. **Every flow in §2 carries a phase tag: [Phase 1], [Phase 2] or [Phase 3].** (Phase tags are separate from story priority P0/P1/P2.)

| Phase | Date | UX scope | Must-pass AC |
|---|---|---|---|
| **Phase 1 — Launch** | 1 Oct 2026 | Web console only, for **Alphatech**. Only the **isolation-safety UX** changes listed below (L-1 to L-8). Everything else runs on the current screens as they are. | AC-01..AC-07, AC-44, AC-45, AC-47, AC-52, AC-55 |
| **Phase 2 — Android APKs** | After Phase 1 (OQ-14) | The full Attendant app (§3.3) and Employee app (§3.4) redesign, plus the remaining console P0/P1 screens | AC-08..AC-34, AC-36..AC-43, AC-46, AC-48..AC-51, AC-53, AC-54 |
| **Phase 3 — iOS / stores** | OQ-15 | The same mobile designs on iOS. Adds only the platform differences noted in US-29 (§2) | AC-56 |
| Deferred | — | Invoice screens (US-16), after OQ-9 is decided | AC-35 |

**Phase 1 (launch) UX change list (small, low-risk, all in the existing console shell):**
| # | Change | Where | AC |
|---|---|---|---|
| L-1 | Show the site chip at **every** screen width. At < 1024 px it becomes a compact chip, and the popover opens as a bottom sheet (G-11) | `Header.tsx` | AC-01, AC-04 |
| L-2 | On site switch, clear the old lists straight away and show skeleton rows until the new site's data arrives. Never show old rows under the new site's name | every list screen | AC-04 |
| L-3 | In **All sites** mode: a site-code chip on every row, and every write action disabled with the tooltip "Select one site to make changes". With no site chosen, Master Admin sees a picker prompt instead of empty data (strict `siteId`, OQ-3) | lists and toolbars | AC-02, AC-04 |
| L-4 | "No site assigned" screen (S-0) | app shell | AC-44 |
| L-5 | "No access" page (S-NA), with the entry points hidden for non-permitted roles. The test tools (attack simulator, clear-history, Role View Simulator) are visible to Master Admin only | Sidebar, Header, Home tiles | AC-07, AC-52 |
| L-6 | Readable error card with **Try again**, the cross-site 403 message, and the session-expired return to the same page and site | shared | AC-03, AC-45, AC-47 |
| L-7 | Remove the made-up "System healthy · 100% uptime" text and the "1,080 slot" description from the Sidebar (G-12) | `Sidebar.tsx` | trust / US-01 |
| L-8 | Fixed **"Viewing as {user}"** banner with **Exit view**, kept across reload (R1 in Addendum A: don't demo the simulator to Alphatech until isolation is fixed) | app shell | AC-55 |

Not in Phase 1 (the existing UI stays): the Attendant `/attendant` portal (G-17), employee registration, approvals, logs, reports, valet, and the accessibility clean-up on mobile (G-13).

---

## Gaps found in PRD
**Process**
- ~~**G-0 PRD not approved yet.**~~ *Resolved: PRD v1.2 approved by user on 2026-09-25. This v1.1 design is aligned to it.*

**Contradictions between PRD and the existing product (architect and PM to resolve; UX assumptions noted)**
- **G-1 Site status values.** PRD US-03 says *On Hold / Maintenance / Decommissioned*; code has `ACTIVE | ON_HOLD | DEACTIVATED`. **UX assumption:** 4 statuses (Active, On hold, Maintenance, Decommissioned). Decommissioned is final (read-only) in the UI.
- **G-2 Two attendant apps (partly resolved by OQ-2, OQ-13 and OQ-16).** The Attendant app is `src/mobile`, served at `/attendant` in Phase 1 and as an APK in Phase 2. The Employee app ships in Phase 2 on the same mobile shell. **Still open:** `components/AttendantMobileApp.tsx` ("ParkFlows Field" in the console) is a second, older attendant UI. **UX recommendation:** in Phase 2 the console entries "ParkFlows Field" and "Employee Smart Pass" become **preview-only** for admins (§3.1), so field staff only ever use one attendant UI.
- **G-3 No "Revoked" pass state.** `RegistrationStatus` has no REVOKED, but US-11 and AC-30 need one. The design shows a Revoked state.
- **G-4 Site fields.** US-02 needs 2W/4W capacity, facility type and billing type + rate. `SiteConfig` has `totalSlots`, `basementLevels` and hourly/daily/monthly pricing, and no billing type. The design uses the PRD field list; the architect maps it.
- **G-5 Slot fields.** US-05 names *floor, zone, vehicle type, slot type*. The code and sample CSV use `Basement, FloorLocation, SlotType, Height, ParkingType, Allocation`. **UX assumption:** UI labels are *Level* (= basement), *Zone / location*, *Vehicle type* (2W/4W), *Slot type* (Standard/EV/Puzzle/Stacker/Reserved), plus optional *Height*. The CSV template matches these labels.
- ~~**G-6 Override at gate.**~~ *Resolved (OQ-5, OQ-5b):* Attendants can override "not authorised". The reason is mandatory, and the log entry is flagged **Override**. The design shows the override button to every Attendant. It is secondary and never the default action.
- ~~**G-7 Offline.**~~ *Resolved (OQ-7): online-only for v1.* Offline blocks recording (AC-46). The "Pending sync" state is removed and will be designed in the next release.
- **G-8 Multi-site and multi-vehicle (resolved by OQ-4 and OQ-4b; OQ-4c still open).** An employee can hold passes at several sites whose domain matches their email, with up to 2 vehicles per pass. **OQ-4c (re-approval when a vehicle is added or replaced) is still open.** **UX assumption:** adding or replacing a vehicle on an approved pass sends *that vehicle* for review ("Pending review" chip on the vehicle). The existing vehicle stays authorised in the meantime. If OQ-4c says "no re-approval", drop the chip and the change takes effect straight away.
- ~~**G-9 Overstay limit owner.**~~ *Resolved (OQ-10):* the **Site Admin** sets it (default 12 h) in a new **Site settings** page. Master Admin can see it in the site drawer (read-only).
- ~~**G-10 Test tools.**~~ *Resolved (OQ-6, OQ-6b):* Master Admin only (AC-52). The simulator persists across reload behind a fixed banner (AC-55).
- **G-17 Phase 1 attendant flows can't meet the P0 gate AC as designed.** OQ-16 keeps today's `/attendant` portal for 1 Oct. That portal has no "Not authorised", override, "Site full", "Already parked" or site-status result screens (G-16). So AC-14 and AC-19 to AC-23 either depend on server messages shown as red toasts in Phase 1, or wait for Phase 2. **Needs a PM/QA call:** accept toast-only gate feedback at Alphatech for Phase 1, or pull the gate result sheet (§3.3) forward into Phase 1 as the one exception. The gate result sheet is the smallest high-value change.
- **G-18 Strict `siteId` (OQ-3) means Master Admin must always choose.** With nothing selected, the UI must not quietly load the empty `site-default` (Addendum A R2). The design adds a "Choose a site" prompt (L-3). "All sites" is an explicit choice, never a fallback.
- **G-19 Retention and archive (US-27, AC-53; OQ-11c open).** Site Admins get no delete actions anywhere on logs or audit. Master Admin gets an **Archived records** view. Clear-history stays Master Admin only. Until OQ-11c is decided, its confirmation says records younger than 1 year are *not* removed.
- **G-20 Employee overstay notification (AC-33).** This is in-app only. It needs a notification area in the Employee app (bell + list) that the current EmployeeMobileApp doesn't have. It is designed in §3.4 for Phase 2.

**Existing-UI issues this design fixes (found while reviewing the current screens)**
- **G-11** The header site switcher is `hidden lg:flex`: below 1024 px (tablets, small laptops) there is **no visible site context**. That works against US-01 and AC-04.
- **G-12** The sidebar footer shows fixed text "System healthy · 100% ANPR & sensor uptime", and the Inventory item description is fixed to "1,080 slot mechanical matrix". Both are made up or tied to one site; they must go.
- **G-13** In the mobile app, header buttons are 32 px and the bottom tab control is 8 px dots, below the 44 px minimum. The `faint` text colour `#8b95a6` on `#f5f6f8` is about 2.9:1 contrast, which fails AA for body text.
- **G-14** Form labels are not linked to their inputs (`htmlFor` is only used in LoginScreen), and `aria-*` attributes are almost never used.
- **G-15** The mobile "OFFLINE" pill appears for *any* failed response, including a server 500. Users can't tell "no network" from "server error".
- **G-16** Gate Terminal has **no "Not authorised" result** and no "site full" or "duplicate" result. Errors appear only as a red toast.

---

## 1. Design principles for v1
1. **Site context is always visible and always true.** Every console page shows the active site in the header chip, on every screen width, and in the page title line. In **All sites** mode, every row carries a site-code chip and every write action asks the user to pick one site first.
2. **Switching site clears before it shows.** When the site changes, lists empty straight away into skeleton rows. Rows from the old site are never shown under the new site's name (AC-04).
3. **Hide what you can't use.** Modules outside a user's role do not appear in the Sidebar, RoleHomePage tiles or header menus. If someone reaches one anyway (deep link, stale tab), they see the **No access** state, not a blank or broken page (AC-07, AC-08).
4. **Gate results are full-screen, colour + icon + words.** One decision per screen, large type, readable in sunlight: green = allowed, red = stop, amber = needs action.
5. **Reuse, don't invent.** Console: white header and `slate-900` sidebar, `rounded-xl` cards, Barlow / Barlow Condensed for eyebrow labels, lucide icons, and the existing status chips (VACANT emerald, OCCUPIED rose, RESERVED amber, MAINTENANCE slate). Mobile: the `C` palette from `src/mobile` (bg `#f5f6f8`, primary `#2563eb`, success `#059669`, danger `#be123c`), monospace eyebrow labels, 11–18 px card radius.

---

## 2. User flows (per story)
Each flow lists steps, then the screens touched. Wireframes are in §3.

### US-01 Site isolation (all roles) — P0 [Phase 1]
1. User signs in → app resolves permitted sites.
2. **0 sites** → "No site assigned" screen (S-0). Stop.
3. **1 site** → header chip shows that site with no dropdown, and all data is for that site.
4. **2+ sites, or All Sites scope** → chip has a dropdown listing *only* permitted sites (AC-05). Master Admin also gets "All sites (overview)". If no site has been chosen yet (first sign-in, or the remembered site is no longer permitted), the page shows a **Choose a site** prompt and loads no data (strict `siteId`, G-18).
5. Choose a site → every open list shows skeletons → new data loads → the chip and the page title's site line update together.
6. In All sites mode → rows show a site-code chip. Add, edit, upload, approve and export buttons are **disabled** with a tooltip "Select one site to make changes".
7. Blocked write (server 403) → error banner "This record belongs to another site. Nothing was changed." The list refreshes.
Screens: Header (all console pages), S-0, every list screen, Attendant header, Employee header.

### US-02 Onboard a site (Master Admin) — P0 [Phase 2]
Master Site Config → **+ Add site** → side drawer form (3 sections) → **Create site** → inline validation on blur and on submit (AC-13) → success toast; the drawer closes; the new site appears in the list, the site switcher and the user site-picker without reload (AC-12) → toast action "Add slots now" goes to Inventory Master with this site selected.
Screens: MasterAdminSites (list + drawer), Header switcher.

### US-03 Change site status — P0 [Phase 2]
Site row → **⋯ → Change status** → modal: status radio group (Active / On hold / Maintenance / Decommissioned) + **Reason** (required unless Active) → **Update status** → the row status chip updates → Attendant app at that site shows the status banner (§3.3, AC-14).
Decommissioned: an extra confirmation step asks the admin to type the site code.

### US-04 Users, roles, site assignment, suspend — P0 [Phase 2]
User & RBAC → **+ Add user** → drawer: Full name, Email, Phone, Role, Site scope (radio: *Specific sites* → multi-select checklist / *All sites* — only offered for roles allowed All Sites) → **Create user** → toast "User created. They can sign in with {email}."
Suspend: user row → **⋯ → Suspend** → confirm modal with optional reason → status chip turns Suspended. That user's next request lands on the sign-in screen with the Suspended message (AC-10).

### US-05 Slot inventory — P0 [Phase 2]
Inventory Master (site selected) → table of slots → **+ Add slot** (drawer) or **Upload CSV**.
CSV flow: **Upload CSV** → modal step 1 *Choose file* (drag-drop or browse, .csv only; link "Download template") → step 2 *Preview*: counts "{n} rows ready · {n} duplicates will be skipped · {n} rows have errors", with an error table (Row #, Slot number, Reason) → **Import {n} slots** → step 3 *Result*: Created / Skipped / Failed counts + **Download error report (CSV)**.
Non-CSV file → rejected at step 1, nothing written (AC-17).
Edit: row → drawer. Delete: row ⋯ → confirm. Delete is blocked for Occupied slots with the message "Slot is occupied. Record the exit first."

### US-06 Live floor plan — P0 [Phase 2]
Live Parking Status → summary strip (Total, Vacant, Occupied, Reserved, Maintenance) → level tabs (B1, B2, …) → slot grid → select a slot → detail panel (plate, entry time, duration, pass holder). Updates arrive live: a changed tile pulses once (respects reduced-motion). A **"Live · updated {n}s ago"** indicator sits next to the title; after 15 s with no update it turns amber with "Reconnecting…".
Empty site → empty state (AC-41).

### US-07 Vehicle entry (Attendant) — P0 [Phase 2 · see G-17]
Gate tab → **Scan plate** (camera) or **Type plate** → plate appears in the "Detected vehicle" card (editable) → **Check vehicle** → full-screen result, one of:
- **Allowed** (green): "Park in **B1-042**" + level/zone + pass holder name → **Confirm entry** → toast "Entry recorded · B1-042" → back to scanning.
- **Not authorised** (red): reason line (No pass at this site / Pass rejected / Pass revoked / Pass is for another site) → primary **Scan next vehicle**, secondary **Allow with override** → override sheet: Reason* (VIP / Emergency / Pass renewal pending / Other + note) → **Allow entry** stays disabled until a reason is chosen → the entry is recorded and assigned a slot like an Allowed entry; the success toast reads "Override entry recorded · B1-042", and the log row shows an amber **Override** chip (AC-20).
- **Already parked** (amber): "Already parked in B2-011 since 09:14" → **Record exit instead** / **Back** (AC-21).
- **Site full** (amber): "No vacant 4W slots" → **Back** (AC-22).
- **Invalid plate** (inline, not full-screen): field error, keyboard stays open (AC-23).
- **Site not active** (red banner, entry buttons disabled): AC-14.
Screens: GateTerminal, ManualEntryModal, result sheet (new).

### US-08 Vehicle exit — P0 [Phase 2 · see G-17]
Gate tab → mode toggle **Entry | Exit** → scan/type plate → **Find vehicle** → Checkout card: plate, slot, entry time, **Duration 3h 12m**, **Amount due ₹60** (paid sites only) + Payment mode (Cash / UPI / Card / Pass / Complimentary) → **Release slot** → toast "Exit recorded · B1-042 is free".
Not parked → "Vehicle not found on site" card with **Scan again** (AC-25).

### US-09 Employee registration — P0 [Phase 2]
Employee app first open → Welcome → **Register for a parking pass** → form: Site (select — only sites whose whitelisted domain matches the email are offered once the email is entered), Full name, Employee ID, Corporate email, Phone (+91), **Vehicles** (Vehicle 1 number + type required; **+ Add second vehicle** reveals Vehicle 2; the button is hidden once 2 are added, with the helper "A pass can hold up to 2 vehicles") → **Submit request** → status screen "Request sent — Pending" (AC-26).
Validation errors inline per field (AC-27). A non-whitelisted domain shows on the email field (AC-49). A third vehicle is not possible in the UI, and a server refusal shows "A pass can hold up to 2 vehicles" (AC-50).
Manage vehicles later: pass card ⋯ → **Vehicles** → **Add vehicle** / **Replace** / **Remove** (min 1). Added or replaced vehicle shows **Pending review** until the Site Admin approves it (assumption, OQ-4c — G-8).

### US-10 Approve / reject passes (Site Admin) — P0 [Phase 2]
Employee & Vehicle Approval → **Pending** tab (badge count) → table with checkboxes → per row **Approve** / **Reject**, or select rows → bulk bar "{n} selected · Approve · Reject" → Reject opens a modal with a required reason (AC-29) → toast "{n} requests approved".
**Approved** tab → row ⋯ → **Revoke pass** → modal with required reason → chip turns Revoked (AC-30).

### US-11 Employee pass status & digital pass — P0 [Phase 2]
Employee app home: **one card per pass** (one per site, US-25), newest first, each with site name as its heading —
- **Pending**: clock icon, "Waiting for {site} to review", submitted date.
- **Approved**: the digital pass card (§3.4) — name, plate(s) (large; with 2 vehicles, both plates listed and the QR covers the pass), site, valid until, QR, live clock + "Verified just now" line so a screenshot can be spotted.
- **Rejected**: reason shown + **Submit a new request**.
- **Revoked**: reason + "Contact your site administrator".
No registration → register prompt (AC-43).

### US-12 Entry/exit logs + export — P0 [Phase 2]
Entry / Exit Logs → filter bar: Date range (Today / 7 days / 30 days / Custom), Plate (search), Status (All / Parked / Exited / Exception) → **Apply** → table → **Export CSV** → the button spins "Preparing…" → file downloads as `ParkFlows_Logs_{SITECODE}_{from}_{to}.csv`. The exported columns match the table (AC-32). Export is hidden for Attendant (AC-08). No delete action exists on logs for any Site Admin (US-27, AC-53). Date ranges older than 1 year show "Records older than 1 year are archived. Ask your Master Admin."

### US-13 Domain whitelist (Master Admin) — P1 [Phase 2]
Site drawer → **Allowed email domains** section → chip input "add-domain.com" + **Add** → chips with ✕ → **Save**. Validation: "Enter a domain like company.com".

### US-14 Overstay / non-parked alerts (Site Admin) — P1 [Phase 2]
Non-Parked Alerts → tabs **Overstay** | **Not parked** → cards: plate, slot, time parked / flagged since, pass holder → **Mark resolved** (optional note). Sidebar badge = open alerts for the *current site* only. Overstay uses the site's limit (default 12 h, US-26); the tab header shows "Limit: 12 h · Change" (link to Site settings, Site Admin only). The owning Employee gets an in-app notification (AC-33; §3.4).

### US-15 Site reports — P1 [Phase 2]
Reports → date range → KPI cards (Utilisation %, Avg occupancy, Peak hour, Violations) → charts: Occupancy trend (line), Peak hours (bar by hour), Vehicle mix (2W/4W bar, not pie) → each chart has **View table** for accessibility and a CSV download.

### US-16 Invoices — P1 [Deferred (OQ-9)]
*Not a launch blocker; screens designed but not to be built until OQ-9 fixes the formulas and GST. The preview's formula line must be rewritten once the formulas exist.*
Billing → pick site + month → **Generate invoice** → preview (Base, Tax %, Total, formula line "Monthly flat ₹X" / "Slots × days × rate") → **Create invoice** → row with Unpaid chip → ⋯ **Mark as paid** (payment date, reference) → Paid chip.

### US-17 Relocation — P1 [Phase 2]
Attendant Gate → mode **Change slot** (existing option) → plate → current slot shown → pick from vacant slots of the same vehicle type (sorted by level) → **Reason** select (Stacker operation / Emergency / Wrong slot / Other + note) → **Move vehicle** → toast "Moved B1-042 → B1-051". The entry time is unchanged. The move shows in Relocation Logs (console).

### US-18 Audit log (Master Admin) — P1 [Phase 2]
Audit → filters (date, user, site, action type) → table → **Verify chain** → progress "Checking {n} records…" → result banner: green "Chain intact · {n} records verified" or red "Chain broken at record #{id} ({timestamp}) — records after this cannot be trusted" + **Jump to record**.

### US-19 Valet (Attendant) — P1 [Phase 2]
Valet board (mobile, and ValetX in console) → columns / filter chips: Checked in · Parked · Retrieval requested · Delivered → **+ Check in car** (plate, key tag, customer phone) → card → **Mark parked** (slot) → a retrieval request arrives: card moves to "Retrieval requested" with an amber highlight and an in-app sound/vibration → **Start retrieval** → **Mark delivered**. Each card shows timestamps per step.

### US-20 Employee requests valet retrieval — P1 [Phase 2]
Employee home → valet ticket card "Your car is parked · Ticket V-2031" → **Bring my car** → confirm sheet "Request your car now?" → status timeline updates: Requested → On the way → Ready at pickup.

### US-21 Overnight requests — P1 [Phase 2]
Employee: pass card ⋯ → **Request overnight parking** (date, reason). Site Admin: Reports → **Overnight requests** tab → Approve / Reject (reason required) → the employee sees the decision and the reviewer's name (AC-40).

### US-22 Custom roles — P2 [Phase 2]
User & RBAC → Roles tab → **+ New role** → Name, Module access (checkbox grid grouped by area), **Site scope policy** (Assigned sites only / All sites) → Save. On a user's per-user override screen, the site scope is shown **read-only** with the note "Site scope comes from the role and can't be widened here" (AC-11).

### US-23 Role simulator — P2, Master Admin only [Phase 1 banner / Phase 2 rest]
Header avatar menu (Master Admin only; hidden for all other roles, AC-52) → **View as…** → pick user (or role) + site → a purple banner fixed at the top: "Viewing as {user} · {role} · {site} — read-only. **Exit view**". All write buttons are disabled while simulating. **Reload keeps the simulated profile and the banner** (AC-55); **Exit view** returns to the Master Admin's own profile and site in one click. The same Master-Admin-only rule hides *Attack simulator* and *Clear history* in InfoSec & Privacy Defense.

### US-24 Predictive occupancy — P2 [Phase 2]
Predictive Analytics → forecast chart for the next 7 days with a confidence band. The label always says "Forecast", never shown as fact. A recommendation card, e.g. "Expect 92% at 10:00 Tue — consider opening Level B3", has a **Why?** disclosure.

### US-25 Passes at more than one site (Employee) — P0 [Phase 2]
Employee home → **+ Add a site** (shown only when at least one more site whitelists the employee's email domain) → Site picker listing only those sites → the registration form, pre-filled with name, ID, email and phone (vehicles can be copied from an existing pass with **Use my vehicles**) → **Submit request** → a new Pending card for that site appears next to the existing Approved card, which is unchanged (AC-48).
If no other site matches: the button is hidden. A direct attempt shows "Your email domain isn't allowed at {site}." (AC-49).
Site Admins see only their own site's request in Approvals (AC-48, AC-01).

### US-26 Site overstay limit (Site Admin) — P1 [Phase 2]
Sidebar → **Site settings** (new, Site Admin + Master Admin) → **Overstay limit** number field (hours, default 12, helper "Vehicles parked longer than this raise an alert.") → **Save** → toast "Overstay limit for {site} set to {n} hours. Applies from the next check." Invalid (≤ 0, empty, non-numeric) → "Enter a number of hours greater than 0." (AC-51). In All sites mode the page asks to choose a site. Attendant and Employee never see it.

### US-27 Record retention (Master Admin) — P1 [Phase 2]
- Logs, Audit and Relocation logs: no delete controls for Site Admin, anywhere (bulk menus included).
- Master Admin → Audit → **Archived records** tab (records older than 1 year): same filters and **Export CSV**, and a banner "Archived records are kept but hidden from daily screens and reports."
- Clear history (Master Admin, InfoSec page) → confirmation: "This clears demo and test data only. Records younger than 1 year are kept." Type **CLEAR** to confirm. Wording to be revisited when OQ-11c is decided (G-19).

### US-28 Android apps as APK files (Attendant / Employee) — P0 [Phase 2]
Same designs as §3.3 and §3.4. APK-specific UX:
- **First launch:** splash → **Sign in** → (Attendant) set a 4-digit PIN for quick unlock (existing `pinGate`) → site resolved → Gate tab. Employee: sign in with corporate email → Home.
- **Permissions**, asked just in time, never on first launch: Camera on the first **Scan plate** ("ParkFlows uses the camera to read number plates. Photos aren't stored."). Notifications (Employee) after the first pass is approved ("Get told when your pass is approved or your car overstays.").
- **Update available** (sideloaded APKs don't auto-update): a banner on the Home/Gate tab "A new version of ParkFlows is available. **Update**" opens the download link. If the version is too old, a blocking screen: "Update required to keep using ParkFlows." Distribution method is still open (OQ-14).
- **Settings / About** (⋯ menu): app version, site, **Privacy & terms**, **Sign out** / **End shift**.
- AC-54: every P0 story for the role works the same as on the web portal. No APK-only features.

### US-29 iOS and store builds — P1 [Phase 3]
Same designs. Platform differences only: use the iOS system back swipe instead of the Android back button, respect the safe areas (notch, home indicator) in the sticky header and tab bar, and word the permission prompts to App Store rules. The in-app "Update available" banner is removed on store builds (the store handles updates). No other UX changes (AC-56).

---

## 3. Screens & wireframes (text)

### 3.0 Shared shell (console)
```
┌ Sidebar (slate-900, 256/80 px) ┬ Header (white, h-20) ──────────────────────────────────┐
│ PARKFLOWS / Navigation         │ [≡] [P] ParkFlows   [🏢 Tech Park HQ  TPH ▾]  [⟳][🔔][👤]│
│ ─ modules (role-filtered) ─    ├──────────────────────────────────────────────────────────┤
│ • Home                         │ Page title                        [primary action]       │
│ • Live Parking Status  (Live)  │ TECH PARK HQ · updated 5s ago     (eyebrow, Barlow Cond.) │
│ • Inventory Master             │                                                          │
│ • Approvals            (3)     │  content                                                 │
│ …                              │                                                          │
│ ─ footer ─                     │                                                          │
│ Priya Nair                     │                                                          │
│ SITE ADMIN · Tech Park HQ      │                                                          │
└────────────────────────────────┴──────────────────────────────────────────────────────────┘
```
- **Site chip is always visible** (G-11): below 1024 px it shrinks to `[🏢 TPH ▾]`; tapping opens the same popover as a bottom sheet.
- Sidebar footer: drop the "System healthy / 100% uptime" copy (G-12). Keep the user block. Add a real connection line only if the architect can supply one ("Connected" / "Reconnecting…").
- Sidebar item descriptions: remove site-specific numbers ("1,080 slot…") → "Slots, levels & bulk upload".
- In All sites mode the header chip reads **All sites** with a globe icon and the page eyebrow reads **ALL SITES · {n} sites**.
- **Choose a site prompt** [Phase 1, L-3]: when a multi-site user has no site selected, the content area shows a centred card: MapPin icon · "Choose a site to see its data" · a list of permitted sites as buttons (plus **All sites** for Master Admin). No data calls until a choice is made.
- **Simulation banner** [Phase 1, L-8]: a full-width purple (`bg-purple-700`, white text) bar above the header, `role=status`: "Viewing as {user} · {role} · {site} — read-only" + **Exit view** button. Stays after reload.

### 3.1 Role-specific navigation (what each role sees)
| Module | Master Admin | Site Admin | Attendant | Employee |
|---|---|---|---|---|
| Home, Live Parking Status, Inventory Master, Logs, Alerts, Reports, Approvals | ✓ (any site) | ✓ (own sites) | – | – |
| Site settings (overstay limit) | ✓ (read in site drawer; edit on the page) | ✓ (own sites) | – | – |
| Master Site Config, User & RBAC, Billing, Audit, Archived records | ✓ | – | – | – |
| InfoSec tools: attack simulator, clear history, View as… | ✓ | – | – | – |
| ValetX (console) | ✓ | ✓ | – | – |
| Attendant app (mobile) | preview | preview | ✓ | – |
| Employee app (mobile) | preview | preview | – | ✓ |
"Preview" opens the app in a phone frame, labelled **Preview — actions are disabled** (G-2).

### 3.2 Web console screens (S-0, S-NA and the Choose-a-site prompt are Phase 1; the rest Phase 2)
**S-0 No site assigned** (AC-44): centred card, Building2 icon, title, body, **Sign out** button. No sidebar modules and no data calls.

**S-NA No access** (AC-07/08): lock icon · "You don't have access to this page" · "Ask your administrator if you need it." · **Go to Home**.

**Master Site Config — list**
```
Master Site Config                                   [+ Add site]
[Search facilities: Site code, city or contact____] [Status: All ▾]
┌──────────────────────────────────────────────────────────────────┐
│ Site            Code   City       Capacity   Billing    Status    ⋯│
│ Tech Park HQ    TPH    Bengaluru  820 4W·260 2W Monthly flat ●Active ⋯│
│ Alphatech       ALP    Pune       300 4W     Per slot/day ●On hold ⋯│
└──────────────────────────────────────────────────────────────────┘
```
**Add / Edit site drawer** (right, 480 px, sticky footer):
- *Basics*: Site name*, Site code* (uppercase, 2–8 chars), Facility type* (Office park / Mall / Hospital / Residential / Other), Address*, City*, Contact person, Contact email, Contact phone.
- *Capacity*: 4-wheeler slots*, 2-wheeler slots*, Levels, ☐ Puzzle/stacker parking, ☐ EV charging. Overstay limit is shown read-only ("12 hours · set by the Site Admin"). New sites start at 12 hours.
- *Billing*: Billing type* (Monthly flat / Per slot per day / Usage tier), Rate (₹)*, Tax (%)*, and for paid parking at the gate: Hourly rate, Daily max.
- *Allowed email domains* (US-13).
- Footer: [Cancel] [Create site / Save changes].

**Change status modal** — radio list with a one-line explanation under each status:
Active — "Normal operation" · On hold — "No new entries. Exits still allowed." · Maintenance — "No new entries. Exits still allowed." · Decommissioned — "Site is closed and read-only. This can't be undone." Reason textarea*. [Cancel] [Update status].

**User & RBAC — Users tab**: filter row (Search / Role / Status) → table (Name, Email, Role, Sites, Status, Last sign-in, ⋯). The drawer fields are in §2 US-04. The site scope checklist has a search box and "Select all" when there are more than 8 sites.

**Inventory Master**
```
Inventory Master · TECH PARK HQ           [Download template] [Upload CSV] [+ Add slot]
[Level: All ▾] [Vehicle: All ▾] [Slot type: All ▾] [Search slot no.__]
Slot no.  Level  Zone/location   Vehicle  Slot type  Height  Status     ⋯
B1-042    B1     Near lift A     4W       Standard   2.1 m   ●Vacant    ⋯
```
In All sites mode: buttons disabled, with the banner "Select one site in the header to add or upload slots."

**CSV upload modal** (3 steps, stepper at top):
```
① Choose file ── ② Review ── ③ Done
[ Drop a .csv file here or  Browse ]      Max 5,000 rows · Download template
──────────── step 2 ────────────
✔ 412 rows ready   ⤼ 6 duplicates will be skipped   ✖ 3 rows have errors
Row  Slot no.  Problem
14   —         Slot number is missing
88   B2-017    Vehicle type "3W" is not valid. Use 2W or 4W.
[Back]                                     [Import 412 slots]
──────────── step 3 ────────────
Created 412 · Skipped 6 · Failed 3        [Download error report] [Done]
```

**Live Parking Status (LiveFloorPlan)**
```
Live Parking Status                      ● Live · updated 3s ago
TECH PARK HQ
[Total 820][Vacant 311][Occupied 470][Reserved 25][Maintenance 14]   ← each tile filters grid
[B1][B2][B3][Ground]                     [Vehicle: All ▾] [Legend ⓘ]
┌────┬────┬────┬────┐
│042 │043 │044 │045 │   tile: slot no. + status colour + icon (✓ / car / lock / wrench)
│KA05│    │    │ 🔧 │   occupied tile shows short plate + entry time
└────┴────┴────┴────┘
Slot detail panel (right): Slot B1-042 · Occupied · KA05MN1234 · In at 09:14 (3h 12m) · Pass: Rahul S. · [View log]
```
Status is never shown by colour alone: every tile has an icon and the detail panel has the text.

**Approvals**
```
Employee & Vehicle Approval · TECH PARK HQ
[Pending (3)] [Approved] [Rejected] [Revoked]        [Search name, ID or plate]
☐ | Name        Emp ID   Email               Vehicle     Submitted   Actions
☐ | Rahul S.    E1043    rahul@techpark.com   KA05MN1234  2 days ago  [Approve][Reject]
── bulk bar (when ≥1 selected): 2 selected · [Approve] [Reject] [Clear] ──
```
Requests older than 2 working days show an amber "Waiting 3 days" chip (supports the PRD success metric).

**Entry / Exit Logs**: filter bar (§2 US-12) + table (Plate, Pass holder, Slot, Entry, Exit, Duration, Amount, Payment, Status, Gate user) + **Export CSV**. The row count sits above the table ("Showing 128 entries · 1–7 Sep").

**Site settings** (Site Admin, US-26)
```
Site settings · ALPHATECH
┌ Overstay ───────────────────────────────────────────┐
│ Overstay limit (hours) *   [ 12 ]                    │
│ Vehicles parked longer than this raise an alert,     │
│ and the driver is told in the Employee app.          │
│                                          [ Save ]    │
└──────────────────────────────────────────────────────┘
```

**Audit → Archived records** (Master Admin, US-27): same table as Audit + banner "Records older than 1 year. Kept for disputes and audits, hidden from daily screens and reports." + **Export CSV**. No delete.

**Approvals — vehicle changes** (US-09, OQ-4c assumption): an extra filter chip **Vehicle changes** in the Pending tab lists added or replaced vehicles on approved passes. The row shows "Adds 2nd vehicle MH12AB3456 to Rahul S.'s pass" with **Approve** / **Reject**.

**Entry / Exit Logs — override rows**: an amber **Override** chip in the Status column. Hovering or focusing it shows the reason and attendant name. Filter Status → **Override**.

**Alerts, Reports, Billing, Audit, ValetX, Roles**: these use the same list-page pattern (title + site eyebrow, filter row, cards or table, row ⋯ menu, right drawer for details). The specific content is in §2.

### 3.3 Attendant app (src/mobile) [Phase 2; the result sheet is a Phase 1 candidate, G-17]
```
┌──────────────────────────────────────────┐
│ [P] Gate Terminal            ●SYNCED  [⋯]│  header: title + "Ravi K · TECH PARK HQ"
│     RAVI K · TECH PARK HQ                │  ⋯ = Manual entry, Privacy & terms, End shift
├──────────────────────────────────────────┤
│ [ Entry | Exit | Change slot ]  segmented│  ≥ 44 px tall
│ ┌──────── camera 4:5 ──────────┐         │
│ │   [ plate guide box ]        │         │
│ │   KA 05 MN 1234              │         │
│ └──────────────────────────────┘         │
│ DETECTED VEHICLE                          │
│ [ KA05MN1234            ✎ ]              │  editable field
│ [        Check vehicle        ]  primary │  56 px
│ Basement occupancy  B1 ▓▓▓░ 82%  B2 …    │
├──────────────────────────────────────────┤
│   [Gate]      [Slots]      [Levels]      │  labelled tab bar with icons, 56 px (replaces 8 px dots, G-13)
└──────────────────────────────────────────┘
```
- Header buttons move into a **⋯** menu (Manual entry, Privacy & terms, End shift) so each touch target can be 44 px. "End shift" asks for confirmation.
- The sync pill has three states: **SYNCED** (green), **NO NETWORK** (red), **SERVER ERROR** (amber) (G-15).
- **Site status banner** (AC-14), fixed under the header when the site isn't Active: red "Site on hold — new entries are paused. Exits are allowed." Entry mode is disabled; Exit still works.

**Gate result sheet** (full-height sheet over the Gate tab):
```
ALLOWED (green #059669 bg tint, ✓ 48 px)    NOT AUTHORISED (red, ✕)          ALREADY PARKED (amber, !)
KA05MN1234                                  KA05MN1234                       KA05MN1234
Park in                                     No pass at this site             Already in B2-011
  B1-042   (40 px bold)                     This vehicle isn't registered    since 09:14
Level B1 · Near lift A                      for Tech Park HQ.
Pass: Rahul S. · 4W                         [ Scan next vehicle ] primary    [ Record exit instead ]
[ Confirm entry ]  primary                  [ Allow with override ]         [ Back ]
[ Cancel ]                                 
```
**Override sheet** (every Attendant; secondary action only): Reason* (VIP / Emergency / Pass renewal pending / Other) + Note (required for Other) → **Allow entry** (disabled until a reason is chosen) → slot assigned as for Allowed. Footer note: "Overrides are recorded with your name."

**Checkout card (Exit)**: plate, slot, entry time, duration, amount due (paid sites), payment-mode chips, **Release slot**.

**Slots / Levels tabs**: keep the current layout. Tiles get status icons, and the Levels summary rows become buttons of at least 44 px.

**Valet board (mobile)**: filter chips by status plus cards (plate, key tag, slot, time in step, primary next-step button).

### 3.4 Employee app (mobile, same shell as 3.3) [Phase 2]
```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ [P] My parking               │   │ DIGITAL PASS                 │
│     TECH PARK HQ             │   │ ┌──────────────────────────┐ │
├──────────────────────────────┤   │ │ Rahul Sharma      ●Active│ │
│ ┌ Pass card ───────────────┐ │   │ │ KA 05 MN 1234 (28 px mono)│ │
│ │ ● Approved               │ │   │ │ Tech Park HQ · 4W        │ │
│ │ KA05MN1234 · Tech Park HQ│ │   │ │ Valid until 31 Mar 2027  │ │
│ │ [ Show pass ]            │ │   │ │      [ QR 200px ]        │ │
│ └──────────────────────────┘ │   │ │ 10:42:18 · Verified now  │ │  live clock = anti-screenshot cue
│ ┌ Valet ticket (if any) ───┐ │   │ └──────────────────────────┘ │
│ │ Parked · V-2031          │ │   │ Screen brightness raised     │
│ │ [ Bring my car ]         │ │   │ [ Done ]                     │
│ └──────────────────────────┘ │   └──────────────────────────────┘
│ [Home] [Requests] [🔔 2] [Me] │
└──────────────────────────────┘
```
**Several passes** (US-25): Home stacks one pass card per site; each card heading is the site name. **+ Add a site** sits under the last card (only if another site matches the email domain). The digital pass lists both plates when the pass has 2 vehicles.

**Vehicles sheet** (pass ⋯ → Vehicles): up to 2 rows (plate, 2W/4W, status chip Approved / Pending review) · **Add vehicle** (hidden at 2, with helper "A pass can hold up to 2 vehicles") · **Replace** · **Remove** (disabled on the last vehicle: "A pass needs at least one vehicle").

**Notifications** (🔔 tab, G-20, AC-33): a list with the newest first. Kinds: pass approved / rejected / revoked, vehicle change decided, overnight request decided, **overstay** ("Your car KA05MN1234 has been parked at Alphatech for over 12 hours."), valet status. Unread items are bold and the tab badge shows the count. In-app only in v1.
**Registration form**: one column; the fields are in §2 US-09. Phone has a fixed "+91" prefix; the vehicle number is uppercased as you type and shown in plate format; Corporate email uses `inputmode=email`. **Submit request** is a sticky bottom button.

---

## 4. States: loading / empty / error / success / no-permission / offline

| Screen | Loading | Empty | Error | Success | No permission | Offline |
|---|---|---|---|---|---|---|
| Any console list | Skeleton rows (5); on site switch the old rows are cleared first | Per-screen empty card (copy §5) | Inline error card + **Try again**; stale data greyed out, never shown as current | Toast, 4 s, bottom-right | S-NA page; entry points hidden | Top banner "You're offline. Changes can't be saved." — write buttons disabled |
| Header site switcher | Chip shimmer | 0 sites → S-0 | "Couldn't load your sites" + retry | Chip updates + page eyebrow | Dropdown lists only permitted sites | Keeps last site; switching disabled |
| Live floor plan | Grey tiles | "No slots yet for {site}" + Add slot / Upload CSV (AC-41) | "Live updates paused" amber pill + retry | Tile pulse on change | S-NA | Amber "Reconnecting…"; last update time shown |
| Inventory CSV | "Reading file…" / "Importing 412 slots…" progress bar | — | File rejected (non-CSV / empty / too big), row error table | Result step with counts | Upload hidden (Attendant) | Import button disabled |
| Approvals | Skeleton | "No pending requests for {site}" (AC-42) | Row-level error "Couldn't approve Rahul S. Try again." | Toast + row leaves Pending | S-NA | Buttons disabled |
| Logs / export | Skeleton / "Preparing…" | "No entries between {from} and {to}" | "Export failed. Try again." | File download + toast | Export hidden | Disabled |
| Reports | Chart skeletons | "No parking activity in this range" | Per-chart error card | — | S-NA | Disabled |
| Attendant Gate | "Checking…" on button (button disabled, no double-submit) | — | Result sheet variants; server error sheet "Couldn't reach the server. **Nothing was recorded.**" + **Try again** (AC-45) | Green toast "Entry recorded · B1-042" + haptic | Modes the role lacks are hidden | Red **NO NETWORK** pill; Check/Confirm/Release disabled; banner "You're offline. Entries and exits can't be recorded." (AC-46). (no queue in v1, OQ-7) |
| Employee home | Card skeleton | No registration → Welcome + **Register** (AC-43) | "Couldn't load your pass" + retry | "Request sent" screen | Other people's data never shown; direct link → "This pass isn't yours" | Last loaded pass shown with "Offline · last updated {time}"; QR hidden (can't be verified) |
| Choose-a-site prompt [Phase 1] | — | Shown instead of data when no site is chosen | "Couldn't load your sites" + retry | Site chosen → normal page loads | Only permitted sites listed | — |
| Simulation banner [Phase 1] | — | — | "Couldn't start the view. Try again." | Banner appears; kept on reload | Menu item hidden for non–Master Admin (AC-52) | — |
| Site settings | Field skeleton | — | "Couldn't save the limit. Nothing was changed." | Toast "Overstay limit … set to {n} hours" | Hidden for Attendant/Employee; S-NA on deep link | Save disabled |
| Employee notifications | List skeleton | "No notifications yet." | "Couldn't load notifications" + retry | Unread badge clears on open | Own notifications only | Last loaded list + "Offline" line |
| Archived records | Skeleton | "No archived records in this range." | Error card + retry | Export download | Master Admin only | Disabled |
| APK update check [Phase 2] | — | — | Check fails silently (retry next launch) | Update banner / blocking "Update required" | — | Skipped while offline |
| Session expired (all) | — | — | Sign-in screen with notice "Your session ended. Sign in to continue." Afterwards: same page and site context (AC-47) | — | — | — |
| Suspended user | — | — | Sign-in error "Your account is suspended. Contact your administrator." (AC-10) | — | — | — |

---

## 5. UI copy (labels, buttons, messages)
Tone: plain, short, active voice, sentence case (Barlow Condensed eyebrows stay uppercase). Say what happened and what to do next. Never blame the user.

**Global**
| Key | Copy |
|---|---|
| Site chip (single site) | {Site name} · {CODE} |
| Site chip (all) | All sites |
| Switcher heading | Switch site |
| All-sites write disabled tooltip | Select one site to make changes |
| Cross-site 403 | This record belongs to another site. Nothing was changed. |
| No site assigned — title / body | No site assigned / Your account isn't linked to a site yet. Contact your administrator. |
| No access — title / body | You don't have access to this page / Ask your administrator if you need it. |
| Generic load error | We couldn't load this. Check your connection and try again. **[Try again]** |
| Generic save error | Couldn't save. Nothing was changed. **[Try again]** |
| Offline banner (console) | You're offline. Changes can't be saved until you reconnect. |
| Session expired | Your session ended. Sign in to continue. |
| Suspended | Your account is suspended. Contact your administrator. |
| Choose a site prompt | Choose a site to see its data |
| Simulation banner | Viewing as {user} · {role} · {site} — read-only **[Exit view]** |
| Archived range note | Records older than 1 year are archived. Ask your Master Admin. |

**Master Admin**
| Key | Copy |
|---|---|
| Add site button / drawer title | + Add site / New site |
| Create button | Create site |
| Site created toast | {Site name} is live. **[Add slots now]** |
| Required field | Enter {field name}. |
| Duplicate code | Code {CODE} is already used by {Site name}. |
| Capacity/rate invalid | Enter a number of 0 or more. |
| Status modal title | Change site status |
| Reason label | Reason (shown to site admins) |
| Decommission confirm | Type {CODE} to confirm. This can't be undone. |
| Status updated toast | {Site name} is now {status}. |
| User created toast | User created. They can sign in with {email}. |
| Suspend confirm | Suspend {name}? They'll be signed out straight away and can't sign in until you reactivate them. **[Suspend user]** |
| Role scope note | Site scope comes from the role and can't be widened here. |
| Domain input error | Enter a domain like company.com |
| Invoice generate / created | Generate invoice / Invoice {number} created for {Site name}, {Month}. |
| Mark paid | Mark as paid |
| Archived records banner | Records older than 1 year. Kept for disputes and audits, hidden from daily screens and reports. |
| Clear history confirm | This clears demo and test data only. Records younger than 1 year are kept. Type CLEAR to confirm. **[Clear history]** |
| Overstay (site drawer, read-only) | {n} hours · set by the Site Admin |
| Verify chain / ok / broken | Verify chain / Chain intact · {n} records verified / Chain broken at record {id} ({time}). Records after this can't be trusted. |

**Site Admin**
| Key | Copy |
|---|---|
| Inventory empty | No slots yet for {site}. Add slots one by one or upload a CSV. **[Upload CSV] [+ Add slot]** |
| CSV wrong file | That file isn't a CSV. Choose a .csv file. Nothing was imported. |
| CSV summary | {n} rows ready · {n} duplicates will be skipped · {n} rows have errors |
| CSV row errors | Slot number is missing · Vehicle type "{x}" is not valid. Use 2W or 4W. · Slot {no} appears twice in this file. |
| CSV import button / done | Import {n} slots / Created {n} · Skipped {n} · Failed {n} |
| Delete occupied slot | Slot is occupied. Record the exit first. |
| Approvals empty | No pending requests for {site}. |
| Approve toast | {n} request(s) approved. |
| Reject modal | Reject {n} request(s)? · Reason (the employee will see this)* · **[Reject]** |
| Reason missing | Enter a reason. |
| Revoke modal | Revoke {name}'s pass? {plate} won't be let in from the next scan. · Reason* · **[Revoke pass]** |
| Logs empty | No entries between {from} and {to}. |
| Export button / busy | Export CSV / Preparing… |
| Alerts empty | No open alerts for {site}. |
| Reports empty | No parking activity in this date range. |
| Live stale | Reconnecting… last update {time} |
| Site settings title / field / helper | Site settings / Overstay limit (hours) / Vehicles parked longer than this raise an alert, and the driver is told in the Employee app. |
| Overstay saved | Overstay limit for {site} set to {n} hours. Applies from the next check. |
| Overstay invalid | Enter a number of hours greater than 0. |
| Override chip / tooltip | Override / {reason} · by {attendant}, {time} |
| Vehicle change row | Adds vehicle {plate} to {name}'s pass · Replaces {old} with {new} on {name}'s pass |

**Attendant**
| Key | Copy |
|---|---|
| Modes | Entry · Exit · Change slot |
| Plate field label / placeholder | Vehicle number / e.g. KA05MN1234 |
| Primary (entry) | Check vehicle → Confirm entry |
| Allowed | Park in {slot} |
| Not authorised headings | No pass at this site · Pass rejected · Pass revoked · Pass is for {other site name}* |
| Not authorised body | Don't let this vehicle in. Ask the driver to contact their site administrator. |
| Override button / sheet | Allow with override / Why are you letting this vehicle in?* · Overrides are recorded with your name. |
| Already parked | Already parked in {slot} since {time}. |
| Site full | No vacant {2W/4W} slots. Direct the driver to overflow parking. |
| Invalid plate | That doesn't look like a valid number plate. Check and edit it. |
| Site not active | Site {status} — new entries are paused. Exits are allowed. |
| Entry success | Entry recorded · {slot} |
| Override success | Override entry recorded · {slot} |
| Exit find / release | Find vehicle / Release slot |
| Exit summary | Duration {h}h {m}m · Amount due ₹{amount} |
| Not found | Vehicle not found on site. Check the number and try again. |
| Exit success | Exit recorded · {slot} is free |
| Move button / success | Move vehicle / Moved {from} → {to} |
| Offline | You're offline. Entries and exits can't be recorded. |
| Server error | Couldn't reach the server. Nothing was recorded. **[Try again]** |
| End shift confirm | End your shift? You'll be signed out. **[End shift]** |
| Camera permission (APK) | ParkFlows uses the camera to read number plates. Photos aren't stored. |
| Update available / required (APK) | A new version of ParkFlows is available. **[Update]** / Update required to keep using ParkFlows. **[Update]** |

\*The attendant sees the other site's *name*, not its data. The architect can confirm this is acceptable under US-01; if not, fall back to "Pass is not valid here".

**Employee**
| Key | Copy |
|---|---|
| Welcome | Park without the paperwork. Register your vehicle to get a digital pass. **[Register for a parking pass]** |
| Field labels | Site · Full name · Employee ID · Corporate email · Phone number · Vehicle 1 number · Vehicle 1 type · Vehicle 2 number (optional) · Vehicle 2 type |
| Add vehicle / limit | + Add second vehicle / A pass can hold up to 2 vehicles |
| Remove last vehicle | A pass needs at least one vehicle. |
| Vehicle pending | Pending review — you can keep using {other plate} meanwhile. |
| Add a site | + Add a site / Use my vehicles |
| Submit | Submit request |
| Domain not allowed | Your email domain isn't allowed at {site}. Use your company email. |
| Duplicate vehicle | {plate} is already on someone else's active pass at {site}. |
| Phone invalid | Enter a 10-digit mobile number. |
| Submitted | Request sent. {site} usually reviews requests within 2 working days. |
| Pending / Approved / Rejected / Revoked chips | Pending review · Approved · Rejected · Revoked |
| Rejected body | Reason: {reason} **[Submit a new request]** |
| Revoked body | Your pass was revoked: {reason}. Contact your site administrator. |
| Pass footer | Verified {time} |
| Offline pass | Offline · last updated {time}. Your QR will show when you're back online. |
| Valet request | Bring my car → Request your car now? **[Request car]** |
| Valet timeline | Requested · On the way · Ready at pickup |
| Overstay notification | Your car {plate} has been parked at {site} for over {n} hours. |
| Notifications empty | No notifications yet. |
| Notification permission (APK) | Get told when your pass is approved or your car overstays. |

---

## 6. Accessibility notes
- **Contrast (WCAG AA):** body text ≥ 4.5:1. Replace mobile `faint #8b95a6` with `muted #64748b` for any text people need to read (≈4.6:1 on `#f5f6f8`); keep `faint` for decoration only. Status chips already pass (800-on-100 Tailwind pairs). Gate result screens use white text on `#047857` / `#be123c` / `#b45309`, all ≥ 4.5:1.
- **Not colour alone:** slot tiles, status chips and gate results always pair colour with an icon and text.
- **Touch targets:** every mobile control ≥ 44×44 px. Gate primary buttons 56 px. Replace the 8 px dot tabs with a labelled tab bar. Header actions go into a ⋯ menu.
- **Forms:** every input has a visible `<label htmlFor>` (G-14). Required fields are marked "*" and use `aria-required`. Errors sit under the field, are linked with `aria-describedby`, and use `aria-invalid`. On submit failure, focus moves to the first invalid field.
- **Keyboard (console):** all actions reachable by Tab. Visible focus ring `ring-2 ring-blue-500 ring-offset-2`. The site switcher is a proper listbox (↑/↓, Enter, Esc; focus returns to the chip). Drawers and modals trap focus, close on Esc, and return focus to the button that opened them. Floor-plan grid: arrow keys move between tiles, Enter opens the detail.
- **Screen readers:** toasts, CSV results and sync status use `aria-live="polite"`. Gate results and blocking errors use `role="alert"`. Each slot tile's label is "Slot B1-042, occupied, KA05MN1234 since 09:14". Charts include **View table**.
- **Motion:** tile pulses, skeleton shimmer and sheet slides respect `prefers-reduced-motion`.
- **Gate conditions:** result text ≥ 20 px, plate ≥ 24 px mono, readable in sunlight. Haptic feedback on success and error so attendants don't have to look at the screen.
- **Language:** plates are shown with spaces (KA 05 MN 1234) for reading and stored without spaces. Dates use the Indian format "25 Sep 2026, 09:14"; currency uses ₹ with the Indian digit grouping (₹1,20,000).

---

## 7. Traceability: element → story / AC
| Screen element | Story | AC |
|---|---|---|
| Always-visible site chip + eyebrow on every page; skeleton-on-switch | US-01 | AC-01, AC-04 |
| Switcher lists only permitted sites; "All sites" only for All-Sites scope | US-01 | AC-05 |
| Site-code chip per row in All sites mode; writes disabled until one site is picked | US-01 | AC-04 |
| Cross-site 403 banner "belongs to another site"; Choose-a-site prompt (no silent default) | US-01 | AC-02, AC-03 |
| Attendant header site name; Employee app shows only own passes | US-01 | AC-06, AC-09 |
| Role-filtered Sidebar/Home tiles; S-NA No-access page; preview-only mobile apps | US-02..04, 13, 16, 22 | AC-07, AC-08 |
| Suspend modal + suspended sign-in message | US-04 | AC-10 |
| Role scope read-only note on per-user override | US-22 | AC-11 |
| Add site drawer + instant appearance in switcher/user picker | US-02 | AC-12 |
| Inline field validation (required, duplicate code, numeric) | US-02 | AC-13 |
| Change status modal; Attendant site status banner, entry disabled / exit allowed | US-03 | AC-14 |
| Add user drawer with role + site scope | US-04 | AC-15 |
| CSV modal: preview counts, duplicates skipped, result counts | US-05 | AC-16 |
| CSV row error table, non-CSV rejection | US-05 | AC-17 |
| Floor plan grid, live indicator, tile pulse, slot detail | US-06 | AC-18 |
| Gate "Allowed · Park in {slot}" sheet + Confirm entry | US-07 | AC-19 |
| Gate "Not authorised" sheet + override sheet (reason mandatory) + Override chip on log rows | US-07 | AC-20 |
| Gate "Already parked" sheet | US-07 | AC-21 |
| Gate "Site full" sheet | US-07 | AC-22 |
| Inline invalid-plate error, editable plate field | US-07 | AC-23 |
| Checkout card (duration, amount, payment mode) + Release slot | US-08 | AC-24 |
| "Vehicle not found on site" card | US-08 | AC-25 |
| Employee registration form (1–2 vehicles) + "Request sent" | US-09 | AC-26 |
| Field errors: domain, duplicate vehicle, phone/plate | US-09, US-13 | AC-27 |
| Approvals Approve (single/bulk) | US-10 | AC-28 |
| Reject modal with required reason | US-10 | AC-29 |
| Revoke pass modal; Revoked tab/chip | US-10 | AC-30 |
| Digital pass card (name, plate, site, validity, QR, live clock) | US-11 | AC-31 |
| Logs filter bar + Export CSV matching table columns | US-12 | AC-32 |
| Domain whitelist chip input | US-13 | AC-27 |
| Alerts tabs Overstay / Not parked, per-site badge, limit link; Employee overstay notification | US-14, US-26 | AC-33 |
| Reports KPIs + charts + View table | US-15 | AC-34 |
| Invoice generate preview with formula line + Mark as paid (deferred, OQ-9) | US-16 | AC-35 |
| Change slot mode with reason; Relocation Logs | US-17 | AC-36 |
| Audit table + Verify chain result banner | US-18 | AC-37, AC-38 |
| Valet board status columns with timestamps | US-19 | AC-39 |
| Employee "Bring my car" + status timeline | US-20 | AC-39 |
| Overnight request (employee) + review tab (admin) with reviewer shown | US-21 | AC-40 |
| Custom role editor with site scope policy | US-22 | AC-11 |
| "View as…" in Master Admin menu only; attack simulator / clear history hidden for others | US-23 | AC-52 |
| Fixed "Viewing as {user}" banner kept on reload + one-click Exit view | US-23 | AC-55 |
| Forecast chart + recommendation card labelled "Forecast" | US-24 | — |
| Empty states for Live Slots / Inventory | US-05, US-06 | AC-41 |
| Empty states for Approvals, Logs, Alerts, Reports | US-10, 12, 14, 15 | AC-42 |
| Employee Welcome / Register prompt | US-11 | AC-43 |
| S-0 No site assigned | all | AC-44 |
| Error card + Try again; "Nothing was recorded" on gate server error | all | AC-45 |
| NO NETWORK pill + disabled gate actions + offline banner | US-07, US-08 | AC-46 |
| Session-expired sign-in notice, return to same page + site | all | AC-47 |
| **+ Add a site** (only matching-domain sites), one pass card per site, Site Admin sees own site's request only | US-25 | AC-48 |
| "Your email domain isn't allowed at {site}" error; button hidden when no site matches | US-25 | AC-49 |
| Vehicles sheet: up to 2, Add hidden at 2, limit message; both plates on pass | US-09 | AC-50 |
| Site settings → Overstay limit (default 12, validation, Site Admin only) | US-26 | AC-51 |
| No delete on logs/audit for Site Admin; Archived records tab (Master Admin); clear-history confirmation | US-27 | AC-53 |
| APK first launch, just-in-time permissions, update banner / required screen, About | US-28 | AC-54 |
| iOS platform differences only (safe areas, back swipe, no update banner) | US-29 | AC-56 |

**Roles covered:** Master Admin (US-02–04, 13, 16, 18, 22, 23, 27 + US-01), Site Admin (US-05, 06, 10, 12, 14, 15, 21, 24, 26 + US-01), Attendant (US-07, 08, 17, 19, 28, 29 + US-01), Employee (US-09, 11, 20, 21, 25, 28, 29 + US-01). **All 29 stories and all 56 AC are mapped.** Phase 1 covers US-01 and the US-23 banner; the rest is Phase 2/3 or deferred (§0).

**Hand-off notes for architect (no API/data choices made here):** needs from the data model — a Revoked pass state (G-3), a site status list matching G-1, billing type (G-4), a per-site overstay limit (G-9), an authorisation result *reason* on entry checks (so the gate can show the four "Not authorised" variants), a way to tell network errors from server errors on mobile (G-15), and a live-update mechanism that can show "updated {n}s ago". Added in v1.1: the entry-check result must say whether it was an **override** (with reason) so logs can show the chip; a per-vehicle approval state if OQ-4c needs re-approval; a list of sites whose domain matches an email (for **+ Add a site**); an Employee notification feed (G-20); a way to keep the simulated profile across reload (AC-55); an archive flag or view for records older than 1 year; and a minimum-supported-version check for sideloaded APKs. **Phase 1 needs only L-1 to L-8 (§0).** Please also settle G-17 (gate feedback at Alphatech on 1 Oct) with PM/QA before approving the tech design.

Status: READY FOR TECH DESIGN (v1.1, aligned to approved PRD v1.2)
