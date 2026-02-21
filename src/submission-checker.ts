/**
 * WPCS MCP Server - WordPress.org Submission Checker
 * Validates plugin/theme against WP.org submission requirements.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { SubmissionIssue, SubmissionResult } from './types.js';
import { findPhpFiles, getLineNumber, relativePath } from './shared-utils.js';

/**
 * Run all WP.org submission checks.
 */
export function runSubmissionChecks(projectPath: string): SubmissionResult {
  const issues: SubmissionIssue[] = [];

  issues.push(...checkGplLicense(projectPath));
  issues.push(...checkStableTagMatch(projectPath));
  issues.push(...checkChangelogVersion(projectPath));
  issues.push(...checkNoTracking(projectPath));
  issues.push(...checkDismissibleNotices(projectPath));
  issues.push(...checkUninstallCleanup(projectPath));
  issues.push(...checkAbspathGuards(projectPath));
  issues.push(...checkPrefixing(projectPath));
  issues.push(...checkNoCdnDeps(projectPath));
  issues.push(...checkNoWordPressTrademark(projectPath));
  issues.push(...checkRequiredFiles(projectPath));
  issues.push(...checkSvnReadiness(projectPath));

  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;
  const infos = issues.filter(i => i.type === 'info').length;

  const byCategory: Record<string, number> = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }

  return {
    issues,
    passed: errors === 0,
    summary: { errors, warnings, infos, byCategory },
  };
}

function checkGplLicense(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];

  const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license.txt'];
  const hasLicenseFile = licenseFiles.some(f => existsSync(join(projectPath, f)));
  if (!hasLicenseFile) {
    issues.push({
      file: 'project-root', line: 0, type: 'error',
      message: 'Missing LICENSE file. WordPress.org requires GPL-2.0-or-later.',
      code: 'missing-license-file', category: 'license',
    });
  }

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  let foundGpl = false;
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    if (/Plugin Name:/i.test(content)) {
      if (/License:\s*GPL|License:\s*GNU General Public/i.test(content)) {
        foundGpl = true;
      } else {
        issues.push({
          file, line: 1, type: 'error',
          message: 'Main plugin file missing GPL license header. Add: License: GPL-2.0-or-later',
          code: 'missing-gpl-header', category: 'license',
        });
      }
      break;
    }
  }
  if (!foundGpl && issues.filter(i => i.code === 'missing-gpl-header').length === 0) {
    const stylePath = join(projectPath, 'style.css');
    if (existsSync(stylePath)) {
      const content = readFileSync(stylePath, 'utf-8');
      if (!/License:\s*GPL|License:\s*GNU General Public/i.test(content)) {
        issues.push({
          file: 'style.css', line: 1, type: 'error',
          message: 'style.css missing GPL license header.',
          code: 'missing-gpl-header', category: 'license',
        });
      }
    }
  }

  return issues;
}

function checkStableTagMatch(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const readmePath = join(projectPath, 'readme.txt');
  if (!existsSync(readmePath)) return [];

  const readmeContent = readFileSync(readmePath, 'utf-8');
  const stableMatch = readmeContent.match(/Stable tag:\s*(.+)/i);
  if (!stableMatch) return [];

  const stableTag = stableMatch[1].trim();

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    if (/Plugin Name:/i.test(content)) {
      const versionMatch = content.match(/\*\s*Version:\s*(.+)/i);
      if (versionMatch) {
        const pluginVersion = versionMatch[1].trim();
        if (stableTag !== pluginVersion && stableTag !== 'trunk') {
          issues.push({
            file: 'readme.txt', line: 0, type: 'error',
            message: `Stable tag "${stableTag}" does not match plugin version "${pluginVersion}".`,
            code: 'stable-tag-mismatch', category: 'versioning',
          });
        }
      }
      break;
    }
  }

  return issues;
}

function checkChangelogVersion(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const readmePath = join(projectPath, 'readme.txt');
  if (!existsSync(readmePath)) return [];

  const content = readFileSync(readmePath, 'utf-8');
  const stableMatch = content.match(/Stable tag:\s*(.+)/i);
  if (!stableMatch) return [];

  const stableTag = stableMatch[1].trim();
  if (stableTag === 'trunk') return [];

  const changelogSection = content.match(/== Changelog ==([\s\S]*?)(?:==\s|$)/i);
  if (changelogSection) {
    if (!changelogSection[1].includes(stableTag)) {
      issues.push({
        file: 'readme.txt', line: 0, type: 'warning',
        message: `Changelog missing entry for version ${stableTag}.`,
        code: 'changelog-missing-version', category: 'versioning',
      });
    }
  }

  return issues;
}

function checkNoTracking(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    const trackingPatterns = [
      /google-analytics\.com|googletagmanager\.com/i,
      /facebook\.com\/tr|fbevents\.js/i,
      /hotjar\.com|clarity\.ms/i,
      /mixpanel\.com|segment\.com/i,
    ];

    for (const pattern of trackingPatterns) {
      if (pattern.test(content)) {
        const consentCheck = /consent|gdpr|cookie_consent|opt_in|optin/i.test(content);
        if (!consentCheck) {
          issues.push({
            file: rel, line: 1, type: 'error',
            message: 'Analytics/tracking code without user consent mechanism. WP.org prohibits undisclosed tracking.',
            code: 'tracking-without-consent', category: 'tracking',
          });
        }
      }
    }
  }

  return issues;
}

function checkDismissibleNotices(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    const noticePattern = /['"]notice\s+notice-(?:error|warning|success|info)['"](?![^>]*is-dismissible)/gi;
    let match;
    while ((match = noticePattern.exec(content)) !== null) {
      issues.push({
        file: rel, line: getLineNumber(content, match.index), type: 'warning',
        message: 'Admin notice should have is-dismissible class.',
        code: 'non-dismissible-notice', category: 'ux',
      });
    }
  }

  return issues;
}

function checkUninstallCleanup(projectPath: string): SubmissionIssue[] {
  const hasUninstallFile = existsSync(join(projectPath, 'uninstall.php'));
  const phpFiles = findPhpFiles(projectPath);
  let hasUninstallHook = false;

  for (const file of phpFiles) {
    const content = readFileSync(file, 'utf-8');
    if (/register_uninstall_hook\s*\(/i.test(content)) {
      hasUninstallHook = true;
      break;
    }
  }

  if (!hasUninstallFile && !hasUninstallHook) {
    return [{
      file: 'project-root', line: 0, type: 'warning',
      message: 'No uninstall.php or register_uninstall_hook() found. Plugin should clean up data on uninstall.',
      code: 'missing-uninstall-cleanup', category: 'cleanup',
    }];
  }

  return [];
}

function checkAbspathGuards(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    const hasPluginHeader = /Plugin Name:/i.test(content);
    const hasAbspath = /defined\s*\(\s*['"]ABSPATH['"]\s*\)|if\s*\(\s*!\s*defined\s*\(\s*['"]ABSPATH/i.test(content);

    if (!hasAbspath && !hasPluginHeader && !rel.includes('index.php') && !rel.includes('uninstall.php')) {
      issues.push({
        file: rel, line: 1, type: 'error',
        message: "Missing ABSPATH check. Required for all PHP files in WP.org submissions.",
        code: 'missing-abspath-guard', category: 'security',
      });
    }
  }

  return issues;
}

function checkPrefixing(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const slug = basename(projectPath).replace(/-/g, '_');
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');
    const hasNamespace = /^namespace\s+/m.test(content);
    if (hasNamespace) continue;

    const funcPattern = /^function\s+([a-z_]\w*)\s*\(/gmi;
    let match;
    while ((match = funcPattern.exec(content)) !== null) {
      const funcName = match[1];
      const beforeFunc = content.substring(0, match.index);
      const inClass = /class\s+\w+[^{]*\{[^}]*$/s.test(beforeFunc);
      if (inClass) continue;

      if (!funcName.startsWith(slug) && !funcName.startsWith('__')) {
        issues.push({
          file: rel, line: getLineNumber(content, match.index), type: 'warning',
          message: `Global function "${funcName}" should be prefixed with "${slug}_" to avoid collisions.`,
          code: 'unprefixed-global-function', category: 'prefixing',
        });
      }
    }

    const constPattern = /\bdefine\s*\(\s*['"]([A-Z_]+)['"]/g;
    while ((match = constPattern.exec(content)) !== null) {
      const constName = match[1];
      const slugUpper = slug.toUpperCase();
      if (!constName.startsWith(slugUpper) && !constName.startsWith('ABSPATH') && !constName.startsWith('WP_')) {
        issues.push({
          file: rel, line: getLineNumber(content, match.index), type: 'warning',
          message: `Constant "${constName}" should be prefixed with "${slugUpper}_".`,
          code: 'unprefixed-constant', category: 'prefixing',
        });
      }
    }
  }

  return issues;
}

function checkNoCdnDeps(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  const cdnPatterns = [
    /cdn\.jsdelivr\.net/i,
    /cdnjs\.cloudflare\.com/i,
    /unpkg\.com/i,
    /stackpath\.bootstrapcdn\.com/i,
    /maxcdn\.bootstrapcdn\.com/i,
    /code\.jquery\.com/i,
    /ajax\.googleapis\.com\/ajax\/libs/i,
  ];

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    for (const pattern of cdnPatterns) {
      if (pattern.test(content)) {
        const m = content.match(pattern);
        issues.push({
          file: rel, line: m ? getLineNumber(content, content.indexOf(m[0])) : 1, type: 'error',
          message: 'Loading assets from external CDN. WP.org requires bundling all dependencies locally.',
          code: 'external-cdn-dependency', category: 'cdn',
        });
      }
    }
  }

  return issues;
}

function checkNoWordPressTrademark(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    const nameMatch = content.match(/Plugin Name:\s*(.+)/i);
    if (nameMatch) {
      const pluginName = nameMatch[1].trim();
      if (/\bWordPress\b/i.test(pluginName)) {
        issues.push({
          file, line: getLineNumber(content, content.indexOf(nameMatch[0])), type: 'error',
          message: `Plugin name "${pluginName}" contains "WordPress" trademark. Use "WP" instead.`,
          code: 'wordpress-trademark', category: 'trademark',
        });
      }
      break;
    }
  }

  return issues;
}

function checkRequiredFiles(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];

  if (!existsSync(join(projectPath, 'readme.txt'))) {
    issues.push({
      file: 'project-root', line: 0, type: 'error',
      message: 'Missing readme.txt. Required for WordPress.org submission.',
      code: 'missing-readme', category: 'files',
    });
  }

  const phpFiles = readdirSync(projectPath).filter(f => f.endsWith('.php'));
  let hasMainFile = false;
  for (const file of phpFiles) {
    const content = readFileSync(join(projectPath, file), 'utf-8');
    if (/Plugin Name:/i.test(content)) {
      hasMainFile = true;
      break;
    }
  }
  if (!hasMainFile) {
    const isTheme = existsSync(join(projectPath, 'style.css'));
    if (!isTheme) {
      issues.push({
        file: 'project-root', line: 0, type: 'error',
        message: 'No main plugin file found (missing Plugin Name header).',
        code: 'missing-main-file', category: 'files',
      });
    }
  }

  return issues;
}

function checkSvnReadiness(projectPath: string): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];

  const nonDeployable = ['.git', 'node_modules', '.github', '.gitlab'];
  for (const dir of nonDeployable) {
    if (existsSync(join(projectPath, dir))) {
      issues.push({
        file: dir, line: 0, type: 'warning',
        message: `"${dir}" should not be included in SVN deployment. Add to .distignore.`,
        code: 'svn-non-deployable', category: 'deployment',
      });
    }
  }

  const nonDeployableFiles = ['composer.lock', 'package-lock.json', '.gitignore', '.editorconfig'];
  for (const f of nonDeployableFiles) {
    if (existsSync(join(projectPath, f))) {
      issues.push({
        file: f, line: 0, type: 'info',
        message: `"${f}" is typically excluded from SVN deployment. Add to .distignore.`,
        code: 'svn-non-deployable-file', category: 'deployment',
      });
    }
  }

  return issues;
}
