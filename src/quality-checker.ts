/**
 * WPCS MCP Server - Quality Checker
 * Advanced checks: hooks, performance, accessibility
 * Pure file analysis - no external dependencies
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface QualityIssue {
  file: string;
  line: number;
  type: 'error' | 'warning';
  category: 'hooks' | 'performance' | 'accessibility' | 'security';
  message: string;
  code: string;
}

export interface QualityResult {
  issues: QualityIssue[];
  summary: {
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Run all quality checks on a directory
 */
export function runQualityChecks(projectPath: string): QualityResult {
  const issues: QualityIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Run all checks
    issues.push(...checkEnqueueHooks(relativePath, content, lines));
    issues.push(...checkBlockingCalls(relativePath, content, lines));
    issues.push(...checkDirectOutput(relativePath, content, lines));
    issues.push(...checkHookUsage(relativePath, content, lines));
    issues.push(...checkAccessibility(relativePath, content, lines));
    issues.push(...checkSecurityPatterns(relativePath, content, lines));
    issues.push(...checkWordPressPatterns(relativePath, content, lines));
    issues.push(...checkAjaxRestPatterns(relativePath, content, lines));
    issues.push(...checkDatabasePatterns(relativePath, content, lines));
  }

  // Check for large files
  issues.push(...checkLargeFiles(projectPath, phpFiles));

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

/**
 * Check for scripts/styles enqueued in wrong hooks
 */
function checkEnqueueHooks(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Pattern: wp_enqueue_script/style called directly (not in a hook callback)
  const enqueuePattern = /\b(wp_enqueue_script|wp_enqueue_style|wp_register_script|wp_register_style)\s*\(/g;

  // Check if file has proper hook registration for enqueue
  const hasProperHook = /add_action\s*\(\s*['"](?:wp_enqueue_scripts|admin_enqueue_scripts|login_enqueue_scripts)['"]/i.test(content);

  let match;
  while ((match = enqueuePattern.exec(content)) !== null) {
    const lineNum = getLineNumber(content, match.index);

    // Check if this enqueue is inside a function that's hooked properly
    const beforeMatch = content.substring(0, match.index);
    const inFunction = /function\s+\w+\s*\([^)]*\)\s*\{[^}]*$/s.test(beforeMatch);

    if (!inFunction && !hasProperHook) {
      issues.push({
        file,
        line: lineNum,
        type: 'warning',
        category: 'hooks',
        message: `${match[1]}() should be called within wp_enqueue_scripts, admin_enqueue_scripts, or login_enqueue_scripts hook`,
        code: 'enqueue-wrong-hook',
      });
    }
  }

  // Check for enqueue in init hook (wrong)
  if (/add_action\s*\(\s*['"]init['"].*(?:wp_enqueue_script|wp_enqueue_style)/s.test(content)) {
    const lineNum = findPatternLine(lines, /add_action\s*\(\s*['"]init['"]/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'hooks',
      message: 'Scripts/styles should not be enqueued on init hook. Use wp_enqueue_scripts instead.',
      code: 'enqueue-on-init',
    });
  }

  // Check for wp_head/wp_footer direct style/script output
  if (/add_action\s*\(\s*['"]wp_head['"].*<style|<script/s.test(content)) {
    const lineNum = findPatternLine(lines, /add_action\s*\(\s*['"]wp_head['"]/);
    issues.push({
      file,
      line: lineNum,
      type: 'warning',
      category: 'performance',
      message: 'Avoid inline styles/scripts in wp_head. Use wp_enqueue_* for better caching.',
      code: 'inline-in-head',
    });
  }

  return issues;
}

/**
 * Check for blocking/slow operations
 */
function checkBlockingCalls(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // file_get_contents with URL (should use wp_remote_get)
  const fileGetContentsUrl = /file_get_contents\s*\(\s*['"]https?:\/\//gi;
  let match;
  while ((match = fileGetContentsUrl.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'error',
      category: 'performance',
      message: 'Use wp_remote_get() instead of file_get_contents() for remote URLs',
      code: 'blocking-remote-call',
    });
  }

  // curl_init (should use WP HTTP API)
  if (/\bcurl_init\s*\(/i.test(content)) {
    const lineNum = findPatternLine(lines, /\bcurl_init\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'warning',
      category: 'performance',
      message: 'Use WP HTTP API (wp_remote_get/post) instead of cURL for better compatibility',
      code: 'direct-curl',
    });
  }

  // Direct database queries without caching
  const directDbPattern = /\$wpdb\s*->\s*(?:get_results|get_row|get_var|get_col|query)\s*\(/g;
  while ((match = directDbPattern.exec(content)) !== null) {
    const lineNum = getLineNumber(content, match.index);
    const surroundingCode = content.substring(Math.max(0, match.index - 500), match.index + 200);

    // Check if there's caching nearby
    const hasCaching = /wp_cache_get|get_transient|wp_cache_set|set_transient/i.test(surroundingCode);

    if (!hasCaching) {
      issues.push({
        file,
        line: lineNum,
        type: 'warning',
        category: 'performance',
        message: 'Consider caching this database query with wp_cache_* or transients',
        code: 'uncached-db-query',
      });
    }
  }

  // sleep/usleep calls
  if (/\b(?:sleep|usleep)\s*\(\s*\d+\s*\)/i.test(content)) {
    const lineNum = findPatternLine(lines, /\b(?:sleep|usleep)\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'performance',
      message: 'Avoid sleep() in web requests. Use async processing or WP Cron.',
      code: 'blocking-sleep',
    });
  }

  return issues;
}

/**
 * Check for direct output issues
 */
function checkDirectOutput(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // echo/print outside of template context without proper hooks
  const hasTemplateContext = /get_header|get_footer|get_template_part|the_content/i.test(content);

  if (!hasTemplateContext) {
    // Check for direct echo at file level (not in function)
    const directEchoPattern = /^(?:echo|print)\s+/gm;
    let match;
    while ((match = directEchoPattern.exec(content)) !== null) {
      const lineNum = getLineNumber(content, match.index);
      const beforeMatch = content.substring(0, match.index);

      // Count braces to determine if we're at file level
      const openBraces = (beforeMatch.match(/\{/g) || []).length;
      const closeBraces = (beforeMatch.match(/\}/g) || []).length;

      if (openBraces === closeBraces) {
        issues.push({
          file,
          line: lineNum,
          type: 'warning',
          category: 'hooks',
          message: 'Direct output at file level. Wrap in a function and hook appropriately.',
          code: 'direct-output',
        });
      }
    }
  }

  return issues;
}

/**
 * Check hook usage patterns
 */
function checkHookUsage(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // add_action/filter with wrong priority (too high)
  const highPriorityPattern = /add_(?:action|filter)\s*\([^,]+,[^,]+,\s*(\d+)/g;
  let match;
  while ((match = highPriorityPattern.exec(content)) !== null) {
    const priority = parseInt(match[1], 10);
    if (priority > 999) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'hooks',
        message: `Very high hook priority (${priority}). This can cause issues with other plugins.`,
        code: 'high-priority-hook',
      });
    }
  }

  // Hooks in constructor (anti-pattern)
  if (/function\s+__construct\s*\([^)]*\)\s*\{[^}]*add_(?:action|filter)/s.test(content)) {
    const lineNum = findPatternLine(lines, /function\s+__construct/);
    issues.push({
      file,
      line: lineNum,
      type: 'warning',
      category: 'hooks',
      message: 'Avoid add_action/filter in constructor. Use an init() method or plugins_loaded hook.',
      code: 'hooks-in-constructor',
    });
  }

  // remove_action/filter without proper timing
  const removeHookPattern = /remove_(?:action|filter)\s*\(\s*['"](\w+)['"]/g;
  while ((match = removeHookPattern.exec(content)) !== null) {
    const hookName = match[1];
    const lineNum = getLineNumber(content, match.index);

    // Check if this remove is properly timed
    const beforeCode = content.substring(0, match.index);
    const inProperHook = /add_action\s*\(\s*['"](?:init|plugins_loaded|after_setup_theme)['"]/i.test(beforeCode);

    if (!inProperHook && !['plugins_loaded', 'init', 'after_setup_theme'].includes(hookName)) {
      issues.push({
        file,
        line: lineNum,
        type: 'warning',
        category: 'hooks',
        message: `remove_action/filter should be called from a hook that fires after the original was added`,
        code: 'remove-hook-timing',
      });
    }
  }

  return issues;
}

/**
 * Check for basic accessibility issues in output
 */
function checkAccessibility(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Images without alt attribute
  const imgWithoutAlt = /<img\s+(?![^>]*\balt\s*=)[^>]*>/gi;
  let match;
  while ((match = imgWithoutAlt.exec(content)) !== null) {
    // Skip if it uses wp_get_attachment_image (which handles alt)
    const context = content.substring(Math.max(0, match.index - 100), match.index);
    if (!context.includes('wp_get_attachment_image')) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'accessibility',
        message: 'Image missing alt attribute. Add alt="" for decorative images or descriptive alt for meaningful images.',
        code: 'img-missing-alt',
      });
    }
  }

  // Form inputs without labels (basic check)
  const inputPattern = /<input\s+[^>]*type\s*=\s*['"](?:text|email|password|number|tel|url|search)['"][^>]*>/gi;
  while ((match = inputPattern.exec(content)) !== null) {
    const hasId = /\bid\s*=\s*['"]/i.test(match[0]);
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    const hasLabel = /<label\s+[^>]*for\s*=/i.test(surroundingCode) || /aria-label/i.test(match[0]);

    if (hasId && !hasLabel) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'accessibility',
        message: 'Form input should have an associated <label> or aria-label attribute',
        code: 'input-missing-label',
      });
    }
  }

  // Links with non-descriptive text
  const linkPattern = /<a\s+[^>]*>(?:click here|read more|here|more|link)<\/a>/gi;
  while ((match = linkPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'accessibility',
      message: 'Use descriptive link text instead of "click here" or "read more"',
      code: 'non-descriptive-link',
    });
  }

  // Note: onclick handlers are checked in frontend-checker.ts (recommends addEventListener)

  // Color contrast (basic check for inline styles)
  const lowContrastPattern = /color\s*:\s*#(?:fff|ffffff|eee|ddd|ccc)[^;]*;[^}]*background(?:-color)?\s*:\s*#(?:fff|ffffff|eee|ddd)/gi;
  while ((match = lowContrastPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'accessibility',
      message: 'Potential low color contrast. Ensure 4.5:1 ratio for normal text, 3:1 for large text.',
      code: 'low-color-contrast',
    });
  }

  return issues;
}

/**
 * Check for security patterns (beyond WPCS)
 */
function checkSecurityPatterns(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // eval() usage
  if (/\beval\s*\(/i.test(content)) {
    const lineNum = findPatternLine(lines, /\beval\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'security',
      message: 'Avoid eval(). It can execute arbitrary code and is a security risk.',
      code: 'eval-usage',
    });
  }

  // create_function (deprecated and insecure)
  if (/\bcreate_function\s*\(/i.test(content)) {
    const lineNum = findPatternLine(lines, /\bcreate_function\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'security',
      message: 'create_function() is deprecated. Use anonymous functions instead.',
      code: 'create-function',
    });
  }

  // Unserialize with user input
  if (/\bunserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/i.test(content)) {
    const lineNum = findPatternLine(lines, /\bunserialize\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'security',
      message: 'Never unserialize user input. Use JSON instead.',
      code: 'unserialize-user-input',
    });
  }

  // extract() with user input
  if (/\bextract\s*\(\s*\$_(GET|POST|REQUEST)/i.test(content)) {
    const lineNum = findPatternLine(lines, /\bextract\s*\(/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'security',
      message: 'Avoid extract() with user input. It can overwrite variables.',
      code: 'extract-user-input',
    });
  }

  return issues;
}

/**
 * Check common WordPress development patterns
 */
function checkWordPressPatterns(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Missing ABSPATH check (skip main plugin file which may have plugin header before it)
  const hasPluginHeader = /Plugin Name:/i.test(content);
  const hasAbspathCheck = /defined\s*\(\s*['"]ABSPATH['"]\s*\)|if\s*\(\s*!\s*defined\s*\(\s*['"]ABSPATH/i.test(content);

  if (!hasAbspathCheck && !hasPluginHeader && !file.includes('index.php')) {
    issues.push({
      file,
      line: 1,
      type: 'error',
      category: 'security',
      message: 'Missing ABSPATH check. Add: if (!defined(\'ABSPATH\')) exit; at the top.',
      code: 'missing-abspath-check',
    });
  }

  // wp_redirect without exit/die
  const redirectPattern = /wp_redirect\s*\([^;]+\);/g;
  let match;
  while ((match = redirectPattern.exec(content)) !== null) {
    const afterRedirect = content.substring(match.index + match[0].length, match.index + match[0].length + 50);
    if (!/^\s*(exit|die|wp_die)/i.test(afterRedirect)) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'error',
        category: 'security',
        message: 'wp_redirect() must be followed by exit or die to prevent further execution.',
        code: 'redirect-without-exit',
      });
    }
  }

  // PHP session usage (incompatible with object caching)
  if (/\bsession_start\s*\(|\$_SESSION\s*\[/i.test(content)) {
    const lineNum = findPatternLine(lines, /session_start|\$_SESSION/);
    issues.push({
      file,
      line: lineNum,
      type: 'warning',
      category: 'performance',
      message: 'Avoid PHP sessions in WordPress. Use transients, user meta, or custom tables instead.',
      code: 'php-session-usage',
    });
  }

  // Direct file operations (should use WP_Filesystem)
  const fileOpsPattern = /\b(file_put_contents|fwrite|fopen|unlink|rmdir|mkdir|copy|rename)\s*\(/g;
  while ((match = fileOpsPattern.exec(content)) !== null) {
    const func = match[1];
    // Skip if it's inside a WP_Filesystem check
    const beforeMatch = content.substring(Math.max(0, match.index - 300), match.index);
    if (!/WP_Filesystem|request_filesystem_credentials/i.test(beforeMatch)) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'security',
        message: `Use WP_Filesystem API instead of ${func}() for better security and compatibility.`,
        code: 'direct-file-operation',
      });
    }
  }

  // Hardcoded URLs
  const hardcodedUrlPattern = /['"]https?:\/\/(?:www\.)?(?:wordpress\.org|example\.com|localhost|your-?(?:site|domain))/gi;
  while ((match = hardcodedUrlPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'hooks',
      message: 'Avoid hardcoded URLs. Use home_url(), site_url(), plugins_url(), or admin_url().',
      code: 'hardcoded-url',
    });
  }

  // Hardcoded wp-content or plugin paths
  if (/['"]\/wp-content\/|['"]\/wp-includes\//i.test(content)) {
    const lineNum = findPatternLine(lines, /['"]\/wp-content\/|['"]\/wp-includes\//);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'hooks',
      message: 'Hardcoded wp-content path. Use WP_CONTENT_DIR, plugins_url(), or content_url().',
      code: 'hardcoded-wp-path',
    });
  }

  // Missing wp_reset_postdata after WP_Query
  const wpQueryPattern = /new\s+WP_Query\s*\(/g;
  while ((match = wpQueryPattern.exec(content)) !== null) {
    const afterQuery = content.substring(match.index, Math.min(content.length, match.index + 1000));
    if (!/wp_reset_postdata\s*\(\)/i.test(afterQuery)) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'hooks',
        message: 'Call wp_reset_postdata() after WP_Query loop to restore global $post.',
        code: 'missing-reset-postdata',
      });
    }
  }

  // Enqueuing jQuery without dependency
  const jqueryEnqueue = /wp_enqueue_script\s*\(\s*['"][^'"]+['"](?:\s*,\s*[^,]+){1,2}\s*\)/g;
  while ((match = jqueryEnqueue.exec(content)) !== null) {
    const enqueueCall = match[0];
    // Check if it uses jQuery but doesn't declare it as dependency
    const fullContext = content.substring(match.index, match.index + 500);
    if (/jQuery|\$\s*\(/.test(fullContext) && !enqueueCall.includes('jquery')) {
      // Check if there's a dependency array
      const hasDeps = /,\s*array\s*\(|,\s*\[/.test(enqueueCall);
      if (!hasDeps) {
        issues.push({
          file,
          line: getLineNumber(content, match.index),
          type: 'warning',
          category: 'hooks',
          message: 'Script uses jQuery but may be missing jquery dependency. Add array(\'jquery\') as dependency.',
          code: 'missing-jquery-dependency',
        });
      }
    }
  }

  // Global function without prefix (potential collision)
  const globalFuncPattern = /^function\s+([a-z_][a-z0-9_]*)\s*\(/gmi;
  const hasNamespace = /^namespace\s+/m.test(content);
  if (!hasNamespace) {
    while ((match = globalFuncPattern.exec(content)) !== null) {
      const funcName = match[1];
      // Check if it's inside a class
      const beforeFunc = content.substring(0, match.index);
      const classMatch = beforeFunc.match(/class\s+\w+[^{]*\{[^}]*$/s);

      if (!classMatch && funcName.length < 4 && !/^__/.test(funcName)) {
        issues.push({
          file,
          line: getLineNumber(content, match.index),
          type: 'warning',
          category: 'hooks',
          message: `Function "${funcName}" has short name without prefix. Use a unique prefix to avoid collisions.`,
          code: 'unprefixed-function',
        });
      }
    }
  }

  return issues;
}

/**
 * Check AJAX and REST API patterns
 */
function checkAjaxRestPatterns(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // AJAX handler without wp_die()
  const ajaxHandlerPattern = /add_action\s*\(\s*['"]wp_ajax_(?:nopriv_)?([^'"]+)['"]/g;
  let match;
  while ((match = ajaxHandlerPattern.exec(content)) !== null) {
    const actionName = match[1];
    // Find the callback function
    const callbackMatch = content.substring(match.index).match(/,\s*['"]([^'"]+)['"]\s*\)|,\s*array\s*\([^)]*,\s*['"]([^'"]+)['"]/);

    if (callbackMatch) {
      const callbackName = callbackMatch[1] || callbackMatch[2];
      // Look for the function definition
      const funcPattern = new RegExp(`function\\s+${callbackName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
      const funcMatch = funcPattern.exec(content);

      if (funcMatch && !/wp_die\s*\(|die\s*\(|exit\s*;|wp_send_json/i.test(funcMatch[0])) {
        issues.push({
          file,
          line: getLineNumber(content, match.index),
          type: 'error',
          category: 'security',
          message: `AJAX handler "${actionName}" should end with wp_die(), die(), or wp_send_json*().`,
          code: 'ajax-missing-die',
        });
      }
    }
  }

  // AJAX without nonce verification
  if (/wp_ajax_/.test(content)) {
    const hasNonceCheck = /check_ajax_referer|wp_verify_nonce/i.test(content);
    if (!hasNonceCheck) {
      const lineNum = findPatternLine(lines, /wp_ajax_/);
      issues.push({
        file,
        line: lineNum,
        type: 'error',
        category: 'security',
        message: 'AJAX handlers should verify nonce with check_ajax_referer() or wp_verify_nonce().',
        code: 'ajax-missing-nonce',
      });
    }
  }

  // REST API without permission_callback
  const restRoutePattern = /register_rest_route\s*\([^)]+\)/g;
  while ((match = restRoutePattern.exec(content)) !== null) {
    const routeCall = match[0];
    if (!routeCall.includes('permission_callback')) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'error',
        category: 'security',
        message: 'REST API route missing permission_callback. Add one to control access.',
        code: 'rest-missing-permission',
      });
    }
  }

  // REST API permission_callback returning true without checks
  const permCallbackTrue = /['"]permission_callback['"]\s*=>\s*['"]__return_true['"]|['"]permission_callback['"]\s*=>\s*function\s*\([^)]*\)\s*\{\s*return\s+true\s*;\s*\}/g;
  while ((match = permCallbackTrue.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'security',
      message: 'REST endpoint is public (permission_callback returns true). Verify this is intentional.',
      code: 'rest-public-endpoint',
    });
  }

  // Missing capability check in admin/AJAX handlers
  if (/is_admin\s*\(\)|wp_ajax_/.test(content)) {
    const hasCapCheck = /current_user_can\s*\(/i.test(content);
    if (!hasCapCheck) {
      const lineNum = findPatternLine(lines, /is_admin\s*\(\)|wp_ajax_/);
      issues.push({
        file,
        line: lineNum,
        type: 'warning',
        category: 'security',
        message: 'Admin/AJAX code should check user capabilities with current_user_can().',
        code: 'missing-capability-check',
      });
    }
  }

  return issues;
}

/**
 * Check database patterns
 */
function checkDatabasePatterns(file: string, content: string, lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // $wpdb->query/get_* without prepare for user input
  const dbQueryPattern = /\$wpdb\s*->\s*(query|get_results|get_row|get_var|get_col)\s*\(\s*["']/g;
  let match;
  while ((match = dbQueryPattern.exec(content)) !== null) {
    const lineNum = getLineNumber(content, match.index);
    const queryContext = content.substring(match.index, match.index + 300);

    // Check if there are variables in the query without prepare
    if (/\$[a-zA-Z_]/.test(queryContext) && !/->prepare\s*\(/.test(queryContext)) {
      issues.push({
        file,
        line: lineNum,
        type: 'error',
        category: 'security',
        message: 'Database query with variables should use $wpdb->prepare() to prevent SQL injection.',
        code: 'db-missing-prepare',
      });
    }
  }

  // Hardcoded table names without prefix
  const hardcodedTablePattern = /(?:FROM|INTO|UPDATE|JOIN)\s+['"]?(?!{|\$wpdb)(wp_[a-z_]+)/gi;
  while ((match = hardcodedTablePattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'error',
      category: 'hooks',
      message: `Hardcoded table name "${match[1]}". Use $wpdb->prefix or $wpdb->tablename instead.`,
      code: 'hardcoded-table-prefix',
    });
  }

  // Direct INSERT/UPDATE/DELETE without proper escaping
  const directDbWrite = /\$wpdb\s*->\s*(insert|update|delete|replace)\s*\(/g;
  while ((match = directDbWrite.exec(content)) !== null) {
    // These methods handle escaping, but check if format array is provided for insert/update
    const method = match[1];
    const callContext = content.substring(match.index, match.index + 500);

    if ((method === 'insert' || method === 'update') && !/,\s*array\s*\([^)]*%[sdf]/i.test(callContext)) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'security',
        message: `$wpdb->${method}() should include format array (%s, %d, %f) for data types.`,
        code: 'db-missing-format',
      });
    }
  }

  // Using get_results when get_row or get_var would be better
  if (/\$wpdb\s*->\s*get_results\s*\([^)]*LIMIT\s+1[^)]*\)/i.test(content)) {
    const lineNum = findPatternLine(lines, /get_results.*LIMIT\s+1/i);
    issues.push({
      file,
      line: lineNum,
      type: 'warning',
      category: 'performance',
      message: 'Use $wpdb->get_row() instead of get_results() with LIMIT 1.',
      code: 'db-wrong-method',
    });
  }

  return issues;
}

/**
 * Check for large files
 */
function checkLargeFiles(projectPath: string, phpFiles: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const maxSize = 500 * 1024; // 500KB
  const maxLines = 2000;

  for (const file of phpFiles) {
    const stats = statSync(file);
    const relativePath = file.replace(projectPath + '/', '');

    if (stats.size > maxSize) {
      issues.push({
        file: relativePath,
        line: 1,
        type: 'warning',
        category: 'performance',
        message: `Large file (${Math.round(stats.size / 1024)}KB). Consider splitting into smaller files.`,
        code: 'large-file-size',
      });
    }

    const content = readFileSync(file, 'utf-8');
    const lineCount = content.split('\n').length;

    if (lineCount > maxLines) {
      issues.push({
        file: relativePath,
        line: 1,
        type: 'warning',
        category: 'performance',
        message: `File has ${lineCount} lines. Consider splitting into smaller, focused files.`,
        code: 'large-file-lines',
      });
    }
  }

  return issues;
}

/**
 * Helper: Get line number from character index
 */
function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

/**
 * Helper: Find line number of a pattern
 */
function findPatternLine(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Helper: Find all PHP files
 */
function findPhpFiles(dir: string, files: string[] = []): string[] {
  const excludeDirs = ['vendor', 'node_modules', 'build', 'dist', '.git'];

  try {
    const items = readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dir, item.name);

      if (item.isDirectory()) {
        if (!excludeDirs.includes(item.name)) {
          findPhpFiles(fullPath, files);
        }
      } else if (item.name.endsWith('.php')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}
