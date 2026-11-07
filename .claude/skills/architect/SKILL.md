---
name: architect
description: Produce an implementation plan for a non-trivial VanVolt change (engine API, data model, persistence, new module or cross-cutting refactor) — files, types, migration, tests, risks and a parallelisable work breakdown. Read-only.
argument-hint: <change to design>
context: fork
agent: architect
---

Design the following change to VanVolt: **$ARGUMENTS**

1. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and only the source/tests the change touches.
2. Identify every place the change ripples to: engine types (`packages/engine/src/types.ts`),
   `analyseDesign`, UI pages, the store and `migrate.ts`, the PDF report, docs.
3. Choose the simplest design that satisfies the request. Note what you deliberately leave out.
4. Specify tests with concrete expected values.
5. Return the six-section report from your instructions. Mark anything you could not confirm
   from the code as **unverified**.
