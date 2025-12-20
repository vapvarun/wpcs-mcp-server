/**
 * WPCS MCP Server - Utility Functions
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { StagedFile } from './types.js';

/**
 * Common PHP installation paths by platform
 */
const PHP_PATHS = {
  darwin: [
    // Laravel Herd (most common for macOS WordPress devs)
    `${process.env.HOME}/Library/Application Support/Herd/bin`,
    // Homebrew Apple Silicon
    '/opt/homebrew/opt/php@8.4/bin',
    '/opt/homebrew/opt/php@8.3/bin',
    '/opt/homebrew/opt/php@8.2/bin',
    '/opt/homebrew/bin',
    // Homebrew Intel
    '/usr/local/opt/php@8.4/bin',
    '/usr/local/opt/php@8.3/bin',
    '/usr/local/opt/php@8.2/bin',
    '/usr/local/bin',
    // MAMP
    '/Applications/MAMP/bin/php/php8.4.0/bin',
    '/Applications/MAMP/bin/php/php8.3.0/bin',
    '/Applications/MAMP/bin/php/php8.2.0/bin',
    // Valet
    `${process.env.HOME}/.valet/bin`,
  ],
  linux: [
    '/usr/bin',
    '/usr/local/bin',
  ],
  win32: [
    'C:\\php',
    'C:\\laragon\\bin\\php\\php-8.4',
    'C:\\laragon\\bin\\php\\php-8.3',
    'C:\\laragon\\bin\\php\\php-8.2',
    'C:\\xampp\\php',
  ],
};

/**
 * Minimum required PHP version for WPCS dependencies
 */
const MIN_PHP_VERSION = '8.2.0';

/**
 * Find PHP binary in common locations
 */
export function findPhpPath(): string | null {
  const platform = process.platform as keyof typeof PHP_PATHS;
  const paths = PHP_PATHS[platform] || [];

  for (const phpPath of paths) {
    const phpBinary = platform === 'win32' ? `${phpPath}\\php.exe` : `${phpPath}/php`;
    if (existsSync(phpBinary)) {
      return phpPath;
    }
  }

  return null;
}

/**
 * Check PHP version meets minimum requirements
 */
export function checkPhpVersion(): { valid: boolean; version?: string; path?: string; error?: string } {
  try {
    const versionOutput = execSync('php -v', { encoding: 'utf-8' });
    const match = versionOutput.match(/PHP (\d+\.\d+\.\d+)/);

    if (!match) {
      return { valid: false, error: 'Could not determine PHP version' };
    }

    const version = match[1];
    const phpPath = execSync('which php', { encoding: 'utf-8' }).trim();

    // Compare versions
    const [major, minor] = version.split('.').map(Number);
    const [minMajor, minMinor] = MIN_PHP_VERSION.split('.').map(Number);

    if (major < minMajor || (major === minMajor && minor < minMinor)) {
      return {
        valid: false,
        version,
        path: phpPath,
        error: `PHP ${version} found at ${phpPath}, but version ${MIN_PHP_VERSION}+ is required. ` +
               `Composer dependencies for WPCS need PHP ${MIN_PHP_VERSION} or higher.`,
      };
    }

    return { valid: true, version, path: phpPath };
  } catch {
    return { valid: false, error: 'PHP not found in PATH' };
  }
}

/**
 * Setup PATH with PHP and Composer directories
 */
export function setupEnvironmentPath(): { phpPath?: string; composerPath?: string; warnings: string[] } {
  const warnings: string[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  // Composer bin path
  const composerBin = process.platform === 'win32'
    ? `${homeDir}\\AppData\\Roaming\\Composer\\vendor\\bin`
    : `${homeDir}/.composer/vendor/bin`;

  // Find PHP path if not already in PATH with correct version
  let phpPath: string | undefined;
  const phpCheck = checkPhpVersion();

  if (!phpCheck.valid) {
    // Try to find PHP in common locations
    const foundPhpPath = findPhpPath();

    if (foundPhpPath) {
      phpPath = foundPhpPath;
      process.env.PATH = `${foundPhpPath}:${process.env.PATH}`;

      // Re-check version with new PATH
      const recheck = checkPhpVersion();
      if (!recheck.valid) {
        warnings.push(`Found PHP at ${foundPhpPath} but it's version ${recheck.version || 'unknown'}. Need ${MIN_PHP_VERSION}+`);
      }
    } else {
      warnings.push(phpCheck.error || 'PHP not found');
      warnings.push('Common PHP locations checked: Herd, Homebrew, MAMP, system');
    }
  } else {
    phpPath = phpCheck.path?.replace(/\/php$/, '');
  }

  // Add composer bin to PATH if not present
  if (!process.env.PATH?.includes(composerBin)) {
    process.env.PATH = `${composerBin}:${process.env.PATH}`;
  }

  return { phpPath, composerPath: composerBin, warnings };
}

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
    // Try composer global bin directly
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const composerPhpcs = `${homeDir}/.composer/vendor/bin/phpcs`;

    if (existsSync(composerPhpcs)) {
      return { installed: true, path: composerPhpcs };
    }

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
    // First check PHP version
    const phpCheck = checkPhpVersion();
    if (!phpCheck.valid) {
      return {
        success: false,
        message: `Cannot auto-install: ${phpCheck.error}\n\n` +
                 `To fix this, ensure PHP ${MIN_PHP_VERSION}+ is in your PATH.\n` +
                 `For Herd users: Add to MCP env: "PATH": "$HOME/Library/Application Support/Herd/bin:..."\n` +
                 `For Homebrew: Add to MCP env: "PATH": "/opt/homebrew/opt/php@8.4/bin:..."`,
      };
    }

    // Check if composer is available
    try {
      execSync('which composer', { encoding: 'utf-8' });
    } catch {
      return {
        success: false,
        message: 'Composer not found. Please install Composer first: https://getcomposer.org',
      };
    }

    // Check composer version
    try {
      const composerVersion = execSync('composer -V', { encoding: 'utf-8' });
      if (composerVersion.includes('Composer version 1.')) {
        return {
          success: false,
          message: 'Composer 1.x detected. Please upgrade to Composer 2.x: https://getcomposer.org/download/',
        };
      }
    } catch {
      // Continue anyway
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
 * @deprecated Use setupEnvironmentPath() instead
 */
export function ensureComposerInPath(): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const composerBin = `${homeDir}/.composer/vendor/bin`;

  if (!process.env.PATH?.includes(composerBin)) {
    process.env.PATH = `${composerBin}:${process.env.PATH}`;
  }
}
