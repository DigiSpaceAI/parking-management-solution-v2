# PRD — UI Redesign & ParkFlows Design System
Feature ID: 002 · Author: product-manager · Date: 2026-10-02 · Revision: v1.8 (2026-10-17: R1b split console/form + R1b triage; v1.7 2026-10-13: m-3 IP/UA logging decision + privacy sentence; v1.6 2026-10-11: R1a live, R1b target 18 Oct + gates; v1.5 2026-10-09: R1a privacy + demo copy for flag off, BUG-3/R3 triage; v1.4 2026-10-08: R1a email precondition, AC-33 legal pages; v1.3 2026-10-08: R1 split into R1a/R1b; earlier v1.2 2026-10-07: demo form US-18/AC-32, AC-14 paged cards, NFRs, AC scope notes, copy sign-off — see Changelog)

## Gaps found in inputs
1. **Design direction changed.** The project's "UI Design Review (Sep 2026)" recommended standardising on the existing Claude Design language (Barlow, #5980a6 accent, square corners). The user has now decided the **design system starts from scratch**. That recommendation is superseded. The review's findings on fabricated numbers, duplication, navigation, tables, mobile and naming still apply and are used as input here.
2. **Feature 001 is still in release** (hotfix on 2 Oct, Android gate check S6 still open). 002 must start from 001's merged code. Design work (UX, design system, mockups) can start now; **code changes must wait until 001 is merged to `main`**, to avoid two large branches touching the same files.
3. **No brand assets exist.** There is no agreed logo, colour or type. Two logos are in use today (gradient "PF" in the app, flat square on Login). Brand inputs are listed as Open Questions instead of being guessed.
4. **Two styling systems in the code today** (808 inline `style={{}}` blocks plus Tailwind utility pages). The redesign has to end with one.
5. **Mobile apps not yet reviewed.** The UI review covered the web console only. The Attendant and Employee Android apps need a review before their screens are redesigned.

## Decisions from user (2026-10-02)
| OQ | Decision | Effect |
|---|---|---|
| OQ-1 | Brand should feel **trustworthy and modern** | Design brief for US-01, US-16 |
| OQ-2 | **New logo and brand colour designed as part of this work** | New US-16 (P0), AC-29 |
| OQ-3 | **No dark theme** in this release | US-14 moved to Out of scope |
| OQ-4 | Marketing site parkflows.in **uses the new design system in this release** | New US-17 (P0), AC-30; removed from Out of scope |
| OQ-5 | Target release **10 Oct 2026** | Release plan; schedule risk OQ-11 |
| OQ-6 | **No regional languages** | Stays out of scope |
| OQ-7 | **No Figma** — mockups as shareable design pages | Approach step 2 |
| OQ-8 | Android apps **not in the 10 Oct release** (read as: redesign them afterwards — confirm, OQ-12) | US-07/US-08 and AC-15..AC-17, AC-28 move to a follow-up release |
| OQ-9 | **Yes**, test mockups with Alphatech staff before build | AC-31 |
| OQ-10 | Answer "No" to both options — unclear (OQ-13) | AC-06 on hold |

## Release plan (proposed)
| Release | Date | Scope |
|---|---|---|
| ~~R1~~ | ~~10 Oct 2026~~ | *Superseded 2026-10-08 — see R1a / R1b* |
| **R1a** | **10 Oct 2026** | Marketing site parkflows.in (brand, design system CSS, home, privacy). "Book a demo" shows the email + phone contact panel (no form) until B6 and the D1 rewrite are live; then the form is switched on (AC-32 applies from then) |
| *R1a go-live preconditions (PM, 2026-10-08)* | — | Code review r3 PASS, QA r3 PASS, user "go", and **`sales@parkflows.in` receives mail** (MX/SPF/DKIM set, test mail delivered — DevOps 08 blocker). If email is not working by the cutover, **hold the cutover** rather than publish an address that bounces |
| *R1a status (11 Oct)* | **Live** on parkflows.in | Email gate waived by user. Known gap: sales@parkflows.in bounces (no MX/SPF), so the privacy page's "Delete my enquiry" route doesn't work yet — **MX/SPF/DKIM + test mail by 14 Oct (user)**; it is also a hard gate for turning the demo form ON in R1b |
| *R1b go-live gates (PM, 11 Oct)* | — | Code review PASS (backend + frontend), QA PASS, **security review PASS (step 7: new public endpoint storing personal data)**, BUG-3 fixed, sales@ mail working, Firestore PITR on, europe-west1 trigger disabled before `main` is pushed, user go |
| **R1b** | **Target 18 Oct 2026** (PM proposal, 11 Oct; 001 merged locally 8 Oct) | Console redesign: the 5 key screens (Login, Site Admin Overview, Live parking, Employees & vehicles, Master Admin Sites), B1–B6, F1–F10, and the demo form switched on |
| R1.1 | After R1, date to be set | Remaining web console screens |
| R2 | After R1, date to be set | Attendant and Employee Android apps (and `/attendant` web portal gate screens) on the same design system |

## Problem & why now
ParkFlows works, but it does not look or feel like a product a facility manager would pay for. The September UI review found:
- **Fabricated numbers shown as live data** (₹4.2L billing, "100% uptime", "94% Peak @ 10:00", a hardcoded "LSTM forecast", "PLC OPERATIONAL"). This damages trust as soon as a customer compares them with reality.
- **Two design systems at once**, two logos, three spellings of the product name (ParkFlows / ParkFlow / ParkOrbit).
- **The same thing in many places** (navigation ×4, current site ×3, entry/exit actions ×4, refresh buttons everywhere).
- **"Vibe-coded" styling**: glow blobs, gradient text, badges on every nav item, 304 monospace uses, 10px text, pulsing/bouncing status, marketing jargon inside the product.
- **Hard to use on phones and tablets**: site switcher hidden below 1024px, 13-column tables, 1,080 slots as 54 pages of cards.

Why now: Alphatech is live (Phase 1, 1 Oct). The next sites will judge ParkFlows by how it looks in a demo. A clean, consistent, honest UI is the cheapest way to win them, and it is easier to set the design system before the Android apps and more sites are added.

## Roles affected
- [x] Master Admin  - [x] Site Admin  - [x] Attendant  - [x] Employee

## Surfaces in scope
Web console (Login, Master Admin, Site Admin), Attendant web portal (`/attendant`), Attendant Android app, Employee Android app. Marketing site parkflows.in: see OQ-4.

## User stories
| ID | Priority | As a… | I want… | So that… |
|---|---|---|---|---|
| US-01 | P0 | product team | one ParkFlows design system built from scratch (colour, type, spacing, radius, elevation, icons, motion rules, core components) used by the web console and both apps | every screen looks like the same product and new screens are fast to build |
| US-02 | P0 | any user | every number on screen to come from real data, and an honest "—" with an explanation when there is none | I can trust what ParkFlows tells me |
| US-03 | P0 | any user | one clear, grouped navigation showing only the modules my role and site can use | I find things quickly and never see dead ends |
| US-04 | P0 | Site Admin / Master Admin | every page to follow one page template (title, one primary action, filters, content, pagination) | I learn the console once |
| US-05 | P0 | Site Admin / Master Admin | readable tables: sensible default columns, pagination, Indian date/time/currency formats, readable durations, row click opens a detail panel | I can scan and act on data without effort |
| US-06 | P0 | Site Admin | to land on my site's overview, and a Master Admin to land on a sites table, instead of a launchpad of cards | the first screen is useful |
| US-07 | P0 (R2) | Attendant | gate screens I can use one-handed, outdoors, in glare, with large controls and an unmistakable allowed/refused result | entries and exits are fast and error-free |
| US-08 | P0 (R2) | Employee | a clean pass screen and registration flow on my phone | I can register and show my pass without help |
| US-09 | P0 | any user | the console and apps to work well on phone, tablet and desktop, including the site switcher | I can work from any device |
| US-10 | P0 | any user, including people with low vision or using a keyboard | the product to meet WCAG 2.2 AA | everyone can use it |
| US-11 | P1 | any user | one name ("ParkFlows"), one logo, plain-language labels and no technical jargon | the product feels finished and professional |
| US-12 | P1 | Site Admin | a dense live floor plan (small tiles coloured by status, filters, side panel) instead of pages of cards | I see the whole site at a glance |
| US-13 | P1 | Site Admin / Master Admin | each task in one place (e.g. entry/exit only on Live parking; Employees & vehicles merged; admin previews of the mobile apps removed) | I am never unsure which screen to use |
| US-15 | P1 | product team | a published design-system reference (tokens + components + usage rules) | future features reuse it |
| US-16 | P0 | ParkFlows (the business) | a new logo and brand colour that feel trustworthy and modern | the product, apps and marketing site have one recognisable identity |
| US-17 | P0 | prospective customer | the marketing site parkflows.in to use the same brand and design system as the product | the website and the product feel like one trustworthy company |
| US-18 | P0 | prospective customer | to book a demo from parkflows.in by filling in a short form, and get a reply within one working day | I can ask for a demo without writing an email |

## Acceptance criteria
### Design system (US-01)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-01 | US-01 | the design system is approved | a developer builds any screen | colours, type sizes, spacing, radius and shadows come only from named design tokens; no hard-coded colour values or inline `style={{}}` for styling remain in redesigned screens |
| AC-02 | US-01 | the redesign is complete | the code is searched | one styling approach is used (one token source shared by web and apps); the old inline-style system and the old Tailwind look are both gone from all in-scope screens |
| AC-03 | US-01 | the component library | it is reviewed | it includes at least: buttons (primary/secondary/destructive/ghost), inputs, select, checkbox/radio, table, pagination, tabs, badge/status, card, modal, side panel, toast, empty state, error state, loading skeleton, site switcher, page header, nav — each with all states (default, hover, focus, disabled, error, loading) |

### Honest data (US-02)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-04 | US-02 | any screen in scope | it is reviewed against the API | every number, status and percentage shown is traceable to an API value; none of the hardcoded items in the UI review (₹4.2L, 48/60 lockers, 94%/96% peak, "100% uptime", "CONNECTED", "VERIFIED", "System healthy", PLC status, camera FPS, "Zero Violations", "1,080 slots" labels, "Today, 08:30 AM") remain |
| AC-05 | US-02 | a value has no data (new site, API error, no history) | the screen renders | it shows "—" plus a one-line reason (e.g. "No vehicles logged today") — never 0 presented as a real count, and never a made-up value |
| AC-06 | US-02 | a module has no real data behind it (Predictive Analytics, PLC/sensor status) | the redesign ships | Predictive Analytics stays, with a visible "Sample data — not live" label on the page and every chart/number; PLC/sensor status shows only real values or "—" (OQ-13) |

### Navigation, page template, landing (US-03, US-04, US-06, US-13)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-07 | US-03 | a user of any role | they sign in | navigation is one grouped list showing only modules their role permits and their site has enabled; module names match page titles exactly; badges show only counts or states |
| AC-08 | US-03 | a module is not permitted for the user | they type its URL | they see the standard "No access" page; the API still returns 403 (no regression from 001) |
| AC-09 | US-04 | any console page | it renders | it uses the page template: H1, optional one-line description, at most one primary action (others in a "⋯" menu), filters, content, pagination |
| AC-10 | US-06 | a Site Admin / a Master Admin | they sign in | the Site Admin lands on their site's Overview; the Master Admin lands on the Sites table; no launchpad card grid exists |
| AC-11 | US-13 | the redesign | it is reviewed | vehicle entry/exit actions exist only on Live parking (Logs is read-only + export); Registration and Approvals are one "Employees & vehicles" area; "ParkFlows Field" and "Employee Smart Pass" previews are gone from admin nav; one refresh mechanism (auto-refresh with "Updated Xs ago") |

### Tables and formats (US-05, US-12)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-12 | US-05 | any table | it loads | it shows at most 7 default columns, paginates at 25 or 50 rows (no table renders hundreds of rows at once), and clicking a row opens a detail panel |
| AC-13 | US-05 | dates, times, money, durations | they are displayed | dates are DD MMM YYYY, times HH:mm (24h, IST), money ₹ with Indian grouping (₹1,77,000), durations readable ("7d 22h", not "11433 mins"), enum codes shown as plain words ("On hold", not ON_HOLD) |
| AC-14 | US-12 | a site with 1,080 slots | the Site Admin opens Live parking on a desktop | **(changed by user direction, 2026-10-06)** slots for the selected level show as **paged slot cards** (UX card B: status band, slot code, plate + "In since", Height and Length); page size **12 / 20 / 36 / 60** (default 20) with **one** pagination bar and "Showing 1–20 of 1,080"; level buttons with free/total, search, status and slot-type filters (changing a filter returns to page 1); an optional Cards/List switch; the Puzzle wise status view shows 6 stackers per page with the top level first. Clicking a card opens the slot modal, which closes with Esc or a click outside. |

### Attendant and Employee apps (US-07, US-08) — Release R2, not 10 Oct
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-15 | US-07 | the Attendant gate screen | it is used on a phone | primary controls are at least 48×48px and reachable with one thumb; text and controls meet 4.5:1 contrast (7:1 for the allowed/refused result); the result screen states allowed/refused, slot and reason in words, not colour alone |
| AC-16 | US-07 | a gate result | it appears | it stays until the attendant dismisses it or scans the next vehicle (replaces the Phase 1 toast, PRD 001 Addendum B) |
| AC-17 | US-08 | an Employee | they register and open their pass | each step fits a phone screen without horizontal scrolling; the pass shows name, plate(s), site and validity in a large, readable layout |

### Responsive, accessible, consistent (US-09, US-10, US-11)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-18 | US-09 | the console at 360px, 768px and 1280px widths | a Site Admin uses each P0 screen | nothing is cut off or needs horizontal page scroll; the site switcher is reachable at every width; tables become cards below tablet width |
| AC-19 | US-10 | any screen in scope | it is audited | it meets WCAG 2.2 AA: text contrast ≥4.5:1, every input has a visible label, every control is keyboard-reachable with a visible focus ring, touch targets ≥44px, body text ≥14px and no text below 12px |
| AC-20 | US-10 | a user with "reduce motion" on, or any status indicator | it renders | status indicators do not pulse, ping or bounce; transitions are ≤200ms and disabled under reduce-motion |
| AC-21 | US-11 | the codebase and every screen | they are searched | the product name is "ParkFlows" everywhere (browser titles, app names, copy); "ParkFlow" and "ParkOrbit" occur 0 times in UI strings; one logo is used on every surface |
| AC-22 | US-11 | product copy | it is reviewed | no internal or marketing jargon in the UI (e.g. "Neural network", "BOLA", "HMAC chain", "v4.2 Enterprise"); monospace type is used only for plates, slot codes, IDs and timestamps |

### Brand, marketing site, user testing (US-16, US-17)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-29 | US-16 | 2–3 logo and colour directions are presented | the user picks one | the chosen logo works at 16px (favicon), 48px (app icon) and full size, in colour and single-colour; the brand colour meets 4.5:1 contrast for text on white; the user approves it in writing before any screen is built |
| AC-30 | US-17 | parkflows.in | it is redesigned | it uses the same logo, colour, type and components as the console; every claim on it is true of the product today (no fabricated stats, per AC-04); its "Sign in" goes to admin.parkflows.in; it works at 360px, 768px and 1280px |
| AC-31 | all (US-04..US-06, US-12, US-17) | mockups of the key screens | they are tested with Alphatech staff (Site Admin + at least 2 others) | each person completes the agreed tasks; issues found are fixed in the mockups or logged before build starts; results are written into 02-ux-design.md |

### Book a demo form (US-18) — parkflows.in `/demo/`, server task B6
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-32 | US-18 | a visitor on parkflows.in with JavaScript on | they open `/demo/` and send the form | **Fields:** name, company, work email, phone, city, facility type (Office park / Tech campus / Mall / Hospital / Residential / Other), parking slots (optional), number of sites (optional), how to contact them (Email / Phone), message (optional, ≤ 1,000 characters). **7 required fields:** name (2–80 chars), company (2–120), work email (valid), phone (10-digit Indian number, with or without +91), city (2–80), facility type, contact preference. Optional numbers must be whole numbers 1–100,000. **Consent** checkbox is required: "I agree that ParkFlows may contact me about a demo. We keep these details for up to 12 months." with a link to the privacy note. Each invalid field shows its own message and focus moves to the first one. On success the form is replaced by **"Thanks — we'll contact you within one working day."** |
| AC-32a | US-18 | the request reaches the server (B6) | it is valid / invalid / a bot / too frequent | valid → stored, `{ success: true }`, nothing echoed back; invalid → **400** with a message per field, shown on that field; the hidden honeypot field **`pf_hp_field`** filled in → silent `success: true`, **nothing stored**; more than 5 requests per 10 min from one IP or 30 per hour overall → **429**, shown as "Too many requests right now" with the email/phone fallback |
| AC-32b | US-18 | the network fails or the server returns any other error | the visitor sends the form | they see "We couldn't send your request" with sales@parkflows.in (an email link pre-filled with what they typed) and +91 98206 03518, and what they typed stays in the form |
| AC-32c | US-18 | JavaScript is off or `demo.js` fails to load | the visitor opens `/demo/` | **no form is shown**; they see "This form needs JavaScript — Email sales@parkflows.in or call +91 98206 03518 instead." Personal data is **never** sent in a page URL or query string (the form uses POST only) |
| AC-32d | US-18 | a stored demo request | it is handled | **no IP address or browser details are stored** with it, **nor in any ParkFlows audit or security event written by this public route** (`RATE_LIMIT_EXCEEDED` for the demo limiter and `DEMO_REQUEST_NOT_VIA_HOSTING` carry `ipAddress: redacted` and no user-agent; the IP is used in memory for rate limiting only). Google Cloud's own request logs (Cloud Run / Firebase Hosting in Cloud Logging) may hold the client network address under the project's log retention (default 30 days, no export or sink); the privacy note discloses this (v1.7, m-3); it is readable only by Master Admins (console "Demo requests" page, CSV export); it is **deleted automatically 12 months** after it was sent; a Master Admin can **delete one request on request** from the person (privacy note promise). These are B6 requirements: the privacy note is only true once B6 meets them |

### Legal pages (US-17) — before R2
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-33 | US-17 | the Android apps (R2) and Play Store listing point to `parkflows.in/privacy` and `/terms` (`LegalModal.tsx`) | R2 ships | `/privacy/` covers **both** the website/demo-request note and the apps' privacy policy (one page, clear sections), and `/terms/` exists with the terms of service; both use the design system and are linked from the footer. Content drafted by PM from the Attendant app's PRIVACY_POLICY.md / TERMS_OF_SERVICE.md and **reviewed by the user (or legal) before publishing**. Not required for R1a |

### Site isolation and permissions (no regression from 001)
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-23 | all | a Site Admin of Site A | they use any redesigned screen | the current site is shown in exactly one place (the site switcher), never contradicted elsewhere; no Site B data or count appears anywhere |
| AC-24 | all | a Master Admin viewing "All sites" | they open a list | each row shows its site; write actions are disabled with a "Choose a site" prompt (001 behaviour kept) |
| AC-25 | all | the Role View Simulator is active | any screen renders | the persistent "Viewing as <user> · Exit" banner is shown (001 AC-55 kept) |
| AC-26 | all | the redesign branch | the 001 QA suite (`npm run test:qa`) runs | every test that passed before the redesign still passes |

### Empty, loading and error states
| AC ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-27 | US-01 | any list or panel | it is loading / empty / failed | it uses the standard skeleton / empty state (reason + next step) / error state (plain message + Retry); server errors are never shown as "Offline" |
| AC-28 | US-07 | the Attendant app loses connection | it shows status | "Offline" appears only for real loss of network, with a clear banner; server errors say "Something went wrong — try again" |

## Out of scope
- New features or business-logic changes (flows stay as in 001; only presentation, layout, copy, and removal of fake data/duplicate entry points). **One approved exception:** the Book-a-demo form and its Master-only console page (US-18 / AC-32), approved by the user on 2026-10-03/06.
- Backend changes, except removing or hiding endpoints that serve fabricated data (AC-06).
- iOS apps (001 Phase 3).
- Offline mode for the Attendant app (001 OQ-7).
- Dark theme (OQ-3).
- Translations / regional languages (OQ-6).
- Android app redesign in the 10 Oct release — moves to R2 (OQ-8).
- Figma files (OQ-7).

## Non-functional requirements
- **NFR-1 parkflows.in performance (new, from QA BUG-2).** Every public page (home, `/demo/`, `/privacy/`) meets Core Web Vitals "good": **CLS < 0.1**, LCP ≤ 2.5 s, INP ≤ 200 ms. Lab check before each marketing deploy: Lighthouse (mobile and desktop) **performance ≥ 90 and CLS < 0.1** on each page. Field data is checked after launch once there's traffic.
- **NFR-2 parkflows.in privacy.** No cookies, no analytics or advertising scripts, no requests to third-party hosts (fonts self-hosted).
- **NFR-3 console.** Redesigned console screens must not load slower than the 001 screens they replace (measured on the same machine and data).
- **NFR-4 touch targets.** AC-19's 44px minimum on touch or below 768px applies to **every** interactive element, including checkbox rows without visible text and **standalone links** (e.g. "Forgot password?" under a field). Exemption (UX 02, confirmed 2026-10-08): a link is exempt only when it is part of a sentence of running text — words of the same sentence before or after it, on the same line, height set by that line (e.g. "Read our privacy note" in the consent line). Every other link is standalone and needs a 44px target on touch or below 768px, and 24px with a mouse at 768px and wider (e.g. "Forgot password?", "View all", "Back to sites", links in cells, cards, toasts, footer, nav).
- **NFR-5 tables by width (UX 02, QA O-1).** Tables show the full column set at ≥1280px, a priority set at 768–1279px (hidden values stay available in the side panel), and cards below 768px. Tables are not designed to scroll sideways; container overflow is kept only as a 200%-zoom safety net. Tab strips may scroll.

## AC verification scope
- **R1-pre (T1–T6) can only show the foundation parts** of AC-01, AC-02, AC-03, AC-04, AC-05, AC-18, AC-21 and AC-30 (tokens, components, preview harness, marketing site).
- **AC-06 as a whole, and the screen parts of AC-02, AC-03, AC-04, AC-05, AC-18 and AC-21, are verified only after F1–F8 (after the 001 merge) and B6.** QA must not mark them passed from R1-pre evidence.
- **AC-21 cannot fully pass until F8** renames `index.html` and `mobile.html` titles and the legacy "ParkFlow" components (`EmployeeMobileApp`, `ValetXModule`, `MasterAdminRole*`, `AttendantMobileApp`, `RoleHomePage`) — QA O-6.
- **AC-32a and AC-32d** can only pass once B6 and the D1 hosting rewrite are live; until then the form always shows the AC-32b error state (expected).

## Success metrics
- **Trust:** 0 fabricated numbers on any screen (AC-04 audit).
- **Consistency:** 100% of in-scope screens use design tokens; 0 inline styling blocks left in redesigned screens.
- **Accessibility:** WCAG 2.2 AA audit passes; Lighthouse accessibility ≥ 95 on the 5 main console pages.
- **Usability:** with 3–5 real users (Alphatech Site Admin, attendants, employees), time to complete key tasks (find a vehicle, approve a pass, record an entry) drops by ≥ 30% against the current UI, and no task needs help.
- **Perception:** Alphatech Site Admin and at least one prospective customer rate the new UI ≥ 4/5 for "looks professional and trustworthy".
- **No regression:** 001 QA suite pass count unchanged or higher (AC-26).
- **All P0/P1 issues** from the Sep 2026 UI Design Review closed.

## PM sign-off: parkflows.in copy (2026-10-07, 05 M-2 / AC-30)
Read on `feature/002-design-system` @ `e449b82` (`marketing/index.html`, `marketing/demo/index.html`, `marketing/privacy/index.html`).
| Copy | Decision |
|---|---|
| Employee passes card: "Your site admin adds employees and their vehicles, one at a time or from a CSV, and approves or rejects each pass request." | **Approved as is** |
| Step 2: "…one at a time or from a CSV, and approves each pass request." | **Approved as is** |
| Valet: "Check cars in, track each car's status, and log retrieval requests at the valet desk." | **Approved as is** |
| Security: "…and every entry and exit is recorded in the parking log." | **Approved as is** |
| Reports card (QA O-3): "Utilisation, occupancy trend and vehicle mix for your site." | **Change to:** "Utilisation, occupancy trend and the mix of registered and visitor vehicles for your site. Export the entry and exit log to CSV." (the product's chart is registered vs visitor, not vehicle types) — frontend-dev |
| Privacy: "We don't store your IP address or browser details with your request." / "Your request is kept in the ParkFlows system, not in a mailing list." / 12-month deletion / delete on request | **Approved as requirements on B6** (AC-32d). Must be re-checked against the built B6 before D1 deploys the site. B6 currently has no way to delete a single request — architect/backend to add it |
| All other home, demo and privacy copy | **Approved as is** (each claim matches 04 gap 10's check against the 001 code) |

## PM copy for R1a (flag `demo-form` OFF) — code review R3-1 and R3-7 (2026-10-09)
Decision: **option (a)**. The privacy note and the /demo/ "What happens next" line get a flag-off version; the current text stays for flag ON (R1b, once B6 is live). Frontend gates both behind the same `demo-form` flag. Use these sentences exactly.

**`/privacy/` (flag OFF):**
- Intro: "This note covers parkflows.in, the ParkFlows website, and what happens when you email or call us about a demo."
- **What we collect:** "Only what you choose to send us: the contents of your email, such as your name, company, contact details and anything you tell us about your site, or the details you give us on a phone call. Like any email, your message also carries standard email information, such as your email address and when it was sent. This website itself doesn't collect any personal information."
- **Why we use it:** "To reply to you and arrange a ParkFlows demo, the way you asked us to. We don't sell it or share it for marketing."
- **Who can see it:** "Only the ParkFlows team members who handle demo enquiries. Emails are kept in our business mailbox, which our email provider runs for us. We don't add you to a mailing list."
- **How long we keep it:** "Up to 12 months after our last contact with you. After that we delete it."
- **Asking us to delete it sooner:** "Write to sales@parkflows.in from the email address you used, and we'll delete your enquiry." (mailto subject: "Delete my enquiry")
- **Cookies and tracking** and **Contact:** unchanged.
- Meta description (flag OFF), confirmed by PM 2026-10-09: "What ParkFlows does with the details you send when you email or call us about a demo."

**`/demo/` "What happens next" (flag OFF):** "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it."

**Condition (user):** the 12-month promise is a manual process until B6 exists. The sales mailbox owner must delete demo-enquiry emails 12 months after last contact, and delete on request. The user confirms this when giving the R1a "go".

## PM decision: IP and user-agent in logs for the demo route (05 R1b m-3, 03 v1.3) — 2026-10-13
**Decision: accept the architect's recommendation.** The ParkFlows security audit must **leave out** the IP address and user-agent for every event written by the public `POST /api/v1/demo-requests` route (the demo limiter's `RATE_LIMIT_EXCEEDED`, and `DEMO_REQUEST_NOT_VIA_HOSTING`). These events keep `actor: anonymous`, `ipAddress: redacted`, no user-agent, and the route without a query string, so attacks can still be counted. **All other routes keep 001's full audit** (IP + user-agent), because they serve staff and sign-in attempts.

**Why:** the privacy note and AC-32d promise no IP or browser details are stored with the request. A ParkFlows audit row with the visitor's IP next to the time of their submission would break that promise, and would bring that row under the 12-month and delete-on-request rules. The security value is low (10-minute window, global cap, honeypot).

**Platform logs:** Google Cloud's request logs for Cloud Run (and Firebase Hosting, if enabled) record client network addresses, and we can't turn that off. The privacy note must say so. **Copy change for the flag-ON `/privacy/` "What we collect" paragraph:** replace the sentence "We don't store your IP address or browser details with your request." with exactly:

> "We don't store your IP address or browser details with your request, or anywhere else in the ParkFlows system. Like most websites, our hosting provider, Google Cloud, keeps standard server logs that include the network address of each visit, for up to 30 days, to keep the service running and secure. We only look at them to fix problems or stop abuse."

The flag-OFF (live R1a) note is unchanged: with no form there is no ParkFlows server request.

**Conditions (R1b gates):**
- **Backend (B6b):** redaction as in 03 v1.3 tests 5–6 (demo-route events redacted; login throttle still records the real IP).
- **DevOps:** confirm in `08` that the Cloud Logging `_Default` bucket for the project keeps logs **30 days or less**, that no sink or export copies request logs elsewhere, and which address the D1 path's request log shows. If retention is longer, the PM changes "30 days" before the flag goes ON.
- **Frontend:** apply the sentence above to the flag-ON `/privacy/` only.
- **Security review (step 7):** confirm this decision.

## PM release split and triage for R1b (2026-10-17)
**Split R1b into two releases:**
- **R1b-console (target 19 Oct):** the redesigned console (B1–B6, F1–F10) deployed with the marketing demo-form flag still **OFF**. Gates: the fixes below reviewed and re-tested, security delta PASS for the R1B-S1 fix, the 001 S7-1 control checks (V1b + V2 + scheduler list) run before and after the switch, the europe-west1 trigger disabled before `main` is pushed, and the user's go.
- **R1b-form (after R1b-console):** turn the demo form ON. Extra gates: DevOps sets and records `DEMO_HOSTING_EGRESS_CIDRS`, the D1 preview checks pass (incl. no trailing-slash redirect of the POST), log retention is ≤30 days with no sink, R1B-S2 is fixed, and sales@parkflows.in receives mail.

**Triage (security review 07 and QA 06):**
| Item | Decision | Reason |
|---|---|---|
| **R1B-S1** (Medium, pre-existing 001): mixed-case `/API/V1/...` paths skip the sign-in, view-as and site-scope gates | **Fix now as a production hotfix on `main`, and carry it into `feature/002-r1b`.** Doesn't wait for R1b | It's live today: an unauthenticated caller can read data (e.g. roles). This breaks US-01 site isolation and the "every API needs a verified session" rule |
| **R1B-S2** (Low): the global `/api/` limiter logs the visitor's user-agent on the demo path | **Fix before the form goes ON** (R1b-form) | Contradicts the PM m-3 decision (v1.7). Only reachable when the form is on |
| R1B-S3 (CIDR, trailingSlash) | DevOps gate for R1b-form | As above |
| R1B-S4 (30/h cap DoS), R1B-S6 (expiry self-heal) | Accept for now; watch counts, CAPTCHA if abused (K9) | Availability only |
| R1B-S5 (delete race) | **Keep Cloud Run `max-instances=1`** until fixed in R1.1 | Safe at one instance |
| **BUG-R1B-6** (axe 2.5.3 Label in Name, bell/account) | **Fix before R1b-console** | WCAG Level A; AC-19 requires AA |
| **BUG-R1B-7** (Sites panel shows made-up contact defaults as real) | **Fix before R1b-console** (backend stops storing defaults for new sites; panel shows "—" for missing values) | Breaks AC-04/AC-05 honest data on a screen in this release |
| BUG-R1B-4 (custom-role nav fails open; API still 403) | **Defer to R1.1** | UI-only: the server still refuses (AC-08 server half holds); only one custom role exists today |
| BUG-R1B-5 (Demo badge empty up to ~60 s) | Defer to R1.1 | Cosmetic; the page itself is correct |
| BUG-R1B-8 (reload during view-as restore ends the view) | Defer to R1.1 | Pre-existing, Master-only, fails safe |
| R1b-C1 (Sites panel lists only role-site-manager admins) | Defer to R1.1 | Display only |

## Bug triage (QA R1-pre, 2026-10-07)
| Bug | Decision | Reason |
|---|---|---|
| BUG-1 (minor) card checkbox 20×44 and "Forgot password?" link 115×20 at 360px | **Fix now, before F1** | These are shared components (`.pf-check` in table cards, `.pf-link`); F1–F7 will reuse them on every screen, so fixing once now is cheaper than failing AC-19/NFR-4 on each screen later |
| BUG-2 (minor) `/demo/` CLS 0.60 mobile / 0.37 desktop (home 0.19 at 360) | **Fix now, before D1 deploys parkflows.in** (does not block F1) | The marketing site is the first thing prospects see and CLS is a search-ranking signal; NFR-1 now sets CLS < 0.1. The fix must keep M-1's guarantee (JS off → no form, no query string) |
| BUG-3 (minor, QA r3) flag ON only: noscript inline `<style>` blocked by the D1 CSP (`style-src 'self'`) | **Fix before the flag is turned on (R1b)**; doesn't block R1a | R1a ships with the flag off, so the noscript block isn't built; AC-32c still holds via inert/visibility, but the console error and CSP conflict must be gone before the form goes live |
| R3-2 header logo 106×24, R3-3 sort button 31×44 (code review r3) | **Fix now, in the same commit as R3-1** | NFR-4 names nav links; both are one-line CSS and the logo is on every public page on 10 Oct |
| R3-4..R3-6 (nits) | **Defer to R1.1** | Lint edge cases and an unused exemption; no user impact |

## Open items for other roles (from PM sign-off, 2026-10-07 — not done by PM)
- **Architect:** in 03, rename the B6 honeypot field `website` → `pf_hp_field` (client already sends `pf_hp_field`); add a **Master-only delete of a single demo request** to B6/F10 (privacy note promise, AC-32d).
- **Frontend:** apply the O-3 reports sentence above in `marketing/index.html`; fix BUG-1 and BUG-2; close **R2-1 and R2-2** in `lint:styles` before F1 relies on it.
- **UX:** confirm the "In since" wording ("In since 09:14" today, "In since 3 Oct 2026, 09:14" on earlier days); confirm the inline-link exemption wording for NFR-4 (PM position: standalone links like "Forgot password?" are **not** exempt); decide QA O-1 (tablet tables scrolling inside their container vs dropping columns).
- **DevOps:** add `dist-mobile/` and `dist-marketing/` to `.gitignore` (QA O-4).
- **QA:** before D1 deploys, re-check the privacy note against the built B6 (O-5) and run NFR-1 on all three public pages.

## Proposed approach (for orchestrator — not a design or tech decision)
1. **Design system first** (UX: brand direction → tokens → components), approved by the user.
2. **Logo + colour directions**, then **mockups as shareable design pages** (no Figma) of: Site Admin Overview, Live parking, Employees & vehicles, Master Admin Sites, marketing site home. Test with Alphatech staff, then user approval.
3. **Build** after 001 is merged: tokens and components first, then screens role by role, each through code review and QA.

## Open questions
All resolved. OQ-1..OQ-9 answered by the user on 2026-10-02. On 2026-10-03 the user approved the PRD without separate answers to OQ-11..OQ-13, so the PM's recommended defaults apply (the user can overrule any of them):
- **OQ-11 → option (a).** 10 Oct (R1) = brand (logo + colour) + design system + marketing site parkflows.in + 5 key console screens: Login, Site Admin Overview, Live parking, Employees & vehicles, Master Admin Sites. The remaining console screens follow in R1.1 (date to be set). All AC apply to R1 screens; the other console screens meet them in R1.1.
- **OQ-12 → yes.** The Android apps (and `/attendant` gate screens) get the redesign in R2, the release after 10 Oct.
- **OQ-13 → keep the Predictive Analytics module, but label it clearly** "Sample data — not live" on every number and chart until real data exists, so it doesn't break AC-04. (AC-06 updated.)

## Changelog
| Version | Date | Change | By |
|---|---|---|---|
| v1.0 | 2026-10-02 | First PRD: 15 stories, 28 AC | product-manager |
| v1.1 | 2026-10-02/03 | User answers OQ-1..OQ-10; US-16 brand, US-17 marketing site, AC-29..AC-31; release plan R1/R1.1/R2; PM defaults for OQ-11..OQ-13; approved 2026-10-03 | product-manager / user |
| v1.2 | 2026-10-07 | Wrote in the user decisions of 2026-10-06: **US-18 / AC-32, AC-32a–d** (Book-a-demo form, honeypot `pf_hp_field`, consent + 12-month retention, JS-off fallback, success / 400 / 429 / network states, B6 privacy requirements incl. delete-on-request); **AC-14** changed to paged slot cards 12/20/36/60; new **NFR-1..4** (parkflows.in Core Web Vitals, privacy, console speed, touch targets); **AC verification scope** notes (AC-06 and screen parts after F1–F8/B6; AC-21 after F8); parkflows.in **copy sign-off** (one sentence changed, O-3); **bug triage** BUG-1/BUG-2 | product-manager |
| v1.2.1 | 2026-10-08 | NFR-4 exemption wording from UX 02; new NFR-5 (tables by width, O-1) | product-manager |
| v1.3 | 2026-10-08 | User decision: 10 Oct ships the marketing site only (R1a) with a contact panel instead of the demo form until B6 + D1 are live; console redesign moves to R1b, about a week after DevOps merges 001 to `main`. User approved 03 v1.2 and the UX 02 decisions | product-manager / user |
| v1.4 | 2026-10-08 | From DevOps 08 (R1a prep): R1a go-live preconditions incl. working sales@parkflows.in mailbox; new AC-33 (one /privacy/ page for website + apps, new /terms/) required before R2 | product-manager |
| v1.5 | 2026-10-09 | Code review r3 escalation: PM chose option (a); wrote R1a (flag-off) privacy note and /demo/ "What happens next" copy; triage BUG-3 (before flag on), R3-2/R3-3 (now), R3-4..6 (R1.1); 12-month manual deletion as user condition for R1a go | product-manager |
| v1.6 | 2026-10-11 | R1a live (email gate waived; MX due 14 Oct). R1b target 18 Oct with go-live gates incl. security review | product-manager |
| v1.7 | 2026-10-13 | 05 R1b m-3 / 03 v1.3: PM accepts "no IP or user-agent in audit/security events from the public demo route"; AC-32d extended to audit events and to disclose Google Cloud request logs (≤30 days, no export); new flag-ON privacy sentence; DevOps retention check and security-review confirmation added as R1b gates | product-manager |
| v1.8 | 2026-10-17 | R1b split into R1b-console (target 19 Oct, flag OFF) and R1b-form (flag ON, after DevOps CIDR/D1/retention, R1B-S2, email). Triage: R1B-S1 production hotfix now; R1B-6/7 before R1b-console; R1B-4/5/8, C1 → R1.1; S5 keep max-instances=1 | product-manager |

Status: APPROVED (by user, 2026-10-03; v1.2 edits record decisions the user approved on 2026-10-06)
