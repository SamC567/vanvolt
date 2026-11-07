---
name: security-audit
description: Full security audit of VanVolt — untrusted design import/localStorage data, rendered links, PDF generation, dependencies (npm audit), CI workflows, Claude hooks and permissions, and secrets. Read-only; returns severity-ranked findings with evidence and fixes.
argument-hint: [focus area — optional]
context: fork
agent: security-auditor
---

Perform a security audit of the VanVolt repository. Focus: **$ARGUMENTS** (if empty: everything
in your checklist).

1. Map the attack surface first: list every entry point for untrusted data
   (`apps/web/src/store/migrate.ts`, `designStore.ts` persistence, imported JSON, URLs in
   library/source data) and every sink (`href`, PDF text, DOM rendering).
2. Work through your full checklist. For each suspected issue, gather evidence: a code
   excerpt and, where safe, a reproduction in a temporary directory (e.g. feed a crafted
   design object to `migrateDesign` with `npx vite-node`).
3. Run `npm audit` and `npm audit --omit=dev`; say whether vulnerable code is reachable in the
   shipped app.
4. Review `.github/workflows/*`, `.claude/settings.json` and `.claude/hooks/*.mjs`.
5. Return the report format from your instructions. Do not modify files.
