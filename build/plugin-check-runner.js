/**
 * WPCS MCP Server - Plugin Check Runner
 * WordPress Plugin Check integration via WP-CLI
 *
 * Note: Uses execSync for CLI tool integration. All inputs are validated
 * and this runs in a trusted local environment.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
export class PluginCheckRunner {
    wpCliPath;
    wpPath;
    constructor(wpPath) {
        this.wpCliPath = this.findWpCli();
        this.wpPath = wpPath;
    }
    /**
     * Find WP-CLI executable
     */
    findWpCli() {
        const paths = [
            'wp',
            '/usr/local/bin/wp',
            '/opt/homebrew/bin/wp',
            '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/posix/wp',
        ];
        for (const wpPath of paths) {
            try {
                execFileSync(wpPath, ['--version'], { stdio: 'pipe' });
                return wpPath;
            }
            catch {
                continue;
            }
        }
        return 'wp';
    }
    /**
     * Detect project type (plugin or theme)
     */
    detectProjectType(projectPath) {
        try {
            // Check for plugin header in main PHP file
            const phpFiles = readdirSync(projectPath).filter((f) => f.endsWith('.php'));
            for (const file of phpFiles) {
                const content = readFileSync(join(projectPath, file), 'utf-8');
                if (content.includes('Plugin Name:')) {
                    return 'plugin';
                }
            }
            // Check for theme files
            const stylePath = join(projectPath, 'style.css');
            if (existsSync(stylePath)) {
                const styleContent = readFileSync(stylePath, 'utf-8');
                if (styleContent.includes('Theme Name:')) {
                    return 'theme';
                }
            }
            // Check for functions.php (theme indicator)
            if (existsSync(join(projectPath, 'functions.php'))) {
                return 'theme';
            }
            return 'unknown';
        }
        catch {
            return 'unknown';
        }
    }
    /**
     * Check if plugin-check is available
     */
    async isPluginCheckAvailable(wpPath) {
        try {
            const args = ['plugin', 'is-active', 'plugin-check'];
            if (wpPath) {
                args.push(`--path=${wpPath}`);
            }
            execFileSync(this.wpCliPath, args, { stdio: 'pipe' });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Run plugin check on a plugin or theme
     */
    async check(target, options = {}) {
        const wpPath = options.wpPath || this.wpPath;
        const projectType = this.detectProjectType(target);
        // Check if plugin-check is available
        const hasPluginCheck = await this.isPluginCheckAvailable(wpPath);
        if (!hasPluginCheck) {
            return {
                success: false,
                errors: 0,
                warnings: 0,
                type: projectType,
                issues: [],
                summary: 'Plugin Check not available. Install it: wp plugin install plugin-check --activate',
            };
        }
        try {
            // Get plugin/theme slug from directory name
            const slug = basename(target);
            // Build args array (safer than string concatenation)
            const args = ['plugin', 'check', slug, '--format=json'];
            if (wpPath) {
                args.push(`--path=${wpPath}`);
            }
            if (options.categories && options.categories.length > 0) {
                args.push(`--categories=${options.categories.join(',')}`);
            }
            try {
                const output = execFileSync(this.wpCliPath, args, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    cwd: target,
                });
                const results = this.parsePluginCheckOutput(output);
                return {
                    success: results.errors === 0,
                    errors: results.errors,
                    warnings: results.warnings,
                    type: projectType,
                    issues: results.issues,
                    summary: this.formatSummary(results.errors, results.warnings, projectType),
                };
            }
            catch (error) {
                const execError = error;
                const output = execError.stdout || '';
                if (output) {
                    const results = this.parsePluginCheckOutput(output);
                    return {
                        success: results.errors === 0,
                        errors: results.errors,
                        warnings: results.warnings,
                        type: projectType,
                        issues: results.issues,
                        summary: this.formatSummary(results.errors, results.warnings, projectType),
                    };
                }
                return {
                    success: false,
                    errors: 1,
                    warnings: 0,
                    type: projectType,
                    issues: [],
                    summary: `Plugin check failed: ${execError.message || execError.stderr || 'Unknown error'}`,
                };
            }
        }
        catch (error) {
            const err = error;
            return {
                success: false,
                errors: 1,
                warnings: 0,
                type: projectType,
                issues: [],
                summary: `Error running plugin check: ${err.message || 'Unknown error'}`,
            };
        }
    }
    /**
     * Parse plugin check JSON output
     */
    parsePluginCheckOutput(output) {
        let errors = 0;
        let warnings = 0;
        const issues = [];
        try {
            const lines = output.trim().split('\n');
            for (const line of lines) {
                if (!line.startsWith('[') && !line.startsWith('{'))
                    continue;
                try {
                    const fileIssues = JSON.parse(line);
                    if (Array.isArray(fileIssues)) {
                        for (const issue of fileIssues) {
                            if (issue.type === 'ERROR') {
                                errors++;
                            }
                            else if (issue.type === 'WARNING') {
                                warnings++;
                            }
                            issues.push({
                                file: issue.file || 'unknown',
                                line: issue.line || 0,
                                column: issue.column || 0,
                                type: issue.type || 'WARNING',
                                code: issue.code || 'unknown',
                                message: issue.message || '',
                            });
                        }
                    }
                }
                catch {
                    // Skip unparseable lines
                }
            }
        }
        catch {
            // Return empty results on parse error
        }
        return { errors, warnings, issues };
    }
    formatSummary(errors, warnings, type) {
        if (errors === 0 && warnings === 0) {
            return `✓ ${type} passes all plugin-check validations.`;
        }
        const parts = [];
        if (errors > 0)
            parts.push(`${errors} error(s)`);
        if (warnings > 0)
            parts.push(`${warnings} warning(s)`);
        let summary = `Found ${parts.join(' and ')} in ${type}.`;
        if (errors > 0) {
            summary += ' Fix errors before submitting to WordPress.org.';
        }
        return summary;
    }
}
//# sourceMappingURL=plugin-check-runner.js.map