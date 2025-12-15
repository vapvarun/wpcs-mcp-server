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

/**
 * Auto-install phpcs and WPCS globally via composer
 * Returns true if installation succeeded
 */
export async function autoInstallWpcs(): Promise<{ success: boolean; message: string }> {
  console.error('Auto-installing WPCS dependencies...');

  try {
    // Check if composer is available
    try {
      execSync('which composer', { encoding: 'utf-8' });
    } catch {
      return {
        success: false,
        message: 'Composer not found. Please install Composer first: https://getcomposer.org',
      };
    }

    // Step 1: Allow the composer installer plugin
    console.error('Configuring composer plugins...');
    try {
      execSync(
        'composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true',
        { encoding: 'utf-8', stdio: 'pipe' }
      );
    } catch {
      // Ignore if already configured
    }

    // Step 2: Install phpcs, WPCS, and PHPCompatibility
    console.error('Installing PHP_CodeSniffer, WordPress Coding Standards, and PHPCompatibility...');
    execSync(
      'composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer',
      { encoding: 'utf-8', stdio: 'pipe', timeout: 180000 }
    );

    // Step 3: Verify installation
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const composerBin = `${homeDir}/.composer/vendor/bin`;

    // Add to PATH for this session
    process.env.PATH = `${composerBin}:${process.env.PATH}`;

    // Verify phpcs works
    const phpcsPath = execSync('which phpcs', { encoding: 'utf-8' }).trim();
    const standards = execSync('phpcs -i', { encoding: 'utf-8' });

    if (!standards.includes('WordPress')) {
      return {
        success: false,
        message: 'WPCS installed but WordPress standard not detected. Try: phpcs --config-set installed_paths ~/.composer/vendor/wp-coding-standards/wpcs',
      };
    }

    return {
      success: true,
      message: `Successfully installed WPCS. phpcs path: ${phpcsPath}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Auto-install failed: ${errorMessage}`,
    };
  }
}

/**
 * Ensure PATH includes composer bin directory
 */
export function ensureComposerInPath(): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const composerBin = `${homeDir}/.composer/vendor/bin`;

  if (!process.env.PATH?.includes(composerBin)) {
    process.env.PATH = `${composerBin}:${process.env.PATH}`;
  }
}
