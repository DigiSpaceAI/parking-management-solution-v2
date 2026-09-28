# Release Plan — ParkFlows Platform v1 (001-parkflows-platform-v1)
Author: devops · Date: 2026-09-25 · Base: `main` @ `d42af6f` (= `origin/main`), plus uncommitted working-tree changes

## Gaps found in inputs
1. **Steps 2–7 have not run.** The feature folder contains only `01-prd.md` (status READY FOR APPROVAL, not yet approved). There is no `02-ux-design.md`, `03-tech-design.md`, `04-implementation-notes.md`, `05-code-review.md`, `06-test-report.md` or `07-security-review.md`. Per `CLAUDE.md`, step 8 cannot pass without them: there is no approved scope to release, no code review, no test evidence and no security sign-off.
2. **The P0 launch blocker is not in this codebase.** `KNOWN_ISSUES.md` says the site-isolation fix lives in commit `2472379`. That commit **does not exist in this clone** (`git cat-file` → "Not a valid object name"), and `src/App.tsx` has no `withSite()` helper — `fetchSlots()` still calls `/api/v1/slots` with no `siteId` (line ~219). Releasing `main` today would ship the same cross-site leak that is live on admin.parkflows.in. AC-01..AC-06 cannot pass.
3. **Lint gate fails.** `npm run lint` → exit 2, 24 errors, all in a stray duplicate `src/components/App.tsx` (tracked since `1959578`) whose imports use `./components/...` paths relative to the wrong folder. The real `src/App.tsx` is fine; this file looks like an accidental upload. Removing it is a builder task (step 4), not DevOps.
4. **`package-lock.json` is out of sync with `package.json`.** `npm ci` fails: `tesseract.js@5.1.1` and 9 transitive deps are missing from the lock. `bun.lock` *does* contain them (regenerated in `d42af6f`). Cloud Build installs with Bun so production deploys are not affected today, but anyone using npm gets an unpinned install. Violates the "keep both lockfiles in sync" rule.
5. **Working tree is noisy.** 27 files show as modified, but with `--ignore-cr-at-eol` only **`src/App.tsx` (+16 lines)** is a real change — the other 26 are CRLF/LF line-ending churn from the Windows checkout (no `.gitattributes`, `core.autocrlf` unset). Also untracked: `.claude/`, `CLAUDE.md`, `docs/`, and three leftover folders `node_modules_broken_*`, `node_modules_partial_bun_*`, `node_modules_trash_*` plus `npm_install_verbose*.log` — these must never be committed.
6. **Deployment config is not in the repo.** No `cloudbuild.yaml`, `Dockerfile`, `firebase.json` or `.firebaserc` is tracked; the Cloud Build trigger and Firebase Hosting rewrite for admin.parkflows.in live only in GCP. The rollback steps below therefore use the Console / `gcloud` and must be confirmed against the real setup.
7. **Mobile identity mismatch.** `capacitor.config.ts` in this repo still has `appId: 'ai.parkos.parkflow.attendant'` and `appName: 'ParkFlow Attendant'`, while the chosen Play Store ID is `in.parkflows.attendant` and the brand is "ParkFlows". The shipping Attendant app lives in a separate local folder; which source is authoritative for Android must be decided (PRD OQ-2).

## Build result
Run on 2026-09-25 in a clean scratch copy of the working tree (no `node_modules`, `dist`, `.git`), Node 22.23.2, npm 10.9.8, Linux x64. (Bun is not available in that shell, so this does not reproduce Cloud Build's `bun install` byte-for-byte.)

| Step | Command | Result |
|---|---|---|
| Install (frozen) | `npm ci` | **FAIL** — lockfile out of sync (gap 4) |
| Install | `npm install` | OK — 430 packages, deprecation warnings only (`uuid@7/9`, `node-domexception`) |
| Type check | `npm run lint` | **FAIL** — 24 × TS2307/TS2322, all in `src/components/App.tsx` (gap 3) |
| Build | `npm run build` | **PASS** (exit 0) |

Build output:
- `dist/` web: `index-*.js` 606.5 kB (148.8 kB gzip) — **over Vite's 500 kB chunk warning**; `AttendantMobileApp` 62.6 kB, `EmployeeMobileApp` 46.8 kB, CSS 93.0 kB.
- `dist/server.cjs` 209.6 kB (+ sourcemap 432.8 kB).
- `dist-mobile/`: `mobile-*.js` 316.3 kB (98.1 kB gzip), `index.html` renamed OK.

## Config / env / Firestore changes
| Area | Change in this release | Action |
|---|---|---|
| Env vars (`.env.example`) | None (line endings only) | Confirm Cloud Run already has `AUDIT_HMAC_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD` (Secret Manager), `GEMINI_API_KEY`, `APP_URL`, `FIREBASE_*`. `SEED_DEMO_USERS` **must be unset/false** in prod. |
| `firestore.rules` | None | — |
| Firestore indexes | None (no `firestore.indexes.json` in repo) | If the isolation fix adds `where('siteId','==',…)` + `orderBy` queries, composite indexes will be needed — architect must list them in 03. |
| Firebase settings / Hosting | None | — |
| `package.json` | None (line endings only) | — |
| `bun.lock` | None (line endings only) | — |
| `package-lock.json` | **Out of sync** | Regenerate with `npm install --package-lock-only` on a branch; commit with the release. |
| Deployment config | None | — |
| Data migration / back-fill | None known for the current diff. The isolation fix may need a `siteId` back-fill on legacy docs — to be defined in 03-tech-design. User has already accepted losing pre-existing log history. |

## Deployment steps
**Do not start until the verdict below is READY TO RELEASE.** DevOps does not push or deploy; these are for the user.

Pre-flight
1. Confirm steps 1–7 are PASS in `docs/team/review-log.md`.
2. On branch `feature/001-parkflows-platform-v1`: add `.gitattributes` (`* text=auto eol=lf`) and renormalise so only real diffs remain; delete the `node_modules_*` leftovers and `npm_install_verbose*.log` (or add them to `.gitignore`).
3. `bun install --frozen-lockfile && npm ci && npm run lint && npm run build` — all four green on a clean clone.
4. Note the currently serving Cloud Run revision (rollback target):
   `gcloud run revisions list --service <SERVICE> --region <REGION> --limit 3`
5. Export a Firestore backup before any data change:
   `gcloud firestore export gs://<BACKUP_BUCKET>/pre-001-$(date +%Y%m%d-%H%M)`

Release
6. Open a PR from the feature branch → `main`; merge after review.
7. The push to `main` fires the existing Cloud Build trigger (Bun install → build → Cloud Run). Watch the build in Cloud Build → History.
8. If the tech design adds indexes/rules: deploy **indexes first**, wait until they are "Enabled", then rules — before traffic shifts to the new revision.
9. If a `siteId` back-fill is specified: run it once against prod after the backup, log counts before/after.
10. Confirm the new revision is at 100% traffic and admin.parkflows.in serves it (hard refresh; check new asset hash in `index.html`).

## Post-deploy smoke checks (per role, per site)
Sites: **Alphatech** (only real prod site) and **Tech Park HQ (`site-1`)**. Use the Alphatech Site Admin test account plus a Master Admin.

| # | Role | Site | Check | Expected |
|---|---|---|---|---|
| S1 | Any | — | `GET /` and an authenticated `GET /api/v1/slots?siteId=<alphatech>` | 200; no 5xx in Cloud Run logs for 10 min |
| S2 | Master Admin | All → Alphatech → site-1 | Switch site; open Live Slots, Inventory Master, Logs, Reports | Counts change per site; no stale rows (AC-04) |
| S3 | Site Admin | Alphatech | Open Live Slots, **Inventory Master**, Employees, Logs, Alerts, Registrations, Reports, header counts | Only Alphatech records (AC-01) — Inventory Master is the known leak |
| S4 | Site Admin | Alphatech | Call `/api/v1/slots`, `/employees`, `/logs` with no `siteId` and with `siteId=site-1` | Alphatech only, or 403 (AC-02) |
| S5 | Site Admin | Alphatech | Sign out → sign in as a different user | No previous-user data flashes (today's `App.tsx` change); data loads without manual refresh |
| S6 | Attendant | Alphatech | Record entry, then exit, for a test plate | Slot Occupied then Vacant ≤ 5 s on web; log shows Alphatech |
| S7 | Employee | Alphatech | Open app, view pass status | Own pass only |
| S8 | Master Admin | — | Security audit → verify chain | Chain valid; S6 entry/exit present |
| S9 | Any | — | Cloud Run logs | No `AUDIT_HMAC_SECRET` fallback warning; no demo-user seeding |
| S10 | Site Admin/Attendant | Alphatech | Sign in with current passwords | Still valid after deploy (previously reported reverting) |

## Rollback plan
- **Trigger:** any S2–S4 failure (data leak), S1 5xx spike, or S6/S7 failure.
- **App:** shift 100% traffic back to the revision recorded in pre-flight step 4 —
  `gcloud run services update-traffic <SERVICE> --region <REGION> --to-revisions <PREV_REVISION>=100` (≈1 min, no rebuild). Then `git revert` the merge commit on `main` so the next push does not redeploy the bad build.
- **Firestore rules/indexes:** redeploy the previous `firestore.rules` from the prior commit (`firebase deploy --only firestore:rules`). Extra indexes can stay — they are harmless.
- **Data:** if a back-fill ran and must be undone, import the pre-flight export (`gcloud firestore import gs://<BACKUP_BUCKET>/pre-001-…`). Note this also discards any transactions written after the export — decide with the user before running.
- **Mobile:** none for this release (see below).
- **Owner/comms:** user (Atique) executes; notify Alphatech site contact if S3/S4 showed cross-site data during the window.

## Mobile release needed? (Y/N)
**N for the current diff** — no real changes under `src/mobile` or `capacitor.config.ts` (line endings only). The mobile bundle builds (`dist-mobile` OK).
**Likely Y once the isolation fix lands**, if it changes `src/mobile/api.ts` / `siteContext.ts`: then rebuild in Android Studio, test on the emulator against Alphatech, bump `versionCode`, and publish under `in.parkflows.attendant`. Resolve gap 7 (which source/appId ships) first.

## CHANGELOG entry
```
## [Unreleased] — ParkFlows Platform v1
### Fixed
- Web console now reloads all data right after sign-in, so pages no longer show 0 until a manual refresh.
- Signing out now clears the previous user's slots, employees, logs, users, roles, sites, alert and pending counts, and resets the site context, so the next user never sees them.
### Pending (not yet in this release)
- Site-level data isolation across all screens and APIs (KNOWN_ISSUES; PRD US-01, AC-01..06).
### Build / tooling
- (to do) Regenerate package-lock.json to match package.json (tesseract.js).
- (to do) Remove stray src/components/App.tsx that breaks `npm run lint`.
- (to do) Add .gitattributes to stop CRLF churn.
```

## Verdict: NOT READY
Reasons:
1. PRD not approved and steps 2–7 (UX, tech design, implementation, code review, QA, security) have not run — no review, test or security evidence exists.
2. The P0 blocker (site isolation, AC-01..06) is not present in the code; commit `2472379` is not in this repository.
3. `npm run lint` fails (24 errors, stray `src/components/App.tsx`).
4. `package-lock.json` is out of sync with `package.json` (`npm ci` fails).

`npm run build` passes, and the only real code change (`src/App.tsx`, refresh on login / clear on logout) is low-risk — if you want it live sooner, send it as a small fix through code-reviewer (CLAUDE.md rule 7) and ship it separately.
