# Release Plan — ParkFlows Platform v1, Phase 1 (Option A, Alphatech) · 001-parkflows-platform-v1
Author: devops · Step 8 · **Revision 3: 2026-10-01 (go-live)**. Updates Revision 2 (29 Sep pre-launch checks); that evidence is kept below.
**Code under release: `f8a3753`** on `feature/001-parkflows-platform-v1` (= review-approved `712d74d` + QA tests/docs; `git diff 712d74d f8a3753` touches no file under `src/`, `server.ts`, `package.json`, `bun.lock` or the Vite configs, checked).
Production today: `main` @ `d42af6f` on Cloud Run service **`parking-management-solution-v2-git`**, region **`asia-south1`**, project number **`430896008903`**. The project id is probably `digi-parking-pms` (per `firebase-applet-config.json`); confirm it in step P0.
Inputs read: `01-prd.md` Addendum A (R4, R5, R7, R11) · `03-tech-design.md` v1.0.1 (Migration & backward compatibility, K1–K8, `SITE_SCOPE_MODE`) · `04` · `05` (round 5 APPROVED @ `712d74d`) · `06` (FAIL as tested; User decision: BUG-1, BUG-4 deferred) · `07` (SIGNED OFF — conditional; User decision; Go-live configuration checks; Notes for next roles).

**Re-check 2026-10-02 (devops):** the step-8 task was re-run. Inputs are unchanged since Revision 3: branch head `f8a3753`, and `06`/`07` are not modified since 1 Oct. **No checklist result, no `PREVIOUS_REVISION`, no R7 result and no review-log entry for a deploy are recorded.** So, as far as the repo shows, Phase 1 has **not** gone live yet. The plan below still applies as written; launch is now 2 Oct or later. The verdict is unchanged.

## Gaps found in inputs
1. **The R5 dry run (29 Sep) has no recorded result.** The "Dry-run results" fields from Revision 2 are still empty, and the review log has no entry for it. So Cloud Build has **not yet been seen** building the branch. **Deploy path B** (below) closes this: it builds and starts the new revision with **0% traffic** before any user reaches it. R5/K7 is verified locally (Bun ≥ 1.4 passes, < 1.4 fails); the Cloud Build Bun version is checklist item f.
2. **R11 and K2 have no recorded result** (Revision 2 checks 2 and 3). Both are checklist items (i, e) with a pass rule and a decision rule.
3. **BUG-1 will almost certainly reproduce in production.** In the build of `f8a3753`, `dist-mobile/index.html` loads `/assets/mobile-*.js` from the site root. The server serves `dist-mobile` only under `/attendant` (`server.ts` L2834), and `dist/assets/` has no `mobile-*` file. `main` (live today) has the same setup (`server.ts` L2150 at `d42af6f`), so **`/attendant` is probably blank in production already today.**
   - If so, Alphatech gate staff are recording entries some other way right now: the web console, or an installed APK.
   - **Which one decides K2** (item e). Ask before go-live.
4. **Not covered by any earlier role, and affects every deploy and rollback today** (Revision 2 gaps 2–3, still true at `f8a3753`):
   - **(a) A sign-in rewrites the whole database from one server's memory.** Login and about 30 other `saveDB()` calls make a debounced **full rewrite of every Firestore collection** from the instance's in-memory copy (`src/server/db.ts` `syncStoreToFirestore`). Two revisions or instances running at once can revert each other's writes. This is likely the cause of the Alphatech passwords reverting after deploys.
   - **(b) The server answers requests before Firestore has loaded** (`server.ts` `startServer`: `app.listen` first, then `bootstrapFirestore()` in the background). A sign-in in those first seconds would full-sync a store that holds only seeded accounts.
   - **Controls today (procedure only, no code or config change):**
     - Deploy in a **quiet window**.
     - **Nobody signs in until the new revision logs `[firestore] Loaded existing data from Firestore.`**
     - Wait **2 minutes** after the traffic switch.
     - Make the **role/domain changes after cutover, on the new revision** (items a, b, d).
     - **Re-check them 10 minutes later** (P3-5).
   - The lasting fix is a first-patch item (#6). `max-instances=1` would reduce the risk, but it is a Cloud Run config change that isn't in the approved design (rule 5), so it's listed as **a decision for the user** only.
5. **R7 backups are unknown.** No backup, PITR or export config is visible from the repo. This is item 3, recorded as an open risk until the user confirms.
6. **Uncommitted docs on the branch.** `05`, `07`, `08` and `review-log.md` are modified and not committed. They don't affect the build. They should be committed with the release record when the user asks.

---

## Build result
Run on 2026-10-01 in a clean clone of **`f8a3753`**, outside the working copy. Bun 1.4.2, Node 22, Linux x64. `FIREBASE_PROJECT_ID` / `GOOGLE_*` / ADC unset (BUG-8 safety); `SITE_SCOPE_MODE` unset (strict).

| Step | Command | Result |
|---|---|---|
| Install | `bun install --frozen-lockfile` | **PASS**: 416 packages; `bun.lock` (lockfileVersion 2) unchanged |
| Type check | `npm run lint` | **PASS** (exit 0) |
| Build | `npm run build` | **PASS** (exit 0). `dist/assets/index-*.js` 595.7 kB (146.7 kB gzip; Vite's >500 kB chunk warning only), `dist/server.cjs` 232.6 kB, `dist-mobile/assets/mobile-*.js` 288.8 kB |
| Tests | `npm run test:qa` | **117 tests: 102 pass, 15 fail**, as expected. The 15 are exactly the Phase 2 list in `06`: FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27. Same as the security re-run. |

**R5 / K7 evidence (29 Sep, kept).** `bun install --frozen-lockfile` on this `bun.lock` with each Bun version:

| Bun | Result |
|---|---|
| 1.2.23, 1.3.13, 1.3.14 | **FAIL**: `Unknown lockfile version` → `lockfile had changes, but lockfile is frozen` |
| 1.4.0, 1.4.2 | **PASS**, lock unchanged |

The Cloud Run Node.js buildpack detects `bun.lock`. With no `packageManager`/`engines.bun` set it uses the **latest stable Bun** (Google buildpacks docs), which is 1.4.2 as of 29 Sep. `bun.lock` is the only lockfile (T0d), so K7 is closed in favour of Bun. A Bun pin (T0f) is suggested, not approved.

## Config / env / Firestore changes
| Area | Change (`f8a3753` vs `main`) | Go-live action |
|---|---|---|
| `SITE_SCOPE_MODE` | **New**, optional. Unset = `strict`; `fallback` = kill-switch | Leave **unset** unless item e says `fallback` |
| `AUDIT_HMAC_SECRET` | **Now required on Cloud Run.** The server exits with `Refusing to start` without it (B11) | Item e |
| `BOOTSTRAP_ADMIN_PASSWORD` | Unchanged behaviour (unset = random Master password) | Item e |
| `SEED_DEMO_USERS` | Must not be `true` | Item e |
| `FIREBASE_PROJECT_ID` | Must stay set. Without it the server starts on demo data, and BUG-8 can write that data over production (S7-4) | Item c |
| `firestore.rules` / indexes | **None** (deny-all; queries run in memory) | — |
| Data back-fill | **None** by design. `migrate-site-data` only if R11 finds strays | Item i |
| Live data / config changes (no deploy) | Role matrix: ALERTS canEdit off on Site Facility Manager (S7-1). Domain whitelist: real Alphatech domain(s) in, 5 demo domains out (S7-3). | Items a, b |
| Lockfiles / repo | `package-lock.json` removed, `bun.lock` only, `.gitattributes`, `test:qa` script | — |
| Cloud Run / Cloud Build config | **None** | — |

---

## Release checklist — 1 Oct
**Owners:**
- **User** = you, as Platform Master Admin and GCP project owner.
- **Site Admin (A)** = the Alphatech Site Admin account. The user can sign in as it, or ask the Alphatech admin to.
- **Devops** = prepared here. Every cloud and console action is the user's (see "Actions only you can do").

**Go/no-go rules:**
- Items **a, c, d, e** and the **startup-log part of g** are **hard gates**. The 07 conditions depend on them; if one fails, do not open to Alphatech (07: "the verdict reverts to BLOCKED").
- Items **b, f, h, i** have stated fallbacks.

Fill the **Result** column as you go.

| # | Item | Owner | When | How to verify (pass rule) | Result |
|---|---|---|---|---|---|
| **a** | **S7-1 control** (07 User decision, conditions 1–3). In the Module Permission Matrix, **ALERTS → Edit = off** on *Site Facility Manager*, and on every other role a non-Master holds that has ALERTS Edit. Masters don't press **"Run cutoff scan"** until the first patch ships. | User (Master) | After cutover (P3-2), before opening to Alphatech | 1. The role matrix shows ALERTS Edit off on every non-Master role (script V1 lists any left).<br>2. Signed in as **Site Admin (A)**: `POST /api/v1/alerts/trigger-cron` → **403** (script V2).<br>3. As Site Admin (A), Non-Parked Alerts → "Run cutoff scan" shows an error and no list.<br>4. Re-check 2 at P3-5 (+10 min). **Pass = 403 both times.** | ☐ |
| **b** | **S7-3 / BUG-4 ops step.**<br>1. Add Alphatech's real email domain(s) **for the Alphatech site**.<br>2. **Then** remove the five demo platform-wide domains: `company.com`, `corp.org`, `techfirm.com`, `enterprise.io`, `parkos.ai`.<br>3. **Never leave the list empty**: add first, then remove. An empty list re-seeds the demo domains.<br>4. Site Admins must not treat "Domain Authenticated" as identity proof. | User (Master). **Domain given by user (1 Oct): `parkflows.in`**. Note: that is ParkFlows' own domain. If Alphatech employees use another email domain, add it too, or their self-registration will be refused once the demo domains are gone. | After cutover (P3-3) | `GET /api/v1/domains?siteId=<ALPHATECH_ID>` (no sign-in) returns **only** `parkflows.in` (plus any real platform-wide ones you keep), and none of the five. The Employee Registration form at Alphatech lists the same. Re-check at P3-5. **Fallback:** if Alphatech's domain isn't known today, keep the demo domains; S7-3 then stays as accepted in 07 (Medium; Site Admin approval is the control). Record it. | ☐ |
| **c** | **S7-4 / BUG-8.** `FIREBASE_PROJECT_ID` is set on the Cloud Run service (and stays set) | User | P0-3 (before deploy) and P2-3 | P0-3 command shows `FIREBASE_PROJECT_ID=<project id>`. The new revision's log has `[firestore] Loaded existing data from Firestore.` and **not** `Initializing fresh 1,080 slots database inventory...`. **Pass = both.** | ☐ |
| **d** | **S7-5 / R4-1 / R4-2 control.** No non-Master account holds **MASTER_CONFIG** or **USER_MANAGEMENT**, through a role or a per-user override. | User (Master) | P3-4 | Script V1 prints `S7-5 OK` (no role with either module enabled other than Platform Master Admin; no user with a `true` override for either). Otherwise it lists the role or user; fix in User & RBAC, then re-run. | ☐ |
| **e** | **Secrets and modes (R4, K2, K8).** `AUDIT_HMAC_SECRET` and `BOOTSTRAP_ADMIN_PASSWORD` set. `SEED_DEMO_USERS` not `true`. `SITE_SCOPE_MODE` **unset** (strict), unless K2 needs `fallback`. | User | P0-3 (before deploy) | P0-3 command lists the env var / secret **names** (not values): both secrets present, `SEED_DEMO_USERS` absent or `false`, `SITE_SCOPE_MODE` absent.<br>**K2 decision rule (Revision 2 check 3):**<br>1. Ask how Alphatech gate staff record entries today (gap 3).<br>2. Run the P0-5 log query.<br>3. If there are no real-device `; wv)` hits, or only the `in.parkflows.attendant` build (it sends `x-site-id`): **keep strict**.<br>4. If an unknown or older APK is in use: set `SITE_SCOPE_MODE=fallback` at P2-6. | **K2 (user, 2 Oct): Alphatech gate = Android app only.** Code check done (see "K2 result" below): the `in.parkflows.attendant` build is compatible with strict. **Strict stays, pending one check on a gate phone** (app name/package). Secrets ☐ |
| **f** | **Build and deploy (R5/K7).** Cloud Build installs with **Bun ≥ 1.4** and `--frozen-lockfile`. lint / build / test:qa as recorded. | Devops (local, done); user (Cloud Build) | P0-4 and P2-1 | Local: lint PASS, build PASS, test:qa **102/117** with the 15 Phase 2 failures (Build result, **done**). Cloud Build: the build log shows bun **1.4.x or later** and a successful `bun install --frozen-lockfile`. **If the Bun version is < 1.4: stop.** Production keeps serving; T0f (pin) needs approval. | Local ✅ · Cloud ☐ |
| **g** | **Post-deploy smoke (S9 and the rest).** | User | P2-3 (logs), P3-6 (smoke) | **Logs (hard gate):**<br>- `Loaded existing data from Firestore.` present.<br>- **None of:** `[SECURITY WARNING] AUDIT_HMAC_SECRET is not set`, `Refusing to start`, `Initializing fresh 1,080 slots`, `Load failed`, `[site-scope] SITE_SCOPE_MODE=fallback` (unless chosen in e), `BOOTSTRAP_ADMIN_PASSWORD is not set`.<br>**Functional:** the table in "Post-deploy smoke checks". Required at minimum: Site Admin (A) sees only Alphatech; **400** without a site; **403** for another site; view-as is read-only. | ☐ |
| **h** | **BUG-1.** Open `https://admin.parkflows.in/attendant/` once. | User | P3-7 | Page renders the sign-in → **OK**. Page is blank (expected, gap 3) → **give the Alphatech team the fallback** before they start:<br>- Sign in to the web console as a site user with gate rights (`MOBILE_APP` Create: *Site Facility Manager* or *Gate Security Attendant* at Alphatech).<br>- **Entry / Exit Logs → Record Manual Entry** for entries, and **Process Exit Checkout** for exits.<br>Record which way it went. | ☐ |
| **i** | **R11 data readiness.** Alphatech's slots, employees and registrations carry Alphatech's `siteId`. | User (Master); Alphatech Site Admin for the physical count | **P0-2, before deploy** (current production returns all sites when no site is given) | Script R11 (below): every Alphatech row counts under Alphatech's site id, and nothing Alphatech-owned is under `(no siteId -> site-default)` or `UNKNOWN`. The slot count matches the site. **If strays:**<br>- Use `migrate-site-data` **only** if *every* `site-default` record is Alphatech's (it moves all 8 collections).<br>- Run it **after** cutover and the 2-min drain, then re-run the script.<br>- Otherwise those records stay invisible to the Site Admin; fix them per record in the first patch. | ☐ |

### Deployment steps (in order)
**Quiet window:** no gate traffic at Alphatech; the Alphatech Site Admin is told. Allow 45 minutes.

**P0 — before deploy (production unchanged, read-only)**
1. **P0-1 Rollback target.** Record the revision serving 100% (command C1). **Recorded 2 Oct (user): `PREVIOUS_REVISION = parking-management-solution-v2-git-00123-g9q`, traffic = 100% "to latest".**
   **"To latest" matters:**
   - `--no-traffic` in P1 is still safe. gcloud first pins the current traffic to `-00123-g9q` by name, so the new revision gets 0%.
   - But that pin **stays**. P2-5 therefore uses `--to-latest`, which sends 100% to the new revision **and** restores "to latest". Without it, later GitHub-trigger deploys would build but never receive traffic.
2. **P0-2 R11** (item i). **Result 2 Oct, user, R11 script on production: PASS.**
   - **Alphatech site id = `site-1787676715259`** (code `IND-PNQ-001`). Use it for `<ALPHATECH_ID>` in V2 and in the `/domains` check.
   - Slots: **1,080**, all `site-1787676715259`.
   - Employees: **151**, all `site-1787676715259`.
   - Registrations: **0**.
   - **No `site-default`/no-siteId rows and no UNKNOWN site ids.** No migration needed.
   - The other 5 sites (`site-1`…`site-4`, `site-1789004286777` "Test") hold no slots or employees.
   - Physical slot count still to be confirmed by the Alphatech Site Admin (1,080 matches `KNOWN_ISSUES.md`).
3. **P0-3 Env / secrets** (items c, e): command C2.
4. **P0-4 Last Cloud Build Bun version** (item f): command C3.
5. **P0-5 K2** (item e): **answered 2 Oct: Android app only.** Still to do: on one gate phone, open Settings → Apps and check the app is **"ParkFlows Attendant"**, package **`in.parkflows.attendant`**, version **1.0**. If it's different, use `fallback`. C4 is optional (it shows which devices call the API).
6. **P0-6 Backup** (R7, item 3): run command C5 (state) and C6 (on-demand export). **Wait for the export to finish** before deploying.

**P1 — build and start the new revision with 0% traffic (Path B, recommended because the dry run has no result)**
1. Clean source **in Cloud Shell** (2 Oct; `gcloud` isn't on the PC, and the branch isn't pushed):
   - Upload `pf-f8a3753.bundle` from the repo folder: Cloud Shell `⋮` → **Upload**. It's a git bundle of the branch at `f8a3753`, verified 2 Oct; delete it from the repo folder afterwards.
   - Then run: `git clone -b feature/001-parkflows-platform-v1 ~/pf-f8a3753.bundle ~/pf-release && cd ~/pf-release && git log -1 --oneline`. It must show `f8a3753`.
   - Run the deploy **only from `~/pf-release`**.
   - **2 Oct incident:** the deploy was run once from `~` (the Cloud Shell home folder). The build failed (build `187f1116-…`), so no revision was created and traffic is unchanged. The uploaded archive of `~` should be checked and deleted (see the chat on 2 Oct).
2. `gcloud run deploy parking-management-solution-v2-git --source . --region asia-south1 --no-traffic --tag golive --update-secrets=AUDIT_HMAC_SECRET=audit-hmac-secret:latest`. Other env vars are inherited from the service. **The secret must exist first** (P0-3 result).
3. Note the new **revision name** and the **tagged URL**.

**P2 — checks on the 0% revision (no sign-in on it)**
1. **P2-1** Build log: Bun ≥ 1.4 and frozen install OK (command C3 on the new build). If not, **stop**: delete the tag (C9). Production is untouched.
2. **P2-2** Signed-out probes on the tagged URL (command C7): `/` 200 · `/api/v1/slots` 401 · `/api/v1/domains` 400.
3. **P2-3** Startup log of the new revision (command C8): the item c and item g log rules. Fail → C9, stop.
4. **P2-4** Go/no-go to switch traffic: **user decides**.
5. **P2-5** Switch traffic:
   - `gcloud run services update-traffic parking-management-solution-v2-git --region asia-south1 --to-latest`
   - then `gcloud run services update-traffic parking-management-solution-v2-git --region asia-south1 --remove-tags golive`
   - Confirm with C1: 100% on `<NEW_REVISION>`, "latest".
   - Before this, make sure no other revision newer than `<NEW_REVISION>` exists (C1 `latestReadyRevisionName` = `<NEW_REVISION>`).
6. **P2-6** Only if item e said so: `gcloud run services update parking-management-solution-v2-git --region asia-south1 --update-env-vars SITE_SCOPE_MODE=fallback`. This makes a new revision with no rebuild. Re-check its startup log (C8).

**P3 — after cutover, before opening to Alphatech**
1. **P3-1** **Wait 2 minutes**; nobody signs in. Then check C8 on the serving revision again for `Loaded existing data`.
2. **P3-2** Item **a**: role matrix change, then script V2 as Site Admin (A) → 403.
3. **P3-3** Item **b**: domains (add, then remove).
4. **P3-4** Item **d**: script V1.
5. **P3-5** **10 minutes later**, re-check a (V2 → 403), b (`/domains`), and that Site Admin (A) and an Alphatech attendant can still sign in with their current passwords. This catches a revert from an overlapping instance (gap 4).
6. **P3-6** Smoke table (item g).
7. **P3-7** Item **h** (`/attendant/`). Hand over the fallback if it's blank.
8. **P3-8** **Go-live**: tell Alphatech they can start. Record the time.

**P4 — main branch (when you ask; not done by devops)**
- Merge `feature/001-parkflows-platform-v1` → `main` (PR) and push.
- **Note:** the GitHub trigger will **rebuild and deploy the same code at 100%**, creating another revision and another overlap (gap 4). Do it in the next quiet window, and repeat P2-3, P3-1 and P3-5.
- **Alternative, Path A** (only if you have a green Cloud Build of this branch from the 29 Sep dry run): skip P1–P2 and deploy by merge + push. The P0 and P3 steps stay the same.

### Commands and scripts (copy-paste)
**Where to run them (2 Oct):** `gcloud` is **not installed** on the release PC (PowerShell: `gcloud` not recognized).
- **P0, P2 and P3 commands:** use **Cloud Shell** (console.cloud.google.com → the `>_` icon, top right). It's already signed in and has `gcloud`. Cloud Shell is bash, so use `grep -i` instead of `findstr /i`, `curl` instead of `curl.exe`, and `/dev/null` instead of `NUL`.
- **P1 deploy:** needs the local source of `f8a3753`, and the branch isn't pushed. So **install the Google Cloud SDK on the PC** (`winget install Google.CloudSDK`, then reopen PowerShell, `gcloud init`), **or** push the branch when you decide and deploy from a Cloud Shell clone.
- **Order matters:** P2-5 (switch traffic / remove the `golive` tag) only applies **after** P1 has created the tagged revision.

Replace `<…>`. Windows `cmd`. Run `gcloud config set project <PROJECT_ID>` first. The project id is probably `digi-parking-pms`; check with `gcloud projects list --filter="projectNumber=430896008903"`.

- **C1** serving revision:
  `gcloud run services describe parking-management-solution-v2-git --region asia-south1 --format="yaml(status.traffic,status.latestReadyRevisionName)"`
- **C2** env names (look for the names only; don't paste values anywhere):
  `gcloud run services describe parking-management-solution-v2-git --region asia-south1 --format="yaml(spec.template.spec.containers[0].env)"`
  Expect `FIREBASE_PROJECT_ID` (value = project id), `AUDIT_HMAC_SECRET` and `BOOTSTRAP_ADMIN_PASSWORD` (value or `valueFrom.secretKeyRef`). `SEED_DEMO_USERS` absent or `false`. `SITE_SCOPE_MODE` absent.
- **C3** Bun version in Cloud Build:
  `gcloud builds list --region=asia-south1 --limit=5` (if empty, drop `--region`), then `gcloud builds log <BUILD_ID> --region=asia-south1 | findstr /i "bun frozen lockfile"`.
- **C4** K2, Android WebView traffic in the last 14 days:
  `gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"parking-management-solution-v2-git\" AND httpRequest.userAgent:\"; wv)\"" --freshness=14d --limit=50 --format="table(timestamp,httpRequest.userAgent,httpRequest.requestUrl)"`.
  Emulators show `sdk_gphone` / `Android SDK built for`.
- **C5** Firestore backup state:
  - `gcloud firestore databases describe --database="(default)" --format="yaml(pointInTimeRecoveryEnablement,deleteProtectionState,versionRetentionPeriod)"`
  - `gcloud firestore backups schedules list --database="(default)"`
- **C6** on-demand export, needs a bucket in the project:
  - `gcloud firestore export gs://<BACKUP_BUCKET>/pre-001-20261001`
  - Wait for `gcloud firestore operations list` to show it **SUCCESSFUL**.
- **C7** signed-out probes:
  - `curl.exe -s -o NUL -w "%{http_code}\n" <TAG_URL>/`
  - `curl.exe -s -o NUL -w "%{http_code}\n" <TAG_URL>/api/v1/slots`
  - `curl.exe -s -o NUL -w "%{http_code}\n" <TAG_URL>/api/v1/domains`
- **C8** startup log of a revision:
  `gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.revision_name=\"<REVISION>\"" --freshness=1h --limit=200 --format="value(timestamp,textPayload)"`
- **C9** abandon the 0% revision:
  - `gcloud run services update-traffic parking-management-solution-v2-git --region asia-south1 --remove-tags golive`
  - Optional: `gcloud run revisions delete <NEW_REVISION> --region asia-south1`

**Script R11** (item i). Run it on **today's production**, signed in as Master at https://admin.parkflows.in. DevTools → Console:
```js
(async () => {
  const t = sessionStorage.getItem('parkflow_session_token_fallback');
  const h = t ? { 'x-session-token': t } : {};
  const get = async (p) => { const r = await fetch(p, { headers: h, credentials: 'include' }); if (!r.ok) throw new Error(p + ' -> ' + r.status); return r.json(); };
  const sites = (await get('/api/v1/sites')).sites || [];
  const known = new Map(sites.map((s) => [s.id, s.siteName]));
  console.log('Sites:', sites.map((s) => `${s.id} = ${s.siteName} (${s.siteCode})`));
  const pick = (j) => (Array.isArray(j) ? j : j.slots || j.employees || j.requests || []);
  for (const [name, path] of [['slots', '/api/v1/slots'], ['employees', '/api/v1/employees'], ['registrations', '/api/v1/registrations']]) {
    const rows = pick(await get(path));
    const by = {};
    for (const r of rows) {
      const k = !r.siteId ? '(no siteId -> site-default)' : known.has(r.siteId) ? `${r.siteId} ${known.get(r.siteId)}` : `${r.siteId} (UNKNOWN site)`;
      by[k] = (by[k] || 0) + 1;
    }
    console.log(`${name}: ${rows.length} rows`); console.table(by);
  }
})();
```

**Script V1** (items a, d). Run on the **new** revision, signed in as Master, in DevTools → Console:
```js
(async () => {
  const t = sessionStorage.getItem('parkflow_session_token_fallback');
  const h = t ? { 'x-session-token': t } : {};
  const get = async (p) => { const r = await fetch(p, { headers: h, credentials: 'include' }); if (!r.ok) throw new Error(p + ' -> ' + r.status); return r.json(); };
  const roles = (await get('/api/v1/rbac/roles')).roles || [];
  const users = (await get('/api/v1/rbac/users')).users || [];
  const isMasterRole = (id) => id === 'role-master-admin';
  const on = (r, m, right) => !!(r.modulePermissions?.[m]?.enabled && (right ? r.modulePermissions[m][right] : true));
  const bad = [];
  for (const r of roles) {
    if (isMasterRole(r.id)) continue;
    if (on(r, 'ALERTS', 'canEdit')) bad.push(`S7-1: role "${r.roleName}" has ALERTS Edit`);
    for (const m of ['MASTER_CONFIG', 'USER_MANAGEMENT']) if (on(r, m)) bad.push(`S7-5: role "${r.roleName}" has ${m}`);
  }
  for (const u of users) {
    if (isMasterRole(u.roleId)) continue;
    const o = u.customModuleOverrides || {};
    for (const m of ['MASTER_CONFIG', 'USER_MANAGEMENT', 'ALERTS']) if (o[m] === true) bad.push(`override: ${u.email || u.username} (${u.roleName}) has ${m} = true`);
  }
  console.log(bad.length ? bad.join('\n') : 'S7-1 roles OK · S7-5 OK');
})();
```
An `ALERTS = true` override is listed so you can check it. It only matters if that user's role also has ALERTS Edit.

**Script V2** (items a, g). Signed in as **Site Admin (A)** on the new revision. Copy the token from DevTools → Application → Session Storage → `parkflow_session_token_fallback`, then:
- `curl.exe -s -w "\n%{http_code}\n" -X POST -H "x-session-token: <TOKEN>" -H "x-site-id: <ALPHATECH_ID>" -H "Content-Type: application/json" -d "{}" https://admin.parkflows.in/api/v1/alerts/trigger-cron` → **403**
- `curl.exe -s -o NUL -w "%{http_code}\n" -H "x-session-token: <TOKEN>" https://admin.parkflows.in/api/v1/slots` → **400** (no site)
- `curl.exe -s -o NUL -w "%{http_code}\n" -H "x-session-token: <TOKEN>" -H "x-site-id: <OTHER_SITE_ID>" https://admin.parkflows.in/api/v1/slots` → **403**
- `curl.exe -s -o NUL -w "%{http_code}\n" -H "x-session-token: <TOKEN>" -H "x-site-id: <ALPHATECH_ID>" https://admin.parkflows.in/api/v1/slots` → **200**

(curl is used because the console's fetch wrapper adds `x-site-id` automatically, `03` K3.)

## Post-deploy smoke checks (per role, per site)
Sites: **Alphatech** and one other site (e.g. Tech Park HQ `site-1`). Run them at P3-6 on the serving revision.

| # | Role | Site | Check | Expected |
|---|---|---|---|---|
| S1 | — | — | C8 log rules (item g); `GET /` | 200; no 5xx for 10 min |
| S2 | Master Admin | Alphatech → site-1 → All sites | Switch site on Live Slots, Inventory Master, Logs, Reports | Counts change per site. All sites is read-only (writes disabled) (AC-04) |
| S3 | Site Admin (A) | Alphatech | Every screen + header counts | Alphatech only (AC-01) |
| S4 | Site Admin (A) | Alphatech | Script V2 | 400 / 403 / 200 as listed (AC-02); `trigger-cron` 403 (S7-1) |
| S5 | Master Admin | — | User & RBAC → Role View Simulator → view as Alphatech Site Admin → try one write (e.g. edit a slot) | Banner shown; the write is refused (`ERR_VIEW_AS_READ_ONLY`); data shown is Alphatech only (AC-55) |
| S6 | Gate attendant on the **Android app** (signs in again after the deploy) | Alphatech | Site name shows in the app header; live slots load; entry then exit of a test plate | Slot Occupied → Vacant ≤ 5 s; log carries Alphatech |
| S7 | Employee (public form) | Alphatech | Registration form domain list | Item b result (AC-57) |
| S8 | Master Admin | — | InfoSec & Privacy Defense → audit log: S4's denials | `CROSS_SITE_ACCESS_DENIED` entries with `siteId` (AC-03) |
| S9 | Site Admin (A) + attendant | Alphatech | Sign in again at P3-5 (+10 min) | Passwords still valid (gap 4 regression) |

## P0-3 result (2 Oct): env on Cloud Run — **one hard gate FAILS**
Source: `gcloud run services describe … env`, run by the user in Cloud Shell. The Cloud Run project is **`gen-lang-client-0904006743`**. The service's env vars are:

| Variable | Found | Item | Result |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | `parkorbitv2direct` | c (S7-4) | **PASS**. Firestore lives in a **different project** (`parkorbitv2direct`) from Cloud Run, so the P0-6 backup commands need `--project=parkorbitv2direct`. |
| `BOOTSTRAP_ADMIN_PASSWORD` | set, as a **plain env value** (not Secret Manager) | e (R4) | **PASS (set)**, with a follow-up. The value was pasted into the release chat on 2 Oct and is visible to anyone with Cloud Run viewer access. **Change the Master Admin password after go-live has settled** (P3-5 or later), and move this variable to Secret Manager in the first patch. *The value is deliberately not recorded here.* |
| `AUDIT_HMAC_SECRET` | **absent** | e (R4, K8) | **FAIL, hard gate.** `03` K8 says "confirmed set by user, 28 Sep", but it isn't on the service. The current revision runs on the **public fallback key** (audit entries are forgeable). The new build **refuses to start** on Cloud Run without it (B11), so P2-3 would fail. Fix below **before P1**. |
| `SEED_DEMO_USERS` | absent | e | **PASS** |
| `SITE_SCOPE_MODE` | absent (= strict) | e / K2 | **PASS**; strict confirmed by the K2 result |

**Fix for `AUDIT_HMAC_SECRET` (user, Cloud Shell, before P1).** Create it in Secret Manager. The value is generated and stored without ever being shown:
```
gcloud config set project gen-lang-client-0904006743
gcloud services enable secretmanager.googleapis.com
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create audit-hmac-secret --data-file=- --replication-policy=automatic
SA=$(gcloud run services describe parking-management-solution-v2-git --region asia-south1 --format='value(spec.template.spec.serviceAccountName)')
[ -z "$SA" ] && SA="$(gcloud projects describe gen-lang-client-0904006743 --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
echo "$SA"
gcloud secrets add-iam-policy-binding audit-hmac-secret --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
```
- **Attach it only to the new revision:** add `--update-secrets=AUDIT_HMAC_SECRET=audit-hmac-secret:latest` to the **P1 deploy command**.
  - Don't attach it to the current revision. That would restart the old code for nothing (gap 4).
  - P2-3 then confirms there's no `Refusing to start` and no `[SECURITY WARNING] AUDIT_HMAC_SECRET` in the log.
- **Side effect (accepted):** audit entries written so far were signed with the public fallback key, so they had no tamper-evidence anyway. They may not verify against the new key. The hash chain is Phase 2 (AC-38).

## P1–P2 results (2 Oct) — new revision `parking-management-solution-v2-git-00125-juf`
- **P1 deploy (user, Cloud Shell, from `~/pf-release` @ `f8a3753`):** OK, 0% traffic, tag `golive`.
  - URL: `https://golive---parking-management-solution-v2-git-zjwybzul6q-el.a.run.app`.
  - Production stays 100% on `-00123-g9q`; traffic is now pinned by name, as expected.
  - Two earlier attempts ran from the Cloud Shell home folder and failed at build; no revision was created.
- **P2-1 / item f (R5/K7): PASS.**
  - Buildpack `google.nodejs.bun 0.1.0`: "Using exact version 1.4.2 for Bun"; frozen install OK.
  - Note: the runtime is **Node 24.19.0** ("Nodejs version not specified") while tests ran on Node 22. Low risk; pin `engines.node` in the first patch.
- **P2-3 / item c, g (startup log): PASS on the rules.**
  - `[firestore] Connected (project: parkorbitv2direct)`, then `Loaded 860 security audit log entries`, then `Loaded existing data from Firestore.`
  - **None of:** `Refusing to start`, the AUDIT_HMAC_SECRET warning, `Initializing fresh 1,080 slots`, `Load failed`, `fallback`. So the secret and `FIREBASE_PROJECT_ID` work.

- **P2-2 signed-out probes on the `golive` URL: PASS.** `/` 200 · `/api/v1/slots` 401 · `/api/v1/domains` 400 (C-1: site required).

- **P2-5 traffic switch (2 Oct, user):**
  - `--min-instances=1 --max-instances=1` created revision **`00126-t6t`** (05:40:14 UTC). Same image `sha256:707e0d26…` as `00125-juf`, with `AUDIT_HMAC_SECRET` from Secret Manager.
  - The first `--to-latest` therefore landed on `00126` before it had been checked, so traffic was pinned to `00125` while we checked.
  - `00126` startup: running 05:41:23, **`Loaded existing data` 05:44:29**, no warnings.
  - Then `--to-latest` again. **Live: 100% LATEST = `parking-management-solution-v2-git-00126-t6t`.** Tag `golive` removed.
  - **Rollback target is still `-00123-g9q`.**
- **P3 item a — S7-1 durable control (2 Oct, user as Master, browser console): PASS.**
  - Created custom role **`role-1790920354180` "Site Facility Manager – Alphatech"**: a copy of `role-site-manager`, ALERTS `canEdit:false`.
  - Moved the 3 non-Master users on `role-site-manager` to it: `alphatech.admin`, `techpark.admin`, Ananya Sharma (`prestige.com`). All 200.
  - Set ALERTS Edit off on `role-site-manager` as well (may reset on cold start; no users on it now).
  - Note: the UI's "Clone role" / "New custom role" buttons have no handler. The role was created via `POST /api/v1/rbac/roles` (Master only). First-patch item.
- **P3 V2 as `alphatech.admin` (incognito): PASS.**
  - `POST /alerts/trigger-cron` → **403**.
  - `/slots` no site → **400**; `site-1` → **403**; Alphatech → **200**.
  - Re-check at P3-5 (+10 min) and after any restart.
- **P3 item b — domains (2 Oct): PASS (with the accepted-by-procedure residual).**
  - Before: only `company.com` and `parkflows.in`, both platform-wide; the other 4 demo domains were already gone.
  - `parkflows.in` already covers Alphatech (adding it per site was refused as a duplicate).
  - **`company.com` removed (200).** After: `parkflows.in [all sites]` only; public `/domains?siteId=site-1787676715259` returns 1 domain.
  - `company.com` can be re-seeded on a cold start: re-check at P3-5 and after any restart until first-patch item 0 ships.
- **P3 item d — S7-5 / R4 (V1 per user, 2 Oct): PASS.** "S7-5 OK · S7-1 OK": no non-Master holds MASTER_CONFIG, USER_MANAGEMENT or ALERTS Edit (role or override).

- **P3 smoke S5 / S8 (Master console, 2 Oct): PASS.**
  - View-as `alphatech.admin`: Alphatech slots 200; `site-1` 403 `ERR_SITE_FORBIDDEN`; write 403 `ERR_VIEW_AS_READ_ONLY` (AC-55).
  - Audit has `CROSS_SITE_ACCESS_DENIED` for `GET /api/v1/slots` with `siteId=site-1`, actors Master (view-as) and `alphatech.admin` (AC-03).
- **PAUSED (2 Oct, user break until evening).**
  - Production **is serving the new code** (`00126-t6t`, 100% LATEST). Alphatech has **not** been told it's live.
  - Done: items a, b, c, d, e (secret), f, i, R7 export; smoke S4/S5/S8.
  - Open: S6 gate test on the Android app + app identity (K2); S2/S3 visual; P3-5 re-checks (V2 403, `/domains`, Site Admin/attendant sign-in); item h (`/attendant` open-once); go-live call.
  - Gate fallback if the app fails meanwhile: web console Entry/Exit Logs → Record Manual Entry / Process Exit Checkout, or `SITE_SCOPE_MODE=fallback`, or rollback to `-00123-g9q`.
- **After the break (2 Oct, user):** Master Admin and `alphatech.admin` checked in the console — "everything OK" (S2/S3).
  - **Still not confirmed:** S6 gate test on the Android app + app identity (K2); P3-5 re-checks (V2 403, `/domains` without `company.com`, attendant sign-in); item h (`/attendant/` open-once).
  - Next per the user: **urgent hotfix (first-patch item 0)**, then commit the release docs.
  - Hotfix route (CLAUDE.md): backend-dev builds → code-reviewer (short review) → QA test → devops deploys with the same 0%-traffic procedure.
- **GitHub `main` / trigger history (2 Oct, user's Cloud Build console + `git fetch`):**
  - The GitHub trigger `cloudrun-parking-management-solution-v2-git-asia-south1-…` builds in **`europe-west1`**. Successful builds took **35 → 57 min**, growing from 10 Sep to 24 Sep. ~1-min builds are most likely failures.
  - Today's source deploy in `asia-south1` took a few minutes. The cause of the long trigger builds is not yet known; step timings are needed.
  - **GitHub `main` is 2 commits ahead of the local `origin/main` (`d42af6f`):**
    - `feff495` (24 Sep 07:09 IST): the 16-line `src/App.tsx` refresh-on-login / clear-on-logout change. Its 57-min build is most likely what **`-00123-g9q` (the rollback target)** runs. The release branch already contains this behaviour, superseded by F2.
    - `9e9483d` (24 Sep 07:25 IST): a BUG-1 attempt in `vite.mobile.config.ts`. It adds `base: '/attendant/'` but **deletes the imports** (`defineConfig`, `react`, `tailwindcss`, `path`), so the build breaks: the ~1-min build. **`main` is currently unbuildable.**
  - **P4 (merge to `main`) must handle both:**
    - take the release branch's `src/App.tsx`;
    - keep the full `vite.mobile.config.ts`, and add `base: '/attendant/'` properly in the first patch (BUG-1), not via this commit.
    - Until then, **no pushes to `main`**: any push triggers a build of broken or old code.
- **Observations for later:**
  - Demo-looking accounts are ACTIVE in production: Ananya Sharma, Suresh Kumar, Rajesh Malhotra, Ramesh Gowda. Review and suspend if unused.
  - `alphatech.admin`'s email is `@parkflow.in` (missing "s").
### New finding (P2-3): every cold start rewrites the default roles, the bootstrap Master and `company.com` into Firestore
**What the log shows:**
- 05:24:31 `[initDB] … seeding accounts only`.
- About 3 s later, a **full-store sync** started. It failed at 05:25:56 with `DEADLINE_EXCEEDED`.
- Data finished loading only at **05:29:46, five minutes after start.** CPU is throttled with no requests.

**What the code does** (`src/server/db.ts` ~L1165–1200, *also on `main` @ `d42af6f`, so this is pre-existing*):
- `initDB` builds a store holding only `getDefaultRolesAndUsers()` (the 5 default roles, the bootstrap Master) and `dom-1 company.com`.
- It then calls `saveDB()` → `syncStoreToFirestore` (`set … merge:true`).

**Consequences:**
1. **Any change to a *default* role is reset on the next cold start where that sync succeeds.** That includes **item a** (ALERTS Edit off on *Site Facility Manager* = `role-site-manager`). The S7-1 control as written in `07` is **not durable**.
2. **`company.com` (`dom-1`) is re-activated as a platform-wide domain** on such a start. Item b can't be made durable for that one domain.
3. The bootstrap Master account is reset to its seeded fields (password = `BOOTSTRAP_ADMIN_PASSWORD`).
4. Until `Loaded existing data` appears (minutes when idle), the instance serves an almost empty store: non-Master sign-ins fail, and screens are empty.
5. This likely also explains the earlier "settings / passwords revert after deploys" reports. The 05:25:56 sync timed out, so it **may or may not** have committed. Nothing had been configured yet, so there's nothing to lose today.

**Durable controls for today (no code change; user decides):**
- **Item a, revised (durable S7-1 control).**
  1. In User & RBAC, **create a custom role** (custom roles are not re-seeded), e.g. *"Site Facility Manager – Alphatech"*. Give it the same rights as *Site Facility Manager* **except ALERTS Edit = off**.
  2. **Move every non-Master user on *Site Facility Manager* to it.**
  3. Also turn ALERTS Edit off on *Site Facility Manager* (belt and braces; it may reset).
  4. Verification: V2 (Site Admin gets 403) at P3-2 **and** P3-5, and after any restart. V1 shows the default role still "has" ALERTS Edit; that's acceptable only if **no non-Master user is assigned to it**.
  - This meets `07` condition 1's intent (no non-Master holds ALERTS Edit) with a durable mechanism. The **user** confirms that acceptance (security reviewer to note).
- **Item b, revised:** add `parkflows.in` for Alphatech; remove the 4 non-seeded demo domains (`corp.org`, `techfirm.com`, `enterprise.io`, `parkos.ai`) and `company.com`.
  - **Accept** that `company.com` can return as platform-wide on a cold start (S7-3 residual, Medium; Site Admin approval stays the control). Re-check `/domains` at P3-5.
- **Reduce cold starts (recommended; a Cloud Run setting not in the approved design, so the user decides):**
  - `gcloud run services update parking-management-solution-v2-git --region asia-south1 --min-instances=1 --max-instances=1` keeps one warm instance. Fewer cold-start resets, no multi-instance overwrite (gap 4), and no 5-minute empty window after idle.
  - Cost: one always-on instance.
  - Run it **after** the traffic switch, so it creates a revision of the new code. It's a new revision with no rebuild: re-check its startup log.
- **Warm-up rule:** after any (re)start, nobody signs in until `Loaded existing data from Firestore.` appears for that revision. During the wait, `curl` the URL every few seconds to give the instance CPU.

**User decisions (2 Oct):**
1. **Durable S7-1 control (custom role): AGREED.**
2. **`--min-instances=1 --max-instances=1`: YES.** Applied *before* the switch, so the new code runs as one warm instance (`update` creates a new revision; traffic stays pinned to `-00123-g9q` until `--to-latest`).
3. **`company.com` residual: NOT accepted.**
   - No ops step can stop the cold-start re-seed; only the code fix (first patch item 0) can.
   - **Control until then:** min-instances=1 makes restarts rare. After **every** deploy or restart, check `/domains?siteId=site-1787676715259` and remove `company.com` again if it's back.
   - Production today already lists all five demo domains, so the switch doesn't make this worse.
   - **Item 0 becomes an urgent hotfix (target: next working day).**
4. **Gate-phone app:** not yet checked. Strict mode stays on. The S6 gate test right after the switch is the check; if gate calls fail with 400, use the kill-switch (`SITE_SCOPE_MODE=fallback`).
5. **Timing:** switch now; attendants warned.

**First patch, item 0 (before S7-1):**
- Remove the `saveDB()` in `initDB`'s Firestore branch (and never full-sync before `bootstrapFirestore` finishes).
- Answer 503 until data is loaded.
- Pin `engines.node`.

## Hotfix deploy (2 Oct) — commit `98c7fcc` (hotfix `deab529`, `c30a947`; review APPROVED, QA PASS)
**Pre-deploy (devops, clean clone of `98c7fcc`, Node 22.23.2, Bun 1.4.2): PASS.**
- `bun install --frozen-lockfile`: OK, 416 packages, lock unchanged (`package.json`/`bun.lock` identical to `f8a3753`).
- `npm run lint`: 0. `npm run build`: 0 (`server.cjs` 233.7 kB).
- `test:qa`: **127 tests, 112 pass.** Run per file, because the cold-start tests outlast the 3-min shell limit:
  - `001-backend` 64/64;
  - `001-hotfix-coldstart` 6/6;
  - `001-platform-v1` 42/57. The 15 failures are exactly FLOW-03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27 (known Phase 2).
- Bundle for Cloud Shell: `pf-98c7fcc.bundle` (repo root, untracked, verified; head `98c7fcc`).

**Deploy steps (user, Cloud Shell, project `gen-lang-client-0904006743`), one at a time:**
1. Upload `pf-98c7fcc.bundle`.
   - Then: `git clone -b feature/001-parkflows-platform-v1 ~/pf-98c7fcc.bundle ~/pf-hotfix && cd ~/pf-hotfix && git log -1 --oneline` → must show `98c7fcc`.
2. `gcloud run deploy parking-management-solution-v2-git --source . --region asia-south1 --no-traffic --tag hotfix`.
   - The secret, env and min/max instances are inherited from the service template.
   - If it hangs at "Creating revision" because of max-instances=1, re-run with `--max-instances=2`. That's safe: the new code no longer writes at start.
3. Checks on the new revision:
   - Build log: Bun ≥ 1.4.
   - Startup log: **no `[firestore] Sync` line before `Loaded existing data`**; no warnings.
   - `curl <TAG_URL>/api/v1/health` → `ready:true`.
   - Signed-out probes: `/` 200, `/api/v1/slots` 401, `/api/v1/domains` 400.
4. Data-unchanged check after the new revision's cold start (the proof the fix works):
   - `role-site-manager` and `role-1790920354180` ALERTS canEdit still `false`;
   - `/domains?siteId=site-1787676715259` = `parkflows.in` only.
5. Quiet moment, then `update-traffic --to-latest` → 100% on the new revision. Remove the `hotfix` tag.
6. After the switch:
   - `/health` ready;
   - V2 as `alphatech.admin` (trigger-cron 403; site checks 400/403/200);
   - Site Admin and attendant can sign in with their current passwords;
   - re-check step 4 after 10 min.
7. **Rollback:** `update-traffic --to-revisions parking-management-solution-v2-git-00126-t6t=100` (launch code, pre-hotfix); then `-00123-g9q` if needed. Data snapshot: `gs://parkorbitv2direct-backups/pre-001-20261002`.
8. **Follow-ups from review:**
   - H-1 log text;
   - H-2 tests;
   - H-3: add an alert for `/health` `ready:false` > 5 min (Cloud Monitoring uptime check). The user decides; this is a cloud config change.

### Hotfix deploy results (3 Oct, user in Cloud Shell)
- **Deploy:** first attempt ran from the Cloud Shell home folder after a session reset (build `eab53478`, FAILURE, no revision). Retried from `~/pf-hotfix` @ `98c7fcc`: build `d7e4cdff` OK → **`00132-ket`** (image `sha256:4e0325f9…`), 0%, tag `hotfix`.
- **Revisions:** the numbering jumped (no `00127`–`00131` exist), and no unknown revision ever served traffic. Production was still `00126-t6t` (pinned) at the time of the check.
- **`00132` startup: PASS — the fix is proven in production.**
  - `Connected` 04:58:34 → `[initDB]` 04:58:34 → running 04:58:35 → `Loaded existing data` **04:59:27**.
  - **No sync line before load** (2 Oct's old code synced right after `[initDB]`). Load took 53 s, against 5 min on 2 Oct.
- **Probes on the `hotfix` URL:**
  - `/health` `ready:true` (1,080 slots, 196 occupied, 151 employees);
  - `/` 200, `/slots` 401, `/domains` 400.
- **Finding:** public `/domains?siteId=Alphatech` showed **`company.com` + `parkflows.in`**.
  - The **old code (`00126`) must have cold-started since 2 Oct** and re-seeded `dom-1`. It also most likely reset `role-site-manager` (ALERTS Edit back on) and the bootstrap Master.
  - The S7-1 control should hold, because no user is on `role-site-manager` (custom role `role-1790920354180`). **To verify (V1).**
  - `company.com` is to be removed once after the switch (04 hotfix note).
- **Switch (user chose "now", gate busy):**
  - `services update --update-labels=reload=20261003a` created **`00128-gtt`** (hotfix image `4e0325f9…`, 05:04:15 UTC), 0%, so it would load fresh data at switch time.
  - Then `--to-latest`. **Live: 100% LATEST = `00128-gtt`.** Tag `hotfix` removed.
- **Post-switch health (05:14:40 UTC, via admin.parkflows.in): `ready:true`**, 1,080 slots / 196 occupied / 151 employees, the same as on `00132`. So no data was lost in the switch.
- **PAUSED (user break) before:**
  - `/health` ready + `00128` startup log;
  - remove `company.com`;
  - V1 (S7-5/S7-1 OK);
  - V2 as `alphatech.admin`;
  - +10 min re-checks;
  - docs commit.
  - **Rollback:** `--to-revisions parking-management-solution-v2-git-00126-t6t=100` (launch code), then `00123-g9q`.

## K2 result (2 Oct)
**Alphatech's gate runs on the Android app only** (user, 2 Oct). `/attendant` (BUG-1) is therefore not the gate tool. The console fallback (item h) stays as the backup if the app fails.

Checked against `f8a3753`, read-only, using the app source in `Downloads\attendant\attendant\attendant` (`in.parkflows.attendant`, the only Android project on this PC; debug APK built 22 Sep):
- **Routes:** every route the app calls exists on the new server: `/auth/login`, `/auth/me`, `/auth/logout`, `/my-sites`, `/slots`, `/employees`, `/vehicles/entry`, `/vehicles/exit`, `/slots/change`.
- **Site:** the app reads `/my-sites` → `{sites}` (the same shape the server returns) and then sends `x-site-id` on **every** call (`apiFetch`). Request bodies carry no `siteId`. So strict mode accepts it.
- **Sign-in:** cookie `__session` (HttpOnly, SameSite=None) is unchanged. CORS still allows `https://localhost` / `capacitor://localhost`.
- **Permissions:** entry/exit need `MOBILE_APP` Create and slot change needs `MOBILE_APP` Edit. *Gate Security Attendant* and *Site Facility Manager* have both.

**What attendants will notice:**
- In-memory sessions reset on deploy, so **every attendant signs in once more** after cutover. Tell them before P2-5.
- The app has **no M1 blocking screen**. If `/my-sites` fails right after sign-in, the app continues **without** a site, and strict mode answers 400 to every gate call. The app shows errors, but nothing is written to the wrong site.
  - Fix on the phone: sign out and sign in again.
  - If it persists for everyone: use the kill-switch (Rollback, option 1) **or** the console fallback (item h).

**Remaining check (user, before P2-5):** confirm on one gate phone that the installed app is "ParkFlows Attendant" / `in.parkflows.attendant` / 1.0.
- If it is → **keep strict**.
- If it's a different or older app (e.g. "ParkFlow Attendant", `ai.parkos…`, ParkOrbit) → set `SITE_SCOPE_MODE=fallback` at P2-6. Its site behaviour hasn't been checked.

**Phase 2 note:** the gate phones run a **debug-signed** build. A Play Store (release-signed) build can't update it in place; the phones will need an uninstall and reinstall.

## Rollback plan
**Who decides:** the **user** (Platform Master Admin / project owner). Devops recommends; the user runs the commands.

**Triggers:**
- Any other site's data on an Alphatech screen (S2–S4).
- The item a 403 fails and can't be fixed in the role matrix within 15 minutes.
- A 5xx spike, `Load failed`, or `Initializing fresh 1,080 slots` in the logs.
- Gate entry/exit impossible both in `/attendant` **and** in the console fallback.

**Before P2-5 (new revision at 0%):** C9. Production never changed.

**Option 1 — kill-switch** (when the only problem is a client that sends no site, e.g. an unknown APK getting 400 `ERR_SITE_REQUIRED`):
- `gcloud run services update parking-management-solution-v2-git --region asia-south1 --update-env-vars SITE_SCOPE_MODE=fallback`
- This creates a **new revision with no rebuild**; all other Phase 1 fixes stay.
- Check C8 for `[site-scope] SITE_SCOPE_MODE=fallback`.
- Undo: `--remove-env-vars SITE_SCOPE_MODE`.

**Option 2 — full rollback** to `PREVIOUS_REVISION` = **`parking-management-solution-v2-git-00123-g9q`** (recorded 2 Oct):
1. Quiet moment: ask Alphatech to pause gate entries for 5 minutes.
2. `gcloud run services update-traffic parking-management-solution-v2-git --region asia-south1 --to-revisions parking-management-solution-v2-git-00123-g9q=100`
   This **pins** traffic. Any later deploy gets 0% until someone runs `--to-latest` again; that's intended after a rollback, so a broken build can't take traffic by itself.
3. Wait 2 minutes before anyone signs in (gap 4). Check C8 on `PREVIOUS_REVISION`.
4. If P4 was already done, revert the merge on `main` before the next push.
5. Re-check that Site Admin (A) and the attendant can sign in.

**What rollback means:**
- The old code **re-opens the known cross-site leak** (no site isolation) and the H1–H9 holes. So rollback is for an outage, not for minor bugs.
- **Role matrix and domain changes stay** (they're data). ALERTS Edit off and the real domain list are safe on the old code too.

**Rules / indexes:** none changed, nothing to revert.

**Data:**
- No shape change; audit entries with `siteId` are harmless to the old code.
- If `migrate-site-data` was run: reverse it (`toSiteId` → `fromSiteId`).
- Restoring the P0-6 export (`gcloud firestore import gs://parkorbitv2direct-backups/pre-001-20261002 --project=parkorbitv2direct`) is a last resort. It **discards every write after the export**; the user decides.

## Backups (R7)
**Status: OPEN RISK, confirmed 2 Oct: no PITR, no backups, no delete protection.** Nothing in the repo shows Firestore PITR, scheduled backups or exports.
- **To close it today:** C5 shows `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED`, **or** a backup schedule exists, **and** the C6 export finished at P0-6.
- **If neither is available:** record "no backup" here, and the go-live proceeds only on the user's explicit acceptance.
- **Recommendation (first patch, needs user/architect OK):** enable PITR and a daily backup schedule.

**P0-6 result (2 Oct, user, Cloud Shell; Firestore project `parkorbitv2direct`): NO BACKUP OF ANY KIND.**
- `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED`
- `deleteProtectionState: DELETE_PROTECTION_DISABLED`
- `backups schedules list` → 0 items

So today there is no way to undo a bad write: a full-store sync revert (gap 4), BUG-8 demo data, or a wrong `migrate-site-data`.

**Recommended before P1 (user decides and runs; Cloud Shell):**
```
gcloud config set project parkorbitv2direct
gcloud firestore databases describe --database="(default)" --format="value(locationId)"
# 1) PITR: 7 days of minute-level recovery, from now on
gcloud firestore databases update --database="(default)" --enable-pitr
# 2) Delete protection: the database can't be deleted by mistake
gcloud firestore databases update --database="(default)" --delete-protection
# 3) Daily managed backup kept 7 days (no bucket needed)
gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=7d
# 4) On-demand export right before the deploy (bucket in the same location as the database)
gcloud storage buckets create gs://parkorbitv2direct-backups --location=<LOCATION_ID from line 2>
gcloud firestore export gs://parkorbitv2direct-backups/pre-001-20261002
gcloud firestore operations list --limit=3   # wait for SUCCESSFUL
```
- Commands 1–3 need billing enabled on the project, and add a small storage cost.
- PITR and the schedule only protect from the moment they're turned on, so **command 4 is the snapshot that covers the deploy**.
- If the export fails (e.g. billing), record it here and decide explicitly (verdict condition 3).

Result (2 Oct, user):
- **Export ✅ SUCCESSFUL**: `gs://parkorbitv2direct-backups/pre-001-20261002`, 04:59:17 → 05:00:01 UTC, **4,288 documents** (~2.4 MB).
  - Operation `projects/parkorbitv2direct/databases/(default)/operations/ASAxM2U0Y2I1ODY4NmEtNTZiYS0xMjk0LWVmMWQtMzhiYmRiN2YkGnNlbmlsZXBpcAkKMxI`.
  - **This is the rollback data snapshot**: Rollback → Data → `gcloud firestore import gs://parkorbitv2direct-backups/pre-001-20261002 --project=parkorbitv2direct`.
  - It doesn't contain writes made after 05:00 UTC.
- **Schedule ✅ exists**: `schedules create` returned `ALREADY_EXISTS` (daily).
- **PITR ☐ and delete protection ☐ unconfirmed.** The last output showed `versionRetentionPeriod: 3600s`, which suggests PITR is still off. Re-check with the `describe` command in P0-6.
- **R7 / verdict condition 3: MET by the export.** PITR and delete protection are follow-ups, not blockers.

## Mobile release needed? (Y/N)
**N.** Phase 1 is the web console plus the `/attendant` web portal (Option A). No APK is published. The only APK on this PC is a debug build of `in.parkflows.attendant` (22 Sep), which calls production and sends `x-site-id` (Revision 2 check 3). Its use at Alphatech is decided by item e. Phase 2 brings a release-signed APK.

## First patch after launch (ordered)
| # | Item | Owner | Done when |
|---|---|---|---|
| 1 | **S7-1 fix**: `trigger-cron` scoped by `resolveSite`, per-site scan/replace/return, mobile masked, audit actor = `req.user`, plus a test (Site Admin A → 0 foreign rows; Site B alerts unchanged). Then a **short code review** and the QA browser check. **Then restore ALERTS Edit** on Site Facility Manager (item a in reverse) and tell Masters the scan is usable again. | backend-dev → code-reviewer → QA → user | Review PASS, deployed, 403 control lifted |
| 2 | **BUG-1**: `/attendant` blank as served (`vite.mobile.config.ts` `base: '/attendant/'` or a server route for its assets), plus QA re-run of the served page | frontend/mobile-dev → QA | `/attendant/` renders in production |
| 3 | **BUG-4 code fix**: remove the seed list so an empty whitelist stays empty; OTP/email verification next | backend-dev | Demo domains can't come back |
| 4 | **S7-2**: session token in URL → short-lived single-use download token; drop `?token=` from `extractSessionToken` | backend + frontend | Export works without `?token=` |
| 5 | **S7-6**: end all of a user's sessions on password, role, site or suspension change | backend-dev | Repro returns 401 |
| 6 | **Devops-raised (gap 4):** login and other full-store syncs; requests served before Firestore load; BUG-8 (`getFirestoreDb()` returns `null` without a project id). Also decide `max-instances=1` and PITR (R7). | architect → backend-dev; user for Cloud Run settings | Design note + fix |
Also from 07: S7-5 code fix (Master-only `/invoices/status`, `/sites/onboard`), S7-7..S7-15 → P2-8.

## Actions only you can do (console / GCP) — not done by devops
| # | Action | Where / how | Item |
|---|---|---|---|
| U1 | Record the serving revision | C1 | P0-1, rollback |
| U2 | Run the R11 script on production as Master; get the physical slot count from the Alphatech Site Admin | admin.parkflows.in → DevTools → Console | i |
| U3 | Check env and secrets | C2 (Cloud Run console alternative: Cloud Run → `parking-management-solution-v2-git` → Revisions → serving revision → Variables & Secrets) | c, e |
| U4 | Check the Bun version in Cloud Build | C3 (Cloud Build → History → build → log, search "bun") | f |
| U5 | K2: ask how the Alphatech gate works today; run C4 | — | e |
| U6 | Backups: C5, C6 | Firestore → Disaster recovery (console) | R7 |
| U7 | Deploy at 0%, check, switch traffic, remove the tag | P1, P2 | f, g |
| U8 | Role matrix: **User & RBAC → Module Permission Matrix** → select *Site Facility Manager* → **Non-Parked Alerts (ALERTS)** row → untick **Edit** → **Save**. Repeat for any other non-Master role V1 lists. | admin.parkflows.in (Master) | a |
| U9 | Domains: **Master Site Config** → *Allowed email domains* panel. With **Alphatech** chosen in the header site switcher, **Add** `parkflows.in` (labelled "This site"). Then switch to **All sites** and **Remove** `company.com`, `corp.org`, `techfirm.com`, `enterprise.io`, `parkos.ai` (labelled "All sites"). | admin.parkflows.in (Master) | b |
| U10 | Fix any MASTER_CONFIG / USER_MANAGEMENT holder that V1 lists: role → Module Permission Matrix; user override → **User Directory & Site Scopes** → user → module overrides | admin.parkflows.in (Master) | d |
| U11 | Script V2 as Site Admin (A); smoke S1–S9; `/attendant/` check; hand over the gate fallback if needed | — | a, g, h |
| U12 | Go-live call to Alphatech; later P4 merge/push when you choose | — | — |

## CHANGELOG entry (draft)
```
## [1.0.0] — 2026-10-01 — ParkFlows Platform v1, Phase 1 (Alphatech)
### Security / data isolation
- Every list, report, export and write is scoped to a site on the server; requests without a site are refused (strict mode; env kill-switch SITE_SCOPE_MODE=fallback).
- /sites returns only the caller's sites; audit logs are Master-only and record the targeted site.
- Public /domains needs a site and returns domain names only; admins use /domains/manage. Per-site employee email domain whitelist.
- Non-Masters can't raise privileges, take over or delete privileged or other-site accounts, or re-point account emails across sites; custom roles are Master-only.
- Registration duplicate checks are per site; bulk registration upload can't touch another site's requests.
- Server refuses to start on Cloud Run without AUDIT_HMAC_SECRET.
### Web console
- Site switcher with remembered site; "All sites" is read-only; stale data is dropped on site switch and logout.
- Role View Simulator is read-only and enforced on the server.
### Attendant portal
- Blocks with "Couldn't load your site" instead of falling back to a default site.
### Known issues (accepted for this release)
- S7-1: "Run cutoff scan" (POST /alerts/trigger-cron) is not site-scoped. Disabled for non-Masters via the role matrix; Masters must not run it. Fix in the first patch.
- BUG-1: /attendant may load blank; use Entry / Exit Logs → Record Manual Entry / Process Exit Checkout.
- BUG-4: demo email domains are re-seeded if the whitelist is ever empty.
- Gate admits any plate as VISITOR (Phase 2); token in export URL (S7-2); sessions survive password change (S7-6).
### Tooling
- bun.lock is the only lockfile (Bun >= 1.4); .gitattributes; `npm run test:qa`.
```

## Verdict: READY TO RELEASE — conditional on the 1 Oct checklist
**Why READY:**
- The release checklist (items a–i) and the rollback plan are written.
- **Every pre-go-live condition from `07` has an owner, a time and a verification step:**
  - S7-1 conditions 1–3 → item a (+ P3-5 re-check);
  - condition 4 → first patch #1;
  - S7-3 → item b;
  - S7-4 → item c;
  - S7-5 / R4 → item d;
  - S9 log check → item g;
  - BUG-1 open-once → item h.
- The code under release (`f8a3753`) builds clean: lint PASS, build PASS, test:qa 102/117 with exactly the accepted Phase 2 failures. `bun.lock` installs frozen on Bun ≥ 1.4.

**Conditions — go-live (P3-8) does not happen unless:**
1. Items **a, c, d, e** pass, and the item **g** log rules pass. A failure in a, c or d makes the `07` sign-off revert to BLOCKED.
2. Item **f** (Cloud Build): if Bun < 1.4, stop before traffic.
3. The R7 backup is confirmed, **or** you record that you accept going live without one.

**Carried as known risks:**
- S7-1 residual (`07`), BUG-1 (fallback ready), BUG-4 / S7-3 if no real domain is available.
- Gap 4 (full-store sync on login), managed by the quiet window, the no-sign-in-before-load rule and the P3-5 re-check.
- R11 strays, if any, handled as in item i.

None of the checklist results are filled in yet. Devops has not deployed, changed cloud settings, or touched the live role matrix.
