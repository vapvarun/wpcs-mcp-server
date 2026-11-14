/**
 * WPCS MCP Server - the external-tool stages of the static gate.
 *
 * Every function here answers one question honestly: did the tool run, and
 * what did it find. "Could not run" is never reported as "found nothing".
 */
/** Portfolio floor: every plugin and theme supports PHP 8.1 through 8.5. */
export declare const DEFAULT_TEST_VERSION = "8.1-";
export interface CompatFile {
    errors: number;
    warnings: number;
    messages: Array<{
        line: number;
        type: string;
        message: string;
        source: string;
    }>;
}
export type CompatResult = {
    ran: true;
    errors: number;
    warnings: number;
    files: Record<string, CompatFile>;
} | {
    ran: false;
    error: string;
};
/** Run PHPCompatibilityWP. A crash, an empty report or unparseable output is `ran: false`, never zero issues. */
export declare function runPhpCompatibility(target: string, testVersion: string, opts?: {
    cwd?: string;
    phpcs?: string;
}): CompatResult;
export interface PhpBinary {
    path: string;
    version: string;
}
/**
 * The PHP binaries lint runs with: WPCS_PHP_BINARIES (comma-separated paths)
 * when set, otherwise `php` plus any php8.1..php8.5 on PATH or under
 * Homebrew's php@8.x. One binary per minor version.
 */
export declare function detectPhpBinaries(env?: NodeJS.ProcessEnv): PhpBinary[];
export type LintResult = {
    ran: true;
    fileCount: number;
    /** Files with a parse error under at least one binary. */
    files: string[];
    /** Per binary: version and the files it rejected. */
    byVersion: Array<{
        version: string;
        files: string[];
    }>;
    /** Which PHP versions linted, and what of the 8.1-8.5 range was left out. */
    coverage: string;
} | {
    ran: false;
    error: string;
};
/** `php -n -l` every source file with every available PHP binary. A path that cannot be linted is an error, not a clean result. */
export declare function lintProject(projectPath: string, binaries?: PhpBinary[]): LintResult;
/** The PHPStan binary for a project: its own vendor copy, then Composer's global one, then PATH. */
export declare function findPhpstan(projectPath: string, env?: NodeJS.ProcessEnv): string | null;
