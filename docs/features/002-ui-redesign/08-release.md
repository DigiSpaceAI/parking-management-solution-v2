# Release Plan — 002 UI redesign · R1a marketing site parkflows.in (+ 001 → main merge)
Author: devops · Date: 2026-10-08 · Step 8 (prep). **Production deploy waits for code review r3, QA r3 and the user's go.**
Scope of this file: (a) merging 001 into `main`, (b) `.gitignore` (QA O-4), (c) D1: what carries over from today's parkflows.in, the Firebase Hosting config, and the preview deploy of `dist-marketing/` with the demo form flag OFF.
Read: 002 `01-prd.md` v1.3 (R1a, AC-30, NFR-1/2), `03-tech-design.md` v1.2 ("Marketing site parkflows.in", D1, rule-5 approval of `firebase.json` + `.firebaserc`), `05`/`06` (O-4, gap 14), review log (frontend round 2 @ `83402a2`); 001 `08-release.md`.

## Gaps found in inputs
1. **The `website` folder is empty.** `C:\Users\ADMIN\website` has no files (last changed 2 Jan 2026). 03 Q-1 assumed it was the parkflows.in source, so there's no source to carry over. The live site's content couldn't be read from here either (the fetch failed to connect), so the carry-over list below comes from DNS and from what our own code expects on parkflows.in.
2. **`parkflows.in` has no MX record, so `sales@parkflows.in` can't receive email.** The R1a contact panel (`/demo/`, footer) offers that address as its main way to book a demo. **Blocker for R1a going live.** Owner: user.
3. **Today's parkflows.in is not on Firebase.**
   - DNS is at GoDaddy (`ns53/ns54.domaincontrol.com`).
   - The apex and `www` resolve to `3.33.130.190` / `15.197.148.33`: GoDaddy's hosting / forwarding / parked-page front end.
   - `www` is a CNAME to the apex.
   - Moving the site is a DNS change at GoDaddy, not just a Firebase deploy.
4. **admin.parkflows.in is Firebase Hosting site `gen-lang-client-0904006743`** (CNAME `gen-lang-client-0904006743.web.app`) in project **`gen-lang-client-0904006743`**, the same project as Cloud Run, not `parkorbitv2direct`.
   - Its hosting config, with the Cloud Run rewrite, still isn't in the repo (001 `08` gap 6).
   - The prepared `firebase.json` contains **only the marketing target**, so deploys must always use `--only hosting:marketing` until the admin config has been exported and added (command below).
5. **Our own apps expect `https://parkflows.in/privacy` and `/terms`.** `src/mobile/LegalModal.tsx` says so, and the Attendant app's `PRIVACY_POLICY.md` / `TERMS_OF_SERVICE.md` are meant for those URLs (Play Store requirement).
   - The new site has `/privacy/` as a *website* privacy note (the demo request), not the app policy, and **has no `/terms/`**.
   - Not needed for R1a (no Play Store submission yet), but **needed before the Android release (R2)**. PM decision.
6. **D1 files are prepared, not committed:** `docs/features/002-ui-redesign/d1/firebase.json` and `.firebaserc`.
   - I didn't commit to `feature/002-design-system`. Frontend-dev moves that branch from its own clone, and an extra commit there would make their next update non-fast-forward.
   - **Move both files to the repo root in the D1 commit** (03 lists D1 as a backend task).
7. **`feature/002-design-system` is based on old `main` (`d42af6f`), not on the merge.** R1a (marketing only) can deploy from it as it is. R1b (console) needs a rebase onto `84ec8ef`.
8. **Untracked files in the working copy** (checkout = `feature/001-parkflows-platform-v1`):
   - `docs/features/002-ui-redesign/` (newer than the branch copy) and `tests/qa/002/`: other roles' 002 work. Left untouched.
   - Bundles and `pf-marketing-83402a2.tar.gz`: never commit. The tarball isn't covered by `.gitignore`; delete it after the preview.

---

## (a) Merge 001 into `main` — DONE LOCALLY, NOT PUSHED
| Step | Result |
|---|---|
| Uncommitted 001 docs → 001 branch | **`fda6501`**: 001 `05` (CR r3–r5 + hotfix review), `07` (security sign-off), `08` (go-live and hotfix deploy) and the **40 review-log lines for 001** only. The 34 lines for 002 stay uncommitted. |
| `.gitignore` → 001 branch | **`a0f804c`**: `dist-mobile/`, `dist-marketing/` (QA O-4) and `*.bundle` (05 gap 14) |
| Reconcile GitHub `main` | `origin/main` = `9e9483d` (2 commits after `d42af6f`, made on GitHub on 24 Sep). Merge built in a separate clone with `--no-ff`. Two conflicts, both resolved with the 001 version: |
| · `feff495` `src/App.tsx` | Refresh after sign-in / clear on sign-out. **Superseded** by 001 (F2: `clearSession` + `resetSiteStore`, effect-driven loading). Took 001's file. |
| · `9e9483d` `vite.mobile.config.ts` | Added `base: '/attendant/'` but **deleted the imports** (`tailwindcss`, `react`, `path`, `defineConfig`), so `main` couldn't build. **Kept 001's complete file.** The `/attendant` base path (BUG-1) needs a reviewed fix that also keeps the Capacitor build working, so it isn't taken here. |
| Merge commit | **`84ec8ef`**. Its tree is identical to `feature/001-parkflows-platform-v1` @ `a0f804c` (checked: `git diff` is empty). |
| Checks on `84ec8ef` (clean clone, Node 22.23.2, Bun 1.4.2) | `bun install --frozen-lockfile` OK, lock unchanged · `npm run lint` 0 · `npm run build` 0 (build output ignored) · `test:qa` **127 / 112 pass**: backend 64/64, hotfix cold-start 6/6, platform 42/57 with exactly the 15 known Phase 2 FLOWs (03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27). Run per file because of the shell time limit. |
| Local `main` | Updated to **`84ec8ef`** (fast-forward from `d42af6f`). 61 commits ahead of `origin/main`, 0 behind, so **the push needs no force**. Checkout unchanged. |

**Before you push `main` (only on your confirmation):**
- **A push to `main` starts the GitHub Cloud Build trigger** (`cloudrun-parking-management-solution-v2-git-asia-south1-…`, region **europe-west1**). That took **35–57 min** per build (001 `08`).
- It **deploys at 100%** (the service is in "to latest" mode), at a time you don't control, with a cold start. The cold start is safe since the hotfix, but the gate gets 503 for about a minute, and a sign-in right after the switch carries the overwrite risk (001 `08` gap 4).
- **Recommended:**
  1. In Cloud Build → Triggers (region europe-west1), **disable the trigger**.
  2. Push from your PC: `git push origin main`.
  3. Re-enable the trigger later, in a quiet window, when you *want* `main` deployed. The live code (`00128-gtt`) already equals `main`.
- Alternatively, push in a quiet window, let it deploy, and check `/health` `ready:true`, the custom role, `company.com` and V2 as after the hotfix.
- A 57-min build is close to Cloud Build's default 60-min timeout, so check the trigger's timeout or find the slow step (001 `08`).

## (b) `.gitignore` — DONE (`a0f804c`, on 001, so it's in `main`)
`dist-mobile/`, `dist-marketing/`, `*.bundle` added. The 002 branch gets it when it's rebased onto `main`.

## (c) D1 — parkflows.in hosting
### What must carry over from today's parkflows.in
| Item | Today | Carry-over / action | Owner | When |
|---|---|---|---|---|
| Registrar + DNS | GoDaddy (`domaincontrol.com`) | Stays at GoDaddy; only records change | user | cutover |
| Apex `parkflows.in` | A `3.33.130.190`, `15.197.148.33` (GoDaddy) | Replace with the A records Firebase shows when you add the custom domain to site `parkflows-marketing` (plus its TXT verification). Lower TTL to 300 s a day before. | user | cutover |
| `www.parkflows.in` | CNAME → `parkflows.in` | Add `www` as a second custom domain set to **redirect to `parkflows.in`**, and set the record Firebase shows | user | cutover |
| `admin.parkflows.in` | CNAME → `gen-lang-client-0904006743.web.app` | **Don't touch** | — | — |
| Email `sales@parkflows.in` | **No MX record: mail can't be delivered** | Set up a mailbox (GoDaddy, Google Workspace, Zoho…), add its MX + SPF + DKIM at GoDaddy, then **send a test mail** to `sales@parkflows.in` | user | **before R1a goes live (blocker)** |
| DMARC | `_dmarc` TXT `v=DMARC1; p=quarantine; … rua=mailto:dmarc_rua@onsecureserver.net` (GoDaddy default) | Keep. With `p=quarantine` and no SPF/DKIM, any mail *sent* as `@parkflows.in` would be quarantined, so add SPF/DKIM with the mailbox. | user | with email |
| Content of the current site | Unknown: the `website` folder is empty and the page couldn't be fetched | Check in GoDaddy whether the domain runs a Website Builder site, forwarding or a parked page. If there are pages (e.g. `/contact`, `/terms`), list them so we can add redirects. Check Google Search Console for indexed URLs. Then turn the GoDaddy site/forwarding off at cutover. | user | before cutover |
| Legal | — | New site: `/privacy/` (website note). **Missing:** `/terms/` and the app privacy policy that the Android app and Play Store point to (`parkflows.in/privacy`, `/terms`). | PM → frontend | before R2 (Android) |
| SEO files | — | New site ships `robots.txt` (Allow all, sitemap link) and `sitemap.xml` (`/`, `/demo/`, `/privacy/`). Canonicals use trailing slashes; `firebase.json` sets `trailingSlash: true` to match. | — | done |
| Analytics / cookies | — | None, by design (NFR-2). Verified in the build: no third-party hosts, no inline scripts or styles. | — | done |

### Hosting config prepared (`docs/features/002-ui-redesign/d1/`; approved in 03 v1.1, rule 5)
- **`.firebaserc`:** default project `gen-lang-client-0904006743`; target `marketing` → site **`parkflows-marketing`** (create it first; if that id is taken, choose another and edit here).
- **`firebase.json`:** one hosting target, `marketing`:
  - `public: dist-marketing`, `trailingSlash: true`;
  - security headers: a strict CSP (`'self'` only; the flag-off build has no inline code), `nosniff`, `DENY` framing, Referrer-Policy, Permissions-Policy;
  - caching: `no-cache` for pages, 1-year immutable for hashed `/assets/**`.
  - **No `/api` rewrite** (not needed while the demo form is off). It comes with B6 + D1, and needs `connect-src 'self'`, which is already allowed.
- **Never run `firebase deploy` without `--only hosting:marketing`** until the admin site's config is exported into this file. To export it (user, Cloud Shell):
  `curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" "https://firebasehosting.googleapis.com/v1beta1/sites/gen-lang-client-0904006743/releases?pageSize=1" | python3 -m json.tool` → `releases[0].version.config` (headers, rewrites to Cloud Run).

### Build checked (devops, clean clone of `feature/002-design-system` @ `83402a2`, flag OFF)
- `bun install --frozen-lockfile` OK.
- `env -u PF_DEMO_FORM npm run build:marketing` OK (370 ms), **360 KB**:
  - 3 pages (`/`, `/demo/`, `/privacy/`), `robots.txt`, `sitemap.xml`, `og-image.png`;
  - self-hosted fonts, 1 CSS, 1 small JS.
- `/demo/`: **no `<form>`**; the contact panel shows `sales@parkflows.in` and `+91 98206 03518`.
- All pages: 0 inline `<script>`, 0 `<style>`, 0 `style=""`, 0 inline handlers. External links only to `admin.parkflows.in` and the canonical URL.
- Packaged for Cloud Shell: **`pf-marketing-83402a2.tar.gz`** (repo root, 242 KB) = `firebase.json` + `.firebaserc` + `dist-marketing/`.

### Preview deploy (flag OFF) — frontend round 2 has landed, ready for the user to run
1. Cloud Shell → ⋮ → Upload `pf-marketing-83402a2.tar.gz`. Then: `mkdir -p ~/pf-marketing && tar xzf ~/pf-marketing-83402a2.tar.gz -C ~/pf-marketing && cd ~/pf-marketing && ls`
2. `firebase --version`. If it's missing: `npm i -g firebase-tools`. If it isn't signed in: `firebase login --no-localhost`.
3. Create the site once: `firebase hosting:sites:create parkflows-marketing --project gen-lang-client-0904006743`
4. `firebase target:apply hosting marketing parkflows-marketing --project gen-lang-client-0904006743` (already in `.firebaserc`; harmless to repeat)
5. **Preview:** `firebase hosting:channel:deploy r1a-preview --only marketing --expires 7d --project gen-lang-client-0904006743` → prints `https://parkflows-marketing--r1a-preview-<hash>.web.app`
6. Checks on the preview URL (devops + QA):
   - `/`, `/demo/`, `/privacy/` load;
   - `/demo` → `/demo/`;
   - no form on `/demo/`; "Sign in" goes to admin.parkflows.in;
   - `curl -sI <url>/` shows the CSP and nosniff headers;
   - QA runs NFR-1 (Lighthouse, CLS < 0.1, performance ≥ 90) and NFR-2 on the preview.
   - Nothing on the live parkflows.in changes.

### Production cutover (after code review r3, QA r3, the email blocker fixed, and the user's go)
1. `firebase deploy --only hosting:marketing --project gen-lang-client-0904006743` (from the same folder, rebuilt from the approved commit).
2. Firebase console → Hosting → `parkflows-marketing` → **Add custom domain** `parkflows.in`, then `www.parkflows.in` (redirect to apex). Note the TXT/A records it shows.
3. GoDaddy DNS:
   - add the TXT verification;
   - replace the apex A records;
   - set the `www` record;
   - **leave `admin` and `_dmarc` alone**.
4. Wait for the SSL certificate (minutes to 24 h). Check `https://parkflows.in/` and `https://www.parkflows.in/` (→ apex), and the headers.
5. Turn off GoDaddy's site/forwarding for the domain if one exists. Submit `sitemap.xml` in Search Console.

### Rollback
- **Content:** `firebase hosting:rollback` for site `parkflows-marketing` (console: Hosting → release history → Roll back), or redeploy the previous `dist-marketing/`. admin.parkflows.in isn't touched.
- **Cutover:** put the apex A records back to `3.33.130.190` / `15.197.148.33` at GoDaddy. Only useful while the old GoDaddy site/forwarding still exists, so keep it until the new site is confirmed.

## Build result
- 001 → `main` merge `84ec8ef`: lint 0, build 0, test:qa 127/112 (expected).
- R1a marketing @ `83402a2`, flag off: `build:marketing` 0.

## Config / env / Firestore changes
- **New (prepared, not committed):** `firebase.json` (marketing target only) and `.firebaserc`. A new Firebase Hosting site `parkflows-marketing` in `gen-lang-client-0904006743`. GoDaddy DNS records at cutover.
- **No changes** to Cloud Run, env vars, Firestore rules or indexes for R1a.

## Deployment steps
See "(a) Before you push `main`", "Preview deploy" and "Production cutover" above.

## Post-deploy smoke checks (per role, per site)
R1a is public and has no roles:
- the 3 pages at 360/768/1280;
- "Sign in" → admin.parkflows.in still works;
- `sales@parkflows.in` receives a test mail;
- `tel:` link correct;
- headers present;
- no third-party requests;
- admin.parkflows.in unchanged (`/api/v1/health` `ready:true`).

## Rollback plan
See "Rollback" above. The admin console and Cloud Run aren't affected by any R1a step.

## Mobile release needed? (Y/N)
**N** for R1a. The Android app's legal URLs (`/privacy`, `/terms`) must exist before R2.

## CHANGELOG entry (draft)
```
## [R1a] — parkflows.in marketing site
- New parkflows.in on the ParkFlows design system: home, Book a demo (email + phone contact panel), privacy note.
- Self-hosted fonts, no cookies or analytics; strict security headers.
- Hosted on Firebase Hosting (site parkflows-marketing), separate from admin.parkflows.in.
```

## Verdict: NOT READY (R1a production) · main merge READY TO PUSH on your confirmation · preview READY for you to run
**Ready:**
- the 001 → `main` merge (checked, local, fast-forward);
- `.gitignore`;
- the D1 config and the preview package.

**Not ready for the production cutover:**
1. Code review r3 and QA r3 on `83402a2` haven't run (task gate).
2. **`sales@parkflows.in` has no mail server (no MX)**: the contact panel's email would bounce.
3. The user's go, and the GoDaddy check of the current site (gap 3) before the DNS switch.

---

## Preview deploy — `b4200a1` (9 Oct)
**Build (devops):** clean clone of `feature/002-design-system` @ **`b4200a1`** (round 3 fix; one-commit code review PASS, PM PASS, QA spot-check PASS, per the review log).
- `bun install --frozen-lockfile` OK (Bun 1.4.2, lock unchanged).
- `env -u PF_DEMO_FORM npm run build:marketing` OK, **360 KB**: `/`, `/demo/`, `/privacy/`, `robots.txt`, `sitemap.xml`, `og-image.png`, self-hosted fonts, 1 CSS, 1 JS.
- All 3 pages: **0 `<form>`**, 0 inline `<script>`, 0 `<style>`, 0 `style=""`, 0 inline handlers. Outside links only to `admin.parkflows.in` and the canonical `parkflows.in`.
- `sales@parkflows.in` appears on `/demo/` (4×) and `/privacy/` (6×).
- **Package:** `pf-marketing-b4200a1.tar.gz` (repo root, 243 KB, untracked; never commit) = `firebase.json` + `.firebaserc` (from `d1/`) + `dist-marketing/` + `dist-marketing.sha256` (SHA-256 of every file, to prove later which build is live).
- The older `pf-marketing-83402a2.tar.gz` is superseded. I couldn't delete it (no delete permission this session); please delete it.

**Deploy (user, Cloud Shell; devops has no Firebase credentials):**
1. Upload `pf-marketing-b4200a1.tar.gz`. Then: `rm -rf ~/pf-marketing && mkdir ~/pf-marketing && tar xzf ~/pf-marketing-b4200a1.tar.gz -C ~/pf-marketing && cd ~/pf-marketing && ls -a`
2. `firebase --version` (if missing: `npm i -g firebase-tools`). If not signed in: `firebase login --no-localhost`.
3. Once: `firebase hosting:sites:create parkflows-marketing --project gen-lang-client-0904006743` (if the id is taken: pick another, then `firebase target:apply hosting marketing <id> --project gen-lang-client-0904006743`).
4. `firebase hosting:channel:deploy r1a-preview --only marketing --expires 7d --project gen-lang-client-0904006743`

**Deployed 9 Oct (user, Cloud Shell, firebase-tools 15.32.0):**
- `hosting:sites:list` showed only `gen-lang-client-0904006743` (admin).
- `hosting:sites:create parkflows-marketing` OK (`https://parkflows-marketing.web.app`; its live channel stays **empty**, since nothing is deployed to it).
- `hosting:channel:deploy r1a-preview --only marketing --expires 7d`: 20 files from `dist-marketing/`, release complete.
- **Preview URL: https://parkflows-marketing--r1a-preview-nuvrvkef.web.app** · **expires 2026-10-16 01:47:35**.
- Warnings "Unable to add channel domain to Firebase Auth" / "sync Firebase Auth state": **harmless**. The marketing site doesn't use Firebase Auth; the CLI just tries to allow-list preview domains for sign-in.
- parkflows.in (GoDaddy) and admin.parkflows.in unchanged.
**Preview checks (9 Oct, user in Cloud Shell): PASS.**
- `/`, `/demo/`, `/privacy/`, `/robots.txt`, `/sitemap.xml`: all **200**. `/demo` → **301 `location: /demo/`** (`trailingSlash`).
- Headers on `/`: the full **CSP** as in `d1/firebase.json`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `cache-control: no-cache`.
- `/demo/`: **0 `<form>`** (flag OFF).
- **SHA-256 of `index.html`, `demo/index.html` and `privacy/index.html` served = the package manifest**, so exactly `b4200a1` (flag OFF) is served.
- **Still open on the preview:** manual browser pass (360/768/1280, Sign in, `mailto:`/`tel:`, no third-party requests) by the user; **QA NFR-1** Lighthouse (performance ≥ 90, CLS < 0.1) and NFR-2.

---

## Cutover runbook — parkflows.in → Firebase Hosting site `parkflows-marketing`
**Don't start until the user says go.** Run it in a low-traffic window, because the HTTPS certificate can take minutes to hours after the DNS change. Everything runs in Cloud Shell or in the GoDaddy / Firebase web consoles. **admin.parkflows.in isn't touched at any step.**

### 0. Gates (all must be ✅)
| Gate | Check | ✅ |
|---|---|---|
| User go | explicit "go" in chat | ☐ |
| Reviews | code review + QA pass on the commit being deployed (`b4200a1` today, or a newer approved one) | ☐ |
| Preview | preview URL checked (above), no open issues | ☐ |
| Email | `sales@parkflows.in` receives a test mail. Today parkflows.in has **no MX record**, so the contact panel's address bounces | ☐ |
| Old site known | in GoDaddy: is the domain on Website Builder, Forwarding, or a parked page? Note any pages (for redirects) | ☐ |
| Records saved | screenshot of the current GoDaddy DNS page (needed for rollback) | ☐ |

### 1. Day before: lower the TTLs (GoDaddy)
- GoDaddy → My Products → `parkflows.in` → **DNS** → Manage DNS.
- Edit **A `@` → 3.33.130.190**, **A `@` → 15.197.148.33** and **CNAME `www` → `@`**: set TTL to the lowest offered (600 s / "custom 600"). Today they're 3600 s.
- Purpose: a rollback then takes about 10 min, not an hour.

### 2. Deploy the live version (Firebase, nothing public changes yet)
```
cd ~/pf-marketing   # same package as the checked preview
firebase deploy --only hosting:marketing --project gen-lang-client-0904006743
```
- Check `https://parkflows-marketing.web.app/`, `/demo/` and `/privacy/` load.
- **Never** run `firebase deploy` without `--only hosting:marketing`.

### 3. Add the custom domains (Firebase console)
- console.firebase.google.com → project `gen-lang-client-0904006743` → **Hosting** → site **`parkflows-marketing`** → **Add custom domain**.
  1. `parkflows.in`. Firebase shows a **TXT** record (ownership) and the **A** record(s) to use. Copy them exactly; don't reuse old values.
  2. `www.parkflows.in`, with **"Redirect to an existing website" → `parkflows.in`**. Note the record Firebase shows for `www`.

### 4. Change DNS (GoDaddy)
| Record | Action |
|---|---|
| TXT `@` | **Add** the Firebase verification value |
| A `@` → 3.33.130.190 | **Delete** |
| A `@` → 15.197.148.33 | **Delete** |
| A `@` → *(Firebase IP from step 3)* | **Add** (one row per IP Firebase lists), TTL 600 |
| `www` | **Edit** the existing CNAME to the value Firebase showed for `www` (or replace it with the A record it gives) |
| GoDaddy **Forwarding** / Website Builder domain connection | **Remove / disconnect**, if present; forwarding overrides A records |
| **Don't touch** | `NS` (domaincontrol.com), **CNAME `admin` → `gen-lang-client-0904006743.web.app`**, TXT `_dmarc`, and MX/SPF/DKIM once email exists |

Then wait for Firebase to show **Connected** for both domains (verification minutes to ~1 h; SSL certificate up to 24 h).

### 5. Post-cutover checks (Cloud Shell, after Firebase shows Connected)
```
# DNS
dig +short parkflows.in A                     # = the Firebase IP(s) from step 3, NOT 3.33.130.190 / 15.197.148.33
dig +short www.parkflows.in                   # = Firebase's www target
dig +short admin.parkflows.in CNAME           # still gen-lang-client-0904006743.web.app.

# HTTPS, redirects, headers
curl -sI https://parkflows.in/        | grep -iE "^HTTP|content-security-policy|x-content-type|x-frame|strict-transport"
curl -sI http://parkflows.in/         | grep -iE "^HTTP|^location"     # 301 → https://parkflows.in/
curl -sI https://www.parkflows.in/    | grep -iE "^HTTP|^location"     # 301 → https://parkflows.in/
curl -sI https://parkflows.in/demo    | grep -iE "^HTTP|^location"     # 301 → /demo/

# The three pages
for p in / /demo/ /privacy/ /robots.txt /sitemap.xml; do curl -s -o /dev/null -w "$p %{http_code}\n" https://parkflows.in$p; done   # all 200
curl -s https://parkflows.in/demo/    | grep -c "<form"                   # 0  (flag OFF)
curl -s https://parkflows.in/demo/    | grep -c "sales@parkflows.in"      # ≥ 1
curl -s https://parkflows.in/privacy/ | grep -c "sales@parkflows.in"      # ≥ 1
curl -s https://parkflows.in/         | grep -c 'href="https://admin.parkflows.in'   # ≥ 1 (Sign in)

# Exactly the approved build is live
cd ~/pf-marketing && for f in index.html demo/index.html privacy/index.html; do
  want=$(grep " dist-marketing/$f$" dist-marketing.sha256 | cut -d' ' -f1)
  got=$(curl -s https://parkflows.in/${f%index.html} | sha256sum | cut -d' ' -f1)
  [ "$want" = "$got" ] && echo "$f OK" || echo "$f MISMATCH"; done

# The console is unaffected
curl -s https://admin.parkflows.in/api/v1/health | grep -o '"ready":[a-z]*'   # "ready":true
```
**In a browser** (desktop + phone):
- `/`, `/demo/` and `/privacy/` at **360 / 768 / 1280 px**;
- "Sign in" opens admin.parkflows.in;
- the `mailto:` and `tel:+919820603518` links work;
- DevTools → Network: **no third-party requests, no cookies** (NFR-2).
- QA: Lighthouse NFR-1 on the live URL (performance ≥ 90, CLS < 0.1).

**Afterwards:**
- Search Console: add/verify `parkflows.in`, submit `https://parkflows.in/sitemap.xml`.
- Keep the old GoDaddy site/forwarding switched off but **not deleted for 48 h**, so a rollback stays possible.
- Raise the TTLs back to 3600 s after 48 h.

### 6. Rollback (the user decides; devops recommends)
| Problem | Action | Time |
|---|---|---|
| Wrong or broken content on the new site | Firebase console → Hosting → `parkflows-marketing` → **Release history** → previous release → **Roll back** (or redeploy the previous package with `firebase deploy --only hosting:marketing`) | ~1 min |
| New site unreachable, certificate stuck > 24 h, or a serious problem | **GoDaddy DNS:** delete the Firebase A record(s); re-add **A `@` → 3.33.130.190** and **A `@` → 15.197.148.33**; set **CNAME `www` → `@`** back; re-enable the old GoDaddy site/forwarding if it was switched off. Keep the Firebase TXT (harmless). | ~10 min with TTL 600 |
| Anything | admin.parkflows.in and Cloud Run are never changed by this runbook, so the console keeps working throughout | — |

Record each step's result and time here when it runs.

---

## Cutover log — 11 Oct (user GO given)
**Gate check started; cutover HELD until both gates are confirmed.**
- Devops could not read DNS from its own tools today:
  - sandbox resolver: NXDOMAIN even for `ns53.domaincontrol.com`;
  - PC workspace: no UDP/53;
  - DNS-over-HTTPS: proxy 403.
  So the gate-1 MX check is run by the user in Cloud Shell (`dig`).
- Last known state (9 Oct): **no MX, no SPF** at the GoDaddy name servers.
- **Gate 1: FAIL → HOLD (11 Oct).** User's Cloud Shell:
  - `dig +short MX parkflows.in` → empty;
  - `dig +short TXT parkflows.in` → empty;
  - `dig +short MX parkflows.in @ns53.domaincontrol.com` (GoDaddy's authoritative server) → empty.
  - The domain still has **no MX and no SPF**, so mail to `sales@parkflows.in` can't be delivered, whatever mailbox exists.
  - Per the task: **no partial launch.** Nothing deployed to the live channel; no Firebase domain and no DNS change.
  - To unblock: add the mail provider's MX (+ SPF/DKIM) records at GoDaddy; then MX visible at `ns53` + test mail received → re-check gate 1.
- Gate 2 (current GoDaddy website/forwarding checked, existing pages listed for redirects): ☐ pending
- No deploy to the live channel, no Firebase domain and no DNS change yet. The preview `r1a-preview` expires 2026-10-16 01:47 UTC.

### User decision (11 Oct): go live without email — gate 1 waived, recorded risk
- The user decided to go live now and fix email later ("day one we are not going to have any enquiries"). Gate 1 is **waived by the user, not passed**.
- **Accepted residual risk until MX/SPF exist:**
  - any mail to `sales@parkflows.in` bounces back to the sender. That includes the site's `mailto:` links and the privacy page's "Delete my enquiry" link.
  - The phone number `+91 98206 03518` is the working contact.
  - No enquiries are stored anywhere (demo form off), so nothing is lost silently; senders get a bounce.
- **Follow-up, owner user, target ASAP:** add the provider's MX + SPF (+ DKIM) at GoDaddy; check `dig MX parkflows.in @ns53.domaincontrol.com`; send a test mail. Then record it here.
- Gate 2 (current GoDaddy site/forwarding) is checked during the GoDaddy DNS step, because Forwarding would override the new records.

### Cutover steps — 11 Oct (times IST)
- **Live deploy:** `parkflows-marketing` live channel deployed from `~/pf-marketing` (b4200a1, flag OFF, files from `pf-marketing-b4200a1.tar.gz`).
  - `parkflows-marketing.web.app`: `/`, `/demo/`, `/privacy/` all 200.
  - `index.html`, `demo/index.html` and `privacy/index.html` match `dist-marketing.sha256`.
- **Firebase custom domains (~10:05):**
  - `parkflows.in` added with no redirect. Firebase asked for A `199.36.158.100` + TXT `hosting-site=parkflows-marketing`, and for removal of A `3.33.130.190` and `15.197.148.33`.
  - `www.parkflows.in` added as a redirect to `parkflows.in`. Firebase asked for CNAME www → `parkflows-marketing.web.app`, replacing www → `parkflows.in`.
- **Gate 2: PASS (~10:10).**
  - GoDaddy Forwarding: domain "Not set up", subdomains "Not set up".
  - The apex was GoDaddy's **Parked** page (A @ "Parked", TTL 600 s = 3.33.130.190 / 15.197.148.33). There was no real site, so no pages need redirects.
- **GoDaddy DNS changed (~10:22):**
  - A @ Parked → `199.36.158.100` (1 h);
  - CNAME www `parkflows.in.` → `parkflows-marketing.web.app.` (1 h);
  - added TXT @ `hosting-site=parkflows-marketing` (1 h).
  - Unchanged: NS ns53/ns54, SOA, `admin` → gen-lang-client-0904006743.web.app, `alphatech` → gen-lang-client-0128645993.web.app (another Firebase project, not ours — left alone), `_domainconnect`, `_dmarc`.
  - Near-miss: the `admin` record was opened for edit by mistake; it was closed without saving, and the final list confirms it is unchanged.
- **DNS check (Cloud Shell, after the change):** `@ns53.domaincontrol.com` and `@8.8.8.8` both return A `199.36.158.100`, TXT `hosting-site=parkflows-marketing`, www CNAME `parkflows-marketing.web.app.`, and admin CNAME `gen-lang-client-0904006743.web.app.` → PASS.
- **Firebase Verify (~10:27):**
  - `parkflows.in`: A ✅, TXT pending ("Records not yet detected"). Firebase's checker caches results; waiting for it to re-check.
  - SSL: pending.
- **Rollback, ready:**
  - DNS: set A @ back to Parked (or 3.33.130.190 + 15.197.148.33), set CNAME www → `@`, remove the TXT. Up to ~1 h to spread (TTL 3600).
  - Content: Firebase Hosting release rollback on `parkflows-marketing`.
- **Both domains verified (~10:40):** `parkflows.in` and `www.parkflows.in` show "Minting certificate" (SSL pending).
- Post-cutover checks (HTTPS, 3 pages, hashes, headers, /demo→/demo/, www redirect, admin health): ☐ after "Connected".

## R1b — devops prep (11 Oct)
- User asked to move to R1b. **R1b isn't built yet:** B1–B6 and F1–F10 are still to be done, and step 4 (dev) → 5 → 6 come before any release.
- Hand-off brief: `r1b-handoff.md` (branch plan, order, release rules, what 04 must state, devops parallel work, release shape).
- **Branch check:**
  - `feature/002-design-system` is 24 commits ahead of base `d42af6f`; `main` is 63 ahead.
  - The only file changed on both sides is `package.json` (both add `test:qa`). The merge resolution is trivial.
  - No `firebase.json` / `.firebaserc` at the repo root yet; D1 copies are in `d1/`.
- **R1a still open:** apex certificate minting; the post-cutover checks are re-run after "Connected".

## R1a close-out and R1b config prep (11 Oct, devops)
### (a) R1a post-cutover checks
- Devops tools can't reach parkflows.in: both the PC workspace and the sandbox get a proxy 403 on CONNECT (org egress policy). So the checks run in the user's Cloud Shell; the block is in the chat and its output is recorded below.
- Domain/SSL state: read from the Firebase Hosting API (`customDomains`: `hostState`, `ownershipState`, `cert.state`) plus the TLS certificate (issuer, expiry).
- Results: ☐ pending the user's Cloud Shell output.

### (b1) Admin hosting config → `admin` target
- Exported with the Hosting REST API (`sites/gen-lang-client-0904006743/releases?pageSize=1` → `version.config`).
- Results: ☐ pending the user's output. The `admin` target is added to `d1/firebase.json` + `.firebaserc` only after the export has been read. Until then, **every deploy stays `--only hosting:marketing`**.

### (b2) D1 rewrite — added, NOT deployed
- `d1/firebase.json`, marketing target: `rewrites: [{ source: "/api/v1/demo-requests", run: { serviceId: "parking-management-solution-v2-git", region: "asia-south1" } }]`.
  - Approved in 03 v1.1 (rule 5). It's the only change: the diff vs the live config is +3 lines.
- The config deployed for R1a is kept as `d1/firebase.r1a-live.json`. **Use that file for any R1a re-deploy or hotfix before R1b.** `firebase.json` now carries the R1b rewrite.
- **Check at the R1b preview (open risk):** the marketing target has `trailingSlash: true`. Firebase may 301-redirect `/api/v1/demo-requests` → `/api/v1/demo-requests/`, and browsers turn a POST into a GET when they follow a 301.
  - The R1b preview must show `curl -si -X POST <preview>/api/v1/demo-requests -H 'content-type: application/json' -d '{}'` answered by Cloud Run (400 JSON from B6), **not** 301.
  - If it is 301: change the rewrite source/`trailingSlash` handling before go-live (devops config change, re-review).
- CSP needs no change (`connect-src 'self'`, `form-action 'self'`). The Cloud Run service already allows unauthenticated calls (it serves admin).

### (b3) Firestore PITR on `parkorbitv2direct` — user steps
- Cloud Shell:
  - `gcloud firestore databases describe --database='(default)' --project=parkorbitv2direct --format='value(pointInTimeRecoveryEnablement,locationId)'`
  - `gcloud firestore databases update --database='(default)' --enable-pitr --project=parkorbitv2direct`
- Check: `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED` and an `earliestVersionTime`.
- Console alternative: Firestore (project parkorbitv2direct) → Disaster recovery → Point-in-time recovery → Enable.
- Notes:
  - It keeps 7 days of versions, with extra storage cost (billed like stored data).
  - It covers only changes made **after** it is enabled.
  - It needs Owner or `datastore.owner` on parkorbitv2direct.
- Status: ☐ user.

### (b4) Disable the europe-west1 GitHub trigger before `main` is pushed — user steps
- Console: Cloud Build → Triggers → region **europe-west1** (project gen-lang-client-0904006743) → the trigger for `parking-management-solution-v2` / branch `^main$` → ⋮ → **Disable**.
- CLI equivalent: export → set `disabled: true` → import. The commands are in the chat.
- Check: `gcloud builds triggers list --region=europe-west1 --format='table(name,disabled)'` shows `True`.
- Order:
  1. Disable the trigger;
  2. check;
  3. push `main` (only on the user's OK);
  4. confirm no build started (`gcloud builds list --region=europe-west1 --limit=3`).
- To re-enable later: the same steps with `disabled: false`. Not recommended: the source deploy from Cloud Shell is the release path.
- Status: ☐ user.

### R1a post-cutover checks — 13 Oct (user's Cloud Shell; devops tools can't reach parkflows.in, blocked by egress policy)
| Check | Result | Verdict |
|---|---|---|
| Firebase custom domains (Hosting API) | `parkflows.in`: HOST_ACTIVE, OWNERSHIP_ACTIVE, CERT_ACTIVE. `www.parkflows.in`: same, redirect → `parkflows.in` | PASS |
| DNS | A `199.36.158.100`; www CNAME `parkflows-marketing.web.app.`; admin CNAME `gen-lang-client-0904006743.web.app.` (unchanged) | PASS |
| Certificate | CN `parkflows.in`, Google Trust Services WR3, valid to 9 Jan 2027 (auto-renewed by Firebase); www served over HTTPS (301 below) | PASS |
| Headers (apex) | HTTP/2 200; CSP exactly as D1; X-Frame-Options DENY; nosniff; Referrer-Policy; Permissions-Policy; Cache-Control no-cache; HSTS `max-age=31556926` (added by Firebase) | PASS |
| Pages | `/`, `/demo/`, `/privacy/`, `/robots.txt`, `/sitemap.xml` → 200. (`/assets/` 404 = no directory index, expected) | PASS |
| Redirects | `/demo` → 301 `/demo/`; `https://www` → 301 apex (path kept: `/privacy/` → `/privacy/`); `http://parkflows.in` → 301 https; `http://www` → 301 `https://www` → 301 apex | PASS |
| Sign-in link / demo form | 3 links to `https://admin.parkflows.in` on `/`; 0 `<form>` on `/demo/` (flag OFF) | PASS |
| Admin | `/api/v1/health` `"ready":true` | PASS |
| Live release | `parkflows-marketing` release `1791692152916000`, 2026-10-11 04:15:52 UTC (09:45 IST), 22 files | — |
| Hash manifest | First run invalid (the devops command used wrong paths). Re-run with the runbook command on 13 Oct: `index.html`, `demo/index.html`, `privacy/index.html` all **OK** against `dist-marketing.sha256` (b4200a1) | PASS |

**R1a cutover: DONE (13 Oct).** parkflows.in + www serve build b4200a1 (flag OFF) over HTTPS on Firebase site `parkflows-marketing`; admin unaffected. Open follow-ups:
- email MX/SPF/DKIM (gate 1 waiver; needed before flag ON);
- QA NFR-1/NFR-2 on the live site;
- `/terms` + app privacy policy before R2;
- commit d1 → repo root with the D1 commit.

## R1b prep — 13 Oct (no deploys)
### Admin hosting config, exported (Hosting API, read-only)
- Site `gen-lang-client-0904006743`, live release `1788578087565000` (2026-09-05 03:14 UTC, DEPLOY), version `81d2d60df185bfb5`, **2 files**.
- Config = **one rewrite only**: glob `/**` → Cloud Run `parking-management-solution-v2-git` (asia-south1). No headers, no redirects, no cleanUrls/trailingSlash. So admin's security headers come from the Express server, not from Hosting.
- Added to `d1/firebase.json` as target **`admin`** (`"source": "**"` = the API's glob `/**`), and to `d1/.firebaserc` (`admin` → `gen-lang-client-0904006743`). `public: "hosting-admin"`.
- **Rule: never deploy the `admin` target until the 2 live files are listed and copied into `hosting-admin/`.** A static file wins over the rewrite, and a deploy replaces the whole version. Until then every deploy keeps `--only hosting:marketing`. File list (13 Oct, Hosting API): `/__/firebase/init.js` and `/__/firebase/init.json`, both ACTIVE. These are the **Firebase reserved `/__/` init files that Hosting adds to every version itself**, so there are **no user files**: the site is the rewrite only.
- So `hosting-admin/` can be an **empty folder** (keep it with a `.gitkeep`; `**/.*` in `ignore` keeps that file out of the deploy). A deploy of the `admin` target would publish the same thing as live: 0 own files, rewrite `**` → Cloud Run.
- The admin target is still **not needed for R1b**: the console ships inside the Cloud Run revision, and Hosting just forwards. Keep `--only hosting:marketing` on every deploy. Use `--only hosting:admin` only if the admin Hosting config itself has to change, with a preview channel and a rollback (`firebase hosting:rollback` / release `1788578087565000`).
### D1 rewrite (marketing target; config only, not deployed)
- `d1/firebase.json` marketing target: `rewrites: [{ "source": "/api/v1/demo-requests", "run": { "serviceId": "parking-management-solution-v2-git", "region": "asia-south1" } }]`. Approved in 03 v1.1 (rule 5).
- `d1/firebase.r1a-live.json` keeps the exact live R1a config, for rollback.
- It ships with R1b (flag ON + B6 live). **Preview-channel checks before live:**
  - a POST to `/api/v1/demo-requests` reaches Cloud Run and is **not** 301-redirected by `trailingSlash: true` (a redirect would turn the POST into a failed GET);
  - a GET returns 404/405 (AC-32c);
  - CSP `connect-src 'self'` allows it (same origin).
- Note: Hosting rewrites forward only the `__session` cookie. The route needs no session (03).
### Firestore PITR (`parkorbitv2direct`) — user action
- Today: `POINT_IN_TIME_RECOVERY_DISABLED`, version retention 3600 s (1 h), delete protection **enabled**, location asia-south1.
- Steps:
  1. Turn it on. Either `gcloud firestore databases update --database="(default)" --project=parkorbitv2direct --enable-pitr`, or console: Firestore → (default) → Disaster recovery → Point-in-time recovery → Enable.
  2. Verify: `gcloud firestore databases describe --database="(default)" --project=parkorbitv2direct --format="value(pointInTimeRecoveryEnablement,versionRetentionPeriod)"` → `POINT_IN_TIME_RECOVERY_ENABLED 604800s`.
- Cost: storage for 7 days of old versions (small at today's size). Needs a role with `datastore.databases.update` on `parkorbitv2direct`.
- Do it **before** the R1b Cloud Run deploy.
- **DONE 13 Oct (01:25 UTC, user):** `--enable-pitr` → `POINT_IN_TIME_RECOVERY_ENABLED`, `versionRetentionPeriod: 604800s` (7 days), `earliestVersionTime` 2026-10-13T00:26:00Z. Delete protection still enabled. Recovery window grows to 7 days by 20 Oct.
### europe-west1 trigger — disable before `main` is pushed
- Trigger `cloudrun-parking-management-solution-v2-git-asia-south1-Digixxx` (truncated in the list), ID `c938b5a5-2f2e-40bb-94e9-b8a6e49f1add`, region europe-west1, project `gen-lang-client-0904006743`, SA `430896008903-compute@`. Not disabled today. No triggers in asia-south1 or global.
- Console: Cloud Build → Triggers → region **europe-west1** → the trigger → ⋮ → **Disable**.
- CLI:
  ```bash
  P=gen-lang-client-0904006743; ID=c938b5a5-2f2e-40bb-94e9-b8a6e49f1add
  gcloud builds triggers export $ID --project=$P --region=europe-west1 --destination=$HOME/trigger.yaml
  cp $HOME/trigger.yaml $HOME/trigger.backup.yaml
  grep -q '^disabled:' $HOME/trigger.yaml && sed -i 's/^disabled:.*/disabled: true/' $HOME/trigger.yaml || echo 'disabled: true' >> $HOME/trigger.yaml
  gcloud builds triggers import --project=$P --region=europe-west1 --source=$HOME/trigger.yaml
  gcloud builds triggers describe $ID --project=$P --region=europe-west1 --format="value(name,disabled)"   # → ... True
  ```
- Undo: the same, with `disabled: false`, or console → Enable.
- Why: a push to `main` would start a ~35–57 min europe-west1 build that auto-deploys to Cloud Run and moves traffic ("to latest"), outside the release plan.
- Order: disable → verify `True` → push `main` (only on the user's go) → check no build started (`gcloud builds list --region=europe-west1 --limit=3`).

## R1b — branch check and status (13 Oct)
- **Correction:** the 11 Oct prep note "R1b isn't built yet" was wrong. Devops had only checked `feature/002-design-system`. `feature/002-r1b` already existed (merge `2937fe6` = b4200a1 + main 84ec8ef), with B1–B6 (`4347715`) and the prep commit, F1–F10 and BUG-3 (`d10a055`), all committed on 11 Oct, not pushed.
- **"Create the R1b branch" (user, 13 Oct):** devops built the same merge independently in a temporary clone (`dcf5113`). Its tree `b4f060b` is **identical** to the devs' `2937fe6`, so the existing branch has the right base. The only conflict, `package.json` `test:qa`, was resolved the same way.
  - Checks on the merge (Node 22, Bun 1.4.2, clean install `--frozen-lockfile`): lint 0, `lint:styles` 37 files clean, tokens `--check` OK, `build` OK, `build:marketing` OK.
  - test:qa per file: 001-backend 64/64, hotfix 6/6, 002-format 10/10, 002-tokens 7/7. 001-platform 42/57 = the same 15 known Phase 2 FLOWs (03, 04, 05, 06, 09, 10, 11, 12, 14, 18, 20, 21, 22, 24, 27).
  - Git refused to overwrite the existing branch (non-fast-forward), so nothing was lost. The temporary clone and bundle are deleted. The existing `feature/002-r1b` @ `d10a055` is unchanged.
- **Status:**
  - backend B1–B6: code review round 1 = **CHANGES** (M-1 Major, m-1, m-2), fix round pending;
  - frontend F1–F10 + BUG-3: **READY FOR REVIEW**, not reviewed yet;
  - QA (06) and security (07) for R1b: not started.
  - **R1b release: NOT READY.**
- **Devops input to M-1 (architect decision):**
  - Option (a) in 05, "restrict Cloud Run ingress", **doesn't work as written**. Firebase Hosting rewrites reach Cloud Run over the public front end, so ingress `internal-and-cloud-load-balancing` would also cut off admin.parkflows.in (Hosting rewrites `/**` to the same service) and the D1 route.
  - Workable choices:
    - keep ingress `all`, and for the demo route only take the client IP from the Hosting-added header when the request came through Hosting (05 option b); or
    - put an external HTTPS load balancer in front of Cloud Run. That's a new cloud resource, needs an approved design, and costs money.
  - Either way: verify on the D1 preview that two client IPs get separate buckets, and check the audit `ipAddress`.

## 001 S7-1 control through the R1b deploy (15 Oct, devops)
Source: 002 `07-security-review.md` (Info row: "001 S7-1 (High, accepted 1 Oct) still unpatched on this branch… the 001 control must stay in place… re-check script V2 (403) after the R1b deploy"); 001 `07` "User decision (2026-10-01)"; 001 `08` item a, "Item a, revised", P3 results, hotfix section.

### What the control is (and what it is not)
- **The finding (001 S7-1, High, Open, risk accepted by the user 1 Oct):** `POST /api/v1/alerts/trigger-cron` (the Alerts page's **"Run cutoff scan"** button) is not site-scoped. It scans every site's employees, replaces the whole `alerts` collection, and returns every site's names, plates and mobiles to the caller. The only server guard is `requirePermission('ALERTS','canEdit')`.
- **"Run cutoff scan" is the vulnerable button, not the control.** There is no scheduled scan job: nothing in the code calls `runNonParkedRosterScan()` except this route (checked on `main` and `feature/002-r1b`). The "10:30 AM cron" wording is only text in the route's audit and response messages.
- **The control (001 07 conditions 1–3, made durable in 001 08 "Item a, revised", 2 Oct):**
  1. **No non-Master user holds ALERTS Edit.** Alphatech's site admins were moved to the custom role **`role-1790920354180` "Site Facility Manager – Alphatech"** (ALERTS Edit off). Custom roles aren't re-seeded. The default `role-site-manager` may hold ALERTS Edit (it can be reset), which is accepted **only while no non-Master user is assigned to it**.
  2. **Masters don't press "Run cutoff scan"** until the S7-1 fix ships (a procedural rule).
  3. **Verification:** script **V1** (as Master: no non-Master user holds ALERTS Edit by role or override) and script **V2** (as Site Admin `alphatech.admin`: `POST /alerts/trigger-cron` → **403**; `/slots` with no site / other site / own site → 400 / 403 / 200).
- **Where it runs:** production data (Firestore `appRoles` / `appUsers` in `parkorbitv2direct`), read through admin.parkflows.in. V1 runs in the Master's browser console; V2 is `curl.exe` on the user's PC. **Who:** the user, as Master for V1 and as `alphatech.admin` for V2.
- **How often (001 08):** after cutover, at +10 min, and **after every deploy or restart**. There is no fixed calendar schedule.

### Last runs (from the records)
| Date | Revision | Check | Result |
|---|---|---|---|
| 2 Oct | `00126-t6t` | Control applied (custom role, 3 users moved) + V1 + V2 + smoke S4 | **PASS**: "S7-5 OK · S7-1 OK"; trigger-cron 403 |
| 3 Oct | `00132-ket` → `00128-gtt` (hotfix) | Records show the 00126 code **had cold-started since 2 Oct** (re-seeded `company.com`), so `role-site-manager` most likely has ALERTS Edit back on. V1/V2 after the switch were listed as "PAUSED (user break)" and **were never recorded as done** | **NOT RUN** |
| 3–15 Oct | `00128-gtt` (live) | — | **No verification on record for 12 days** |

**So the control's state today is unverified, not failed.** No code path removes it, and the hotfix stops cold starts from re-seeding roles, but a Master could have assigned a user to `role-site-manager` since 2 Oct (see R1b-C2 below).

### Does R1b remove, disable or bypass it? (code, scheduled tasks, env, runbooks)
- **Route and guard:** `server.ts:2138` on `feature/002-r1b` is identical to `main:1817` (`requirePermission('ALERTS','canEdit')`, same body). → **No change.**
- **Permission engine and roles:** `git diff main..feature/002-r1b` shows no change to `requirePermission`, module checks, the `getDefaultRolesAndUsers()` seed, `/rbac/roles`, `/rbac/users`, toggle-module or `customModuleOverrides`. The only `security.ts` changes are the rate limiter's optional key/redaction (defaults unchanged) and audit redaction for the demo route. → **No change.**
- **View-as (R1b uses it from the Sites panel):** still read-only; any non-GET is refused (001 B10). → **Can't be used to run the scan.**
- **UI:** `NonParkedAlerts.tsx` is unchanged. The Alerts route needs module ALERTS; the server guard is still the gate, so the UI fail-open R1B-4 (custom-role nav) can't reach the scan without ALERTS Edit.
- **Scheduled tasks:** in code, the only new timer is the 24 h demo-request expiry (doesn't touch alerts). In GCP, Cloud Scheduler isn't recorded anywhere for this project, so the user lists it read-only in the check below. A scheduler call has no session, so it would get 401 anyway.
- **Env vars:** R1b adds only `DEMO_HOSTING_EGRESS_CIDRS` (and the marketing build flag). Nothing affects ALERTS. `SITE_SCOPE_MODE` doesn't affect this route either way (it never calls `resolveSite`).
- **Runbooks:** this R1b checklist (below) keeps V1/V2. No runbook says to restore ALERTS Edit (that waits for the S7-1 fix, 001 08 first patch #1).
- **Two control risks found (not caused by R1b code, but R1b makes the first one more likely):**
  - **R1b-C1 (Minor, frontend):** the new Sites panel (`src/screens/Sites/SitePanel.tsx:65`) lists a site's admins **only if their role is `role-site-manager`**. For Alphatech, whose admins are on the custom role, the panel will show **no site admins** and no "View as site admin". A Master "fixing" that by moving them back to `role-site-manager` would silently undo the S7-1 control. Raised for frontend/architect (backlog). **Ops rule until fixed: never move a non-Master user to `role-site-manager`.**
  - **R1b-C2 (pre-existing, `db.ts:4335` = `main:3923`):** a user created without a chosen role defaults to `role-site-manager`. Same rule; V1b below catches it.

### Checks (user; read-only)
**V1b** (replaces V1 for S7-1; as Master on admin.parkflows.in, DevTools → Console). It reports per role, so the accepted "default role has ALERTS Edit but no users" case doesn't show as a false FAIL:
```js
(async () => {
  const t = sessionStorage.getItem('parkflow_session_token_fallback');
  const h = t ? { 'x-session-token': t } : {};
  const get = async (p) => { const r = await fetch(p, { headers: h, credentials: 'include' }); if (!r.ok) throw new Error(p + ' -> ' + r.status); return r.json(); };
  const roles = (await get('/api/v1/rbac/roles')).roles || [];
  const users = ((await get('/api/v1/rbac/users')).users || []).filter((u) => u.roleId !== 'role-master-admin');
  const out = [], bad = [];
  for (const r of roles) {
    if (r.id === 'role-master-admin') continue;
    const a = r.modulePermissions?.ALERTS;
    if (!(a?.enabled && a.canEdit)) continue;
    const on = users.filter((u) => u.roleId === r.id);
    (on.length ? bad : out).push(`role "${r.roleName}" (${r.id}) has ALERTS Edit; non-Master users on it: ${on.length ? on.map((u) => `${u.email || u.username} [${u.status}]`).join(', ') : 'none'}`);
  }
  for (const u of users) if (u.customModuleOverrides?.ALERTS === true) bad.push(`override ALERTS=true: ${u.email || u.username} (${u.roleName})`);
  const c = roles.find((r) => r.id === 'role-1790920354180');
  out.push(c ? `custom role "${c.roleName}": ALERTS Edit=${!!c.modulePermissions?.ALERTS?.canEdit}, users=${users.filter((u) => u.roleId === c.id).map((u) => u.email || u.username).join(', ')}` : 'custom role role-1790920354180 NOT FOUND');
  console.log([...out, ...(bad.length ? bad.map((b) => 'S7-1 FAIL: ' + b) : ['S7-1 OK: no non-Master user holds ALERTS Edit'])].join('\n'));
})();
```
**Pass** = `S7-1 OK`, and the custom role shows `ALERTS Edit=false` with the Alphatech admins on it.
**V2:** unchanged (001 08), as `alphatech.admin` in an incognito window → trigger-cron **403**; `/slots` 400 / 403 / 200.
**Scheduler (Cloud Shell, read-only):**
```bash
for L in asia-south1 europe-west1 us-central1; do echo "-- $L"; gcloud scheduler jobs list --project=gen-lang-client-0904006743 --location=$L --format="table(name.basename(),schedule,state,httpTarget.uri)" 2>&1 | head -5; done
```
**Pass** = no job targets `/alerts/trigger-cron`.

### R1b deploy checklist: S7-1 items
| # | When | Check | Pass rule | Result |
|---|---|---|---|---|
| S7-1-pre | Before the R1b Cloud Run deploy (now, on `00128-gtt`) | V1b + V2 + scheduler list | `S7-1 OK`; 403; no scheduler job on the route | ☐ |
| S7-1-tag | On the R1b `--no-traffic` revision (tag URL), before the traffic switch | V2 against the **tag URL** (same token) | 403 | ☐ |
| S7-1-post | After the traffic switch, and again at +10 min | V1b + V2 on admin.parkflows.in | `S7-1 OK`; 403 both times | ☐ |
| S7-1-ops | Standing, until the S7-1 fix ships | Masters don't press "Run cutoff scan"; never move a non-Master to `role-site-manager`; new users get the custom role | — | — |

### Owner and schedule
- **Owner of the control and its checks: the user (Platform Master Admin)**, since only a Master session can run V1b, plus the `alphatech.admin` sign-in for V2. Devops writes the checks and records the results here.
- **Schedule (until the S7-1 fix is deployed and the control is lifted):**
  - S7-1-pre / -tag / -post as above for R1b;
  - after **every** deploy, Cloud Run restart or revision change (001 rule);
  - after any role or user change in User & RBAC;
  - **weekly on Mondays** as a standing check, since restarts aren't always visible.
  - Record each run as one line in the review log.
- **Backlog:** `KNOWN_ISSUES.md` → "S7-1: POST /alerts/trigger-cron is not site-scoped" (opened 15 Oct; owner to be assigned by the architect).

## R1B-S1 hotfix + R1b console: pre-deploy checks and deploy plans (17 Oct, devops)
**Inputs (all PASS in the review log):**
- `hotfix/r1b-s1` @ **`bbfdbcc`** (on main `84ec8ef`): CR PASS, security delta PASS, QA PASS 17 Oct.
- `feature/002-r1b` @ **`9ac2843`** (contains `cfdff14` = the S1 cherry-pick, R1B-S2 `9dd406f`, BUG-R1B-6/7): CR PASS, security delta PASS, QA "R1b final (9ac2843)" PASS 17 Oct.
- Live: `00128-gtt` (001 + 2 Oct hotfix).

### Data-safety constraint found while planning (applies to both deploys)
- Sessions are **in memory per instance** (`security.ts:713 activeSessions`). A token from one revision doesn't work on another, so V2 on a tag URL needs a sign-in **on that tag**.
- A successful sign-in runs `saveDB()` (`server.ts` handleLoginRequest, step 5). That is a **full-store sync** (merge-set of every record the instance holds, 3 s debounce).
  - On a **tag revision**, that writes the tag's boot-time copy of slots, logs, employees and so on over anything the **live** revision changed since the tag started.
  - Example: a car parked at the gate after the tag booted can show as vacant again.
- Same mechanism at the **traffic switch**: the new revision serves the store it loaded at boot. Writes the old revision made after that boot are missing from its memory, and its next full sync overwrites them in Firestore.
- This is the known 001 gap 4 ("full-store syncs"; first patch #6), not new in R1b. **Controls for these deploys:**
  1. **No sign-in on a tag revision**, except in a **write freeze** (below). Unauthenticated probes on a tag are safe: they write at most single append-only security-audit documents.
  2. **Fresh revision right before the switch.** `services update --update-labels=reload=<stamp>` makes a new 0 % revision that loads Firestore at that moment. Switch as soon as it logs `Loaded existing data`. This is the 3 Oct hotfix method.
  3. **Write freeze** from the fresh revision's start until the switch, plus V2 on the tag (about 3–5 min):
     - the gate (Android app) and attendants pause entries and exits;
     - Masters and Site Admins don't edit anything;
     - the user tells Alphatech before.
     Low-traffic time only.
  4. **Rollback is also a switch to an instance with an old memory copy.** Never route traffic back to an old instance that has been idle. Roll back by **re-creating the old image as a fresh revision** (`--image <digest>`), then switching inside a freeze.
- `max-instances=1` per revision (07 R1B-S5) keeps it to one writer per revision. During a tag test, two revisions run, which is why rules 1–3 exist.

### 1. S7-1 control, before any deploy (user, on live `00128-gtt`)
Scripts: V1b and V2 as in "001 S7-1 control through the R1b deploy" above. Scheduler list as there. Result → table below.
| Check | Result (17 Oct) |
|---|---|
| V1b (Master, console) | **FAIL 17 Oct 15:08 UTC** (devops in Chrome, Master signed in by the user, live `00128-gtt`; raw XHR).<br>- 6 roles, 9 non-Master users.<br>- **`role-site-manager` (Site Facility Manager) has ALERTS Edit ON and 1 user on it: `ananya.site` (`usr-102`, ACTIVE, SPECIFIC_SITES Tech Park HQ Main Hub, created 1 Sep, last sign-in 21 Sep, no overrides).** This is the seeded demo Site Admin from `getDefaultRolesAndUsers()`. Most likely the pre-hotfix cold start of `00126` (2–3 Oct, see 001 08 hotfix section) re-seeded it and reset the role's ALERTS Edit to on, after the 2 Oct move.<br>- Custom role `role-1790920354180`: ALERTS Edit **false**; users `usr-1787676793073` (Tech Park HQ) and `usr-1788781764751` (Alphatech, = `alphatech.admin`).<br>- No ALERTS overrides.<br>- **Result: the S7-1 control is broken for one account.** Anyone signing in as `ananya.site` can run "Run cutoff scan" (cross-site PII + platform-wide alerts rewrite).<br>- **Deploy held until fixed and V1b re-run = OK.**<br>- **Fixed 17 Oct ~15:12 UTC** (user chose "both"; devops applied through the Master session, console API, targeted single-record syncs):<br>  1. `role-site-manager` ALERTS `canEdit` → **false** (only ALERTS changed; `POST /rbac/roles` 200).<br>  2. `usr-102` `ananya.site` → **SUSPENDED** (`POST /rbac/users` 200).<br>- **V1b re-run 15:13:39 UTC: `S7-1 OK`** (6 roles, 9 non-Master users, no role with ALERTS Edit, no overrides). **PASS.** |
| V2 (`alphatech.admin`, incognito): trigger-cron 403; slots 400/403/200 | **PASS 17 Oct 14:14 UTC** (devops in Chrome, signed in by the user, live `00128-gtt`).<br>- `alphatech.admin@parkflow.in` is on `role-1790920354180` (ALERTS canEdit **false**).<br>- `POST /alerts/trigger-cron` → **403** "Your role can't perform this action in ALERTS."<br>- `/slots`: no site **400**, site-1 **403**, Alphatech **200** (1,080 slots, all Alphatech).<br>- Note: the console's `window.fetch` wrapper adds the selected site header itself, so run V2 with raw XHR or curl. Through the app's `fetch`, "no site" shows 200 for its own site, which isn't a leak. |
| Scheduler jobs on `/alerts/trigger-cron` | **PASS** (17 Oct, user, Cloud Shell): `gcloud scheduler jobs list` in asia-south1, europe-west1 and us-central1 returned **no jobs** (no error) |

### 2. europe-west1 trigger: disable before any push of `main`
Trigger `c938b5a5-2f2e-40bb-94e9-b8a6e49f1add`, project `gen-lang-client-0904006743`, region europe-west1. Steps are in "R1b prep — 13 Oct" above (console: Cloud Build → Triggers → region europe-west1 → ⋮ → Disable; or the export/import CLI). **Proof required before any `git push origin main`:** `gcloud builds triggers describe c938b5a5-2f2e-40bb-94e9-b8a6e49f1add --project=gen-lang-client-0904006743 --region=europe-west1 --format="value(name,disabled)"` → ends in `True`. Status: **NOT DISABLED (17 Oct read)**: `describe` printed the name with an empty `disabled` field, so the trigger is **enabled**. Disable it before any push of `main`.
  - **DISABLED 17 Oct (user, Cloud Shell):** `gcloud beta builds triggers export` → `~/trigger.yaml` (77 lines; the original is kept as `~/trigger.backup.yaml`) → added `disabled: true` (the diff shows only that line) → `gcloud beta builds triggers import`. Re-check: `describe … --format="value(name,disabled)"` → `cloudrun-parking-management-solution-v2-git-asia-south1-Digixxx True`. **PASS.**
  - The first attempt (GA `gcloud builds triggers export` isn't in the GA track) changed nothing; the stray import was rejected with INVALID_ARGUMENT.
  - **Undo** (only after the release flow no longer needs it off): `gcloud beta builds triggers import --project=gen-lang-client-0904006743 --region=europe-west1 --source=$HOME/trigger.backup.yaml`.
  - **Effect:** a push to GitHub `main` no longer builds or deploys. Deploys stay manual (`gcloud run deploy --source` from Cloud Shell, per this plan).

### 3. Cloud Run scaling (07 R1B-S5: keep max-instances=1)
Read-only: service template and live-revision annotations `autoscaling.knative.dev/maxScale` and `minScale`. Expected **1 / 1** (set 2 Oct, 001 08 P2-5). Status: **PASS (17 Oct, user)**: service template `maxScale '1'` / `minScale '1'`; live revision `00128-gtt` `maxScale '1'` / `minScale '1'`; traffic 100 % `00128-gtt` (latestRevision: true).

### 4a. Deploy plan: hotfix R1B-S1 (`hotfix/r1b-s1` @ `bbfdbcc`)
Order: this goes **first**, on its own, so the S1 fix is live without waiting for R1b. All in Cloud Shell, **one step at a time, output pasted back**. No traffic moves without the user's go.
- **H0. Pre-checks:** sections 1–3 above all ☐→PASS. Get the rollback image:
  `gcloud run revisions describe parking-management-solution-v2-git-00128-gtt --region asia-south1 --project gen-lang-client-0904006743 --format="value(spec.containers[0].image)"`. Record it here.
  - **Recorded 17 Oct:** `asia-south1-docker.pkg.dev/gen-lang-client-0904006743/cloud-run-source-deploy/parking-management-solution-v2-git@sha256:4e0325f9e00c733a927a9ccf2066ae06b67d981e756001e8ea288a3e4d45145b` (= the 3 Oct hotfix image `4e0325f9…`).
- **H5–H7 (17 Oct, user GO with the gate paused):**
  - 15:26:23 `services update --update-labels=reload=… --no-traffic --tag hf-s1` → fresh revision **`00137-puf`** (same hotfix image). `ready:true` 15:27:35 with counts 1080/186/151 = live.
  - **15:28:39 UTC `update-traffic --to-revisions 00137-puf=100` → live 100 % `parking-management-solution-v2-git-00137-puf`.** Tag `hf-s1` removed after.
  - Post-switch via admin.parkflows.in:
    - health ready 1080/186/151 (no data change across the switch);
    - **`/API/V1/rbac/roles` 401 (was 200)**; `/api/v1/rbac/roles/`, `/Api/V1/Slots`, `/API/V1/RBAC/USERS`, `/api/v1/slots`, `/api/v1/rbac/roles` 401; `/` 200; `/api/v1/domains` 400;
    - `//api//v1/rbac/roles` 307 (Firebase Hosting normalises the double slash; direct to Cloud Run it's 401).
    - **PASS.**
  - All sessions ended with the switch (in-memory per instance); users sign in again.
  - **Open in H7:**
    - V1b/V2 on the new revision (needs fresh sign-ins);
    - the gate test entry/exit;
    - `/domains?siteId=site-1787676715259` still lists **`company.com`** (+ `parkflows.in`). Same residual as 3 Oct (re-seeded by the pre-hotfix cold start), not caused by this switch; removal is a Master action.
  - **Rollback now:**
    1. Freeze.
    2. `gcloud run deploy parking-management-solution-v2-git --region asia-south1 --image asia-south1-docker.pkg.dev/gen-lang-client-0904006743/cloud-run-source-deploy/parking-management-solution-v2-git@sha256:4e0325f9e00c733a927a9ccf2066ae06b67d981e756001e8ea288a3e4d45145b --no-traffic`.
    3. Wait for ready.
    4. Switch.
- **Post-switch S7-1 checks (17 Oct, live `00137-puf`):**
  - **V1b 15:32:25 UTC: `S7-1 OK`.** `role-site-manager` ALERTS canEdit false (Firestore doc updated 15:12:53, so durable).
  - **Finding (data durability, Major): `usr-102` was ACTIVE again after the switch.**
    - Firestore `appUsers/usr-102` was last written 22 Sep: the 15:12 suspension never persisted.
    - Log 15:34:08: `[firestore] Targeted sync failed: … Cannot use "undefined" as a Firestore value (found in field "customModuleOverrides")`.
    - Seeded user documents have no `customModuleOverrides`. `saveAppUser` copies the existing `undefined` value, and Firestore (no `ignoreUndefinedProperties`) rejects the write. The API still returns 200.
    - **Workaround applied 15:35:22** (Master session): save with `{status:'SUSPENDED', customModuleOverrides:{}}` → Firestore `usr-102` SUSPENDED, updateTime 15:35:22. Durable.
  - **Same defect on 5 more user documents** (Firestore read, 11 docs): `usr-digi-master` (Platform Master Admin), `usr-101` (seed Platform Master Admin), `usr-103` (valet supervisor), `usr-104` (MIS auditor), `usr-105` (gate attendant), all ACTIVE.
    - **Any edit to them (status, role, sites, password via `setUserPassword` if it writes the whole record) is lost on the next restart.** That includes the pending "change the Master Admin password" action.
    - Until fixed: include `customModuleOverrides: {}` in the first save for each, and verify the Firestore `updateTime` after a password change.
    - Backlog: KNOWN_ISSUES.md "Seeded users: edits silently not persisted".
- **H8 re-check (15:37 UTC, switch + ~9 min):** traffic 100 % `00137-puf`; health ready 1080/186/151; `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `/Api/V1/Slots`, `/API/V1/RBAC/USERS`, `/api/v1/rbac/roles` all 401; **V1b `S7-1 OK`** (15:37:29); `usr-102` SUSPENDED. **PASS.** Pending: gate test, `company.com` decision.
- **V2 on `00137-puf` (15:39:05 UTC, `alphatech.admin`, custom role, raw XHR): PASS.**
  - `POST /alerts/trigger-cron` **403** "Your role can't perform this action in ALERTS." (the POST is only sent after checking the role's ALERTS canEdit = false).
  - `/slots` no site **400**, site-1 **403**, Alphatech **200**.
  - Note: with a session, `/API/V1/rbac/users` and `/API/V1/rbac/roles` return 200 **`text/html` (the console SPA page, no data)**. Case-sensitive routing means no API route matches; `/api/v1/rbac/users` = 403. Not a leak.
- **Hotfix R1B-S1: DONE** (pending only the gate confirmation).
- **H2–H4 done 17 Oct (devops, user's approval for the no-traffic deploy):**
  - `gcloud run deploy --source ~/pf-hf --no-traffic --tag hf-s1` → revision **`parking-management-solution-v2-git-00136-bos`** (image `…4b656c5c8762f6a760af`), 0 %.
  - Tag URL `https://hf-s1---parking-management-solution-v2-git-zjwybzul6q-el.a.run.app`.
  - Traffic still **100 % `00128-gtt`**.
  - Env: `FIREBASE_PROJECT_ID`, `BOOTSTRAP_ADMIN_PASSWORD`, `AUDIT_HMAC_SECRET` (secret) — same as live. min/max **1/1**.
  - Startup: `ready:false` at 15:23:11 → **`ready:true` 15:23:42 UTC** (1080 slots / 186 occupied / 151 employees = live's counts). Health was polled (no sign-in).
  - **H4 unauthenticated probes, tag vs live:**
    - `/` 200/200; `/api/v1/slots` 401/401; `/api/v1/domains` 400/400; `/api/v1/rbac/roles` 401/401;
    - **`/API/V1/rbac/roles` 401 / 200 (live leaks; fixed on the tag)**;
    - `/api/v1/rbac/roles/` 401/401; `//api//v1/rbac/roles` 401/307; `/Api/V1/Slots` 401/401; `/API/V1/RBAC/USERS` 401/401.
    - **PASS.**
  - No sign-in was done on the tag (data-safety rule).
- **H1 done 17 Oct:** bundle uploaded by the user (sha256 `ce80549f…208ad4`, 1,627,069 bytes, matches devops); cloned to `~/pf-hf` → `bbfdbcc`, tree `aaf3ffe8…`, clean.
- **H1. Source:** bundle `pf-hotfix-r1bs1-bbfdbcc.bundle` → `git clone -b hotfix/r1b-s1 … ~/pf-hf && cd ~/pf-hf && git log -1 --oneline` → must show `bbfdbcc`. Deploy **from that folder only**, never from `~`.
- **H2. Deploy, no traffic:** `gcloud run deploy parking-management-solution-v2-git --source . --region asia-south1 --no-traffic --tag hf-s1`.
  - Check traffic is still 100 % on `00128-gtt`: `gcloud run services describe … --format="yaml(status.traffic)"`.
  - Check the new revision keeps the env and secret (`AUDIT_HMAC_SECRET`, `FIREBASE_PROJECT_ID`, `SITE_SCOPE_MODE`) and max/min = 1.
- **H3. Startup log:** `Loaded existing data from Firestore.` with **no sync line before it**.
- **H4. Smoke on the tag URL, unauthenticated only (no sign-in):**
  - `/api/v1/health` → `ready:true`; `/` → 200; `/api/v1/slots` → 401; `/api/v1/domains` → 400.
  - **R1B-S1:** `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `//api//v1/rbac/roles`, `/Api/V1/Slots` → **401** each.
  - Same probes on `https://admin.parkflows.in` (live, before the switch) as a baseline: `/API/V1/rbac/roles` is expected **200** today, which is the bug.
- **H5. Go/no-go:** the user says go.
- **H6. Write freeze + fresh revision + switch:**
  1. Freeze on (gate and console).
  2. `gcloud run services update parking-management-solution-v2-git --region asia-south1 --update-labels=reload=$(date +%Y%m%d%H%M) --no-traffic` → new revision.
  3. Wait for its `Loaded existing data`.
  4. `gcloud run services update-traffic parking-management-solution-v2-git --region asia-south1 --to-latest`.
  5. Remove tag `hf-s1`.
- **H7. Post-switch (still in the freeze):**
  - via admin.parkflows.in: health `ready:true` with the same slot/occupied/employee counts as before the switch;
  - R1B-S1 probes → 401;
  - **V2** as `alphatech.admin` (sign in on live now) → 403, 400/403/200;
  - **V1b** as Master → `S7-1 OK`;
  - `/domains?siteId=site-1787676715259` → no `company.com`.
  - Freeze off. The gate does one test entry/exit on the Android app.
- **H8. +10 min:** V1b + V2 again; health counts plausible.
- **Rollback (any failure in H6–H8):**
  1. Freeze on.
  2. `gcloud run deploy parking-management-solution-v2-git --region asia-south1 --image <00128 image from H0> --no-traffic`.
  3. Wait for `Loaded existing data`.
  4. `--to-latest` (or `--to-revisions <that new revision>=100`).
  5. Freeze off.
  - Don't route straight back to the idle `00128-gtt` instance (old memory copy). No data shape changed, so no data rollback. PITR is on (7 days) as the last resort.

### 4b. Deploy plan: R1b console (`feature/002-r1b` @ `9ac2843`), demo-form flag OFF
After 4a has run cleanly for at least a day.
- **Preconditions:**
  - 4a done; sections 1–3 PASS.
  - Marketing stays on the R1a live release (flag OFF, no D1 rewrite), so parkflows.in can't reach the demo route.
  - `DEMO_HOSTING_EGRESS_CIDRS` stays **unset**, so on Cloud Run every demo POST gets 403 (fails closed, 03 v1.3). The D1 preview and CIDR work is separate, before the flag ever goes ON.
- **R0. Rollback image:** the image of the 4a revision (`describe … --format="value(spec.containers[0].image)"`). Record it.
- **R1. Source:** bundle → clone `-b feature/002-r1b` → `git log -1` = **`9ac2843`**. Deploy from that folder only.
- **R2.** `gcloud run deploy … --source . --region asia-south1 --no-traffic --tag r1b`. Traffic unchanged; env, secret and max/min = 1 checked.
- **R3. Startup log:** `Loaded existing data`, no sync before it. Note the `[demo-requests] DEMO_HOSTING_EGRESS_CIDRS is not set` warning (expected).
- **R4. Unauthenticated smoke on the tag:**
  - health `ready:true`; `/` 200 (new console shell); `/api/v1/slots` 401; R1B-S1 probes 401;
  - `/api/v1/overview`, `/api/v1/sites/summary`, `GET /api/v1/demo-requests` → 401 / 405 (not signed in);
  - `POST /api/v1/demo-requests` (honeypot body) → **403 `ERR_VIA_HOSTING_ONLY`** (no CIDR list).
- **R5. V2 on the tag URL (needs a sign-in on the tag, so only inside the write freeze):**
  1. User's go.
  2. Freeze on.
  3. Fresh revision (`--update-labels=reload=…`, `--no-traffic`, then move tag `r1b` to it: `gcloud run services update-traffic … --update-tags r1b=<new revision>`).
  4. Wait for `Loaded existing data`.
  5. **V2 on the tag URL** as `alphatech.admin`: trigger-cron **403**; slots 400/403/200.
  6. Quick console smoke as Site Admin (A) on the tag, **read-only**: sign-in lands on Overview, Live parking, Employees & vehicles, Alerts list (do **not** press "Run cutoff scan").
  7. Then, **in the same freeze**, go straight to R6 (the tag revision now holds the freshest store).
- **R6. Switch:**
  - `gcloud run services update-traffic … --to-revisions <r1b revision>=100`, then `--to-latest`; remove tag `r1b`.
  - Post-switch checks via admin.parkflows.in:
    - health counts equal pre-switch;
    - smoke S1–S9 by role, read-only first;
    - Master: Overview, Sites (summary, side panel), Demo requests page (empty or test rows only);
    - Site Admin A: Overview, Live parking, Employees & vehicles; No access on `#/sites`;
    - multi-site admin: Choose a site;
    - view-as is read-only;
    - V1b + V2.
  - Freeze off. Gate test entry/exit.
- **R7. +10 min:** V1b + V2; health; `/domains` (no `company.com`).
- **Flag stays OFF:** no marketing deploy, no `PF_DEMO_FORM`, no D1 rewrite in this step.
- **Rollback:** as in 4a, with the **4a image** (R0), using a fresh revision inside a freeze.
  - R1b's new fields (slot `lengthM`/`palletLevel`, `demoRequests`) are optional and ignored by the older code (03 rollback), so there's no data rollback. PITR covers the last resort.
- **Execution log 17 Oct (user: "deploy R1b, plan 4b in 08"):**
  - **Deviation, user decision:** R1b starts the same day as the hotfix (the plan said to wait about a day after 4a). The hotfix had run cleanly since 15:28 UTC (V1b/V2/health PASS at +10 min). The gate test confirmation is still pending.
  - Source `feature/002-r1b` @ **`9ac2843`** (CR PASS, QA "R1b final" PASS, security delta PASS, 17 Oct). Contains `cfdff14` (R1B-S1 cherry-pick), R1B-S2, BUG-R1B-6/7. Bundle `pf-002-r1b-9ac2843.bundle`, 2,110,647 bytes, sha256 `7799a8de17b259e91475754865e6a5fb3f6ede1a0b1ec8b91a3c2d7c7e8c755d`.
  - **R0 rollback image (= hotfix `00137-puf`):** `asia-south1-docker.pkg.dev/gen-lang-client-0904006743/cloud-run-source-deploy/parking-management-solution-v2-git@sha256:003293961f0bb97c3eca24e32d7fb4a5ffa046979ee54b656c5c8762f6a760af` (saved in Cloud Shell `~/r1b-rollback-image.txt`).
  - **R1–R4 (17 Oct):**
    - Bundle uploaded (the first upload was the wrong 4 KB file `pf-002-r1b-fe-r1b67-9ac2843.bundle`, not used). sha256 `7799a8de…c755d` matches; `~/pf-r1b` @ `9ac2843`, clean, contains `cfdff14`.
    - Build `f1bcfcda` 15:52:41 → SUCCESS → revision **`00140-xox`**, tag `r1b`, **0 %**. Tag URL `https://r1b---parking-management-solution-v2-git-zjwybzul6q-el.a.run.app`. Live 100 % `00137-puf`.
    - Env `FIREBASE_PROJECT_ID`, `BOOTSTRAP_ADMIN_PASSWORD`, `AUDIT_HMAC_SECRET` (no `DEMO_HOSTING_EGRESS_CIDRS`, fails closed); min/max 1/1.
    - `ready:true` 15:57:11 UTC, 1080/186/151 = live.
    - **R4 signed-out probes on the tag:**
      - `/` 200 with title **"ParkFlows · Console"** (live: "ParkFlow | Smart Parking Management System");
      - `/api/v1/slots` 401; `/api/v1/domains` 400;
      - `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `//api//v1/rbac/roles` 401;
      - `/api/v1/overview` 401; `/api/v1/sites/summary` 401;
      - `GET /api/v1/demo-requests` 405; `POST /api/v1/demo-requests` (honeypot) **403 `ERR_VIA_HOSTING_ONLY`**.
      - **PASS.**
  - **R5/R6 (user GO, gate paused from ~15:58):**
    - 15:59:05 fresh revision **`00141-jen`** (tag `r1b`), `ready:true` 15:59:42, counts = live.
    - **V2 on the tag was impossible:** the R1b `Login.tsx` posts to the absolute `API_BASE` (`https://parking-management-solution-v2-git-430896008903.asia-south1.run.app`, the *service* URL, which serves the live revision). The tag-origin page is then cross-origin to the live hotfix, whose CORS allowlist doesn't include the tag host → "Couldn't reach ParkFlows" for every account.
    - Not a production problem: admin.parkflows.in is in `ALLOWED_ORIGINS`. Plan note for next time: V2 on a tag needs the tag origin in `CORS_ALLOWED_ORIGINS`, or V2 runs after the switch.
    - User chose "switch now, V2 after".
    - **16:11:30 UTC `update-traffic --to-revisions 00141-jen=100` → R1b LIVE.** Pre/post counts 1080/186/151 = live. Tag `r1b` removed.
    - **Post-switch probes (admin.parkflows.in):**
      - `/` 200 title "ParkFlows · Console"; `/api/v1/slots` 401; `/api/v1/domains` 400;
      - `/API/V1/rbac/roles`, `/api/v1/rbac/roles/` 401; `/api/v1/overview`, `/api/v1/sites/summary` 401;
      - GET demo-requests 405; POST demo-requests 403 (flag OFF, no CIDR list).
      - **PASS.**
    - **Gate test: PASS** (user confirmed 17 Oct: gate unpaused, test entry/exit on the Android app worked on R1b `00141-jen`).
    - **R7 +10 min (16:21:17 UTC): PASS.** 100 % `00141-jen`; health ready 1080/186/151; `/api/v1/slots`, `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `/api/v1/overview`, `/api/v1/sites/summary` 401.
    - **R1b console: LIVE and verified (17 Oct 16:11:30 UTC).** Flag OFF, marketing unchanged (R1a release), `DEMO_HOSTING_EGRESS_CIDRS` unset.
      - Rollback: hotfix image `sha256:00329396…a760af` as a fresh revision inside a gate pause.
      - Follow-ups: D1 preview + CIDR list before the flag goes ON; R1b-C1 Sites panel; seeded-user persistence bug; `company.com`; seed accounts; tag-URL CORS for V2 next time.
    - **User action after the release (17 Oct ~16:25 UTC):** the user deactivated site **"Test"** (`site-1789004286777`, code PUNE 1) in the new Sites screen. `/sites/summary` shows it `DEACTIVATED`. Other sites: Tech Park HQ, Alphatech, Cyber Tower ACTIVE; Mindspace ON_HOLD; Fintech Plaza DEACTIVATED.
      - `updateSiteStatus` uses a full `saveDB()` sync. **Firestore confirmed:** `sites/site-1789004286777` status DEACTIVATED, updateTime 16:38:03 UTC. Durable.
    - **`company.com` (user request, 16:50:29 UTC):** `dom-1` is a platform-wide entry (all sites), not Alphatech-only. Removed via `POST /api/v1/domains/remove {domainId:'dom-1'}` as Master → 200. `/domains/manage` and public `/domains?siteId=site-1787676715259` now list only `parkflows.in`.
      - **Not durable yet:** `removeWhitelistedDomain` splices memory and calls a full `saveDB()`, and a full sync never deletes documents. Firestore `whitelistedDomains/dom-1` (company.com, updateTime 2 Oct) is still there and would return on the next restart. That's the real mechanism behind the earlier `company.com` reappearances.
      - Durable removal = delete that Firestore document (a permanent delete, PITR 7 days). **Done by the user 17 Oct ~17:00 UTC** (REST DELETE `whitelistedDomains/dom-1`). Re-read → **404**; public `/domains?siteId=site-1787676715259` → `parkflows.in` only. **Durable. PASS.**
    - **Master account prepared for a password change (16:59:30 UTC):** `usr-digi-master` re-saved with `customModuleOverrides` set (no other change). Firestore updateTime 16:59:31, field present. The next password change will persist.
    - **Master password changed by the user (17 Oct, ~17:06 UTC):** Firestore `appUsers/usr-digi-master` updateTime **17:06:33** (after the 16:59:31 prep), ACTIVE. The change is durable across restarts. Devops saw only the update time and a fingerprint of the stored hash, never the password. Closes the 001 leftover "change the Master Admin password (exposed in chat)".
      - Note (S7-6, open): existing sessions aren't ended by a password change; they expire on their own, and any restart ends them.
      - Code fix: targeted Firestore delete in `removeWhitelistedDomain` (same as B6 `deleteFirestoreDocs`). Add to the KNOWN_ISSUES seeded-user entry / backlog.
    - **Seed/demo accounts suspended (user request, 16:53 UTC, Master `usr-digi-master`; each saved with `customModuleOverrides` set, so the write persists):**
      - `usr-101` superadmin (Platform Master Admin, all sites);
      - `usr-103` suresh.valet (valet supervisor);
      - `usr-104` rajesh.audit (MIS auditor, all sites);
      - `usr-105` ramesh.gate (gate attendant, Tech Park HQ; last sign-in 21 Sep — not Alphatech's gate account, which is `global`, still ACTIVE).
      - **Firestore confirmed SUSPENDED** for all four (16:53:39–16:53:40 UTC) and for `usr-102` (15:35:22).
      - Only active Master now: `usr-digi-master`.
    - **V1b on live R1b (16:15:27 UTC, Master): `S7-1 OK`** (6 roles, 9 non-Master users, `role-site-manager` ALERTS Edit false, `usr-102` SUSPENDED). Master: `/sites/summary` 200 (6 sites), `/demo-requests` 200 (0 requests). 16:15:43 probes: 100 % `00141-jen`, health 1080/186/151, `/api/v1/slots`, `/API/V1/rbac/roles`, `/api/v1/rbac/roles/`, `/api/v1/overview` 401, demo POST 403. **PASS.**
    - **V2 on live R1b (16:14:07 UTC, `alphatech.admin`, raw XHR, POST sent only after the role check): PASS.**
      - trigger-cron **403**; `/slots` no site / site-1 / Alphatech **400/403/200**;
      - new `/overview` Alphatech **200**, site-1 **403**;
      - `/sites/summary` **403** (Master only); `GET /demo-requests` **403** (Master only).
      - The new console renders for the Site Admin (Overview, Live parking, Entry/exit log, Alerts, Reports, Valet seen).
  - **R5/R6 (user GO, gate paused from ~15:58):**
    - 15:59:05 fresh revision **`00141-jen`** (tag `r1b`), `ready:true` 15:59:42, counts = live.
    - **V2 on the tag was impossible:** the R1b `Login.tsx` posts to the absolute `API_BASE` (`https://parking-management-solution-v2-git-430896008903.asia-south1.run.app`, the *service* URL, which serves the live revision). The tag-origin page is then cross-origin to the live hotfix, whose CORS allowlist doesn't include the tag host, so every account gets "Couldn't reach ParkFlows".
    - Not a production problem: admin.parkflows.in is in `ALLOWED_ORIGINS`. Plan note for next time: V2 on a tag needs the tag origin in `CORS_ALLOWED_ORIGINS`, or V2 runs after the switch.
    - User chose "switch now, V2 after".
    - **16:11:30 UTC `update-traffic --to-revisions 00141-jen=100` → R1b LIVE.** Pre/post counts 1080/186/151 = live. Tag `r1b` removed.
    - **Post-switch probes (admin.parkflows.in):**
      - `/` 200 title "ParkFlows · Console"; `/api/v1/slots` 401; `/api/v1/domains` 400;
      - `/API/V1/rbac/roles`, `/api/v1/rbac/roles/` 401; `/api/v1/overview`, `/api/v1/sites/summary` 401;
      - GET demo-requests 405; POST demo-requests 403 (flag OFF, no CIDR list).
      - **PASS.**
    - Pending: V2 (alphatech.admin) + V1b (Master) on live, gate test, +10 min re-check.
- **Watch item:** Sites panel R1b-C1 lists only `role-site-manager` users as site admins. Alphatech's admins are on the custom role, so the panel will show none. **Don't move anyone to fix that** (S7-1 control). Backlog item, frontend.
