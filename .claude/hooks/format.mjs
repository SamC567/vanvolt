#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): format the edited file with the project's own Prettier.
// Runs Prettier via execFile (no shell), only for files inside the project. Never fails the
// edit; a Prettier parse error is reported back to Claude (exit 2 on PostToolUse = feedback).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { readInput, projectDir, projectRelative, isMain } from './lib.mjs';

const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.md',
  '.yml',
  '.yaml',
  '.html',
]);

export function shouldFormat(filePath, root) {
  if (typeof filePath !== 'string') return false;
  const rel = projectRelative(filePath, root);
  if (rel === null) return false;
  if (/(^|\/)(node_modules|dist|\.git)\//.test(rel)) return false;
  return EXTENSIONS.has(extname(rel).toLowerCase());
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const root = projectDir(input);
  const file = input?.tool_input?.file_path;
  if (!shouldFormat(file, root) || !existsSync(file)) process.exit(0);
  const bin = join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
  );
  if (!existsSync(bin)) process.exit(0); // dependencies not installed yet
  try {
    execFileSync(bin, ['--write', '--log-level', 'warn', file], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 25_000,
    });
  } catch (e) {
    const msg = String(e.stderr || e.message)
      .split('\n')
      .slice(0, 8)
      .join('\n');
    process.stderr.write(`Prettier could not format ${projectRelative(file, root)}:\n${msg}\n`);
    process.exit(2);
  }
  process.exit(0);
}
