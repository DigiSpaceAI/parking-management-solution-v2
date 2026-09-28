# Implementation Notes — ParkFlows Platform v1 (baseline)
## Backend
_Author: backend-dev · Date: 2026-09-25 · Status: **BLOCKED — no code changed**_

> **Re-run 2026-09-28: still BLOCKED, no code changed.** Since the first run, the PRD v1.2 has been approved (gate 1 passed) and `02-ux-design.md` v1.1 exists. But `03-tech-design.md` has still not been written or approved (step 3, gate 3), so there are still no `[backend]` tasks. The next step is the **architect**. Backend inputs the architect should cover: the Highs in `07-security-review.md` (BOLA via `?query=` on `/employees/profile`, update-vehicle IDOR, cross-site overwrite by id on employees/slots save, global plate match on exit, unscoped `/slots/change-notifications` and `/sites`, USER_MANAGEMENT self-escalation, PII unmask on `/logs`), the 5 Critical failures in `06-test-report.md`, and the "strict siteId" server behaviour for AC-02 (PRD v1.2). The working tree is still on `main` with the CRLF churn and leftover `node_modules_*` folders, so clean it up before step 4.

### Gaps found in inputs
1. `03-tech-design.md` does not exist, so there are no `[backend]` tasks to implement. Per `.claude/agents/backend-dev.md`, I stop and report instead of improvising.
2. `02-ux-design.md` does not exist (step 2 not run).
3. `01-prd.md` is still awaiting user approval (gate 1 not passed).
4. **Dirty working tree on `main`.** About 25 tracked files have uncommitted changes that were not made in this step, including `server.ts`, `src/server/db.ts` and `src/server/security.ts`. There are also three leftover `node_modules_*` folders. Commit or stash these before step 4 so this feature's backend diff can be reviewed on its own (CLAUDE.md rule 4).

### Files changed
None.

### Endpoints added/changed
None.

### How to test manually
N/A. Nothing was implemented.

### Needed to unblock
- User approves `01-prd.md` and answers the open questions that affect the backend, especially OQ-3 (server-enforced site scope for `/slots`, `/employees`, `/logs`, `/alerts/non-parked` and `/registrations`) and OQ-6 (v1 status of `/security/simulate-attack` and `/admin/clear-history`).
- ux-designer writes `02-ux-design.md`. Architect writes `03-tech-design.md` with explicit `[backend]` tasks, and the user approves it.
- Then re-run backend-dev on this feature.

Backend-side notes for the architect: the P0 server work implied by the PRD is (a) server-enforced `siteId` scoping plus 403 and audit logging on cross-site writes (AC-01..06), (b) role checks on master-only routes (AC-07, AC-08) and (c) session rejection for suspended users (AC-10). Please break these into `[backend]` tasks scoped to specific files and routes.
## Frontend
_Author: frontend-dev · Date: 2026-09-25 · Status: **BLOCKED — no code changed**_

### Gaps found in inputs
1. `03-tech-design.md` does not exist, so there are no `[frontend]` tasks to implement. My role implements ONLY those tasks.
2. `02-ux-design.md` does not exist, so there is no approved layout, set of states or copy to follow.
3. `01-prd.md` is still marked "Awaiting user approval" in `docs/team/review-log.md`. Its gate (STOP: user approves PRD) and the tech-design gate have not been passed. 12 open questions are unresolved, including OQ-3 (server- vs client-enforced site scope), which decides how the frontend passes and refetches site context.

### Files changed
None.

### Screens affected
None.

### How to test manually
N/A. Nothing was implemented.

### Needed to unblock
- User approves `01-prd.md` (step 1), or amends it.
- ux-designer writes `02-ux-design.md` (step 2).
- architect writes `03-tech-design.md` with `[frontend]` tasks, and the user approves it (step 3).
- Then re-run frontend-dev on this feature.

Frontend-side notes for the architect: the PRD points at P0 frontend-heavy work. That covers site-scoped lists via `withSite()` with a refetch on site change (US-01, AC-01..06), role-based hiding of entry points (AC-07, AC-08), and the floor plan, pass approval and log export screens (US-06, US-10, US-12). Please break these into explicit `[frontend]` tasks with file-level scope.
## Mobile
## Build/lint results
Not run for frontend. No frontend changes were made.
