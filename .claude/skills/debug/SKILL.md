---
name: debug
description: Systematically find and fix a VanVolt bug — reproduce with a failing test, isolate, find the root cause, fix, and prove it with a regression test. Use for wrong numbers, crashes, UI glitches or failing tests.
argument-hint: <symptom, failing test or error message>
---

Debug: **$ARGUMENTS**

Do not guess-and-patch. Work through these steps and show evidence at each one.

1. **Reproduce.** Turn the symptom into something that fails on demand:
   - Wrong calculation → a Vitest case in `packages/engine/test/` with the expected value
     worked out by hand (show the arithmetic in a comment).
   - UI problem → a Playwright script against `npx vite preview` that shows the error or a
     screenshot of the bad state; capture `pageerror`/console errors.
   - Failing test → run just that test (`npx vitest run <file> -t "<name>"`).
2. **Isolate.** Narrow to the smallest input and the first function that produces a wrong
   value. Check the formula against `docs/CALCULATIONS.md`. Use `git log -p` / `git bisect`
   (read-only) if it used to work.
3. **Root cause.** State it in one sentence and explain why the symptom follows from it. If
   the cause is wrong _data_ (a spec), confirm the correct value from the source document
   (delegate to the `researcher` agent) — never "fix" a spec from memory.
4. **Fix** the cause, not the symptom. Keep the change minimal.
5. **Prove it.** The reproduction now passes; add it as a regression test; run
   `npm run check`. For UI fixes, re-run the browser check.
6. **Report:** symptom → root cause → fix (files) → regression test → check results. Note any
   similar code paths that may have the same bug.
