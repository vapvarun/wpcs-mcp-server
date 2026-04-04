/**
 * WPCS MCP Server - PHPCS/PHPCBF Runner
 */
import { WpcsCheckResult, WpcsFixResult } from './types.js';
export declare class PhpcsRunner {
    private standard;
    private excludePatterns;
    private textDomain;
    private minPhpVersion;
    constructor(standard?: string, options?: {
        excludePatterns?: string[];
        textDomain?: string;
        minPhpVersion?: string;
    });
    /**
     * Check if target path (or its parent directories) has a phpcs config file.
     * PHPCS auto-detects: .phpcs.xml, phpcs.xml, .phpcs.xml.dist, phpcs.xml.dist
     */
    private findPhpcsConfig;
    /**
     * Build phpcs command with all options.
     * If the target has a plugin-level phpcs config (.phpcs.xml.dist etc.),
     * skip --standard so PHPCS uses the project config instead.
     */
    private buildCommand;
    /**
     * Build phpcbf command with all options.
     * Same logic: respects project-level config if present.
     */
    private buildFixCommand;
    /**
     * Run phpcs on a single file or directory
     */
    check(target: string, workingDir?: string): Promise<WpcsCheckResult>;
    /**
     * Run phpcbf to auto-fix a file
     */
    fix(filePath: string, workingDir?: string): Promise<WpcsFixResult>;
    /**
     * Check multiple files
     */
    checkFiles(files: string[], workingDir?: string): Promise<WpcsCheckResult>;
    /**
     * Fix and check workflow for pre-commit
     */
    fixAndCheck(files: string[], workingDir?: string): Promise<{
        checkResult: WpcsCheckResult;
        fixedFiles: string[];
        reStageCommand?: string;
    }>;
    private formatSummary;
}
