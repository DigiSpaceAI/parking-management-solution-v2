# Test Report — 002 UI redesign, R1-pre slice (T1–T6), R1a marketing and R1b console

## Re-test, 2026-10-08: `feature/002-design-system` HEAD `83402a2` (round 3)

**QA engineer:** qa-engineer · **Date:** 2026-10-08
**Build under test:** `83402a2`, 5 commits on top of `e449b82`: `be511f2` O-3, `a27fdf1` BUG-1/NFR-4, `e5d97f6` R1a flag, `577b5ab` BUG-2/NFR-1, `83402a2` R2-1/R2-2.
**Inputs:** `01-prd.md` v1.3 (R1a/R1b split; AC-32, AC-32c; NFR-1, NFR-2, NFR-4, NFR-5; PM sign-off on O-3) · `02-ux-design.md` decisions of 2026-10-08 · `04-implementation-notes.md` "Round 2 fixes" · `08-release.md` (D1 config, preview steps) · `d1/firebase.json` · `pf-marketing-83402a2.tar.gz`

**Verdict: PASS for `83402a2`.**
- **Passed:** BUG-1/NFR-4, BUG-2/NFR-1, O-3, flag OFF and flag ON behaviour, and all gates.
- **BLOCKED:** the DevOps preview URL couldn't be checked (see below). It still has to be checked before the production cutover.
- **New minor bug:** BUG-3, which affects flag ON only, so not the 10 Oct build.

### How it was tested
- **Clean clone:** `git bundle` of `feature/002-design-system` → clone in a separate cloud workspace → `bun install --frozen-lockfile` (416 packages). The main checkout stays on `feature/001-parkflows-platform-v1`, and nothing was installed into the repo.
- **Two builds:**
  - **Flag OFF:** `env -u PF_DEMO_FORM npm run build:marketing`, the R1a default.
  - **Flag ON:** `PF_DEMO_FORM=1 npm run build:marketing`.
- **The DevOps package matches:** the `dist-marketing/` in `pf-marketing-83402a2.tar.gz` is **byte-identical** to my flag-OFF build (`diff -r` is empty). Its `firebase.json` is identical to `docs/.../d1/firebase.json`.
- **D1 hosting stand-in:** I couldn't reach the preview, so the builds were served by `tests/qa/002/support/hosting-server.mjs` (new). It applies the `d1/firebase.json` headers (strict CSP, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, and `no-cache` vs `immutable` on `/assets/**`), `trailingSlash` (`/demo` → 301 `/demo/`) and gzip, like Firebase Hosting. That means CSP violations show up as console errors. Each build was also run on a plain uncompressed static server, which gave the same results.
- **Tools:** Chromium 141 (Playwright 1.56), axe-core 4, Lighthouse 12.

### Gates (clean clone of `83402a2`)
| Check | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** |
| `npm run lint` | 24 errors, all `src/components/App.tsx` (pre-existing) → **0 new** |
| `npm run lint:styles` | **PASS**: self-test **75/75**, 37 R1 files clean |
| `npm run build` | **PASS** |
| `npm run build:marketing` flag OFF / flag ON | **PASS** / **PASS** (ON adds `assets/demo-*.js`; OFF has no demo script) |
| `npm run test:qa` under UTC, America/Los_Angeles, Asia/Kolkata, Pacific/Kiritimati | **17/17** in each (10 + the adopted `002-tokens-styles.test.mjs`) |
| `+ tests/qa/002/format-extra.test.mjs`, same 4 TZs | **26/26** in each |
| `tests/qa/002/browser/components.mjs` (design-system preview) | **94/94** |
| `MODE=off tests/qa/002/browser/marketing.mjs`, D1 headers / plain | **88/88** / **88/88** |
| `MODE=on tests/qa/002/browser/marketing.mjs`, D1 headers / plain | **87/88** (BUG-3) / **88/88** |

### Results by item
| Item | Test | Type | Result |
|---|---|---|---|
| **BUG-1 / NFR-4** touch targets | `components.mjs` "44px targets on touch". Every button, tab, segment, input, select, link, card/row checkbox and close button is ≥ 44×44, at **360 (touch)** and at **768 (touch tablet)**. Measured: phone-card checkbox **44×44** (was 20×44); table-row checkbox on a touch tablet 44×44; "Forgot password?" **115×44** on touch (was 115×20). With a mouse at 1280, the standalone `.pf-link` is 115×24 (≥ 24, UX 02) and the table-row checkbox is 20×20 (row-is-target desktop exception, UX 02). The only element exempted is the in-sentence `.pf-link--inline` ("the help page", 82×17), which NFR-4 allows | auto | **PASS** (BUG-1 closed) |
| | Marketing at 360/768/1280: the menu button is 44×44. On flag OFF, the contact buttons are 219×44 and 206×44 (48 tall at 1280) | auto | **PASS** |
| **BUG-2 / NFR-1** Lighthouse, D1 stand-in (gzip) | Flag OFF, mobile/desktop: `/` perf **99/100**, CLS 0.002/0.000, LCP 1.96 s/0.46 s · `/demo/` **100/100**, CLS 0.001/0.000, LCP 1.52 s · `/privacy/` **100/100**, CLS 0.000/0.000, LCP 1.53 s | auto | **PASS** (all 6 runs: perf ≥ 90, CLS < 0.1, LCP ≤ 2.5 s) |
| | Flag ON, mobile/desktop: `/` **99/100**, CLS 0.000 · `/demo/` **100/100**, CLS 0.001/0.000 · `/privacy/` **100/100**, CLS 0.000 | auto | **PASS** (6 runs) |
| | Uncompressed cross-check, flag OFF mobile: `/` perf 97, CLS 0.002, LCP 2.41 s · `/demo/` 99, CLS 0.000. Accessibility, best practices and SEO are **100** in all 14 runs. Before the fix, `/demo/` scored CLS 0.60/0.37 and perf 76/82 | auto | **PASS** |
| | INP: this is a static site with no long tasks (TBT 0 ms everywhere). Real INP is field data, to be checked after launch as NFR-1 says | — | n/a (lab) |
| **NFR-2** privacy | On both builds, all 3 pages and all 3 widths: **0 external hosts**, **no cookies**, no analytics. No inline `<script>`. The only inline `<style>` is in the flag-ON `<noscript>` (BUG-3) | auto | **PASS** (flag OFF) |
| **O-3** copy | The home page contains exactly "Utilisation, occupancy trend and the mix of registered and visitor vehicles for your site. Export the entry and exit log to CSV." "vehicle mix" occurs 0 times. All the earlier AC-30 sentences are still present, and none of the removed claims are back | auto | **PASS** |
| **Flag OFF** (R1a, the 10 Oct build) `/demo/` | JS on and JS off, at 360 and 1280: **no `<form>` and no fields**; the **"Write or call us" contact panel** is visible with `mailto:sales@parkflows.in?subject=Demo%20request` and `tel:+919820603518`. The page's only script is `site-*.js`, **`demo.js` is not in the page and is never requested**, and there's no non-GET request or query string. On `/`, every "Book a demo" link → `/demo/`, and a click lands on the contact panel. 0 axe violations and 0 console errors **under the D1 CSP** | auto | **PASS** |
| **Flag ON** (AC-32 client unchanged) | **JS on:** an empty submit shows the 7 required-field errors with focus on the first and `aria-invalid`. Format rules and the 1,000-char counter work. One same-origin JSON POST, no cookie, with **`pf_hp_field: ""`** and normalised phone/slots. Mocked success → success state; 400 with field errors → message under the field; 400 without, 500, network and 200-without-success → "We couldn't send your request"; 429 → "Too many requests right now". Every error state has the prefilled mailto plus tel and keeps the form | auto | **PASS** (unchanged from round 1) |
| | **AC-32c / M-1, demo.js blocked**, 360 and 1280: the form is `visibility:hidden` and **`inert`** (its space is kept, so there's no CLS). Tab never enters it, clicking and typing where it sits does nothing, Enter sends nothing, and there's no request or query string | auto | **PASS** |
| | **AC-32c, JS off:** no form is visible and the noscript email/phone banner shows. Nothing can be typed, nothing is sent, no query string. **But under the D1 CSP** the `<noscript><style>#demo-form{display:none}</style>` is refused (`style-src 'self'`), which logs a CSP console error. The form then falls back to `visibility:hidden` + `inert`, which is still safe but leaves an empty gap. See **BUG-3** | auto | **PASS** with BUG-3 |
| **D1 config** (stand-in) | `/demo` → 301 `/demo/`. CSP, nosniff, X-Frame-Options DENY, Referrer-Policy and Permissions-Policy are on every response, with `no-cache` on HTML and `immutable` on `/assets/**`. There's no `/api` rewrite, so `POST /api/v1/demo-requests` → 404, which is expected until B6/D1; with flag ON the form would show the AC-32b error state. The flag-OFF pages raise **0 CSP violations** | auto | **PASS** |
| **DevOps preview URL** (`r1a-preview` channel) | **BLOCKED. Not run.**<br>- No preview URL is recorded anywhere. `08-release.md` says the deploy is "ready for the user to run" in Cloud Shell, and the URL is printed only when it runs (`https://parkflows-marketing--r1a-preview-<hash>.web.app`).<br>- Neither QA sandbox has network access to `*.web.app`. The proxy refuses it, and the desktop shell has no egress.<br>- The Chrome check timed out waiting for permission.<br>What can be verified offline is: the package is identical to the reviewed flag-OFF build, and the D1 headers behave as configured. **To do on the real URL** (≈10 min, before production): `/`, `/demo/`, `/privacy/` return 200; `/demo` → `/demo/`; `curl -sI` shows the CSP and nosniff headers; no form on `/demo/`; Sign in → admin.parkflows.in; `MODE=off node tests/qa/002/browser/marketing.mjs <preview-url> <axe>`; Lighthouse on the 3 pages, mobile and desktop | — | **BLOCKED** |
| Design-system regression (round 1 checks) | Preview at 360/768/1280: Modal and SidePanel close paths and focus return, toasts (Undo stays; hover/focus pause), tab/radiogroup roles and keyboard, sr text, "In since", reduced motion, Tailwind token utilities, self-hosted fonts, favicon, focus ring on all tab stops, AC-03 inventory. **0 axe violations** (axe now waits out the 200 ms fade, as 04 asked). No page scroll; the tab strip and table containers still scroll sideways at 360/768, as allowed by NFR-5 until R1b | auto | **PASS** |
| R2-1 / R2-2 (`lint:styles`) | `[color:red]`, `hover:![border-radius:7px]`, `p-(--x)`, `drop-/text-/inset-shadow-*`, `"a//b"`, `` `a//b` ``, `'x/*y'` and `src="//cdn…"` are now **caught**; `type T = { [key: string]: number }` is correctly not flagged. My old "expected misses" test now fails on purpose, and frontend adopted the probes as seeded cases in `tests/qa/002-tokens-styles.test.mjs` | auto | **PASS** (closed) |

### Bugs (round 3)
- **BUG-1:** closed (`a27fdf1`).
- **BUG-2:** closed (`577b5ab`).

**BUG-3 [minor] With the flag ON, the `/demo/` noscript style is blocked by the D1 CSP.** This affects the future flag-ON build only; the 10 Oct build has the flag OFF and is not affected.
- **Steps:**
  1. `PF_DEMO_FORM=1 npm run build:marketing`.
  2. Serve with the `d1/firebase.json` headers: `node tests/qa/002/support/hosting-server.mjs dist-marketing docs/features/002-ui-redesign/d1/firebase.json 4611`.
  3. Open `/demo/` with JavaScript disabled.
- **Expected:** the form is `display:none` (its noscript style applies) and there are no console errors.
- **Actual:** Chromium logs "Refused to apply inline style … violates … style-src 'self'". The `<noscript><style>#demo-form{display:none}</style>` is ignored, and the form stays laid out as `visibility:hidden` + `inert`, which leaves an empty block above the noscript banner. Nothing can be typed or sent and no PII reaches a URL, so **AC-32c still holds**.
- **Fix:** frontend replaces the inline `<style>` with `<noscript><link rel="stylesheet" href="/assets/noscript.css"></noscript>` (allowed by `style-src 'self'`). The alternative is for DevOps to add that style's `sha256-…` hash to the CSP. Fix before the flag is switched on (B6 + D1 live).

### Test files (not committed; `CLAUDE.md` rule 6)
- **Updated:**
  - `tests/qa/002/browser/marketing.mjs`: `MODE=off|on`, the flag-OFF contact-panel checks, "Book a demo" links, inert-form checks, CSP-safe axe injection, and the O-3 sentence.
  - `tests/qa/002/browser/components.mjs`: NFR-4 check at 360 and at 768 with touch, the inline-link exemption, the 24px mouse rule, and axe waiting for the fade.
- **New:** `tests/qa/002/support/hosting-server.mjs` (the D1 hosting stand-in).
- **Superseded:** `tests/qa/002/tokens-styles.test.mjs` is replaced by the adopted `tests/qa/002-tokens-styles.test.mjs` on the branch, whose #8 probes are now seeded. My copy now fails #8 by design. **Delete it**, and don't adopt it.
- `tests/qa/002/format-extra.test.mjs` and `tests/qa/002/harness/` are unchanged.

### Still open (not blocking this re-test)
- **DevOps / user:** run the preview deploy and send QA the URL so the BLOCKED row can be run.
- **DevOps:** the email blocker (no MX for parkflows.in) is in `08-release.md`; it isn't QA scope, but the contact panel depends on `sales@parkflows.in` receiving mail.
- **QA, before the flag is switched on:** re-check the privacy note against the built B6 (O-5, AC-32d) and run AC-32a against the real endpoint.
- **R1b:** console screens (F1–F8), AC-06, NFR-5 tables by width, AC-21 rename (`index.html`/`mobile.html`).

---

# Round 1 (2026-10-07, `e449b82`). Kept for history


**QA engineer:** qa-engineer · **Date:** 2026-10-07 · **Build under test:** `feature/002-design-system` at `e449b82` (code review round 2: PASS)
**Inputs:** `01-prd.md` v1.1 (AC-01..06, AC-18, AC-21, AC-30) · `02-ux-design.md` Step 2, S6, design-system decisions · `03-tech-design.md` v1.1 T1–T6 · `04-implementation-notes.md` Frontend + "Round 1 fixes" · `05-code-review.md` rounds 1–2

## Environment and method

- **Clean clone, not the main checkout.** `git bundle create .git/qa-002-e449b82.bundle feature/002-design-system` on the main checkout (which stays on `feature/001-parkflows-platform-v1`), then cloned into a separate cloud workspace. Dependencies were installed there with `bun install --frozen-lockfile` (Bun 1.4, 416 packages). Nothing was installed into the repo folder. Node 22.22.2.
- **Browser:** Chromium 141 (Playwright 1.56), axe-core 4 (tags wcag2a/aa, 21a/aa, 22aa, best-practice), Lighthouse 12. All were installed in a scratch folder outside the repo.
- **Preview harness (QA only).** The `/design-system` preview isn't routed yet (F1/F2), so `tests/qa/002/harness/` mounts `<DesignSystemPreview/>` with `theme.css`, `tokens.css`, `fonts.css` and `components.css`. It also adds one hidden probe `<div>` with `bg-navy-600 p-4 text-title-1` for the T1 check. It's built with `npx vite build --config tests/qa/002/harness/vite.config.mjs` to a temp folder and served statically. App source is unchanged.
- **Marketing:** `npm run build:marketing`, then `dist-marketing/` was served statically on `localhost`. B6 (`/api/v1/demo-requests`) isn't built yet, so every API response is a Playwright route mock.

## Test files (new, **not committed**)

`CLAUDE.md` rule 6 says "Do not commit or push unless the user asks", so these files are left **uncommitted** in the main checkout's working tree.

- They sit under `tests/qa/002/` on purpose. The `test:qa` glob (`tests/qa/*.test.mjs`) doesn't pick them up, so `npm run test:qa` on the checked-out 001 branch (which has no `src/utils/format.ts` or `scripts/check-styles.mjs`) keeps passing.
- To adopt them on `feature/002-design-system`, move the two `*.test.mjs` files to `tests/qa/`. They find the repo root on their own.

| File | What it covers |
|---|---|
| `tests/qa/002/tokens-styles.test.mjs` | T1/T2 tokens: `--check` passes; drift is detected (tokens.json edit, tokens.css/theme.css hand edits); no Tailwind reset; reduce-motion durations are 0ms. T3 `lint:styles`: self-test plus R1 files clean; a seeded file in a temp copy trips all 31 rule samples; R2-1/R2-2 are pinned as expected misses (8 tests) |
| `tests/qa/002/format-extra.test.mjs` | Extra `format.ts` cases for AC-18 (fixed-width, short strings; year, leap-day and month boundaries; "In since" across boundaries; duration and "ago" unit edges; ₹ crore and rounding). AC-21 scan of R1-pre files and the one-logo check (9 tests) |
| `tests/qa/002/browser/components.mjs` | Preview at 360/768/1280: layout, axe, Modal/SidePanel close paths and focus, toasts (fake clock), Tabs/Segmented/Level roles and keyboard, sr text, "In since", 44px, reduced motion, T1 Tailwind probe, T2 fonts/favicon, T5 focus ring, AC-03 inventory (92 checks) |
| `tests/qa/002/browser/marketing.mjs` | `/`, `/demo/`, `/privacy/` at 360/768/1280: layout, 12px text, hosts, console, cookies, axe, Sign in, logo. JS off, and JS on with `demo.js` blocked. Validation, payload, mocked 200/400/429/500/network/200-without-success. AC-30 copy (82 checks) |
| `tests/qa/002/harness/` (`index.html`, `main.tsx`, `harness.css`, `vite.config.mjs`) | The throwaway preview mount described above |

How to run (from a clone of `e449b82` with deps installed):
```
TZ=<zone> node --test tests/qa/*.test.mjs tests/qa/002/*.test.mjs
QA_HARNESS_OUT=/tmp/h npx vite build --config tests/qa/002/harness/vite.config.mjs && python3 -m http.server 4601 -d /tmp/h
npm run build:marketing && python3 -m http.server 4602 -d dist-marketing
PW=<playwright/index.mjs> CHROME=<chromium> node tests/qa/002/browser/components.mjs http://localhost:4601/ <axe.min.js>
PW=… CHROME=… node tests/qa/002/browser/marketing.mjs http://localhost:4602 <axe.min.js>
```

## Traceability

| AC ID | Test ID | Type (auto/manual) | Result |
|---|---|---|---|
| **AC-01** tokens only, no inline style | `tokens-styles` #1–5 (`--check` pass; drift from tokens.json, tokens.css and theme.css edits → exit 1; regenerate → pass) | auto | **PASS** |
| | `tokens-styles` #6–7: `lint:styles` self-test 57/57 and 37 R1 files clean. Seeded `.tsx`/`.css`/`.html`/`.js` in a temp copy trip **every** rule: JSX/object/shorthand/DOM/HTML inline style, hex, functional and named colours (CSS, `<style>`, attribute, string), arbitrary `-[…]`, non-token colour, default text size/radius/bare `rounded`/shadow/bare `shadow`/leading/tracking/font weight, `@apply`, `font-mono` outside data components. Exit 1, each sample reported on its own line | auto | **PASS** |
| | `tokens-styles` #8: known gaps **R2-1** (`[color:red]`, `[border-radius:7px]`, `p-(--x)`/`bg-(--brand)`, `drop-shadow-lg`, `text-shadow-md`, `inset-shadow-sm`) and **R2-2** (`"a//b"` hides the rest of the line) are **still missed. These are expected misses, recorded and not counted as failures** (05 round 2: fix before F1 relies on the gate). The test fails on purpose once one starts being caught | auto | Known, expected |
| | Built CSS: marketing and preview both carry `--navy-600:#1f3a93` from the same `tokens.css` | auto (grep) | **PASS** |
| **AC-02** one styling approach | `tokens-styles` #4: `theme.css` has no Tailwind default reset (no `--*: initial`; K3 step 1). `components` "T1": Tailwind 4 compiles token utilities from `theme.css` (`bg-navy-600` = rgb(31,58,147), `p-4` = 16px, `text-title-1` = 24/32, `shadow-2`). `site.css` imports the same `tokens.css`/`fonts.css`/`components.css`. "Old inline-style system gone from all in-scope screens" needs F1–F7 → **not testable yet** | auto | **PASS** (R1-pre part) |
| **AC-03** component library | `components` "AC-03": preview has primary/secondary/destructive/ghost buttons, disabled and loading, input with error and disabled, select, checkbox, radio, table, pagination, tabs, status chips, badges, card, KPI, empty, error, skeleton, modal, side panel, banner. "T5": a visible focus ring on all 69 tab stops (hover is CSS `:hover`). Site switcher, page header and nav are AppShell (F1) → **not testable yet** | auto | **PASS** (R1-pre part) |
| | Modal at 360/768/1280: Esc closes; backdrop click closes; **drag from the heading onto the backdrop stays open**; native `dialog.close()` calls `onClose` (re-opens on the next click, no stale state); Close button. Focus returns to "Reject" after Esc, backdrop and native close | auto | **PASS** (27/27) |
| | SidePanel at 360/768/1280: opens from a row (table) or card (360); Esc closes; focus returns to the row/card. Backdrop click closes and drag-from-content stays open (768/1280); full width at 360; native close re-opens | auto | **PASS** (17/17) |
| | Toasts (fake clock): "Undo" toast still open after 60 s; plain success closes after ~4 s; **hover pauses** (20 s hovered, then closes 3–4 s after leaving with the time left); **focus pauses** (20 s focused, closes after blur); error toast with "Try again" stays open; errors are in a `role=alert` region | auto | **PASS** |
| | Tabs: `tablist` with one tab stop, and the selected tab's `aria-controls` resolves. Tab key lands on the selected tab, ArrowRight moves and selects, Home/End work; the stop falls back to the first enabled tab. SegmentedControl `hasPanels={false}` and LevelButtons: `radiogroup`/`radio`, one `aria-checked`, one tab stop, no `aria-controls`; ArrowRight checks the next | auto | **PASS** |
| | CountBadge: visible number `aria-hidden` plus `pf-sr-only` text ("3 pending requests", "99+" → "150 items"), no `aria-label` on spans; aria snapshot "3 pending requests". Tab counts read "Requests 3" | auto | **PASS** |
| | axe: 0 violations on the preview at 360/768/1280, also with the Modal open and the SidePanel open (9 runs) | auto | **PASS** |
| | Reduced motion: `--duration-base` is `.2s` normally and `0s` under `prefers-reduced-motion: reduce` (in the browser), and `tokens.css` sets every `--duration-*` to `0ms` | auto | **PASS** |
| | **44px targets at 360:** every button, tab, segment, level button, input, select, pager and close button is ≥ 44×44. **Two exceptions:** the phone-card row checkbox label is **20×44**, and the "Forgot password?" link is **115×20**. See **BUG-1** (traces to AC-19 / 02 touch rule, which is not in this slice) | auto | **FAIL → BUG-1 (minor)** |
| **AC-04** no hard-coded numbers | Marketing copy check: no stats, "real-time", AI/LSTM or overstay claims. Hero and preview are labelled "Example" ("Example screens … with sample data"; preview "Example data only"). Components take every number from props; none of the 01 list occurs in R1-pre files. Screens (F3–F7, F8) → **not testable yet** | auto + review | **PASS** (R1-pre part) |
| **AC-05** "—" + reason | Empty KpiCard: "—" is `aria-hidden`, and screen readers get "Entries today, No data, No vehicles logged today". SlotCard "In since —", "Length —". `format.ts` returns "—" for invalid or huge input (`002-format` + `format-extra` #3–7). Screens with live API errors → F3–F7 | auto | **PASS** (R1-pre part) |
| **AC-06** Predictive "Sample data — not live", PLC "—" | The Predictive page is F8 and the PLC line is F5. Neither is in this slice → **not testable yet** | — | Not testable yet |
| **AC-18** 360/768/1280, no cut-off, tables → cards | Preview at 3 widths: no page scroll; nothing cut off outside its own scroll container. Table → cards at 360, table at 768/1280. SidePanel full width at 360 | auto | **PASS** (component part) |
| | Marketing `/`, `/demo/`, `/privacy/` at 3 widths: `scrollWidth` = viewport. Smallest text 12px (`/`) / 13px. The 360 menu button is 44×44 and the drawer shows Sign in | auto | **PASS** |
| | `format-extra` #1–7 (4 TZs): dates ≤ 11 chars, date-times ≤ 18, all 12 months 3 letters, 24h `HH:MM`, short durations/"ago". These are the strings cards show at 360 | auto | **PASS** |
| | P0 screens (F1–F7) and the site switcher → **not testable yet** | — | Not testable yet |
| **AC-21** "ParkFlows" naming, one logo | `format-extra` #8: 0 hits for `ParkFlow` (without s), `ParkOrbit`, "Park Flows" in all text files of `src/design-system`, `format.ts` and `marketing/`. #9: the brand set is 6 SVGs; marketing header, drawer, footer and favicon use only `parkflows-logo`/`-favicon`. Browser: page titles contain "ParkFlows", the only `<img>` logo is `parkflows-logo`, and the favicon renders at 16px. **Out of slice:** `index.html`/`mobile.html` titles still say "ParkFlow …", and 6 legacy components still say ParkFlow. That rename is **F8** → not testable yet | auto | **PASS** (R1-pre part) |
| **AC-30** parkflows.in | Same tokens, fonts and components as the console (same generated files; `--navy-600` identical in both builds). Same logo SVG. "Sign in" (header, drawer, footer) → `https://admin.parkflows.in/` on all 3 pages | auto | **PASS** |
| | Works at 360/768/1280 (see AC-18). 0 external hosts, 0 console errors, no cookies set, 0 axe violations (6 runs). Lighthouse accessibility, best practices and SEO **100** on all 3 pages, mobile and desktop | auto | **PASS** |
| | **JS off:** `/demo/` shows no form and no Send button; the `<noscript>` banner gives sales@parkflows.in and +91 98206 03518; fields can't be typed into; Enter or a forced click sends nothing and the URL stays `/demo/` with no `?`. **JS on, `demo.js` blocked:** the form stays hidden | auto | **PASS** |
| | **JS on:** an empty submit shows the **7** required-field errors (name, company, email, phone, city, facility type, consent), focuses the first and sets `aria-invalid` on all 7. Nothing is sent and the URL is unchanged. Format rules work (email, phone, slots/sites 1–1,00,000, a 1,001-char message with counter "1,001 / 1,000 characters") | auto | **PASS** |
| | **Payload:** one same-origin JSON POST to `/api/v1/demo-requests`, no cookie header. It includes **`pf_hp_field: ""`** and no `website`, with phone normalised to `+919820603518`, slots `1,080` → 1080, `consent: true` and `preferredContact: "Email"` | auto | **PASS** |
| | **Mocks:** `{"success":true}` → "Thanks — we'll contact you within one working day.", focused, form hidden, no query string. **400 with field errors** → message under the field and focus there. **400 without errors / 500 / network / 200 without `success:true`** → "We couldn't send your request". **429** → "Too many requests right now". Every error state focuses the banner, gives a `mailto:sales@parkflows.in` prefilled with what was typed plus `tel:+919820603518`, keeps the form and resets the button | auto | **PASS** |
| | **Copy matches the product today.** Checked against the 001 branch code: employee passes are added by the site admin (one at a time or CSV, `EmployeeRegistration.tsx` + bulk upload) and approved or rejected (`REGISTRATION_APPROVED/REJECTED` audit). The floor plan auto-refreshes (`SiteAdminLiveSlots` 8 s interval). Plate scan or type at the gate. Reports have utilisation, occupancy trend and CSV export of the log (`/api/v1/export/reports`, `DATA_EXPORT_CSV` audit). There's a header site switcher, and the valet desk logs retrieval requests. All the M-2/m-8/gap-10 sentences are present; none of the removed claims are. Note O-3 on "vehicle mix" | auto + manual | **PASS** |

## Test runs (command, pass/fail counts)

| Command (clean clone of `e449b82`) | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** (`ok: tokens.css`, `ok: theme.css`) |
| `npm run lint` (`tsc --noEmit`) | 24 errors, **all in `src/components/App.tsx`**. Diffing error lists against the branch base (`9ab49e0~1`) gives an identical list → **0 new** |
| `npm run lint:styles` | **PASS**: self-test 57/57, 37 R1 files clean |
| `npm run build` | **PASS** |
| `npm run build:marketing` | **PASS** |
| `npm run test:qa` under `TZ=UTC`, `America/Los_Angeles`, `Asia/Kolkata`, `Pacific/Kiritimati` | **10/10** in each |
| `node --test tests/qa/*.test.mjs tests/qa/002/*.test.mjs`, same 4 TZs | **27/27** in each (10 existing + 9 format-extra + 8 tokens-styles) |
| `tests/qa/002/browser/components.mjs` | **91/92** (fail: 44px @360 → BUG-1) |
| `tests/qa/002/browser/marketing.mjs` | **82/82** |
| Lighthouse 12, `/` `/demo/` `/privacy/`, mobile + desktop | Accessibility / best practices / SEO **100** on all 6. Performance: `/` 86 / 100, `/demo/` **76 / 82**, `/privacy/` 99 / 100 (python static server, no compression). See BUG-2 |

## Bugs

**BUG-1 [minor] Two touch targets under 44px at 360px** (AC-19 and the 02 touch rule; AC-19 isn't in this slice's AC list)
- Steps: build the harness, open at 360×800 with touch. In "Table, bulk bar, modal and side panel", measure the row checkbox in a phone card (`.pf-table-card label.pf-check`). In "Fields", measure the "Forgot password?" link (`.pf-link`).
- Expected: every control ≥ 44×44 below 768px (02 "Touch or < 768px: every control min touch-min 44"; "checkbox/radio label rows" ≥ 44; 04: "Every control is ≥44px at 360px").
- Actual: the card checkbox label is **20×44**. It has no visible text, so the row is only as wide as the box. The `.pf-link` is **115×20**. 04 treats inline text links as exempt, but this one is a standalone link under a field, not inside a sentence. All other targets pass.
- Fix idea: give `.pf-table-card .pf-check` `min-width: var(--touch-min)` (or pad the label), and give `.pf-link` outside running text a 44px min block size on touch. UX can decide whether the link counts as inline.

**BUG-2 [minor] `/demo/` layout shift when `demo.js` reveals the form** (performance/UX; no AC sets a perf target for the site)
- Steps: `npm run build:marketing`, serve `dist-marketing/`, run Lighthouse 12 on `/demo/` (mobile and desktop), or watch `layout-shift` entries in Chromium.
- Expected: little or no layout shift (CLS < 0.1 "good"). 04 round 1 reported performance 87–100.
- Actual: Lighthouse CLS **0.60 mobile / 0.37 desktop** (performance 76 / 82). In the browser, CLS is 0.15 at 1280 with `demo.js` and **0.00 with `demo.js` blocked**. The shifted nodes are `.mk-aside` / `.mk-footer`. Cause: the M-1 fix ships the form `hidden` and reveals it from JS, so everything below jumps. The home page has a smaller shift, CLS 0.19 at 360 (Lighthouse mobile; `.mk-preview` hero after web fonts load).
- Fix idea: keep M-1's guarantee but reserve the space. For example, render a same-size placeholder that the form replaces, use `visibility:hidden` plus `inert` instead of `display:none`, or move the aside so it isn't below the form on narrow screens. Re-check that JS off still shows no form.

## Observations (not bugs)

- **O-1 (AC-18, for UX/F-screens):** some content scrolls sideways inside its own container, but the page never scrolls. At 768 the 6-column example table scrolls inside `.pf-table-wrap` (718 → 850px), and at 360 the SlotRow list (310 → 655px) and the tab strip (312 → 422px) do the same. Nothing is cut off. Whether tablet tables should drop columns is an F-screen decision.
- **O-2 (harness only):** the preview's "today" SlotCard is `now − 2h`. Between 00:00 and 02:00 IST it is yesterday and shows a date. That is correct behaviour; it only affects the demo data.
- **O-3 (AC-30 wording, for PM):** "Utilisation, occupancy trend and **vehicle mix**". The product's mix chart is "Registered vs visitor" (`/api/v1/reports/mix`), not vehicle types. That's true if read as a mix of vehicles, but a reader may expect car/two-wheeler/EV. Consider "registered vs visitor mix". Part of the open M-2 copy sign-off.
- **O-4:** `build` and `build:marketing` leave `dist-mobile/` and `dist-marketing/` untracked. `.gitignore` covers only `dist/`, so add them (devops).
- **O-5 (privacy note):** "We don't store your IP address or browser details with your request" and "kept in the ParkFlows system" describe B6, which isn't built. Re-check when B6/D1 land. "No cookies, no analytics" is verified (no cookies, no third-party requests).
- **O-6 (AC-21):** `index.html` and `mobile.html` titles ("ParkFlow …") and legacy components (`EmployeeMobileApp`, `ValetXModule`, `MasterAdminRole*`, `AttendantMobileApp`, `RoleHomePage`) still say "ParkFlow". F8 is planned to rename them; AC-21 can only pass in full after F8.

## Not testable yet (out of this slice)

- **m-10 / m-11:** deferred to the rebase (`eol=lf` + CI order; `engines.node`).
- **Depends on the 001 merge:** F1–F7 screens (AppShell: site switcher, page header, nav; P0 screens at 3 widths; tables → cards on real screens; AC-04/05 on live API values); F8 (Predictive "Sample data — not live", naming pass, `index.html` title); B6 demo-requests API and D1 hosting rewrite (real 200/400/429 responses and the server-side honeypot).
- **AC-06** as a whole, plus the console parts of AC-02, AC-03, AC-18 and AC-21 listed above.

## Open items (noted, not blocking)

- **Architect:** rename the B6 honeypot field `website` → `pf_hp_field` in 03. The client already sends `pf_hp_field` (verified in the payload).
- **PM:** sign off the M-2 copy (and see O-3).
- **UX:** confirm the "In since" wording. Today it shows "In since 09:14", and on earlier days "In since 3 Oct 2026, 09:14". Also decide BUG-1 (link exemption) and O-1.
- **Before F1:** close R2-1/R2-2 in `lint:styles`. The pinned test in `tokens-styles.test.mjs` #8 will then fail on purpose; move those probes into the seeded list.

## Verdict (round 1, e449b82): PASS

Every in-scope AC that this slice can show has a passing test: AC-01, AC-02, AC-03, AC-04, AC-05, AC-18, AC-21 and AC-30, each for its R1-pre part. AC-06 and the screen-level parts are not testable until F1–F8/B6.
- **Known, expected misses:** R2-1 and R2-2 are recorded, not failed.
- **Two minor bugs, neither blocking:** BUG-1 (two sub-44px touch targets at 360, an AC-19 concern) and BUG-2 (`/demo/` layout shift from the M-1 reveal). Neither breaks an in-scope AC.

---

## Spot-check, 2026-10-09: `feature/002-design-system` HEAD `b4200a1` (round 3 fix)

**QA engineer:** qa-engineer · **Date:** 2026-10-09
**Build under test:** `b4200a1`, one commit on `83402a2`. It touches 4 files: `marketing/demo/index.html`, `marketing/privacy/index.html`, `marketing/site.css` and `src/design-system/components.css`.
**Inputs:** `01-prd.md` **v1.5**, "PM copy for R1a (flag `demo-form` OFF)", including the flag-OFF meta description confirmed by PM on 2026-10-09 · NFR-1, NFR-4 · code review one-commit check (R3-1, R3-2, R3-3, R3-7)
**Method:**
- Clean clone from a git bundle, `bun install --frozen-lockfile`. Nothing was installed into the repo, and the main checkout stays on `feature/001-parkflows-platform-v1`.
- Built flag OFF (`env -u PF_DEMO_FORM npm run build:marketing`) and flag ON (`PF_DEMO_FORM=1 …`).
- Both builds were served with the D1 headers (strict CSP, gzip, trailing slash) by `tests/qa/002/support/hosting-server.mjs`.
- Chromium 141, axe-core 4, Lighthouse 12.

**Verdict: PASS.** Every item asked for passes. The only failing check is the known BUG-3 (flag ON only, deferred to R1b by PM).

### Gates (clean clone of `b4200a1`)
| Check | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** |
| `npm run lint` | 24 errors, all `src/components/App.tsx` (pre-existing) → **0 new** |
| `npm run lint:styles` | **PASS**: self-test 75/75, 37 R1 files clean |
| `npm run build` | **PASS** |
| `npm run build:marketing` flag OFF / flag ON | **PASS** / **PASS** |
| `npm run test:qa` under UTC, America/Los_Angeles, Asia/Kolkata, Pacific/Kiritimati | **17/17** in each (26/26 with `tests/qa/002/format-extra.test.mjs`) |

### Results
| Item | Test | Type | Result |
|---|---|---|---|
| **/privacy/ flag OFF = 01 v1.5** | New `tests/qa/002/browser/r1a-copy.mjs`. It **parses the quoted sentences straight out of 01 v1.5 "PM copy for R1a"** (6 sentences, the meta description, the mailto subject and the /demo/ line), so a later PRD edit is picked up automatically. Results with JS on and off, at 360 and 1280:<br>- the intro and the 5 section sentences appear **verbatim**, each under its PRD heading (What we collect · Why we use it · Who can see it · How long we keep it · Asking us to delete it sooner);<br>- the delete link is `mailto:sales@parkflows.in?subject=Delete%20my%20enquiry`;<br>- "Cookies and tracking" and "Contact" are unchanged;<br>- none of the form/B6 wording is left ("Book a demo form", "IP address", "ParkFlows system", "browser details", "form") | auto | **PASS** (28/28) |
| **Meta description, flag OFF** | `/privacy/`: "What ParkFlows does with the details you send when you email or call us about a demo." This is **exactly** the PM-confirmed text, and it replaced the form version | auto | **PASS** |
| **/demo/ flag OFF = 01 v1.5 (R3-7)** | "What happens next" reads "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it." The old "We contact you the way you choose…" is gone. Contact panel, no form and no `demo.js` are unchanged (`marketing.mjs` MODE=off) | auto | **PASS** |
| **Flag ON unchanged** | `/privacy/` and `/demo/` flag-ON HTML from `b4200a1` is **identical** to `83402a2` apart from asset hashes and blank lines (diffed). The meta description and visible text are the same. None of the flag-OFF sentences leak in, and the form/B6 wording (privacy promises for B6, AC-32d) is kept. `/demo/` keeps "We contact you the way you choose…". The flag-OFF `/demo/` meta description is the same as at `83402a2` (01 v1.5 doesn't change it) | auto | **PASS** (12/12) |
| **`.mk-logo` 44px on touch (R3-2, NFR-4)** | Header logo link on `/` (flag OFF) and `/demo/` (flag ON): **106×44 at 360 touch**, **142×44 at 768 touch** (was 106×24). With a mouse at 1280 it's 142×32, where the touch rule doesn't apply. No layout shift (CLS 0.000 on `/`) | auto | **PASS** |
| **`.pf-sort` 44px on touch (R3-3, NFR-4)** | Sortable table headers in the design-system preview: **77×44 and 64×44 at 768 touch** (both ≥ 44 wide; `min-width: var(--touch-min)` is in place). At 360 the table is shown as cards and has no sort buttons, so there's nothing to measure. Mouse at 1280: 77×16 and 64×16, the desktop row-target exception. The full NFR-4 sweep (`components.mjs`, 360 and 768 touch) finds nothing under 44×44 | auto | **PASS** |
| **0 axe violations** | 21 axe runs, all 0 violations:<br>- `components.mjs`: 9 runs (preview at 360/768/1280, with Modal and SidePanel open);<br>- `marketing.mjs` MODE=off: 6 runs (`/`, `/demo/`, `/privacy/` at 360 and 1280);<br>- `marketing.mjs` MODE=on: 6 runs | auto | **PASS** |
| **Lighthouse (NFR-1)**, D1 stand-in with gzip | **Flag OFF**, mobile/desktop: `/` perf **99/100**, CLS 0.000/0.000, LCP 1.96 s/0.45 s · `/demo/` **100/100**, CLS 0.000, LCP 1.52 s · `/privacy/` **100/100**, CLS 0.000, LCP 1.51 s.<br>**Flag ON:** `/` **99/100** · `/demo/` **100/100**, CLS ≤ 0.001 · `/privacy/` **100/100**, CLS ≤ 0.001.<br>Accessibility, best practices and SEO are **100** in all 12 runs. These match the round-3 numbers | auto | **PASS** |
| Regression | `components.mjs` **94/94**. `marketing.mjs` MODE=off **88/88**: no form and no `demo.js` on `/demo/`, 0 external hosts, no cookies, no console or CSP errors, 12px minimum text, Sign in → admin.parkflows.in, O-3 copy. MODE=on **87/88**: the one failure is the known **BUG-3** (JS off + D1 CSP blocks the noscript inline `<style>`); AC-32 client behaviour is unchanged | auto | **PASS** (BUG-3 open, R1b) |

### Bugs
- **No new bugs.**
- **BUG-3 [minor]** is still open (flag ON only). PM triage in 01 v1.5 says fix it before the flag is switched on (R1b). It doesn't affect R1a.

### Test files (not committed; `CLAUDE.md` rule 6)
- **New:** `tests/qa/002/browser/r1a-copy.mjs` (`MODE=off|on … node tests/qa/002/browser/r1a-copy.mjs <base-url> docs/features/002-ui-redesign/01-prd.md`).
- Everything else in `tests/qa/002/` is unchanged from round 3.

### Still open for R1a go-live (not QA-blocking for this commit)
- **DevOps preview URL `r1a-preview`:** still **not checked by QA**, since no URL has been shared and QA has no egress to `*.web.app`. Run the BLOCKED row from round 3 on it before the D1 cutover.
- **User:** `sales@parkflows.in` MX working, and the R1a "go", including the manual 12-month deletion commitment (01 v1.5 condition).

---

## Preview check (R1a), 2026-10-09: DevOps preview of `b4200a1`, flag OFF

**QA engineer:** qa-engineer · **Date:** 2026-10-09 (07:30–07:45 IST)
**URL under test:** https://parkflows-marketing--r1a-preview-nuvrvkef.web.app (Firebase Hosting channel `r1a-preview` of site `parkflows-marketing`, expires 16 Oct). **Everything below was run against this URL, not a local build.**
**Inputs:** `01-prd.md` v1.5 (AC-30, NFR-1, NFR-2, "PM copy for R1a") · this report (round 3 and the `b4200a1` spot-check) · `08-release.md` "Preview deploy — `b4200a1`"
**Tools:**
- **Lighthouse:** PageSpeed Insights (pagespeed.web.dev), which runs Lighthouse 13.5.0 on Google's servers against the public URL. Mobile is an emulated Moto G Power on Slow 4G; desktop is the PSI desktop preset.
- **Browser:** the Claude desktop app's built-in browser on the user's machine (real network). It was used for the viewport checks at 360×800 (touch / `pointer: coarse` emulated), 768×1024 and 1280×900, the network log, the console, and in-page `fetch` for headers and hashes.
- **Network log:** also captured in Chrome (Claude in Chrome).
- Neither QA sandbox can reach `*.web.app` (proxy 403), so no Playwright or axe run against the URL was possible. What that leaves out is noted below.

**Verdict: PASS.** All four checks pass on the preview. Two items are noted below; they are not R1a blockers.

### 0. The preview serves exactly the reviewed build
SHA-256 was taken in the browser over the bytes the preview serves. The 3 pages, `robots.txt`, `sitemap.xml`, `og-image.png` **and all 14 `/assets/*` files** are **byte-identical** to QA's clean-clone flag-OFF build of `b4200a1`. For example, `/` is `7da40635…46c6d1` (18,708 B), `/demo/` `1bcba906…4985e` (7,599 B) and `/privacy/` `551efd9d…7bcc44` (6,832 B).
- So the local results for `b4200a1` (0 axe in 21 runs, 44px checks, the full browser suite) apply to the same bytes. The checks below add what only the real host can show: real headers, real network, and real Lighthouse.

### 1. NFR-1: Lighthouse (performance ≥ 90, CLS < 0.1)
| Page | Mobile perf / CLS / LCP / FCP / TBT | Desktop perf / CLS / LCP / FCP / TBT | A11y · BP · SEO (both) |
|---|---|---|---|
| `/` | **100** / **0** / 1.5 s / 1.2 s / 0 ms (SI 2.2 s) | **100** / **0** / 0.4 s / 0.3 s / 0 ms | 100 · 100 · 69* |
| `/demo/` | **100** / **0** / 1.4 s / 0.9 s / 0 ms | **100** / **0** / 0.3 s / 0.2 s / 0 ms | 100 · 100 · 69* |
| `/privacy/` | **100** / **0.001** / 1.4 s / 0.9 s / 0 ms | **100** / **0** / 0.3 s / 0.2 s / 0 ms | 100 · 100 · 69* |

**Result: PASS.** All 6 runs score performance 100 with CLS ≤ 0.001 and LCP ≤ 1.5 s (NFR-1 asks for ≥ 90, < 0.1 and ≤ 2.5 s). Accessibility and best practices are 100.

\* **SEO 69 comes only from the preview channel.** The single failed audit is "Page is blocked from indexing". The preview responds with `X-Robots-Tag: noindex`, which Firebase adds to preview channels. That header is not in `d1/firebase.json`, and there's no robots meta tag in our HTML. With noindex excluded, the earlier local runs scored SEO 100. **Re-check after cutover:** `curl -sI https://parkflows.in/` must not carry `X-Robots-Tag: noindex`, and Lighthouse SEO should be 100. (PSI also showed "Error!" on one of its optional insight panels on `/privacy/` desktop. That doesn't affect any score.)

Real-network timing in the built-in browser (desktop, unthrottled, `/privacy/`): HTTP/2, TTFB 157 ms, FCP and LCP 220 ms, CLS 0. The HTML is served compressed (1,858 B on the wire for 6,832 B) and so is the CSS (8,099 B for 50,203 B).

### 2. NFR-2: no cookies, no third-party requests
| Check | Result |
|---|---|
| Network log on `/`, `/demo/` and `/privacy/` (Chrome and the built-in browser) | Every request goes to the preview origin: the page plus the same-origin `/assets/` files (fonts, `site-*.js`, `site-*.css`, logo). **0 third-party requests**, and `performance.getEntriesByType('resource')` has 0 cross-origin entries on all 3 pages. No analytics or ad scripts; the only script is `/assets/site-Cz-Whc9p.js` |
| Cookies and storage | `document.cookie` is empty, `cookieStore.getAll()` returns 0 cookies, and localStorage and sessionStorage are empty after visiting all 3 pages. (A browser can't read an HttpOnly `Set-Cookie` from page code. The served bytes are identical to the local build, which set no cookies, and the hosting config sets none) |
| Console | 0 messages on `/`, `/demo/` and `/privacy/`, so no CSP violations |
| Headers (`/` and an asset) | Exactly as `d1/firebase.json`: the CSP is the configured string verbatim, `nosniff`, `X-Frame-Options: DENY`, `strict-origin-when-cross-origin`, the Permissions-Policy, `no-cache` on HTML, and `public, max-age=31536000, immutable` on `/assets/**`. HSTS is present (Firebase). Unknown paths → 404 |

**Result: PASS.**

### 3. AC-30 at 360 / 768 / 1280
| Check | 360 (touch) | 768 | 1280 |
|---|---|---|---|
| No horizontal scroll (`scrollWidth` ≤ viewport) on `/`, `/demo/`, `/privacy/` | ✔ 360/360 on all 3 | ✔ (753–768) | ✔ (1265–1280) |
| Smallest text | 12 px (`/`), 13 px (`/demo/`, `/privacy/`) | same | same |
| "Sign in" → `https://admin.parkflows.in/` (header, drawer, footer) | ✔ all | ✔ | ✔ |
| "Book a demo" → `/demo/` | ✔ | ✔ | ✔ |
| `mailto:` / `tel:` | `mailto:sales@parkflows.in?subject=Demo%20request` and `tel:+919820603518` on `/demo/` and in the drawer. `/privacy/` has the delete link `mailto:sales@parkflows.in?subject=Delete%20my%20enquiry` plus the contact mailto/tel | ✔ | ✔ |
| `/demo/` contact panel, no form | Panel "Write or call us" is visible; **0 `<form>`, 0 fields**; scripts = `site-*.js` only (**no `demo.js`**); buttons 219×44 and 206×44 | ✔ (buttons 48 tall) | ✔ (48 tall) |
| `/demo/` "What happens next" | "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it." (01 v1.5, exact) | | |
| `/privacy/` = 01 v1.5 flag-off copy | The intro and all 5 section sentences are **verbatim**, each under its heading (What we collect · Why we use it · Who can see it · How long we keep it · Asking us to delete it sooner). "Cookies and tracking" and "Contact" are unchanged. Meta description = "What ParkFlows does with the details you send when you email or call us about a demo." No form/B6 wording ("Book a demo form", "IP address", "ParkFlows system", "browser details": 0) | | |
| Touch targets (NFR-4) at 360 touch | Logo 106×44, menu 44×44, drawer close 44×44, drawer links 224×44, contact buttons ≥ 44. Exempt: in-sentence links (the email and phone in body sentences) | — | — |
| Mouse at 768 and 1280 | — | Header links 40 tall and logo 32 tall, which is the mouse rule (UX 02: 40/32 with a mouse at ≥ 768) | same |

**Result: PASS.**
- **Not covered on the preview:** touch emulation at 768. The built-in browser only emulates touch below 768, so 768-with-touch (logo 142×44, sort 44×44) was verified only on the identical local bytes, in the `b4200a1` spot-check.
- **O-7 (observation, UX):** the "Skip to content" link (`.mk-skip`) is 140×40. It sits off-screen until it gets keyboard focus, so it's a keyboard-only control and not a touch target in practice. NFR-4's wording ("every interactive element") would technically ask for 44, so UX should decide whether to make it 44 tall in R1.1. Not an R1a blocker.

### 4. robots.txt, sitemap.xml, /demo → /demo/
| Check | Result |
|---|---|
| `/robots.txt` | 200, 66 B: `User-agent: *` / `Allow: /` / `Sitemap: https://parkflows.in/sitemap.xml` (identical to the build) |
| `/sitemap.xml` | 200, 261 B: 3 URLs `https://parkflows.in/`, `/demo/`, `/privacy/` (identical to the build) |
| `/demo` → `/demo/` | Browser navigation to `/demo` lands on `/demo/` (redirected). `fetch('/demo')` gives `redirected: true` with final path `/demo/`. DevOps's curl check (08) shows **301** |
| Unknown path | `/nope` → 404 |

**Result: PASS.**

### Go/no-go (QA view)
**QA: GO for R1a on the QA criteria.** NFR-1, NFR-2, AC-30 (R1a scope) and the site files all pass on the preview, and the preview is byte-identical to the reviewed `b4200a1` flag-OFF build.

Still needed before or at cutover. None of these are QA findings:
1. The user's go.
2. `sales@parkflows.in` must receive mail (no MX, per 08). The contact panel and the privacy note both depend on it.
3. The manual 12-month deletion commitment (01 v1.5 condition).
4. **After cutover, QA re-checks on `https://parkflows.in`:** no `X-Robots-Tag: noindex` (SEO 100); the same hashes; `www` → apex; HTTPS certificate valid.

Not in R1a: BUG-3 (flag ON only, R1b) and O-7 (UX, R1.1).

## R1b, 2026-10-14: `feature/002-r1b` at `a94eae5` (code review R1b round 2 PASS)

**QA engineer:** qa-engineer · **Date:** 2026-10-14 (runs 07:30–14:30 IST)
**Build under test:** `a94eae5`, the commit approved in `05-code-review.md` (R1b round 2, `d10a055..a94eae5`). Clean clone from a git bundle of `feature/002-r1b`, not the main checkout.
**Inputs:** `01-prd.md` **v1.7**, `02-ux-design.md`, `03-tech-design.md` v1.3, `04-implementation-notes.md` (B1–B6, B6b, F1–F10, round 1 fixes), `05-code-review.md` (R1b rounds 1–2), `r1b-handoff.md`, `d1/firebase.json` (md5 `e0c94582…`).

**Gaps in the inputs:**
- **PRD version.** The prompt says `01-prd.md` v1.5. The file is now v1.7. I tested against v1.7, because v1.6 and v1.7 add R1b gates: the flag-ON privacy sentence and AC-32d covering audit events.
- **No hold date.** `04` gap 8 says the Sites panel can't show "On hold since {date}" because no API field holds the date. I tested the reason only.
- **Made-up site defaults.** `04` gap 8 also says `onboardSite` still stores made-up defaults, which the panel then shows as real. That was left for the backend and is not fixed at `a94eae5`. See BUG-R1B-7.

**Verdict: FAIL.** Three Major bugs are open:
- BUG-R1B-1 and BUG-R1B-2: AC-10 landing. Some users get a blank "Loading" page at `/`.
- BUG-R1B-3: the PRD v1.7 privacy sentence is missing from the flag-ON `/privacy/` page. This blocks turning the flag ON.

Everything else in scope passes or has Minor bugs only:
- API scoping, roles and view-as on every R1b endpoint.
- AC-32a–d including Delete, end to end through the D1 rewrite.
- BUG-3 (fixed).
- NFR-5.
- AC-26: the 001 regression is identical to `main`.

### Environment and gates
- **Toolchain:** Bun 1.4.2. `bun install --frozen-lockfile` installed 416 packages. Node 22.22.2.
- **Server:** `NODE_ENV=production SITE_SCOPE_MODE=strict`, with Firestore off (`GOOGLE_APPLICATION_CREDENTIALS`, `FIRESTORE_PROJECT_ID` and `FIREBASE_CONFIG` all blank), serving the built `dist/server.cjs`.
  - The console was built with `VITE_API_BASE_URL` set to the local server.
  - Data comes from the 001 seed (`tests/qa/browser/seed.mjs`) plus the new R1b seed (`tests/qa/002/r1b/seed-r1b.mjs`).
- **Browsers:** Playwright with Chromium and axe-core 4.14 (wcag2a/aa, 21a/aa, 22aa).
- **Marketing:** `build:marketing` with the flag OFF and ON, served by `tests/qa/002/support/hosting-server.mjs`. That server applies the D1 `firebase.json` headers and now proxies the D1 rewrite of `/api/v1/demo-requests` to the console server.

| Gate | Result |
|---|---|
| `bun run tokens --check` | PASS (0 drift) |
| `npm run lint` | PASS (0 errors) |
| `npm run lint:styles` | PASS: self-test 75/75; 61 R1 files clean |
| `npm run build` | PASS |
| `build:marketing`, flag OFF and flag ON | PASS. Flag ON adds `demo-noscript.css` and `demo-*.js`, with no inline `<style>` |

**Fixture data.** All of it was made through the API only:
- **Site A:** 6 slots, 62 employees, 31 pending requests.
- **Site B.**
- **Site C (QAC):** new, 4 slots, no history.
- **Site D (QAD):** 1,080 slots, of which 1,032 are flat across B1/B2/B3/Ground and 48 are puzzle pallets (12 stackers × 4, with `palletLevel`); 3 are occupied.
- **Users:**
  - Master `digisolutions.fm@gmail.com`;
  - a second Master, `qa.master2`, for the view-as test;
  - Site Admins: `qa.admina` (A), `qa.admind` (D), `qa.adminc` (C) and `qa.multiab` (A + B);
  - Attendant `qa.atta` (A);
  - `qa.uma`, a custom role "QA Site HR" with HOME and USER_MANAGEMENT only;
  - `qa.nosite`.
- **Demo requests:** 4, plus 1 honeypot. One has the company `=HYPERLINK(…)` and one has HTML in the message.
- **Legacy data:** the server's own demo data adds 717 legacy log rows with `siteId: site-default` (a site that doesn't exist).

### Test runs
| Suite | Result |
|---|---|
| `npm run test:qa` `001-backend.api` | **64/64** |
| `001-hotfix-coldstart` (hotfix cold-start) | **6/6** |
| `001-platform-v1.api` | 42/57. **Same 15 failures on `main` `84ec8ef`** (FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27), so not a regression |
| `002-backend.api` | 20/20 |
| `002-client-ip` | 11/11 |
| `002-format` | 10/10 |
| `002-tokens-styles` | 7/7 |
| **AC-26 baseline:** the same three 001 suites on `main` `84ec8ef` (worktree, same environment) | 64/64, 6/6, 42/57: **identical pass/fail set** |
| `tests/qa/002/r1b/r1b-api.test.mjs` (new; against the running server, fresh seed) | **22/22** (21/22 on the full run; R1B-API-12 had a wrong request body in the test, fixed, then 2/2 on re-run) |
| `tests/qa/002/r1b/console.mjs` (new; browser, per role and site) | see the table below. 133 checks in total (14 sections; the latest run of each) |
| `tests/qa/002/r1b/e2e-demo.mjs` (new; flag ON, real form → D1 rewrite → B6 → console → Delete) | **4/4** |
| `tests/qa/002/browser/marketing.mjs` `MODE=on` (D1 headers) | **88/88** |
| `tests/qa/002/browser/r1a-copy.mjs` | flag OFF 29/29 · flag ON 13/13 |

### Acceptance criteria: test and result
Roles: **M** = Master, **SA** = Site Admin, **VA** = Master viewing as another user, **Att** = Attendant, **CR** = custom role.

| AC / screen | Test (file · check) | Roles · sites | Result |
|---|---|---|---|
| **F1 App shell** | `console.mjs` nav, a11y: grouped nav, drawer under 1024 px (Menu opens the drawer; the site switcher can be reached at 360), the one switcher, account menu | M, SA (A, C, D), Att | **PASS** |
| **F2 Routes** | `console.mjs` landing, noaccess: hash routes, deep link survives reload, Back works, focus moves to the H1, standard No access page | M, SA, Att, VA | **PASS** for M, SA, Att and VA. Landing at `/`: see AC-10 |
| **F3 Login** | `console.mjs` login: title "ParkFlows · Console", one H1, visible labels, no presets or version pill, 401 message exactly as specified, "Forgot password?" form, server lockout message shown after 15 failures; axe 0, no sideways scroll, targets OK at 360/768/1280; one logo | none | **PASS** 10/10 |
| **F4 Overview** | `console.mjs` overview, states: figures equal `GET /overview` (A: 2/6, 31 pending; D: 3/1,080); none of the fabricated values from the UI review; new site C shows "—" plus a reason. `r1b-api` 01–05: own site only; B → 403, no site → 400, ALL → 400; view-as limited to the target's sites; plates masked for Att | SA A/C/D, multi-site A↔B, VA, Att | **PASS** |
| **F5 Live parking** | `console.mjs` live (site D, 1,080 slots); `r1b-api` 09–10 (`inSince` on the same site only, `heightM`, `lengthM`/`palletLevel`, 400 per field, no mass assignment) | SA D, SA A | **PASS** 9/9 + API |
| **F6 Employees & vehicles** | `console.mjs` employees, tables: 3 tabs; approve one → toast "1 request approved" and pending 31→30 on the server; bulk reject needs a reason; Add employee panel with labels; pages of 25/50 for 31 and 62 rows; A shows no B/D data | SA A, M | **PASS** |
| **F7 Sites** | `console.mjs` sites: table from `/sites/summary` (7 rows, 6 columns); Edit site shows server field errors under the field and a valid edit saves; On hold needs a reason (nothing sent, site stays Active); multi-site SA gets No access and no `/sites/summary` call. `r1b-api` 06–08: summary Master only; update edits listed fields only (status and siteCode are ignored), 400 per field, SA and VA → 403 | M, SA, multi-site SA, VA | **PASS**, except that the panel shows made-up contact defaults (**BUG-R1B-7**, Minor) |
| **F8 Honesty and naming** | `console.mjs` naming, predictive, live: 15 pages with 0 "ParkFlow"/"ParkOrbit"; "Sample data — not live" on Predictive; PLC "— not connected" | M, SA | **PASS** |
| **F10 Demo requests** | `console.mjs` demo: M sees every request (7 columns); row → panel with every field and a plain-text message; status → Contacted with a note (saved on the server); Delete asks first, then the row goes, toast "Request deleted", record gone on the server; Export CSV downloads; **VA of another Master: Save and Delete disabled**; SA gets no nav item, No access and no call. `e2e-demo.mjs`: a message with `<script>` shows as text and no script runs | M, VA (Master), SA | **PASS** 8/8 + 4/4. Nav badge is late: **BUG-R1B-5** (Minor) |
| **AC-06** Sample data / PLC | `console.mjs` predictive, live; `r1b-api` 11 (`sample:true`) | M, SA D | **PASS** |
| **AC-07** Grouped nav, permitted modules only, names = H1, counts-only badges | `console.mjs` nav | M, SA A, Att, CR | **PASS** for M, SA and Att. **FAIL for a custom role** whose permissions leave out keys: `qa.uma` sees every Site Admin module (**BUG-R1B-4**) |
| **AC-08** URL of a module you can't use → No access; API still 403 | `console.mjs` noaccess, landing (VA → Sites = No access); `r1b-api` 12 (Att approve → 403, Att `/rbac/users` → 403, SA audit → 403) | SA A, Att, VA, CR | **PASS** for SA, Att and VA (the API holds for every role). **FAIL in the UI for CR**: Overview and Live parking open, then "Couldn't load" (BUG-R1B-4) |
| **AC-10** Landing | `console.mjs` landing: 5 sign-ins or reloads per role | M → Sites 5/5; SA A → Overview 5/5; SA D → Overview 5/5; no-site → "No site assigned" 5/5; VA → Overview | **FAIL**: Att blank "Loading" 1 of 5 (2 of 8 fresh sign-ins, 2 of 6 reloads; SA A 2 of 6 reloads in earlier runs) → **BUG-R1B-1**. Multi-site SA with no remembered site: blank 5 of 5 → **BUG-R1B-2**. No launchpad grid anywhere: PASS |
| **AC-11** One place for each action | `console.mjs` ac11: Logs is read-only + export; Inventory has no entry/exit; one Employees route with tabs; "Updated …" with no refresh buttons on R1 screens; auto-refresh about every 15 s; Field and Smart Pass previews gone | SA A, M | **PASS** 6/6 |
| **AC-12** Tables | `console.mjs` tables: at most 7 columns; pages at 25 with 25/50 options ("Showing 1–25 of 62/31"); row → panel on Employees, Sites, Demo requests | SA A, M | **PASS** 13/13 |
| **AC-13** Formats | `console.mjs` formats: no enum codes, ISO dates, AM/PM or "INR" on Overview, Live parking, Employees, Sites, Demo requests; dates "14 Oct 2026" | SA A/D, M | **PASS** 6/6 (R1 screens) |
| **AC-14** 1,080-slot Live parking | `console.mjs` live: 20 cards, "Showing 1–20 of 1,080", level buttons with free/total, sizes 12/20/36/60, back to page 1 after a filter, modal closes with Esc and with an outside click, Cards/List remembered, puzzle view (6 stackers, top level first), at most 60 cards in the DOM | SA D | **PASS** |
| **AC-19** WCAG 2.2 AA | `console.mjs` a11y: axe, sideways scroll, text ≥12 px, body text ≥14 px, targets 44 px (touch or under 768) / 24 px (mouse), focus ring on every Employees control (120 stops), drawer at 360. Screens: Overview, Live parking, Employees, Sites, Demo requests | SA A, SA C, M at 360/768/1280 | **FAIL (Minor)**: the only violation is axe `label-content-name-mismatch` (WCAG 2.5.3) on `.pf-bell` and `.pf-account` (**BUG-R1B-6**). Everything else passes: no scroll, sizes, targets, focus, labels. SA C (no bell count) has 0 violations at 360 and 768 |
| **AC-21** Naming, one logo | `console.mjs` naming, login | M | **PASS** |
| **AC-23** Site shown once; no other site's data | `console.mjs` switch, employees: multi-site A→B shows only B; the site name appears only in the switcher | multi-site SA, SA A | **PASS** |
| **AC-24** Master "All sites" | `console.mjs` allsites: banner "You're viewing all sites. Select one site to make changes."; every guarded write disabled with that title (Employees 101, Alerts 66, Inventory 77, Valet 4, Logs 1; 0 enabled); every row shows its site. A click sweep over Employees, Inventory, Alerts and Valet (confirming any dialogs) sent **0 non-GET requests**. `r1b-api` 12: Master write with `x-site-id: ALL` → 400 `ERR_SITE_ALL_NOT_ALLOWED`, slot unchanged | M | **PASS** (see O-1) |
| **AC-25** View-as banner | `console.mjs` landing, demo: "Viewing as QA admina · Site Facility Manager · QA Site A — read-only · Exit view"; survives reload; Exit view restores the Master's page. `r1b-api` 04, 08, 18 (server refuses writes) | VA (SA, Master) | **PASS** |
| **AC-26** 001 suite still passes | see Test runs | none | **PASS** |
| **AC-27** Loading / empty / error states | `console.mjs` states: skeleton; empty states (Registered: reason + "Add employee"; Requests: reason only, as UX S4 specifies; Live parking no match: "Clear filters"); error state "Couldn't load …" + Try again (Overview, Live parking, Employees), Try again reloads; "You're offline" only for a real network loss | SA A, SA C | **PASS** |
| **AC-32a** Valid / invalid / bot / too frequent | `r1b-api` 13, 15, 21: stored and `{success:true}` with nothing echoed; 400 per field; 415 for non-JSON; 413 over 8 KB; honeypot not stored; 429 after the per-IP limit. `e2e-demo`: real form → D1 rewrite → stored once, phone and slots normalised | public, M | **PASS** |
| **AC-32b** Error fallback | `marketing.mjs MODE=on` (server 500 and network fail: message, sales@ mailto with what they typed, phone; fields kept) | public | **PASS** |
| **AC-32c** JS off / no GET submit | `marketing.mjs MODE=on` (JS off: no form, the noscript message with email and phone, **no CSP console error**); `r1b-api` 16 (GET with no session → 405 `Allow: POST`, nothing stored) | public | **PASS** |
| **AC-32d** No IP/UA stored; Master-only handling incl. **Delete** | `r1b-api` 14, 17–20: no IP/UA/browser field on the record; list, export, status and delete Master only (SA, multi-site SA and CR → 403); VA DELETE and status → 403 `ERR_VIEW_AS_READ_ONLY` and the record is kept; CSV escapes formula cells; status change audited with no personal data; DELETE → 200, gone, 2nd DELETE 404, audit `DEMO_REQUEST_DELETED` with no personal data. UI Delete: F10 and `e2e-demo` | M, VA, SA, CR | **PASS**. The privacy copy that goes with it is BUG-R1B-3 |
| **NFR-5** Tables by width | `console.mjs` nfr5 at 360/768/1024/1280: Sites 6/4/4/cards, Employees Registered 5/3/3/cards, Demo requests 7/5/5/cards; no sideways scroll at any width | M, SA A | **PASS** |
| **BUG-3** (flag ON noscript vs CSP) | `marketing.mjs MODE=on` with the D1 headers: JS off shows the fallback and the console has 0 CSP errors; the build has no inline `<style>` (`demo-noscript.css`) | public | **PASS: closed** |
| PRD v1.7 flag-ON privacy sentence | `r1a-copy.mjs MODE=on` + grep of `marketing/privacy/index.html` | public | **FAIL** (**BUG-R1B-3**) |

### Bugs
**Major**
- **BUG-R1B-1: blank "Loading" page at `/` now and then for single-site users.**
  - **Steps:** sign in as `qa.atta`, or reload `/` as `qa.admina`.
  - **Result:** in about 1 in 4 tries the page stays on "Loading" with no nav or content. Att was blank 2 of 8 fresh sign-ins and 2 of 6 reloads; SA A 2 of 6 reloads.
  - **Expected:** Overview (AC-10).
  - **Workaround:** a deep link such as `#/overview` works.
  - **Not affected:** the Master.
  - **Likely cause** (for the developer to confirm): `selectSite` bumps the request generation while `fetchRoles` is in flight. The roles result is then dropped by `isCurrentGeneration`, so `rolesReady` never becomes true and `landingReady` stays false.
- **BUG-R1B-2: a multi-site Site Admin with no remembered site always gets a blank "Loading" page at `/`.**
  - **Steps:** sign in as `qa.multiab` (sites A + B) in a fresh browser.
  - **Result:** blank "Loading", 5 of 5 times.
  - **Expected:** "Choose a site". `#/overview` does show Choose a site.
  - **Cause:** `landingReady` requires `currentSiteId` for anyone who isn't a Master. The same state also shows "Choose a site" instead of No access on `#/sites`.
- **BUG-R1B-3: the flag-ON `/privacy/` page lacks the PRD v1.7 sentence.**
  - `marketing/privacy/index.html:23` still says "We don't store your IP address or browser details with your request."
  - PRD v1.7 requires the full sentence on "…anywhere else in the ParkFlows system. Like most websites, our hosting provider, Google Cloud, keeps standard server logs…".
  - The flag-OFF (live R1a) page is correct as it is.
  - **This blocks turning the flag ON.**

**Minor**
- **BUG-R1B-4: nav and routes fail open for a custom role that lacks module keys.**
  - `isModulePermitted` returns `true` for a key the role doesn't list.
  - `qa.uma` (HOME + USER_MANAGEMENT) sees every Site Admin module and lands on Overview, which then shows "Couldn't load" because the API returns 403.
  - The API is safe; the UI breaks AC-07 and AC-08 for such roles.
  - This logic predates R1b but now drives the R1b nav.
- **BUG-R1B-5: the Demo requests nav badge (and the bell) is empty for up to about 60 s after load.**
  - Seen as no badge after 10 s and "2" after 65 s, with the API showing 2 New.
  - The first fetch appears to be dropped by the same generation check as BUG-R1B-1.
- **BUG-R1B-6: axe `label-content-name-mismatch` (WCAG 2.5.3, Label in Name).**
  - `.pf-bell` has the accessible name "Notifications: 31 pending pass requests, 60 open alerts" while its visible text is "91".
  - `.pf-account` has the full name while it shows the initials "DA". This relates to `05` nit n-1.
  - It is the only axe finding on the R1 screens.
- **BUG-R1B-7: the Sites panel shows made-up contact defaults as real.**
  - New site C shows Address "Nagpur Parking Complex" and Contact "Site Facility Manager".
  - Billing (₹50/h, ₹350/day, ₹3,000/month, 18% tax) and puzzle/EV flags are also onboard defaults, not entered values.
  - This is `04` gap 8 (backend, `onboardSite` in `db.ts` ~3640), still open. It goes against AC-04 "never a made-up value".

**Closed:** BUG-3 (flag-ON noscript vs CSP).

### Observations (not bugs)
- **O-1:** on Logs in All sites, the 717 legacy demo rows show their site as the raw id "SITE-DEFAULT site-default", because that site doesn't exist. They do show a site, so AC-24 holds. Production data doesn't have these rows. Logs is an R1.1 screen.
- **O-2:** an earlier All-sites click sweep recorded `POST /alerts/trigger-cron`. I couldn't reproduce it in 3 later sweeps (0 writes), and with `x-site-id: ALL` the server refuses writes. It was most likely a run where a site had been chosen.
- **O-3:** the Live parking modal decodes basement flat slots as "Ground · Bay N". That matches the UX design, but it could confuse users.
- **O-4:** R1.1 screens are still unchanged, as planned. Valet has "Refresh Board" and the jargon "VALETX ENTERPRISE SUITE"; Billing and Audit show ISO dates, "INR" and enum codes; Logs has 13 columns.
- **O-5:** these 001 issues are unchanged and are not R1b regressions:
  - GET `/registrations` and `/employees` have no module check, so Att can read them;
  - `/alerts/trigger-cron` scans all sites and is open to any ALERTS editor;
  - 001 BUG-8: the Firestore ADC start-up retries every 10 s when Firestore is off.
- **O-6:** the 001 browser scripts in `tests/qa/browser` target components that F9 deleted, so they weren't re-run. `console.mjs` covers the same screens.
- **O-7:** not measured by QA: NFR-3, and Lighthouse on the console.
- **O-8:** test-side fixes made during this run, so the numbers above are trustworthy:
  - `openAs` now reloads after setting the remembered site or view-as. Before, a hash-only `goto` didn't start the view, which produced a false F10 view-as failure.
  - The On hold check now uses the radio's label and "Save status".
  - R1B-API-12 now sends a real `newStatus`.
  - Saved browser sessions are cleared after a server restart.

### Not tested
- The live D1 path (Firebase Hosting → Cloud Run) and `DEMO_HOSTING_EGRESS_CIDRS` on Cloud Run. They were tested locally by unit tests (`002-client-ip` 11/11) and through the hosting stand-in. They need checking on the preview once DevOps deploys it.
- sales@ mail delivery (a PRD R1b gate owned by the user).

### QA files (uncommitted, rule 6)
- **New:** `tests/qa/002/r1b/seed-r1b.mjs`, `r1b-api.test.mjs`, `lib.mjs`, `console.mjs`, `e2e-demo.mjs`.
- **Updated:** `tests/qa/002/support/hosting-server.mjs`. It takes an optional 4th argument, a rewrite target, and proxies the D1 marketing rewrites.
- None of these are part of `npm run test:qa`. Playwright is not a repo dependency. How to run each one is at the top of the file.

### Verdict (R1b, `a94eae5`): FAIL
To get to PASS:
1. Fix BUG-R1B-1, BUG-R1B-2 and BUG-R1B-3 (all Major).
2. Triage BUG-R1B-4 to 7 (Minor): fix them or defer them to R1.1.
3. QA then re-runs landing, nav, a11y and the flag-ON copy checks.

## R1b re-test (535f6fa), 2026-10-16

**QA engineer:** qa-engineer · **Date:** 2026-10-16
**Build under test:** `feature/002-r1b` HEAD **`535f6fa`**. That is `a94eae5` plus 3 frontend fix commits:
- `38982d3` BUG-R1B-1;
- `53d8d1d` BUG-R1B-2;
- `535f6fa` BUG-R1B-3.

**How it was set up:** a clean clone, made from the R1b clone at `a94eae5` plus the developer's bundle `pf-002-r1b-qafix-535f6fa.bundle`. The diff `a94eae5..535f6fa` touches only `src/App.tsx` and `marketing/privacy/index.html`. The main checkout was not switched.

**Inputs:**
- `04-implementation-notes.md` "R1b frontend — QA round fixes";
- `05-code-review.md` "R1b — frontend QA fixes (a94eae5..535f6fa)": PASS, with nits N-1 and N-2;
- `01-prd.md` v1.7;
- this report's "R1b" section.

**Gaps in the inputs:** none found. 04 and 05 describe the same change as the diff.

**Verdict: PASS.**
- BUG-R1B-1, BUG-R1B-2 and BUG-R1B-3 are **closed**.
- Nothing new is Critical or Major.
- One new **Minor** was found: BUG-R1B-8. It is in code these commits didn't touch.
- R1B-4 to R1B-7 stay open as Minors.

### Environment
- **Same as the R1b run:**
  - Bun 1.4.2, `bun install --frozen-lockfile` (416 packages, lockfile unchanged), Node 22.22.2;
  - `NODE_ENV=production SITE_SCOPE_MODE=strict`, Firestore off;
  - `dist/server.cjs`, with the console built with `VITE_API_BASE_URL` pointing at the local server.
- **Fresh seed:** `tests/qa/browser/seed.mjs` + `tests/qa/002/r1b/seed-r1b.mjs`. Same roles and sites:
  - Master; Site Admins A, C and D; multi-site A+B;
  - Attendant A; custom role `qa.uma`; no-site user;
  - site D has 1,080 slots.
- **Marketing:** built with the flag OFF and ON, and served with the D1 `firebase.json` headers (md5 `e0c94582…`). With the flag ON, the `/api/v1/demo-requests` rewrite is proxied to the console server.
- **Browser:** Playwright + Chromium, axe-core 4.14.
- **Slow API:** "slowed" means `page.route` delays only that endpoint in the browser: `/rbac/roles` or `/my-sites`, by 1.5 s or 3 s.

### 1. The three bugs
| Bug | Steps (same as the R1b run, more tries) | Before (`a94eae5`) | Now (`535f6fa`) | Result |
|---|---|---|---|---|
| **BUG-R1B-1** blank "Loading" at `/`, single-site users | `retest.mjs bug1`. For each of `qa.atta` and `qa.admina`: **8 fresh sign-ins** through the Login screen, each in a new browser, plus **6 reloads of `/`** (no hash). Then with `/rbac/roles` slowed by **1.5 s** (4 sign-ins + 2 reloads) and by **3 s** (2 sign-ins + 2 reloads). Pass means `#/overview`, H1 "Overview", never stuck on "Loading" | atta blank 2/8 sign-ins and 2/6 reloads; admina blank 2/6 reloads; with roles slowed, blank 4/4 (04) | atta: **14/14** sign-ins and **10/10** reloads → Overview. admina: **14/14** and **10/10**. With roles slowed, Overview appears as soon as roles answer: about 1.1 s with a 1.5 s delay, about 2.6 s with 3 s. `console.mjs` landing: atta 5/5, admina 5/5, admind 5/5 | **Closed** |
| **BUG-R1B-2** multi-site Site Admin, no remembered site, endless "Loading" | `retest.mjs bug2`, `qa.multiab` in a fresh browser: **8** sign-ins with no delay, **3** with roles slowed 1.5 s, **3** with `/my-sites` slowed 1.5 s. Then: choose site A; reload `/`; with no site, open `#/sites`, `#/demo-requests`, `#/billing` and `#/nope`, then `#/live-parking`, `#/employees` and `#/overview`; choose B and repeat the deep links; sign out → sign in as `qa.admina` → sign out → sign in as `qa.multiab`. `retest.mjs viewas`: the Master enters and leaves view-as of `qa.multiab`, `qa.admina` and `qa.atta` (also with roles slowed), and of `qa.multiab` from the Sites panel ⋯ menu | blank 5/5 | **"Choose a site" 14/14** (switcher reads "Choose a site"), plus `console.mjs` landing 5/5.<br>**Choose A** → `#/overview` "Overview" (AC-10).<br>**Reload** → A's Overview.<br>**No site:** `#/sites`, `#/demo-requests`, `#/billing` and `#/nope` → **No access**; `#/live-parking`, `#/employees` and `#/overview` → the Choose a site prompt under that page's H1.<br>**Site B chosen:** Live parking and Employees open for B; `#/sites` and `#/nope` → No access.<br>**Sign-out → `qa.admina`:** Overview of A, nothing of `qa.multiab`. **Back to `qa.multiab`:** its own remembered site B, Overview.<br>**View-as:** `qa.multiab` → "Choose a site" with the bar "… · No site chosen — read-only"; `qa.admina` and `qa.atta` → Overview with the bar; Exit view → the Master's Sites page each time (**7/7**) | **Closed** |
| **BUG-R1B-3** flag-ON `/privacy/` sentence | The PRD v1.7 quote was extracted by script (352 characters) and searched for in the built "What we collect" paragraph. Both builds were compared with QA's `a94eae5` builds using `diff -r` | old sentence only | **Flag ON:** the paragraph contains the PRD v1.7 sentence **exactly** ("We don't store your IP address … stop abuse."), and the old sentence is gone. Only `privacy/index.html` differs from `a94eae5` with the flag ON.<br>**Flag OFF:** the whole `dist-marketing` is **byte-identical** to `a94eae5`, asset hashes included, so no marketing page changed.<br>`e2e-demo.mjs` (flag ON, real form → D1 rewrite → B6 → console → Delete): **4/4** | **Closed** |

### 2. Regression (both console fixes change how the landing page and the site are chosen)
| Area | Test | Result |
|---|---|---|
| **AC-10 landing, every role** | `console.mjs` landing (5 tries each), `retest.mjs` | Master → Sites 5/5. SA A and SA D → Overview 5/5. Att → Overview 5/5. Multi-site → Choose a site 5/5. No-site → "No site assigned" 5/5. View-as SA → Overview; view-as multi-site → Choose a site. Custom role `qa.uma` → **Overview 5/5**: no longer blank, but still the wrong page. That is **R1B-4**, unchanged |
| **AC-07 nav, every role** | `console.mjs` nav, `nav-extra.mjs` | Master, SA A and Att: exactly the permitted modules; names equal the H1s; badges are counts. Multi-site with and without a site, and view-as `qa.admina`, `qa.multiab` and `qa.atta`: exactly the viewed role's modules (5/5). `qa.uma`: still every SA module (**R1B-4**). Demo requests badge still late (**R1B-5**) |
| **AC-08 No access, every role** | `console.mjs` noaccess, landing; `retest.mjs bug2`, `n1`; `r1b-api` 12 | SA A: 8 typed URLs → No access. Att: 5. Multi-site: `#/sites`, `#/demo-requests`, `#/billing` and an unknown route → No access, with and without a site. **This is new:** before `535f6fa` a multi-site SA was asked to choose a site first (05 n-5). View-as SA → `#/sites` is No access. API 403s unchanged. `qa.uma` opens Overview and Live parking (**R1B-4**) |
| **Deep links with and without a site** | `retest.mjs bug2`, `console.mjs` landing (F2) | With no site: site pages show the prompt under their own H1, and pages the role can't open show No access. With a site: the page opens for that site. A deep link survives reload; Back works; focus moves to the H1 |
| **Site switch, All sites** | `console.mjs` switch, allsites | Multi-site A→B shows only B data on Overview, Live parking and Employees; the site name appears only in the switcher (AC-23). All sites: banner shown; every guarded write disabled (Employees 101, Alerts 66, Inventory 77, Valet 4, Logs 1; 0 enabled); every row shows its site; the click sweep sent **0** non-GET requests (AC-24) |
| **Sign-out / sign-in** | `retest.mjs bug2` | Sign-out returns to Sign in. The next user (single-site) lands on their Overview with no data of the previous user. The multi-site user gets their own remembered site back |
| **Console checks** | `console.mjs`, all 19 sections, 134 checks | **111 pass, 23 fail.** All 23 failures are known or explained:<br>- 17 × AC-19, axe R1B-6 only;<br>- 3 × `qa.uma` (R1B-4);<br>- 1 × Demo badge late (R1B-5);<br>- 1 × F7 made-up defaults (R1B-7);<br>- 1 × "F7 multi-site SA: Sites = No access" showed Overview once. That was a test-harness race (O-1); 3 re-runs of the section passed 3/3.<br>Everything else passes as in the R1b run: F3, F4, F5 (1,080 slots), F6, F7, F10 (including Delete and view-as of another Master: Save and Delete disabled), AC-11 to 14, AC-21, AC-23 to 25, AC-27, NFR-5 |
| **r1b-api** | `r1b-api.test.mjs`, fresh seed | **22/22** |
| **001 regression vs `main`** | `test:qa` vs the `main` `84ec8ef` baseline (same environment). `main` is still `84ec8ef` in your repo | `001-backend` 64/64, `001-hotfix-coldstart` 6/6, `001-platform-v1` 42/57. Of the 112 001 tests that pass on `main`, all 112 still pass, and the 15 failures are the same tests. **Identical** |

### 3. Code-review nit N-1 (seen; not failing the run)
`retest.mjs n1`: deep link to `#/sites`, 3 tries each, sampled every 100 ms.

| User | `/rbac/roles` | "Choose a site" visible before No access |
|---|---|---|
| `qa.multiab` | no delay | **not seen** (0 ms at 100 ms sampling; No access at about 130 ms) |
| `qa.multiab` | +1.5 s | **about 1.44 s** (1,439 / 1,442 / 1,447 ms) |
| `qa.multiab` | +3 s | **about 2.9–3.0 s** (2,903 / 2,993 / 2,995 ms) |
| `qa.admina`, `qa.atta` (single site) | +1.5 s | **not seen**: No access at about 120–185 ms, before roles answer (the site is chosen automatically, so there is no prompt) |

So N-1 affects only a multi-site user with no site chosen, and lasts as long as `/rbac/roles` takes to answer. It always ends on No access, and nothing can be done in that state. It stays a Nit, as 05 says.

### 4. Gates (clean clone `535f6fa`)
| Gate | Result |
|---|---|
| `bun run tokens --check` | PASS |
| `npm run lint` | PASS, **0 errors** |
| `npm run lint:styles` | PASS: self-test 75/75; 61 R1 files clean |
| `npm run build` | PASS |
| `build:marketing`, flag OFF / `PF_DEMO_FORM=1` | PASS / PASS |
| `npm run test:qa` (`SITE_SCOPE_MODE=strict`, Firestore env blank), **4 full runs** | **160/175** every time (247 s, 242 s, 246 s, 244 s). Same 15 known 001 FLOW failures each time (FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27) |

**Flakes:**
- **Hang after test 147** (the builder): **not seen in 4/4 runs**. Tests 147 → 148 → 149 went straight through every time.
- **N-2 port collision** (the reviewer, B3 403): **not seen in 4/4 runs**.

Runs 3 and 4 overlapped one short browser script, so the box was under load then. Neither flake can be ruled out, but neither showed up in 4 runs.

### 5. axe (wcag2a/aa, 21a/aa, 22aa) at 360 / 768 / 1280
| Page | Result |
|---|---|
| Choose a site (`qa.multiab`, `/`) | R1B-6 only (`.pf-account`); no sideways scroll; sizes and targets OK, 3/3 |
| No access (`qa.multiab`, `#/sites`) | R1B-6 only; OK 3/3 |
| Overview, Live parking, Employees (SA A) | R1B-6 only (`.pf-bell`, and `.pf-account` at 1280) |
| Sites, Demo requests (Master) | R1B-6 only (`.pf-account`) |
| Overview, Employees (SA C, no bell count) | **0** at 360/768; R1B-6 at 1280 |
| `/privacy/` flag OFF and flag ON (D1 headers) | **0 violations** at all widths; no console or CSP errors; no sideways scroll; text ≥ 13 px. At 360 the off-screen "Skip to content" link measures 140×40 when it has focus. That is the known **O-7** from the R1a preview check: keyboard only, not a touch target |

Only the known R1B-6 appears on the console pages.

### Bugs
**Closed:** BUG-R1B-1, BUG-R1B-2, BUG-R1B-3.

**New, Minor**
- **BUG-R1B-8: reloading while a view-as is being restored ends the view without a word.**
  - **Steps:** as the Master, start a view-as, then reload or navigate while the page is restoring it (while `/rbac/users` is in flight).
  - **Result:** the stored view-as is cleared and the Master is back on their own pages. Reproduced 2/2 with `/rbac/users` slowed 0.8 s and a reload 300 ms after load. With a normal load it was 5/5 fine.
  - **Cause:** the aborted request is treated as a failure, and the error path calls `rememberViewAs(null)` (`App.tsx` view-as recall effect, around line 419). Its "Couldn't start the view" toast is lost in the reload.
  - **Impact:** it fails safe (back to the real Master, no data exposure), but it's surprising.
  - This code isn't in `a94eae5..535f6fa`, so it is not a regression.

**Carried forward, still open (Minor):**
- **R1B-4:** a custom role missing module keys fails open in the nav and routes. `qa.uma` now lands on Overview every time instead of a blank page.
- **R1B-5:** the Demo requests badge is empty for up to about 60 s after load.
- **R1B-6:** axe `label-content-name-mismatch` on `.pf-bell` and `.pf-account` (WCAG 2.5.3).
- **R1B-7:** the Sites panel shows the onboard made-up defaults as contact details (04 gap 8).

### Observations
- **O-1 (test harness race):** `openAs` wrote the remembered site while the first page load was still choosing the site. When the landing redirect finished within about 1 ms of the test's deep-link hash change, it replaced `#/sites` with `#/overview`.
  - This happened 1 of 12 times and 2 of 24 times in a stress probe.
  - The same narrow window exists for a person who changes the hash at the exact moment the landing page is chosen. `RouteKeeper` (unchanged since R1b) only replaces a route that is still null in React state.
  - Not a bug in practice. `lib.mjs` now waits for the first load to settle.
- **O-2:** `retest.mjs` measures the Overview delay from just after the Sign-in click returns (about 0.6 s after the click). The "about 1.1 s" with a 1.5 s roles delay is measured from that point.
- **O-3:** the earlier notes on legacy `site-default` rows and on R1.1 screens are unchanged.

### QA files (uncommitted, rule 6)
- **New:**
  - `tests/qa/002/r1b/retest.mjs` (bug1, bug2, viewas, n1);
  - `tests/qa/002/r1b/axe-retest.mjs`;
  - `tests/qa/002/r1b/nav-extra.mjs`.
- **Updated:**
  - `tests/qa/002/r1b/lib.mjs`: `openAs` waits for the first load to settle before writing the stored site or view-as (O-1).
- `console.mjs`, `r1b-api.test.mjs`, `e2e-demo.mjs` and `seed-r1b.mjs` are unchanged since the R1b run.
- None of these are part of `npm run test:qa`.

### Verdict (R1b re-test, `535f6fa`): PASS
- All three bugs are closed, and nothing new is Critical or Major.
- The open Minors (R1B-4 to R1B-8) need triage: fix or defer to R1.1.
- Before the flag goes ON, the PRD's other R1b gates still apply: security review, sales@ mail, DevOps log retention, and the preview check of the live D1 path.

## R1B-S1 hotfix (`bbfdbcc`) and R1b final (`9ac2843`), 2026-10-17

**QA engineer:** qa-engineer · **Date:** 2026-10-17
**Builds under test:**
- **(a)** `hotfix/r1b-s1` @ **`bbfdbcc`**, one commit on `main` `84ec8ef`.
- **(b)** `feature/002-r1b` final HEAD @ **`9ac2843`**. On top of `535f6fa` it adds:
  - `cfdff14`: the R1B-S1 cherry-pick;
  - `9dd406f`: R1B-S2;
  - `a0410b1`: BUG-R1B-7, backend half;
  - `af5832a`: BUG-R1B-6;
  - `9ac2843`: BUG-R1B-7, console half.

**Setup:**
- Clean clones of `hotfix/r1b-s1`, `feature/002-r1b` and `main`, made from one bundle in your repo (`pf-sec-r1bs1.bundle`, full history, refs equal to your branches).
- Bun 1.4.2 and `bun install --frozen-lockfile` (416 packages, lockfile unchanged on both branches), Node 22.22.2.
- `NODE_ENV=production`, `SITE_SCOPE_MODE=strict`, Firestore off.
- Seeded with the same roles and sites as the earlier R1b runs.
- The main checkout was not switched.

**Inputs:**
- `04-implementation-notes.md` (R1B-S1 / R1B-S2 / BUG-R1B-7 backend; BUG-R1B-6 and BUG-R1B-7 console);
- `05-code-review.md` (PASS, nits n-1 to n-3);
- `07-security-review.md` "Delta review — R1B-S1 hotfix and R1B-S2" (signed off);
- `01-prd.md`;
- `d1/firebase.json` (md5 `e0c94582…`, unchanged).

**Gaps in the inputs:**
- The deployed Android APK binary isn't in the repo (also 07 gap 1). I tested the in-repo attendant app (`src/mobile`) as a build and its API contract. A smoke test on a real installed APK after deploy is still DevOps's step.
- The frontend's review-log line still says CHANGES. 05 and 07 then passed the same HEAD.

**Verdicts**
- **(a) `bbfdbcc`: PASS.** Every non-canonical spelling of a protected route returns 401 without a session. Sign-in, the console and the attendant app's `/api/v1` calls work. The 001 suites are unchanged from `main`.
- **(b) `9ac2843`: PASS.**
  - BUG-R1B-6 and BUG-R1B-7 are **closed**.
  - The R1B-S2 path writes no IP address or user-agent.
  - The full R1b regression with the flag OFF shows only known open Minors.
  - One new **Minor** was found (BUG-R1B-9, in F1 code, not a regression). Nothing new is Critical or Major.

### (a) `hotfix/r1b-s1` @ `bbfdbcc`
| Check | Test | Result |
|---|---|---|
| lint, build | `npm run lint`, `npm run build` | PASS (0 errors), PASS |
| **001 suites unchanged** | `npm run test:qa`, 2 runs, compared with `main` `84ec8ef` (1 run, same environment) | **116/131 both runs** (212 s, 209 s). `main` 112/127. The 15 failures are the same tests as `main` (the known 001 FLOW list). All 112 tests that pass on `main` still pass. The only additions are the 4 new `001-hotfix-r1b-s1` tests, which pass 4/4 |
| **No session, canonical paths** | `tests/qa/002/r1b/r1bs1-paths.test.mjs` R1B-S1-01: 18 protected 001 routes (`/rbac/roles`, `/rbac/users`, `/security/audit-logs`, `/employees`, `/employees/profile`, `/slots`, `/logs`, `/registrations`, `/sites`, `/my-sites`, `/auth/me`, `/alerts/non-parked`, `/invoices`, and POST `/vehicles/entry`, `/slots/save`, `/alerts/trigger-cron`, `/rbac/users`, `/sites/onboard`) | all **401** |
| **No session, other spellings** | R1B-S1-02, with each path sent raw (no client normalisation). 15 spellings per route: all upper case; `/API/V1`, `/Api/V1`, `/api/V1`, `/API/v1`; last segment upper case; first segment capitalised; trailing `/` and `//`; upper case + trailing `/`; leading `//`; `/api//v1`; `/v1//`; doubled inner `/`; mixed case + `//` | **270 requests, 270 × 401.** No data, no 500 |
| The 15 Oct repro | R1B-S1-03: `/API/V1/rbac/roles`, `/Api/V1/rbac/roles`, `/api/v1/rbac/ROLES`, `/api/v1/rbac/roles/`, `//api/v1/rbac/roles`, `/api//v1/rbac/roles`, `/API/V1/employees/profile?email=…`, `/API/V1/sites`, `/API/V1/my-sites` | all **401 `ERR_SESSION_EXPIRED`** |
| **The probe catches the bug** | The same file against `main` `84ec8ef` | **Fails on `main` as it should.** Of 270 spellings, **57 → 200** (data returned without a session), 6 → 500, 6 → 403, 15 → 404 |
| **Sign-in** | R1B-S1-04 | `/api/v1/health` (and `/health/`) 200; login 200 (and with a trailing slash); a wrong password is still 401 |
| Signed in, site scoping | R1B-S1-05 | Site Admin A: `/slots` and `/slots/` 200 on A. On site B, `/slots`, `/slots/`, `/api//v1/slots` and `/API/V1/slots` → 403/404 with no slot data. `/rbac/users/` and `/security/audit-logs(/)` → 403 |
| **Android / attendant app contract** | R1B-S1-06 as Attendant A, sending `x-site-id` as `src/mobile/api.ts` does | `/auth/me`, `/my-sites` and `/slots?basement=ALL&status=ALL` → 200 with `x-session-token`, `Authorization: Bearer` and the `__session` cookie. `/employees` 200. CORS preflight from `capacitor://localhost` 200/204. `/vehicles/entry` and `/vehicles/exit` reach their handlers. `/auth/logout` 200, after which the token gets 401 |
| **Console** | `tests/qa/002/r1b/hf-ui.mjs`: the 001 console (the hotfix's UI), signed in through the Login screen as Master, Site Admin A and Attendant A, then reloaded | **3/3**: signed in, data loads, **no 401 or 500 on any `/api/v1` call**, and the session survives reload |
| **Attendant mobile app** | `hf-ui.mjs`: the `src/mobile` build (`VITE_API_BASE` = local server), served from `http://localhost` (an allowed Capacitor origin), in a mobile Chromium context: identify → password → set the 4-digit PIN | **PASS**. After sign-in: `POST /auth/login` 200, `GET /my-sites` 200, `/employees` 200, `/slots` 200, and the Gate Terminal shows "QA ATTA · QA SITE A". The only 401 was `/auth/me` *before* sign-in (the app checking for an old session) |

### (b) `feature/002-r1b` @ `9ac2843`

#### Gates
| Gate | Result |
|---|---|
| `bun run tokens --check` | PASS |
| `npm run lint` | PASS, **0 errors** |
| `npm run lint:styles` | PASS: self-test 75/75; 61 R1 files clean |
| `npm run build` | PASS |
| `build:marketing`, flag OFF / `PF_DEMO_FORM=1` | PASS / PASS. **Both builds are byte-identical** (`diff -r`, asset hashes included) to QA's `535f6fa` builds, so the marketing site didn't change |
| `npm run test:qa`, 2 runs | **166/181 both runs** (251 s each). The same 15 known 001 FLOW failures as `main`. All 112 `main` passes still pass. The R1B-S1 4/4, R1B-S2 and R1B-7 tests pass |

**Flakes:**
- The 07 harness flake ("AC-32d delete waits for Firestore") was **not seen in 2 runs**.
- No hang after test 147, and no port-collision flake (N-2).

#### BUG-R1B-6 (WCAG 2.5.3 Label in Name): **closed**
`tests/qa/002/r1b/r1b67.mjs`, at 360/768/1280, as Site Admin A, Master (site A), the multi-site SA and Site Admin C (nothing pending):
- **The bell:** its accessible name starts with its visible text, "91 notifications: 31 pending pass requests, 60 open alerts". With nothing pending it shows no text and is named "Notifications: nothing needs your attention".
- **The account button:** named "DA DigiSolutions Master Admin, Platform Master Admin: account", and the visible text is "DA", or "DA DigiSolutions Master Admin" from 1024 px.
- **axe:** `label-content-name-mismatch` is **0 on `.pf-bell` and `.pf-account`** in all 12 cases.
- **`console.mjs` a11y:** Overview, Live parking, Employees, Sites and Demo requests at 360/768/1280 as SA A, SA C and Master get **0 axe violations** (17 checks that failed on R1B-6 before now pass).
- **`axe-retest.mjs`:** Choose a site and No access get **0** at all widths.

**Remaining:** the same axe rule still fires on a different control, the **site switcher**. This is new BUG-R1B-9; see Bugs.

#### BUG-R1B-7 (made-up site contacts): **closed**
`r1b67.mjs`:

| Check | Result |
|---|---|
| Onboard with no address or contact (API) | stored `address`, `contactPerson`, `contactEmail`, `contactPhone` = **""** (no "<city> Parking Complex", "Site Facility Manager", admin@<code>.com or +91 9800000000) |
| Onboard with values | kept and trimmed ("12 MG Road, Thane", "Meera Joshi", meera@thane-mall.in, +91 98200 11223) |
| Sites panel: new blank site, and seeded site C (onboarded on this build) | Address, Contact person, Contact email and Contact phone each on their own row, all **"— not entered"** |
| Sites panel: site with entered values | shows them |
| Sites panel: a legacy site holding the four old made-up values (set on QA Site B through `/sites/update`) | all four **"— not entered"**; none of the made-up text appears anywhere in the panel |
| Edit site on that legacy site | the four fields are blank, with the note "…filled in automatically when the site was onboarded are left blank here. Saving clears them…" |
| Saving that form | the server stores **""** for all four |
| `console.mjs` F7 "no fabricated contact values" | **PASS** (it failed on `a94eae5` and `535f6fa`) |

Still open, outside this bug: billing, puzzle and EV onboarding defaults (05 n-3, the PM's call).

#### R1B-S2: the demo path writes no IP address or user-agent: **verified**
`tests/qa/002/r1b/r1bs2-demo-audit.mjs` against the built server started as on Cloud Run (`K_SERVICE` set, `DEMO_HOSTING_EGRESS_CIDRS=198.51.100.0/24`). Every visitor request used a distinctive user-agent and visitor addresses from 203.0.120–124.x. **8/8 checks pass:**

| Check | Result |
|---|---|
| 640 demo POSTs from 128 visitors in under a minute (over the 600/min global limit) | **all 200**; the global `/api/` limiter didn't fire |
| A visitor's 6th POST | **429**: the per-visitor limit still applies |
| A POST not via Hosting | **403 `ERR_VIA_HOSTING_ONLY`** |
| Other spellings | `/API/V1/DEMO-REQUESTS?email=…`, `/api//v1/demo-requests?email=…` and `/api/v1//demo-requests` → 404, nothing stored. 610 GETs of the `//` spelling → 405, then 429 from the redacted global limiter |
| **Audit** (all rows, read as Master) | 13 demo-path events (`RATE_LIMIT_EXCEEDED`, `DEMO_REQUEST_NOT_VIA_HOSTING`). **Every one has `ipAddress: "redacted"`, no `userAgent` and no query string.** **No audit row anywhere** carries a visitor IP, the visitor user-agent or the query-string email |
| Control: a 001 route | a failed staff sign-in still records the client IP (`AUTH_FAILED_INVALID_CREDENTIALS`, `ipAddress` 198.51.100.20). Its `userAgent` field is 001's fixed "Smart-PMS-Client/1.0" |
| Stored requests | only the valid request and the trailing-slash one (which routes, so it counts as the canonical form). Fields: `id`, `createdAt`, the form fields, `consentAt`, `source`, `status`. **No IP, user-agent or browser field** |
| Data on disk | `data/pms_store.json` and the server's stdout log: **0 matches** for any visitor IP, the user-agent or the query-string email |

**The probe catches the bug:** against QA's `535f6fa` build it fails as it should: 41 of the 640 POSTs got 429 from the global limiter, and the 654 demo-path audit rows it wrote are unredacted. For example, a `RATE_LIMIT_EXCEEDED` row has `ipAddress` and `actor` "198.51.100.20" and the visitor's user-agent.

The R1B-S1 probe also passes on this branch: `r1bs1-paths.test.mjs` with the 6 R1b routes added (`/overview`, `/sites/summary`, `/sites/update`, `/demo-requests/export`, `/demo-requests/status`, DELETE `/demo-requests/:id`): **6/6, 360 × 401**.

#### Full R1b regression, flag OFF (R1b console scope)
| Suite | Result |
|---|---|
| `retest.mjs` (BUG-R1B-1, BUG-R1B-2, view-as, N-1) | **27/27**:<br>- atta and admina: 14/14 sign-ins and 10/10 reloads each → Overview, including with `/rbac/roles` slowed by 1.5 s and 3 s;<br>- multiab: "Choose a site" 14/14; choose A → Overview; reload → A's Overview;<br>- No access for `#/sites`, `#/demo-requests`, `#/billing` and an unknown route; the site prompt on site pages;<br>- deep links with site B; sign-out → `qa.admina` → back;<br>- view-as of multiab, admina and atta in and out 7/7.<br>N-1 is unchanged: about 1.43 s with roles +1.5 s, about 2.95 s with +3 s, 0 for single-site users |
| `console.mjs`, all 19 sections | **130/134.** The 4 failures are the known open Minors: `qa.uma` AC-07, AC-08 and AC-10 (**R1B-4**), and the Demo requests badge late (**R1B-5**).<br>Everything else passes: F3; F4 (Overview figures equal the API); F5 (1,080 slots, puzzle, modal, paging); F6 (approve, bulk reject with a reason); F7 (now including no made-up contacts); F8; F10 (status with a note, Delete, Export, view-as of another Master read-only, Site Admin No access); AC-06; AC-11 to 14; AC-19 (0 axe); AC-21; AC-23; AC-24 (All sites: writes disabled, 0 non-GET in the click sweep); AC-25; AC-27; NFR-5 |
| `nav-extra.mjs` (AC-07: multi-site with and without a site; view-as admina, multiab, atta) | **5/5** |
| `r1b-api.test.mjs` (site / role / view-as isolation of the R1b endpoints, AC-08, AC-24, AC-32a/c/d including Delete) | **22/22** |
| `axe-retest.mjs` (Choose a site, No access, `/privacy/` flag OFF and ON, at 360/768/1280) | **10/12.** The 2 failures are the known **O-7**: the off-screen "Skip to content" link on `/privacy/` measures 140×40 at 360 when focused (keyboard only). axe **0** on every page |
| Marketing flag OFF (`marketing.mjs MODE=off`, D1 headers) | **88/88** |
| R1a copy flag OFF (`r1a-copy.mjs MODE=off`) | **29/29** |
| 001 regression vs `main` | identical (see Gates) |

### Bugs
**Closed:** BUG-R1B-6, BUG-R1B-7. R1B-S1 and R1B-S2 are verified fixed on both branches.

**New, Minor**
- **BUG-R1B-9: the site switcher's accessible name doesn't contain its visible text (WCAG 2.5.3; axe `label-content-name-mismatch` on `.pf-switcher`).**
  - **Steps:** as the Master with site A chosen, or as `qa.multiab` with a site chosen, at 768 or 1280 px, run axe.
  - **Result:**
    - The button shows "QA Site A QAA" (the name, then the code tag), but it is named "Site: QA Site A · QAA. Switch site". The "·" breaks the match.
    - At 360 only "QAA" shows, and axe passes.
    - "All sites", "Choose a site" and the single-site label (a `role=group` span) pass.
  - **History:** the code is from F1 (`afbb9e8`), not these commits. Earlier runs missed it because axe ran as the Master with no site chosen, and as single-site Site Admins.
  - **Suggested fix:** start the name with the visible words, e.g. "QA Site A QAA: site, switch site".

**Still open, Minor (carried forward):**
- **R1B-4:** a custom role missing module keys fails open in the nav and routes (`qa.uma`).
- **R1B-5:** the Demo requests badge is empty for up to about 60 s after load.
- **R1B-8:** reloading while a view-as is being restored ends the view without a word.

**Open Lows from 07, for R1.1, not re-tested as findings:**
- **R1B-S8:** upper-case paths skip the global limiter.
- **R1B-S9:** demo POSTs no longer have the global 600/min backstop. I saw this as designed: 640 POSTs, all 200.

### Observations
- **O-1:** the frontend's review-log line for `9ac2843` says CHANGES ("built, not reviewed"). 05 and 07 then passed that HEAD, so it's process only.
- **O-2:** 001's sign-in audit stores a fixed `userAgent` ("Smart-PMS-Client/1.0"), not the client's. That's 001 behaviour, unchanged.
- **O-3:** with an incremental fix bundle, one probe needs an older build at hand. I used QA's own `535f6fa` and `84ec8ef` builds to show that the S1 and S2 probes fail on old code.

### QA files (uncommitted, rule 6)
New in `tests/qa/002/r1b/`:
- `r1bs1-paths.test.mjs` (R1B-S1; set `QA_R1B=1` for the R1b routes);
- `hf-ui.mjs` (hotfix console + attendant mobile app);
- `r1bs2-demo-audit.mjs` (R1B-S2);
- `r1b67.mjs` (BUG-R1B-6/7).

The other QA files are unchanged since the re-test. None of these are part of `npm run test:qa`.

### Verdict
- **(a) `hotfix/r1b-s1` @ `bbfdbcc`: PASS.** Ready to go out, with the APK smoke after deploy (07).
- **(b) `feature/002-r1b` @ `9ac2843`: PASS.** BUG-R1B-6 and BUG-R1B-7 are closed; R1B-S2 writes no IP or user-agent; the flag-OFF R1b regression shows only known Minors. New Minor BUG-R1B-9 and open Minors R1B-4, R1B-5 and R1B-8 need triage: fix, or defer to R1.1.
