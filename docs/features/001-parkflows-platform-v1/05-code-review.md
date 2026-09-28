# Code Review — ParkFlows Platform v1: login refresh + logout state reset (round 1)
Reviewer: code-reviewer · Date: 2026-09-25 · Scope: uncommitted working tree on `main` vs `HEAD` (`d42af6f`)

## Gaps found in inputs
1. **No tech design, and the code under review has no author in this pipeline.** The folder now has `01-prd.md` (still awaiting user approval), `02-ux-design.md` and `04-implementation-notes.md`. There is no `03-tech-design.md`. In `04-implementation-notes.md`, backend-dev and frontend-dev **both** report "BLOCKED — no code changed". So the `src/App.tsx` change below did not come from step 4. It is pre-existing uncommitted work, and backend-dev also flagged the dirty tree. With no tech design or AC to check it against, I reviewed it as a CLAUDE.md rule-7 "small fix" against PRD US-01 / AC-01..AC-06 (site isolation). The orchestrator should confirm that, or file it under its own feature folder. Separately, `07-security-review.md` and `08-release.md` exist although step 5 hasn't passed. That breaks the gate order.
2. **Wrong branch.** Work is uncommitted on `main`. CLAUDE.md rule 6 expects `feature/NNN-slug`.
3. **The diff is almost all noise.** `git diff --stat` reports 27 files, +16,166 / −16,150. With `--ignore-cr-at-eol` it is **1 file, +16 lines** (`src/App.tsx`). The other 26 files (including `server.ts`, `src/server/db.ts`, `src/server/security.ts`, `package.json`, `bun.lock`, `.env.example`) differ only in line endings: they were rewritten LF → CRLF. See the line-ending Major below.

## Change under review (`src/App.tsx`, ignoring CRLF)
- `handleLoginSuccess` (≈L185): calls `refreshAll()` after sign-in, so dashboards stop showing 0 until a manual reload.
- `handleLogout` (≈L189–200): clears `slots, employees, logs, allUsers, roles, sites, alertCount, pendingReqCount` and resets `currentSiteId` to `'ALL'`, so the next user never sees the previous user's data.

The intent is correct and helps site isolation (US-01). Server-side scoping still holds: `getRequestedSiteId` (server.ts:325) clamps to the session user's allowed sites, so the unscoped client fetches are not a new leak.

## Findings
| Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|
| Critical | src/components/App.tsx:7-39, 535, 547 | `npm run lint` **fails** (26 × TS2307/TS2322). The cause is an orphaned, stale copy of the root `App.tsx` sitting in `src/components/`. It imports `./types`, `./components/Header`, etc., which don't resolve from that folder. Nothing imports it. **This came before this change** (the file is unchanged vs HEAD), but it fails the step-4 gate, and the agent rules make lint failures Critical. | Delete `src/components/App.tsx` (dead code), or exclude it in `tsconfig.json`. Re-run `npm run lint`. | Open |
| Major | src/App.tsx:189-200 (with 119-265) | **Logout race can put the previous user's data back.** `handleLogout` clears state, but any `fetch*` still in flight from the old session (started by `refreshAll` on login, an action, or a periodic refresh) will resolve later and call `setSlots/setEmployees/setLogs/setAllUsers/...` with the **old user's site data**. Worse, `fetchUsers` can call `setCurrentUser(freshCurrent)` and write it back to localStorage, **logging the old user back in**. That is the exact cross-user exposure the comment says it prevents. | Guard every fetcher with a session generation. Use a `useRef` counter that is bumped on logout/login and captured before `await`, and drop results if it changed. Or use an `AbortController` stored in a ref and aborted in `handleLogout`. At minimum, `fetchUsers` must not call `setCurrentUser` when there is no signed-in user or the generation changed. | Open |
| Major | (26 files, whole working tree) | **Line-ending churn.** Every modified file except the `App.tsx` hunk was converted LF → CRLF. Committing this would rewrite ~16k lines, make `git blame`/review useless, and can break shell-executed files. `bun.lock` and `package.json` show as modified even though their content is unchanged. | Revert the whitespace-only files (`git checkout -- <files>` after confirming `git diff --ignore-cr-at-eol` is empty for them). Add a `.gitattributes` with `* text=auto eol=lf`. On Windows, set `core.autocrlf=input`. Commit only the `src/App.tsx` hunk. | Open |
| Minor | src/App.tsx:185 | **Stale closure.** `refreshAll()` runs inside the `handleLoginSuccess` closure, where `currentUser` is still `null`. So `fetchUsers` skips the "refresh my own record" step (L124-131), and the session keeps the login-response user object until the next refresh. | Harmless today, but take the user as a parameter (e.g. `fetchUsers(user)`), or trigger `refreshAll` from a `useEffect` keyed on `currentUser?.id`. That also covers session restore on reload. | Open |
| Minor | src/App.tsx:185 | Employee logins (`LoginScreen.tsx:185`, redirect `EMPLOYEE_MOBILE_APP`) now fire 8 admin-console requests (`/rbac/users`, `/rbac/roles`, `/logs`, …). These will 401/403 and fail silently on every employee sign-in. | Skip `refreshAll` for the employee redirect path, or refresh only what the role's modules need. | Open |
| Minor | src/App.tsx:285-287 | The mount-time `refreshAll()` still fires unauthenticated requests when nobody is signed in. That is the cause of the "shows 0" bug this change works around. | Gate the mount effect on `currentUser` (the fix in the first Minor above makes this natural). | Open |
| Minor | repo root | Three untracked dirs, `node_modules_broken_*`, `node_modules_partial_bun_*` and `node_modules_trash_*`, are not covered by `.gitignore` (`node_modules/` only) and could be committed by accident. There is also no `node_modules/`, so lint/build can't run locally as-is. | Remove them, or add `node_modules*/` to `.gitignore`. | Open |
| Minor | package-lock.json | `npm ci` fails: the lock is out of sync with `package.json` (missing `tesseract.js@5.1.1` + deps). This came before this change (HEAD regenerated only `bun.lock`). | Regenerate `package-lock.json`, or pick one package manager and delete the other lock. | Open |

## Build / lint
Run on a clean copy of the working tree with `npm install` (the local folder has no `node_modules`, and `npm ci` fails, see the last Minor above).
- `npm run lint` (tsc --noEmit): **FAIL**. All 26 errors are in `src/components/App.tsx` (the orphan file, which came before this change). No errors elsewhere, and none in `src/App.tsx`.
- `npm run build`: **PASS** (web vite build, server esbuild bundle and mobile vite build all succeed).

## Notes for next roles
- QA: acceptance for this fix is: (a) sign in → counts show without a reload; (b) sign in as Site Admin A → sign out → sign in as Site Admin B → at no point does B see A's slots/logs/users; (c) the same sequence with a slow network while a refresh is in flight. This is where the logout-race Major shows up.
- Security: please confirm every `/api/v1/*` read route used by `refreshAll` is behind auth middleware. `getRequestedSiteId` returns the raw client value when `req.user` is absent (server.ts:328).

## Verdict: CHANGES REQUESTED
1 Critical (the lint gate; came before this change) and 2 Major (the logout race, the CRLF churn) are open. Loop back to step 4 (round 1 of 3).
