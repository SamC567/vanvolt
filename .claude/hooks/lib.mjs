// Shared helpers for VanVolt Claude Code hooks. Node >= 20, no dependencies.
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Read the hook's JSON input from stdin. Returns {} on empty/invalid input. */
export async function readInput() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function projectDir(input = {}) {
  return resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
}

/** Path relative to the project, using forward slashes; null if outside the project. */
export function projectRelative(file, root) {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/** Block the tool call (PreToolUse) or report a problem to Claude: exit code 2 + stderr. */
export function block(hook, reason) {
  process.stderr.write(
    `Blocked by .claude/hooks/${hook}: ${reason}\n` +
      'This action is outside what Claude may do automatically in this repository. ' +
      'Ask the user to run it themselves if it is really needed.\n',
  );
  process.exit(2);
}

/** True when the module at `metaUrl` is being run directly (not imported by tests). */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}
