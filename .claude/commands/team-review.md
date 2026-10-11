---
description: Independent review of existing code or the current diff by code-reviewer, qa-engineer and security-reviewer
argument-hint: <files, folder, or "current diff">
---
Review $ARGUMENTS without changing application code.
Create `docs/features/NNN-review-slug/`, then run in order: code-reviewer (05-code-review.md), qa-engineer (06-test-report.md — test cases and gaps only), security-reviewer (07-security-review.md).
Log each verdict in `docs/team/review-log.md` and give me a combined, prioritised list of findings.
