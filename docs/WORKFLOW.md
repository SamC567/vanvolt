# Development workflow

The standard path for any change, from a one-line fix to a new feature. Small changes may
collapse steps (say which and why), but never skip testing (6) or review of risky code (7).
`/build <task>` runs this workflow end to end.

| #   | Step        | Who                                                          | Output                                                     |
| --- | ----------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | Investigate | main session                                                 | Problem statement, affected files, acceptance criteria     |
| 2   | Research    | `researcher` agent (`/research`)                             | Sourced facts with verification status                     |
| 3   | Plan        | `architect` agent (`/architect`) for non-trivial work        | Plan: files, interfaces, tests, risks                      |
| 4   | Delegate    | main session                                                 | Independent sub-tasks run in parallel subagents            |
| 5   | Implement   | `senior-developer` (engine) / `frontend-specialist` (UI)     | Code + tests                                               |
| 6   | Test        | `qa-engineer` (`/test`)                                      | `npm run check` green, browser check for UI                |
| 7   | Review      | `/review` → QA + `security-auditor` + `performance-engineer` | Findings fixed or explicitly accepted                      |
| 8   | Document    | implementer                                                  | `docs/CALCULATIONS.md`, README, assumptions list updated   |
| 9   | Commit / PR | main session                                                 | Conventional commit; PR via `gh pr create` (user approves) |

## 1. Investigate

- Restate the task in one sentence and list acceptance criteria you can test.
- Locate code with Grep/Glob; read only what you need. `docs/CALCULATIONS.md` and
  `docs/ARCHITECTURE.md` usually answer "how does X work" faster than the code.
- Note unknowns. If one blocks progress and only the user can answer it, ask one question.

## 2. Research

Needed whenever a change involves a product spec, a standard, a formula, or a library API you
are not certain of. Run it in the background while you investigate the code.

- Product data must come from the manufacturer's own document. Record title, URL, and whether
  you read the value in the document (`document`) or only via a search extract (`secondary`).
- Never fill a gap from memory. An unverified value is omitted or clearly flagged.

## 3. Plan

For anything touching more than one module, the engine API, persisted data or the data model,
get a plan from `architect`. The plan names the files, the types changed, the migration path for
saved designs (`apps/web/src/store/migrate.ts`), the tests to add and the risks.

## 4. Delegate

Split the plan into independent pieces and run them in parallel (research, UI vs engine,
test writing, reviews). Give each subagent the context it needs; it starts cold. Don't delegate
what you can do faster yourself, and never have two agents edit the same file.

## 5. Implement

- Engine first, with tests, then UI. Keep engine functions pure.
- Data changes follow the provenance rules in `CLAUDE.md`.
- Prettier runs automatically after each edit (hook).

## 6. Test

- `npm run check` must pass (CI runs the same command).
- New calculations: unit test with a hand-worked value in a comment.
- UI changes: open the page in a browser at 1440 px and 390 px, no console errors, no
  horizontal scroll, both themes.
- The Stop hook re-runs typecheck and tests when source files changed; fix what it reports.

## 7. Review

Run `/review` for any non-trivial change. QA, security and performance reviews run in
parallel and report findings ranked by severity. Fix or justify each finding before commit.
Run `/security-audit` before a release or when touching import/export, persistence or
external links.

## 8. Document

- Formula or assumption changed → `docs/CALCULATIONS.md` + `assumptions` in `analysis.ts`.
- New data → source and verification status in the data file; mention in README if notable.
- User-visible feature → README feature list.

## 9. Commit or pull request

- Conventional commit subject (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`),
  body explains why. One logical change per commit.
- Work on a branch for anything non-trivial; open a PR with `gh pr create` using the PR template.
  Pushing and creating PRs need user approval. Never merge, force-push, tag or deploy.
