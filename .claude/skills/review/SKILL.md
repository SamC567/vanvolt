---
name: review
description: Multi-specialist code review of VanVolt changes — runs QA, security and performance reviewers in parallel on the current diff (or a given target) and consolidates a ranked findings list. Use before committing or opening a PR for non-trivial work.
argument-hint:
  [target — branch, commit range or path; default: uncommitted changes, else last commit]
---

Review VanVolt changes. Target: **$ARGUMENTS**

1. **Determine the diff.**
   - Target given → use it (`git diff <range>` or the path).
   - Otherwise uncommitted changes (`git diff HEAD` + untracked files); if none, the last
     commit (`git show --stat HEAD`).
     Summarise the change in 2–3 lines and list the files.
2. **Run three reviewers in parallel** (one message, three Agent calls, background). Give each
   the diff command, the file list and the summary:
   - `qa-engineer` — correctness: logic errors, wrong formulas or units, missing/weak tests,
     edge cases, provenance rules from `CLAUDE.md`. Ask it to run `npm run check` and NOT to
     write tests in this mode.
   - `security-auditor` — only issues introduced or exposed by this diff.
   - `performance-engineer` — regressions in bundle size, `analyseDesign` time or render cost
     caused by this diff.
3. **Consolidate** when all three report. Drop duplicates and findings you can disprove by
   reading the code (say which you dropped and why). Verify each remaining finding yourself
   before listing it.
4. **Report** one table, most severe first:
   | # | Severity | Area | `file:line` | Finding | Suggested fix |
   then a one-line verdict: ready to commit / fix first.
5. Offer to apply the fixes. Do not apply them unless the user asks (or this review was
   started by `/build`, which applies critical/high fixes itself).
