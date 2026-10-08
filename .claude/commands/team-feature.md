---
description: Run a feature through the full ParkFlows dev-team workflow (PM → UX → Architect → Dev → Review → QA → Security → DevOps)
argument-hint: <feature description>
---
Run this feature through the team workflow defined in CLAUDE.md: $ARGUMENTS

As Orchestrator:
1. Create `docs/features/NNN-slug/` (next free number) and a branch `feature/NNN-slug` if git is clean.
2. Invoke each subagent in order, passing it the feature folder path. Do not do their work yourself.
3. STOP and ask me to approve after `01-prd.md` and after `03-tech-design.md`. Present open questions to me.
4. Loop developer ↔ code-reviewer until APPROVED (max 3 rounds, then ask me).
5. If QA or security fails, route findings back to the right developer, then re-review.
6. After each step append a line to `docs/team/review-log.md`.
7. Finish with a summary table: step, agent, verdict, file link — and anything I still need to decide.
