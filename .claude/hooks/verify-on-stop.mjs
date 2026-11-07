#!/usr/bin/env node
// Stop: when Claude finishes a turn with uncommitted source changes, run typecheck and the
// relevant tests. On failure, exit 2 so Claude sees the errors and keeps working.
// Skips when nothing relevant changed, when the same changes already passed, when Claude is
// already continuing because of this hook, or when VANVOLT_SKIP_VERIFY=1.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, projectDir, isMain } from './lib.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function changedPaths(root) {
  return git(root, ['status', '--porcelain', '--untracked-files=all'])
    .split('\n')
    .filter(Boolean)
    .map((l) =>
      l
        .slice(3)
        .replace(/^.* -> /, '')
        .replace(/^"|"$/g, ''),
    );
}

export function plan(paths) {
  const engine = paths.some((p) => p.startsWith('packages/engine/'));
  const web = engine || paths.some((p) => p.startsWith('apps/web/'));
  const hooks = paths.some((p) => p.startsWith('.claude/hooks/'));
  const steps = [];
  if (engine)
    steps.push(
      ['engine typecheck', npm, ['run', 'typecheck', '-w', '@vanvolt/engine']],
      ['engine tests', npm, ['test', '-w', '@vanvolt/engine']],
    );
  if (web)
    steps.push(
      ['web typecheck', npm, ['run', 'typecheck', '-w', '@vanvolt/web']],
      ['web tests', npm, ['test', '-w', '@vanvolt/web']],
    );
  if (hooks) steps.push(['hook tests', process.execPath, ['--test', '.claude/hooks/*.test.mjs']]);
  return steps;
}

function fingerprint(root, paths) {
  const h = createHash('sha256');
  try {
    h.update(git(root, ['diff', 'HEAD']));
  } catch {
    h.update('no-commits-yet');
  }
  for (const p of paths) {
    try {
      const s = statSync(join(root, p));
      h.update(`${p}:${s.size}:${s.mtimeMs}`);
    } catch {
      h.update(`${p}:deleted`);
    }
  }
  return h.digest('hex');
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  if (input.stop_hook_active || process.env.VANVOLT_SKIP_VERIFY === '1') process.exit(0);
  const root = projectDir(input);
  let paths;
  try {
    paths = changedPaths(root);
  } catch {
    process.exit(0); // not a git repository
  }
  const steps = plan(paths);
  if (steps.length === 0) process.exit(0);

  const cacheDir = join(root, '.claude', '.cache');
  const cacheFile = join(cacheDir, 'verify.json');
  const fp = fingerprint(root, paths);
  if (existsSync(cacheFile)) {
    try {
      if (JSON.parse(readFileSync(cacheFile, 'utf8')).passed === fp) process.exit(0);
    } catch {
      /* ignore corrupt cache */
    }
  }

  for (const [label, cmd, args] of steps) {
    try {
      execFileSync(cmd, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 240_000,
      });
    } catch (e) {
      const out = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
      process.stderr.write(
        `VanVolt verification failed after your changes — ${label} (${[cmd, ...args].join(' ')}):\n${out}\n\n` +
          'Fix the failure before finishing, or tell the user why it is pre-existing.\n',
      );
      process.exit(2);
    }
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ passed: fp, at: new Date().toISOString() }));
  process.stdout.write(
    JSON.stringify({
      systemMessage: `VanVolt checks passed: ${steps.map((s) => s[0]).join(', ')}`,
    }),
  );
  process.exit(0);
}
