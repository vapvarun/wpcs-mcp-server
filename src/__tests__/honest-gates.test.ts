/**
 * Known-bad fixtures for the static-gate stages that used to report PASSED
 * without running: a crashing phpcs, a bad lint path, a missing PHPStan.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TEST_VERSION, detectPhpBinaries, findPhpstan, lintProject, runPhpCompatibility } from '../php-gates.js';
import { WpcsMcpServer } from '../server.js';
import { tools } from '../tools.js';

const temps: string[] = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'wpcs-honest-')); temps.push(d); return d; };

/** A stand-in phpcs that prints `stdout` and exits with `code`. */
function fakePhpcs(stdout: string, code: number, stderr = ''): string {
  const bin = join(tmp(), 'phpcs');
  writeFileSync(bin, `#!/bin/sh\nprintf '%s' '${stdout.replace(/'/g, `'\\''`)}'\nprintf '%s' '${stderr}' >&2\nexit ${code}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };
const server = new WpcsMcpServer() as unknown as Record<string, (...a: unknown[]) => Promise<ToolResult>>;

// ── 11. compat: crash or unparseable output is an error ─────────────────────

test('compat: a phpcs crash with no report did not run (was: 0 errors, PASSED)', () => {
  const r = runPhpCompatibility('.', '8.1-', { phpcs: fakePhpcs('', 255, 'PHP Fatal error: Uncaught Error in Runner.php') });
  assert.equal(r.ran, false);
  assert.match((r as { error: string }).error, /no report.*Fatal error/);
});

test('compat: unparseable output did not run (was: 0 errors, PASSED)', () => {
  for (const out of ['ERROR: the "PHPCompatibilityWP" coding standard is not installed.', '{"totals":{}}', '<html>']) {
    const r = runPhpCompatibility('.', '8.1-', { phpcs: fakePhpcs(out, 3) });
    assert.equal(r.ran, false, out);
  }
  assert.equal(runPhpCompatibility('.', '8.1-', { phpcs: join(tmp(), 'missing-phpcs') }).ran, false, 'phpcs not installed');
});

test('compat: a real report is counted, and a clean report passes', () => {
  const report = JSON.stringify({ totals: {}, files: { 'a.php': { errors: 2, warnings: 1, messages: [] } } });
  const bad = runPhpCompatibility('.', '8.1-', { phpcs: fakePhpcs(report, 2) });
  assert.deepEqual([bad.ran, bad.ran && bad.errors, bad.ran && bad.warnings], [true, 2, 1]);
  const clean = runPhpCompatibility('.', '8.1-', { phpcs: fakePhpcs('{"totals":{},"files":{}}', 0) });
  assert.deepEqual([clean.ran, clean.ran && clean.errors], [true, 0]);
});

test('compat: a target that looks like an option, or a bad testVersion, never reaches phpcs', () => {
  const marker = join(tmp(), 'phpcs-ran');
  const spy = fakePhpcs('{"totals":{},"files":{}}', 0);
  const flag = runPhpCompatibility('--report-file=' + marker, '8.1-', { phpcs: spy });
  assert.equal(flag.ran, false);
  assert.match((flag as { error: string }).error, /does not exist/);
  const ver = runPhpCompatibility('.', '8.1- --standard=Squiz', { phpcs: spy });
  assert.equal(ver.ran, false);
  assert.match((ver as { error: string }).error, /invalid testVersion/);
});

// ── 11 + 12. lint ───────────────────────────────────────────────────────────

test('lint: a bad path or a tree with no PHP did not run (was: 0 errors, PASSED)', () => {
  const missing = lintProject(join(tmp(), 'nope'));
  assert.equal(missing.ran, false);
  assert.match((missing as { error: string }).error, /does not exist/);
  assert.equal(lintProject(tmp()).ran, false, 'empty directory');
  const dir = tmp();
  writeFileSync(join(dir, 'a.php'), '<?php echo 1;');
  assert.equal(lintProject(dir, []).ran, false, 'no php binary');
  const broken = lintProject(dir, [{ path: join(dir, 'no-such-php'), version: '8.1.0' }]);
  assert.equal(broken.ran, false, 'a php binary that cannot start is not a clean lint');
});

test('lint: finds a parse error, passes clean code, and says which PHP linted', () => {
  const php = detectPhpBinaries();
  assert.ok(php.length >= 1, 'this test needs php on PATH');
  const dir = tmp();
  mkdirSync(join(dir, 'inc'));
  writeFileSync(join(dir, 'ok.php'), '<?php echo 1;');
  writeFileSync(join(dir, 'inc/bad.php'), '<?php function ( {');
  const bad = lintProject(dir, php);
  assert.ok(bad.ran);
  assert.deepEqual(bad.files, [join(dir, 'inc/bad.php')]);
  assert.equal(bad.fileCount, 2);

  rmSync(join(dir, 'inc/bad.php'));
  const good = lintProject(dir, php);
  assert.ok(good.ran);
  assert.deepEqual(good.files, []);

  const one = lintProject(dir, [php[0]]);
  assert.ok(one.ran);
  assert.match(one.coverage, new RegExp(`^linted with PHP ${php[0].version.replace(/\./g, '\\.')} only`));
  // Two binaries: each version is named and the uncovered part of 8.1-8.5 is listed.
  const two = lintProject(dir, [{ path: php[0].path, version: '8.1.99' }, { path: php[0].path, version: '8.3.99' }]);
  assert.ok(two.ran);
  assert.equal(two.coverage, 'linted with PHP 8.1.99, 8.3.99 (not linted: 8.2, 8.4, 8.5)');
  assert.equal(two.byVersion.length, 2);
});

test('lint: WPCS_PHP_BINARIES chooses the binaries; unusable entries are dropped', () => {
  const php = detectPhpBinaries();
  const picked = detectPhpBinaries({ WPCS_PHP_BINARIES: `${php[0].path}, /nope/php8.1` });
  assert.deepEqual(picked, [php[0]]);
  assert.deepEqual(detectPhpBinaries({ WPCS_PHP_BINARIES: '/nope/php' }), []);
});

test('full_check: a path that cannot be linted is an error result', async () => {
  const r = await server.fullCheck(join(tmp(), 'nope'));
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /lint did not run \(not a pass\)/);
  assert.doesNotMatch(r.content[0].text, /PASSED|READY/);
});

// ── 12. PHP range ───────────────────────────────────────────────────────────

test('default testVersion is the portfolio floor 8.1-, and 8.5 is in the documented range', () => {
  assert.equal(DEFAULT_TEST_VERSION, '8.1-');
  const compat = tools.find((t) => t.name === 'wpcs_check_php_compatibility')!;
  const prop = (compat.inputSchema as unknown as { properties: { php_version: { default: string; description: string } } }).properties.php_version;
  assert.equal(prop.default, '8.1-');
  assert.match(prop.description, /8\.5/);
  assert.doesNotMatch(JSON.stringify(tools), /7\.4/);
});

// ── 13. phpstan ─────────────────────────────────────────────────────────────

test('phpstan: not installed is NOT RUN and an error (was: success)', async () => {
  const project = tmp();
  const empty = tmp();
  assert.equal(findPhpstan(project, { HOME: empty, PATH: empty }), null);

  const saved = { HOME: process.env.HOME, PATH: process.env.PATH };
  process.env.HOME = empty;
  process.env.PATH = empty;
  try {
    const r = await server.phpstanCheck(project, 5);
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /PHPSTAN: NOT RUN \(not a pass\)/);
  } finally {
    process.env.HOME = saved.HOME;
    process.env.PATH = saved.PATH;
  }
});

test('phpstan: the project vendor binary is found first', () => {
  const project = tmp();
  mkdirSync(join(project, 'vendor/bin'), { recursive: true });
  writeFileSync(join(project, 'vendor/bin/phpstan'), '');
  assert.equal(findPhpstan(project, { HOME: tmp(), PATH: '' }), join(project, 'vendor/bin/phpstan'));
});

// ── 14. descriptions ────────────────────────────────────────────────────────

test('quality_check no longer promises security checks it does not run', () => {
  const d = tools.find((t) => t.name === 'wpcs_quality_check')!.description!;
  assert.match(d, /NO security checks/);
  assert.match(d, /wp-security-review/);
});
