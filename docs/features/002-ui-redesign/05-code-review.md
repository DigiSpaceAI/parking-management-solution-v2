# Code Review — 002 UI Redesign, R1-pre slice T1–T6 (round 1)
Reviewer: code-reviewer · Date: 2026-10-06 · Scope: `feature/002-design-system` `9ab49e0..2b68077` (6 commits) vs `main` @ `d42af6f`
Checked against:
- `03-tech-design.md` v1.1 (APPROVED): token pipeline, components, marketing site, release slicing, T1–T6;
- `02-ux-design.md` Step 2 and S6;
- the approved `design-system/tokens.json` and `components.css`;
- `01-prd.md` v1.1: AC-01..06, AC-18, AC-21, AC-30;
- `04-implementation-notes.md`: Frontend section, gaps 1–15.

**How I reviewed it:** I read the full diff (`git diff d42af6f..feature/002-design-system`) and every new source file. To run things, I didn't use a worktree in your folder, because it would sit outside the connected folder and need a dependency install there. Instead I cloned the branch from a git bundle into the cloud workspace and ran every gate there. Dependencies came from an existing install of the same `package.json` deps, kept outside the repo. I also did browser checks of `dist-marketing/` in headless Chromium. I made no source edits, and your checkout stayed on `feature/001-parkflows-platform-v1`.

## Gaps found in inputs
1. 04 gaps 1–3 hold: 001 is not merged, and `lint` / `test:qa` can't reflect 001 until the rebase. The 10 Oct date needs a PM/user decision (gap 1).
2. **Untracked files in the repo root:**
   - `pf-002-design-system-2b68077.bundle`, `pf-98c7fcc.bundle`, `pf-f8a3753.bundle` and `pf-main-d42af6f.bundle`;
   - the untracked `docs/features/002-ui-redesign/` folder (including the reference `tokens.json`, gap 13).

   None of these are committed. Add `*.bundle` and `dist-marketing/` to `.gitignore` after the rebase (gap 14).
3. **03 is inconsistent about format.ts:** it says `format.ts` uses `Intl` with `timeZone:'Asia/Kolkata'`. The implementation uses a fixed +05:30 shift instead. IST has no daylight saving, so the result is the same and doesn't depend on the host timezone (verified below). I accept it; no change needed.

## Scope check (all PASS)
- **Only allowed new files:**
  - `git diff --name-status` shows 66 added files, all under `src/design-system/**`, `src/utils/format.ts`, `scripts/build-tokens.mjs`, `scripts/check-styles.mjs`, `marketing/**` and `tests/qa/002-format.test.mjs`;
  - `package.json` is the only modified file.
- **`package.json`: scripts only.**
  - `build` gains a leading `npm run tokens &&`.
  - Added: `tokens`, `lint:styles` (self-test first), `build:marketing`, and `test:qa` (identical to 001's B12 line).
  - No dependency changes. `bun.lock` and `package-lock.json` are unchanged.
- **Nothing wired:** no file outside `src/design-system/` imports from it or from `format.ts`. `App.tsx`, `server.ts` and `src/server/*` are untouched. The preview isn't routed.

## Checks against the brief
| Area | Result | Evidence |
|---|---|---|
| Tokens match `tokens.json`; `--check` catches drift | **PASS** | `src/design-system/tokens.json` is byte-identical to the approved reference. `--check` is green on the branch. Changing one colour in `tokens.json` → both files `stale`, exit 1. Hand-editing `tokens.css` → `stale`, exit 1. A Tailwind smoke build with `theme.css` compiles `bg-navy-600`, `p-4` (`calc(var(--spacing)*4)` with `--spacing: 4px`), `text-title-1`, `rounded-md`, `shadow-1` and `text-success-700` from the tokens. |
| No Tailwind default reset (K3); reduce-motion | **PASS** | `theme.css` has no `--*: initial`. `tokens.css` sets every duration to `0ms` under `prefers-reduced-motion`. `components.css` also drops transitions and animations under `.pf`. Tailwind's default transition maps to `--duration-fast`. |
| Fonts | **PASS** | No Google Fonts request anywhere (and none in the build output). Each family has its `OFL.txt` and the README lists sources and sha256 checksums.<br>Checked with fontTools:<br>- Sora 600/700 and JetBrains Mono 500/600 have **no Reserved Font Name**, so subsetting them is allowed.<br>- IBM Plex Sans **has** RFN "Plex", and IBM's own split WOFF2 files are shipped **unmodified** (name tables say "IBM Plex Sans", v3.005). **The gap-9 handling is acceptable.**<br>- ₹ (U+20B9) exists only in the Plex Latin2 files, and their `unicode-range` covers it.<br>- The two JetBrains files are different files (they just happen to be the same size). |
| Logo / favicon SVGs | **PASS** | All 6 files are plain `<svg>`, `<rect>` and `<path>` with a `<title>`. No `<script>`, no event handlers, no `href`/`xlink`/`url()`/`<image>`/`foreignObject`, no external references (only the xmlns). |
| Style literals | **PASS (with note)** | No hex, rgb or named colours in `components.css` or `site.css`; colours all come from tokens.<br>The remaining literals (icon sizes 12–32px, 1px/2px borders, 6/8/10px gaps, 360/480px widths, 17px brand, 800ms spinner, …) **are the same set as the approved reference `components.css`**. The only new ones are `240px` (preview grid) and `767.98px` (media query).<br>04 gaps 6–7 list only some of these, so read them as "literals carried over from the approved file". No change needed; UX already owns folding them into tokens. |
| No inline `style={{}}` except `--pf-*` | **PASS** | Only `Skeleton` (`--pf-w`), `OccupancyBar` (`--pf-occ`) and `BarChart` pass `--pf-*`. No other `style=` in TSX, HTML or JS. |
| `lint:styles` really catches what it claims | **FAIL** | Many bypasses; see **M-3**. |
| Components match 03's list and order | **PASS** | Order 1–7 is complete:<br>- Icon, Button, IconButton;<br>- TextField (`mono`), Select, Checkbox, Radio, Field;<br>- StatusChip, CountBadge, SiteTag, PlateText, SlotCode (+ IdText);<br>- Banner, ViewingAsBar, Toast, EmptyState, ErrorState, Skeleton;<br>- Card, KpiCard, Tabs, SegmentedControl, LevelButtons, Pagination;<br>- Table, BulkBar, Modal, SidePanel;<br>- SlotCard, SlotRow, OccupancyBar, BarChart.<br>Order 8 (AppShell) is F1. |
| Modal / SidePanel on `<dialog>` | **PASS** (m-1) | They use `showModal()`. Esc (`cancel`) and a click on the backdrop call `onClose`. Focus goes back to the opener when `open` becomes false. Edge cases are in m-1. |
| Button `guard` seam | **PASS** (note) | Safe to ship: it allows every action and only adds `data-write-guard`. Rewiring is the one line written in `guard.ts`, and the types match 001's `WriteGuardProps`.<br>**Note for F1:** 001's default `SiteContext` (no provider) makes `useWriteGuard` **disable** writes ("Select one site…"). So any guarded Button rendered outside the provider will be disabled after the rewire, e.g. the preview route or Login. Make sure F1 wraps them in the provider, or don't use `guard` there. |
| ARIA: Tabs, Table, Charts, LevelButtons | **PASS** (m-3, m-4) | **Tabs:** `tablist`/`tab`/`tabpanel` with `aria-controls`/`labelledby`, roving `tabIndex`, arrows/Home/End.<br>**LevelButtons:** `radiogroup`/`radio` with `aria-checked` and roving focus.<br>**Table:** `<caption>`, `scope="col"`, `aria-sort` on sortable headers, a labelled select-all with `indeterminate`, `aria-busy`, and the card view hidden with `display:none` below 768px, so screen readers don't read it twice.<br>**Charts:** `OccupancyBar` uses `role=meter` with `valuemin/max/now/text`; the `BarChart` SVG is `aria-hidden`, with an sr-only data table and a `figcaption`. |
| WCAG 2.2 AA basics | **PASS** | **Code:**<br>- `Field` makes the visible label required and wires `aria-describedby`/`aria-invalid`.<br>- `--focus-ring` is on every interactive class.<br>- 44px targets under `(pointer: coarse)` or <768px (04 gap 7: 40px on desktop is above the 24px minimum; UX to confirm).<br>- Reduce-motion is handled.<br>**Browser (marketing):**<br>- at 360/768/1280 on `/`, `/demo/` and `/privacy/`, `scrollWidth` equals the viewport (no horizontal scroll);<br>- the smallest rendered text is **12px**;<br>- **0 external hosts loaded**. |
| `format.ts` | **PASS** (m-5) | IST is correct whatever the host timezone: the 8 tests pass under `TZ=UTC`, `America/Los_Angeles`, `Asia/Kolkata` and `Pacific/Kiritimati`. The ₹ grouping, durations, "ago" and enum words are as specified. The tests are meaningful: the IST day rolls over at 18:30 UTC, invalid input gives "—", there are crore-level groupings, and unknown enums fall back. |
| Marketing claims vs product today (AC-30) | **FAIL** | See **M-2**. Gap 10's own corrections are right (no overstay card, "refreshes on its own", hero "Entry recorded", no "Terms", "Example" label). "Scan … a number plate" is true: on-device ML Kit, with a Tesseract fallback in `GateTerminal.tsx`. |
| Demo form vs 03 v1.1 | **FAIL** | The fields, consent line, privacy link, honeypot, rules matching B6, same-origin JSON POST (`credentials:'omit'`), focusable error box with email fallback, success copy and `textContent` for server messages are all right. **But personal data does end up in a URL without JavaScript; see M-1.** |
| Partial / icon transform (`marketing/vite.config.mjs`) | **PASS** (m-7) | Partial and icon names are restricted to `[\w-]+`, so there's no path traversal. It runs only at build time and only on our own HTML. A missing icon fails the build. |
| SEO; Sign in | **PASS** | Every page has a title, description and canonical. Home and demo have Open Graph/Twitter tags with a 1200×630 `og-image.png`. `robots.txt` and `sitemap.xml` (3 URLs) are present. "Sign in" (header and drawer) → `https://admin.parkflows.in/`. Contact links: `mailto:sales@parkflows.in`, `tel:+919820603518`. |

## Findings
| # | Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|---|
| M-1 | **Major** | `marketing/demo/index.html:50` (`<form … novalidate>` with no `method`/`action`) | **Personal data ends up in a URL.** Without JavaScript, or when someone submits before the `type="module"` `demo.js` has loaded (slow phones), the browser submits the form **as a GET to `/demo/`**. Every field then goes into the URL, browser history, the Hosting access logs and any `Referer`, and `novalidate` also skips the `required` checks.<br>**Reproduced** in Chromium with JS off: the URL after submit was `/demo/?name=Asha+Rao&company=&workEmail=asha%40acme.in&phone=9820603518&…&consent=on`. This breaks the brief's "no personal data in URLs except the user-initiated mailto". | Render the form with `hidden` (or `inert`) and have `demo.js` reveal it; the existing `<noscript>` banner already gives the email and phone. Belt and braces:<br>- add `method="post"` (a POST to the static page gets a 405 and puts nothing in the URL);<br>- set `form.noValidate = true` from JS, not in the markup.<br>Add a browser check: JS off → the form isn't shown, and no query string ever appears. | Open |
| M-2 | **Major** | `marketing/index.html:92`, `:126-127`, `:107` | **Claims that aren't true of the product today (AC-30).**<br>(a) "Employees register with their company email…" and Step 2 "Employees sign up…": today **employees can't register themselves**. The registration form lives only in the signed-in console (REGISTRATION module: Master/Site Admin) and in the console-only Employee app preview. Employee sign-in is 001 Phase 2 (P2-7); `LoginScreen` tells employees to "register your vehicle first" with nowhere to do it.<br>(b) Valet "handle retrieval requests **from employees**": `POST /valet/request-retrieval` is called only from the valet console form (`ValetXModule`, staff with VALET_SERVICE edit), so staff enter the request; employees have no way to request. | (a) For example: "Your site admin adds employees and their vehicles (one at a time or from a CSV) and approves or rejects each pass request." Step 2: "Add your employees". Change it back when employee sign-up ships.<br>(b) "…and log retrieval requests at the valet desk."<br>Get PM sign-off on the copy (gap 10) **after** these edits. | Open |
| M-3 | **Major** | `scripts/check-styles.mjs:37, 47-48, 63, 85` (+ rules missing for K3) | **`lint:styles` (the R1 gate for AC-01/02 and K3) can be bypassed.** On a probe of 18 samples it caught only 2. **Missed:**<br>- **Named and modern colours:** `color:red`, `oklch(…)`, `color-mix(…)`, SVG `fill="red"`.<br>- **Inline-style variants:** `style = {{…}}` (spaces), HTML `STYLE="…"` (upper case), any `.jsx` file (not in `EXTS`, though line 86 tests for `.jsx`), `<div {...{style:s}}/>`, `React.createElement('div',{style:{…}})`, a `.ts` object `{ style: { color } }`, `el.setAttribute('style',…)` and `el.style['color']=…`.<br>- **Tailwind defaults** other than colours and text sizes, such as `rounded-3xl shadow-2xl leading-7 tracking-widest`. 03 says that in R1 `lint:styles` enforces "no Tailwind defaults" on R1 files (K3), and these compile today because `theme.css` doesn't reset them.<br>The current R1 files are clean (I checked them by hand), so nothing ships wrong now. The gate is what will police F1–F7, though. | - Allow optional whitespace in `style\s*=\s*\{\{` and match HTML attributes case-insensitively; add `.jsx` to `EXTS`.<br>- Flag `style` keys in any object literal in `.ts/.tsx/.js` (`/\bstyle\s*:\s*\{/`), `setAttribute\(\s*['"]style`, and `.style\[`.<br>- Add CSS named colours (the 148 keywords, excluding `transparent`/`currentColor`/`inherit`) and `oklch|oklab|lab|lch|hwb|color-mix|color(` to the colour rule.<br>- For K3, flag `rounded-*`, `shadow-*`, `leading-*`, `tracking-*` and `font-(thin…black)` whose value isn't a token name from `tokens.json` (same approach as `COLOUR_UTIL`).<br>- Add a self-test case for every bypass above. | Open |
| m-1 | Minor | `src/design-system/components/Dialog.tsx:28-40` | **Dialog edge cases:**<br>(1) `onClose` isn't wired to the native `close` event. Chrome's close-watcher can close a modal on a repeated Esc without a cancellable `cancel`, and a nested `<form method="dialog">` closes it too. In both cases the parent's `open` stays `true` and focus isn't returned.<br>(2) A drag that starts in the content and ends on the backdrop fires `click` on the `<dialog>` and closes it (lost form input).<br>(3) Unmounting while open doesn't restore focus. | Add `onClose={() => { if (open) onClose(); }}` (React's `onClose` on `<dialog>`). Close on backdrop only when `mousedown` **and** `click` both targeted the dialog. Restore focus in the cleanup. |  Open |
| m-2 | Minor | `src/design-system/components/Toast.tsx:50` | Toasts with an action ("Undo", "Try again") still disappear after 4 s (8 s for errors), and there's no pause on hover or focus. That's a timing problem for keyboard and screen-reader users (WCAG 2.2.1). | When `actionLabel` is set, don't auto-dismiss (or use ≥10 s). Pause the timer on `mouseenter`/`focusin`. |  Open |
| m-3 | Minor | `StatusChip.tsx:51` (CountBadge), `Card.tsx:57` (KpiCard "—") | `aria-label` on a plain `<span>` (no role) is ignored by most screen readers. They'll read "3" instead of "3 pending requests", and "—" instead of "No data". | Render the label as visually hidden text (`<span className="pf-sr-only">`) next to `aria-hidden` visible text. |  Open |
| m-4 | Minor | `Tabs.tsx:65, 117` | If `value` matches no tab, or the selected tab is disabled, no tab gets `tabIndex=0`, so keyboard users can't reach the tablist. `SegmentedControl` with `hasPanels={false}` (Cards / List) still uses `role="tab"` with no panel. | Fall back to the first enabled tab for `tabIndex=0`. For view switchers without panels, use `role="radiogroup"`/`radio` (as `LevelButtons` does) or buttons with `aria-pressed`. |  Open |
| m-5 | Minor | `src/utils/format.ts:76-81` | `formatNumber(-0.4)` → "−0"; `formatINR(-0.001)` → "−₹0"; `formatNumber(1e21)` → "1e,+21". | Decide the sign after rounding (`Number(fixed) === 0` → no sign). Return `—` (or skip grouping) for `≥ 1e21`. Add tests. |  Open |
| m-6 | Minor | `marketing/demo/index.html:124` | The honeypot is named `website`, which browser autofill and password managers commonly fill. A real person's request would then get the silent 200 and be dropped. | Use a name autofill doesn't recognise (e.g. `pf_hp_field`), keep it out of the tab order, and rename the B6 contract to match before B6 is built. |  Open |
| m-7 | Minor | `marketing/vite.config.mjs:26` | The icon helper runs `new Function` on a regex extract of lucide's built file. That works and fails closed, but it's fragile and evaluates code text. lucide-react 0.546 **exports** `__iconNode` from each icon module. | `const { __iconNode } = await import(pathToFileURL(file).href)` (make the hook async), and drop the regex and `new Function`. |  Open |
| m-8 | Minor | `marketing/index.html:162` | "every entry and exit **stays** in the parking log": a Master Admin can clear completed logs older than a date (`/admin/clear-history`). | "…and every entry and exit is recorded in the parking log." |  Open |
| m-9 | Minor | `SlotCard.tsx:73, 152` | "In since 09:14" shows only the time, so a car parked for three days reads as today. | Use `formatTime` when the entry is today (IST), else `formatDateTime`, or add "· 2d" with `formatDuration`. UX to confirm. |  Open |
| m-10 | Minor | `scripts/build-tokens.mjs` (`--check`), `package.json` `build` | `--check` compares bytes, so a Windows checkout with `core.autocrlf=true` on `main` (no `.gitattributes` yet) reports `stale`. Also, `build` regenerates silently, so a stale commit is "fixed" in the deploy but stays stale in git. | It clears on the rebase (001 T0b adds `eol=lf`). In CI, run `npm run tokens -- --check` **before** `build`; optionally make `build` run the check instead of regenerating. |  Open |
| m-11 | Minor | `tests/qa/002-format.test.mjs` | It imports a `.ts` file directly, which needs Node ≥ 22.18 for type stripping. That's fine on the dev machines (22.22/22.23), but CI and Cloud Build aren't pinned. | Add `engines.node: ">=22.18"` when 001's first-patch item 0 pins Node. |  Open |

## Gates (run on a clean clone of `2b68077`)
| Command | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** (both files ok; drift → exit 1, verified) |
| `npm run lint` | **24 errors, all in `src/components/App.tsx`** (the orphan file already on `main`; verified by file count, not taken on trust). **0 in new files.** Clears on the rebase (001 T0c). |
| `npm run lint:styles` | **PASS**: self-test 17/17, 37 R1 files clean (but see M-3) |
| `npm run build` | **PASS** (generated files unchanged afterwards) |
| `npm run build:marketing` | **PASS** (`dist-marketing/`, 3 pages; fonts fingerprinted; no external URLs) |
| `npm run test:qa` | **8/8 pass** (also under 4 different `TZ` values) |

## Verdict: CHANGES
No Critical findings. Three Majors must be fixed before the slice is rebased and built on:
- **M-1** (personal data in a URL without JS);
- **M-2** (AC-30 claims about employee self-registration and valet requests);
- **M-3** (`lint:styles` bypasses and K3 not enforced).

The Minors can be fixed in the same round, or carried into F1 as noted. Everything else in T1–T6 matches 03 v1.1. Re-review the fix commits only (round 2).

---

# Round 2 — fix commits only (`e4fa4b1..e449b82`)
Reviewer: code-reviewer · Date: 2026-10-07 · Scope: the 12 fix commits on `feature/002-design-system` after `2b68077` (one per finding), against the round-1 findings above and 04 → Frontend → "Round 1 fixes". m-10 and m-11 are deferred to the rebase, as agreed.

**How I reviewed it:** I read `git diff 2b68077..e449b82` (15 files, +403/−96) commit by commit. Then I cloned the branch from a fresh git bundle into the cloud workspace and ran every gate there, with the same dependency install as round 1 (no `package.json`/lock changes in these commits). I ran the round-1 `lint:styles` probe set plus 18 new bypass attempts against the exported `checkText`. I also did headless-Chromium checks of the built `dist-marketing/`. I made no source edits, and your checkout stayed on `feature/001-parkflows-platform-v1`.

## Round-1 findings
| ID | Status | Evidence |
|---|---|---|
| **M-1** PII in a URL | **Fixed** (`e4fa4b1`) | The form ships `hidden` with `method="post"` and no `novalidate`. `demo.js` sets `noValidate = true` and reveals it only once it owns submit. `[hidden] { display:none !important }` sits outside the layers, so `.mk-form { display:flex }` can't override it. **Browser checks:**<br>- **JS off:** the form and the Send button aren't visible, the `<noscript>` email/phone banner is, and the fields can't be typed into.<br>- **JS on with `demo.js` blocked:** the form stays hidden. I forced it visible: an incomplete native submit is stopped by `required`, and a complete one goes out as a **POST to `/demo/`**. The URL stays `/demo/`, and no request ever carries a query string.<br>- **JS on:** `noValidate` is true, and an empty submit shows 7 field errors without navigating. The JSON payload carries `pf_hp_field: ""`, and the error state shows the email/phone fallback. |
| **M-2** AC-30 claims | **Fixed** (`35d65e0`) | The employee-pass card and Step 2 ("Add your employees") now say the site admin adds employees and vehicles, one at a time or from a CSV, and approves each pass request. That's true today: `EmployeeRegistration.tsx` plus `/api/v1/employees/bulk-upload` on both `main` and the 001 branch. Valet now says "log retrieval requests at the valet desk". PM sign-off on the exact sentences is still open (04 "For others"). |
| **M-3** `lint:styles` bypasses, K3 | **Fixed as reported**, with residual gaps (R2-1, R2-2) | All 16 round-1 misses are now caught: named/modern colours, `style = {{…}}`, `.jsx`, spread/createElement/`.ts` style objects, `STYLE=`, `setAttribute`, `.style[…]`, `cssText`, and K3 `rounded-3xl shadow-2xl leading-7 tracking-widest`. Also caught: `hover:!text-rose-600`, `md:rounded-2xl`, bare `shadow`, and `color:RED`. Self-test 57/57, and the 37 R1 files stay clean.<br>Two probes are still missed, both outside what the gate promises: raw `px` values in hand-written CSS, and a class name built at runtime (`` `text-${x}-600` ``), which Tailwind wouldn't generate anyway.<br>The new attempts found more gaps; see R2-1 to R2-4. |
| m-1 Dialog | **Fixed** (`5e79443`) | **Close paths:**<br>- A native `close` while `open` is still true calls `onClose` and restores focus.<br>- A parent-initiated `d.close()` doesn't double-fire, because `openRef` is already false when the queued `close` event arrives.<br>- A backdrop click needs both `mousedown` and `click` on the `<dialog>`.<br>- Unmounting while open restores focus to a still-connected opener.<br>**Handlers:** `onClose` is read through a ref, so handlers are never stale. I read this in the code; I didn't re-run the dev's preview checks for it. |
| m-2 Toast timing | **Fixed** (`7731128`) | A toast with an action defaults to no timeout, and an explicit duration is raised to at least 10 s. Pausing on hover and focus keeps the remaining time. `onBlur` ignores focus moving inside the region, and the paused flags reset when the region empties. |
| m-3 `aria-label` on spans | **Fixed** (`4206884`) | `CountBadge` and the empty `KpiCard` now have visible text marked `aria-hidden` plus `pf-sr-only` text (class present in `components.css`). |
| m-4 Tab stop / no-panel tabs | **Fixed** (`c7cfd60`) | `tabStop()` falls back to the first enabled item in `Tabs`, `SegmentedControl` and `LevelButtons`. `hasPanels={false}` is now a `radiogroup`/`radio` with `aria-checked`, and no dangling `id`/`aria-controls`. CSS covers `[aria-checked="true"]`. |
| m-5 "−0", "1e,+21" | **Fixed** (`ee882e1`) | The sign is decided after rounding, and `abs(v) ≥ 1e21` returns "—". Tests cover −0.4, −0.004 with 2 decimals, −0.6, −₹0.001, −₹1,499.50, ±1e21 and 15 digits. |
| m-6 Honeypot name | **Fixed** (`8a57257`) | `name="pf_hp_field"`, label "Leave this empty", `autocomplete=off`, `tabindex=-1`, with LastPass/1Password ignore hints, and `demo.js` sends the new name. **Open for others:** 03 must rename the B6 contract field `website` → `pf_hp_field` before B6 is built (architect). |
| m-7 `new Function` | **Fixed** (`e449b82`) | The build now uses `await import(pathToFileURL(file))` and reads `__iconNode`, with an array check. The hook is async, and replacement keeps document order. I built at `2b68077` and at `e449b82`: all 27 inline SVGs on `/`, `/demo/` and `/privacy/` are identical, and `/privacy/` is identical apart from asset hashes. |
| m-8 "stays in the parking log" | **Fixed** (`a3eae49`) | Now "is recorded in the parking log". |
| m-9 "In since" date | **Fixed** (`4a6fefe`) | `formatSince()` shows the time alone for today in IST, and date + time otherwise. `SlotCard` and `SlotRow` both use it. Tests cover 00:01 vs 23:59 at IST midnight and pass under 4 TZs. UX still needs to confirm the wording. |
| m-10, m-11 | Deferred | Deferred to the rebase as agreed (`eol=lf` + CI order; `engines.node`). |

## New findings (round 2)
| ID | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| R2-1 | Minor | `scripts/check-styles.mjs` `ARBITRARY`, `TW_SHADOW` | **Tailwind 4 escape hatches are not caught.**<br>- Arbitrary **properties** `[color:red]` / `[border-radius:7px]`: the rule only matches `name-[…]`.<br>- Tailwind 4's variable shorthand `p-(--x)` / `bg-(--brand)`.<br>- Tailwind 4.3's default `drop-shadow-*`, `text-shadow-*` and `inset-shadow-*`: the `(?<![\w-])` lookbehind skips them.<br>All five probes pass the gate, and the first two let any colour or radius through a class. | - Add `(?<![\w-])(?:[a-z0-9]+:)*!?\[[a-z-]+:[^\]]+\]` and `[a-z][\w-]*-\(--` to the arbitrary rule.<br>- Match `(?:drop-\|text-\|inset-)?shadow-…` against the shadow tokens.<br>- Add self-test cases. |
| R2-2 | Minor | `check-styles.mjs` `stripComments` | `//` inside a string literal is treated as a comment unless it follows a `:`. The rest of that line is then never checked. For example, `const u = "a//b"; … style={{color:"red"}} className="text-rose-600"` passes. The same happens after a protocol-relative `src="//…"` on a one-line JSX element. | Skip string and template literals when stripping `//` and `/* */` (a small state machine), or strip `//` only when it is preceded by start-of-line or whitespace outside quotes. Add a self-test case. |
| R2-3 | Nit | `check-styles.mjs` | **Less likely bypasses, still missed:**<br>- Inline styles: a quoted `"style": {…}` key, a computed key inside an allowed `--pf-*` object, `setAttribute("STYLE",…)`, `setAttributeNS(null,"style",…)`, `el["style"].x =`, `attributeStyleMap.set`, `<p/style="…">`.<br>- Colours: CSS inside JS strings (`` `.a{color:red}` ``, `insertAdjacentHTML('<style>…')`), unquoted HTML colour attributes (`fill=red`, `<font color=red>`), and CSS system colours (`CanvasText`, `Highlight`).<br>Code review is the backstop for these. | The cheap ones: case-insensitive `setAttribute(NS)?`; `["']style["']\s*:`; optional quotes in `NAMED_ATTR` for `.html`. System colours could be allowed only inside `@media (forced-colors: active)`. |
| R2-4 | Nit | `check-styles.mjs` `checkText` (`.html`) | **False positive:** on `.html` the K3 rules scan the whole document, prose included. Marketing copy such as "leading-edge" or "rounded-corner" fails the gate. | On `.html`, run `tailwindProblems` on `class="…"` values only. |

None of these affects what ships today. The 37 R1 files are clean, and I checked by hand that none of the patterns above occur in them. R2-1 and R2-2 matter because `lint:styles` is the gate for F1–F7.

## Gates (clean clone of `e449b82`)
| Check | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** |
| `npm run lint` | 24 errors, all in the orphan `src/components/App.tsx` (pre-existing), **0 new** |
| `npm run lint:styles` | **PASS**: self-test 57/57, 37 R1 files clean |
| `npm run build` | **PASS** |
| `npm run build:marketing` | **PASS** |
| `npm run test:qa` | **10/10** (was 8; none lost), also under `TZ=UTC`, `America/Los_Angeles`, `Asia/Kolkata` and `Pacific/Kiritimati` |
| Marketing in Chromium at 360/768/1280 (`/`, `/demo/`, `/privacy/`) | No horizontal scroll; smallest text 12px; no external hosts; no console errors |

## Verdict: PASS
All three Majors (M-1, M-2, M-3) and Minors m-1..m-9 are fixed as described, with no regressions. There are no Critical or Major findings.
- **R2-1 and R2-2** (Minor) should be fixed **before F1 starts using `lint:styles` as its gate**. They can go in with the rebase work (m-10/m-11). A one-commit check is enough; no full review round is needed.
- **R2-3 and R2-4** are nits that can wait for R1.1.
- **Carried to others:**
  - architect: 03 honeypot `website` → `pf_hp_field` (m-6), before B6;
  - PM: sign off the M-2 sentences;
  - UX: confirm the "In since" wording (m-9).


---

# Round 3 — round-2 fix commits (`e449b82..83402a2`)
Reviewer: code-reviewer · Date: 2026-10-08 · Scope: the 5 commits on `feature/002-design-system` after `e449b82` (HEAD `83402a2`, as logged by frontend-dev in 04 → "Round 2 fixes"), checked against:
- PRD **v1.3**: O-3 copy, the R1a contact-panel flag, NFR-1, NFR-4;
- the round-2 findings R2-1 and R2-2.

**How I reviewed it:** I read `git diff e449b82..83402a2` (14 files, +349/−16) commit by commit. I fetched the branch from `pf-002-round2-83402a2.bundle` into my round-2 clone in the cloud workspace and ran every gate there. I built the marketing site twice: the **default (flag off)** build and `PF_DEMO_FORM=1` (**flag on**).
- **Browser checks:** headless Chromium at 360 (touch), 768 (touch) and 1280 (mouse).
- **CLS:** a `layout-shift` observer, with fonts served normally and with every `.woff2` delayed 1.5 s.
- **Lighthouse 12:** mobile and desktop, through a gzip static server, as Firebase Hosting will serve the site.
- **lint:styles:** the round-1 and round-2 probe sets, plus 8 new attempts.

I made no source edits, and your checkout stayed on `feature/001-parkflows-platform-v1`.

## Checks against the brief
| Item | Result | Evidence |
|---|---|---|
| **O-3 copy** (`be511f2`) | **PASS** | `marketing/index.html` matches PRD v1.3 line 188 word for word: "Utilisation, occupancy trend and the mix of registered and visitor vehicles for your site. Export the entry and exit log to CSV." |
| **R1a flag OFF** (`e5d97f6`, the default build) | **PASS** for `/demo/`; **FAIL** for `/privacy/` (R3-1) | **`/demo/`:** 0 `<form>` with JS on and off. The "Write or call us" panel is visible, with `mailto:sales@parkflows.in?subject=Demo%20request` and `tel:+919820603518`, both 44px buttons. `demo.js` is **not in `dist-marketing/assets/` and never requested**. Meta/OG/lead text no longer promise a one-day reply. Every "Book a demo" link → `/demo/`.<br>**The `@if/@else/@endif` transform:** unknown flags and unbalanced blocks fail the build. An unrecognised value (`PF_DEMO_FORM=maybe`) builds the safe default (off).<br>**But** `/privacy/` still describes the form; see **R3-1**. |
| **R1a flag ON** (AC-32 / M-1 unchanged) | **PASS** | **JS off:** the `<noscript><style>` sets `#demo-form` to `display:none`, and the noscript email/phone banner shows.<br>**`demo.js` blocked:** the form keeps its space but is `visibility:hidden` and `inert`. 40 Tabs never enter it. A click and Enter where it sits send nothing. No non-GET request and no query string.<br>**JS on:** `inert` and `data-pending` are removed and `noValidate` is true. An empty submit shows 7 errors and the URL doesn't change.<br>`method="post"` is kept as the second guard. `visibility:hidden` + `inert` is the right pair: either alone already blocks focus and pointer input, so it holds on browsers without `inert`. |
| **NFR-1** (`577b5ab`) | **PASS** | **Lighthouse (gzip, mobile/desktop):** on `/`, `/demo/` and `/privacy/` (flag off) and `/demo/` (flag on), performance **99–100**, CLS **0.000**, LCP **1.92 s** mobile at worst, and a11y/best practices/SEO **100**.<br>**Observer CLS with fonts delayed 1.5 s:** **≤ 0.061** on every page at 360 and 1280, both builds; 0.000 without the delay. The fallback face is doing its job.<br>**Preloads:** the 4 hrefs resolve to the same hashed files as the `@font-face` URLs (no double download). `crossorigin` is correct for font preloads. |
| **NFR-4** (`a27fdf1`) | **PASS with Minors** (R3-2, R3-3) | **Test page built on the shipped CSS, 360/768 touch:**<br>- a box-only `.pf-check` in a table card is 328×44;<br>- a table-row checkbox is 44×44 (20×20 with a mouse at 1280, as designed);<br>- standalone `.pf-link` ("Forgot password?") is 116×44 (116×24 with a mouse);<br>- `.pf-link--inline` and a link in `.pf-field-help` stay inline (exempt).<br>**Marketing pages:** every footer/prose link under 44px is inside a sentence (exempt). The mailto/tel buttons, nav and drawer pass.<br>**Gaps:** the header logo link (R3-2) and the sort header buttons (R3-3). |
| **R2-1** (`83402a2`) | **Fixed** | `[color:red]`, `[border-radius:7px]`, `*:[color:red]`, `hover:![…]`, `p-(--x)`, `bg-(--brand)` and `drop-/text-/inset-shadow-*` (with size, colour or `/opacity`, and the bare forms) are all caught. `drop-shadow-none` is allowed. |
| **R2-2** (`83402a2`) | **Fixed**, with a narrower residual (R3-4) | The comment stripper for code files is now a quote-aware scanner:<br>- `"a//b"`, `'x/*y'`, `src="//cdn…"` and a backtick string spanning lines no longer hide the rest of the line;<br>- real `//` and `/* */` comments are still stripped;<br>- `https://` in JSX text is kept.<br>An apostrophe in JSX text on its own line is harmless, because `'`/`"` strings end at the line end. |
| **QA test adopted** | **PASS** | `tests/qa/002-tokens-styles.test.mjs` (7 tests) passes on `83402a2` and **fails** (the seeded-rules test) against the `e449b82` script, so it really guards R2-1/R2-2. Every mutation happens in a temp copy. `tests/qa/*.test.mjs` doesn't pick up QA's original under `tests/qa/002/`, so nothing runs twice. |
| Token change | **PASS** (UX to note) | `type.families.display` gains `"Sora Fallback"`; `tokens.css`/`theme.css` regenerated, and `--check` is OK. It has no visual effect once Sora has loaded. |

## Findings (round 3)
| ID | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| R3-1 | **Major** | `marketing/privacy/index.html:6, 15, 18, 24, 27` (not changed by the flag) | **In the default R1a build the privacy note describes a form and storage that don't exist.** It says it covers "the details you send us through the Book a demo form", "Only what you type into the form…", "Your request is kept in the ParkFlows system, not in a mailing list" and "Up to 12 months… After that it is deleted". On 10 Oct there is no form: prospects write to `sales@parkflows.in` or phone, so their details arrive in a mailbox (with whatever headers mail carries), and no automatic 12-month deletion exists. PRD v1.2 approved these lines only **as B6 requirements** (AC-32d, line 189: "the privacy note is only true once B6 meets them"). PRD v1.3 ships `/privacy/` in R1a without B6. This breaks AC-30 ("every claim … true of the product today") on a page that is a privacy statement to the public. | Put the privacy copy behind the same `demo-form` flag: the current text for flag on, and an R1a version for flag off that covers email/phone enquiries (what we receive, where it's kept, how long, how to ask for deletion). **PM must write or approve the R1a sentences**; frontend then gates them (one small commit). |
| R3-2 | Minor | `marketing/site.css:38-39` (`.mk-logo`) | **NFR-4:** at 360px with touch, the header logo link ("ParkFlows home") is a **106×24** target, and 142×32 at 768 with touch. It's a standalone nav link, and NFR-4 names nav links. | In the touch / <768 rule, give `.mk-logo` `min-height: var(--touch-min)` with `align-items: center`; the image stays the same size. |
| R3-3 | Minor | `components.css:477` (`.pf-table th button.pf-sort`) | **NFR-4:** on touch the sort button is 44 tall but only as wide as its label: **31×44** for "Plate", and "Slot"/"Level" are similar. | Add `min-width: var(--touch-min)` (or make the button fill the header cell) in the same touch rule. |
| R3-4 | Nit | `check-styles.mjs` `stripCodeComments` | **Residual quote-pairing gap:** a quote that isn't a string delimiter can pair with a real one later **on the same line**, so a real string's `//` is read as a comment. Examples: a regex literal like `/"/`, or JSX text `Don't` followed by `src='//…'`. Both are missed. They're much rarer than R2-2; a regex-aware scanner is out of proportion for a lint. | Accept as residual risk, or treat `'` inside JSX text (after `>`) as text. Code review is the backstop. |
| R3-5 | Nit | `check-styles.mjs` `ARBITRARY_PROP` | **False positive:** an unformatted TypeScript index signature `{[key:string]: number}` (no space) is flagged as an arbitrary property. | Only scan class-bearing strings for this rule, or ignore it when followed by `]:`. |
| R3-6 | Nit | `components.css:299, 480` | **Broader exemption than NFR-4:** every `.pf-link` inside `.pf-state-text` or `.pf-field-help` is exempt by container, not by "part of a sentence". Today `EmptyState`/`ErrorState` only render text there, so nothing is affected. | Keep the opt-in `.pf-link--inline` as the only exemption, or document the container rule in 02 for F1–F7. |
| R3-7 | Nit | `marketing/demo/index.html:187` (flag off) | "What happens next — **We contact you the way you choose**…" reads as the form flow; in R1a the visitor writes or calls us. | Flag off: e.g. "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it." (PM copy.) |

**Outside this review, but it bears on R1a:** with the form off, `sales@parkflows.in` is the **only written contact** on the site. DevOps' 8 Oct entry reports **no MX record** for parkflows.in, so mail to it bounces. That is a release blocker in its own right (DevOps/user), not a code finding.

## Gates (clean clone of `83402a2`)
| Check | Result |
|---|---|
| `npm run tokens -- --check` | **PASS** |
| `npm run lint` | 24 errors, all in the orphan `src/components/App.tsx` (pre-existing), **0 new** |
| `npm run lint:styles` | **PASS**: self-test **75/75**, 37 R1 files clean |
| `npm run build` | **PASS** |
| `npm run build:marketing` | **PASS**, flag off (default) and `PF_DEMO_FORM=1` |
| `npm run test:qa` | **17/17** under `TZ=UTC`, `America/Los_Angeles` and `Pacific/Kiritimati` |
| Marketing in Chromium | Lighthouse 99–100 / 100 / 100 / 100. CLS 0.000, and ≤ 0.061 with fonts delayed 1.5 s. No external hosts. |

## Verdict: CHANGES (round 3 of 3 — escalated to the user)
No Critical findings. Everything in scope is fixed and works:
- O-3, the flag mechanism, `/demo/` flag off and flag on (M-1 intact), NFR-1, R2-1 and R2-2;
- NFR-4 for the shared components, apart from two small gaps.

**One Major remains: R3-1.** The default R1a build publishes a privacy note that describes a form and data handling that won't exist on 10 Oct. The fix is one small, flag-gated commit, but it needs **PM copy first**. CLAUDE.md allows no fourth review round, so this is **escalated to the user**. Options:
- **(a) Recommended:** the PM writes the R1a privacy sentences (and R3-7), frontend gates them behind `demo-form` and fixes R3-2/R3-3 in the same commit, and the reviewer does a one-commit check before D1 deploys.
- **(b)** Ship R1a as is. Not recommended: it publishes a privacy statement that isn't true.

R3-4..R3-6 are nits for R1.1. The MX blocker for `sales@parkflows.in` sits with DevOps/the user.

---

# One-commit check after the round-3 escalation (option a) — `83402a2..b4200a1`
Reviewer: code-reviewer · Date: 2026-10-09 · Scope: the single commit `b4200a1` on `feature/002-design-system` (4 files, +32/−1), against:
- PRD **v1.5** "PM copy for R1a (flag `demo-form` OFF)" and the bug triage rows R3-2/R3-3;
- round-3 findings R3-1, R3-7, R3-2 and R3-3.

**How I checked it:** I read the diff. I fetched `pf-002-r3fix-b4200a1.bundle` into my review clone in the cloud workspace and ran the gates. I built the marketing site with the flag **off** (default) and **on** (`PF_DEMO_FORM=1`), and also built `83402a2` with the flag on to compare. I compared the built text to the PRD by script, and measured targets and CLS in headless Chromium through a gzip server. I made no source edits, and your checkout stayed on `feature/001-parkflows-platform-v1`.

| Item | Result | Evidence |
|---|---|---|
| **R3-1** privacy, flag OFF | **Fixed** | All 6 PRD v1.5 sentences for `/privacy/` (intro, What we collect, Why we use it, Who can see it, How long we keep it, Asking us to delete it sooner) are found **word for word** in the built `dist-marketing/privacy/index.html`. The delete link is `mailto:sales@parkflows.in?subject=Delete%20my%20enquiry`, as specified. "Cookies and tracking" and "Contact" are unchanged. The words "form", "ParkFlows system", "IP address" and "browser details" no longer appear on the flag-off page. The meta description ("…when you email or call us about a demo.") isn't specified in the PRD, but it is accurate and follows the same flag. |
| **R3-1** privacy, flag ON | **Unchanged** | Built at `83402a2` and at `b4200a1` with `PF_DEMO_FORM=1`: `/`, `/demo/` and `/privacy/` are identical apart from asset hashes and the blank lines left by the `@if/@else/@endif` markers. Same asset set. |
| **R3-7** `/demo/` "What happens next" | **Fixed** | Flag off: "We reply by email or phone, ask about your site's layout, and show you ParkFlows with it." (PRD v1.5, word for word). The old "We contact you the way you choose" line is only in the flag-on build. |
| **R3-2** header logo | **Fixed** | Touch / <768 rule: `.mk-logo { align-items:center; min-height: var(--touch-min) }`. Logo link is **106×44** at 360 touch and **142×44** at 768 touch; the image is unchanged (24 / 32px tall). 142×32 with a mouse at 1280 (≥24, fine). CLS stays 0.000 (0.002 on `/` at 768) and there's no horizontal scroll on any page. |
| **R3-3** sort buttons | **Fixed** | `min-width: var(--touch-min)` added next to `min-height` in the touch rule: "Plate" and "Slot" sort buttons are **44×44** at 360 and 768 touch. The mouse layout is unchanged. |

**Gates (clean clone of `b4200a1`):**
- `tokens -- --check` **PASS**;
- `lint` 24 pre-existing `src/components/App.tsx` errors, **0 new**;
- `lint:styles` **PASS** (self-test 75/75, 37 R1 files clean);
- `build` **PASS**;
- `build:marketing` **PASS** with the flag off and on;
- `test:qa` **17/17**.

**No new findings.** Still open, as triaged in PRD v1.5, and none of them block R1a:
- BUG-3 (CSP vs the noscript `<style>`), flag-on only, before R1b;
- R3-4..R3-6 nits, R1.1;
- the user's go-live conditions: a working `sales@parkflows.in` mailbox (MX), and the manual 12-month / delete-on-request process.

## Verdict: PASS
R3-1, R3-7, R3-2 and R3-3 are fixed exactly as PRD v1.5 specifies, flag ON is unchanged, and all gates pass. **No Critical or Major findings are open for the R1-pre / R1a code.** Step 5 is complete for this slice.

---

# R1b — backend B1–B6 (round 1) — `feature/002-r1b` @ `4347715`
Reviewer: code-reviewer · Date: 2026-10-11 · Scope: the six task commits on top of the merge base `2937fe6` (`1ddc787..4347715`; 7 files, +1350/−19: `server.ts`, `src/server/db.ts`, `src/server/time.ts`, `src/types.ts`, tests). Checked against:
- `03-tech-design.md` v1.2: data model, API contracts, site scoping & authorisation, B1–B6;
- PRD v1.6: AC-32 and AC-32a–d, plus the R1b gates;
- 04 → Backend "R1b (B1–B6)".

**How I reviewed it:** I read the full diff and the surrounding 001 code it relies on: `applyViewAs`, `resolveSite`, `requireMasterAdmin`, the rate limiter, `csvCell`, the sync and bootstrap paths, and the `ERR_STARTING` guard. I bundled `feature/002-r1b` + `main`, cloned it in the cloud workspace and ran the gates there. I made no source edits, and your checkout stayed on `feature/001-parkflows-platform-v1`.

## Gaps found in inputs
1. **03 vs D1 on client IPs.** 03 asks for "5 per 10 min per IP (same limiter as 001)" for a route that will be reached through the Firebase Hosting rewrite. 001's own note at `server.ts:136-141` says that, with the default `TRUST_PROXY_HOPS=1`, `req.ip` behind Hosting is the Hosting proxy's address for every visitor. 03 doesn't say which address the per-IP limit should use. See **M-1**.
2. **03 says the POST path is added to `PUBLIC_API_PATHS`.** The build makes it public **by method** instead (04 gap 5), because adding the path would also have made the Master GET public. I agree; 03 should be updated to match.
3. **PRD AC-32a says "30 per hour overall".** The build counts **stored** requests only (04 gap 3), so junk posts can't use up real prospects' quota. I agree, but the PM should confirm the wording.

## Checks against the brief
| Item | Result | Evidence |
|---|---|---|
| **`/overview` site scoping** (B3, `server.ts:2047`, `db.ts:3146`) | **PASS** | `requirePermission('FLOOR_PLAN','view')`, then `resolveSite({allowAll:false})`: no site → 400, `ALL` → 400, a foreign site → 403 (test B3-1). `getSiteOverview` filters slots, logs, registration requests and alerts by the same site. `latest` plates are masked by the caller's role exactly as `/logs` (`piiAccess` + `maskLicensePlate`). "Today" and hour buckets use the IST helpers in `time.ts` (fixed +05:30, no host-TZ dependency). A brand-new site gives `hasHistory:false` with real zeros. |
| **`inSince` join** (B2) | **PASS** | The index key is `<site>|<slotId>` from `recordSite()`, so a log at another site can't lend its time. `filterBySite(store.logs, siteId)` is applied first as well. `getPeakHours` now uses `istHour`. |
| **`/sites/summary`** (B4, `server.ts:2039`) | **PASS** | `requireMasterAdminView`: the real user must be a Master, and while viewing as someone, the viewed user must be a Master too. Otherwise 403 `ERR_MASTER_ONLY` (test B4-1 covers Site Admin and view-as). Rows carry only the 03 fields. The response is a bare `SiteSummaryRow[]`, as 03. `/analytics/prediction` adds `sample:true`. |
| **`/sites/update`** (B5, `server.ts:1407`, `db.ts:3752`) | **PASS** | `requireMasterAdmin` (real user) + `MASTER_CONFIG:canEdit`. View-as is refused for every non-GET by `applyViewAs` (403 `ERR_VIEW_AS_READ_ONLY`). There's an explicit field list (`SITE_DETAIL_FIELDS`), so unknown fields are ignored. Validation follows 03 (name required ≤80, each field ≤200, email, Indian phone normalised to `+91 XXXXX XXXXX`). Unknown site → 404. The audit `SITE_UPDATED` lists field **names** only. |
| **Slot save mass assignment** (B1, `db.ts:2286`) | **PASS** | The `...slotData` spread is replaced by an explicit field list. `currentVehicle` now comes only from the stored record (cleared on VACANT), and `cameraNumber` is kept from `existing`. This matters now because `InventoryMaster.tsx:166` posts `...editingSlot`, which includes the new response-only `heightM`/`inSince`; they're ignored. A bad `lengthM`/`palletLevel` → 400 per field. Bulk upload skips and reports bad rows, and old 8-column files are unchanged. |
| **Demo requests: Master-only and view-as** | **PASS** | GET list and export: `requireMasterAdminView`. Status POST and DELETE: `requireMasterAdmin`, plus view-as refused for non-GET. Without a session, any non-POST to the exact path → 405 `Allow: POST`. A signed-in non-Master → 403. Case or trailing-slash variants of the path don't match the public bypass (strict `===`), so they fall through to `requireAuth` (fail closed). |
| **`pf_hp_field`** | **PASS** | Checked before validation. A filled field → 200 `{success:true}`, nothing stored, and it doesn't count toward the 30/h. |
| **Rate limits** | **PASS in code; see M-1 for the deployed path** | **Per IP:** route limiter 5 / 10 min, key `ip:<req.ip>:/api/v1/demo-requests`. Separate from the global `/api/` limiter (whose mounted `req.path` is `/v1/…`), so nothing is double-counted.<br>**Global:** 30 **stored** per rolling hour → 429 with `Retry-After`. Tests: 6th from one IP → 429; 31st stored → 429. |
| **8 KB cap** | **PASS** | `express.json({limit:'8kb'})` on the demo path, registered before the global 10 MB parser (body-parser skips an already-parsed body). Oversize → 413, broken JSON → 400, both plain with nothing echoed. A non-JSON content type → 415. `ERR_STARTING` (503) runs before all of this, so nothing is stored into the boot-time seed store. |
| **No IP stored** | **PASS** (record); see m-3 (security log) | `DemoRequest` has no IP, user-agent or browser field. `createDemoRequest` builds the record from validated values only (unknown body fields are dropped). The test asserts no browser fields. |
| **Delete** (`db.ts:2540`) | **PASS on the happy path; see m-1** | Removed from memory, local copy and Firestore (`deleteFirestoreDocs`, a targeted batch delete). Unknown id → 404. Audit `DEMO_REQUEST_DELETED` with id and the Master's email only. The test re-loads the fake Firestore after a restart and the record is gone. |
| **12-month job** (`server.ts:1556`, `db.ts:2552`) | **PASS** | It waits for `isStoreReady()`, runs once, then every 24 h (both timers `unref`). Cutoff = `now − 12 months`; it deletes from memory, local copy and Firestore. A count-only `DEMO_REQUESTS_EXPIRED` audit is written only when the count is > 0. A failed Firestore delete self-heals: the doc comes back on the next cold start and the next run removes it again. |
| **CSV escaping** | **PASS** (see n-1) | It reuses 001's `csvCell`: every cell is quoted, `"` is doubled, and a leading `= + - @ \t \r` gets a `'` prefix. Inputs are trimmed on entry, so leading-space tricks don't apply. Test: `=cmd|calc`, `+Rao` and `@SUM(A1)` are all escaped. The export is audited with a count only. |
| **Targeted syncs only** | **PASS** | **No new `saveDB()` without targets** (grep over the diff). New writes:<br>- `createDemoRequest` and `updateDemoRequestStatus` → `saveDB([{demoRequests:[id]}])`;<br>- `updateSiteDetails` → `[{sites:[id]}]`;<br>- slot save keeps its targeted sync;<br>- deletes use the new targeted `deleteFirestoreDocs`.<br>`demoRequests` is added to `FIRESTORE_COLLECTIONS` (load + seed) and `initDB` defaults it to `[]`. |
| **Cold-start guard** | **PASS (intact)** | The hotfix's `initDB` "no `saveDB()`" branch is untouched. `saveDB`'s `!storeReady` early return now sits after `writeLocalCopy()`, as before. `deleteFirestoreDocs` returns early when `!storeReady`. The expiry job won't start before ready. `ERR_STARTING` covers the public POST. The `001-hotfix-coldstart` suite passes 6/6. |
| **API changes additive** | **PASS** | `/slots` adds `heightM`/`lengthM`/`palletLevel`/`inSince`; `/analytics/prediction` adds `sample`; bulk-upload `result` adds `errors`; four new routes. **Intended behaviour change (03 B1):** slot save no longer accepts unlisted fields (`currentVehicle`, `cameraNumber`, …). No current client sets them on purpose (checked `InventoryMaster.tsx`; the Android app doesn't call slot save). Nothing removed, and no dependency, rule, index or env change. |

## Findings
| ID | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| M-1 | **Major** (gate for switching the demo form ON) | `server.ts:1442` (`rateLimiterMiddleware(5, 10 min)` keyed on `req.ip`); `server.ts:136-145` (`TRUST_PROXY_HOPS` default 1) | **Behind the D1 Hosting rewrite, every visitor will share one per-IP bucket.** 001's own note says that with 1 trusted hop, `req.ip` is the Hosting proxy's address for every user, and the D1 design sends `parkflows.in/api/v1/demo-requests` through that rewrite. The 5-per-10-minutes limit then applies to **everyone at once**. Honeypot and invalid posts also count toward it, so a single bot sending 5 junk posts every 10 minutes blocks every real prospect, with a 429 and no stored request. That defeats AC-32a's per-IP intent and turns the limiter into a cheap denial of service on lead capture. Raising `TRUST_PROXY_HOPS` to 2 globally fixes the IP but, per the same note, makes the direct `*.run.app` URL spoofable (rotating `X-Forwarded-For` would bypass every per-IP limit). | **Architect to decide, backend to build, devops to verify on the D1 preview.** For example:<br>(a) set `TRUST_PROXY_HOPS=2` **and** restrict Cloud Run ingress so `*.run.app` can't be called directly (only Hosting / the load balancer);<br>(b) for this route only, derive the client IP from the Hosting-added header when the request came through Hosting.<br>Whichever is chosen, add a test that two different client IPs through the proxy get separate buckets, and check `ipAddress` in the audit on the preview channel (04 already asks devops for this check). |
| m-1 | Minor | `db.ts:2540` (`deleteDemoRequest`), `db.ts:1565` | **Delete-on-request is fire-and-forget.** The route returns 200 before the Firestore delete commits (`void deleteFirestoreDocs(...)`). If that delete fails (transient error), it is only logged. Then:<br>- the record stays in Firestore and **returns on the next cold start**, after the Master was told it was deleted;<br>- unlike expiry, nothing deletes it again;<br>- a full sync already in flight, or a second instance during a deploy, can also write it back.<br>The privacy note promises this deletion (AC-32d). | `await` the targeted delete in the route. On failure, return 503 "Couldn't delete — try again" and keep (or restore) the in-memory record, so the Master knows. Optionally keep a small persisted tombstone list that load and full sync respect. Add a test with a forced Firestore delete failure. |
| m-2 | Minor | `tests/qa/002-backend.api.test.mjs:262-307` | **Flaky test (time of day).** "B3 /overview counts…" builds `activeToday` at IST 01:00, then asserts `parkedOver12h === 1`. After **13:00 IST** that log is also older than 12 h, so the count is 2 and the test fails. It failed in my run at 13:11 IST (`2 !== 1` at line 307); it passes in the morning. The code is right; the fixture isn't. This makes `test:qa` red for half the day, on top of 001's known 15. | Put the ACTIVE "today" log at `max(todayStart, now − 1 h)`, or pass a fixed `now` into the route via a test-only clock. |
| m-3 | Minor (PM / security) | `src/server/security.ts:569-577` (001 limiter, unchanged) | A throttled demo-form visitor's **IP and user-agent are written to the security audit** (`RATE_LIMIT_EXCEEDED`). The demo record never holds them, but AC-32d says "IP used in memory for rate limiting only", and the privacy note says no IP or browser details are stored "with your request". 04 gap 4 raises this too. | PM/legal to confirm the wording covers the security log (and Cloud Run request logs, which also hold client IPs), **or** omit the IP/UA in `RATE_LIMIT_EXCEEDED` for this public route. Security review (step 7) should decide. |
| n-1 | Nit | `server.ts:1478` export | Every phone is stored as `+91…`, so `csvCell` prefixes it and the CSV shows `'+919820603518` in every row. That's safe but untidy. | Export the phone as `91 98206 03518` (or `="+91…"` text) in this export only, or accept it. |
| n-2 | Nit | `db.ts:2521` | `GET /demo-requests?status=FOO` returns **all** requests instead of a 400 or an empty list. | Validate `status`, or return `[]` for an unknown value. |
| n-3 | Nit | `db.ts` `__failNextDemoRequestSaveForTests` | A test seam is exported from production code. It is only reachable through the test harness (no env var or route in `server.ts`), so it's harmless. | Accept, or move it behind `NODE_ENV==='test'`. |

## Gates (clean clone of `4347715`, deps from an install of the same lockfile)
| Check | Result |
|---|---|
| `npm run lint` | **0 errors** (001's `App.tsx` errors are gone after the merge) |
| `npm run build` | **PASS** (console + mobile) |
| `npm run tokens -- --check` / `lint:styles` | **PASS** / **PASS** (75/75, 37 files clean) |
| `001-backend.api` | **64/64** |
| `001-hotfix-coldstart` | **6/6** (cold-start guard intact) |
| `001-platform-v1.api` | 42/57: the **same 15 FLOW failures as on the merge base** (known 001 Phase 2, 04 gap 1), not caused by R1b |
| `002-backend.api` | **18/19**: the one failure is **m-2** (time-of-day flake); 19/19 before 13:00 IST |
| `002-format` / `002-tokens-styles` | **10/10** / **7/7** |

## Verdict: CHANGES (R1b round 1 of 3)
No Critical findings. The scoping on `/overview`, the Master-only and view-as rules, every AC-32a–d rule in the code, targeted syncs, the cold-start guard and additive API changes all check out.
- **One Major, M-1:** the per-IP limit becomes one shared bucket behind the Hosting rewrite. It needs an **architect decision** (trusted-proxy setting + ingress, or a route-specific client IP), then a small backend change with a test, then a devops check on the D1 preview. It blocks switching the demo form ON, not the console screens.
- **Fix with it (Minors):** m-1 (await the delete, report failure) and m-2 (the flaky test, so `test:qa` is stable for the gate).
- **For the PM or security review:** m-3.
- The nits can wait.

Re-review only the fix commits (round 2).

---

# R1b — frontend (round 1) — `feature/002-r1b` `4347715..d10a055`
Reviewer: code-reviewer · Date: 2026-10-13 · Scope: 13 commits on top of the B1–B6 head `4347715`:
- the prep commit `7a66dd0`, F1–F8, F10 and the landing fix `d10a055`;
- F9's delete-only commit `460f4e9` (19 files, −7,044 lines);
- BUG-3 `37553ef`.

70 files, +5,057/−7,804. Inputs: 01 (see gap 1), 02, 03 (v1.3 on disk), 04 → Frontend "R1b", and 05 (the R1-pre rounds and the R1b backend round 1).

**How I reviewed it:** I bundled `feature/002-r1b` + `main` and cloned it in the cloud workspace. I ran `bun install --frozen-lockfile` with **Bun 1.4.2** (lockfile unchanged, 416 packages) and ran every gate there.
- **Code read:** the shell, routing, write-guard, site-context and auto-refresh code, and all `src/screens/**`. I also checked the F8 edits to the R1.1 screens and the F9 deletions against what replaced them.
- **API inventory:** every `/api/v1/*` URL the client calls, matched against the routes `server.ts` defines.
- **Browser checks:** I built with `VITE_API_BASE_URL`, ran `dist/server.cjs` in-memory (Firestore off) and seeded it with `tests/qa/browser/seed.mjs`, plus one demo request. Headless Chromium + axe-core 4 (wcag2a/aa, 21a/aa, 22aa):
  - Site Admin A and Master on every nav page, at 360 touch and 1280 mouse;
  - Master in **All sites**;
  - Master **viewing as** Site Admin A;
  - BUG-3: the flag-ON and flag-OFF marketing builds served with the **D1 `firebase.json` CSP** header, JS on and off, at 360/1280.

No source edits; your checkout stayed on `feature/001-parkflows-platform-v1`.

## Gaps found in inputs
1. **The brief says PRD v1.5; the file on disk is v1.6** (11 Oct: R1a live, R1b gates). Nothing in v1.6 changes an AC this review checks, so I reviewed against v1.6.
2. **The prep commit `7a66dd0` applies the 02 "Design-system decisions after R1-pre", still marked "For approval" in 02.** PRD v1.3 records the user's approval of the UX 02 decisions (04 frontend gap 1). UX should set the 02 status line to approved, so the docs and the code agree.
3. **03 v1.3 (13 Oct) is pending approval** and only changes the backend (B6b, `DEMO_HOSTING_EGRESS_CIDRS`). No frontend impact.
4. **`ARCHITECTURE.md`, `README.md` and `KNOWN_ISSUES.md` still name the components F9 deleted** (04 gap 13). That's docs debt for the architect.

## Checks against the brief
| Item | Result | Evidence |
|---|---|---|
| **Site scoping on every screen** | **PASS** | No client code decides access. 001's global fetch wrapper (`withSite.ts`) attaches `x-site-id`/`x-view-as`, and the server's `resolveSite` decides.<br>**Stale-data guard:** every R1 screen (`Overview`, `LiveParking`, `Employees`, `Sites`, `DemoRequests`) loads through `useAutoRefresh`, whose `isCurrent()` combines the 001 generation counter, a deps epoch and the latest-run id. Site pages are also remounted on a site switch (`App.tsx:744`, `key={currentSiteId}`) and platform pages on a view-as change (`:728`). So no previous-site rows survive a switch, and 04's 79-sample race run (0 cross-site samples) fits the code.<br>**AC-23:** the site name is shown only in the switcher. |
| **View-as and write guard** | **PASS** | `guard.ts` is now 001's `useWriteGuard` (All sites → "Select one site to make changes"; view-as → read-only). Every write in the R1 site screens uses `guard`: slot modal entry/exit/status, approve/reject (row, panel, bulk, menu), add employee, import CSV. Platform pages (Sites, Demo requests, domains in the site panel) disable on `isViewAs`, which is correct because the 001 guard would also block them for "no site" (04 gap 4).<br>**Browser:** in **All sites**, Live parking, Overview, Inventory and Logs had 0 enabled write buttons, and Employees only the "Rejected" **tab**. **Viewing as** Site Admin A: the bar is shown; Overview, Live parking, Employees and Inventory have 0 enabled writes; the slot modal has 0 enabled buttons; `#/sites` and `#/demo-requests` → No access. `masterOnly` checks the **viewer** (`routes.ts:93`). The server still refuses every non-GET under view-as (B-round 1). |
| **AC-04 / AC-06 honesty** | **PASS** | None of the AC-04 strings remain in console UI code (₹4.2L, 48/60, 94%/96%, "100% uptime", CONNECTED, VERIFIED, "System healthy", FPS, Zero Violations, "1,080 slots", "Today, 08:30 AM").<br>**Predictive:** a page banner plus a "Sample data — not live" tag on each chart and the recommendations; "LSTM… MODEL" and "AI Powered" removed; the fake 12-camera health grid deleted; `/analytics/prediction` `sample:true`.<br>**PLC:** "Stacker controller (PLC) — not connected" in the slot modal and puzzle view.<br>**Overview:** every KPI comes from `GET /overview`, with "—" + reason when there are no slots or history (AC-05). |
| **AC-21 renaming** | **PASS** for the console (see n-3) | "ParkFlow" and "ParkOrbit" occur 0 times in `src/**`, `index.html`, `mobile.html`, `metadata.json` and `marketing/**`. Titles are "ParkFlows · Console" and "ParkFlows · Gate". AC-22: no "Neural/BOLA/HMAC/v4.2 Enterprise" in UI strings. The one hit left is `capacitor.config.ts` `appName: 'ParkFlow Attendant'` (R2 Android, untouched on purpose); see n-3. |
| **`lint:styles` / K3** | **PASS** | `scripts/check-styles.mjs` is **unchanged** in this range (no rule weakened). `lint:styles`: self-test 75/75, **61 R1 files clean** (up from 37: all of `src/screens/**`, `routes.ts`, `useAutoRefresh.ts`, `slots.ts`, `Shell.tsx`). Also clean when run by hand: `App.tsx`, `main.tsx`, `index.css`. `theme.css` still has no Tailwind default reset (K3). R1.1 screens keep Tailwind defaults as planned (e.g. `InventoryMaster.tsx` 353 hits), and none are in the R1 list. |
| **No API that B1–B6 didn't add** | **PASS** | I collected all 67 `/api/v1/*` URLs in the client and matched them to `server.ts`; **every one exists**. The only routes called for the first time are B3 `/overview`, B4 `/sites/summary`, B5 `/sites/update` and B6 `/demo-requests` (GET, `?status=NEW`, `/export`, `/status`, `DELETE /:id`). Everything else is 001. No new dependency (`package.json` and `bun.lock` untouched). |
| **Accessibility, R1 screens** | **PASS with Minors** (m-2, n-1) | **R1 screens** (Overview, Live parking, Employees, Sites, Demo requests, the shell): **0 axe violations, no horizontal scroll, smallest text 12px, and no target under 44×44 at 360 touch**. The only exceptions are the account-button nit (n-1) and missing H1s (m-2). Focus rings come from the design-system tokens. Routing moves focus to the H1, except on No access and Choose a site, which have none (m-2).<br>**R1.1 screens** (Logs, Inventory, Alerts, Reports, Valet, Billing, Audit log, Settings) still fail AC-19 (axe button-name/select-name/contrast, 10–10.5px text, targets < 44). That's expected (R1.1) and only recorded here (o-1). |
| **BUG-3 vs the D1 CSP** | **PASS** | The inline `<style>` became `<noscript><link rel="stylesheet" href="/demo-noscript.css"></noscript>`. Served with the exact CSP from `d1/firebase.json` (`style-src 'self'`, `script-src 'self'`):<br>- **Flag ON, JS off** (360/1280): `#demo-form` is `display:none` (0px), the noscript banner shows; 0 console/CSP errors, 0 non-GET requests, 0 query strings.<br>- **Flag ON, JS on:** the form renders (flex).<br>- **Flag OFF:** no form, JS on or off.<br>No inline `<style>` in any built page. `demo-noscript.css` ships in both builds (harmless). |
| **No 001 regressions** | **PASS with one Minor** (m-1) | The 001 session code moved intact into `App.tsx`:<br>- session-ended / suspended events and return-to;<br>- view-as recall, start and exit, plus the stale-target check;<br>- `resetSiteStore` on sign-out.<br>The F9 deletions are covered by their replacements (Header → TopBar, SiteSwitcher/ViewAsBanner → Shell + `ViewingAsBar`, NoAccess/ChooseSite → `screens/shell/States`, DomainWhitelistPanel → `DomainsList` with the same add/remove rules).<br>AC-11: entry/exit removed from Logs (read-only) and kept on Live parking; the Field and Smart Pass previews are no longer routed. The 001 server suites are unchanged (see Gates). The one regression found is m-1 (Billing with no site). |

## Findings
**Critical:** none. **Major:** none.

| ID | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| m-1 | Minor | `routes.ts` (`billing`: `platform: true`) + `MasterAdminBilling.tsx:49` | **Billing breaks in the Master's default state.** Since F2 the Master lands on Sites with **no site chosen**, and Billing is marked a platform page ("works with no site"). But it calls `GET /api/v1/invoices`, which is site-resolved, so it gets **400** (seen in the browser). The page shows "Could not load invoices", but beside it the KPIs say **"Outstanding ₹0 · Overdue 0 · Total 0"** and "No invoices yet". Zeros shown as real counts break AC-05, and in 001 the Master always had a site here. | Either treat Billing as a site page (show "Choose a site" or default to All sites), or load invoices with `siteId=ALL` for a Master (the route already allows `ALL`). Hide the KPIs, or show "—", while the load has failed. |
| m-2 | Minor | `screens/shell/States.tsx` (`NoAccessPage`, `ChooseSitePrompt`); Users & roles with no site | **Pages without an H1.** No access and Choose a site render an `EmptyState` (H3) with no PageHeader. So they have no H1, focus-to-H1 has nothing to land on, and screen-reader users get no page title. AC-08/AC-09 expect the page template. Hit by: view-as `#/sites`, a Site Admin on `#/users` (both No access), and the Master on Users & roles with no site. | Render a PageHeader (H1 = the route title, or "No access") above both states. |
| n-1 | Nit | `AppShell.tsx:82-91` | axe `label-content-name-mismatch` (WCAG 2.5.3) on the account button: its name "Account: DigiSolutions Master Admin, Platform Master Admin" doesn't start with the visible text. Axe still flags it even though the initials avatar is `aria-hidden`. It's an experimental axe rule, but cheap to fix. | Make the aria-label start with the visible name (e.g. "DigiSolutions Master Admin — account menu"), or drop it and use `aria-describedby` for the role. |
| n-2 | Nit | `routes.ts:88` `designSystemAvailable()` | `/design-system` is hidden only on `admin.parkflows.in`, so it is reachable (Master only, example data) on the direct `*.run.app` URL in production. Harmless, but not "dev and staging only" as the comment says. | Gate it on `import.meta.env.DEV` or a build flag. |
| n-3 | Nit | `capacitor.config.ts:5` | `appName: 'ParkFlow Attendant'`. AC-21 says "ParkFlows everywhere (… app names)". It's untouched because Android is R2. | PM: track it for R2 explicitly. |
| n-4 | Nit | `App.tsx:345-355` | The New-requests badge downloads the full list of NEW demo requests (with personal data) every 60 s just to count them. | A count-only response later (backend), or accept it. Master only. |
| o-1 | Observation | R1.1 screens | Logs, Inventory, Alerts, Reports, Valet, Billing, Audit log and Settings still fail AC-19 (axe violations, 10px text, small targets on touch). Expected for R1.1; record it in the R1.1 plan. Logs and Inventory were only edited for AC-11 and F5 fields. | R1.1 |

## Gates (clean clone of `d10a055`, `bun install --frozen-lockfile` with Bun 1.4.2)
| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | **PASS** (no lockfile change) |
| `npm run lint` | **0 errors** |
| `npm run lint:styles` | **PASS**: self-test 75/75, 61 R1 files clean |
| `npm run tokens -- --check` | **PASS** |
| `npm run build` | **PASS** (console + mobile). The ">500 kB chunk" warning is pre-existing (main chunk 518 kB vs 596 kB on the base). |
| `npm run build:marketing` | **PASS**, flag OFF and `PF_DEMO_FORM=1` |
| `test:qa` per file | `001-backend` **64/64** · `001-hotfix-coldstart` **6/6** · `001-platform-v1` **42/57** (the 15 known FLOW failures) · `002-backend` **19/19** (run at 07:17 IST, so the m-2 flake didn't trigger) · `002-format` **10/10** · `002-tokens-styles` **7/7**. **0 new failures.** |

## Verdict: PASS (R1b frontend, round 1)
No Critical or Major findings. Every check passes: site scoping and the view-as/All-sites guard on every R1 screen, the AC-04/AC-06 honesty strings, AC-21 naming in the console, `lint:styles`/K3, API usage (B1–B6 only), R1-screen accessibility, BUG-3 under the D1 CSP, and the 001 flows.
- **m-1 and m-2 should be fixed before the R1b go-live** (one small commit; a one-commit check is enough).
- The nits and o-1 go to R1.1/R2.
- **Not part of this review:** backend **M-1** (05 R1b backend round 1; 03 v1.3 B6b) is still open, and it still blocks turning the demo form ON.

---

# R1b — round 2 (fix commits `d10a055..a94eae5`)
Reviewer: code-reviewer · Date: 2026-10-14 · Scope: 3 commits on `feature/002-r1b` after `d10a055` (12 files, +557/−64):
- `e4b0834`: B6b, plus backend round-1 M-1, m-1, m-2 and m-3, and nit n-2;
- `eed000f`: frontend m-1;
- `a94eae5`: frontend m-2.

Checked against the round-1 findings (R1b backend round 1, R1b frontend round 1) and **`03-tech-design.md` v1.3**, "Demo-request client IP behind Firebase Hosting", B6b and its test list.

**How I reviewed it:** I read the full diff, including the new `src/server/clientIp.ts` and both test files. I bundled `feature/002-r1b` + `main`, cloned it in the cloud workspace and ran `bun install --frozen-lockfile` with **Bun 1.4.2** (lockfile unchanged, 416 packages), then all the gates. **Browser checks:** I built the console with `VITE_API_BASE_URL`, ran `dist/server.cjs` in memory with the QA seed, and used headless Chromium + axe-core 4 on:
- Billing with no site;
- Users & roles with no site;
- an unknown route;
- view-as `#/sites`;
- a user with no site.

No source edits; your checkout stayed on `feature/001-parkflows-platform-v1`.

## Gaps found in inputs
1. **03 v1.3 is still "READY FOR APPROVAL"** (status line and review log, 13 Oct). It adds a new env var, `DEMO_HOSTING_EGRESS_CIDRS` (CLAUDE.md rule 5). The code matches v1.3, but **you need to approve 03 v1.3 before that variable is set on Cloud Run**.
2. Per 03 v1.3, the M-1 fix is only proven once **DevOps has done the D1 preview check (steps 1–7)**: two networks get separate buckets, and the direct URL gets 403. It stays a **gate for turning the demo form ON**, not a code-review item.

## Round-1 findings
| ID | Status | Evidence |
|---|---|---|
| **Backend M-1**: shared per-IP bucket behind the Hosting rewrite | **Fixed** (`e4b0834`) | **`clientIp.ts` `pickDemoClientIp()` follows the 03 v1.3 rule exactly:**<br>- off Cloud Run (`K_SERVICE` unset) it ignores X-Forwarded-For and uses the socket address;<br>- on Cloud Run the rightmost hop must be inside `DEMO_HOSTING_EGRESS_CIDRS` (`net.BlockList`, IPv4 and IPv6), and the hop just to its left is the visitor;<br>- normalisation: `::ffff:`, `:port`, `[v6]`; IPv6 is keyed on its /64;<br>- multiple header lines are joined in order (`headersDistinct`);<br>- no other header is read.<br>**Front door** (an `app.post` chain on the path, before the global parser and auth; CORS / cross-origin block still run first):<br>- store not ready → `next('route')`, so the 503 `ERR_STARTING` guard answers as before;<br>- refused → **403 `ERR_VIA_HOSTING_ONLY`** before any limiter, body or store work;<br>- otherwise `rateLimiterMiddleware(5, 10 min, { key: demo:<key>, redactAudit })`, then the 8 KB parser and its plain 413/400.<br>**Fails closed:** with an empty CIDR list it warns at startup and every POST gets 403; bad entries are warned and skipped.<br>**Unchanged:** `trust proxy` is still 1, ingress and CORS untouched, and 001 routes keep their `ip:`/`u:` keys. The 30-stored-per-hour cap and the honeypot are unchanged.<br>**Tests** (`002-client-ip`, 11): every unit case and API case 1–7 in 03's list — separate buckets for A and B; forged leading entries don't get a new bucket; direct URL 403 uses no bucket; fails closed; m-3 redaction while a 001 route keeps IP+UA; order (413/415 count only toward that visitor, refused posts don't use the cap); off Cloud Run XFF can't dodge the limit. **Residual risk** (a third party on the same CDN): accepted in 03 v1.3. |
| **Backend m-1**: delete was fire-and-forget | **Fixed** | `deleteDemoRequest` is now async. With Firestore configured, it **awaits** the document delete **first**. If Firestore is unavailable, the store isn't ready, or the commit throws, it returns `'failed'`; the route answers **503 `ERR_DELETE_FAILED`** "Couldn't delete the request. Try again.", **keeps the record**, and writes no audit. Only after a successful commit is the record removed from memory and the local copy (re-reading the list after the await). With no Firestore (local dev), memory and the local copy are the only copies. The F10 panel shows the server's message. Test: a forced delete failure → 503, record kept; the retry deletes it and it stays gone after a restart. Expiry stays fire-and-forget, which is fine because it self-heals on the next run. See n-6 for a narrow remaining race. |
| **Backend m-2**: B3 time-of-day flake | **Fixed** | The `activeToday` fixture is now `max(todayStart, now − 1 h)`, so it can never count as "over 12 h". `002-backend` 20/20. |
| **Backend m-3**: IP/UA in demo-route security events | **Fixed** (PM accepted 03's recommendation, 13 Oct) | `logSecurityEvent({ redactClient })` writes `ipAddress:'redacted'` and **no `userAgent`**. The demo limiter's `RATE_LIMIT_EXCEEDED` uses `actor:'anonymous'` and drops the query string from `targetResource`. `DEMO_REQUEST_NOT_VIA_HOSTING` carries the reason only. The HMAC chain is unaffected, because `userAgent` was never in the hashed payload and is optional in the type. Test m-3: no address text in the entry, and a 001 route still has IP + UA. |
| Backend n-2: unknown `?status=` returned everything | **Fixed** | A wrong type or an unknown value → 400 with `errors.status`. Tested. |
| Backend n-1, n-3 | Open (nits) | CSV phone apostrophe; exported test seam. Accepted as nits. |
| **Frontend m-1**: Billing with no site (400 + "₹0 / 0 / 0") | **Fixed** (`eed000f`) | `MasterAdminBilling` asks for the chosen site, or for `siteId=ALL` when none is chosen (the route allows `ALL` for a Master), and reloads when the scope changes. KPIs show **"—" until a load succeeds**, and a failed first load says "Invoices couldn't be loaded" instead of "No invoices yet". **Browser:** Master with no site → Billing lists both sites' invoices with a Site column, KPIs from the data, **0 API errors**. Billing writes (`/invoices/status`) aren't site-scoped, so they work unchanged. |
| **Frontend m-2**: No access / Choose a site without an H1 | **Fixed** (`a94eae5`) | `NoAccessPage`, `ChooseSitePrompt` (H1 = the requested page's title, or "Choose a site") and `NoSitePage` (in the shell and full-page) now render a `PageHeader` H1. **Browser:**<br>- Users & roles with no site → H1 "Users & roles", focus on the H1, axe 0;<br>- view-as `#/sites` → H1 "No access";<br>- a user with no site (360) → H1 "No site assigned", axe 0. |
| Frontend n-1..n-4, o-1 | Open (nits / R1.1) | As recorded in frontend round 1. |

## New in round 2
| ID | Severity | Where | Note |
|---|---|---|---|
| n-5 | Nit (pre-existing F2 order) | `App.tsx` route rendering | A Master with **no site** who opens an **unknown** route (`#/nonsense`) sees "Choose a site" (H1 "Choose a site") instead of No access. After choosing a site they get No access. AC-08 expects No access straight away. Check the route before the site prompt. |
| n-6 | Nit | `db.ts` `deleteDemoRequest` | The record stays in memory while the Firestore delete is awaited. A full sync (or a status update's targeted sync) that reads it during that window could write the document back after the delete commits. The window is about one commit long and production runs `max-instances=1`. Removing the record from memory **before** the await (and putting it back on failure) would close it. |

## Gates (clean clone of `a94eae5`, `bun install --frozen-lockfile` with Bun 1.4.2)
| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | **PASS** (lockfile unchanged) |
| `npm run lint` | **0 errors** |
| `npm run lint:styles` | **PASS**: 75/75 self-test, 61 R1 files clean |
| `npm run tokens -- --check` | **PASS** |
| `npm run build` | **PASS** |
| `npm run build:marketing` | **PASS** with the flag OFF and `PF_DEMO_FORM=1` |
| `test:qa` per file | `001-backend` **64/64** · `001-hotfix-coldstart` **6/6** · `001-platform-v1` **42/57** (the 15 known FLOW failures) · `002-backend` **20/20** · `002-client-ip` **11/11** (new) · `002-format` **10/10** · `002-tokens-styles` **7/7**. **0 new failures.** |

## Verdict: PASS (R1b round 2)
**0 Critical, 0 Major open.** Backend M-1 is fixed in code as 03 v1.3 specifies, with the tests 03 asked for. Backend m-1, m-2, m-3 and n-2 are fixed, and so are frontend m-1 and m-2. Code review (step 5) is complete for R1b. What's left (n-1, n-3, n-5, n-6, frontend n-1..n-4, o-1) is nits and R1.1.

**Before the demo form flag goes ON** (not code-review items):
- you approve 03 v1.3 (`DEMO_HOSTING_EGRESS_CIDRS`, rule 5);
- DevOps sets the variable from the published Hosting egress ranges and passes the D1 preview check (steps 1–7);
- the other PRD v1.6 gates are met (mail, QA, security review).

---

# R1b — frontend QA fixes (a94eae5..535f6fa)
Reviewer: code-reviewer · Date: 2026-10-16 · Reviewed HEAD **`535f6fa`** · Scope: 3 commits on `feature/002-r1b` (2 files, +34/−8):
- `38982d3` BUG-R1B-1;
- `53d8d1d` BUG-R1B-2;
- `535f6fa` BUG-R1B-3.

Checked against 06 "R1b" (the bugs and expected results, AC-10), PRD 01 **v1.7** ("PM decision: IP and user-agent in logs"), and 04 "R1b frontend — QA round fixes".

**How I reviewed it:** I read each diff and the surrounding `App.tsx` code: the site-resolution effect, `clearSession`, `selectSite`, view-as start/exit/recall, `RouteKeeper` and the render branches. I bundled `feature/002-r1b` + `main`, cloned it in the cloud workspace and ran `bun install --frozen-lockfile` with **Bun 1.4.2** (lockfile unchanged). Your checkout wasn't switched.

**Browser checks** (headless Chromium, axe-core 4):
- console built with `VITE_API_BASE_URL`, `dist/server.cjs` in memory, QA seed;
- slow APIs simulated by delaying `/rbac/roles` or `/my-sites` in-page, so other requests weren't held up;
- marketing builds served with the D1 CSP.

No source edits.

## Checks against the brief
| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | **BUG-R1B-1 root cause** | **Confirmed** | The site-resolution effect calls `bumpGeneration()` and then `fetchRoles()`, which captured that generation. `/my-sites` then auto-selects the only site, and `selectSite` → `setActiveSiteId` bumps the generation again. If `/rbac/roles` answers after `/my-sites`, its result was dropped by `isCurrentGeneration`, so `rolesReady` stayed false and `landingReady` stayed false: blank "Loading". |
| 1 | **BUG-R1B-1 fix** (`App.tsx:222-236`, `:274`) | **PASS** | `fetchRoles` now has its own counter `rolesRequest`: only the newest roles call may apply. `clearSession` bumps it. **Browser:** with `/rbac/roles` delayed 1.2 s, `qa.atta` → Overview 4/4 and `qa.admina` → Overview 4/4; no delay and reload → Overview. AC-10 met. |
| 2 | Stale roles answer after sign-out / view-as / quick re-login; `rolesReady` stuck false | **PASS** | **Sign-out:** `clearSession` resets `rolesReady` and bumps the counter, so an in-flight answer is dropped.<br>**Re-login:** the new site effect calls `fetchRoles` again, and only that request may land.<br>**View-as change:** the effect calls it again, and the older answer is dropped. The role list is global, so applying the latest one is right.<br>**Stuck false:** only if the newest roles request never settles (no timeout, a network hang), which was already true before. Both success and failure (catch) set `rolesReady` for the newest request. A non-success body sets `rolesReady` and keeps the previous list; also unchanged. |
| 3 | **BUG-R1B-2 fix** (`App.tsx:463-525`, `:703-707`, `:733`) | **PASS** | `siteSettledFor` is set on every terminal path of the resolution: `!ok` → error, `no-site`, view-as `ready`, normal `ready`, and the `catch` (only if the generation is still current).<br>**Cancelled by a newer run:** returns early on the generation check; the newer run settles.<br>**Viewed user gone (404):** `exitViewAs()`, then a new run settles for `userId|`.<br>**Sign-out while resolving:** `resetSiteStore` bumps the generation and `clearSession` sets `siteSettledFor` to null, so the old run can't settle anything.<br>**Entering or leaving view-as:** the key changes (`userId|viewAsId`), so `siteSettled` is false until the new run ends. This is d10a055's case, now explicit.<br>**Remembered site no longer allowed:** `next` stays null → `ready` + settled → "Choose a site" (several sites), auto-select (one site), or Sites (Master).<br>**Retry after an error:** the same key, but `sitePhase` is `'resolving'` from the effect, so it isn't settled. |
| 3 | Browser: multi-site Site Admin | **PASS** | `qa.multiab`, fresh browser: `/` → **"Choose a site"** with no delay, with roles slow and with `/my-sites` slow (3/3). Choosing site A → `#/overview`, "Overview" (AC-10).<br>`#/sites`, `#/demo-requests` and `#/nope` → **No access**. `#/live-parking` → the prompt with H1 "Live parking".<br>A deep link `#/sites` at sign-in → No access. |
| 3 | `noAccessNow` (`App.tsx:707`, `:733`) | **PASS** with one Nit (N-1) | `route !== null && rolesReady && !allowed` skips the site prompt and renders the shell's No access.<br>**Unknown route:** `def` is undefined, so `allowed` is false → No access. **Fixes n-5.**<br>**`masterOnly` under view-as:** `canOpenRoute` checks the viewer → No access. Browser: view-as `qa.multiab`/`qa.admina`/`qa.atta` → `#/sites` is No access.<br>**Before roles load:** `noAccessNow` is false, so the old flow applies. That causes N-1.<br>**Custom roles:** `noAccessNow` uses the same `canOpenRoute`, so it inherits **R1B-4's fail-open** unchanged: `qa.uma` still lands on Overview and opens Live parking. Neither better nor worse; R1B-4 stays open as Minor. |
| 3 | No regression on landings | **PASS** | Master → **Sites**. View-as single-site Site Admin (`qa.admina`, `qa.atta`) → **Overview** (d10a055 holds). View-as multi-site → "Choose a site".<br>**Sign out while `/my-sites` is slow, then sign in as `qa.multiab`:** "Choose a site", and the switcher shows "Choose a site"; nothing of `qa.admina` appears. |
| 4 | **BUG-R1B-3** (`marketing/privacy/index.html:23`) | **PASS** | I extracted the PRD v1.7 quote by script (352 characters, straight `'`). It is in the source and in the built **flag-ON** `privacy/index.html` **verbatim**; the old sentence is gone.<br>**Flag OFF:** `privacy/index.html` is **byte-identical** (`cmp`) to the `a94eae5` build. Every other flag-OFF page is identical after normalising asset hashes.<br>**Flag ON:** only `privacy/index.html` differs. The edit is inside the `@if demo-form` branch. |
| 5 | **"Touches" claim** | **PASS** | `git diff --stat a94eae5..535f6fa`: `src/App.tsx` (38982d3, 53d8d1d) and `marketing/privacy/index.html` (535f6fa) only. **No server file, nothing under `marketing/demo/*`, no fetch wrapper** (`sessionTokenFallback.ts` / `withSite.ts` untouched). **No security re-review needed.** |
| 6 | Tokens, inline styles, dependencies, unrelated changes | **PASS** | No style or class changes. `lint:styles` clean (61 files). `package.json` and `bun.lock` unchanged. Nothing unrelated in the diffs. |

## Findings
**Critical:** none. **Major:** none.

| ID | Severity | Where | Problem | Suggested fix |
|---|---|---|---|---|
| N-1 | Nit | `src/App.tsx:707`, `:733` | **Brief wrong prompt on a forbidden deep link while roles load.** Until `/rbac/roles` answers, `noAccessNow` is false. A multi-site Site Admin opening `#/sites` therefore sees "Choose a site" (H1 "Choose a site") first, and **No access** once roles arrive. With roles delayed 2.5 s, that was 6 samples (~2.4 s) of the prompt. Nothing can be done in that state, and it settles correctly. | While `route !== null && !rolesReady`, render `PageSkeleton` instead of the site prompt. |
| N-2 | Nit (test infra, not in this range) | `tests/qa/002-backend.api.test.mjs:31` (and `001-backend:22`, `001-hotfix-coldstart:51`, `001-platform-v1:27`) | **New flake seen once.** In 1 of 2 full runs, "B3 /overview: counts match…" failed with **403 "This site does not exist"**, which is not the time-of-day m-2 flake. The suites pick random ports from overlapping ranges (002-backend 5000–5899 contains 001-hotfix 5100–5179), and `node --test` runs files in parallel. So a server can occasionally start against, or be queried on, another suite's port. This may also explain the builder's one-off hang. | Listen on port 0 and read the bound port, or give each suite a non-overlapping range and retry on `EADDRINUSE`. Owner: backend/QA. |

**Still open from 06** (not part of this range, unchanged by it):
- R1B-4 custom-role fail-open (Minor);
- R1B-5 badge late (Minor): the same generation-drop pattern as BUG-R1B-1, inside `useAutoRefresh` for the demo badge;
- R1B-6 `label-content-name-mismatch` (seen again here, see axe);
- R1B-7 made-up site defaults.

## Gates (clean clone of `535f6fa`, `bun install --frozen-lockfile`, Bun 1.4.2)
| Gate | Result |
|---|---|
| `tokens -- --check` | **PASS** |
| `lint` | **0 errors** (0 new) |
| `lint:styles` | **PASS**: 75/75 self-test, 61 R1 files clean |
| `build` | **PASS** |
| `build:marketing` | **PASS** with the flag OFF and `PF_DEMO_FORM=1` |
| `test:qa` | Run 1: **159/175**, the 15 known 001 FLOW failures + B3 failing with 403 (N-2), 253 s. Run 2: **160/175**, the same 15 known, **0 new**, 253 s. **The hang after test 147 did not reproduce** in 2 runs (both finished in 253 s). |

**axe** (wcag2a/aa, 21a/aa, 22aa) at 360 / 768 / 1280:

| Page | Result |
|---|---|
| Multi-site Site Admin landing ("Choose a site") | only `label-content-name-mismatch` (1 node, the account/bell trigger, **known BUG-R1B-6**) |
| No access (`#/sites` as `qa.multiab`) | same, R1B-6 only |
| Overview (`qa.admina`) | **0** at 360 and 768; R1B-6 at 1280 |
| `/privacy/` flag OFF and flag ON, under the D1 CSP | **0**, no sideways scroll, text ≥ 13px, no console errors |

No horizontal scroll anywhere.

## Verdict: PASS
**0 Critical, 0 Major.** BUG-R1B-1, BUG-R1B-2 and BUG-R1B-3 are fixed as 06 expects, and the AC-10 landing pages hold for every role I tried. The BUG-R1B-1 root cause is confirmed, and nit n-5 is fixed. The commits touch neither the server, the demo form nor the fetch wrapper, so **no security re-review is needed**. N-1 and N-2 are nits; R1B-4..7 stay open as triaged in 06.

---

# R1b — R1B-S1 hotfix, R1B-S2, BUG-R1B-6, BUG-R1B-7
Reviewer: code-reviewer · Date: 2026-10-17 · Reviewed HEADs: **`hotfix/r1b-s1` @ `bbfdbcc`** (1 commit on `main` @ `84ec8ef`) and **`feature/002-r1b` @ `9ac2843`** (5 commits after `535f6fa`, 8 files, +280/−23):

| Commit | Branch | Item | Files |
|---|---|---|---|
| `bbfdbcc` | hotfix | **R1B-S1** (07 Medium; PRD v1.8: production hotfix now) | `server.ts`, `tests/qa/001-hotfix-r1b-s1.test.mjs` |
| `cfdff14` | r1b | R1B-S1, cherry-picked (`-x`) | the same, plus the B6 gate line |
| `9dd406f` | r1b | **R1B-S2** (07 Low; PRD v1.8: before the form goes ON) | `server.ts`, `002-client-ip` test |
| `a0410b1` | r1b | **BUG-R1B-7**, backend half | `db.ts` `onboardSite`, `002-backend` test |
| `af5832a` | r1b | **BUG-R1B-6** (WCAG 2.5.3) | `AppShell.tsx` (+ a doc comment in `Shell.tsx`) |
| `9ac2843` | r1b | **BUG-R1B-7**, UI half | `Sites/SitePanel.tsx` |

Checked against PRD **v1.8** (R1b split into console/form, triage table), 07 (R1B-S1/S2 and the 17 Oct delta review), 06 (BUG-R1B-6/7) and 04 (backend and frontend notes of 17 Oct).

**How I reviewed it:**
- **Code:** I read every diff, and `git range-diff` for the cherry-pick.
- **Gates:** I bundled `main` + both branches, cloned **each branch separately** in the cloud workspace, ran `bun install --frozen-lockfile` (**Bun 1.4.2**, lockfile unchanged) and ran the gates.
- **Proving the tests:** I checked each new test against the code it guards. I put back `84ec8ef`'s `server.ts` (hotfix) and `535f6fa`'s `server.ts` / `db.ts` (r1b), and the new tests fail.
- **Browser:** I ran the r1b console in memory with the QA seed and checked it with Chromium + axe-core 4.

No source edits; your checkout stayed on `feature/001-parkflows-platform-v1`.

## Checks
| Item | Result | Evidence |
|---|---|---|
| **R1B-S1** (`server.ts:130-135` hotfix / `:145-150` r1b; gate `:330`; cold-start guard `:285`) | **PASS** | **Layer 1:** `app.set('case sensitive routing', true)` comes before the first `app.use`, so the router is created with it. Every route and mount in `server.ts` is lower case (I grepped for registrations with capitals: none), and every client call in `src/**` and `src/mobile/**` uses lower-case `/api/v1/…`, so only non-canonical spellings stop routing.<br>**Layer 2:** the sign-in gate and the 503 `ERR_STARTING` guard both decide on `gatePath()` (lower-cased, repeated slashes collapsed, trailing slash dropped). So every spelling Express could still route (a trailing slash, since `strict routing` is off) is gated like the canonical one, and public paths keep working with a trailing slash.<br>**Probes on the r1b server, no session:** `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `//api/v1/rbac/roles` and `/api//v1/my-sites` → **401**. `/Api/v1/demo-requests` GET → 405 (the demo branch compares the normalised path, `cfdff14`'s one adapted line, which is correct).<br>**Tests:** `001-hotfix-r1b-s1` 4/4 cover every spelling 401, a signed-in caller can't reach a handler by case, public routes still work, and non-canonical spellings get 503 during cold start. **All 4 fail on `84ec8ef`.**<br>**Cherry-pick:** `range-diff` shows `cfdff14` matches `bbfdbcc` except for that one demo line. |
| **R1B-S2** (`server.ts:301-307`) | **PASS** | **What changed:** a demo POST that passed the front door (`res.locals.demoClientKey`, set only by the exact, case-sensitive demo POST route after the Hosting check) skips the global 600/min limiter, so its unredacted `RATE_LIMIT_EXCEEDED` can't be written. Any other spelling of the demo path still counts in the same buckets, with a redacted audit. Every other route goes through the unchanged global limiter.<br>**Test** (`002-client-ip` #12): 606 posts from 121 visitors in a minute → 605×200, the visitor's own 429 still applies, and no event carries the user-agent. **It fails on `535f6fa`.**<br>**Trade-off:** this removes 03's backstop for the accepted residual. That's **07 R1B-S9** (Low, R1.1: count demo POSTs in their own redacted 600/min key space). I agree with it and don't raise it again. |
| **BUG-R1B-7, backend** (`db.ts:3615`, `onboardSite`) | **PASS** | The four made-up values ("<city> Parking Complex", "Site Facility Manager", `admin@<code>.com`, `+91 9800000000`) are gone. A missing or non-text value becomes `''`, and entered values are trimmed. Existing sites are untouched (no backfill, as 04 says). Browser: the seeded new sites store `''` for all four.<br>**Test** (`002-backend` "BUG-R1B-7 …"): **fails on `535f6fa`.** See n-3 for the other onboarding defaults. |
| **BUG-R1B-7, UI** (`SitePanel.tsx:36-56`, `:229`, `:243-249`) | **PASS** | Address, contact person, email and phone each get their own row with the entered value or "— not entered" ("— couldn't load the site details" if `GET /sites` failed). The **exact four legacy patterns** are treated as not entered, so older sites are honest too (AC-04/AC-05). Edit site leaves them blank, with a note that saving clears them.<br>**Browser:**<br>- QA Site B, set to the four legacy values through `/sites/update`: all four "— not entered"; the edit form has empty fields plus the note; axe 0.<br>- QA Site A with a real contact person and phone: those two shown as entered, the other two "— not entered". |
| **BUG-R1B-6** (`AppShell.tsx:58-62`, `:89`) | **PASS** | **Bell:** the name now starts with what it shows ("1 notification: …", "91 notifications: …", "99+" over 99). With nothing pending it shows no text, and the name stays "Notifications: nothing needs your attention".<br>**Account:** "DA DigiSolutions Master Admin, Platform Master Admin: account". A real space now separates the initials from the name, so the visible text reads "DA DigiSolutions…" at 1280 and "DA" below 1024.<br>**axe** (wcag2a/aa/21a/21aa/22aa) for Master (Sites), single-site Site Admin (Overview) and multi-site Site Admin (Choose a site), each at 360 / 768 / 1280: **0 violations**. `label-content-name-mismatch` is gone. |
| Rules (CLAUDE.md, the agent file, 03) | **PASS** | No new dependency (`package.json`/`bun.lock` unchanged), no env var, no Firestore rules or deploy-config change. No inline styles or Tailwind defaults (`lint:styles` clean). The UI uses existing `pf-*` classes only (`.pf-card-note`, `.pf-dl`). No unrelated changes. |
| Security re-review | **Done by security** | These commits touch the server (S1, S2, onboarding). 07 "Delta review — R1B-S1 hotfix and R1B-S2 · 2026-10-17" covers both branches at these SHAs and closes S1/S2. The UI commits don't touch the server, the demo form or the fetch wrapper. |

## Findings
**Critical:** none. **Major:** none.

| ID | Severity | Where | Problem | Suggested fix |
|---|---|---|---|---|
| n-1 | Nit | `src/screens/AppShell.tsx:58-62` | Plural mismatch in the bell's accessible name: "1 notification: **1 pending pass requests**". The attention labels are always plural. | Singular/plural per entry (e.g. `count === 1 ? 'pending pass request' : …`), or count-free labels. |
| n-2 | Nit | `src/screens/Sites/SitePanel.tsx:36`, `:229` | **Edge case of the pattern rule:** a site whose real contact happens to equal a legacy pattern (e.g. a building really called "Pune Parking Complex") shows as "— not entered", and saving Edit site for any other change clears it. The note says so, and the chance is very low. | Accept. Or, once the made-up values have been cleaned up in production (a one-off DevOps/PM check of the current site list), remove the pattern rule in R1.1. |
| n-3 | Nit (outside BUG-R1B-7's scope) | `src/server/db.ts:3650-3652` | `onboardSite` still fills in `totalSlots: 500`, `basementLevels: 2` and `hasPuzzleParking: true` when they're missing. The Sites table and panel show capacity from the real slot count (`/sites/summary`), so nothing shows them as real today. | R1.1: leave them unset, or require them on onboarding. |

**Carried over (unchanged):**
- **07 R1B-S9:** the global-limiter backstop for demo POSTs, Low, R1.1.
- **R1B-S3:** the DevOps CIDR / D1 / trailing-slash gate for R1b-form.
- **R1B-4/5/8:** R1.1, per PRD v1.8.
- **N-1** (forbidden deep link while roles load) and **N-2** (test ports): from the QA-fix review. The N-2 flake **didn't appear** in this round's two runs.

## Gates (clean clones, `bun install --frozen-lockfile` with Bun 1.4.2)
| Gate | `hotfix/r1b-s1` @ `bbfdbcc` | `feature/002-r1b` @ `9ac2843` |
|---|---|---|
| `tokens -- --check` | n/a (not on `main`) | **PASS** |
| `lint` | **0 errors** | **0 errors** |
| `lint:styles` | n/a | **PASS** (75/75, 61 R1 files clean) |
| `build` | **PASS** | **PASS** |
| `build:marketing` | n/a | **PASS** with the flag OFF and `PF_DEMO_FORM=1` |
| `test:qa`, per file | `001-backend` 64/64 · `001-hotfix-coldstart` 6/6 · **`001-hotfix-r1b-s1` 4/4** · `001-platform-v1` 42/57 (the 15 known FLOW failures) | `001-backend` 64/64 · `001-hotfix-coldstart` 6/6 · **`001-hotfix-r1b-s1` 4/4** · `001-platform-v1` 42/57 (15 known) · `002-backend` **21/21** · `002-client-ip` **12/12** · `002-format` 10/10 · `002-tokens-styles` 7/7 |
| `npm run test:qa` (whole suite) | — | **166/181** twice in a row; only the 15 known failures, **0 new**, no hang |

## Verdict: PASS
**0 Critical, 0 Major.** R1B-S1 is fixed on both branches; the hotfix is ready for its DevOps deploy on `main`. R1B-S2, BUG-R1B-6 and BUG-R1B-7 are fixed on `feature/002-r1b`, each with a test (or an axe check) that fails or flags on the old code. With 07's delta PASS, these meet the PRD v1.8 **R1b-console** review gates. n-1..n-3 are nits.
