/**
 * WPCS MCP Server - Utility Functions
 */
import { StagedFile } from './types.js';
/**
 * Find PHP binary in common locations
 */
export declare function findPhpPath(): string | null;
/**
 * Check PHP version meets minimum requirements
 */
export declare function checkPhpVersion(): {
    valid: boolean;
    version?: string;
    path?: string;
    error?: string;
};
/**
 * Setup PATH with PHP and Composer directories
 */
export declare function setupEnvironmentPath(): {
    phpPath?: string;
    composerPath?: string;
    warnings: string[];
};
/**
 * Get list of staged PHP files from git
 */
export declare function getStagedPhpFiles(workingDir?: string): StagedFile[];
/**
 * Check if phpcs is available in PATH
 */
export declare function checkPhpcsInstalled(): {
    installed: boolean;
    path?: string;
    error?: string;
};
/**
 * Check if WordPress standard is available
 */
export declare function checkWpcsInstalled(): {
    installed: boolean;
    standards?: string[];
    error?: string;
};
/**
 * Format file path for display
 */
export declare function formatPath(filePath: string, workingDir?: string): string;
/**
 * Auto-install phpcs and WPCS globally via composer
 * Returns true if installation succeeded
 */
export declare function autoInstallWpcs(): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Ensure PATH includes composer bin directory
 * @deprecated Use setupEnvironmentPath() instead
 */
export declare function ensureComposerInPath(): void;
