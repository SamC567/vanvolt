#!/usr/bin/env node
// PreToolUse(Bash): block destructive, publishing, merging, deploying and secret-revealing
// commands. Second layer behind the deny rules in .claude/settings.json, which only match
// command prefixes.
import { readInput, block, isMain } from './lib.mjs';

const SAFE_RM_TARGET =
  /^(\.\/)?((apps\/web\/|packages\/engine\/)?(node_modules|dist|coverage|test-results|playwright-report|\.vite)|\.claude\/\.cache)(\/.*)?$|^\/tmp\//;
const PROTECTED =
  /(^|[\s/'"])(CLAUDE\.md|LICENSE|README\.md|package\.json|\.github|\.claude|docs|packages\/engine\/src|apps\/web\/src)(\/|\s|$|['"])/;
const SECRET_FILE =
  /(^|[\s/'"=])(\.env(\.(?!example\b)[\w.-]+)?|id_rsa\w*|id_ed25519\w*|[\w.-]+\.pem|[\w.-]+\.p12|\.npmrc|\.netrc|\.git-credentials|\.aws\/credentials|\.ccr\/[\w./-]*)(\s|$|['"])/;
const SECRET_VAR =
  /\$\{?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*\}?/;

/** Rules: [regex tested against a normalised command segment, reason]. */
const RULES = [
  [
    /^git\b.*\bpush\b.*(\s(--force|--force-with-lease|-f)(\s|=|$)|\s\+\S)/,
    'force-pushing rewrites shared history',
  ],
  [/^git\b.*\bpush\b.*(\s--delete\b|\s-d\s|\s:\S)/, 'deleting remote branches'],
  [
    /^git\b.*\bpush\b.*(\s--tags\b|\s--follow-tags\b|\sv\d+\.\d+\.\d+\b|\srefs\/tags\/)/,
    'pushing release tags (the user publishes releases)',
  ],
  [/^gh\s+pr\s+merge\b/, 'merging pull requests'],
  [/^gh\s+api\b.*\/(merge|merges)\b/, 'merging via the GitHub API'],
  [/^gh\s+repo\s+(delete|archive|rename|edit)\b/, 'changing or deleting the repository'],
  [/^gh\s+release\s+(create|delete|edit|upload)\b/, 'creating or changing GitHub releases'],
  [/^(npm|pnpm|yarn|bun)\s+(publish|unpublish|deprecate)\b/, 'publishing packages'],
  [
    /^npx\s+(-y\s+)?(np|release-it|semantic-release|vercel|netlify|netlify-cli|wrangler|firebase|surge|gh-pages)\b/,
    'publishing or deploying',
  ],
  [
    /^(vercel|netlify|wrangler|firebase|fly|flyctl|heroku|surge|gh-pages|serverless|sls)\b/,
    'deploying',
  ],
  [
    /^(aws\s+s3\s+(sync|cp|rm)|kubectl\s+(apply|delete)|terraform\s+(apply|destroy)|docker\s+push)\b/,
    'deploying or changing infrastructure',
  ],
  [
    /^(stripe)\b|^(aws|gcloud|az)\b.*\b(purchase|billing|reserved-instances|savings-plans)\b/,
    'purchases or billing changes',
  ],
  [/^git\b.*\breset\s+--hard\b/, 'git reset --hard discards work'],
  [/^git\b.*\bclean\s+-\w*f/, 'git clean -f deletes untracked files'],
  [/^git\b.*\bbranch\s+(-D|--delete\s+--force)\b/, 'force-deleting branches'],
  [
    /^git\b.*\b(checkout\s+--\s+\.|restore\s+(--staged\s+--worktree\s+)?\.)\s*$/,
    'discarding all working-tree changes',
  ],
  [/^git\b.*\bstash\s+(drop|clear)\b/, 'deleting stashed work'],
  [/^git\s+add\b.*(^|\s)(\S*\/)?\.env(\.(?!example\b)\S+)?(\s|$)/, 'staging secret files'],
  [/^(printenv|env|export|set)\s*$/, 'dumping environment variables can reveal credentials'],
];

function segments(command) {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalise);
}

/** Strip wrappers that don't change what runs: subshell braces, sudo/env/exec, VAR=value. */
function normalise(segment) {
  let s = segment;
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s
      .replace(/^(\(|\{)\s*/, '')
      .replace(/^(sudo|command|exec|time|nohup|env)(\s+-\S+)*\s+/, '')
      .replace(/^\w+=("[^"]*"|'[^']*'|\S*)\s+/, '');
  }
  return s;
}

function checkSegment(seg, depth = 0) {
  // Recurse into `bash -c '...'`, `sh -c "..."`.
  const wrapped = seg.match(/^(ba|z|da)?sh\s+(-\w+\s+)*-c\s+(['"])([\s\S]*)\3/);
  if (wrapped && depth < 3) {
    for (const inner of segments(wrapped[4])) {
      const r = checkSegment(inner, depth + 1);
      if (r) return r;
    }
  }
  for (const [re, reason] of RULES) if (re.test(seg)) return reason;

  if (/^(echo|printf)\b/.test(seg) && SECRET_VAR.test(seg))
    return 'printing secret environment variables';
  if (
    /^(cat|less|more|head|tail|bat|nl|strings|xxd|od|cp|mv|scp|base64|curl|grep|rg|sed|awk|source|\.)\b/.test(
      seg,
    ) &&
    SECRET_FILE.test(seg)
  )
    return 'reading or copying secret files';

  if (/^(git\s+)?rm\b/.test(seg) && PROTECTED.test(` ${seg.replace(/^(git\s+)?rm\b/, '')} `))
    return 'deleting protected project files (CLAUDE.md, LICENSE, README.md, package.json, docs/, src/, .github/, .claude/)';

  const rm = seg.match(/^rm\s+(.*)$/);
  if (rm) {
    const args = rm[1].split(/\s+/).filter(Boolean);
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const recursive = /r|R|--recursive/.test(flags);
    if (recursive) {
      const targets = args
        .filter((a) => !a.startsWith('-'))
        .map((t) => t.replace(/^['"]|['"]$/g, ''));
      const unsafe = targets.filter((t) => !SAFE_RM_TARGET.test(t));
      if (targets.length === 0 || unsafe.length > 0)
        return `recursive delete of ${unsafe.join(', ') || 'unspecified paths'} (only build outputs, node_modules and /tmp may be removed)`;
    }
  }
  return null;
}

export function check(command) {
  if (typeof command !== 'string' || !command.trim()) return null;
  for (const seg of segments(command)) {
    const reason = checkSegment(seg);
    if (reason) return reason;
  }
  return null;
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const reason = check(input?.tool_input?.command);
  if (reason) block('guard-bash.mjs', reason);
  process.exit(0);
}
