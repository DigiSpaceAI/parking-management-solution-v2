# 002 R1b — hand-off brief for backend-dev and frontend-dev
> **SUPERSEDED 13 Oct (devops).** When this was written (11 Oct), devops had only checked `feature/002-design-system`. `feature/002-r1b` already existed, and B1–B6, F1–F10 and BUG-3 were built the same day (see 04, 05 and the review log). The rules and release notes below still apply; the "Not built" and "Branch" parts don't.
Author: devops · Date: 2026-10-11 · Source of truth: `01-prd.md` v1.5 (R1b row), `02-ux-design.md`, `03-tech-design.md` v1.2 (task table, order), `05-code-review.md`, `06-test-report.md`.
This brief adds no scope. If it disagrees with 01/03, 01/03 win.

## Where things stand (11 Oct)
- **Live:** 001 Platform v1 + 2 Oct hotfix on Cloud Run `00128-gtt` (admin.parkflows.in). R1a marketing site on Firebase site `parkflows-marketing` (parkflows.in), demo-form flag **OFF**.
- **Done for 002:** R1-pre T1–T6 (design system, components, marketing) on `feature/002-design-system` @ `b4200a1`.
- **Not built:** all R1b tasks. Backend: B1–B6. Frontend: F1–F10.
- **`main` @ `84ec8ef`:** contains 001 + hotfix. It is local only (not pushed). Its tree is identical to the live revision.

## Branch (devops prepares, on the user's OK)
- New branch **`feature/002-r1b`** = `feature/002-design-system` (b4200a1) + merge of `main` (84ec8ef).
- Dry check: the only file both sides changed is `package.json`. Both add `"test:qa"`; resolution = 002's script block (it already contains `test:qa`). No other conflicts are expected.
- All R1b work goes on `feature/002-r1b`. Don't commit to `main`, don't push.

## Order (03 "Order")
1. **backend-dev:** B1–B6 in parallel, then `npm run lint`, `npm run build`, `test:qa`.
2. **frontend-dev:**
   - F1 → F2;
   - then F3–F7 and F10, each after its backend dependency (F4 needs B3; F5 needs B1/B2; F7 needs B4 + B5; F10 needs B6);
   - then F8, then F9 (the F9 delete commit separate).
3. **frontend-dev:** **BUG-3** (noscript inline `<style>` vs the D1 CSP `style-src 'self'`). It must be fixed before the demo-form flag is turned on.
4. Each dev updates `04-implementation-notes.md` (R1b section) → code-reviewer `05` → qa `06` → devops `08`.

## Rules that matter for the release (CLAUDE.md)
- Every read/write/route/list is site-scoped (`siteId`). The new endpoints `/overview`, `/sites/summary`, `/sites/update` and `/demo-requests` follow 03's role/site rules exactly.
- No new dependencies. No `firestore.rules` change (03: stays deny-all). No env vars or secrets (03: no mail provider).
- `server.ts`: use targeted `syncSpecificRecords` for new writes (`demoRequests`, site update). Don't add full `saveDB()` syncs, which are a known risk.
- Cold-start guard (2 Oct hotfix) must stay: no Firestore writes and 503 `ERR_STARTING` until the store is loaded. Keep `tests/qa/*hotfix*` green.
- API changes are additive only. The deployed Android app calls `/slots` and must keep working.

## What devops needs written in 04 (for the release)
- The final list of new/changed endpoints and of new Firestore collections (`demoRequests` only, per 03).
- Any change to `package.json` scripts or build output paths (`dist/`, `dist-mobile/`, `dist-marketing/`).
- Confirmation that `bun.lock` is unchanged (Bun 1.4.2 buildpack, lockfileVersion 2).
- Whether a data backfill is needed (03 says no: new slot fields are optional).

## Devops work that runs in parallel (not code)
- **Export the live admin hosting config** (`gen-lang-client-0904006743` site: rewrites to Cloud Run, headers). Then add an `admin` target to the root `firebase.json` / `.firebaserc` together with the D1 files (03 rule 5 approval covers D1). Until then every deploy uses `--only hosting:marketing`.
- **D1 rewrite:** add `/api/v1/demo-requests` → Cloud Run `parking-management-solution-v2-git` (asia-south1) to the marketing target. This is approved in 03 v1.1 and ships with the flag ON.
- **Firestore PITR on `parkorbitv2direct`** before the R1b deploy (001 leftover).
- **Before pushing `main`:** disable the europe-west1 GitHub trigger.

## R1b release shape (devops, after QA PASS + user go)
1. Cloud Run: source deploy of `feature/002-r1b` with `--no-traffic`. Check the startup log and image digest, then smoke-test via the revision URL, then move traffic. Rollback = traffic back to `00128-gtt`.
2. Marketing: rebuild with `PF_DEMO_FORM` **ON** + the D1 rewrite → preview channel → QA → live. Rollback = Firebase release rollback (flag-OFF build b4200a1).
3. **Email:** the form needs no mail (03 Q-6), but the privacy page's contact is `sales@parkflows.in`. MX/SPF should exist before the flag goes ON (gate 1 was waived for R1a only).
