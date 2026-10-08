# ParkFlows — Claude working guide

## Project at a glance
- Stack: React 19 + Vite + Tailwind 4 (web console, `src/components`), Capacitor Android build (`src/mobile`, `vite.mobile.config.ts`), Express server (`server.ts`, `src/server/*`), Firestore via firebase-admin, shared types in `src/types.ts`.
- Roles: Master Admin, Site Admin, Attendant (field transactions), Employee (end user, limited writes).
- **Golden rule: every piece of data is scoped to a `siteId`.** Any read, write, API route or UI list that is not site-scoped is a bug (see `KNOWN_ISSUES.md`).
- Checks available today: `bun install --frozen-lockfile`, then `npm run lint` (tsc --noEmit), `npm run build`, `npm run test:qa`. `bun.lock` is the only lockfile. `test:qa` runs the node:test API suites in `tests/qa/` (no extra dependencies).
- Reference docs: `ARCHITECTURE.md`, `KNOWN_ISSUES.md`, `README.md`.

## Development team workflow (use for every feature or non-trivial fix)
Specialist subagents live in `.claude/agents/`. The main session acts as the **Orchestrator**: it
routes work to the right agent, passes file paths (not chat summaries) between them, and enforces the gates.
Start a feature with `/team-feature <description>`.

Every feature gets a folder `docs/features/NNN-short-slug/` (next free number). Each role writes ONE file there,
using the templates in `docs/team/templates/`.

| # | Role (agent) | Output file | Gate to pass |
|---|---|---|---|
| 1 | product-manager | 01-prd.md | **STOP – user approves PRD** |
| 2 | ux-designer | 02-ux-design.md | Covers every user story & every role affected |
| 3 | architect | 03-tech-design.md | **STOP – user approves tech design** |
| 4 | backend-dev / frontend-dev / mobile-dev | code + 04-implementation-notes.md | `npm run lint` and `npm run build` pass |
| 5 | code-reviewer | 05-code-review.md | Zero Critical/Major open (loop back to step 4, max 3 rounds, then escalate to user) |
| 6 | qa-engineer | 06-test-report.md | Every acceptance criterion has a test, all pass |
| 7 | security-reviewer | 07-security-review.md | No High/Critical findings open |
| 8 | devops | 08-release.md | Release checklist + rollback plan written |

After every step, append one line to `docs/team/review-log.md`:
`| date | feature | step | agent | verdict (PASS / FAIL / CHANGES) | notes |`

## Rules for all agents
1. Read the previous step's files before starting; flag gaps you find in them at the top of your own file.
2. Reviewers (code-reviewer, security-reviewer) never edit source code — they only report.
3. Builders never mark their own work as reviewed.
4. One feature at a time. Small, focused diffs. No unrelated refactors.
5. Do not add dependencies, change Firestore rules, or touch deployment config without it being in the approved tech design.
6. Do not commit or push unless the user asks. Work on a branch `feature/NNN-slug` when committing.
7. Small fixes (typo, copy change, one-line bug) may skip steps 1–3 but still go through code-reviewer.
