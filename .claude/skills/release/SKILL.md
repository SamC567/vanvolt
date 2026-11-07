---
name: release
description: Prepare a VanVolt release locally — verify, bump versions, write CHANGELOG.md from conventional commits, commit and create an annotated tag. Never pushes, publishes or creates the GitHub release; prints the commands for the user.
argument-hint: <patch | minor | major | x.y.z>
disable-model-invocation: true
---

Prepare release **$ARGUMENTS** of VanVolt.

1. **Preconditions** — stop and report if any fails:
   - On `main`, working tree clean (`git status --porcelain` empty).
   - Up to date with `origin/main` (`git fetch origin main` then compare).
   - Latest CI run on main is green if `gh` is available (`gh run list --branch main -L 1`).
   - `npm run check` passes locally.
2. **Version** — current version is in the root `package.json`. Compute the new version from
   the argument (semver). Set the same `version` in `package.json`,
   `packages/engine/package.json` and `apps/web/package.json`, then run `npm install
--package-lock-only` so the lockfile matches.
3. **Changelog** — collect commits since the last tag (`git describe --tags --abbrev=0`, or
   all history if none). Group by conventional type (Features, Fixes, Docs, Other); skip
   `chore: release` commits. Prepend a section `## vX.Y.Z — YYYY-MM-DD` to `CHANGELOG.md`
   (create the file if missing). Mention data changes that alter results, since users'
   designs may change.
4. **Commit and tag locally** — `git commit -am "chore(release): vX.Y.Z"` (with the session
   attribution lines) and `git tag -a vX.Y.Z -m "VanVolt vX.Y.Z"`.
5. **Stop.** Print, for the user to run themselves:
   ```
   git push origin main
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "VanVolt vX.Y.Z" --notes-file <changelog excerpt>
   ```
   Never push, publish, deploy or create the GitHub release yourself — the safety hooks block it.
