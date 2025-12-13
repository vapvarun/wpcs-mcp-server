/**
 * WPCS MCP Server - Utility Functions
 */

import { execSync } from 'child_process';
import { StagedFile } from './types.js';

/**
 * Get list of staged PHP files from git
 */
export function getStagedPhpFiles(workingDir?: string): StagedFile[] {
  try {
    const options = workingDir ? { cwd: workingDir } : {};
    const output = execSync('git diff --cached --name-status', {
      ...options,
      encoding: 'utf-8',
    });

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [status, path] = line.split('\t');
        return { status, path };
      })
      .filter(
        (file) =>
          file.path &&
          file.path.endsWith('.php') &&
          file.status !== 'D' // Exclude deleted files
      );
  } catch {
    return [];
  }
}

/**
 * Check if phpcs is available in PATH
 */
export function checkPhpcsInstalled(): { installed: boolean; path?: string; error?: string } {
  try {
    const path = execSync('which phpcs', { encoding: 'utf-8' }).trim();
    return { installed: true, path };
  } catch {
    return {
      installed: false,
      error: 'phpcs not found in PATH. Install with: composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs',
    };
  }
}

/**
 * Check if WordPress standard is available
 */
export function checkWpcsInstalled(): { installed: boolean; standards?: string[]; error?: string } {
  try {
    const output = execSync('phpcs -i', { encoding: 'utf-8' });
    const hasWordPress = output.includes('WordPress');

    if (!hasWordPress) {
      return {
        installed: false,
        error: 'WordPress coding standard not found. Install with: composer global require wp-coding-standards/wpcs',
      };
    }

    // Extract standards list
    const match = output.match(/installed coding standards are (.+)/i);
    const standards = match ? match[1].split(', ').map((s) => s.trim()) : [];

    return { installed: true, standards };
  } catch {
    return {
      installed: false,
      error: 'Failed to check phpcs standards',
    };
  }
}

/**
 * Format file path for display
 */
export function formatPath(filePath: string, workingDir?: string): string {
  if (workingDir && filePath.startsWith(workingDir)) {
    return filePath.substring(workingDir.length + 1);
  }
  return filePath;
}
