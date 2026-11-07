#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|NotebookEdit): block writes to secrets, git internals,
// lockfiles and key material.
import { readInput, block, projectDir, projectRelative, isMain } from './lib.mjs';

const RULES = [
  [/(^|\/)\.env(\.(?!example$)[^/]+)?$/, 'secret environment files'],
  [/(^|\/)\.git(\/|$)/, 'git internals'],
  [
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/,
    'lockfiles (change dependencies with npm install instead)',
  ],
  [/\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519|ecdsa)[^/]*$/, 'private keys and certificates'],
  [/(^|\/)(\.npmrc|\.netrc|\.git-credentials)$/, 'credential files'],
];

export function check(filePath, root) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const rel = projectRelative(filePath, root) ?? filePath.replace(/\\/g, '/');
  for (const [re, reason] of RULES) if (re.test(rel)) return `editing ${reason}: ${rel}`;
  return null;
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  const reason = check(file, projectDir(input));
  if (reason) block('guard-files.mjs', reason);
  process.exit(0);
}
