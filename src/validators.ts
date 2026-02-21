/**
 * WPCS MCP Server - Validators
 * Lightweight checks for plugin/theme headers, readme, i18n, and new v2.0 validations
 * No external dependencies - pure file analysis
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { ValidationResult, ProjectType } from './types.js';
import { findPhpFiles } from './shared-utils.js';

/**
 * Detect project type
 */
export function detectProjectType(projectPath: string): ProjectType {
  try {
    // Check for plugin header
    const phpFiles = readdirSync(projectPath).filter((f: string) => f.endsWith('.php'));
    for (const file of phpFiles) {
      const content = readFileSync(join(projectPath, file), 'utf-8');
      if (content.includes('Plugin Name:')) {
        return 'plugin';
      }
    }

    // Check for theme
    const stylePath = join(projectPath, 'style.css');
    if (existsSync(stylePath)) {
      const content = readFileSync(stylePath, 'utf-8');
      if (content.includes('Theme Name:')) {
        return 'theme';
      }
    }

    if (existsSync(join(projectPath, 'functions.php'))) {
      return 'theme';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Validate plugin headers
 */
export function validatePluginHeaders(projectPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: {},
  };

  const requiredHeaders = ['Plugin Name', 'Version', 'Description'];
  const recommendedHeaders = ['Author', 'Author URI', 'Plugin URI', 'License', 'Text Domain', 'Requires at least', 'Requires PHP'];

  try {
    const phpFiles = readdirSync(projectPath).filter((f: string) => f.endsWith('.php'));
    let mainFile: string | null = null;
    let headers: Record<string, string> = {};

    for (const file of phpFiles) {
      const filePath = join(projectPath, file);
      const content = readFileSync(filePath, 'utf-8');

      if (content.includes('Plugin Name:')) {
        mainFile = file;
        headers = parseHeaders(content);
        break;
      }
    }

    if (!mainFile) {
      result.valid = false;
      result.errors.push('No main plugin file found (missing Plugin Name header)');
      return result;
    }

    result.info['Main File'] = mainFile;

    // Check required headers
    for (const header of requiredHeaders) {
      if (!headers[header]) {
        result.valid = false;
        result.errors.push(`Missing required header: ${header}`);
      } else {
        result.info[header] = headers[header];
      }
    }

    // Check recommended headers
    for (const header of recommendedHeaders) {
      if (!headers[header]) {
        result.warnings.push(`Missing recommended header: ${header}`);
      } else {
        result.info[header] = headers[header];
      }
    }

    // Check text domain matches folder name
    const folderName = basename(projectPath);
    if (headers['Text Domain'] && headers['Text Domain'] !== folderName) {
      result.warnings.push(`Text Domain "${headers['Text Domain']}" doesn't match folder name "${folderName}"`);
    }

    // Check version format
    if (headers['Version'] && !/^\d+\.\d+(\.\d+)?$/.test(headers['Version'])) {
      result.warnings.push(`Version "${headers['Version']}" should follow semver format (e.g., 1.0.0)`);
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Error reading plugin: ${(error as Error).message}`);
  }

  return result;
}

/**
 * Validate theme headers
 */
export function validateThemeHeaders(projectPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: {},
  };

  const requiredHeaders = ['Theme Name', 'Version'];
  const recommendedHeaders = ['Author', 'Author URI', 'Description', 'License', 'Text Domain', 'Requires at least', 'Requires PHP'];

  try {
    const stylePath = join(projectPath, 'style.css');

    if (!existsSync(stylePath)) {
      result.valid = false;
      result.errors.push('Missing style.css file');
      return result;
    }

    const content = readFileSync(stylePath, 'utf-8');
    const headers = parseHeaders(content);

    if (!headers['Theme Name']) {
      result.valid = false;
      result.errors.push('Missing Theme Name header in style.css');
      return result;
    }

    // Check required headers
    for (const header of requiredHeaders) {
      if (!headers[header]) {
        result.valid = false;
        result.errors.push(`Missing required header: ${header}`);
      } else {
        result.info[header] = headers[header];
      }
    }

    // Check recommended headers
    for (const header of recommendedHeaders) {
      if (!headers[header]) {
        result.warnings.push(`Missing recommended header: ${header}`);
      } else {
        result.info[header] = headers[header];
      }
    }

    // Check required theme files
    const requiredFiles = ['index.php'];
    for (const file of requiredFiles) {
      if (!existsSync(join(projectPath, file))) {
        result.errors.push(`Missing required file: ${file}`);
        result.valid = false;
      }
    }

    // Check recommended theme files
    const recommendedFiles = ['functions.php', 'screenshot.png'];
    for (const file of recommendedFiles) {
      if (!existsSync(join(projectPath, file))) {
        result.warnings.push(`Missing recommended file: ${file}`);
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Error reading theme: ${(error as Error).message}`);
  }

  return result;
}

/**
 * Validate readme.txt
 */
export function validateReadme(projectPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: {},
  };

  const readmePath = join(projectPath, 'readme.txt');
  const readmeMdPath = join(projectPath, 'README.md');

  if (!existsSync(readmePath)) {
    if (existsSync(readmeMdPath)) {
      result.warnings.push('Found README.md but missing readme.txt (required for WordPress.org)');
    } else {
      result.errors.push('Missing readme.txt file');
      result.valid = false;
    }
    return result;
  }

  try {
    const content = readFileSync(readmePath, 'utf-8');
    const lines = content.split('\n');

    // Check title line
    if (!lines[0] || !lines[0].startsWith('===') || !lines[0].endsWith('===')) {
      result.errors.push('readme.txt must start with === Plugin Name ===');
      result.valid = false;
    } else {
      result.info['Name'] = lines[0].replace(/===/g, '').trim();
    }

    // Required sections
    const requiredSections = ['Description', 'Changelog'];
    const recommendedSections = ['Installation', 'Frequently Asked Questions', 'Screenshots'];

    for (const section of requiredSections) {
      if (!content.includes(`== ${section} ==`)) {
        result.errors.push(`Missing required section: == ${section} ==`);
        result.valid = false;
      }
    }

    for (const section of recommendedSections) {
      if (!content.includes(`== ${section} ==`)) {
        result.warnings.push(`Missing recommended section: == ${section} ==`);
      }
    }

    // Check for required headers
    const headerMatch = content.match(/Contributors:\s*(.+)/i);
    if (headerMatch) {
      result.info['Contributors'] = headerMatch[1].trim();
    } else {
      result.warnings.push('Missing Contributors field');
    }

    const tagsMatch = content.match(/Tags:\s*(.+)/i);
    if (tagsMatch) {
      const tags = tagsMatch[1].split(',').map(t => t.trim());
      result.info['Tags'] = tags.join(', ');
      if (tags.length > 5) {
        result.warnings.push(`Too many tags (${tags.length}). WordPress.org recommends max 5 tags.`);
      }
    } else {
      result.warnings.push('Missing Tags field');
    }

    const stableMatch = content.match(/Stable tag:\s*(.+)/i);
    if (stableMatch) {
      result.info['Stable tag'] = stableMatch[1].trim();
    } else {
      result.errors.push('Missing Stable tag field');
      result.valid = false;
    }

    const testedMatch = content.match(/Tested up to:\s*(.+)/i);
    if (testedMatch) {
      result.info['Tested up to'] = testedMatch[1].trim();
    } else {
      result.warnings.push('Missing Tested up to field');
    }

    const requiresMatch = content.match(/Requires at least:\s*(.+)/i);
    if (requiresMatch) {
      result.info['Requires at least'] = requiresMatch[1].trim();
    } else {
      result.warnings.push('Missing Requires at least field');
    }

    // Check short description length
    const shortDescMatch = content.match(/===.*===\n+([\s\S]*?)(?=\n\n)/);
    if (shortDescMatch) {
      const shortDesc = shortDescMatch[1].replace(/^[^\n]*\n/, '').trim();
      if (shortDesc.length > 150) {
        result.warnings.push(`Short description too long (${shortDesc.length} chars). Should be under 150.`);
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Error reading readme.txt: ${(error as Error).message}`);
  }

  return result;
}

/**
 * Check text domain consistency
 */
export function validateTextDomain(projectPath: string, expectedDomain?: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: {},
  };

  const domain = expectedDomain || basename(projectPath);
  result.info['Expected Text Domain'] = domain;

  try {
    const phpFiles = findPhpFiles(projectPath);
    const issues: string[] = [];

    for (const file of phpFiles) {
      const content = readFileSync(file, 'utf-8');
      const relativePath = file.replace(projectPath + '/', '');

      // Check for translation functions with wrong domain
      const i18nFunctions = [
        '__', '_e', '_x', '_ex', '_n', '_nx', 'esc_html__', 'esc_html_e',
        'esc_attr__', 'esc_attr_e', 'esc_html_x', 'esc_attr_x'
      ];

      for (const func of i18nFunctions) {
        // Match function calls with text domain
        const regex = new RegExp(`${func}\\s*\\([^)]*,\\s*['"]([^'"]+)['"]\\s*\\)`, 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
          if (match[1] !== domain) {
            issues.push(`${relativePath}: Wrong text domain "${match[1]}" in ${func}()`);
          }
        }
      }
    }

    if (issues.length > 0) {
      result.warnings = issues.slice(0, 20); // Limit to 20 issues
      if (issues.length > 20) {
        result.warnings.push(`... and ${issues.length - 20} more text domain issues`);
      }
    }

    result.info['Files checked'] = phpFiles.length.toString();

  } catch (error) {
    result.errors.push(`Error checking text domain: ${(error as Error).message}`);
  }

  return result;
}

/**
 * Parse WordPress-style headers from content
 */
function parseHeaders(content: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /^\s*\*?\s*([A-Za-z ]+):\s*(.+)$/gm;

  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers[match[1].trim()] = match[2].trim();
  }

  return headers;
}

// ─── v2.0 Additional Validators ─────────────────────────────────

/**
 * Validate .pot file exists and is valid
 */
export function validatePotFile(projectPath: string, textDomain?: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [], info: {} };
  const domain = textDomain || basename(projectPath);

  const langDir = join(projectPath, 'languages');
  if (!existsSync(langDir)) {
    result.warnings.push('No languages/ directory found. Create one for i18n support.');
    return result;
  }

  const potFile = join(langDir, `${domain}.pot`);
  if (!existsSync(potFile)) {
    result.warnings.push(`Missing ${domain}.pot file in languages/. Generate with wp i18n make-pot.`);
    return result;
  }

  try {
    const content = readFileSync(potFile, 'utf-8');
    result.info['POT File'] = `languages/${domain}.pot`;

    if (!content.includes('msgid')) {
      result.errors.push('POT file appears invalid (no msgid entries).');
      result.valid = false;
    }

    if (!content.includes('Project-Id-Version')) {
      result.warnings.push('POT file missing Project-Id-Version header.');
    }

    const msgidCount = (content.match(/^msgid /gm) || []).length;
    result.info['Translatable strings'] = msgidCount.toString();
  } catch (error) {
    result.errors.push(`Error reading POT file: ${(error as Error).message}`);
    result.valid = false;
  }

  return result;
}

/**
 * Validate stable tag matches plugin version
 */
export function validateStableTagMatch(projectPath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [], info: {} };

  const readmePath = join(projectPath, 'readme.txt');
  if (!existsSync(readmePath)) return result;

  const readmeContent = readFileSync(readmePath, 'utf-8');
  const stableMatch = readmeContent.match(/Stable tag:\s*(.+)/i);
  if (!stableMatch) return result;

  const stableTag = stableMatch[1].trim();
  result.info['Stable tag'] = stableTag;

  if (stableTag === 'trunk') {
    result.warnings.push('Stable tag is "trunk". Use a specific version number for production.');
    return result;
  }

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    if (/Plugin Name:/i.test(content)) {
      const versionMatch = content.match(/\*\s*Version:\s*(.+)/i);
      if (versionMatch) {
        const pluginVersion = versionMatch[1].trim();
        result.info['Plugin version'] = pluginVersion;

        if (stableTag !== pluginVersion) {
          result.errors.push(`Stable tag "${stableTag}" does not match plugin version "${pluginVersion}".`);
          result.valid = false;
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Validate GPL license presence
 */
export function validateGplLicense(projectPath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [], info: {} };

  const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license.txt'];
  const foundFile = licenseFiles.find(f => existsSync(join(projectPath, f)));

  if (foundFile) {
    result.info['License file'] = foundFile;
  } else {
    result.warnings.push('No LICENSE file found. WordPress.org requires GPL-2.0-or-later.');
  }

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    if (/Plugin Name:/i.test(content)) {
      if (/License:\s*GPL|License:\s*GNU General Public/i.test(content)) {
        result.info['License header'] = 'GPL found in plugin header';
      } else {
        result.errors.push('Main plugin file missing GPL license in header.');
        result.valid = false;
      }
      break;
    }
  }

  return result;
}

/**
 * Validate uninstall cleanup mechanism exists
 */
export function validateUninstallCleanup(projectPath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [], info: {} };

  const hasUninstallFile = existsSync(join(projectPath, 'uninstall.php'));
  if (hasUninstallFile) {
    result.info['Uninstall'] = 'uninstall.php found';
    return result;
  }

  const phpFiles = findPhpFiles(projectPath);
  for (const file of phpFiles) {
    const content = readFileSync(file, 'utf-8');
    if (/register_uninstall_hook\s*\(/i.test(content)) {
      result.info['Uninstall'] = 'register_uninstall_hook() found';
      return result;
    }
  }

  result.warnings.push('No uninstall.php or register_uninstall_hook() found. Plugin should clean up on uninstall.');
  return result;
}
