# Browser check plan: 001-parkflows-platform-v1, step 6 (Phase 1)
Owner: qa-engineer · Written: 2026-09-29 · Status: **PLAN**. It runs after code review round 3 passes and B17 is built.
Sources: `03-tech-design.md` v1.0.1 (F1–F9, L-1..L-8), `02-ux-design.md` v1.1 (§3.0, L-3, L-8, G-18), `04-implementation-notes.md` (frontend "How to test manually" 1–8), `05-code-review.md` round 2 ("QA (step 6)").

These checks cover what the API suite (`001-platform-v1.api.test.mjs`) can't: what the console shows and enables. The results go into `06-test-report.md` as MAN-02, AS-* and VA-* rows.

## 1. Environment
- **Build under test.** A clean clone of `feature/001-parkflows-platform-v1` at the commit code review round 3 approves. I don't use the working copy, which has uncommitted doc edits.
  - Install with `bun install --frozen-lockfile`.
  - Build with `VITE_API_BASE_URL=http://127.0.0.1:<port> npm run build` (frontend gap 2: without it, sign-in goes to production).
  - Start with `NODE_ENV=production PORT=<port> BOOTSTRAP_ADMIN_PASSWORD=… SEED_DEMO_USERS=false` and the Firestore variables blank. `SITE_SCOPE_MODE` is unset (strict). The working dir is a temp dir, so it's an in-memory store and never production.
- **Browser.** Headless Chromium through Playwright 1.56, already installed in the QA cloud workspace (`/opt/pw-browsers`). The repo is brought over as a `git bundle`, as code-reviewer did in round 2.
  - The script lives at `tests/qa/browser/001-console.check.mjs`. It imports Playwright from the workspace's global install, so it adds **no dependency**, and it is **not** part of `test:qa`.
  - **Proposal for the orchestrator:** adding `@playwright/test` as a devDependency, so this can run in CI, needs approval under CLAUDE.md rule 5. Until then it's a QA-run script.
- **Viewports.** 1280×800 for everything. MAN-02 and AS-* are repeated at 375×812 (bottom-sheet chip, L-1).
- **Evidence per check.** A screenshot at each assert point, a HAR of `/api/v1/*`, and a console log. All go in the QA workspace. `06` quotes the counts and failures.

## 2. Fixtures (seeded through the API before the browser opens, same helpers as the API suite)
The local demo seed puts all 1,080 slots on `site-default`, which strict mode can't select (frontend gap 1). So I build my own data:

| Key | What |
|---|---|
| Sites | **A** (`QAA`), **B** (`QAB`). Each has 6 slots, 2 employees with passes, 2 parked vehicles (so logs exist), 1 relocation, 1 pending registration, 1 valet ticket, 1 non-parked alert (`/alerts/trigger-cron` with the site), and 1 site domain. Plus 1 platform-wide domain. |
| Distinct markers | Every A record carries plate prefix `MH12QA…` and every B record `MH14QB…`, so a stale row can be spotted by text alone. |
| Users | `master` (Master Admin) · `adminA` (Site Admin, A) · `multiAB` (Site Admin, A+B, non-Master) · `attA` (Attendant, A) · `noSite` (Site Admin, no sites) · `umA` (**non-Master with a Master-created custom role that has USER_MANAGEMENT**, site A, for m-5/M-2 UI; frontend gap 3 said no such account existed) |

## 3. MAN-02: site switch and sign-out under a slow network (AC-04, AC-05; F2, F3; the round-1 logout-race Major)
The latency hook is `page.route('**/api/v1/**')`, which delays every response by 1.5 s. A DOM sampler runs every 100 ms and records every row/plate text plus the header chip text.

| ID | Steps | Pass when |
|---|---|---|
| MAN-02a | `master` signs in. | "Choose a site" prompt shows. Until a site is picked, the only `/api/v1` calls are `/my-sites`, `/rbac/roles` and `/auth/*` (G-18: no data calls, no `site-default` load). The chip offers A, B, QAC… and "All sites". |
| MAN-02b | Pick A → Live Floor Plan → switch to B. | Skeletons appear within 200 ms of the switch. **No sample, from the switch until B's data renders, shows an `MH12QA…` row under a B chip.** Every list call after the switch carries `x-site-id: B`. Any response to an A-request that lands after the switch is not rendered. |
| MAN-02c | Rapid A→B→A→B, 300 ms apart, on Inventory, Logs and Approvals. | The final screen shows only B rows and the chip reads B. No sample ever shows a mix of A and B rows. |
| MAN-02d | Switch to **All sites** on Inventory, Logs, Approvals and Alerts. | Rows from both sites, each with a site-code chip (QAA/QAB). The eyebrow reads "ALL SITES · n sites · Select one site to make changes". |
| MAN-02e | `multiAB` signs in (non-Master, 2 sites). | Prompt without "All sites". The chip lists only A and B (AC-05). Switching A→B behaves as MAN-02b. |
| MAN-02f | `adminA` signs in. | A is auto-selected and the chip has no chevron. No other site appears anywhere (sidebar, bell, Home tiles). |
| MAN-02g | **Sign out during a slow refresh**: `master` on B, press refresh, sign out 300 ms later. | The user stays on sign-in, and `localStorage`/`sessionStorage` hold no session or user. The late responses don't re-render data or restore the user. No `/api/v1` call carries the old token after sign-out. |
| MAN-02h | **Session ended** (AC-47): `master` on B / Logs. Kill the token with `POST /auth/logout` from outside, then press refresh. | Sign-in shows "Your session ended. Sign in to continue." After sign-in: the same page (Logs) and the same site (B). |
| MAN-02i | Remembered site: sign out, then sign in again as `master`. | B is restored if still permitted. After removing `multiAB`'s access to B (as Master) and signing in as `multiAB`, the Choose-a-site prompt appears with no stale B. |
| MAN-02j | 375 px: repeat b and d using the bottom-sheet chip. | Same results. The chip shows the code, and there's no horizontal scroll. |

## 4. AS-*: "All sites = no enabled writes" on every F4 page (AC-02, AC-04; L-3; F4)
**Method** (per page, `master` in All sites mode):
1. **Guarded controls.** Count `[data-write-guard]` elements and how many are `:not([disabled])`. Expect enabled = **0** and total > 0. Each disabled one has the tooltip "Select one site to make changes".
2. **Unguarded sweep.** This catches write buttons F4 missed. Route every non-GET `/api/v1/**` request to **record + abort** (nothing reaches the server, except `/auth/logout`). Then click every enabled `button`, `[role=button]` and `input[type=submit|file]` in the main content, one at a time. Close any dialog that opens and, if it has a primary button, click that too. Expect **0 non-GET requests attempted**. Anything else is a finding, reported with its button label.
3. **Server backstop.** On one guarded button per page, remove `disabled` in the DOM and click it with requests allowed. Expect the server to answer 400 `ERR_SITE_ALL_NOT_ALLOWED`, the page to show the save-error copy, and the data to stay unchanged.
4. **Re-enable.** Choose site A. Guarded controls are enabled again (count > 0), and one harmless write succeeds. For example, on Inventory, set an A slot to MAINTENANCE and back.

| ID | Page (tab) | Guarded writes today (`useWriteGuard` uses) |
|---|---|---|
| AS-01 | Inventory Master | 10 (save/edit, delete, status, bulk upload, …) |
| AS-02 | Live Floor Plan / Live Parking Status | 9 |
| AS-03 | Entry/Exit Logs | 6 (incl. CSV export: no `ALL` on exports) |
| AS-04 | Employee Registration + Approvals (incl. the domain panel) | 13 |
| AS-05 | Non-Parked Alerts | 4 |
| AS-06 | ValetX | 7 |
| AS-07 | Relocation Logs | read-only page (Retry only). The sweep must find no writes |
| AS-08 | **Every other tab**, including the in-console Attendant and Employee app previews, Reports (overnight review), Home quick actions and the header bell. These are not in F4's list, so they get the same sweep. | 0 site-scoped non-GET requests. Platform pages (Master Site Config sites/pricing, User & RBAC, InfoSec) are **exempt**, because their writes aren't site-scoped; I record them rather than fail them. |
| AS-09 | View-as variant: repeat steps 1–2 on AS-01..06 while viewing as `adminA` with site A. | Enabled guarded = 0. Tooltip "Read-only while viewing as another user". |

**Known exception to confirm, not fail:** the domain panel in All sites mode keeps **Add** enabled for Master Admin, which creates a **platform-wide** domain (frontend gap 4, `DomainWhitelistPanel` `canAdd`). That goes against L-3's "every write action disabled" wording, so UX/PM must accept it (gap 2 below). The check records that the hint "New domains apply to every site." is shown.

## 5. VA-*: view-as reload and exit (AC-55; L-8; F7; review m-5)
| ID | Steps | Pass when |
|---|---|---|
| VA-01 | `master` on B → User & RBAC → Role View Simulator → View as `adminA`. | The purple banner (`role=status`) reads "Viewing as QA adminA · Site Facility Manager · QA Site A — read-only", with **Exit view**. Every `/api/v1` call carries `x-view-as: <adminA id>` and `x-site-id: A`. The sidebar and Home show adminA's modules only. **InfoSec and Role View Simulator are hidden** (m-5). No `MH14QB…` data appears anywhere. |
| VA-02 | While viewing: the AS-09 sweep, plus a direct `fetch` POST from the page. | Enabled guarded = 0. The direct POST → 403 `ERR_VIEW_AS_READ_ONLY`. The Logs CSV export is disabled. The Reports export is **recorded** for the security reviewer (frontend gap 6: it would use Master masking). |
| VA-03 | **Reload** (F5) while viewing. | The banner is still there after reload. `localStorage['parkflows.viewAs']` is present and revalidated (a `/rbac/users` call happens before data loads). It's still read-only, and it's still adminA's scope. No flash of Master data: the sampler finds no B rows between load and the banner. |
| VA-04 | **Exit view**, one click. | The banner is gone. Master's own site (B) and page come back. The page goes to Home only if a reload happened in between (spec F7). Later calls have **no** `x-view-as`. Guarded writes are enabled again. `parkflows.viewAs` is cleared. |
| VA-05 | Stale target: start view-as adminA, then suspend adminA through the API (as Master, in another context), then reload. | The view ends with "Couldn't start the view. Try again." and Master's own profile is restored. There are no 403 loops. |
| VA-06 | View as `noSite`. | S-0 ("no site assigned") shows inside the shell, with no Sign out button. Exit view works. |
| VA-07 | Sign out while viewing, then sign in as `adminA` in the same browser. | adminA's own session doesn't start in view-as, and no `x-view-as` is sent. **Expected behaviour isn't specified:** I'll confirm it with frontend-dev and report what happens. |
| VA-08 | `umA` (non-Master with USER_MANAGEMENT) → User & RBAC. | The roles matrix is read-only: no enabled save or delete (M-2 UI). There's no Role View Simulator. Editing their own user row can't change role, overrides, sites or status (the UI and the server agree: 403 `ERR_MASTER_ONLY`, M-1). |

## 6. Not covered here (other rows of 06)
- **Chip keyboard/ARIA (L-1)** and S-NA deep links (F5) are quick additions to the same script at 1280 px: ↑/↓/Home/End/Enter/Esc, 44 px rows, and focus returning to the chip.
- **ErrorCard (AC-45):** stop the server, then refresh. The error card with Try again shows and the old rows are greyed out.
- **`/attendant` M1 blocking screen:** make `/my-sites` fail or return none. "Couldn't load your site" + Try again + Sign out shows, and 0 gate calls go out. Addendum B toast legibility (G-17) goes in the same pass.

## 7. Gaps found while planning (to resolve before 06)
1. **AC-57 vs 03/build: can a Site Admin see platform-wide domains?** AC-57 says a Site Admin "cannot see or change Site B's or platform-wide domains". 03 (API table, `/domains/manage`) and the build show platform-wide entries to Site Admins **read-only**. PERM-02d asserts that Site B entries are hidden and platform-wide ones can't be changed, but makes no claim about visibility. **PM to reconcile the AC wording.**
2. **L-3 vs the domain panel:** in All sites mode, Master's "Add domain" stays enabled (platform-wide add). UX/PM to accept this as the one All-sites write, or change it.
3. **Addendum B vs 03 on AC-14 and AC-19..23.** Addendum B (PM, 28 Sep) says these **pass in Phase 1 if the server outcome is correct** (+ toast). 03 moves them to Phase 2 (P2-1). The API suite shows the server outcome is **not** correct today: FLOW-04 (on-hold entry accepted), FLOW-09/10 (unauthorised plates admitted), FLOW-11 (wrong slot type) and FLOW-12 (non-Indian plates). Only AC-19 and AC-21 pass. Unless PM restates that they're deferred, these are **Phase 1 failures** in 06.
4. **The verdict rule for other deferred P0 ACs.** Still failing in strict mode, and deferred by 03 to Phase 2: AC-13, 16, 17, 24, 27 (format), 29, 30, 32, 37 and 39 (valet enum). They are PRD P0/P1. For 06 to give PASS, the PM needs to record that they're out of Phase 1 scope. Otherwise the agent rule "PASS = all P0/P1 criteria pass" gives FAIL.
5. **B17 isn't built yet.** When it lands, I'll add API tests for per-site duplicates (plate active at B → A registration OK; bulk row with a B plate → new A request, B unchanged, also with `autoApprove`). FLOW-17 (same-site duplicate) already covers the refusal.
