---
name: optimise
description: Measure and optimise VanVolt performance — bundle size, analyseDesign calculation time, React render cost — and return ranked, measured recommendations. Read-only analysis; implementation is a separate step.
argument-hint: [target — e.g. "bundle", "engine", "Compare page"; default: all]
context: fork
agent: performance-engineer
---

Optimise VanVolt. Target: **$ARGUMENTS** (default: bundle, engine and React render cost).

1. Establish baselines with the measurements in your instructions. Record the exact
   commands so results can be reproduced.
2. Find the top contributors (largest chunks, slowest engine functions, components doing
   heavy work per render).
3. For each candidate optimisation, estimate or measure the gain. Prefer changes that keep
   code simple: lazy-loading routes, memoising heavy derived data, avoiding repeated
   `analyseDesign` calls.
4. Return the report format from your instructions, ranked by gain ÷ effort. Do not edit the
   repository; the main session will implement chosen items via `senior-developer` or
   `frontend-specialist` and re-measure.
