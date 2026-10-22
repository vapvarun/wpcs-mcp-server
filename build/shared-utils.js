/**
 * WPCS MCP Server - Shared Utilities
 * Consolidated file-finding and line helpers used across all checkers.
 */
import { readdirSync } from 'fs';
import { join } from 'path';
const DEFAULT_EXCLUDE_DIRS = ['vendor', 'node_modules', 'build', 'dist', '.git'];
/**
 * Find all PHP files in a directory tree, excluding common non-project dirs.
 */
export function findPhpFiles(dir, excludeDirs = DEFAULT_EXCLUDE_DIRS, files = []) {
    try {
        const items = readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                if (!excludeDirs.includes(item.name)) {
                    findPhpFiles(fullPath, excludeDirs, files);
                }
            }
            else if (item.name.endsWith('.php')) {
                files.push(fullPath);
            }
        }
    }
    catch {
        // Ignore permission errors, missing dirs, etc.
    }
    return files;
}
/**
 * Find files by extension in a directory tree.
 */
export function findFilesByExt(dir, ext, excludeDirs = DEFAULT_EXCLUDE_DIRS, files = []) {
    try {
        const items = readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                if (!excludeDirs.includes(item.name)) {
                    findFilesByExt(fullPath, ext, excludeDirs, files);
                }
            }
            else if (item.name.endsWith(ext)) {
                files.push(fullPath);
            }
        }
    }
    catch {
        // Ignore errors
    }
    return files;
}
/**
 * Find all code files (php, js, css, scss, ts, jsx, tsx) in a directory tree.
 */
export function findAllCodeFiles(dir, excludeDirs = DEFAULT_EXCLUDE_DIRS, files = []) {
    const codeExts = ['.php', '.js', '.css', '.scss', '.ts', '.jsx', '.tsx'];
    try {
        const items = readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                if (!excludeDirs.includes(item.name)) {
                    findAllCodeFiles(fullPath, excludeDirs, files);
                }
            }
            else if (codeExts.some(ext => item.name.endsWith(ext))) {
                files.push(fullPath);
            }
        }
    }
    catch {
        // Ignore errors
    }
    return files;
}
/**
 * Get the 1-based line number for a character offset in a string.
 */
export function getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
}
/**
 * Find the 1-based line number of the first line matching a pattern.
 */
export function findPatternLine(lines, pattern) {
    for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
            return i + 1;
        }
    }
    return 1;
}
/**
 * Get a relative path from a project root.
 */
export function relativePath(filePath, projectPath) {
    return filePath.startsWith(projectPath + '/') ? filePath.slice(projectPath.length + 1) : filePath;
}
//# sourceMappingURL=shared-utils.js.map