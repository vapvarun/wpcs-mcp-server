/**
 * WPCS MCP Server - Shared Utilities
 * Consolidated file-finding and line helpers used across all checkers.
 */
/**
 * Find all PHP files in a directory tree, excluding common non-project dirs.
 */
export declare function findPhpFiles(dir: string, excludeDirs?: string[], files?: string[]): string[];
/**
 * Find files by extension in a directory tree.
 */
export declare function findFilesByExt(dir: string, ext: string, excludeDirs?: string[], files?: string[]): string[];
/**
 * Find all code files (php, js, css, scss, ts, jsx, tsx) in a directory tree.
 */
export declare function findAllCodeFiles(dir: string, excludeDirs?: string[], files?: string[]): string[];
/**
 * Get the 1-based line number for a character offset in a string.
 */
export declare function getLineNumber(content: string, index: number): number;
/**
 * Find the 1-based line number of the first line matching a pattern.
 */
export declare function findPatternLine(lines: string[], pattern: RegExp): number;
/**
 * Get a relative path from a project root.
 */
export declare function relativePath(filePath: string, projectPath: string): string;
