/**
 * WPCS MCP Server - Plugin Check Runner
 * WordPress Plugin Check integration via WP-CLI
 *
 * Note: Uses execSync for CLI tool integration. All inputs are validated
 * and this runs in a trusted local environment.
 */
export interface PluginCheckResult {
    success: boolean;
    errors: number;
    warnings: number;
    type: 'plugin' | 'theme' | 'unknown';
    issues: PluginCheckIssue[];
    summary: string;
}
export interface PluginCheckIssue {
    file: string;
    line: number;
    column: number;
    type: 'ERROR' | 'WARNING';
    code: string;
    message: string;
}
export declare class PluginCheckRunner {
    private wpCliPath;
    private wpPath;
    constructor(wpPath?: string);
    /**
     * Find WP-CLI executable
     */
    private findWpCli;
    /**
     * Detect project type (plugin or theme)
     */
    detectProjectType(projectPath: string): 'plugin' | 'theme' | 'unknown';
    /**
     * Check if plugin-check is available
     */
    isPluginCheckAvailable(wpPath?: string): Promise<boolean>;
    /**
     * Run plugin check on a plugin or theme
     */
    check(target: string, options?: {
        wpPath?: string;
        categories?: string[];
    }): Promise<PluginCheckResult>;
    /**
     * Parse plugin check JSON output
     */
    private parsePluginCheckOutput;
    private formatSummary;
}
