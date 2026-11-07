// Tests for the VanVolt Claude Code hooks. Run: npm run test:hooks
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as checkBash } from './guard-bash.mjs';
import { check as checkFile } from './guard-files.mjs';
import { shouldFormat } from './format.mjs';
import { plan } from './verify-on-stop.mjs';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HOOKS, '..', '..');

function run(script, input, env = {}) {
  return spawnSync(process.execPath, [join(HOOKS, script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
  });
}

describe('guard-bash', () => {
  const blocked = [
    'git push --force origin main',
    'git push -f',
    'git push origin +main',
    'git push --force-with-lease origin feature',
    'cd repo && git push --force',
    "bash -c 'git push --force origin main'",
    'git push origin --delete feature',
    'git push origin v1.2.0',
    'git push --tags',
    'gh pr merge 12 --squash',
    'gh api -X PUT repos/o/r/pulls/3/merge',
    'gh release create v1.0.0',
    'npm publish',
    'npx vercel --prod',
    'netlify deploy --prod',
    'git reset --hard HEAD~3',
    'git clean -fdx',
    'git branch -D main',
    'git checkout -- .',
    'rm -rf /',
    'rm -rf ~',
    'rm -rf packages/engine',
    'rm -r -f src',
    'rm README.md',
    'git rm -r .github',
    'cat .env',
    'cat apps/web/.env.local',
    'grep TOKEN .env.production',
    'cp ~/.ssh/id_rsa /tmp/x',
    'echo $GH_TOKEN',
    'printf "%s" "${GITHUB_TOKEN}"',
    'printenv',
    'env',
    'git add .env',
    'stripe charges create --amount 100',
    'FOO=1 sudo git push --force',
  ];
  const allowed = [
    'git push origin main',
    'git push -u origin feature/x',
    'git status',
    'git commit -m "docs: explain why we never force-push or merge automatically"',
    'npm test',
    'npm run check',
    'rm -rf node_modules',
    'rm -rf apps/web/dist dist coverage',
    'rm -rf /tmp/vanvolt-research',
    'rm scratch.txt',
    'cat .env.example',
    'cat README.md',
    'gh pr create --title "feat: x" --body-file body.md',
    'gh pr view 3',
    'echo $HOME',
    'npx vitest run packages/engine/test/cables.test.ts',
    'git log --oneline -5',
    'git diff HEAD~1',
  ];
  for (const cmd of blocked)
    test(`blocks: ${cmd}`, () => assert.ok(checkBash(cmd), `expected block for ${cmd}`));
  for (const cmd of allowed) test(`allows: ${cmd}`, () => assert.equal(checkBash(cmd), null));

  test('exits 2 with a reason on stderr when run as a hook', () => {
    const r = run('guard-bash.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr merge 1' },
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /merging pull requests/);
  });
  test('exits 0 for safe commands and for empty input', () => {
    assert.equal(run('guard-bash.mjs', { tool_input: { command: 'npm test' } }).status, 0);
    assert.equal(run('guard-bash.mjs', {}).status, 0);
  });
});

describe('guard-files', () => {
  const root = '/repo';
  for (const f of [
    '/repo/.env',
    '/repo/apps/web/.env.local',
    '/repo/.git/config',
    '/repo/package-lock.json',
    '/repo/certs/server.pem',
    '/home/u/.ssh/id_ed25519',
    '/repo/.npmrc',
  ])
    test(`blocks: ${f}`, () => assert.ok(checkFile(f, root)));
  for (const f of [
    '/repo/.env.example',
    '/repo/packages/engine/src/cables.ts',
    '/repo/CLAUDE.md',
    '/repo/.github/workflows/ci.yml',
  ])
    test(`allows: ${f}`, () => assert.equal(checkFile(f, root), null));
  test('exits 2 as a hook', () => {
    const r = run('guard-files.mjs', {
      tool_name: 'Write',
      tool_input: { file_path: join(ROOT, '.env') },
    });
    assert.equal(r.status, 2);
  });
});

describe('format', () => {
  test('only formats supported files inside the project', () => {
    assert.equal(shouldFormat(join(ROOT, 'apps/web/src/App.tsx'), ROOT), true);
    assert.equal(shouldFormat(join(ROOT, 'README.md'), ROOT), true);
    assert.equal(shouldFormat(join(ROOT, 'public/favicon.png'), ROOT), false);
    assert.equal(shouldFormat(join(ROOT, 'node_modules/x/index.js'), ROOT), false);
    assert.equal(shouldFormat('/etc/passwd.json', ROOT), false);
  });
  test('skips gitignored files (Prettier honours .gitignore)', () => {
    const dir = join(ROOT, '.claude', '.cache');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ignored.ts');
    writeFileSync(file, 'const   y=1\n');
    try {
      assert.equal(run('format.mjs', { tool_input: { file_path: file } }).status, 0);
      assert.equal(readFileSync(file, 'utf8'), 'const   y=1\n');
    } finally {
      rmSync(file, { force: true });
    }
  });
  // Fixtures live next to the tests: Prettier skips gitignored paths such as .claude/.cache.
  test('formats an edited file with the project Prettier', () => {
    const file = join(HOOKS, '__format-hook-fixture.ts');
    writeFileSync(file, 'const   x = {a:1,b:"two"}\n');
    try {
      const r = run('format.mjs', { tool_name: 'Write', tool_input: { file_path: file } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(readFileSync(file, 'utf8'), "const x = { a: 1, b: 'two' };\n");
    } finally {
      rmSync(file, { force: true });
    }
  });
  test('reports a parse error back to Claude without crashing', () => {
    const file = join(HOOKS, '__format-hook-broken.ts');
    writeFileSync(file, 'const x = {\n');
    try {
      const r = run('format.mjs', { tool_name: 'Edit', tool_input: { file_path: file } });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /Prettier could not format/);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe('verify-on-stop', () => {
  test('plans engine + web checks for engine changes', () => {
    const labels = plan(['packages/engine/src/cables.ts']).map((s) => s[0]);
    assert.deepEqual(labels, ['engine typecheck', 'engine tests', 'web typecheck', 'web tests']);
  });
  test('plans only web checks for UI changes and nothing for docs', () => {
    assert.deepEqual(
      plan(['apps/web/src/App.tsx']).map((s) => s[0]),
      ['web typecheck', 'web tests'],
    );
    assert.deepEqual(plan(['README.md', 'docs/WORKFLOW.md']), []);
    assert.deepEqual(
      plan(['.claude/hooks/lib.mjs']).map((s) => s[0]),
      ['hook tests'],
    );
  });
  test('does nothing when the Stop hook is already active', () => {
    assert.equal(run('verify-on-stop.mjs', { stop_hook_active: true }).status, 0);
  });
  test('does nothing when no source files changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vv-stop-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'notes.md'), 'hello');
    const r = run('verify-on-stop.mjs', { stop_hook_active: false }, { CLAUDE_PROJECT_DIR: dir });
    assert.equal(r.status, 0);
    rmSync(dir, { recursive: true, force: true });
  });
  test('blocks the stop with the failure output when checks fail', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vv-stop-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', private: true }));
    mkdirSync(join(dir, 'packages/engine/src'), { recursive: true });
    writeFileSync(join(dir, 'packages/engine/src/a.ts'), 'export const a = 1;');
    const r = run('verify-on-stop.mjs', { stop_hook_active: false }, { CLAUDE_PROJECT_DIR: dir });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /verification failed/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('honours VANVOLT_SKIP_VERIFY=1', () => {
    assert.equal(run('verify-on-stop.mjs', {}, { VANVOLT_SKIP_VERIFY: '1' }).status, 0);
  });
});
