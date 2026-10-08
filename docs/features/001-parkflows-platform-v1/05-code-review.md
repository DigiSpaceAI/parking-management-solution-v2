# Code Review — ParkFlows Platform v1, Phase 1 (round 3)
Reviewer: code-reviewer · Date: 2026-09-29 · Scope: `feature/001-parkflows-platform-v1` @ `2c8a46b` vs `main` @ `d42af6f`. Round-3 delta: `2a7de87..2c8a46b` (backend `af00706..5bf3523`, frontend `17ececd..a485dda`, mobile `523218e`, docs).
Checked against: `03-tech-design.md` **v1.0.1** (APPROVED 2026-09-29), `02-ux-design.md` v1.1, `01-prd.md` Addenda A–C, `04-implementation-notes.md` (round-2 fix sections). This replaces the round-2 review.

## Gaps found in inputs
1. **B17 is not built.** v1.0.1 lists B17 as "the only remaining build task" and says code review round 3 covers "B17 + M1 (+ gap 13)". There is no B17 commit on the branch, and `submitRegistrationRequest` / `bulkUploadRegistrations` / `approveRegistrationRequest` are unchanged apart from m-1. See N-2.
2. **`03` gap 13 does not reproduce as described.** It says B3's batch check only covers rows with an `id`. For registrations that isn't so: `POST /registrations/bulk-upload` runs `stampBulkRows` with a **plate-or-email** matcher, which is the same predicate and the same array order as `bulkUploadRegistrations`. **Repro:** a Site A admin (REGISTRATION canCreate) bulk-uploads a row with a Site B request's plate, with `autoApprove:true` → **403 `ERR_SITE_FORBIDDEN`**. The whole batch is refused, and the Site B request is unchanged (still PENDING). So there is **no cross-site write today**. The DB function on its own is still unsafe, though, and the route refusal also blocks legitimate same-plate rows at another site. B17 fixes both. I graded it inside N-2, not as a separate finding.
3. **Uncommitted working-tree changes.** QA's updated `tests/qa/001-platform-v1.api.test.mjs`, the new `tests/qa/001-browser-checks.md`, `08-release.md`, `review-log.md` and this file are modified but not committed on the branch. Commit them with the feature.
4. **How I ran the checks.** On a clean clone of `2c8a46b` (bundle → cloud workspace), using QA's uncommitted platform suite copied in. The repro scripts are throw-away and not in the repo. I made **no** source edits.

## Round-2 findings — status
| # | Round-2 finding | Status | Evidence |
|---|---|---|---|
| C-1 | Public `GET /domains` listed every site's domains with `siteId` + admin names | **Fixed** (`af00706`, `17ececd`) | Anonymous with no site → 400 `ERR_SITE_REQUIRED`. `?siteId=B` → `{domain}` names only (B's + platform-wide), with no `id/siteId/addedBy/createdAt`. `?siteId=A` doesn't show B's domain. The admin panel uses the authenticated `/domains/manage` (`REGISTRATION:view` + `resolveSite`). The registration forms send the chosen site. |
| M-1 | Non-Master self-escalation via `POST /rbac/users` | **Fixed as specified** (`72be703`) | The round-2 repro (self `customModuleOverrides` → `MASTER_CONFIG`) now gets 403 `ERR_MASTER_ONLY`. `userSaveRefusal` covers own role/overrides/sites/status, newly-privileged overrides, and privileged or all-sites role assignment. Tests added. **But see N-1:** the same route still allows account takeover. |
| M-2 | Non-Master could edit/delete global custom roles | **Fixed** (`25927dd`, UI `a485dda`) | A non-Master with USER_MANAGEMENT gets 403 `ERR_MASTER_ONLY` on POST and DELETE `/rbac/roles` (reproduced). The roles matrix is read-only for non-Masters. |
| M-3 | M1 attendant blocking screen not built | **Fixed** (`523218e`) | `resolveSiteContext` now returns `ok / no-site / error / session-expired` and clears the site on failure. `ParkFlowsApp` sets `currentUser` only after `ok`, so the gate, MANUAL and the `/slots` poll can't run before that. "Couldn't load your site" appears with Try again + Sign out; 401 → sign-in; a retry-vs-sign-out race is guarded by an attempt counter. Matches `03` M1. |
| m-1 | Bulk registration didn't fail closed | **Fixed** (`0dc2d0d`) | An empty whitelist → per-row "Registration isn't open for this site yet." |
| m-2 | Master could move a record to a site that doesn't exist | **Fixed** (`c5cd6e9`) | 400 "That site does not exist. Nothing was changed." |
| m-3 | `ERR_SITE_FORBIDDEN` used for self/privileged refusals | **Fixed** (`98e4a2c`) | Self/privileged → `ERR_MASTER_ONLY`; out of scope → `ERR_SITE_FORBIDDEN` (toggle-module and reset-token). |
| m-4 | Dead `denyForeignSite` + stale comment | **Fixed** (`5bf3523`) | — |
| m-5 | Simulator tab shown while viewing as a non-Master | **Fixed** (`5386121`) | `isMaster={isMasterAdmin(viewer)}` |
| m-6 | Registration duplicate-plate check spans all sites | **Open → B17** | The architect decided per site (v1.0.1). It isn't built; see N-2. |
| m-7 | Session token sent to every origin | **Fixed** (`9657b47`) | `isTrustedApiOrigin` limits the token to the page origin + `API_BASE` origin. `API_BASE` moved to `src/apiBase.ts`. |
| m-8 | CSV export puts the session token in the URL | **Open (deferred)** | Not changed. This is the security reviewer's call (step 7); not a blocker for this gate. |

## Findings (open)
| # | Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|---|
| N-1 | **Major** | `server.ts` `userSaveRefusal` / `POST /rbac/users` (L2520-2566) + `src/server/db.ts` `saveAppUser` (L3762-3765) | **Account takeover through `plainPassword` (H8, new).** A non-Master with USER_MANAGEMENT can set `plainPassword` on **any other account inside their sites**, including one with a *more* privileged role, and then sign in as that person. `userSaveRefusal` only checks role, override, site and status *changes*. It never checks the **target's current privileges** or a password set.<br>**Reproduced:** Master creates custom role "Site HR" (USER_MANAGEMENT) and "Site Ops Plus" (MASTER_CONFIG full), with one user of each at Site A. HR posts `{id: <ops user>, plainPassword: …}` → **200**. HR then signs in as the Ops user → **200** and now holds MASTER_CONFIG edit.<br>Cross-site writes were still refused in my test (`/sites/status` for Site B → 403 via `enforceSiteScope`), so this is Major, not Critical. It does defeat H8 ("USER_MANAGEMENT must never let a non-Master raise privileges") and the reset-token design (out-of-band handover, never self). | In `userSaveRefusal`, for a non-Master caller:<br>(a) refuse `plainPassword` on any **existing** account other than their own, and point them to `POST /auth/admin/generate-reset-token` (403 `ERR_MASTER_ONLY`);<br>(b) refuse **any** edit of an account whose current role grants privileged rights or `ALL_SITES`, or whose current overrides enable a privileged module;<br>(c) apply the same rule (b) in `generate-reset-token`, since a reset token for a privileged same-site account is the same takeover by another route.<br>Add a backend test for each. | Open |
| N-2 | **Major** | `src/server/db.ts` `submitRegistrationRequest` (L2375-2428), `bulkUploadRegistrations` (L2903), `approveRegistrationRequest` | **Approved task B17 (v1.0.1: m-6 + gap 13) is not built.** Today:<br>(1) the public registration duplicate checks are global. **Reproduced:** a PENDING request for `KA01AB1234` at Site B blocks the same plate at Site A with "A registration request for bee2@x.test / KA01AB1234 is ALREADY pending…". That tells a public caller a request exists at *some* site, and it blocks the per-site passes AC-27 / US-25 allow;<br>(2) the DB bulk upsert still matches across sites. The route's batch refusal is the only guard (gap 2), and it also refuses legitimate rows;<br>(3) approve doesn't refuse a same-site duplicate active pass. | Build B17 exactly as `03` v1.0.1 specifies: site-scoped plate/pending checks in submit; site-scoped upsert match in bulk (then relax the route matcher to the row's site, so same-plate rows at another site become new requests there); same-site duplicate refusal in approve; generic messages; the 4 tests listed in B17. | Open |
| n-1 | Minor | `src/components/EmployeeMobileApp.tsx` (L436-437) | **Made-up domains shown as valid.** When the public list is empty, or no single site is chosen, the in-console Employee app preview falls back to hard-coded `defaultDomains` (`company.com`, `techcorp.com`, …) and treats them as valid. This existed before; C-1 touched it. The server still enforces the real list. | Drop the fallback. With no names, show "Checked for your site when you submit." as `EmployeeRegistration` now does. | Open |

## Build / lint / tests
Clean clone of `2c8a46b`, Node 22:
- `npm run lint` (tsc --noEmit): **PASS** (exit 0).
- `npm run build` (web + server + mobile): **PASS**.
- `tests/qa/001-backend.api.test.mjs`: **49/49 pass**, including the new C-1, M-1, M-2 and m-1..m-3 tests.
- QA's updated `001-platform-v1.api.test.mjs` (uncommitted working-tree copy, strict mode): **39/54 pass**. All ISO-* and PERM-* cases pass, including PERM-02a–e for AC-57. The 15 failures are all Phase 2 ACs, as expected under Option A: AC-13, 14, 16, 17, 20 ×2, 22, 23, 24, 27 (format), 29, 30, 32, 37, 39.

## Notes for next roles
- **Backend dev:** fix N-1 and build B17 (N-2). Both are small and server-only. n-1 is frontend and can ride along.
- **Security (step 7):** N-1 is in your area, and m-8 is still open for your decision. Also note `03` gap 16: the public `/domains` answers for a made-up site id with platform-wide names only.
- **QA:** add browser checks for the M1 blocking screen (`/my-sites` failing / no site → no gate action) to `001-browser-checks.md`.
- **Devops:** unchanged from round 2. Pin/confirm Bun ≥ 1.4 in Cloud Build (`08`, R5/K7), and R11.

## Verdict: CHANGES REQUESTED — escalate to user
Round-2 findings: **C-1, M-1, M-2, M-3 and m-1..m-5, m-7 are fixed**; m-6 has moved into B17; m-8 is deferred to security.
**Open: 2 Major (N-1 account takeover via `plainPassword`; N-2 approved task B17 not built), 1 Minor.** No Critical.
This is **round 3 of 3**, so under CLAUDE.md the loop stops here and the decision goes to the user. Options:
- **(a)** Allow one more fix round: N-1 is about 20 lines plus tests, and B17 is already specified. Then a short round-4 review of just those commits.
- **(b)** Launch with a recorded risk acceptance:
  - N-1 is only exploitable where a Master Admin has created a **custom role with USER_MANAGEMENT** for a non-Master. No seeded role has it. Devops/QA can confirm Alphatech has none.
  - Without B17, registration duplicate checks stay global: stricter, but it leaks existence across sites and blocks multi-site passes.

---

## Round 4 (N-1 and N-2 only)
Reviewer: code-reviewer · Date: 2026-09-30 · This is the extra round the user approved (option (a)) after the round-3 escalation.
**Scope:** exactly `f246389` (N-1) and `8acc272` (N-2 / B17), plus their test changes, against the round-3 fix spec and `03` v1.0.1 B17. As asked, I also looked for any remaining takeover path through `POST /rbac/users` and `POST /auth/admin/generate-reset-token`, and graded the two gaps the builder noted.
**Method:** clean clone of `939f32a` (bundle → cloud workspace), reusing an existing dependency install outside the repo. Throw-away repro scripts, not in the repo. No source edits.

### Status of round-3 findings
| # | Status | Evidence |
|---|---|---|
| N-1 | **Fixed as specified** | Re-ran the round-3 repro and each spec item:<br>(a) HR sets the Ops user's password → 403 `ERR_MASTER_ONLY`, and the message names `generate-reset-token`. Setting an ordinary attendant's password is refused too.<br>(b) Any edit (even `fullName`) of an account whose current role grants MASTER_CONFIG, or whose override enables SECURITY_AUDIT → 403.<br>(c) A reset token for those accounts → 403 `ERR_MASTER_ONLY`. A reset token for an ordinary same-site attendant still works, and Master is unaffected.<br>All refusals write `RBAC_PRIVILEGE_ESCALATION_BLOCKED`. `accountIsPrivileged` covers Master, all-sites user, privileged/all-sites role, and privileged override. |
| N-2 (B17) | **Fixed as specified** | `submitRegistrationRequest`: the ACTIVE-plate and PENDING (plate or email) checks are limited to the request's site, and the pending message is now generic ("A request for this vehicle or email is already waiting for review at this site.").<br>The round-3 repro (PENDING at B no longer blocks A) now passes.<br>`bulkUploadRegistrations` upserts only at the row's site. The route matcher looks only at the row's site (`stampBulkRows` stamps the row first, so rows without `siteId` still match correctly), and a foreign row `siteId` → 403.<br>`approveRegistrationRequest` returns 400 "This vehicle is already on an active pass at this site." for a same-site duplicate with a different `employeeId`. The message matches `03`. |
| n-1 | Open (frontend, not in scope) | Unchanged; frontend-dev / Phase 2. |

### Decisions asked for
- **Excluding the caller's own account from rule (b): acceptable, but only if `email` and `username` are also locked for the caller's own account** (see R4-2). M-1 already locks own role, overrides, sites and status, and changing your own password is legitimate self-service. Own `email` isn't locked, though, and it is the key that employee self-service uses to find "your" pass.
- **Bulk `autoApprove` doesn't run the same-site duplicate-pass refusal: acceptable for Phase 1 (Minor, R4-3).** It is same-site only and admin-only, and it can't touch another site. It can create a second active pass for the same plate at one site.
- **`DELETE /rbac/users` not covered by N-1 rule (b): not acceptable. It's worse than the builder's note suggests (R4-1).** `deleteAppUser` has **no site-scope check at all** for non-Masters, so this is a cross-site write, not only a privileged-account gap.

### New findings (round 4)
| # | Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|---|
| R4-1 | **Critical** | `server.ts` `DELETE /api/v1/rbac/users/:id` (L2612) → `src/server/db.ts` `deleteAppUser` (L3957-3996) | **Cross-site account delete (rule 2).** For a non-Master, `deleteAppUser` refuses only self-delete and deleting a Master Admin. There is no site-scope check and no privilege check. **Reproduced:** a Site A user with a custom role holding USER_MANAGEMENT (canDelete) ran `DELETE /rbac/users/<Site B attendant>` → **200 "removed from the system"**. It also deleted a privileged same-site account (MASTER_CONFIG role) → 200. This existed before this round, and the builder flagged the route. | For a non-Master caller, refuse unless the target is within the caller's sites (`userWithinCallerScope` → 403 `ERR_SITE_FORBIDDEN` + `auditDenied`) and is not privileged (`accountIsPrivileged` → 403 `ERR_MASTER_ONLY` + `RBAC_PRIVILEGE_ESCALATION_BLOCKED`). Add a test for each. | Open |
| R4-2 | **Critical** | `server.ts` `userSaveRefusal` (own-account list, L2559) + `resolveEmployeeTarget` (L838) | **Cross-site pass takeover by re-pointing an email.** Employee self-service (`/employees/profile`, `/employees/update-vehicle`) picks "your" pass as the first employee record **at any site** whose email equals the caller's account email. A non-Master with USER_MANAGEMENT can change **their own** `email` (it's not in M-1's locked list, and rule (b) skips own accounts). Alternatively, they can change an in-scope ordinary account's email and then use a reset token they are allowed to generate. **Reproduced:** HR (Site A) sets their own email to a Site B employee's email → `GET /employees/profile` returns that pass **unmasked** → `POST /employees/update-vehicle` changes the Site B employee's plate `KA05MN1111` → `KA05ZZ9999` (**200**; confirmed in Site B's `/employees`). | Both parts are needed:<br>(1) `resolveEmployeeTarget`: match the own record only among employees at sites the caller may access (`siteAllowedFor(me, e.siteId)`); if the email matches more than one site, prefer the resolved site.<br>(2) `userSaveRefusal`: add `email` and `username` to the own-account locked fields for non-Masters, and refuse setting another account's `email` to one already used by an employee record or account outside the caller's sites.<br>Add tests reproducing the steps above. | Open |
| R4-3 | Minor | `src/server/db.ts` `bulkUploadRegistrations` (`autoApprove` path) | Bulk `autoApprove` skips B17's same-site duplicate-pass refusal, so it can create a second active pass for the same plate at one site. | Run the same check as `approveRegistrationRequest` before `saveOrUpdateEmployee`, and report the row as an error. Phase 2 is fine. | Open |

**Precondition for R4-1 and R4-2:** both need a non-Master account with **USER_MANAGEMENT** rights (canDelete / canCreate). Only a Master-created custom role grants that; no seeded role does. The Site Admin role has USER_MANAGEMENT disabled, and a module override enables the module but not the action rights.

### Tests
- The N-1 (a)(b)(c) and B17 (1)–(4) tests exist and really assert the behaviour: status codes, error codes, "old password still works / new one fails", audit rows, Site B request unchanged, nothing approved at Site B, and generic messages. I read each and re-ran them.
- **The older test changes are justified:**
  - B3 registration bulk now asserts that a *foreign `siteId`* row is refused. The old assertion (plate/email match at another site → 403) is the behaviour B17 deliberately changed, and B17 (3) now covers it.
  - B7/H9 uses a same-site duplicate, as the per-site rule requires, and still asserts no owner data.
  - `empA` / `empB` are created `ACTIVE`, because `/employees/save` defaults to INACTIVE and B17 counts active passes only.
- There are **no** tests for R4-1 or R4-2.

### Build / lint / tests
- `npm run lint`: **PASS**. `npm run build`: **PASS**.
- `npm run test:qa`: 105 tests.
  - `001-backend.api.test.mjs`: **57/57**.
  - The committed `001-platform-v1` is still the old-fixture version: 0/48 in strict mode, a known fixture issue.
- **QA's updated, uncommitted `001-platform-v1.api.test.mjs`** (working-tree copy): **39/54**. Every ISO-* and PERM-* test passes, and the 15 failures are all Phase 2 ACs. That is unchanged from round 3.

### Verdict: CHANGES REQUESTED — escalate to user (no further fix round started)
**Fixed:** N-1 and N-2. **Open:** 2 Critical (R4-1 cross-site account delete; R4-2 cross-site pass takeover via email) and 1 Minor (R4-3). Both Criticals existed before this round and are reachable only through a Master-created custom role that grants USER_MANAGEMENT. I did not start another fix round, as instructed; the decision is the user's. Options:
- **(a) Fix before 1 Oct.** Each fix is small and server-only (R4-1 is about 10 lines; R4-2 is 2 small changes), plus tests. A round-5 review would cover only those commits.
- **(b) Launch on an operational control, with a recorded risk acceptance.** Devops/QA confirm at go-live that **no non-Master account holds USER_MANAGEMENT** (no custom role with it, no override), and the Master Admin agrees not to create one until R4-1 and R4-2 are fixed in the first patch. Without that grant, neither path can be reached.

---

## Round 5 (R4-1 and R4-2 only)
Reviewer: code-reviewer · Date: 2026-09-30 · A user-approved round after the round-4 escalation (the user chose "fix both before 1 Oct").
**Scope:** only the commits since `939f32a`: `2c349b3` (R4-1), `ff2f58f` (R4-2) and `712d74d` (notes), against the fixes asked for in "Round 4". I re-ran every round-4 repro and also probed for any other route from employee self-service to another site's pass.
**Method:** a clean clone of `712d74d` (bundle → cloud workspace), reusing an existing dependency install that lives outside the repo. The repro scripts were throw-away and are not in the repo. I made no source edits.

### Status of round-4 findings
| # | Status | Evidence (re-run repros) |
|---|---|---|
| R4-1 | **Fixed** | Tested as a Site A user whose custom role has USER_MANAGEMENT:<br>- `DELETE /rbac/users/<Site B attendant>` → **403 `ERR_SITE_FORBIDDEN`**; the account still exists and a `CROSS_SITE_ACCESS_DENIED` audit row is written.<br>- Deleting a privileged Site A account (MASTER_CONFIG role) → **403 `ERR_MASTER_ONLY`** + `RBAC_PRIVILEGE_ESCALATION_BLOCKED`.<br>- Self-delete is still refused.<br>- Deleting an ordinary same-site account → 200. Master is unaffected. |
| R4-2 | **Fixed** | **Own account:** changing own `email` to a Site B employee's email → **403** ("You can't change your own email."). Changing own `username` → 403.<br>**Other accounts:** setting an in-scope attendant's email to the Site B employee's email → **403** with a generic message. Creating a new account with that email → **403**.<br>**Self-service after a Master re-points the same email:**<br>- `/employees/profile` → no pass;<br>- the same call with `x-site-id: B` → 403 (the global site guard);<br>- `/employees/update-vehicle`, with or without naming the email → 403 or 404.<br>The Site B plate is unchanged. |
| R4-3 | Deferred to Phase 2 (user decision) | Not touched, as agreed. |

### Other routes to another site's pass through self-service (probed)
- **Own record lookup:** `resolveEmployeeTarget` now matches the caller's pass only at sites they may access (`siteAllowedFor`) and prefers the selected site. An email that exists only at another site gives "no pass".
- **Naming someone else** (`email` ≠ own email, or another `employeeId`): this still needs REGISTRATION / APPROVALS rights, plus `resolveSite` and `assertRecordSite` on the resolved record (from round 2).
- **Claiming a foreign site** via `?siteId` / `x-site-id` is refused by `enforceSiteScope` before the handler runs.
- **Account creation and email edits** are the only ways to change an account email (there is one `saveAppUser` caller). Both are guarded for non-Masters now.
- I found **no remaining cross-site path**. Two small same-site or order-dependent gaps are listed below as Minors.

### New findings (round 5)
| # | Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|---|
| R5-1 | Minor | `server.ts` `userSaveRefusal` (≈L2571-2583); login lookup in `handleLoginRequest` (`users.find` by email **or** username) | **Account emails and usernames don't have to be unique.** The new guard checks `email` against accounts outside the caller's sites, but not `username`. A non-Master was able to set an in-scope attendant's **username** to a Site B account's **email** (200). Login picks the first account whose email or username matches, so depending on array order a Site B user's sign-in-by-email could land on (or be shadowed by) the Site A account. In my run the Site B user still signed in correctly, so this is order-dependent, and it gives no access to Site B data. | Enforce unique `email` and `username` (case-insensitive, and no value used as the other field) across **all** accounts on create/edit, for everyone, Master included. Refuse with a generic message. Phase 2 is acceptable; the security reviewer should note it. | Open |
| R5-2 | Minor | `server.ts` `userSaveRefusal` (email guard is foreign-site only) | **Same-site pass access by re-pointing an email.** A non-Master with only USER_MANAGEMENT can set an in-scope ordinary account's email to a **same-site** employee's email (200), issue that account a reset token (allowed), sign in as it, and change that employee's plate through self-service. This stays inside the caller's own site and relies on the existing reset-token trust model. It can still exceed the caller's module rights (for example, they may lack REGISTRATION). | Phase 2 / security: only a Master or a REGISTRATION:canEdit holder may give an account an email that matches an employee record. Alternatively, link accounts to employee records explicitly (by id) instead of by email. | Open |

**Precondition (unchanged):** R5-1 and R5-2 both need a non-Master with USER_MANAGEMENT rights, which only a Master-created custom role grants.

### Tests
The new tests really assert the fixes:
- **R4-1:** they check the status and error code, that the target still exists, and the audit row. They also check that self-delete is still refused, an ordinary delete works, and Master is unaffected.
- **R4-2 (non-Master):** own email and own username are refused; an in-scope account's email and a new account's email are refused; the stored emails are unchanged; the message doesn't reveal the other site; an unused email still works.
- **R4-2 (Master re-points):** a Master-re-pointed email still reaches no Site B pass, `update-vehicle` gives 404, and the Site B plate is unchanged.

There are no tests for R5-1 or R5-2; they aren't needed for this gate.

### Build / lint / tests
- `npm run lint`: **PASS**. `npm run build`: **PASS**.
- `npm run test:qa`: 108 tests.
  - `001-backend.api.test.mjs`: **60/60**.
  - The committed `001-platform-v1` is still the old-fixture version: 0/48 in strict mode, a known issue that QA's commit will fix.
- **QA's updated, uncommitted `001-platform-v1.api.test.mjs`** (working-tree copy): **39/54**, unchanged. Every ISO-* and PERM-* test passes; the 15 failures are all Phase 2 ACs.

### Verdict: APPROVED
**Zero Critical or Major open.** R4-1 and R4-2 are fixed, and R4-3 is deferred to Phase 2 by the user.
**Open Minors, carried to security (step 7) or Phase 2:** R4-3, R5-1, R5-2, n-1 (frontend default-domain fallback) and m-8 (export token in the URL).
**Step 5's gate is passed.** Next: QA (step 6) should commit its updated suite and browser checks and write `06-test-report.md`. Then security (step 7) re-runs against this branch.

---

## Hotfix review (2 Oct)
Reviewer: code-reviewer · Date: 2026-10-02 · **Urgent: production is live on this code.**
**Scope:** exactly `deab529` (hotfix 1) and `c30a947` (hotfix 2), against `08` "New finding (P2-3)" / "First patch, item 0" and `04` Backend "Hotfix (2 Oct 2026)".
**Method:** clean clone of `e656c0e` (bundle → cloud workspace), reusing an existing dependency install that lives outside the repo. I also ran the builder's cold-start harness against the **pre-fix** code (`f8a3753` plus only the test seam) to check that the tests really tell the two apart. Two throw-away probes, not in the repo, covered "write after ready" and "failed load → retry". I made no source edits.

### Checks
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `initDB`'s Firestore branch no longer writes the boot seed; an empty Firestore is still seeded | **PASS** | `db.ts` ≈L1200: `saveDB()` is gone from the "no local file + Firestore configured" branch.<br>**Pre-fix code, same harness:** 8 writes before the load (`dom-1`, all 5 default roles, `usr-digi-master`), `role-site-manager` ALERTS.canEdit flipped back to `true`, and `company.com` back.<br>**Fixed code:** 0 writes before the load, no `appRoles/appUsers/whitelistedDomains` writes, ALERTS.canEdit stays `false`, and only `parkflows.in` is left.<br>**Empty Firestore:** `bootstrapFirestore()` still seeds the default roles and the bootstrap Master ("Hotfix-1 EMPTY" test). |
| 2 | No Firestore write (full or targeted) before the store is loaded | **PASS** | `storeReady` is false from `initDB()` whenever Firestore is configured. While it's false, `saveDB()` returns before both `syncSpecificRecords` and `scheduleDebouncedFullSync`, and the debounce callback re-checks it.<br>Other pre-load paths I checked:<br>- **Local-file branch**: its `saveDB()` only writes the local JSON.<br>- **`rotateKnownDefaultPasswords`**: with Firestore configured it is skipped at boot (`server.ts` L114) and runs only after `store = remote; storeReady = true`, so it targets real loaded users.<br>- **`getStore()`**: no longer re-inits.<br>- **`clearHistoricalRecords`** (direct deletes): only reachable through an API request, which gets 503 before ready.<br>- **Firestore writes outside `saveDB`**: only bootstrap seeding and the `securityAuditLogs` append. Audit appends are allowed.<br>`initDB()` has one caller (`server.ts` L111) plus the guarded `getStore()`. |
| 3 | `/api/v1/*` (except `/health`) and `/login` → 503 `ERR_STARTING` until loaded; `/health` 200 | **PASS** | The middleware sits after CORS/preflight and **before** the rate limiter and `requireAuth`. It sends `Retry-After: 5`, and `/health` adds `ready`.<br>"Hotfix-2" server test against an 8 s fake load: `/slots`, `/auth/login`, `POST /login` and the public `/domains` → 503 `ERR_STARTING`; `/health` 200 `ready:false`; then ready → `/slots` 401 and `/domains` serves the loaded data (no `company.com`).<br>Public routes are blocked too, which is correct. No client route uses GET `/login`, so the SPA is unaffected. |
| 4a | Beyond the brief: `getStore()` initialises once | **Accept: it's a fix.** | The old `if (store.slots.length === 0) initDB()` would discard a loaded production store that has no slots, and reset `storeReady`. It also re-seeded 1,080 demo slots on local dev whenever slots were emptied. No caller relies on the re-init. |
| 4b | Beyond the brief: a failed load stays at 503 and retries | **Accept: the right trade-off.** | My probe makes the first `get` throw `DEADLINE_EXCEEDED`: ready `false`, 0 writes, "retrying in 10s", then ready `true` with the real data and still 0 seed writes.<br>Going ready on the seed was exactly how the seed reached production, so integrity has to win over availability here. The side effects are listed as H-3. |
| 5 | Test seam + fake-Firestore harness; do the tests prove it? | **Accept; yes.** | `__setFirestoreDbForTests` is exported from `firestoreClient.ts`. Nothing in `src/` or `server.ts` calls it, and no request can reach it, so it's acceptable for a hotfix.<br>The fake records every write, and the harness filters out only audit appends. The Hotfix-1 test **fails on the pre-fix code** (8 seed writes) and passes now. The 5 s load is longer than the 3 s debounce, so the old timing bug is reproduced.<br>Gaps: no test proves that writes still reach Firestore **after** ready, and none covers the failed-load path. My probes show both work (a targeted `appRoles` write lands after ready; the retry path is shown in 4b), but they aren't automated (H-2). |

### Findings
| # | Severity | File:line | Problem | Suggested fix | Status |
|---|---|---|---|---|---|
| H-1 | Minor | `src/server/db.ts:1319` | The log text "Load failed, falling back to local JSON store" is now wrong (the instance stays at 503), and ops read these logs during warm-up. | Change it to "Load failed; staying at 503 and retrying". | Open |
| H-2 | Minor | `tests/qa/001-backend.api.test.mjs`, `tests/qa/support/coldstart-harness.mjs` | No automated test covers (a) the failed load → 503 → retry → ready path with no seed writes, or (b) a normal write reaching Firestore after ready. That means a future change could silently disable **all** syncs and still pass. | Add a `FAILS=n` option to the fake (throw on the first n reads), plus a harness step that does a targeted `saveDB` after ready and asserts it was written. | Open |
| H-3 | Minor (ops) | `src/server/db.ts` `bootstrapFirestore` | During a long Firestore outage the API now stays at 503 indefinitely while `/health` is 200, so Cloud Run won't restart the instance and users see errors. Each retry also re-reads every collection, at most once a minute. | Devops: alert on `/health` `ready:false` for more than about 5 minutes, and keep the warm-up rule in the runbook. The friendly "starting up" message for console and APK is already a follow-up. | Open |

**Notes:**
- The two items deferred to the first patch are fine to leave there: pinning `engines.node`, and the friendly 503 copy on clients.
- An untracked `pf-f8a3753.bundle` sits at the repo root. It's not mine; another role left it there. Don't commit it.

### Build / lint / tests
Clean clone of `e656c0e`:
- `npm run lint`: **PASS**. `npm run build`: **PASS**.
- `npm run test:qa`: 121 tests, **106 pass**.
  - `001-backend`: **64/64**, including Hotfix-1 ×2 and Hotfix-2 ×2.
  - `001-platform-v1`: **42/57**. The 15 failures are exactly the known Phase 2 ACs (FLOW-03…06, 09…12, 14, 18, 20…22, 24, 27). The exit code is 1 for those alone.

### Verdict: APPROVED
No Critical or Major findings. Both hotfix goals hold:
- the boot seed can never reach Firestore;
- nothing syncs before the real data is loaded;
- the API answers 503 `ERR_STARTING` until then.
H-1 to H-3 are Minors and can go in the first patch.

**After deploy** (per `04`), verify:
- `/health` reaches `ready:true`;
- `role-site-manager` ALERTS edit stays off after a restart;
- `company.com` is removed once by hand and doesn't come back;
- the log shows no full sync before "Loaded existing data from Firestore."
