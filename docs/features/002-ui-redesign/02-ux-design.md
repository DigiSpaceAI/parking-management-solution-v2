# UX Design — 002 UI Redesign & ParkFlows Design System
Feature ID: 002 · Author: ux-designer · Started: 2026-10-03 · Input: `01-prd.md` v1.1 (APPROVED), "UI Design Review (Sep 2026)", `001/02-ux-design.md` v1.1 (flows unchanged)

Delivery runs in four steps, and the user approves each one before the next starts:

| Step | Deliverable | Status |
|---|---|---|
| 1 | Logo + brand colour directions (shareable design page) | **Approved: B · Bay** (user, 2026-10-03) |
| 2 | Design system: tokens + core components with all states | **Approved** (user, 2026-10-03: "yes") |
| 3 | Mockups: Login, Site Admin Overview, Live parking, Employees & vehicles, Master Admin Sites, parkflows.in home | **Approved** (user, 2026-10-03; Live parking after the slot-card revision) |
| 4 | Alphatech test script + results log | **Done**. Sessions concluded, no major observations (user, 2026-10-03); see Test results |
| — | Design-system decisions after R1-pre (type, metrics, control height, full logo, T3 classes) | **For approval** (2026-10-06); decisions needed by 7 Oct |
| — | PRD v1.2 open points: "In since" wording, NFR-4 inline-link exemption, tablet tables (QA O-1) | **For approval** (2026-10-08) |

This file follows the team template. The sections for flows, screens, states, copy, accessibility and traceability are filled in at steps 2–4. Flows themselves don't change in 002 (PRD out of scope: "flows stay as in 001"); only presentation, layout and copy do.

---

## Gaps found in PRD
1. **No trademark or domain check is in scope.** AC-29 covers legibility and contrast, not whether the chosen mark or the name "ParkFlows" is free to use. Recommendation: before the logo is final, run a quick trademark search (India, class 9 / 42) and check the app-store name. This is a business/legal task, not a UX one.
2. **Fonts and the "no new dependencies" rule.** All three directions use free Google Fonts (OFL licence). Whether they load from Google or are self-hosted in the build is the architect's call (rule 5 in CLAUDE.md). The mockups load them from Google Fonts.
3. **Status colours vs brand colour.** The PRD doesn't say whether status colours (Vacant / Occupied / Reserved / Maintenance, Allowed / Refused) may change. **UX decision:** they stay fixed across all directions (green / red / amber / slate, each ≥ 5:1 on white) so the gate and floor plan read the same whatever brand is picked. A brand colour must not be confused with them; direction C is weakest here (below).
4. **AC-29 "single-colour" and 16 px.** Every direction ships a simplified favicon drawing (thicker strokes, fine detail dropped). This counts as the same logo at a small size, not a second logo, so AC-21 ("one logo on every surface") still holds.
5. **Alphatech testing (AC-31) needs a named contact** and two 30-minute slots before 9 Oct for the R1 date to hold. This is raised now so it can be booked during steps 2–3.

---

## Step 1 — Brand directions (APPROVED: B · Bay)
**Decision (user, 2026-10-03): "use B".** This is the written approval AC-29 asks for. The recommendation below (A) was not taken; B's lower clash with the status colours was the deciding strength. The 16px favicon drops the free bay (see Logo below).
Design page: **ParkFlows Brand Directions** (Claude design canvas: an overview board plus one detail board per direction showing the logo, a 128/48/32/16 px scale test, colour with contrast ratios, type, and the brand in use on a console card, the gate result and the website hero).

Shared across all three: the wordmark "ParkFlows" with a heavy "Park" and a medium "Flows"; mono type (JetBrains Mono) only for plates, slot codes, IDs and times (AC-22); fixed status colours; sample screens use placeholders like [n] instead of made-up numbers (AC-04).

| | A · Route | B · Bay | C · Pin |
|---|---|---|---|
| Idea | The "P" is a road ending at a parked spot (amber dot) | The "P" is built from parking bays with one bay free | A map pin with a "P" cut in |
| Brand colour | Signal blue `#0B5CAD` (6.7:1 on white) | Royal navy `#1F3A93` (10.1:1) | Go-green `#0A6847` (6.8:1) |
| Supporting | Ink `#0F172A`, slate `#475569`, amber accent `#E8A317` (decor only) | Ink `#12213F`, teal `#0E7490` (5.4:1), light teal `#5EEAD4` (on navy only) | Ink `#13261E`, moss grey `#4B5A53`, marigold `#F2A900` (decor only) |
| Type | Plus Jakarta Sans | Sora (headings) + IBM Plex Sans (text) | Figtree |
| Feel | Clear, calm, mainstream SaaS | Bank-grade, technical, serious | Warm, friendly, "go" |
| Small sizes | **Best.** One bold stroke; reads at 16 px | Good to 32 px; at 16 px the free bay disappears | Good; the pin shape is distinctive, but the app icon needs a tile behind it |
| Clash with status colours | Low: amber dot is decorative, close to "Reserved" amber | **None**: navy and teal sit apart from all statuses | **High**: brand green sits next to "Vacant / Allowed" green, so green buttons and green statuses compete |
| Risk | Blue is common in SaaS: less distinctive | Sora is wide; long Hindi/English names may need care later | Green plus pin is close to many maps and mobility brands |

**Recommendation: A · Route.** It is the simplest mark, holds up best at favicon and app-icon size, and its blue doesn't compete with the gate's green and red. **B · Bay** is a strong second choice if you want a more serious, "enterprise" feel. I'd avoid C unless green is a must, because it weakens the meaning of green on the gate and floor plan.

Ways to decide: pick A, B or C, or ask for a mix (for example A's mark in B's navy). AC-29 requires your written approval of the final logo and colour before any screen is built.

---

## Step 2 — Design system (for approval)
Reference page: **ParkFlows Design System** (Claude design-system page: brand book, tokens, logo files, and a live preview plus usage rules for every component). Reference copies for the architect and developers, not app code, are in `docs/features/002-ui-redesign/design-system/`: `tokens.json` (all tokens) and `components.css` (the component styles, written only with token variables). How these become Tailwind theme values and React components is the architect's decision (step 3).

### Tokens (summary — full list with usage notes in `tokens.json`)
| Family | Tokens |
|---|---|
| Brand | `navy-50` #EEF1FA · `navy-100` #D9E0F4 · **`navy-600` #1F3A93** (10.1:1) · `navy-700` #14295E · `ink` #12213F (16:1) |
| Accent | `teal-600` #0E7490 (focus ring, 5.4:1) · `teal-50` #E6F4F7 · `teal-300` #5EEAD4 (on ink only) |
| Neutrals | `surface-0` #FFF · `surface-25` #F5F6FA (page) · `surface-50` #EEF1F5 · `line-100` #E1E5EF (decor) · `line-300` #7D889E (control edges, 3.6:1) · `text-secondary` #475569 (7.6:1) · `text-muted` #5B6475 (6.0:1) · `text-disabled` #94A3B8 |
| Status | success `-50/-600/-700` · danger `-50/-600/-700` · warning `-50/-600/-700` · `neutral-600`; tints carry dark text (≥4.5:1), solids carry white (≥5.0:1) |
| Type | Sora: `display-xl` 48/56, `display` 36/44, `title-1` 24/32 (page H1), `title-2` 18/26, `kpi` 28/34 · IBM Plex Sans: `title-3` 16/24, `body-lg` 16/24, **`body` 14/20 (default)**, `small` 13/18, `caption` 12/16 (minimum) · JetBrains Mono: `mono` 14/20, `mono-lg` 32/38 (plates, slots, times only) |
| Spacing | 4px grid: `space-1` 4 · 2 8 · 3 12 · 4 16 · 5 20 · 6 24 · 8 32 · 12 48 · 16 64 |
| Radius | `radius-sm` 4 · `radius-md` 8 (buttons, inputs) · `radius-lg` 12 (cards) · `radius-xl` 16 (modals, panel, gate) · `radius-full` |
| Elevation | `shadow-1` cards · `shadow-2` menus, toasts · `shadow-3` modals, panel · `focus-ring` (2px white + 2px teal) |
| Motion | `duration-fast` 120ms · `duration-base` 200ms (max) · `ease-standard`; 0ms under reduce-motion; no pulsing status |
| Sizes | `control-sm` 32 · `control-md` 40 (console) · `control-lg` 48 (apps, gate) · `touch-min` 44 · `header-h` 56 · `sidebar-w` 248 · `panel-w` 440 |
| Breakpoints | 360 · 768 · 1024 · 1280 |

### Components and states (AC-03)
| Component | States shown |
|---|---|
| Button: primary, secondary, destructive, ghost, icon; sm/md/lg | default, hover, focus, disabled, loading |
| TextField (incl. plate/mono variant) | default, hover, focus, filled, disabled, error (with message), help text, required |
| Select | default, focus, disabled, error |
| Checkbox and radio | unchecked, checked, focus, disabled, error |
| StatusChip, count badge, site tag | Vacant, Occupied, Reserved, Maintenance; Pending, Approved, Rejected, Revoked, On hold |
| Banner + "Viewing as" bar | info, warning, danger, success; persistent simulator bar |
| Tabs | selected, hover, focus, disabled, with count |
| Pagination | current, hover, disabled, rows per page, range text |
| Table | header, sorted, hover row, selected row, row menu, bulk checkbox, loading rows |
| KpiCard | value, no data ("—" + reason), loading |
| SlotTile (floor plan) | vacant, occupied, reserved, maintenance, selected, focus |
| Toast | success, success + undo, error + retry |
| EmptyState / ErrorState / Skeleton | nothing yet + next step; failed load + retry; loading placeholders |
| Modal | confirmation with required reason |
| SidePanel | record details + actions |
| SiteSwitcher | single site, multi-site closed/open, phone compact, All sites |
| AppShell (top bar, grouped nav, page header) | active, hover, focus nav item; counts; one primary action |
| GateResult (R2) | allowed, not allowed, check needed |

### Decisions and open points
- **One theme (light)**, per OQ-3. Tokens are named by role so a dark theme can be added later without renaming.
- **Icons: Lucide** (MIT): outline, 2px stroke. It's a new dependency for the architect to approve (CLAUDE.md rule 5); the previews draw the same shapes inline.
- **Fonts:** Sora, IBM Plex Sans and JetBrains Mono (all OFL). Google-hosted in the previews; self-hosting is the architect's call.
- **Vacant vs Occupied** differ in lightness as well as hue (light tile vs solid tile), so they work for colour-blind users (AC-15, AC-19).
- **Clay-style 3D illustrations** are allowed on the marketing site only, marked *proposed* in the brand book. Confirm or drop.
- **Not in the system yet** (added with the step 3 mockups if a screen needs them): date-range picker, file upload / CSV drop zone, stepper, toggle switch, avatar menu.

---

## Step 3 — Mockups (for approval)
Design page: **ParkFlows R1 Mockups** (a Claude design canvas using the ParkFlows design system). It has 5 console screens at 1440px and the parkflows.in home page, all fluid down to phone width, plus the Overview drawn at 390px. The console screens link to each other when you press Play (Login → Overview → Live parking / Employees & vehicles). All names, plates and numbers are **example data** (a note on the canvas says so). In the product every figure comes from the API.

**Design-system additions found while drawing** (to fold into the system after approval):
- a **slot card** and a **pallet row** (status tint + border, plate chip, outlined Mark exit);
- a **segmented view switcher** and **level buttons** with free/total counts;
- a **bulk-action bar** (an info banner with actions);
- a **phone nav drawer**;
- an **occupancy bar**;
- a **simple bar chart**.

### S1 · Login (`Main`)
- **Layout:** a two-part split that stacks on phones.
  - Left: an ink brand panel with the logo, the line "Every slot, every site, at a glance.", and a bay-pattern strip.
  - Right: the form.
- **Form:**
  - Email and Password fields with visible labels, 48px tall.
  - "Forgot password?" next to the Password label.
  - **Sign in**: a full-width primary button.
  - The line "Working at the gate? Open the gate screen" for attendants.
- **States:** the error banner reads "That email and password don't match. Check them and try again. After 5 attempts the account locks for 15 minutes." The canvas has a toggle to show it. Loading: the button shows "Signing in…". Locked: the same banner, with the time left.
- **Fixes from the review:** one logo, no demo-credential presets, no version pill.
- **AC:** AC-19, AC-21.

### S2 · Site Admin · Overview (`Overview`, `OverviewPhone`)
- **Shell:** a 56px top bar with the logo and the site chip ("Alphatech Pune · ALP"). For a single-site admin the chip is not a menu, and it is the only place the site name appears in the shell. On the right: the bell and the account. Next to it, the grouped sidebar (Operations / People / Setup), whose badges are counts only.
- **Header:** H1 "Overview", the line "Today at Alphatech Pune · Friday, 3 Oct 2026", "Updated 12s ago", and one primary button: **Open live parking**.
- **KPI cards (4, each a link):**
  - Occupied now 412 / 1,080 · 38% full · 668 free
  - Entries today 286 · 71 exits
  - Pending pass requests 3 · oldest waiting 2 days
  - Open alerts 2 · parked over 12 hours
- **Cards:**
  - *Occupancy by level*: B1–Ground bars with "168 / 360" labels.
  - *Needs your attention*: pending requests, overstay and maintenance, each with Review / View.
  - *Entries by hour today*: a bar chart from the gate log, with a value on every bar and the peak hour darker.
  - *Latest at the gate*: 4 rows plus "View full log".
- **Phone (390px):**
  - The menu becomes a drawer behind a 44px menu button.
  - The site chip shows the code only (the full name is in its aria-label).
  - KPIs sit in a 2×2 grid; the gate rows become two-line items.
- **States:** a new site shows "—" in every KPI, with reasons ("No vehicles logged today"). The chart's empty state is "No entries yet today". A failed section shows its own ErrorState; the rest of the page still works.
- **AC:** AC-04, AC-05, AC-07, AC-09, AC-10, AC-18, AC-23.

### S3 · Site Admin · Live parking (`LiveParking`, interactive) — revised 2026-10-03
**User direction:** keep today's features and information and the same card layout; restyle it to the new design and make small changes so the information is easier to read. Keep the Puzzle status pallets view. The earlier "dense tile grid + side panel" idea was dropped.

**Kept from today's `LiveFloorPlan.tsx`:**
- **View switcher:** Live parking slots (count) · Puzzle wise status (count; renamed from "Puzzle status pallets").
- **Level selector:** All parking · Basement B1 · B2 · B3 · Ground / driveway, each with "N free / total".
- **Filters:** search across slot, plate and location; status (All / Vacant only / Occupied only / Reserved / Maintenance); slot type (EV / SUV 2.5 m / Sedan stacker / Two-wheeler).
- **Five summary figures:** level capacity, vacant, occupied, reserved, under maintenance.
- **Slot cards:**
  - Contents: slot number, EV icon, type chip, parking-type chip (Ground / Puzzle / Stack), the plate on a dark chip when occupied or a status chip otherwise, level or location, and height. Sorted vacant first.
  - **Mark exit** sits on each occupied card.
  - Pages hold 12 / 20 / 36 / 60 slots.
- **Puzzle stacker cards:** grouped by puzzle number, with the pallets inside, free and occupied counts, plate and Exit per pallet.
- **Slot details modal:**
  - Slot type and clearance, parking type, allocation, ANPR camera.
  - Occupied: the vehicle plus **Record exit and free slot**.
  - Vacant: "Park a vehicle in this slot" (plate + vehicle type → Record entry).
  - Status buttons: Maintenance / Reserve / Set vacant.

**Changed for readability:**
- **Design system:** all text is 12px or larger (it was 8.5–10px), and enum words are plain ("Occupied", not OCCUPIED).
- **Card colours:** cards use the status tint with a matching status border.
- **Summary figures:** shown in their status colours on tints, instead of five identical grey boxes.
- **Pagination:** one bar under the grid with page numbers and a range ("Showing 1–20 of 1,080"). The duplicate top and bottom bars, and the "◄ Previous Page" text arrows, are gone.
- **Mark exit:** an outlined danger button, not a solid red one on every card, so a full page isn't a wall of red.
- **Pallets:** listed as **rows with the top level first** (Level 3 → 1), so the stack reads like the machine. Six stackers per page instead of 4.
- **Fake values removed (AC-04, AC-06):**
  - "PLC OPERATIONAL", "Hydraulic Lift Ready", "Safety Sensor: CLEAR" and "Lock: OK" are replaced by one honest line: "Stacker controller (PLC) — not connected". It shows real values when a PLC feed exists.
  - The fake ANPR camera fallback (G-ANPR-CAM01) now shows "—".
- **Empty states:** a no-match search shows "No slots match these filters" with **Clear filters**. In the pallet view: "No puzzle stackers match these filters. Ground and driveway slots are flat, so they don't appear here."

**Slot card (user decision 2026-10-03):** from four options on page "3a · Slot card options", the user chose:
- **B · Status band** for the cards. A white card with a status band on top (solid red for Occupied, tints for the others). It shows the slot code, a line explaining it ("Puzzle 03 · Pallet 1" / "Ground · Bay 14"), a type chip with the EV icon, the plate as the largest text with "In since 09:14", and **Height** and **Length** boxes with arrow icons. The repeated "Basement B1" line at the bottom is removed, because the level is already in the code.
- **D · List row** as an optional **Cards | List** switch: a table with Status · Slot · Type · Height · Length · Vehicle · Mark exit.
- **C · Bay drawing** is kept for a future release, with more detailed icons.

The second view is **renamed "Puzzle wise status"** (user, 2026-10-03). Each puzzle card now shows its pallets as the same B cards (status band with "Level n", code, type, plate, Height / Length, Mark exit), top level on the left, two puzzles per row. The slot modal shows H × L as well.

**New data needed (for the architect):**
- **Slot length** (metres). Today slots store height only. It means a new field in the slot model, the Inventory CSV and the slot form.
- **"In since"** comes from the open entry-log record for the slot, not from the slot itself.

**In the prototype:** the views, levels, filters, search, page size and pages all work. Clicking a card opens the modal; Mark exit, Record entry and the status buttons update the card and show a toast.

**AC:** AC-04, AC-06, AC-11, AC-12, AC-13, AC-19, AC-20, AC-27.
**Change to AC-14:** with the cards kept, a 1,080-slot site is paged (up to 60 per page) rather than shown on one screen. The PM should mark AC-14 as changed by user direction.

### S4 · Site Admin · Employees & vehicles (`Employees`, interactive)
- **Header:** the H1 and the line "Review pass requests and manage who can park at Alphatech Pune." Primary **Add employee**; Import CSV and Download template sit in the "⋯" menu. This merges Registration and Approvals (AC-11).
- **Tabs:** Requests (count) · Registered (148) · Rejected · Revoked.
- **Filters:** search (name, employee ID or plate) and department.
- **Table (7 columns):** select · Employee (name, ID and department) · Email · Vehicles (up to 2, mono) · Waiting (an amber chip once 2 days old) · Status · Approve / Reject.
- **In the prototype:**
  - Selecting rows shows the bulk bar "2 selected · Approve 2 · Reject · Clear".
  - Approve removes the row and shows the toast "1 request approved".
  - Reject opens a modal that requires a reason: "Choose a reason. The employee needs to know why." appears if none is chosen.
  - When no requests are left, the EmptyState "No pending requests for Alphatech Pune" appears.
- **AC:** AC-05, AC-09, AC-11, AC-12, AC-13, AC-27.

### S5 · Master Admin · Sites (`Sites`, interactive)
- **Landing:** this is the Master Admin's landing page (AC-10). The switcher reads "All sites" (a menu). The nav is Sites · Users & roles · Billing · Audit log · Settings.
- **Header:** H1 "Sites", the line "Every customer site on ParkFlows. Click a site to see details or change it.", "Updated 20s ago", and primary **Add site**.
- **KPI cards:**
  - Sites 4 (3 active · 1 on hold)
  - Occupied now, all sites 1,022 / 2,300
  - Pending pass requests 3
- **Table:** Site and city · Code (site tag) · Occupied now (bar plus "412 / 1,080"; or "— no slots yet" / "— site on hold") · Pending · Status chip ("On hold", never ON_HOLD) · Last activity ("2 min ago").
- **Side panel:** city, facility, capacity, billing, site admins, email domains, onboarded date ("18 Sep 2026"). An On-hold site also gets the banner "On hold since 12 Sep 2026. Reason: …". Actions: **Edit site** · Change status · "⋯" (View as site admin).
- **Fixes from the review:** rows now open a panel with edit; status labels are readable; no developer notes.
- **AC:** AC-10, AC-12, AC-13, AC-24.

### S6 · parkflows.in · Home (`Home`)
- **Header:** logo, Features · How it works · Security, "Sign in" (goes to admin.parkflows.in, AC-30), and primary **Book a demo**.
- **Hero:** the eyebrow "Parking management for India's workplaces", the headline "Calm, organised parking for offices, campuses and malls.", and a line about replacing paper registers and WhatsApp groups. CTAs: Book a demo and See how it works. Beside it, a product preview built from real components (floor-plan tiles, the Allowed gate result, a pending-requests card), not a stock image.
- **Sections:**
  - Six features: live floor plan, gate entry by plate, employee passes, overstay alerts, reports and exports, valet desk (optional).
  - "Live in three steps", then a "Built for" row: office parks, tech campuses, malls, hospitals.
  - "Your site's data stays your site's": separate by site, roles, a record of every change.
  - An ink demo band with **[YOUR CONTACT EMAIL]** and **[YOUR PHONE]** placeholders.
  - The footer.
- **Honest claims (AC-04, AC-30):**
  - No customer logos, testimonials or statistics.
  - Each feature line is worded to match what the product does today. Plate scanning is described as "record entries and exits", not as automatic pass checks, until the 001 gate-authorisation fix ships.
  - **Before launch, re-check every line against the live product.**
- **No clay illustrations.** You hadn't confirmed them, so the hero uses a product preview instead. They can be added later if you want them.
- **AC:** AC-18, AC-21, AC-30.

### Open questions for review
1. The marketing site needs a real contact email and phone, and the destination for "Book a demo" (a form, an email or a calendar link).
2. Should Overview's primary button be **Open live parking** (as drawn) or **Review requests**?
3. Is the 2-day "waiting" threshold on requests right for Alphatech?

---

## Step 4 — Alphatech usability test (AC-31)
Test page: **Alphatech Usability Test**, a claude.ai page with four tabs:
- **Script**: what to read aloud, the tasks, and what to ask afterwards.
- **Record results**: one form per participant, saved to the page's shared store.
- **Summary**: worked out from the saved results.
- **Issues**: a log, with each issue's status set to Open / Fixed in mockup / Logged for build / Won't fix.

The page is private until shared, and only people in your organisation can open it.

**Participants:**

| Code | Role | Tasks |
|---|---|---|
| P1 | Alphatech Site Admin | T1–T4, T6, T7 |
| P2 | Parking supervisor or senior attendant | T1–T5 |
| P3 | Facility manager or employee | T1, T7, T8 |
| P4 | Optional: second admin or a prospective site | as needed |

Only codes and roles are recorded, never names.

**Tasks** (30 minutes, 3 minutes per task, think aloud; a hint counts as "With help"):

| Task | Screen | Prompt (short) | Success |
|---|---|---|---|
| T1 | Login | Sign in | Reaches Overview unaided |
| T2 | Overview | How many slots are free, and what needs attention? | Says 668 free; names requests or alerts |
| T3 | Live parking | MH 12 AB 3456 is leaving: record the exit | Finds the card or row; Mark exit; sees the toast. **Also timed on today's UI** |
| T4 | Live parking | Free slot with 2.5 m headroom for an SUV in B2 | B2 + filter; names a vacant 2.5 m card |
| T5 | Puzzle wise status | A B1 puzzle with a free top level | Names a puzzle whose Level 3 is vacant |
| T6 | Employees & vehicles | Approve Neha; reject Arjun (not on the list) | Both done, reason chosen. **Also timed on today's UI** |
| T7 | parkflows.in | What does ParkFlows do? How to get a demo and sign in? | Two real features; finds Book a demo and Sign in |
| T8 | Phone | Parked count, then menu → Employees & vehicles | Reads 412 / 1,080; uses the menu |

**Measures** (from the 002 PRD success metrics):
- completion without help per task;
- median time;
- ease, 1–7 per task;
- trust ("professional and trustworthy", 1–5, target ≥ 4);
- time saved on T3 + T6 against today's UI (target ≥ 30%);
- quotes and issues.

**After the sessions:** I'll read the saved results and issues and write them here under "Test results". Before tech design starts (AC-31), each issue is either fixed in the mockups or logged for the build.

### Test results
- **Reported by the user, 2026-10-03:** "Alphatech test sessions concluded, no major observation." AC-31 is met on that basis: no issues to fix or log.
- **Not recorded:** the results page holds no saved sessions and no logged issues. So the per-task completion rates, times, ease scores, the trust rating (target ≥ 4/5) and the time saved on T3/T6 (target ≥ 30%) were **not measured**.
- **Recommendation:** re-run T3 and T6 with timing and the trust question once R1 is built, so the PRD's success metrics can be confirmed.

---

## Hand-off to the architect (step 3)
**Sources of truth** (all private claude.ai pages; share them with the team):
- **ParkFlows Design System**: brand book, tokens, logo files, 21 components with previews and usage rules. The latest additions are **SlotCard** (option B, plus a compact pallet variant) and **SegmentedControl / level buttons**. Reference copies are in `docs/features/002-ui-redesign/design-system/` (`tokens.json`, `components.css`). These are documentation, not app code.
- **ParkFlows R1 Mockups**: one page per screen: Login, Overview, Live parking, 3a slot-card options, Employees & vehicles, Sites, parkflows.in home, and Overview on a phone. The console screens are clickable.
- **Alphatech Usability Test**: script, results and issue log.

**Decisions the tech design needs to make or confirm** (UX makes no API or data-model choices):
1. **Token pipeline:** how `tokens.json` becomes the single styling source for the web console now and the Android apps in R2 (Tailwind theme, CSS variables or both). The goal is to retire the 808 inline-style blocks (AC-01, AC-02).
2. **New dependencies** (rule 5): the Lucide icon set, and the fonts Sora, IBM Plex Sans and JetBrains Mono (self-hosted or Google).
3. **Slot length:** a new field in the slot model, the Inventory CSV and the slot form. It's shown on every slot card, list row and modal.
4. **"In since":** the entry time on occupied slots and pallets, joined from the open entry-log record.
5. **PLC / stacker status:** today it's hardcoded. Show real values only if a feed exists; otherwise the UI shows "Stacker controller (PLC) — not connected" (AC-04, AC-06).
6. **Fabricated values:** remove them, or label them "Sample data — not live" (Predictive Analytics, AC-06).
7. **Live parking paging:** paged at 12–60 slots, not one screen. AC-14 was changed by user direction, so the PM should update the PRD.
8. **Marketing site** (parkflows.in): where it's hosted, the Book a demo destination, and the contact email and phone (still placeholders). Feature claims must match the live product at launch (AC-30).
9. **Release slicing for 10 Oct:** brand + design system + parkflows.in + 5 console screens. Other screens follow in R1.1, and the Android apps in R2.

---

## Design-system decisions after R1-pre (2026-10-06)
**Status: FOR APPROVAL.** Answers `04-implementation-notes.md` Frontend gaps 6 (off-scale values), 7 (desktop control height) and 8 (full logo), and confirms the classes T3 added. Source of truth from now on is the branch's `src/design-system/tokens.json` (checked identical to the reference copy before these changes). The reference copies in `design-system/` now show the end state: `tokens.json` = branch tokens + the additions below; `components.css` = branch `components.css` with every change below applied, so `diff src/design-system/components.css docs/features/002-ui-redesign/design-system/components.css` (ignoring the 3-line header) is the exact edit list. UX does not touch the branch; the frontend applies these.

### A. Off-scale font styles → type tokens
Pattern kept from the text group (`body` / `body-strong`): one size, two weights. All mono tokens stay in the "Data (JetBrains Mono)" group, so the AC-22 rule (mono only for plates, slot codes, IDs, times) is unchanged.

| # | Found (where) | Decision | Token (weight size/line, family) | Visual change | Reason |
|---|---|---|---|---|---|
| A1 | 600 12/14 mono, `.pf-tile` (slot code on a tile, small slot codes) | **New token** | `mono-xs-strong` 600 12/16 mono | Line 14 → 16px; two lines now take 32px of the tile's 42px inner height | 16px is the line of every other 12px style (`caption`); 14px clipped descenders at 125% zoom |
| A2 | 500 12/14 mono, `.pf-tile small` (last 4 of the plate) | **New token** | `mono-xs` 500 12/16 mono | Line 14 → 16px | Same as A1; 12px stays the smallest text anywhere (AC-19) |
| A3 | 700 22/28 display, `.pf-gate-head` (GateResult, R2) | **Map to existing** | `title-1` 600 24/32 Sora, tracking −0.01em | +2px size, weight 700 → 600, line +4px | One R2 component doesn't justify a new display size; 24px reads better at gate distance. Revisit in R2 gate design if the head needs 700 |
| A4 | 600 18/24 mono, `.pf-slot-code` (SlotCard B) | **New token** | `mono-md` 600 18/24 mono | None | Approved card B hierarchy: slot code second only to the plate |
| A5 | 600 20/26 mono + 0.04em, `.pf-slot-plate` (SlotCard B) | **New token** | `mono-plate` 600 20/26 mono, tracking 0.04em | None | The plate is the card's most critical line (user, 2026-10-03). Its tracking also replaces the literal 0.04em on `.pf-input--mono` |
| A6 | Compact pallet card: code and plate both `title-3` size / 22px line | **Map to existing** | code → `mono` 500 14/20; plate → `mono-md` 600 18/24 | Code −2px, plate +2px, both off the 22px line | Keeps plate > code on the compact card too; removes the last off-scale line height |
| A7 | Marketing eyebrow + step number: `caption` + 0.08em, uppercase | **New token** (text group) | `eyebrow` 500 12/16 IBM Plex Sans, tracking 0.08em | None | Two uses, one style; website only, never in the console |

### B. Literal metrics
| # | Found | Decision | Token / value | Visual change | Reason |
|---|---|---|---|---|---|
| B1 | Spinner turn 800ms | **Tokenise** | `duration-spin` 800ms | None | A loop period, not a transition, so the 200ms maximum doesn't apply. The generator sets it to 0ms under reduce-motion; the existing `animation: none` rule keeps the spinner static, with the busy label still announced |
| B2 | Select arrow padding 36px | **Express with tokens** | `calc(var(--icon-sm) + var(--space-3) + var(--space-2))` = 36px | None | Arrow (16) + right inset (12) + gap to text (8). No new token |
| B3 | Checkbox 20px, border 1.5px | **Tokenise size; border fixed** | `checkbox` 20px; border stays 1.5px | None | 1.5px on `line-300` gives a crisper 3:1 edge than 1px and reads lighter than 2px. Borders aren't tokenised: 1px default, 1.5px checkbox/radio only, 2px invalid/focus, 6px checked radio. Comment it in the CSS |
| B4 | Check icon 14px (+ 16/18/20/24px icons elsewhere) | **Tokenise, one icon scale** | `icon-xs` 14 · `icon-sm` 16 · `icon-md` 20 · `icon-lg` 24 | Slot-card dimension icons 18 → 20px (the only change) | Four icon sizes, each with named uses (see tokens.json). 18px was the only off-scale icon; 20px matches the 20px value line beside it |
| B5 | Tile height 48px / min width 56px | **Height → existing; width → token** | height `control-lg` (48); `tile-min-w` 56px | None | A tile is a 48px target, the same as `control-lg`. The 56px width fits "S1-042" at `mono-xs-strong` |
| B6 | Marketing eyebrow tracking 0.08em | **Tokenise** (A7) | `--text-eyebrow-tracking` 0.08em | None | — The website's plate preview (`.mk-gate-plate`) also used 0.08em: change it to `--text-mono-plate-tracking` (0.04em) so plates look the same everywhere (−0.04em) |
| B7 | Text measure 46rem (×2, website) | **Tokenise** | `measure` 46rem | None | About 75 characters at `body-lg`; one value for prose and section intros |
| B8 | Link underline offset: console 2px, website 3px | **Tokenise, one value** | `underline-offset` 3px | Console links (`.pf-link`, "Viewing as" exit) +1px | One link style across console and website; 3px clears descenders on 14px and 16px text |
| B9 | Also found: modal 480px (×2), slot-card grid 212px, compact band 30px, grid gap 12px, `.pf` 20px line, `.pf-label-sm` and menu `small` line heights, `th` and plate 0.02/0.04em | **Tokenise / map** | `modal-w` 480px; `slot-card-min` 212px; compact band → `control-sm` (+2px); gap → `space-3`; lines → `--type-body/caption/small`; tracking → `--text-caption-tracking` / `--text-mono-plate-tracking` | Compact band +2px only | Same values, now traceable |
| B10 | Remaining spacing literals (about 40: 2/4/6/8/10/12px paddings and gaps in chip, count, site tag, `th`, field, slot card) | **Fixed for R1** | — | — | Too close to 10 Oct to re-space approved components. R1.1: map 4/8/12 to `space-*`, and move 2/6/10px to the nearest step after a visual check |

### C. Desktop mouse control height
**Decision: keep `control-md` 40px / `control-sm` 32px for mouse on screens ≥ 768px.** No 44px everywhere.

| Rule | Value | Reason |
|---|---|---|
| Every interactive target, any device | ≥ 24×24px, or 24px spacing (WCAG 2.2 AA 2.5.8) | 32px and 40px pass with margin |
| Mouse, ≥ 768px | Default control 40 (`control-md`); 32 (`control-sm`) only where listed below | Console density: 25–50 table rows and filter bars fit at 1280px without scroll |
| Touch (`pointer: coarse`) or < 768px | Every control min `touch-min` 44, as built (gap 7) | Fingers, gloves, guards |
| Mobile apps, gate (R2) | `control-lg` 48 | Unchanged |
| **Allowed 32px exceptions (desktop mouse only)** | Small buttons inside table rows (the row is the 44px target), pager buttons, toast/banner close, `pf-btn--sm` in toolbars | All already go to 44 in the touch rule |
| Already ≥ 44 on desktop | Tabs, nav items, menu items, checkbox/radio label rows, level buttons (52) | No change |
| **One fix** | Add `.pf-switcher` (40px) to the touch rule | It was the only 40px control missing from it |
| Not targets | Status chips, count badges, site tags (display only); inline text links inside sentences (2.5.8 inline exception) | — |

### D. Full logo
**Decision: approved as built.** Checked `parkflows-logo.svg` / `-reversed.svg` against the brand book at 64, 32, 24 and 20px on white and on `ink`: the mark is identical to the approved mark, the gap from mark to the "P" stem is 19px at 64px (16px gap + the glyph's side bearing) = about 0.3 × mark, the cap height is 28px = 0.44 × mark, and "Park" 700 / "Flows" 600 reads as one word with a light split. No geometry corrections.

| Item | Decision | Value | Reason |
|---|---|---|---|
| Spacing, size ratio | Keep | 16px gap, 38px type at a 64px mark (283×64 viewBox) | Matches the brand book (wordmark space-2–3 after the mark at header size) and the approved mockups within 2px |
| Colours | Keep | Positive: mark `navy-600`, free bay `teal-300`, wordmark `ink`. Reversed (on `ink`/`navy-600`): mark tile white, tiles `navy-600`, free bay `teal-600`, wordmark white | As approved in step 1 |
| Clear space | **Confirm brand-book rule for the full logo** | Half the mark's width on every side: 32px at 64px high, 16px at the 32px header | Same rule as the mark (step 2 brand book), so one rule covers both |
| Minimum size | **Add rule** | Full logo ≥ 24px high (≈106px wide). Smaller: the mark alone (≥ 24px, as the brand book), and below 24px only the favicon | At 20px the wordmark caps are 9px and soften on 1× screens |
| Favicon | **Confirmed** | `parkflows-favicon.svg` (no free bay) at 16px; same file for 32px | Checked at 16px: the 3×2 tiles stay separate |
| Lockup use | Header/console: 32px high. Website header: 32px (40px ≥ 768px, as built). Never stretch, recolour, or add effects | — |

### E. New token-only classes from T3
All confirmed; they use only tokens and match the approved mockups. They're added to the reference DS page (SegmentedControl, Dialog, Toast region, Table cards, Occupancy & bars).

| Class | Decision | Note |
|---|---|---|
| `pf-seg` / `pf-seg-btn` | **Confirm** | 36px (= `control-md` − `space-1`) inside a 4px padded track = 44px outer; 44 on touch |
| `pf-level` / `pf-level-btn` | **Confirm** | 52px; selected `navy-600` with `navy-100` sub-line (7.6:1) |
| `pf-bulkbar` | **Confirm** | `navy-50` bar with `navy-100` edge; appears only when ≥ 1 row is selected; text "N selected" + actions |
| `pf-drawer` | **Confirm** | Left dialog, `min(sidebar-w, 100% − space-12)`; focus trapped, Esc closes |
| `pf-dialog` `--modal` / `--panel` | **Confirm** | Native `<dialog>`; modal `modal-w` (B9); panel `panel-w`, full width < 768px; fade / slide at `duration-base`, 0ms under reduce-motion |
| `pf-occ` | **Confirm** | Track `space-2` high; the screen adds `--high` (danger fill) at ≥ 90% occupancy. The % is always printed beside the bar, so colour is never the only cue. **Adjust:** remove the fill's width `transition` — values refresh every few seconds and status never animates |
| `pf-bars` | **Adjust** | Bars `navy-100` → **`navy-600`**, peak `navy-600` → **`ink`**, as in the approved Overview mockup. `navy-100` on white is 1.3:1, below the 3:1 for chart parts (1.4.11); `navy-600` is 10.1:1. The peak is also marked by its bold `ink` value label, since `ink` vs `navy-600` is only 1.6:1 |
| `pf-toast-region` | **Confirm** | Bottom-right `space-4`, `z-toast`; `role="status"` (errors `role="alert"`); max 3 stacked |
| Table phone cards (< 768px, `data-cards="true"`) | **Confirm** | One card per row; `dl` grid 2fr / 3fr; row actions at the card foot at 44px; the checkbox stays first |

### Frontend changes (exact list)
**`src/design-system/tokens.json`** (then `npm run tokens`; `tokens --check` must pass):
1. `type` → "Text (IBM Plex Sans)": add `eyebrow` 500 12px/16px, letterSpacing 0.08em.
2. `type` → "Data (JetBrains Mono)": add `mono-xs` 500 12/16 and `mono-xs-strong` 600 12/16 before `mono`; add `mono-md` 600 18/24 and `mono-plate` 600 20/26 (letterSpacing 0.04em) after `mono`.
3. `duration`: add `duration-spin` 800ms.
4. `size`: add `icon-xs` 14px, `icon-sm` 16px, `icon-md` 20px, `icon-lg` 24px, `checkbox` 20px, `tile-min-w` 56px, `slot-card-min` 212px, `modal-w` 480px, `measure` 46rem, `underline-offset` 3px.
   (Usage text for each is in the reference `tokens.json`; copy the file's additions as they are.)

**`src/design-system/components.css`** (`lint:styles` must pass):
1. `.pf` line → `var(--text-body-line)`; `.pf-label-sm` → `font: var(--type-caption)`; `.pf-menu-item small` → `font: var(--type-small)`.
2. Icon sizes: 16px → `var(--icon-sm)` (btn, spinner, field error, page, switcher, menu check, slot band), 20px → `var(--icon-md)` (icon-btn, banner, toast, nav, slot dim, was 18px), 24px → `var(--icon-lg)` (state icon), check 14px → `var(--icon-xs)`.
3. `.pf-spinner` animation → `var(--duration-spin)`.
4. `.pf-select` padding-right → `calc(var(--icon-sm) + var(--space-3) + var(--space-2))`. The arrow (`.pf-select-wrap::after`) width/height/margin → `var(--icon-sm)` instead of `space-4` (same 16px, named for what it is).
5. `.pf-check-box` 20px → `var(--checkbox)`; add a comment that the 1.5px border is a fixed value (B3).
6. `.pf-tiles` `minmax(var(--tile-min-w), 1fr)`; `.pf-tile` height `var(--control-lg)`, font `var(--type-mono-xs-strong)`; `.pf-tile small` `var(--type-mono-xs)`.
7. `.pf-gate-head` → `font: var(--type-title-1); letter-spacing: var(--text-title-1-tracking)`.
8. `.pf-slot-code` → `var(--type-mono-md)`; `.pf-slot-plate` → `var(--type-mono-plate)`; compact: split the shared rule into code `var(--type-mono)` and plate `var(--type-mono-md)`; compact band height `var(--control-sm)`.
9. `.pf-slot-grid` `minmax(var(--slot-card-min), 1fr)`, gap `var(--space-3)`.
10. `.pf-modal` and `.pf-dialog--modal` width → `var(--modal-w)`.
11. `text-underline-offset` (`.pf-link`, `.pf-viewing-as-exit`) → `var(--underline-offset)`.
12. `letter-spacing: 0.04em` (×2) → `var(--text-mono-plate-tracking)`; `0.02em` (×2) → `var(--text-caption-tracking)`.
13. `.pf-bars-bar` → `var(--navy-600)`; `.pf-bars-bar--peak` → `var(--ink)`.
14. Touch media query: add `.pf-switcher` to the `min-height: var(--touch-min)` selector list.
15. `.pf-occ-fill`: remove `transition: width …`.

**`marketing/site.css`**: `.mk-eyebrow`, `.mk-step-num` → `font: var(--type-eyebrow); letter-spacing: var(--text-eyebrow-tracking)`; `.mk-gate-plate` letter-spacing → `var(--text-mono-plate-tracking)`; `max-width: 46rem` (×2) → `var(--measure)`; `.mk-band a` underline offset → `var(--underline-offset)`.

**Brand files:** no change. Add the clear-space and minimum-size rules (D) to `src/design-system/brand/README` if one exists, otherwise to the preview page.

**Check after applying:** preview page at 360 / 768 / 1280px (tile, slot card full + compact, select, checkbox, bars), axe 0 violations, `tokens --check`, `lint:styles`, build.

---

## UX decisions for PRD v1.2 open points (2026-10-08)
**Status: FOR APPROVAL.** Answers the three UX items in `01-prd.md` (open points), `05-code-review.md` m-9 and `06-test-report.md` BUG-1 / O-1. Docs only; the frontend applies them.

### 1. "In since" wording (m-9): confirmed
| Case | Shown | Rule |
|---|---|---|
| Entry today (IST calendar day) | **In since 09:14** | Time only, 24-hour, IST |
| Entry on an earlier day | **In since 3 Oct 2026, 09:14** | Day without a leading zero, short month, year, comma, time — exactly `formatDateTime` |
| No open entry record | **In since —** | As built (AC-05) |

- "Today" means the same IST date as now, so 23:59 yesterday shows the date at 00:01. That's correct, as built in `formatSince()` (`4a6fefe`).
- No relative words ("yesterday", "2d ago"): they go stale on a screen that refreshes in place and read badly at midnight. The date is enough for an attendant to spot a car parked for days.
- The same text on SlotCard (full and compact), SlotRow (list D), the slot modal and screen readers. The value ("3 Oct 2026, 09:14") doesn't wrap; if the card is too narrow, the whole value moves to the next line under "In since".

### 2. Inline-link exemption for NFR-4: confirmed, with the PM's position
**Wording for 01 NFR-4 / AC-19 (replace "Only links inside a running sentence are exempt"):**

> A link is exempt from the 44px minimum only when it is part of a sentence of running text — it has words of the same sentence before or after it, on the same line, and its height is set by that text's line height (for example "Read our **privacy note**" in a consent line, or "Ask your **site admin**" in an error message). Every other link is a standalone link and needs a 44px target on touch screens or below 768px, and 24px with a mouse at 768px and wider: a link alone in a line, form row, list item, table cell, card, toast, banner, footer, nav or breadcrumb, such as "Forgot password?", "View all", "Back to sites" or "Open".

| Item | Decision | Reason |
|---|---|---|
| Default | `.pf-link` is **standalone** by default: `display: inline-flex; align-items: center; min-height: var(--touch-min)` inside the touch rule (`pointer: coarse` or < 768px), `min-height` 24px otherwise | The safe default; a dev has to opt in to the exemption |
| Exempt variant | `.pf-link--inline` (or any `a` inside `.mk-prose` / help text) keeps the text's line box, no min-height | WCAG 2.2 2.5.8 inline exception |
| Spacing | Two standalone links side by side keep at least `space-2` between their 44px boxes | Avoids mis-taps |
| BUG-1 "Forgot password?" (115×20 at 360px) | Standalone → 44px tall target; the visible text and underline don't move (padding, not font size) | Not exempt |
| BUG-1 card checkbox (20×44) | A checkbox with no visible label gets a 44×44 hit area (`.pf-check` `min-width: var(--touch-min)` + `justify-content: center`); the box stays `checkbox` 20px. Its `aria-label` names the row ("Select Rahul Sharma") | NFR-4 covers checkbox rows without text |

### 3. QA O-1: tablet tables drop columns, they don't scroll
**Decision: tables never need sideways scrolling at a designed width. Between 768px and 1279px a table shows a reduced column set; the hidden values are always in the row's SidePanel. Below 768px tables are cards (as built).** The `overflow-x: auto` on `.pf-table-wrap` stays only as a safety net for 200% zoom and unusually long values; it is not a designed state.

Why: sideways scroll inside a table pushes the right-hand columns, which hold Status and the row action, off screen, and on a touch tablet it fights the page's vertical scroll. Content width is about 720px at 768px (no sidebar below 1024px) and about 730px at 1024px (with the 248px sidebar), so both ends of the range get the same set. At 1280px (about 970px) the full set fits.

| Breakpoint | Shows |
|---|---|
| ≥ 1280px | All default columns (max 7, AC-12) |
| 768–1279px | **P1 columns only** (below); merged columns as listed |
| < 768px | `pf-table-cards`: every P1 and P2 value as label / value pairs |

| Table | P1 at 768–1279px (in order) | Hidden or merged | Where the hidden value goes |
|---|---|---|---|
| S4 Employees & vehicles (7) | select · Employee · Vehicles · Status · Actions | **Email** hidden. **Waiting** merged into Status: "Pending · 3 days" (amber chip once 2 days old). Actions: **Approve** (`sm`) + "⋯" with Reject (reason modal) | Email in the SidePanel and on the card |
| S5 Sites (6) | Site and city (code as a `pf-site-tag` on line 2) · Occupied now · Pending · Status | **Code** moved under the site name; **Last activity** hidden | Last activity in the SidePanel and on the card |
| S3 Live parking list D (7) | Status · Slot · Type · Size · Vehicle (plate + "In since") · Mark exit | **Height + Length** merged into **Size**: "1.8 × 5.0 m" (H × L, header "Size (H × L)") | Separate Height and Length in the slot modal and cards. Both dimensions stay visible (user: they are critical) |
| Future tables (R1.1) | Each table spec marks columns P1 (identity, status, primary action) or P2 | P2 hidden at 768–1279px | SidePanel and card |

- **Below 768px, Live parking "List"** uses the same card pattern (`data-cards="true"`): one row per slot as a card with Status chip and Slot on line 1, plate · In since on line 2, Size and Type on line 3, Mark exit at the foot (44px). This removes the 360px SlotRow scroll in O-1.
- **Tab strips** (O-1, 312 → 422px at 360px): scrolling inside the strip is allowed. The selected tab scrolls into view on load, and the last visible tab is cut part-way so the scroll is obvious. No arrows.
- **QA check (AC-18):** at 768, 1024 and 1280px with the example data, no `.pf-table-wrap`, slot list or card grid has `scrollWidth > clientWidth`; at 200% zoom, scroll inside a table is allowed (WCAG 1.4.10 exempts data tables).

---

## User flows (per story)
_Unchanged from 001 (see `001/02-ux-design.md` §2). Layout changes are documented with the mockups at step 3._

## Screens & wireframes (text)
See Step 3 above: one entry per screen, with layout, content and the interactions in the prototype.

## States: loading / empty / error / success / no-permission / offline
Component states: see Step 2. Screen states: see the States line under each screen in Step 3. Every list uses Skeleton (loading), EmptyState (empty, with the site or range named) and ErrorState (failed, with Try again). "Offline" only shows for a real network loss.

## UI copy (labels, buttons, messages)
The copy rules are in the design system's brand book (Content fundamentals). The screen copy is in the mockups and is final unless testing changes it. Key strings are listed per screen under Step 3.

## Accessibility notes
- Brand colours: all three meet ≥ 4.5:1 for text on white (AC-29). Accent colours (amber, marigold, light teal) fail as text on white and are limited to decoration or text on dark backgrounds; the design system will enforce this.
- Text pairs: every text token's usage note names the surfaces it is checked on (≥4.5:1). Control borders (`line-300`) and the focus ring (`teal-600`) are ≥3:1 on every light surface.
- Focus: one `focus-ring` on every interactive element, never removed. Every component preview shows its focus state.
- Sizes: `body` 14px minimum for body text, `caption` 12px minimum anywhere; touch targets ≥44px, gate controls 48px.
- Status is never colour alone: chips carry words (and icons for slots), tiles differ in lightness and pattern, gate results state the outcome in words.
- Motion ≤200ms, none under reduce-motion, no pulse/ping/bounce (AC-20).
- Forms: visible labels, `aria-invalid` + `aria-describedby` error lines, focus to the first error on submit.

## Traceability: element → story / AC
| Element | Story | AC |
|---|---|---|
| Three logo + colour directions with a 16/32/48/128 px scale test and a single-colour version | US-16 | AC-29 |
| Brand colour contrast ≥ 4.5:1 on white, shown per swatch | US-16, US-10 | AC-29, AC-19 |
| Single wordmark "ParkFlows" used in console, app and website samples | US-11, US-17 | AC-21, AC-30 |
| Mono only for plates/slots/times in type samples | US-11 | AC-22 |
| Placeholder values ([n]) in samples, no invented numbers | US-02 | AC-04 |
| Fixed status colours across directions | US-07, US-12 | AC-15 |
| Token set (colour, type, spacing, radius, elevation, motion, sizes) in one `tokens.json`; component CSS uses only token variables | US-01, US-15 | AC-01, AC-02 |
| Component library with all states (table above) | US-01 | AC-03 |
| KpiCard "—" + reason; EmptyState copy rules | US-02 | AC-05, AC-27 |
| ErrorState / Banner wording: "Offline" only for no network | US-01 | AC-27, AC-28 |
| AppShell: grouped nav, names match titles, count-only badges, one primary action | US-03, US-04 | AC-07, AC-09 |
| Table: ≤7 columns, 25/50 pagination, row → SidePanel, Indian formats | US-05 | AC-12, AC-13 |
| SlotTile grid + SidePanel (Esc/outside closes) | US-12 | AC-14 |
| SiteSwitcher at every width; All sites → site tags + disabled writes | US-09, US-01 | AC-18, AC-23, AC-24 |
| Viewing-as bar | — | AC-25 |
| Mono only for data; caption 12px minimum; reduce-motion | US-10, US-11 | AC-19, AC-20, AC-22 |
| GateResult (for R2) | US-07 | AC-15, AC-16 |
| S1 Login: one logo, labelled 48px fields, error banner | US-10, US-11 | AC-19, AC-21 |
| S2 Overview: landing for Site Admin, real KPIs with "—" fallback, attention list, phone layout | US-02, US-06, US-09 | AC-04, AC-05, AC-10, AC-18 |
| S3 Live parking: today's cards, levels, filters, summary, pallets view and modal, restyled; honest PLC line; single pagination | US-12, US-13, US-02 | AC-04, AC-06, AC-11, AC-12 (AC-14 changed by user direction) |
| S4 Employees & vehicles: merged area, 7-column table, bulk approve, reject with reason, empty state | US-05, US-13 | AC-11, AC-12, AC-27 |
| S5 Sites: Master landing, readable statuses and dates, row → panel with edit | US-05, US-06 | AC-10, AC-13, AC-24 |
| S6 parkflows.in home: same brand and components, honest claims, Sign in → admin.parkflows.in, fluid to 360px | US-17 | AC-30 |
| Alphatech test script, results recorder, summary and issue log | US-04..06, US-12, US-17 | AC-31 |

Status: READY FOR TECH DESIGN (user approval 2026-10-03: "good to proceed for next level of development"). AC-31 closed: sessions concluded with no major observations (metrics not recorded; see Test results).
