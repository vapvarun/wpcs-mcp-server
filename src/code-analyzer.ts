/**
 * WPCS MCP Server - Code Analyzer
 * Dead code detection, undefined functions, unused hooks, hook analysis
 */

import { readFileSync } from 'fs';
import type { CodeIssue, CodeAnalysisResult } from './types.js';
import { findPhpFiles, getLineNumber, relativePath } from './shared-utils.js';

interface FunctionInfo {
  name: string;
  file: string;
  line: number;
  isMethod: boolean;
  className?: string;
  visibility?: 'public' | 'private' | 'protected';
}

interface HookInfo {
  type: 'action' | 'filter';
  name: string;
  callback: string;
  file: string;
  line: number;
  priority: number;
  acceptedArgs: number;
}

/**
 * Run code analysis
 */
export function runCodeAnalysis(projectPath: string): CodeAnalysisResult {
  const issues: CodeIssue[] = [];
  const phpFiles = findPhpFiles(projectPath);

  const definedFunctions: FunctionInfo[] = [];
  const calledFunctions: Map<string, { file: string; line: number }[]> = new Map();
  const registeredHooks: HookInfo[] = [];
  const removedHooks: HookInfo[] = [];
  const definedClasses: Map<string, { file: string; line: number }> = new Map();
  const instantiatedClasses: Set<string> = new Set();

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    const functionDefs = extractFunctionDefinitions(content, rel);
    definedFunctions.push(...functionDefs);

    const classPattern = /^\s*(?:abstract\s+)?class\s+(\w+)/gm;
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      definedClasses.set(match[1], { file: rel, line: getLineNumber(content, match.index) });
    }

    registeredHooks.push(...extractHookRegistrations(content, rel));
    removedHooks.push(...extractHookRemovals(content, rel));
  }

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    const calls = extractFunctionCalls(content, rel);
    for (const call of calls) {
      const existing = calledFunctions.get(call.name) || [];
      existing.push({ file: call.file, line: call.line });
      calledFunctions.set(call.name, existing);
    }

    for (const cls of extractClassInstantiations(content)) {
      instantiatedClasses.add(cls);
    }
  }

  issues.push(...checkUndefinedFunctions(calledFunctions, definedFunctions));
  issues.push(...checkUnusedFunctions(definedFunctions, calledFunctions, registeredHooks));
  issues.push(...checkOrphanHooks(registeredHooks, definedFunctions));
  issues.push(...checkOrphanRemovals(removedHooks, registeredHooks));
  issues.push(...checkUnusedClasses(definedClasses, instantiatedClasses));
  issues.push(...checkDuplicateFunctions(definedFunctions));

  // v2.0: Hook analysis
  issues.push(...checkHookPriorityConflicts(registeredHooks));
  issues.push(...checkAcceptedArgsMismatch(registeredHooks, definedFunctions, phpFiles, projectPath));
  issues.push(...checkWrongContextHooks(phpFiles, projectPath));

  const summary = {
    errors: issues.filter(i => i.type === 'error').length,
    warnings: issues.filter(i => i.type === 'warning').length,
    byCategory: {} as Record<string, number>,
  };

  for (const issue of issues) {
    summary.byCategory[issue.category] = (summary.byCategory[issue.category] || 0) + 1;
  }

  return {
    issues,
    summary,
    stats: {
      totalFunctions: definedFunctions.length,
      totalClasses: definedClasses.size,
      totalHooks: registeredHooks.length,
      definedFunctions: definedFunctions.map(f => f.name),
      calledFunctions: Array.from(calledFunctions.keys()),
      registeredHooks: registeredHooks.map(h => h.name),
    },
  };
}

/**
 * Extract function definitions
 */
function extractFunctionDefinitions(content: string, file: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  // Regular functions
  const funcPattern = /^\s*function\s+(\w+)\s*\(/gm;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    functions.push({
      name: match[1],
      file,
      line: getLineNumber(content, match.index),
      isMethod: false,
    });
  }

  // Class methods
  const methodPattern = /^\s*(public|private|protected)?\s*(?:static\s+)?function\s+(\w+)\s*\(/gm;

  // Find class context
  const classMatches = content.matchAll(/(?:abstract\s+)?class\s+(\w+)[^{]*\{/g);
  const classRanges: { name: string; start: number; end: number }[] = [];

  for (const classMatch of classMatches) {
    const start = classMatch.index!;
    // Find matching closing brace (simplified)
    let braceCount = 0;
    let end = start;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') braceCount--;
      if (braceCount === 0 && i > start) {
        end = i;
        break;
      }
    }
    classRanges.push({ name: classMatch[1], start, end });
  }

  // Re-scan for methods with class context
  while ((match = methodPattern.exec(content)) !== null) {
    const pos = match.index;
    const className = classRanges.find(c => pos > c.start && pos < c.end)?.name;

    if (className) {
      functions.push({
        name: match[2],
        file,
        line: getLineNumber(content, match.index),
        isMethod: true,
        className,
        visibility: (match[1] as 'public' | 'private' | 'protected') || 'public',
      });
    }
  }

  return functions;
}

/**
 * Extract function calls
 */
function extractFunctionCalls(content: string, file: string): { name: string; file: string; line: number }[] {
  const calls: { name: string; file: string; line: number }[] = [];

  // Function calls: function_name(
  const callPattern = /\b([a-zA-Z_]\w*)\s*\(/g;
  let match;

  // Keywords to exclude
  const keywords = new Set([
    'if', 'else', 'elseif', 'while', 'for', 'foreach', 'switch', 'catch',
    'function', 'class', 'new', 'return', 'echo', 'print', 'array', 'list',
    'isset', 'empty', 'unset', 'die', 'exit', 'include', 'require',
    'include_once', 'require_once', 'use', 'namespace', 'throw', 'try',
  ]);

  while ((match = callPattern.exec(content)) !== null) {
    const name = match[1];
    if (!keywords.has(name.toLowerCase())) {
      calls.push({
        name,
        file,
        line: getLineNumber(content, match.index),
      });
    }
  }

  return calls;
}

/**
 * Extract hook registrations with priority and accepted_args
 */
function extractHookRegistrations(content: string, file: string): HookInfo[] {
  const hooks: HookInfo[] = [];

  const hookPattern = /(?:add_action|add_filter)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:['"](\w+)['"]|\[(?:[^,]+,\s*)?['"](\w+)['"]\]|(?:\$this\s*,\s*)?['"](\w+)['"])\s*(?:,\s*(\d+))?\s*(?:,\s*(\d+))?/g;
  let match;

  while ((match = hookPattern.exec(content)) !== null) {
    const hookName = match[1];
    const callback = match[2] || match[3] || match[4];
    const type = content.substring(match.index, match.index + 10).includes('add_action') ? 'action' : 'filter';
    const priority = match[5] ? parseInt(match[5], 10) : 10;
    const acceptedArgs = match[6] ? parseInt(match[6], 10) : 1;

    hooks.push({
      type,
      name: hookName,
      callback,
      file,
      line: getLineNumber(content, match.index),
      priority,
      acceptedArgs,
    });
  }

  return hooks;
}

/**
 * Extract hook removals
 */
function extractHookRemovals(content: string, file: string): HookInfo[] {
  const hooks: HookInfo[] = [];

  const removePattern = /(?:remove_action|remove_filter)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:['"](\w+)['"]|\[(?:[^,]+,\s*)?['"](\w+)['"]\])\s*(?:,\s*(\d+))?/g;
  let match;

  while ((match = removePattern.exec(content)) !== null) {
    const hookName = match[1];
    const callback = match[2] || match[3];
    const type = content.substring(match.index, match.index + 14).includes('remove_action') ? 'action' : 'filter';
    const priority = match[4] ? parseInt(match[4], 10) : 10;

    hooks.push({
      type,
      name: hookName,
      callback,
      file,
      line: getLineNumber(content, match.index),
      priority,
      acceptedArgs: 1,
    });
  }

  return hooks;
}

/**
 * Extract class instantiations
 */
function extractClassInstantiations(content: string): string[] {
  const classes: string[] = [];

  // new ClassName
  const newPattern = /new\s+(\w+)\s*\(/g;
  let match;
  while ((match = newPattern.exec(content)) !== null) {
    classes.push(match[1]);
  }

  // ClassName::
  const staticPattern = /(\w+)::\w+/g;
  while ((match = staticPattern.exec(content)) !== null) {
    if (!['self', 'parent', 'static'].includes(match[1])) {
      classes.push(match[1]);
    }
  }

  // extends ClassName, implements Interface
  const extendsPattern = /(?:extends|implements)\s+(\w+)/g;
  while ((match = extendsPattern.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Check for undefined functions
 */
function checkUndefinedFunctions(
  calledFunctions: Map<string, { file: string; line: number }[]>,
  definedFunctions: FunctionInfo[]
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const definedNames = new Set(definedFunctions.map(f => f.name));

  // WordPress core functions to ignore (common ones)
  const wpCoreFunctions = new Set([
    // General
    '__', '_e', '_n', '_x', '_nx', 'esc_html__', 'esc_html_e', 'esc_attr__', 'esc_attr_e',
    'esc_html', 'esc_attr', 'esc_url', 'esc_js', 'esc_textarea', 'esc_sql',
    'wp_kses', 'wp_kses_post', 'sanitize_text_field', 'sanitize_email', 'sanitize_file_name',
    'absint', 'intval', 'floatval', 'is_numeric',
    // Hooks
    'add_action', 'add_filter', 'remove_action', 'remove_filter', 'do_action', 'apply_filters',
    'has_action', 'has_filter', 'did_action', 'current_action', 'current_filter',
    // Options
    'get_option', 'update_option', 'delete_option', 'add_option',
    'get_site_option', 'update_site_option', 'delete_site_option',
    'get_transient', 'set_transient', 'delete_transient',
    // Posts
    'get_post', 'get_posts', 'wp_insert_post', 'wp_update_post', 'wp_delete_post',
    'get_post_meta', 'update_post_meta', 'delete_post_meta', 'add_post_meta',
    'the_post', 'have_posts', 'the_content', 'the_title', 'the_permalink', 'the_ID',
    'get_the_ID', 'get_the_title', 'get_the_content', 'get_the_excerpt', 'get_permalink',
    // Users
    'get_user_by', 'get_userdata', 'get_current_user_id', 'wp_get_current_user',
    'is_user_logged_in', 'current_user_can', 'user_can',
    'get_user_meta', 'update_user_meta', 'delete_user_meta',
    // Taxonomy
    'get_term', 'get_terms', 'get_the_terms', 'wp_get_post_terms',
    'get_term_meta', 'update_term_meta', 'register_taxonomy',
    // Queries
    'WP_Query', 'get_queried_object', 'is_singular', 'is_archive', 'is_single', 'is_page',
    'is_home', 'is_front_page', 'is_admin', 'is_network_admin', 'is_multisite',
    // Enqueue
    'wp_enqueue_script', 'wp_enqueue_style', 'wp_register_script', 'wp_register_style',
    'wp_localize_script', 'wp_add_inline_script', 'wp_add_inline_style',
    'wp_dequeue_script', 'wp_dequeue_style',
    // AJAX/REST
    'wp_ajax_nopriv', 'wp_send_json', 'wp_send_json_success', 'wp_send_json_error',
    'wp_die', 'wp_verify_nonce', 'wp_create_nonce', 'check_ajax_referer',
    'rest_ensure_response', 'register_rest_route',
    // Database
    'wpdb', 'prepare',
    // Admin
    'add_menu_page', 'add_submenu_page', 'add_options_page', 'add_settings_section',
    'add_settings_field', 'register_setting', 'settings_fields', 'do_settings_sections',
    'add_meta_box', 'remove_meta_box',
    // General WP
    'wp_redirect', 'wp_safe_redirect', 'wp_remote_get', 'wp_remote_post',
    'is_wp_error', 'wp_upload_dir', 'wp_mkdir_p',
    'register_post_type', 'register_taxonomy', 'flush_rewrite_rules',
    'wp_nonce_field', 'submit_button',
    // PHP core functions
    'array_map', 'array_filter', 'array_reduce', 'array_merge', 'array_keys', 'array_values',
    'array_unique', 'array_flip', 'array_search', 'in_array', 'array_push', 'array_pop',
    'count', 'strlen', 'substr', 'strpos', 'str_replace', 'preg_match', 'preg_replace',
    'explode', 'implode', 'trim', 'strtolower', 'strtoupper', 'ucfirst', 'ucwords',
    'sprintf', 'printf', 'var_dump', 'print_r', 'json_encode', 'json_decode',
    'file_exists', 'file_get_contents', 'file_put_contents', 'fopen', 'fclose', 'fwrite',
    'is_array', 'is_string', 'is_int', 'is_bool', 'is_null', 'is_object',
    'isset', 'empty', 'unset', 'define', 'defined', 'constant',
    'class_exists', 'function_exists', 'method_exists', 'property_exists',
    'date', 'time', 'strtotime', 'date_i18n', 'current_time',
    'ob_start', 'ob_get_clean', 'ob_end_flush',
  ]);

  // Track potential issues (only report if multiple calls from same project)
  const undefinedCandidates: Map<string, { file: string; line: number }[]> = new Map();

  for (const [funcName, callSites] of calledFunctions) {
    if (!definedNames.has(funcName) && !wpCoreFunctions.has(funcName)) {
      // Skip methods called with -> or ::
      // Skip if it looks like a class constructor
      if (funcName[0] === funcName[0].toUpperCase() && funcName !== funcName.toUpperCase()) {
        continue; // Likely a class name
      }

      undefinedCandidates.set(funcName, callSites);
    }
  }

  // Only report functions called from multiple places (higher confidence)
  for (const [funcName, callSites] of undefinedCandidates) {
    if (callSites.length >= 2) {
      issues.push({
        file: callSites[0].file,
        line: callSites[0].line,
        type: 'warning',
        category: 'undefined',
        message: `Function "${funcName}" called ${callSites.length} times but not defined in project`,
        code: 'undefined-function',
      });
    }
  }

  return issues;
}

/**
 * Check for unused functions
 */
function checkUnusedFunctions(
  definedFunctions: FunctionInfo[],
  calledFunctions: Map<string, { file: string; line: number }[]>,
  registeredHooks: HookInfo[]
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const calledNames = new Set(calledFunctions.keys());
  const hookCallbacks = new Set(registeredHooks.map(h => h.callback));

  // Entry points that shouldn't be flagged as unused
  const entryPoints = new Set([
    'activate', 'deactivate', 'uninstall',
    '__construct', 'init', 'setup', 'run', 'boot',
    'register', 'enqueue', 'render', 'display',
  ]);

  // Magic methods
  const magicMethods = new Set([
    '__construct', '__destruct', '__call', '__callStatic',
    '__get', '__set', '__isset', '__unset', '__sleep', '__wakeup',
    '__serialize', '__unserialize', '__toString', '__invoke',
    '__set_state', '__clone', '__debugInfo',
  ]);

  for (const func of definedFunctions) {
    // Skip if called
    if (calledNames.has(func.name)) continue;

    // Skip if registered as hook callback
    if (hookCallbacks.has(func.name)) continue;

    // Skip entry points
    if (entryPoints.has(func.name)) continue;

    // Skip magic methods
    if (magicMethods.has(func.name)) continue;

    // Skip private/protected methods (may be used internally)
    if (func.isMethod && func.visibility !== 'public') continue;

    // Skip if name suggests it's an entry point
    if (/^(get_|set_|is_|has_|can_|should_|init_|register_|handle_|process_|render_|display_|admin_|ajax_|rest_)/.test(func.name)) {
      continue;
    }

    // Skip activation/deactivation hooks
    if (func.name.includes('activate') || func.name.includes('deactivate') || func.name.includes('uninstall')) {
      continue;
    }

    issues.push({
      file: func.file,
      line: func.line,
      type: 'warning',
      category: 'unused',
      message: `Function "${func.name}" appears to be unused${func.className ? ` (in class ${func.className})` : ''}`,
      code: 'unused-function',
    });
  }

  return issues;
}

/**
 * Check for orphan hook callbacks
 */
function checkOrphanHooks(
  registeredHooks: HookInfo[],
  definedFunctions: FunctionInfo[]
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const definedNames = new Set(definedFunctions.map(f => f.name));

  for (const hook of registeredHooks) {
    // Skip array callbacks with $this (method call)
    if (!hook.callback) continue;

    // Check if callback exists
    if (!definedNames.has(hook.callback)) {
      // Skip if it looks like a class method being registered
      if (hook.callback.includes('::')) continue;

      // Skip common WordPress callbacks
      const wpCallbacks = ['__return_true', '__return_false', '__return_null', '__return_empty_array', '__return_empty_string'];
      if (wpCallbacks.includes(hook.callback)) continue;

      issues.push({
        file: hook.file,
        line: hook.line,
        type: 'error',
        category: 'orphan',
        message: `Hook "${hook.name}" references callback "${hook.callback}" which doesn't exist`,
        code: 'orphan-hook-callback',
      });
    }
  }

  return issues;
}

/**
 * Check for orphan hook removals
 */
function checkOrphanRemovals(
  removedHooks: HookInfo[],
  registeredHooks: HookInfo[]
): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Map of hook names to their registered callbacks
  const registeredCallbacks = new Map<string, Set<string>>();
  for (const hook of registeredHooks) {
    const existing = registeredCallbacks.get(hook.name) || new Set();
    existing.add(hook.callback);
    registeredCallbacks.set(hook.name, existing);
  }

  for (const removal of removedHooks) {
    const registered = registeredCallbacks.get(removal.name);

    // If removing a callback that was never registered by this project
    // This might be intentional (removing core/plugin hooks), so just warn
    if (!registered || !registered.has(removal.callback)) {
      // Skip if it looks like removing a core WordPress hook
      const coreHooks = ['wp_head', 'wp_footer', 'admin_head', 'admin_footer', 'the_content', 'the_title'];
      if (coreHooks.some(h => removal.name.includes(h))) continue;

      issues.push({
        file: removal.file,
        line: removal.line,
        type: 'warning',
        category: 'orphan',
        message: `Removing hook "${removal.name}" with callback "${removal.callback}" that isn't registered in this project`,
        code: 'orphan-hook-removal',
      });
    }
  }

  return issues;
}

/**
 * Check for unused classes
 */
function checkUnusedClasses(
  definedClasses: Map<string, { file: string; line: number }>,
  instantiatedClasses: Set<string>
): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Entry point classes that shouldn't be flagged
  const entryPointPatterns = [
    /Plugin$/i, /Admin$/i, /Public$/i, /Core$/i, /Main$/i, /Loader$/i,
    /Bootstrap$/i, /Init$/i, /Setup$/i, /Activator$/i, /Deactivator$/i,
  ];

  for (const [className, info] of definedClasses) {
    if (instantiatedClasses.has(className)) continue;

    // Skip entry point classes
    if (entryPointPatterns.some(p => p.test(className))) continue;

    // Skip if it's likely an interface or abstract
    // (Would need more parsing to be sure)

    issues.push({
      file: info.file,
      line: info.line,
      type: 'warning',
      category: 'unused',
      message: `Class "${className}" appears to be unused`,
      code: 'unused-class',
    });
  }

  return issues;
}

/**
 * Check for duplicate function definitions
 */
function checkDuplicateFunctions(definedFunctions: FunctionInfo[]): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const seen = new Map<string, FunctionInfo>();

  for (const func of definedFunctions) {
    // Skip class methods (can have same name in different classes)
    if (func.isMethod) continue;

    const existing = seen.get(func.name);
    if (existing) {
      issues.push({
        file: func.file,
        line: func.line,
        type: 'error',
        category: 'duplicate',
        message: `Function "${func.name}" is also defined in ${existing.file}:${existing.line}`,
        code: 'duplicate-function',
      });
    } else {
      seen.set(func.name, func);
    }
  }

  return issues;
}

// ─── v2.0 Hook Analysis Checks ──────────────────────────────────

/**
 * Detect two callbacks on the same hook with the same priority.
 */
function checkHookPriorityConflicts(hooks: HookInfo[]): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const byHook = new Map<string, HookInfo[]>();

  for (const hook of hooks) {
    const existing = byHook.get(hook.name) || [];
    existing.push(hook);
    byHook.set(hook.name, existing);
  }

  for (const [hookName, registrations] of byHook) {
    if (registrations.length < 2) continue;

    const byPriority = new Map<number, HookInfo[]>();
    for (const reg of registrations) {
      const existing = byPriority.get(reg.priority) || [];
      existing.push(reg);
      byPriority.set(reg.priority, existing);
    }

    for (const [priority, regs] of byPriority) {
      if (regs.length < 2) continue;
      // Only flag if different callbacks at same priority
      const uniqueCallbacks = new Set(regs.map(r => r.callback));
      if (uniqueCallbacks.size >= 2) {
        const callbacks = regs.map(r => `${r.callback}() in ${r.file}:${r.line}`).join(', ');
        issues.push({
          file: regs[0].file,
          line: regs[0].line,
          type: 'warning',
          category: 'hook-analysis',
          message: `Hook "${hookName}" has ${regs.length} callbacks at priority ${priority}: ${callbacks}. Execution order may be unpredictable.`,
          code: 'hook-priority-conflict',
        });
      }
    }
  }

  return issues;
}

/**
 * Detect accepted_args mismatch: hook registers N args but callback takes fewer params.
 */
function checkAcceptedArgsMismatch(
  hooks: HookInfo[],
  definedFunctions: FunctionInfo[],
  phpFiles: string[],
  projectPath: string,
): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Build a map of function name -> parameter count
  const funcParamCounts = new Map<string, number>();
  for (const file of phpFiles) {
    const content = readFileSync(file, 'utf-8');
    const paramPattern = /function\s+(\w+)\s*\(([^)]*)\)/g;
    let match;
    while ((match = paramPattern.exec(content)) !== null) {
      const funcName = match[1];
      const params = match[2].trim();
      const paramCount = params === '' ? 0 : params.split(',').length;
      funcParamCounts.set(funcName, paramCount);
    }
  }

  for (const hook of hooks) {
    if (!hook.callback) continue;
    const paramCount = funcParamCounts.get(hook.callback);
    if (paramCount === undefined) continue;

    if (hook.acceptedArgs > 1 && paramCount < hook.acceptedArgs) {
      issues.push({
        file: hook.file,
        line: hook.line,
        type: 'warning',
        category: 'hook-analysis',
        message: `Hook "${hook.name}" passes ${hook.acceptedArgs} args but callback "${hook.callback}" accepts only ${paramCount} parameter(s).`,
        code: 'accepted-args-mismatch',
      });
    }
  }

  return issues;
}

/**
 * Detect hooks registered in the wrong context.
 * E.g., admin_enqueue_scripts outside is_admin() context.
 */
function checkWrongContextHooks(phpFiles: string[], projectPath: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  const adminHooks = [
    'admin_enqueue_scripts', 'admin_menu', 'admin_init', 'admin_head',
    'admin_footer', 'admin_notices', 'add_meta_boxes',
  ];

  const frontendHooks = [
    'wp_enqueue_scripts', 'wp_head', 'wp_footer', 'template_redirect',
  ];

  for (const file of phpFiles) {
    const rel = relativePath(file, projectPath);
    const content = readFileSync(file, 'utf-8');

    // Check admin hooks registered outside admin context
    for (const hookName of adminHooks) {
      const pattern = new RegExp(`add_action\\s*\\(\\s*['"]${hookName}['"]`, 'g');
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Check if inside is_admin() block or in admin-specific file
        const isAdminFile = /admin|backend/i.test(rel);
        const beforeCode = content.substring(Math.max(0, match.index - 1000), match.index);
        const inAdminCheck = /if\s*\(\s*is_admin\s*\(\s*\)/i.test(beforeCode);
        const inPluginsLoaded = /add_action\s*\(\s*['"]plugins_loaded['"]/i.test(beforeCode);

        if (!isAdminFile && !inAdminCheck && !inPluginsLoaded) {
          // Check for class context (methods in admin classes are fine)
          const hasAdminClass = /class\s+\w*[Aa]dmin\w*/i.test(content);
          if (!hasAdminClass) {
            issues.push({
              file: rel,
              line: getLineNumber(content, match.index),
              type: 'warning',
              category: 'hook-analysis',
              message: `Admin hook "${hookName}" registered without is_admin() check. Wrap in is_admin() to avoid loading on frontend.`,
              code: 'admin-hook-wrong-context',
            });
          }
        }
      }
    }

    // Check frontend hooks registered without !is_admin() context
    for (const hookName of frontendHooks) {
      const pattern = new RegExp(`add_action\\s*\\(\\s*['"]${hookName}['"]`, 'g');
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const isAdminFile = /admin|backend/i.test(rel);
        if (isAdminFile) {
          issues.push({
            file: rel,
            line: getLineNumber(content, match.index),
            type: 'warning',
            category: 'hook-analysis',
            message: `Frontend hook "${hookName}" registered in admin file "${rel}". This hook won't fire in admin context.`,
            code: 'frontend-hook-in-admin',
          });
        }
      }
    }
  }

  return issues;
}
