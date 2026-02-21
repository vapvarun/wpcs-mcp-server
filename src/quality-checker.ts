/**
 * WPCS MCP Server - Quality Checker
 * Orchestrates hooks, deprecated functions, and delegates to security/performance checkers.
 * Pure file analysis - no external dependencies.
 */

import { readFileSync, statSync } from 'fs';
import type { QualityIssue, QualityResult } from './types.js';
import { findPhpFiles, getLineNumber, findPatternLine, relativePath } from './shared-utils.js';
import { runSecurityChecks } from './security-checker.js';
import { runPerformanceChecks } from './performance-checker.js';
import { buildDeprecatedMap } from './wp-deprecated.js';

/**
 * Run all quality checks on a directory.
 */
export function runQualityChecks(projectPath: string): QualityResult {
  const issues: QualityIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Hook checks (kept in quality-checker)
    issues.push(...checkEnqueueHooks(rel, content, lines));
    issues.push(...checkHookUsage(rel, content, lines));
    issues.push(...checkDirectOutput(rel, content));
    issues.push(...checkWordPressPatterns(rel, content, lines));
    issues.push(...checkAccessibility(rel, content));
    // Deprecated function checks (new)
    issues.push(...checkDeprecatedFunctions(rel, content));
  }

  // Large files
  issues.push(...checkLargeFiles(projectPath, phpFiles));

  // Merge results from extracted security checker
  const securityResult = runSecurityChecks(projectPath);
  for (const secIssue of securityResult.issues) {
    issues.push({
      file: secIssue.file,
      line: secIssue.line,
      type: secIssue.type === 'info' ? 'warning' : secIssue.type,
      category: 'security',
      message: secIssue.message,
      code: secIssue.code,
    });
  }

  // Merge results from extracted performance checker
  const perfResult = runPerformanceChecks(projectPath);
  for (const perfIssue of perfResult.issues) {
    issues.push({
      file: perfIssue.file,
      line: perfIssue.line,
      type: perfIssue.type === 'info' ? 'warning' : perfIssue.type,
      category: 'performance',
      message: perfIssue.message,
      code: perfIssue.code,
    });
  }

  // Calculate summary
  const summary = {
    errors: issues.filter(i => i.type === 'error').length,
    warnings: issues.filter(i => i.type === 'warning').length,
    byCategory: {} as Record<string, number>,
  };
  for (const issue of issues) {
    summary.byCategory[issue.category] = (summary.byCategory[issue.category] || 0) + 1;
  }

  return { issues, summary };
}

// ─── Hook Checks ────────────────────────────────────────────────

function checkEnqueueHooks(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const enqueuePattern = /\b(wp_enqueue_script|wp_enqueue_style|wp_register_script|wp_register_style)\s*\(/g;
  const hasProperHook = /add_action\s*\(\s*['"](?:wp_enqueue_scripts|admin_enqueue_scripts|login_enqueue_scripts)['"]/i.test(content);

  let match;
  while ((match = enqueuePattern.exec(content)) !== null) {
    const lineNum = getLineNumber(content, match.index);
    const beforeMatch = content.substring(0, match.index);
    const inFunction = /function\s+\w+\s*\([^)]*\)\s*\{[^}]*$/s.test(beforeMatch);

    if (!inFunction && !hasProperHook) {
      issues.push({
        file, line: lineNum, type: 'warning', category: 'hooks',
        message: `${match[1]}() should be called within wp_enqueue_scripts, admin_enqueue_scripts, or login_enqueue_scripts hook`,
        code: 'enqueue-wrong-hook',
      });
    }
  }

  if (/add_action\s*\(\s*['"]init['"].*(?:wp_enqueue_script|wp_enqueue_style)/s.test(content)) {
    issues.push({
      file, line: findPatternLine(lines, /add_action\s*\(\s*['"]init['"]/), type: 'error', category: 'hooks',
      message: 'Scripts/styles should not be enqueued on init hook. Use wp_enqueue_scripts instead.',
      code: 'enqueue-on-init',
    });
  }

  return issues;
}

function checkHookUsage(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const highPriorityPattern = /add_(?:action|filter)\s*\([^,]+,[^,]+,\s*(\d+)/g;
  let match;
  while ((match = highPriorityPattern.exec(content)) !== null) {
    const priority = parseInt(match[1], 10);
    if (priority > 999) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning', category: 'hooks',
        message: `Very high hook priority (${priority}). This can cause issues with other plugins.`,
        code: 'high-priority-hook',
      });
    }
  }

  if (/function\s+__construct\s*\([^)]*\)\s*\{[^}]*add_(?:action|filter)/s.test(content)) {
    issues.push({
      file, line: findPatternLine(lines, /function\s+__construct/), type: 'warning', category: 'hooks',
      message: 'Avoid add_action/filter in constructor. Use an init() method or plugins_loaded hook.',
      code: 'hooks-in-constructor',
    });
  }

  const removeHookPattern = /remove_(?:action|filter)\s*\(\s*['"](\w+)['"]/g;
  while ((match = removeHookPattern.exec(content)) !== null) {
    const hookName = match[1];
    const lineNum = getLineNumber(content, match.index);
    const beforeCode = content.substring(0, match.index);
    const inProperHook = /add_action\s*\(\s*['"](?:init|plugins_loaded|after_setup_theme)['"]/i.test(beforeCode);

    if (!inProperHook && !['plugins_loaded', 'init', 'after_setup_theme'].includes(hookName)) {
      issues.push({
        file, line: lineNum, type: 'warning', category: 'hooks',
        message: 'remove_action/filter should be called from a hook that fires after the original was added',
        code: 'remove-hook-timing',
      });
    }
  }

  return issues;
}

function checkDirectOutput(file: string, content: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const hasTemplateContext = /get_header|get_footer|get_template_part|the_content/i.test(content);
  if (hasTemplateContext) return issues;

  const directEchoPattern = /^(?:echo|print)\s+/gm;
  let match;
  while ((match = directEchoPattern.exec(content)) !== null) {
    const lineNum = getLineNumber(content, match.index);
    const beforeMatch = content.substring(0, match.index);
    const openBraces = (beforeMatch.match(/\{/g) || []).length;
    const closeBraces = (beforeMatch.match(/\}/g) || []).length;
    if (openBraces === closeBraces) {
      issues.push({
        file, line: lineNum, type: 'warning', category: 'hooks',
        message: 'Direct output at file level. Wrap in a function and hook appropriately.',
        code: 'direct-output',
      });
    }
  }

  return issues;
}

function checkWordPressPatterns(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let match;

  const hardcodedUrlPattern = /['"]https?:\/\/(?:www\.)?(?:wordpress\.org|example\.com|localhost|your-?(?:site|domain))/gi;
  while ((match = hardcodedUrlPattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning', category: 'hooks',
      message: 'Avoid hardcoded URLs. Use home_url(), site_url(), plugins_url(), or admin_url().',
      code: 'hardcoded-url',
    });
  }

  if (/['"]\/wp-content\/|['"]\/wp-includes\//i.test(content)) {
    issues.push({
      file, line: findPatternLine(lines, /['"]\/wp-content\/|['"]\/wp-includes\//), type: 'error', category: 'hooks',
      message: 'Hardcoded wp-content path. Use WP_CONTENT_DIR, plugins_url(), or content_url().',
      code: 'hardcoded-wp-path',
    });
  }

  const wpQueryPattern = /new\s+WP_Query\s*\(/g;
  while ((match = wpQueryPattern.exec(content)) !== null) {
    const afterQuery = content.substring(match.index, Math.min(content.length, match.index + 1000));
    if (!/wp_reset_postdata\s*\(\)/i.test(afterQuery)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning', category: 'hooks',
        message: 'Call wp_reset_postdata() after WP_Query loop to restore global $post.',
        code: 'missing-reset-postdata',
      });
    }
  }

  const hardcodedTablePattern = /(?:FROM|INTO|UPDATE|JOIN)\s+['"]?(?!{|\$wpdb)(wp_[a-z_]+)/gi;
  while ((match = hardcodedTablePattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'error', category: 'hooks',
      message: `Hardcoded table name "${match[1]}". Use $wpdb->prefix or $wpdb->tablename instead.`,
      code: 'hardcoded-table-prefix',
    });
  }

  const globalFuncPattern = /^function\s+([a-z_][a-z0-9_]*)\s*\(/gmi;
  const hasNamespace = /^namespace\s+/m.test(content);
  if (!hasNamespace) {
    while ((match = globalFuncPattern.exec(content)) !== null) {
      const funcName = match[1];
      const beforeFunc = content.substring(0, match.index);
      const classMatch = beforeFunc.match(/class\s+\w+[^{]*\{[^}]*$/s);
      if (!classMatch && funcName.length < 4 && !/^__/.test(funcName)) {
        issues.push({
          file, line: getLineNumber(content, match.index), type: 'warning', category: 'hooks',
          message: `Function "${funcName}" has short name without prefix. Use a unique prefix to avoid collisions.`,
          code: 'unprefixed-function',
        });
      }
    }
  }

  return issues;
}

function checkAccessibility(file: string, content: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let match;

  const imgWithoutAlt = /<img\s+(?![^>]*\balt\s*=)[^>]*>/gi;
  while ((match = imgWithoutAlt.exec(content)) !== null) {
    const context = content.substring(Math.max(0, match.index - 100), match.index);
    if (!context.includes('wp_get_attachment_image')) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning', category: 'accessibility',
        message: 'Image missing alt attribute.',
        code: 'img-missing-alt',
      });
    }
  }

  const linkPattern = /<a\s+[^>]*>(?:click here|read more|here|more|link)<\/a>/gi;
  while ((match = linkPattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning', category: 'accessibility',
      message: 'Use descriptive link text instead of "click here" or "read more".',
      code: 'non-descriptive-link',
    });
  }

  return issues;
}

function checkDeprecatedFunctions(file: string, content: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const deprecatedMap = buildDeprecatedMap();

  for (const [funcName, info] of deprecatedMap) {
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.substring(lineStart, match.index);
      if (/\/\/|\/\*|\*/.test(lineContent.trim().substring(0, 2))) continue;

      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning', category: 'deprecated',
        message: `${funcName}() deprecated since WP ${info.since}. Use ${info.replacement} instead.`,
        code: 'deprecated-wp-function',
      });
    }
  }

  return issues;
}

function checkLargeFiles(projectPath: string, phpFiles: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const maxSize = 500 * 1024;
  const maxLines = 2000;

  for (const file of phpFiles) {
    const stats = statSync(file);
    const rel = relativePath(file, projectPath);

    if (stats.size > maxSize) {
      issues.push({
        file: rel, line: 1, type: 'warning', category: 'performance',
        message: `Large file (${Math.round(stats.size / 1024)}KB). Consider splitting into smaller files.`,
        code: 'large-file-size',
      });
    }

    const content = readFileSync(file, 'utf-8');
    const lineCount = content.split('\n').length;
    if (lineCount > maxLines) {
      issues.push({
        file: rel, line: 1, type: 'warning', category: 'performance',
        message: `File has ${lineCount} lines. Consider splitting into smaller, focused files.`,
        code: 'large-file-lines',
      });
    }
  }

  return issues;
}
