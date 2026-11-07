---
name: build
description: Deliver a feature or fix end to end using VanVolt's 9-step workflow — investigate, research, plan, delegate, implement, test, review, document, commit/PR. Use for any change larger than a one-line fix.
argument-hint: <feature or fix to build>
---

Build this in VanVolt: **$ARGUMENTS**

Follow `docs/WORKFLOW.md`. Track the steps in a task list and keep the user informed with
one-line updates between steps.

1. **Investigate** — restate the task and testable acceptance criteria. Find the affected
   code (Grep/Glob, `docs/CALCULATIONS.md`). If something only the user can decide blocks
   you, ask one question; otherwise state your assumption and continue.
2. **Research** — if the task involves product specs, standards, formulas or an unfamiliar
   API, start the `researcher` agent in the background now (`/research` style brief).
3. **Plan** — for multi-module, data-model or engine-API changes, get a plan from the
   `architect` agent. For small changes, write a 3–5 line plan yourself.
4. **Delegate** — run independent pieces in parallel: `senior-developer` for engine/data,
   `frontend-specialist` for UI, `qa-engineer` for test writing. Give each agent the plan
   excerpt, file paths and acceptance criteria. Never let two agents edit the same file.
5. **Implement** — integrate the results; keep engine code pure; provenance rules apply.
6. **Test** — `npm run check` must pass. For UI changes, verify in a browser at 1440 px and
   390 px (see the `frontend-specialist` instructions).
7. **Review** — for non-trivial changes run `/review`; fix or explicitly justify every
   critical/high finding.
8. **Document** — update `docs/CALCULATIONS.md`, the `assumptions` list, README as needed.
9. **Commit / PR** — conventional commit with a "why" body. For non-trivial work, create a
   branch and propose `gh pr create` using `.github/pull_request_template.md`. Pushing and
   PR creation need the user's approval; never merge, force-push, tag or deploy.

Finish with: what changed, test results, review outcome, and the commit/PR link.
