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
     * Build phpcs command with all options
     */
    private buildCommand;
    /**
     * Build phpcbf command with all options
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
