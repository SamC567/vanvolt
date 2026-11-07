# VanVolt — Claude Code instructions

Campervan electrical design and simulation app. Browser-only, local-first, no backend.
Planning tool: it must never present guesses as facts.

## Layout

- `packages/engine/` — pure TypeScript calculation engine (no DOM, no React, no runtime deps).
  `src/analysis.ts` (`analyseDesign`) is the single entry point the UI uses.
  `src/data/` holds researched reference data. Tests in `test/`.
- `apps/web/` — React 19 + Vite + Tailwind 3 UI. Pages in `src/pages/`, Zustand store with
  localStorage persistence in `src/store/`, PDF report in `src/report/`.
- `docs/` — `ARCHITECTURE.md`, `CALCULATIONS.md` (every formula), `WORKFLOW.md` (how we work).
- `.claude/` — specialist agents, skills (`/build`, `/review`, `/test`…) and safety hooks.

## Commands

```
npm run dev          # http://localhost:5173
npm test             # engine + web unit tests (Vitest)
npm run typecheck
npm run test:hooks   # Claude hook script tests (node --test)
npm run check        # format:check + typecheck + all tests + build (what CI runs)
```

## Non-negotiable rules

1. **Never invent electrical specifications.** Every library value carries `provenance`
   (`manufacturer` | `standard` | `user` | `assumption` | `estimate` | `calculated`) and, if
   sourced, a `source` with URL and `verification: 'document' | 'secondary'`. Only mark
   `document` after reading the value in the cited document yourself. Unknown → omit the field.
2. **Electrical maths lives only in the engine.** The UI renders engine output; it never
   computes currents, energies or sizes itself.
3. **Every critical calculation has a unit test** with a hand-worked expected value in a
   comment. Changing a formula means updating `docs/CALCULATIONS.md` in the same change.
4. New engineering assumptions are added to the `assumptions` list in `analysis.ts` so they
   appear in the UI and PDF.
5. Engine functions stay pure and deterministic (no `Date.now()`, no randomness in results).

## Code standards

- Strict TypeScript (`noUncheckedIndexedAccess`). No `any`; narrow with types or guards.
- Prettier formats on save (hook) — don't hand-format. British English in UI text.
- UI colours come from CSS tokens in `apps/web/src/index.css`; chart series colours follow the
  entity (alternator blue, solar orange, shore aqua). Status colours always have icon + label.
- Keep components small; shared primitives live in `apps/web/src/components/ui.tsx`.

## Definition of done

`npm run check` passes; UI changes verified in a browser at desktop and 390 px width with no
console errors; docs updated; commit message explains why.

## Safety boundaries

- Never merge PRs, force-push, publish packages, create releases, deploy, or make purchases.
  Push and PR creation need the user's approval.
- Never read, print or commit secrets (`.env*`, tokens, keys). Never weaken a hook or
  permission rule to get past it — ask the user instead.
- Never delete `CLAUDE.md`, `LICENSE`, `README.md`, `package.json`, `.github/` or `.claude/`.
- The hooks in `.claude/hooks/` enforce some of this; they are a backstop, not permission.

## Working efficiently

- Follow `docs/WORKFLOW.md`. Delegate independent research and reviews to subagents
  (`researcher`, `qa-engineer`, `security-auditor`, `performance-engineer`) in parallel.
- Use `architect` / `senior-developer` (strongest model) for design and engine changes;
  economical models for repetitive work (`/progress-report`).
- Read only the files you need; `docs/CALCULATIONS.md` explains formulas without reading code.
