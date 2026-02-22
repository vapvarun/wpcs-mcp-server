/**
 * WPCS MCP Server - Security Checker
 * Extracted + expanded security checks.
 */

import { readFileSync } from 'fs';
import type { SecurityIssue, SecurityResult } from './types.js';
import { findPhpFiles, getLineNumber, findPatternLine, relativePath } from './shared-utils.js';

/**
 * Run all security checks on a project directory.
 */
export function runSecurityChecks(projectPath: string): SecurityResult {
  const issues: SecurityIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    issues.push(...checkEvalUsage(rel, content, lines));
    issues.push(...checkCreateFunction(rel, content, lines));
    issues.push(...checkUnserializeInput(rel, content, lines));
    issues.push(...checkExtractInput(rel, content, lines));
    issues.push(...checkAbspathGuard(rel, content));
    issues.push(...checkRedirectWithoutExit(rel, content));
    issues.push(...checkDirectFileOps(rel, content));
    issues.push(...checkAjaxNonce(rel, content, lines));
    issues.push(...checkAjaxDie(rel, content));
    issues.push(...checkRestPermission(rel, content));
    issues.push(...checkRestPublic(rel, content));
    issues.push(...checkCapabilityCheck(rel, content, lines));
    issues.push(...checkDbPrepare(rel, content));
    issues.push(...checkDbFormat(rel, content));
    // New v2.0 checks
    issues.push(...checkSqlLikeInjection(rel, content));
    issues.push(...checkNonceMismatch(rel, content));
    issues.push(...checkFileUploadValidation(rel, content));
    issues.push(...checkUnvalidatedRedirect(rel, content));
    issues.push(...checkShellExecution(rel, content));
    issues.push(...checkSsrfRisk(rel, content));
    issues.push(...checkInsecureRandomness(rel, content));
    issues.push(...checkDirectSuperglobal(rel, content, lines));
    issues.push(...checkOutputWithoutEscaping(rel, content));
    issues.push(...checkDeserializationRisk(rel, content));
    // v3.0 checks
    issues.push(...checkTimingAttack(rel, content));
    issues.push(...checkInsecureCookies(rel, content));
    issues.push(...checkPlaintextPasswords(rel, content));
    issues.push(...checkCronInfiniteRecursion(rel, content));
    issues.push(...checkOrphanedCronEvents(rel, content));
    issues.push(...checkMissingCronCleanup(rel, content));
    issues.push(...checkSessionOutsideWP(rel, content));
    issues.push(...checkVersionExposure(rel, content));
    issues.push(...checkUserEnumeration(rel, content));
    issues.push(...checkInfoDisclosure(rel, content));
    issues.push(...checkWeakTokenGeneration(rel, content));
    issues.push(...checkMissingWpUnslash(rel, content));
  }

  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;
  return { issues, summary: { errors, warnings } };
}

// ─── Existing checks (extracted from quality-checker) ───────────

function checkEvalUsage(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/\beval\s*\(/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /\beval\s*\(/), type: 'error',
    message: 'Avoid eval(). It can run arbitrary code and is a security risk.',
    code: 'eval-usage',
  }];
}

function checkCreateFunction(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/\bcreate_function\s*\(/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /\bcreate_function\s*\(/), type: 'error',
    message: 'create_function() is deprecated. Use anonymous functions instead.',
    code: 'create-function',
  }];
}

function checkUnserializeInput(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/\bunserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /\bunserialize\s*\(/), type: 'error',
    message: 'Never unserialize user input. Use JSON instead.',
    code: 'unserialize-user-input',
  }];
}

function checkExtractInput(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/\bextract\s*\(\s*\$_(GET|POST|REQUEST)/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /\bextract\s*\(/), type: 'error',
    message: 'Avoid extract() with user input. It can overwrite variables.',
    code: 'extract-user-input',
  }];
}

function checkAbspathGuard(file: string, content: string): SecurityIssue[] {
  const hasPluginHeader = /Plugin Name:/i.test(content);
  const hasAbspathCheck = /defined\s*\(\s*['"]ABSPATH['"]\s*\)|if\s*\(\s*!\s*defined\s*\(\s*['"]ABSPATH/i.test(content);
  if (hasAbspathCheck || hasPluginHeader || file.includes('index.php')) return [];
  return [{
    file, line: 1, type: 'error',
    message: "Missing ABSPATH check. Add: if (!defined('ABSPATH')) exit; at the top.",
    code: 'missing-abspath-check',
  }];
}

function checkRedirectWithoutExit(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const redirectPattern = /wp_redirect\s*\([^;]+\);/g;
  let match;
  while ((match = redirectPattern.exec(content)) !== null) {
    const afterRedirect = content.substring(match.index + match[0].length, match.index + match[0].length + 50);
    if (!/^\s*(exit|die|wp_die)/i.test(afterRedirect)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'wp_redirect() must be followed by exit or die to prevent further execution.',
        code: 'redirect-without-exit',
      });
    }
  }
  return issues;
}

function checkDirectFileOps(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const fileOpsPattern = /\b(file_put_contents|fwrite|fopen|unlink|rmdir|mkdir|copy|rename)\s*\(/g;
  let match;
  while ((match = fileOpsPattern.exec(content)) !== null) {
    const beforeMatch = content.substring(Math.max(0, match.index - 300), match.index);
    if (!/WP_Filesystem|request_filesystem_credentials/i.test(beforeMatch)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: `Use WP_Filesystem API instead of ${match[1]}() for better security and compatibility.`,
        code: 'direct-file-operation',
      });
    }
  }
  return issues;
}

function checkAjaxNonce(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/wp_ajax_/.test(content)) return [];
  if (/check_ajax_referer|wp_verify_nonce/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /wp_ajax_/), type: 'error',
    message: 'AJAX handlers should verify nonce with check_ajax_referer() or wp_verify_nonce().',
    code: 'ajax-missing-nonce',
  }];
}

function checkAjaxDie(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const ajaxHandlerPattern = /add_action\s*\(\s*['"]wp_ajax_(?:nopriv_)?([^'"]+)['"]/g;
  let match;
  while ((match = ajaxHandlerPattern.exec(content)) !== null) {
    const actionName = match[1];
    const callbackMatch = content.substring(match.index).match(/,\s*['"]([^'"]+)['"]\s*\)|,\s*array\s*\([^)]*,\s*['"]([^'"]+)['"]/);
    if (callbackMatch) {
      const callbackName = callbackMatch[1] || callbackMatch[2];
      const funcPattern = new RegExp(`function\\s+${callbackName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
      const funcMatch = funcPattern.exec(content);
      if (funcMatch && !/wp_die\s*\(|die\s*\(|exit\s*;|wp_send_json/i.test(funcMatch[0])) {
        issues.push({
          file, line: getLineNumber(content, match.index), type: 'error',
          message: `AJAX handler "${actionName}" should end with wp_die(), die(), or wp_send_json*().`,
          code: 'ajax-missing-die',
        });
      }
    }
  }
  return issues;
}

function checkRestPermission(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const restRoutePattern = /register_rest_route\s*\([^)]+\)/g;
  let match;
  while ((match = restRoutePattern.exec(content)) !== null) {
    if (!match[0].includes('permission_callback')) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'REST API route missing permission_callback. Add one to control access.',
        code: 'rest-missing-permission',
      });
    }
  }
  return issues;
}

function checkRestPublic(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /['"]permission_callback['"]\s*=>\s*['"]__return_true['"]|['"]permission_callback['"]\s*=>\s*function\s*\([^)]*\)\s*\{\s*return\s+true\s*;\s*\}/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning',
      message: 'REST endpoint is public (permission_callback returns true). Verify this is intentional.',
      code: 'rest-public-endpoint',
    });
  }
  return issues;
}

function checkCapabilityCheck(file: string, content: string, lines: string[]): SecurityIssue[] {
  if (!/is_admin\s*\(\)|wp_ajax_/.test(content)) return [];
  if (/current_user_can\s*\(/i.test(content)) return [];
  return [{
    file, line: findPatternLine(lines, /is_admin\s*\(\)|wp_ajax_/), type: 'warning',
    message: 'Admin/AJAX code should check user capabilities with current_user_can().',
    code: 'missing-capability-check',
  }];
}

function checkDbPrepare(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const dbQueryPattern = /\$wpdb\s*->\s*(query|get_results|get_row|get_var|get_col)\s*\(\s*["']/g;
  let match;
  while ((match = dbQueryPattern.exec(content)) !== null) {
    const queryContext = content.substring(match.index, match.index + 300);
    if (/\$[a-zA-Z_]/.test(queryContext) && !/->prepare\s*\(/.test(queryContext)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'Database query with variables should use $wpdb->prepare() to prevent SQL injection.',
        code: 'db-missing-prepare',
      });
    }
  }
  return issues;
}

function checkDbFormat(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const directDbWrite = /\$wpdb\s*->\s*(insert|update|delete|replace)\s*\(/g;
  let match;
  while ((match = directDbWrite.exec(content)) !== null) {
    const method = match[1];
    const callContext = content.substring(match.index, match.index + 500);
    if ((method === 'insert' || method === 'update') && !/,\s*array\s*\([^)]*%[sdf]/i.test(callContext)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: `$wpdb->${method}() should include format array (%s, %d, %f) for data types.`,
        code: 'db-missing-format',
      });
    }
  }
  return issues;
}

// ─── New v2.0 checks ────────────────────────────────────────────

function checkSqlLikeInjection(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const likePattern = /\$wpdb\s*->\s*prepare\s*\([^)]*LIKE\s+['"]?%s/gi;
  let match;
  while ((match = likePattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 300), match.index + match[0].length + 200);
    if (!/esc_like|wpdb\s*->\s*esc_like/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'SQL LIKE query without $wpdb->esc_like(). Wrap the search value with esc_like() before prepare().',
        code: 'sql-like-injection',
      });
    }
  }
  return issues;
}

function checkNonceMismatch(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const fieldActions: string[] = [];
  const fieldPattern = /wp_nonce_field\s*\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = fieldPattern.exec(content)) !== null) {
    fieldActions.push(match[1]);
  }
  const verifyActions: string[] = [];
  const verifyPattern = /(?:check_admin_referer|wp_verify_nonce)\s*\([^,]*,?\s*['"]([^'"]+)['"]/g;
  while ((match = verifyPattern.exec(content)) !== null) {
    verifyActions.push(match[1]);
  }
  for (const action of fieldActions) {
    if (verifyActions.length > 0 && !verifyActions.includes(action)) {
      const escapedAction = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lineNum = findPatternLine(content.split('\n'), new RegExp(`wp_nonce_field\\s*\\(\\s*['"]${escapedAction}['"]`));
      issues.push({
        file, line: lineNum, type: 'error',
        message: `Nonce action "${action}" in wp_nonce_field() does not match any verification action.`,
        code: 'nonce-action-mismatch',
      });
    }
  }
  return issues;
}

function checkFileUploadValidation(file: string, content: string): SecurityIssue[] {
  if (!/\$_FILES/i.test(content)) return [];
  if (/wp_check_filetype|wp_handle_upload|wp_handle_sideload/i.test(content)) return [];
  return [{
    file, line: findPatternLine(content.split('\n'), /\$_FILES/), type: 'error',
    message: 'File upload ($_FILES) without wp_check_filetype() or wp_handle_upload() validation.',
    code: 'file-upload-no-validation',
  }];
}

function checkUnvalidatedRedirect(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /wp_redirect\s*\(\s*\$(?:_GET|_POST|_REQUEST|url|redirect|location|next|return)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 100);
    if (!/wp_validate_redirect|wp_safe_redirect/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'Unvalidated redirect. Use wp_safe_redirect() or validate with wp_validate_redirect().',
        code: 'unvalidated-redirect',
      });
    }
  }
  return issues;
}

function checkShellExecution(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const shellFuncs = /\b(passthru|shell_exec|popen|proc_open)\s*\(/g;
  let match;
  while ((match = shellFuncs.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'error',
      message: `Shell function ${match[1]}() detected. Avoid shell commands in WordPress plugins.`,
      code: 'shell-execution',
    });
  }
  return issues;
}

function checkSsrfRisk(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /wp_remote_(?:get|post|head|request)\s*\(\s*\$(?:_GET|_POST|_REQUEST|url|endpoint|api_url)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    if (!/wp_http_validate_url|filter_var.*FILTER_VALIDATE_URL|esc_url_raw/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: 'SSRF risk: wp_remote_* with user-controlled URL. Validate URL with wp_http_validate_url().',
        code: 'ssrf-risk',
      });
    }
  }
  return issues;
}

function checkInsecureRandomness(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const randPattern = /\b(rand|mt_rand)\s*\(/g;
  let match;
  while ((match = randPattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    const isSecurityContext = /token|nonce|secret|password|key|hash|salt|random|csrf/i.test(surroundingCode);
    if (isSecurityContext) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: `${match[1]}() used in security context. Use wp_rand() or random_int() for cryptographic randomness.`,
        code: 'insecure-randomness',
      });
    }
  }
  return issues;
}

function checkDirectSuperglobal(file: string, content: string, lines: string[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const superglobalPattern = /\$_(GET|POST|REQUEST)\s*\[\s*['"][^'"]+['"]\s*\]/g;
  let match;
  while ((match = superglobalPattern.exec(content)) !== null) {
    const lineIdx = getLineNumber(content, match.index);
    const startLine = Math.max(0, lineIdx - 2);
    const endLine = Math.min(lines.length, lineIdx + 2);
    const nearbyCode = lines.slice(startLine, endLine).join('\n');
    const hasSanitization = /sanitize_|esc_|intval|absint|wp_kses|wp_unslash|filter_input|filter_var/i.test(nearbyCode);
    if (!hasSanitization) {
      issues.push({
        file, line: lineIdx, type: 'warning',
        message: `Direct $_${match[1]} access without sanitization. Use sanitize_text_field(), absint(), etc.`,
        code: 'direct-superglobal',
      });
    }
  }
  return issues;
}

function checkOutputWithoutEscaping(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const echoVarPattern = /echo\s+\$[a-zA-Z_]\w*\s*;/g;
  let match;
  while ((match = echoVarPattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 50), match.index + match[0].length);
    const hasEscaping = /esc_html|esc_attr|esc_url|esc_js|wp_kses|intval|absint/i.test(surroundingCode);
    if (!hasEscaping) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'Echoing variable without escaping. Use esc_html(), esc_attr(), etc.',
        code: 'output-without-escaping',
      });
    }
  }
  return issues;
}

function checkDeserializationRisk(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /maybe_unserialize\s*\(\s*\$(?:_GET|_POST|_REQUEST|_COOKIE|data|input|value|content)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning',
      message: 'maybe_unserialize() on potentially user-controlled data. Validate input source first.',
      code: 'deserialization-risk',
    });
  }
  return issues;
}

// ─── v3.0 checks ────────────────────────────────────────────────

function checkTimingAttack(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\$(?:token|nonce|hash|secret|api_key|signature|hmac|digest)\s*===\s*|===\s*\$(?:token|nonce|hash|secret|api_key|signature|hmac|digest)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    if (!/hash_equals/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: 'Timing attack risk: use hash_equals() instead of === for token/hash comparison.',
        code: 'timing-attack',
      });
    }
  }
  return issues;
}

function checkInsecureCookies(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\bsetcookie\s*\(/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const callContext = content.substring(match.index, match.index + 500);
    const hasSecureFlags = /secure\s*['"=]|httponly\s*['"=]|samesite\s*['"=]/i.test(callContext);
    const hasBooleanFlags = /,\s*(true|false)\s*,\s*(true|false)\s*,\s*true/i.test(callContext);
    if (!hasSecureFlags && !hasBooleanFlags) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: 'setcookie() without secure/httponly/samesite flags. Use array syntax with secure, httponly, and samesite options.',
        code: 'insecure-cookie',
      });
    }
  }
  return issues;
}

function checkPlaintextPasswords(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /update_(?:user_meta|option|post_meta)\s*\([^)]*(?:password|passwd|pass)\b/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 300), match.index + match[0].length + 300);
    if (!/wp_hash_password|password_hash|wp_set_password/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'Possible plaintext password storage. Use wp_hash_password() before storing passwords.',
        code: 'plaintext-password',
      });
    }
  }
  return issues;
}

function checkCronInfiniteRecursion(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const schedulePattern = /wp_schedule_(?:event|single_event)\s*\([^)]*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = schedulePattern.exec(content)) !== null) {
    const hookName = match[1];
    const escapedHook = hookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doActionPattern = new RegExp(`do_action\\s*\\(\\s*['"]${escapedHook}['"]`, 'g');
    if (doActionPattern.test(content)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: `Cron hook "${hookName}" has do_action() call that may cause infinite recursion. Use a different name for the cron event vs the action.`,
        code: 'cron-infinite-recursion',
      });
    }
  }
  return issues;
}

function checkOrphanedCronEvents(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /wp_schedule_(?:event|single_event)\s*\(/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 300), match.index + match[0].length + 300);
    if (!/wp_next_scheduled/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: 'wp_schedule_event() without wp_next_scheduled() check. This can create duplicate cron events.',
        code: 'orphaned-cron-event',
      });
    }
  }
  return issues;
}

function checkMissingCronCleanup(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  if (!/wp_schedule_(?:event|single_event)/i.test(content)) return [];
  if (/wp_clear_scheduled_hook|wp_unschedule_event/i.test(content)) return [];
  if (/register_deactivation_hook|deactivate_/i.test(content)) {
    const lines = content.split('\n');
    issues.push({
      file, line: findPatternLine(lines, /wp_schedule_(?:event|single_event)/), type: 'warning',
      message: 'Cron events scheduled but no wp_clear_scheduled_hook() in deactivation. Cron events will persist after plugin deactivation.',
      code: 'missing-cron-cleanup',
    });
  }
  return issues;
}

function checkSessionOutsideWP(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\b(session_start|session_regenerate_id)\s*\(|\$_SESSION\s*\[/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning',
      message: 'PHP session usage detected. WordPress plugins should use transients or custom DB tables instead of $_SESSION.',
      code: 'session-outside-wp',
    });
  }
  return issues;
}

function checkVersionExposure(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const versionPattern = /bloginfo\s*\(\s*['"]version['"]\s*\)/g;
  let match;
  while ((match = versionPattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning',
      message: "bloginfo('version') exposes WordPress version. Remove or restrict to admin context.",
      code: 'version-exposure',
    });
  }
  const generatorPattern = /add_action\s*\(\s*['"]wp_head['"]\s*,\s*['"]wp_generator['"]/g;
  while ((match = generatorPattern.exec(content)) !== null) {
    issues.push({
      file, line: getLineNumber(content, match.index), type: 'warning',
      message: 'wp_generator outputs WordPress version in HTML. Use remove_action() to hide it.',
      code: 'version-exposure',
    });
  }
  return issues;
}

function checkUserEnumeration(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\$_GET\s*\[\s*['"]author['"]\s*\]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 300), match.index + match[0].length + 300);
    if (!/wp_redirect|wp_safe_redirect|wp_die|exit|is_admin/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: '$_GET[\'author\'] usage without redirect/block. Consider protecting against user enumeration.',
        code: 'user-enumeration',
      });
    }
  }
  return issues;
}

function checkInfoDisclosure(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const dbInfoPattern = /(?:echo|print)\s+.*\$wpdb\s*->\s*(?:last_query|last_error)/g;
  let match;
  while ((match = dbInfoPattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    if (!/WP_DEBUG|is_admin\s*\(\)/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: 'Database debug info ($wpdb->last_query/last_error) in output. Use error_log() instead.',
        code: 'info-disclosure',
      });
    }
  }
  const filePattern = /(?:echo|print|wp_die)\s*\(?\s*.*__FILE__/g;
  while ((match = filePattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    if (!/error_log|WP_DEBUG/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: '__FILE__ in user-facing output exposes server path. Use generic error messages.',
        code: 'info-disclosure',
      });
    }
  }
  return issues;
}

function checkWeakTokenGeneration(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\b(md5|sha1)\s*\(\s*(?:time|rand|mt_rand|microtime|uniqid)\s*\(/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    const isTokenContext = /token|key|secret|nonce|salt|hash|random|session|csrf|auth/i.test(surroundingCode);
    if (isTokenContext) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        message: `Weak token: ${match[1]}() with predictable input. Use wp_generate_password() or random_bytes().`,
        code: 'weak-token-generation',
      });
    }
  }
  return issues;
}

function checkMissingWpUnslash(file: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const pattern = /\bsanitize_\w+\s*\(\s*\$_(GET|POST|REQUEST)\s*\[/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const surroundingCode = content.substring(Math.max(0, match.index - 100), match.index + match[0].length + 100);
    if (!/wp_unslash/i.test(surroundingCode)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        message: `sanitize_*() on $_${match[1]} without wp_unslash(). WordPress adds slashes to superglobals — unslash before sanitizing.`,
        code: 'missing-wp-unslash',
      });
    }
  }
  return issues;
}
