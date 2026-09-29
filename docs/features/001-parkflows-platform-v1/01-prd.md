# PRD — ParkFlows Platform v1 (baseline product PRD)
Feature ID: 001 · Author: product-manager · Date: 2026-09-25 · Revision: v1.2 (2026-09-25, second round of user answers: OQ-13, OQ-12b, OQ-5b, OQ-4b, OQ-6b, OQ-10b, OQ-11b)

## Gaps found in inputs
1. ~~**Ambiguous brief.**~~ *Resolved (OQ-1): user confirmed this is the whole-product v1 baseline.* The task was "Write the PRD for: ParFlows" (read as *ParkFlows*). No single feature was named, and `docs/features/` was empty. This PRD is written as the **product-level v1 baseline**: it defines what ParkFlows must do for each role at launch, so later features (002+) can be scoped against it. If a narrower feature was intended, see OQ-1.
2. **Docs disagree with code.** `ARCHITECTURE.md` §3 lists routes that no longer exist (`/api/v1/parking/entry|exit`, `/api/v1/valet/tasks`, `/api/v1/employees/register|approve`, `/api/v1/audit/logs`, `/api/v1/analytics/dashboard`); the live routes in `server.ts` are `/vehicles/entry|exit|scan-plate`, `/valet/checkin|status|request-retrieval`, `/registrations/*`, `/security/audit-logs`, `/reports/*`, etc. README says React 18 and "Digi-Parking PMS"; `CLAUDE.md` says React 19 and ParkFlows. Architect should treat `server.ts` as source of truth and refresh the docs.
3. **Known isolation bug not deployed.** `KNOWN_ISSUES.md`: site-scoping fix (commit `2472379`) is not deployed; `admin.parkflows.in` still serves cross-site data on Inventory Master. Other screens that read `App.tsx` state may still be unscoped. This PRD makes site isolation a P0 launch blocker (US-01, AC-01..AC-06).
4. ~~**Unscoped endpoints by design?**~~ *Resolved (OQ-3): server must reject list calls without `siteId`.* `GET /api/v1/slots`, `/employees`, `/logs`, `/alerts/non-parked`, `/registrations` return all sites when `siteId` is omitted. Whether the server (not just the client) must enforce scope is an Open Question (OQ-3), but the AC below assume **server-enforced** scope.
5. **Role model mismatch.** Product docs name 4 roles (Master Admin, Site Admin, Attendant, Employee); code supports configurable roles (`RolePermissionConfig`, e.g. `SUPER_ADMIN`, `SITE_MANAGER`, `VALET_HEAD`) plus per-user module overrides. This PRD writes stories for the 4 product roles; custom roles must never exceed their site scope.
6. ~~**Out-of-product items in code.**~~ *Resolved (OQ-6): Master Admin only.* `/api/v1/security/simulate-attack`, `/admin/clear-history`, and the Role View Simulator exist in production code. Their v1 status is unclear (OQ-6).
8. ~~**Launch date risk.**~~ *Resolved (OQ-13): phased launch — see Release phasing.* Target launch is **1 Oct 2026** — 6 days from this PRD. Steps 2–8 of the team workflow (UX, tech design, build, review, QA, security, release) plus Apple App Store / Google Play review for two apps on two platforms are unlikely to fit. See OQ-13 — needs a scope/date decision before UX starts.
7. **ANPR gate / "day car" system** (project doc Part B) is a separate project; not covered here (see Out of scope).

## Decisions from user (2026-09-25)
| OQ | Decision | Effect on this PRD |
|---|---|---|
| OQ-1 | Whole-product v1 baseline | Scope unchanged |
| OQ-2 | Employee app and Attendant app ship on **Android and iOS**; both are an integral part of v1 | New US-28 (P0), AC-54 |
| OQ-3 | Server **rejects** list calls without `siteId` | AC-02 tightened |
| OQ-4 | An employee **can** hold passes at more than one site and more than one vehicle per pass, **within the same corporate email domain** | US-09 updated, new US-25, AC-48..AC-50 |
| OQ-5 | Attendant override of "not authorised" is **allowed** | AC-20 updated; which roles / mandatory reason still open (OQ-5b) |
| OQ-6 | Attack simulator, clear-history and Role View Simulator: **Master Admin only** | US-23 updated, AC-52 |
| OQ-7 | Offline queueing is good-to-have; **online-only for v1**, offline in next release | Moved to Out of scope; AC-46 kept |
| OQ-8 | Floor plan live latency **≤ 5 s** confirmed | AC-18, AC-24 confirmed |
| OQ-9 | Invoice formulas and GST **to be decided later** | AC-35 blocked; invoice generation not a launch blocker |
| OQ-10 | Overstay limit **12 hours** by default, **configured by Site Admin** | New US-26, AC-33 updated, AC-51 |
| OQ-11 | Parking logs and audit records kept **1 year** | New US-27, AC-53 |
| OQ-12 | Target launch **1 Oct 2026** | Success metrics; schedule risk raised as OQ-13 |
| OQ-13 | Option (a): **web console + site-isolation fix on 1 Oct 2026**; mobile apps released afterwards as **APK files** | New "Release phasing" section; US-28 / AC-54 split by phase |
| OQ-12b | First live site: **Alphatech** | Release phasing, success metrics |
| OQ-5b | Override allowed **with a mandatory reason** | AC-20 |
| OQ-4b | Maximum **2 vehicles per pass** | AC-50 |
| OQ-6b | Role View Simulator profile **persists across page reload** | New AC-55 |
| OQ-10b | Overstay alerts **also notify the Employee** | AC-33 |
| OQ-11b | Records older than 1 year are **archived** (not deleted) | AC-53 |

## Release phasing
| Phase | Date | Scope | Where |
|---|---|---|---|
| 1 — Launch | **1 Oct 2026** | Web console (Master Admin + Site Admin) with the site-isolation fix (US-01, AC-01..AC-06 must pass) and all other P0 web stories | admin.parkflows.in, first live site **Alphatech** |
| 2 — Mobile (Android) | After Phase 1, date to be set (OQ-14) | Attendant app and Employee app as **Android APK files** distributed directly (no Play Store listing required for this phase) | Alphatech attendants and employees |
| 3 — Mobile (iOS) / stores | To be set (OQ-15) | iOS builds and store listings (App Store / Play Store) | All sites |

Until Phase 2 ships, gate entry/exit (US-07, US-08) and employee self-service (US-09, US-11, US-25) run through whatever the web console already offers; if that is not usable at the Alphatech gate on 1 Oct, see OQ-16.


## Problem & why now
Urban Indian office parks, malls and hospitals run parking with paper registers, WhatsApp groups and walkie-talkies. Operators cannot see live occupancy, can't enforce who is allowed to park, and can't bill clients per site. ParkFlows already has most of the building blocks (multi-site config, slot inventory, attendant gate app, employee passes, valet, reports, audit), but:
- the product is about to be sold under **parkflows.in** to multiple customer sites, and a **cross-site data leak is live in production** — this is a trust and contractual risk for a multi-tenant SaaS;
- there is no agreed definition of "v1 done" per role, so work is scattered across fixes and demos;
- there are no testable acceptance criteria, so QA cannot sign off a launch.

Why now: parkflows.in launch is being prepared in parallel (marketing site + portals), and a second real site (Alphatech) is live alongside Tech Park HQ — the moment where isolation bugs start hurting real customers.

## Roles affected
- [x] Master Admin  - [x] Site Admin  - [x] Attendant  - [x] Employee

## User stories
| ID | Priority | As a… | I want… | So that… |
|---|---|---|---|---|
| US-01 | P0 | any signed-in user | to only ever see and change data for the sites I am assigned to | one customer's data is never exposed to another |
| US-02 | P0 | Master Admin | to onboard a site with name, code, address, capacity (2W/4W), facility type, billing type and rate | a new customer can go live without engineering help |
| US-03 | P0 | Master Admin | to put a site On Hold / Maintenance / Decommissioned with a reason | operations stop cleanly when a contract pauses or ends |
| US-04 | P0 | Master Admin | to create users, assign a role and assign one or more sites (or All Sites), and suspend users | the right people get the right access and leavers lose it immediately |
| US-05 | P0 | Site Admin | to create, edit and bulk-upload (CSV) the slot inventory for my site (slot number, floor, zone, vehicle type, slot type) | the system mirrors the physical facility |
| US-06 | P0 | Site Admin | to see a live floor plan of my site showing Vacant / Occupied / Reserved / Maintenance slots with the plate and entry time on occupied slots | I know capacity at a glance and can act on problems |
| US-07 | P0 | Attendant | to record a vehicle entry by scanning or typing the plate and be told which slot to use (or that the vehicle is not authorised) | cars get in fast and only permitted vehicles park |
| US-08 | P0 | Attendant | to record a vehicle exit by plate and see the parking duration (and amount due, if the site is paid) | the slot is freed immediately and billing is correct |
| US-09 | P0 | Employee | to register for a parking pass with my employee ID, corporate email, phone and one or more vehicle numbers | I can park without a manual paperwork process |
| US-10 | P0 | Site Admin | to approve or reject pending pass requests for my site (single and bulk), with a reason on reject | only eligible employees get passes |
| US-11 | P0 | Employee | to see my pass status (pending / approved / rejected / revoked) and, when approved, a digital pass I can show at the gate | I know if and where I can park |
| US-12 | P0 | Site Admin | to see entry/exit logs for my site with filters (date range, plate, status) and export them to CSV | I can answer disputes and report to my client |
| US-13 | P1 | Master Admin | to whitelist corporate email domains per site | only real employees can self-register |
| US-14 | P1 | Site Admin | to see overstay / non-parked alerts for my site | I can follow up on vehicles breaking facility rules |
| US-15 | P1 | Site Admin | to see site reports: utilisation, occupancy trend, peak hours, vehicle mix, violations | I can plan capacity and justify the service to my client |
| US-16 | P1 | Master Admin | to generate a monthly invoice per site from its billing type, rate and tax, and mark it paid | ParkFlows can bill customers from the platform |
| US-17 | P1 | Attendant | to move a vehicle from one slot to another (relocation) with the move logged | stacker/puzzle operations and emergencies are traceable |
| US-18 | P1 | Master Admin | to see a tamper-evident audit log of admin actions, slot overrides, pass decisions and gate transactions, and verify the chain | we can prove who did what for compliance and disputes |
| US-19 | P1 | Attendant | to run valet: check a car in, park it, receive a retrieval request, deliver it | valet sites can use ParkFlows end to end |
| US-20 | P1 | Employee | to request retrieval of my valet-parked car from the app | I don't wait at the desk |
| US-21 | P1 | Site Admin | to review overnight-parking requests for my site | exceptions to shift rules are approved, not ignored |
| US-22 | P2 | Master Admin | to create custom roles with module access and a site-scope policy | larger customers can mirror their org chart |
| US-23 | P2 | Master Admin | to view the product as another role (role simulator) without changing that user's data — Master Admin only | I can support customers and test permissions |
| US-24 | P2 | Site Admin | to see predictive occupancy / AI slot recommendations | I can prepare for peaks |
| US-25 | P0 | Employee | to hold passes at more than one site whose whitelisted domain matches my corporate email | I can park at every campus of my employer |
| US-26 | P1 | Site Admin | to set my site's overstay limit (default 12 hours) | alerts match my site's shift rules |
| US-27 | P1 | Master Admin | parking logs and audit records to be retained for 1 year and not deletable by Site Admins | we can answer disputes and audits for a full year |
| US-28 | P0 | Attendant / Employee | the Attendant app and the Employee app on Android, delivered as APK files (Phase 2) | attendants and employees can use ParkFlows on their own phone soon after launch |
| US-29 | P1 | Attendant / Employee | the same apps on iOS and on the app stores (Phase 3) | iPhone users and future sites are covered |

## Acceptance criteria
Notation: "Site A" and "Site B" are two active sites each with their own slots, employees, logs, alerts, registrations, valet tickets and invoices.

### Site isolation (US-01) — P0, launch blocker
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-01 | US-01 | a Site Admin assigned only to Site A | they open any screen (Live Slots, Inventory Master, Employees, Logs, Alerts, Registrations, Reports, Valet, header counts) | every record and every count shown belongs to Site A only; no Site B record appears |
| AC-02 | US-01 | the same Site Admin | they call any list API (slots, employees, logs, alerts, registrations, valet tickets, reports, invoices) with no `siteId`, or with `siteId` = Site B | no `siteId` → request rejected (400) with no data; `siteId` = Site B → 403 with no data. Applies to every role: a Master Admin with All Sites scope must pass a `siteId` or an explicit all-sites value (OQ-3) |
| AC-03 | US-01 | the same Site Admin | they call any write API (slot save/delete/status, vehicle entry/exit, registration approve/reject, valet status) for a record belonging to Site B | the server returns 403, the record is unchanged, and the attempt is audit-logged |
| AC-04 | US-01 | a Master Admin with All Sites scope | they switch the site context from Site A to Site B | all screens refetch and show only Site B data with no stale Site A rows; choosing "All sites" shows combined data clearly labelled per site |
| AC-05 | US-01 | a user assigned to Sites A and B | they view the site switcher | only Sites A and B are offered |
| AC-06 | US-01 | an Attendant or Employee | they use their app | they only ever see data for their own site (Attendant) or their own pass/vehicles (Employee) |

### Role permissions
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-07 | US-02..04, US-13, US-16, US-22 | a Site Admin, Attendant or Employee | they open or call site onboarding, pricing, site status, user/role management, domain whitelist or invoice generation | the UI hides the entry point and the API returns 403 |
| AC-08 | US-05, US-06, US-10, US-12 | an Attendant | they try to edit inventory, approve passes or export logs | the action is unavailable and the API returns 403 |
| AC-09 | US-11, US-20 | an Employee | they call any API for another employee's pass, vehicle or valet ticket | 403; only their own records are returned |
| AC-10 | US-04 | a user whose status is set to Suspended | they try to sign in, or make any request with an existing session | sign-in is refused and the existing session is rejected within one request |
| AC-11 | US-22 | a custom role with `ASSIGNED_SITES_ONLY` | a user with that role is given a per-user module override | the override can add/remove modules but can never widen their site scope |

### Core flows
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-12 | US-02 | a Master Admin | they submit a new site with all required fields | the site is created as Active and appears in the site switcher and user site-assignment list without reload |
| AC-13 | US-02 | a Master Admin | they submit a site with a missing required field, a duplicate site code, or a non-numeric/negative capacity or rate | the site is not created and each invalid field shows a specific message |
| AC-14 | US-03 | a site set to On Hold / Maintenance / Decommissioned | an Attendant tries to record an entry at that site | entry is blocked with a message stating the site status; exits of already-parked vehicles are still allowed |
| AC-15 | US-04 | a Master Admin | they create a user with a role and assigned sites | the user can sign in and sees only the modules of their role and only the assigned sites |
| AC-16 | US-05 | a Site Admin | they upload a valid slot CSV | all rows are created under their site, a summary shows created / skipped / failed counts, and duplicates of an existing slot number in that site are skipped not overwritten |
| AC-17 | US-05 | a Site Admin | they upload a CSV with bad rows (missing slot number, unknown vehicle type) or a non-CSV file | valid rows are imported, invalid rows are listed with row number and reason; a non-CSV file is rejected with no data written |
| AC-18 | US-06 | a vehicle is recorded as entered in slot X | the Site Admin views the floor plan | slot X shows Occupied with plate and entry time within 5 s, without manual refresh (see OQ-8) |
| AC-19 | US-07 | a plate with an approved, active pass at this site | the Attendant scans or types it | the entry is recorded, a vacant slot of the right vehicle type is assigned and shown, and that slot becomes Occupied |
| AC-20 | US-07 | a plate with no approved pass at this site (or a rejected/revoked pass, or a pass at another site) | the Attendant scans or types it | the Attendant is told the vehicle is not authorised; no slot is occupied unless an override is used. The Attendant may override (OQ-5, OQ-5b): the override cannot be submitted without a reason; it records the entry, flags the log as Override, and writes an audit entry with user, time, plate and reason |
| AC-21 | US-07 | a plate that is already recorded as parked | the Attendant tries to record entry again | a duplicate entry is refused and the existing slot is shown |
| AC-22 | US-07 | no vacant slot of the required vehicle type | the Attendant records an entry | the Attendant is told the site is full for that vehicle type; nothing is written |
| AC-23 | US-07 | an invalid plate string (fails Indian plate normalisation) | the Attendant submits it | it is rejected with a message and the Attendant can correct it manually |
| AC-24 | US-08 | a vehicle recorded as parked | the Attendant records exit | the log gets exit time, duration and (for paid sites) amount due; the slot becomes Vacant within 5 s on all screens |
| AC-25 | US-08 | a plate not currently parked at this site | the Attendant records exit | the exit is refused with "vehicle not found on site" |
| AC-26 | US-09 | an Employee with a whitelisted corporate email domain for the chosen site | they submit the registration form with all fields | a Pending request is created for that site and the Employee sees status Pending |
| AC-27 | US-09, US-13 | an Employee using a non-whitelisted email domain for that site, a vehicle number already on another employee's active pass at that site, or a malformed phone/plate | they submit | the request is not created and a specific error is shown |
| AC-28 | US-10 | a Pending request at Site A | the Site A Admin approves it | the pass becomes Approved, the plate is authorised for entry at Site A (AC-19), and the decision is audit-logged |
| AC-29 | US-10 | a Pending request | the Site Admin rejects it without a reason | rejection is blocked until a reason is entered; with a reason, the Employee sees Rejected and the reason |
| AC-30 | US-10 | an Approved pass | the Site Admin revokes it | the plate is no longer authorised for entry from the next scan |
| AC-31 | US-11 | an Approved Employee | they open the Employee app | they see their pass (name, plate, site, validity) in a form the Attendant can verify at the gate |
| AC-32 | US-12 | a Site Admin | they filter logs by date range and plate and export | the CSV contains exactly the filtered rows for their site only, with the same columns as the screen |
| AC-33 | US-14, US-26 | a vehicle parked longer than the site's overstay limit (default 12 hours) | the alert job runs | an overstay alert appears for that site only, with plate, slot and time parked, **and** the Employee who owns the vehicle is notified in the Employee app (in-app; SMS/WhatsApp out of scope) |
| AC-34 | US-15 | a Site Admin | they open reports for a date range | utilisation, occupancy trend, peak hours, vehicle mix and violations are calculated from that site's logs only, and match a manual count on test data |
| AC-35 | US-16 | a site with billing type, rate and tax set | the Master Admin generates the invoice for a month | the invoice total equals the billing formula for that type and the invoice can be marked Paid. **Blocked — formulas and GST to be decided later (OQ-9); not a 1 Oct launch blocker** |
| AC-36 | US-17 | a vehicle in slot X and vacant slot Y at the same site | the Attendant relocates it | X becomes Vacant, Y Occupied with the same plate and original entry time, and the move is logged in Relocation Logs |
| AC-37 | US-18 | any admin action, slot override, pass decision, entry or exit | the action succeeds | an audit entry with timestamp, user, site, action and chained hash is written |
| AC-38 | US-18 | an audit record has been altered in the database | the Master Admin runs "verify chain" | verification fails and names the first broken record |
| AC-39 | US-19, US-20 | a valet ticket at Site A | it moves Checked-in → Parked → Retrieval requested → Delivered | each transition is timestamped; an Employee's retrieval request shows on the Site A valet board only |
| AC-40 | US-21 | an overnight request at Site A | the Site A Admin approves or rejects it | the decision and reviewer are stored and visible to the requesting Employee |

| AC-48 | US-25 | an Employee with an approved pass at Site A, and Site B whitelists the same corporate email domain | they register for Site B | a Pending request is created for Site B; the Site A pass is unaffected; each Site Admin sees only their own site's request |
| AC-49 | US-25 | Site C does not whitelist the Employee's email domain | they try to register for Site C | the request is refused with "your email domain is not allowed at this site" |
| AC-50 | US-09 | an approved pass with two vehicles | either vehicle is scanned at that site | entry is authorised for that vehicle. A pass holds at most **2 vehicles**: adding a third is refused with a clear message. Whether adding/replacing a vehicle on an approved pass needs Site Admin re-approval: OQ-4c |
| AC-51 | US-26 | a Site Admin of Site A | they change the overstay limit | the new limit applies to Site A only from the next alert run; a new site starts at 12 hours; values ≤ 0 or non-numeric are rejected; Attendants and Employees cannot change it |
| AC-52 | US-23 | any non–Master Admin user | they open or call the attack simulator, clear-history, or the Role View Simulator | the UI hides them and the API returns 403 |
| AC-53 | US-27 | parking logs and audit records younger than 1 year | a Site Admin tries to delete them, or any retention job runs | they remain available and exportable; Site Admins have no delete action. Records older than 1 year are **archived**: removed from day-to-day screens and reports but not deleted, and retrievable by a Master Admin. Whether Master Admin clear-history may remove records younger than 1 year: OQ-11c |
| AC-54 | US-28 | the Attendant APK and the Employee APK (Phase 2) | they are installed on a supported Android phone | every P0 story for that role (US-07, US-08 / US-09, US-11, US-25) works against the same server and site scope as the web console |
| AC-55 | US-23 | a Master Admin simulating another user's profile | they reload the page | the simulated profile is kept, a visible banner says "Viewing as <user>", and one click returns to their own profile; simulation never changes the simulated user's data |
| AC-56 | US-29 | the iOS builds (Phase 3) | installed on a supported iPhone | same outcome as AC-54 |

### Empty & error states
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-41 | US-05, US-06 | a newly onboarded site with no slots | the Site Admin opens Live Slots or Inventory Master | an empty state explains there is no inventory and points to add/upload slots — not a blank screen, spinner or zero-filled grid |
| AC-42 | US-10, US-12, US-14, US-15 | no pending requests / no logs in range / no alerts / no report data | the Site Admin opens the screen | a clear "nothing here" message is shown for that site and range |
| AC-43 | US-11 | an Employee with no registration | they open the app | they are guided to register |
| AC-44 | all | a user with no assigned sites (not All Sites) | they sign in | they see a "no site assigned — contact your administrator" message and no data |
| AC-45 | all | the server or network is unavailable | any user loads or saves data | a readable error with a retry option is shown; no partial write is shown as success |
| AC-46 | US-07, US-08 | the Attendant app loses connectivity at the gate | the Attendant scans a plate | the app clearly shows it is offline and does not claim the entry/exit was recorded (offline queueing — see OQ-7) |
| AC-47 | all | a session has expired | the user performs any action | they are returned to sign-in and, after signing in, land in the same site context |

## Out of scope
- ANPR camera/gate hardware integration and the reservation-based "day car" gate system (separate project, Part B of the requirements doc).
- The public marketing site at parkflows.in (separate workstream).
- Online payment collection (UPI/FASTag/card gateway) — v1 records payment mode only.
- Pricing/packaging of the SaaS itself.
- Self-service customer sign-up (sites are onboarded by Master Admin).
- Visitor / pay-per-use public parking flows.
- SMS/WhatsApp/push notifications to drivers (in-app only for v1, unless OQ-10b says otherwise).
- iOS builds and app-store listings for 1 Oct (Phase 3).
- Offline queueing of entries/exits in the Attendant app — planned for the next release (OQ-7).
- Final invoice formulas and GST treatment (OQ-9, to be decided later).
- UI redesign, choice of technology, Firestore rule changes (belong to UX / architect steps).

## Success metrics
- **Launch 1 Oct 2026**: web console live for **Alphatech** with zero cross-site data exposure (Phase 1).
- **Zero** cross-site data exposures: automated isolation tests (AC-01..AC-06) pass on every release; no customer-reported leak in the first 90 days.
- Gate entry recorded in **≤ 10 s** median from plate scan to slot shown (Attendant app).
- **≥ 90%** of employee pass requests decided within 2 working days of submission.
- Live floor plan occupancy matches physical audit within **2%** on a spot check at each site.
- Onboarding a new site (config + slot CSV + first Site Admin) done by a Master Admin in **< 1 hour** without engineering help.
- **100%** of P0 acceptance criteria covered by tests and passing before launch sign-off.

## Open questions
Resolved on 2026-09-25 (two rounds): OQ-1..OQ-8, OQ-10, OQ-10b, OQ-11, OQ-11b, OQ-12, OQ-12b, OQ-13, OQ-4b, OQ-5b, OQ-6b — see "Decisions from user". OQ-9 deferred by user.

Still open (none blocks Phase 1):
- **OQ-14** Target date for Phase 2 (Android APKs), and how APKs are distributed to Alphatech staff (download link, MDM, shared by Site Admin)?
- **OQ-15** Target date for Phase 3 (iOS + store listings).
- ~~**OQ-16**~~ *Resolved: existing flows stay as they work today (Attendant web portal at `/attendant`, current employee registration). No new build for Phase 1 — see Addendum A for risks.*
- **OQ-4c** Does adding or replacing a vehicle on an approved pass need Site Admin re-approval?
- **OQ-11c** May a Master Admin's clear-history remove records younger than 1 year?
- **OQ-9** Invoice formulas and GST — deferred by user.

Status: APPROVED (by user, 2026-09-25)

---
## Addendum A — Phase 1 launch risk review of existing infrastructure (2026-09-25)
Requested by user after approval: "everything works as it does today — review the existing infra, identify the risks, and move on". This addendum does **not** change approved scope. Reviewed: local repo `main` @ `d42af6f` (23 Sep 2026), working tree, `server.ts`, `src/server/security.ts`, `src/App.tsx`, `firestore.rules`, `.env.example`, `.gitignore`, `KNOWN_ISSUES.md`. Production (Cloud Run config, secrets, backups) was **not** visible — items marked *verify* need someone with console access.

| ID | Severity | Risk | Evidence | Mitigation before 1 Oct | Owner |
|---|---|---|---|---|---|
| R1 | **High** | The client-side site-isolation fix is **not in the repo**. Master Admin views and the Role View Simulator can still show combined data from all sites. | `KNOWN_ISSUES.md` cites commit `2472379`; that commit exists on no branch here. `src/App.tsx` lines ~219–259 still call `/slots`, `/employees`, `/logs`, `/alerts/non-parked`, `/registrations` with no `siteId`. | Re-apply the fix (add `siteId` to these fetches and refetch on site switch), then run QA against AC-01..AC-06. Until it's deployed, don't use the simulator for Alphatech demos. | frontend-dev |
| R2 | Medium | For signed-in Site Admins, the server already limits data to their sites (`enforceSiteScope`). That protects a real Alphatech admin today. It does **not** match the approved OQ-3 rule of rejecting calls without `siteId`: a user scoped to several sites silently gets only their first site, and a Master Admin with no site selected gets reports for the empty `site-default`. | `getRequestedSiteId` in `server.ts` ~line 325; `\|\| DEFAULT_SITE_ID` on the report routes ~lines 1555–1600. | Acceptable for Alphatech (single-site admins). Schedule the strict reject after Phase 1. | backend-dev |
| R3 | **High** | Uncommitted work on `main` isn't deployed. The only real change (16 lines in `src/App.tsx`) refetches data after login and **clears the previous user's data on logout**, which matters on shared gate phones. It is buried under line-ending (CRLF) changes to 26 other files (~16k lines). | `git diff --ignore-cr-at-eol` shows only the `App.tsx` change; the raw diff shows 27 files. | Normalise line endings (add a `.gitattributes`), move the `App.tsx` change to a branch, review it and deploy it. | frontend-dev / devops |
| R4 | **High** (*verify*) | Missing production secrets. Without `AUDIT_HMAC_SECRET` the audit trail is signed with a key that is in the source code, so entries can be forged. `BOOTSTRAP_ADMIN_PASSWORD` controls the Master Admin bootstrap account. | `src/server/security.ts` line 14 fallback; `.env.example`. | Confirm both are set as Cloud Run secrets. Confirm `SEED_DEMO_USERS` is off in production. | devops |
| R5 | Medium | Deploys are fragile. The last commit fixed a Cloud Build failure caused by `bun.lock`. Both `bun.lock` and `package-lock.json` exist, and `bun.lock` has been changed locally again. | Commit `d42af6f`; `git status`. | Keep one lockfile. Do a dry-run deploy by **29 Sep** so there's time to fix a failure before 1 Oct. | devops |
| R6 | Medium | No automated test gate. A QA suite exists but is untracked and not run anywhere. | `tests/qa/001-platform-v1.api.test.mjs` (untracked). | Run `node --test tests/qa/` against a staging build before 1 Oct and attach the result to `06-test-report.md`. | qa-engineer |
| R7 | Medium (*verify*) | Rollback and backups are unknown. The repo shows no Firestore backup/PITR setup or rollback steps. | No deploy or backup config in the repo. | Confirm Firestore backups or PITR are on. Note the current Cloud Run revision so it can be rolled back. | devops |
| R8 | Medium (*verify*) | Plate scanning may use mock results when `GEMINI_API_KEY` is missing ("using fallback mock vision/reasoning"). | `server.ts` `getGeminiClient()`. | Confirm the key is set in production and that scan-plate never returns a made-up plate. Attendants can always type the plate by hand (AC-23). | backend-dev |
| R9 | Low | Repo hygiene: three abandoned `node_modules_*` folders (~340 MB) and npm log files in the root, not covered by `.gitignore`. There are also two `App.tsx` files; only `src/App.tsx` is used, and `src/components/App.tsx` is a stale copy someone could fix by mistake. | `git status`; `src/main.tsx` imports `./App.tsx`. | Delete the folders and the stale copy, and extend `.gitignore`. Not a launch blocker. | any dev |
| R10 | Low | Docs are out of date: the route table in `ARCHITECTURE.md`, the README (React 18, "Digi-Parking"), and `KNOWN_ISSUES.md` citing a commit that isn't here. | See Gaps 2 and 3. | Update after Phase 1. | architect |
| R11 | Low (*verify*) | Alphatech data readiness. Its 1,080 slots were bulk-loaded recently and its employees and domain whitelist need checking. | `KNOWN_ISSUES.md`. | On 30 Sep, spot-check Alphatech slot/employee counts and whitelisted domains against the physical site. | Site Admin (Alphatech) |

Already in good shape: `firestore.rules` denies all direct client access (only the server writes); every non-public API needs a server-verified session; public endpoints are limited to health, login, set-password (token-gated), registration submit (rate-limited to 10/min) and the domain list; API rate limit is 600/min.

**Go/no-go for 1 Oct (proposed):** R1, R3, R4 closed; R5 dry-run deploy green; R6 isolation tests passing; R7 rollback revision noted. R2 and R8–R11 can follow.

---
## Addendum B — PM decision on G-17 (2026-09-28)
**Accepted for Phase 1:** at the 1 Oct Alphatech launch the existing `/attendant` web portal keeps its current toast-only gate feedback (no dedicated result screens). This follows the user's direction to keep today's working flows. For Phase 1, AC-14 and AC-19..AC-23 pass if the **server** outcome is correct (entry allowed/refused, slot assigned, duplicate/full/invalid refused, audit written) **and** the attendant sees a toast with the matching message. The full gate result sheet (02-ux-design) moves to Phase 2 with the Android APKs.
Condition: toasts must show the refusal reason in plain words and stay visible long enough to read (QA to check). Also: R4 (production secrets) closed by user confirmation on 2026-09-28.

---
## Addendum C — Scope change: per-site domain whitelist (2026-09-28)
User decision (via backend-dev, PERM-02): **a Site Admin may allow email domains for their own site.** US-13 is extended: Master Admin can still manage domains for all sites; a Site Admin manages only their own site's domains. AC-07 no longer blocks Site Admins from the domain whitelist for their own site.
New AC-57 (US-13): Given a Site Admin of Site A, when they add or remove an allowed domain, then it applies to Site A registrations only, is audit-logged, and they cannot see or change Site B's or platform-wide domains (API returns 403). Platform-wide domains (no site) are Master Admin only and apply to every site.
