/**
 * WPCS MCP Server - PHPCS/PHPCBF Runner
 */
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
export class PhpcsRunner {
    standard;
    excludePatterns;
    textDomain;
    minPhpVersion;
    constructor(standard = 'WordPress', options = {}) {
        this.standard = standard;
        this.excludePatterns = options.excludePatterns || [
            'vendor/*',
            'node_modules/*',
            'build/*',
            'dist/*',
            'assets/js/vendor/*',
            'assets/css/vendor/*',
            '.git/*',
        ];
        this.textDomain = options.textDomain || null;
        this.minPhpVersion = options.minPhpVersion || null;
    }
    /**
     * Check if target path (or its parent directories) has a phpcs config file.
     * PHPCS auto-detects: .phpcs.xml, phpcs.xml, .phpcs.xml.dist, phpcs.xml.dist
     */
    findPhpcsConfig(target) {
        const configNames = ['.phpcs.xml', 'phpcs.xml', '.phpcs.xml.dist', 'phpcs.xml.dist'];
        let dir = target;
        // If target is a file, start from its directory
        try {
            if (statSync(target).isFile()) {
                dir = dirname(target);
            }
        }
        catch { /* use target as-is */ }
        // Walk up to find config (max 10 levels)
        for (let i = 0; i < 10; i++) {
            for (const name of configNames) {
                if (existsSync(join(dir, name)))
                    return true;
            }
            const parent = dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
        return false;
    }
    /**
     * Build phpcs command with all options.
     * If the target has a plugin-level phpcs config (.phpcs.xml.dist etc.),
     * skip --standard so PHPCS uses the project config instead.
     */
    buildCommand(target, reportFormat = 'json') {
        const hasProjectConfig = this.findPhpcsConfig(target);
        let command = `phpcs --report=${reportFormat} -q`;
        // Only add --standard if no project-level config exists
        if (!hasProjectConfig) {
            command += ` --standard=${this.standard}`;
            // Add exclude patterns (project config handles its own excludes)
            if (this.excludePatterns.length > 0) {
                command += ` --ignore=${this.excludePatterns.join(',')}`;
            }
            // Add text domain check
            if (this.textDomain) {
                command += ` --runtime-set text_domain ${this.textDomain}`;
            }
            // Add minimum PHP version
            if (this.minPhpVersion) {
                command += ` --runtime-set testVersion ${this.minPhpVersion}-`;
            }
        }
        command += ` "${target}"`;
        return command;
    }
    /**
     * Build phpcbf command with all options.
     * Same logic: respects project-level config if present.
     */
    buildFixCommand(target) {
        const hasProjectConfig = this.findPhpcsConfig(target);
        let command = `phpcbf`;
        if (!hasProjectConfig) {
            command += ` --standard=${this.standard}`;
            if (this.excludePatterns.length > 0) {
                command += ` --ignore=${this.excludePatterns.join(',')}`;
            }
        }
        command += ` "${target}"`;
        return command;
    }
    /**
     * Run phpcs on a single file or directory
     */
    async check(target, workingDir) {
        const options = workingDir ? { cwd: workingDir } : {};
        try {
            const command = this.buildCommand(target);
            try {
                execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
                // If no errors, phpcs exits with 0
                return {
                    success: true,
                    canCommit: true,
                    totalErrors: 0,
                    totalWarnings: 0,
                    fixableCount: 0,
                    files: [],
                    summary: 'No coding standard violations found.',
                };
            }
            catch (error) {
                const execError = error;
                const output = execError.stdout || '';
                if (!output) {
                    throw new Error(`phpcs failed: ${execError.message || 'Unknown error'}`);
                }
                const result = JSON.parse(output);
                const files = Object.entries(result.files).map(([path, data]) => ({
                    path,
                    errors: data.errors,
                    warnings: data.warnings,
                    messages: data.messages,
                }));
                const canCommit = result.totals.errors === 0;
                return {
                    success: false,
                    canCommit,
                    totalErrors: result.totals.errors,
                    totalWarnings: result.totals.warnings,
                    fixableCount: result.totals.fixable,
                    files,
                    summary: this.formatSummary(result.totals, files.length),
                };
            }
        }
        catch (error) {
            const err = error;
            return {
                success: false,
                canCommit: false,
                totalErrors: 1,
                totalWarnings: 0,
                fixableCount: 0,
                files: [],
                summary: `Error running phpcs: ${err.message || 'Unknown error'}`,
            };
        }
    }
    /**
     * Run phpcbf to auto-fix a file
     */
    async fix(filePath, workingDir) {
        const options = workingDir ? { cwd: workingDir } : {};
        try {
            // Get state before fixing
            const beforeCheck = await this.check(filePath, workingDir);
            if (beforeCheck.success) {
                return {
                    success: true,
                    fixed: false,
                    file: filePath,
                    remainingIssues: beforeCheck,
                };
            }
            // Run phpcbf
            const command = this.buildFixCommand(filePath);
            try {
                execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
            }
            catch (error) {
                const execError = error;
                // phpcbf exits with 1 when fixes are made, 2 when fixes failed
                if (execError.status === 2) {
                    throw new Error(`phpcbf failed: ${execError.message || 'Unknown error'}`);
                }
                // Status 1 means fixes were applied
            }
            // Check remaining issues
            const afterCheck = await this.check(filePath, workingDir);
            return {
                success: true,
                fixed: true,
                file: filePath,
                remainingIssues: afterCheck,
            };
        }
        catch (error) {
            const err = error;
            return {
                success: false,
                fixed: false,
                file: filePath,
                diff: `Error: ${err.message || 'Unknown error'}`,
            };
        }
    }
    /**
     * Check multiple files
     */
    async checkFiles(files, workingDir) {
        if (files.length === 0) {
            return {
                success: true,
                canCommit: true,
                totalErrors: 0,
                totalWarnings: 0,
                fixableCount: 0,
                files: [],
                summary: 'No PHP files to check.',
            };
        }
        // Run phpcs on all files at once
        const fileList = files.map((f) => `"${f}"`).join(' ');
        // Check if first file's directory has project config
        const hasProjectConfig = files.length > 0 && this.findPhpcsConfig(files[0]);
        let command = `phpcs --report=json -q`;
        if (!hasProjectConfig) {
            command += ` --standard=${this.standard}`;
            if (this.excludePatterns.length > 0) {
                command += ` --ignore=${this.excludePatterns.join(',')}`;
            }
            if (this.textDomain) {
                command += ` --runtime-set text_domain ${this.textDomain}`;
            }
            if (this.minPhpVersion) {
                command += ` --runtime-set testVersion ${this.minPhpVersion}-`;
            }
        }
        command += ` ${fileList}`;
        const options = workingDir ? { cwd: workingDir } : {};
        try {
            execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
            return {
                success: true,
                canCommit: true,
                totalErrors: 0,
                totalWarnings: 0,
                fixableCount: 0,
                files: [],
                summary: `All ${files.length} PHP file(s) pass WordPress coding standards.`,
            };
        }
        catch (error) {
            const execError = error;
            const output = execError.stdout || '';
            if (!output) {
                return {
                    success: false,
                    canCommit: false,
                    totalErrors: 1,
                    totalWarnings: 0,
                    fixableCount: 0,
                    files: [],
                    summary: `phpcs failed: ${execError.message || 'Unknown error'}`,
                };
            }
            const result = JSON.parse(output);
            const resultFiles = Object.entries(result.files).map(([path, data]) => ({
                path,
                errors: data.errors,
                warnings: data.warnings,
                messages: data.messages,
            }));
            return {
                success: false,
                canCommit: result.totals.errors === 0,
                totalErrors: result.totals.errors,
                totalWarnings: result.totals.warnings,
                fixableCount: result.totals.fixable,
                files: resultFiles,
                summary: this.formatSummary(result.totals, resultFiles.length),
            };
        }
    }
    /**
     * Fix and check workflow for pre-commit
     */
    async fixAndCheck(files, workingDir) {
        const fixedFiles = [];
        // First, try to auto-fix all files
        for (const file of files) {
            const fixResult = await this.fix(file, workingDir);
            if (fixResult.fixed) {
                fixedFiles.push(file);
            }
        }
        // Then check all files
        const checkResult = await this.checkFiles(files, workingDir);
        // If files were fixed, they need to be re-staged
        const reStageCommand = fixedFiles.length > 0
            ? `git add ${fixedFiles.map((f) => `"${f}"`).join(' ')}`
            : undefined;
        return {
            checkResult,
            fixedFiles,
            reStageCommand,
        };
    }
    formatSummary(totals, fileCount) {
        const parts = [];
        if (totals.errors > 0) {
            parts.push(`${totals.errors} error(s)`);
        }
        if (totals.warnings > 0) {
            parts.push(`${totals.warnings} warning(s)`);
        }
        let summary = `Found ${parts.join(' and ')} in ${fileCount} file(s).`;
        if (totals.fixable > 0) {
            summary += ` ${totals.fixable} can be auto-fixed with phpcbf.`;
        }
        if (totals.errors > 0) {
            summary += ' COMMIT BLOCKED - fix errors before committing.';
        }
        return summary;
    }
}
//# sourceMappingURL=phpcs-runner.js.map