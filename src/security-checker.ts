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
