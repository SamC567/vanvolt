---
name: progress-report
description: Produce a concise VanVolt progress report — work completed, in progress, blocked, test and CI status, next steps — from git history, tasks and the test suite. Economical model; read-only apart from an optional saved copy.
argument-hint: [since — date like 2026-11-01, a tag, or "last week"; default: last 7 days]
model: haiku
allowed-tools: Bash(git log:*), Bash(git status:*), Bash(git describe:*), Bash(npm test:*), Bash(npm run typecheck:*), Bash(gh run list:*), Read, Grep, Glob
---

Write a progress report for VanVolt covering: **$ARGUMENTS** (default: the last 7 days).

Gather facts — do not speculate:

1. `git log --since=<date> --pretty='%h %ad %s' --date=short` (or `<tag>..HEAD`), and
   `git status --short` for uncommitted work.
2. `npm test 2>&1 | grep -E "Tests|Test Files"` for test counts; `npm run typecheck` result.
3. Latest CI status if `gh` works: `gh run list --branch main -L 3`. If unavailable, say so.
4. Open items: `git grep -n "TODO\|FIXME"` in `packages/` and `apps/`; data still marked
   `verification: 'secondary'` (`git grep -c "verification: 'secondary'" packages/engine/src/data`).

Output (Markdown, under 300 words):

- **Summary** — 2 sentences.
- **Completed** — bullets from commits (group related commits).
- **In progress** — uncommitted changes.
- **Quality** — tests, typecheck, CI, unverified data count.
- **Risks / blocked** — only real ones, with evidence.
- **Next steps** — 3–5 bullets.

Print the report. Only if the user asked to save it, write it to `docs/progress/<YYYY-MM-DD>.md`.
