---
name: test
description: Run VanVolt's full verification (format, typecheck, engine/web/hook tests, build, optional browser smoke test), find coverage gaps in the given scope and write the missing tests. Returns a PASS/FAIL report with defects.
argument-hint: [scope — e.g. "cables.ts", 'Battery page', or empty for everything]
context: fork
agent: qa-engineer
---

Test VanVolt. Scope: **$ARGUMENTS** (if empty: the whole repository, focusing on files changed
since the last commit — `git diff --name-only HEAD` plus untracked files).

1. Run `npm run check` and record every result.
2. For the scope, list each behaviour and whether a test covers it. Prioritise electrical
   calculations, data migration, and anything that could show a wrong number to a user.
3. Write the missing tests (test files only), with hand-worked expected values.
4. If the scope includes UI, run the browser smoke test from your instructions.
5. Re-run the affected test files, then `npm test`.
6. Return the report format from your instructions. Defects in production code are reported,
   not fixed.
