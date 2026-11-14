/**
 * WPCS MCP Server - the external-tool stages of the static gate.
 *
 * Every function here answers one question honestly: did the tool run, and
 * what did it find. "Could not run" is never reported as "found nothing".
 */
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { delimiter, join, resolve } from 'path';
import { findPhpFiles } from './shared-utils.js';
/** Portfolio floor: every plugin and theme supports PHP 8.1 through 8.5. */
export const DEFAULT_TEST_VERSION = '8.1-';
const PHP_MINORS = ['8.1', '8.2', '8.3', '8.4', '8.5'];
const COMPAT_IGNORE = ['vendor/*', 'node_modules/*', 'build/*', 'dist/*', '.git/*'];
/** Run PHPCompatibilityWP. A crash, an empty report or unparseable output is `ran: false`, never zero issues. */
export function runPhpCompatibility(target, testVersion, opts = {}) {
    // The target becomes a phpcs argument: resolve it to an absolute path that exists,
    // so a value starting with '-' can never be read as a phpcs option.
    const absTarget = resolve(opts.cwd ?? process.cwd(), target);
    if (!existsSync(absTarget)) {
        return { ran: false, error: `target does not exist: ${absTarget}` };
    }
    if (!/^\d+\.\d+(-(\d+\.\d+)?)?$/.test(testVersion)) {
        return { ran: false, error: `invalid testVersion "${testVersion}" (expected e.g. 8.1- or 8.1-8.5)` };
    }
    const args = [
        '--standard=PHPCompatibilityWP',
        '--runtime-set', 'testVersion', testVersion,
        '--report=json',
        `--ignore=${COMPAT_IGNORE.join(',')}`,
        absTarget,
    ];
    let output;
    try {
        // --report=json prints a report even when clean, so exit 0 is parsed too.
        output = execFileSync(opts.phpcs ?? 'phpcs', args, { cwd: opts.cwd, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
    }
    catch (error) {
        const e = error;
        output = e.stdout || '';
        if (!output.trim()) {
            return { ran: false, error: `phpcs produced no report: ${(e.stderr || e.message || 'unknown error').trim().split('\n')[0]}` };
        }
    }
    try {
        const report = JSON.parse(output);
        if (!report || typeof report.files !== 'object' || report.files === null)
            throw new Error('no "files" key');
        let errors = 0;
        let warnings = 0;
        for (const f of Object.values(report.files)) {
            errors += f.errors;
            warnings += f.warnings;
        }
        return { ran: true, errors, warnings, files: report.files };
    }
    catch {
        return { ran: false, error: `phpcs output is not a report: ${output.trim().slice(0, 200)}` };
    }
}
function phpVersion(bin) {
    try {
        const v = execFileSync(bin, ['-n', '-r', 'echo PHP_VERSION;'], { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 }).trim();
        return /^\d+\.\d+\.\d+/.test(v) ? v : null;
    }
    catch {
        return null;
    }
}
/**
 * The PHP binaries lint runs with: WPCS_PHP_BINARIES (comma-separated paths)
 * when set, otherwise `php` plus any php8.1..php8.5 on PATH or under
 * Homebrew's php@8.x. One binary per minor version.
 */
export function detectPhpBinaries(env = process.env) {
    const listed = (env.WPCS_PHP_BINARIES || '').split(',').map((s) => s.trim()).filter(Boolean);
    const candidates = listed.length
        ? listed
        : [
            'php',
            ...PHP_MINORS.flatMap((m) => [`php${m}`, `/opt/homebrew/opt/php@${m}/bin/php`, `/usr/local/opt/php@${m}/bin/php`]),
        ];
    const byMinor = new Map();
    for (const path of candidates) {
        const version = phpVersion(path);
        const minor = version?.split('.').slice(0, 2).join('.');
        if (version && minor && !byMinor.has(minor))
            byMinor.set(minor, { path, version });
    }
    return [...byMinor.values()].sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}
/** `php -n -l` every source file with every available PHP binary. A path that cannot be linted is an error, not a clean result. */
export function lintProject(projectPath, binaries = detectPhpBinaries()) {
    if (!projectPath || !existsSync(projectPath))
        return { ran: false, error: `path does not exist: ${projectPath}` };
    const files = statSync(projectPath).isDirectory() ? findPhpFiles(projectPath) : [projectPath];
    if (!files.length)
        return { ran: false, error: `no PHP files found under ${projectPath}` };
    if (!binaries.length)
        return { ran: false, error: 'no working php binary found (checked PATH and WPCS_PHP_BINARIES)' };
    const byVersion = [];
    for (const bin of binaries) {
        // -n skips php.ini so a broken extension cannot pollute the output.
        const run = spawnSync('xargs', ['-0', '-n1', '-P4', bin.path, '-n', '-l'], {
            input: files.join('\0'),
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
        const out = `${run.stdout || ''}\n${run.stderr || ''}`;
        const bad = [...new Set([...out.matchAll(/^Errors parsing (.+)$/gm)].map((m) => m[1].trim()))];
        const clean = (out.match(/^No syntax errors detected/gm) || []).length;
        // Every file must be accounted for; anything else means lint itself broke.
        if (run.error || clean + bad.length !== files.length) {
            const why = run.error?.message || out.split('\n').find((l) => l.trim() && !/^(No syntax errors|Errors parsing|PHP Parse error|Parse error)/.test(l)) || `exit ${run.status}`;
            return { ran: false, error: `php -l (${bin.version}) accounted for ${clean + bad.length} of ${files.length} files: ${why.trim()}` };
        }
        byVersion.push({ version: bin.version, files: bad });
    }
    const versions = binaries.map((b) => b.version);
    const missing = PHP_MINORS.filter((m) => !versions.some((v) => v.startsWith(`${m}.`)));
    const coverage = binaries.length === 1
        ? `linted with PHP ${versions[0]} only (install php8.1..php8.5 or set WPCS_PHP_BINARIES to lint the whole 8.1-8.5 range)`
        : `linted with PHP ${versions.join(', ')}${missing.length ? ` (not linted: ${missing.join(', ')})` : ''}`;
    return { ran: true, fileCount: files.length, files: [...new Set(byVersion.flatMap((v) => v.files))], byVersion, coverage };
}
/** The PHPStan binary for a project: its own vendor copy, then Composer's global one, then PATH. */
export function findPhpstan(projectPath, env = process.env) {
    const candidates = [
        join(projectPath, 'vendor', 'bin', 'phpstan'),
        ...(env.HOME ? [join(env.HOME, '.composer', 'vendor', 'bin', 'phpstan')] : []),
        ...(env.PATH || '').split(delimiter).filter(Boolean).map((d) => join(d, 'phpstan')),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
}
//# sourceMappingURL=php-gates.js.map