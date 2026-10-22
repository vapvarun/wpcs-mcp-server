/**
 * WPCS MCP Server - Performance Checker
 * Extracted + expanded performance checks.
 */
import { readFileSync } from 'fs';
import { findPhpFiles, getLineNumber, findPatternLine, relativePath } from './shared-utils.js';
/**
 * Run all performance checks on a project directory.
 */
export function runPerformanceChecks(projectPath) {
    const issues = [];
    const phpFiles = findPhpFiles(projectPath);
    for (const file of phpFiles) {
        const rel = relativePath(file, projectPath);
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        issues.push(...checkBlockingRemoteCalls(rel, content));
        issues.push(...checkDirectCurl(rel, content, lines));
        issues.push(...checkUncachedDbQueries(rel, content));
        issues.push(...checkBlockingSleep(rel, content, lines));
        issues.push(...checkPhpSessions(rel, content, lines));
        issues.push(...checkInlineInHead(rel, content, lines));
        issues.push(...checkWrongDbMethod(rel, content, lines));
        issues.push(...checkNPlusOneQueries(rel, content));
        issues.push(...checkExpensiveOpsInLoops(rel, content));
        issues.push(...checkAutoloadedOptions(rel, content));
        issues.push(...checkMissingRemoteTimeout(rel, content));
        issues.push(...checkUnthrottledApiCalls(rel, content));
        issues.push(...checkNoPagination(rel, content));
        issues.push(...checkUnpaginatedDbQuery(rel, content));
        issues.push(...checkRedundantCalls(rel, content));
        issues.push(...checkObjectCacheSuggestion(rel, content));
    }
    const errors = issues.filter(i => i.type === 'error').length;
    const warnings = issues.filter(i => i.type === 'warning').length;
    const infos = issues.filter(i => i.type === 'info').length;
    return { issues, summary: { errors, warnings, infos } };
}
// ─── Existing checks (from quality-checker) ─────────────────────
function checkBlockingRemoteCalls(file, content) {
    const issues = [];
    const pattern = /file_get_contents\s*\(\s*['"]https?:\/\//gi;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        issues.push({
            file, line: getLineNumber(content, match.index), type: 'error',
            message: 'Use wp_remote_get() instead of file_get_contents() for remote URLs.',
            code: 'blocking-remote-call',
        });
    }
    return issues;
}
function checkDirectCurl(file, content, lines) {
    if (!/\bcurl_init\s*\(/i.test(content))
        return [];
    return [{
            file, line: findPatternLine(lines, /\bcurl_init\s*\(/), type: 'warning',
            message: 'Use WP HTTP API (wp_remote_get/post) instead of cURL for better compatibility.',
            code: 'direct-curl',
        }];
}
function checkUncachedDbQueries(file, content) {
    const issues = [];
    const pattern = /\$wpdb\s*->\s*(?:get_results|get_row|get_var|get_col|query)\s*\(/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const surroundingCode = content.substring(Math.max(0, match.index - 500), match.index + 200);
        if (!/wp_cache_get|get_transient|wp_cache_set|set_transient/i.test(surroundingCode)) {
            issues.push({
                file, line: getLineNumber(content, match.index), type: 'warning',
                message: 'Consider caching this database query with wp_cache_* or transients.',
                code: 'uncached-db-query',
            });
        }
    }
    return issues;
}
function checkBlockingSleep(file, content, lines) {
    if (!/\b(?:sleep|usleep)\s*\(\s*\d+\s*\)/i.test(content))
        return [];
    return [{
            file, line: findPatternLine(lines, /\b(?:sleep|usleep)\s*\(/), type: 'error',
            message: 'Avoid sleep() in web requests. Use async processing or WP Cron.',
            code: 'blocking-sleep',
        }];
}
function checkPhpSessions(file, content, lines) {
    if (!/\bsession_start\s*\(|\$_SESSION\s*\[/i.test(content))
        return [];
    return [{
            file, line: findPatternLine(lines, /session_start|\$_SESSION/), type: 'warning',
            message: 'Avoid PHP sessions in WordPress. Use transients, user meta, or custom tables instead.',
            code: 'php-session-usage',
        }];
}
function checkInlineInHead(file, content, lines) {
    if (!/add_action\s*\(\s*['"]wp_head['"].*<style|<script/s.test(content))
        return [];
    return [{
            file, line: findPatternLine(lines, /add_action\s*\(\s*['"]wp_head['"]/), type: 'warning',
            message: 'Avoid inline styles/scripts in wp_head. Use wp_enqueue_* for better caching.',
            code: 'inline-in-head',
        }];
}
function checkWrongDbMethod(file, content, lines) {
    if (!/\$wpdb\s*->\s*get_results\s*\([^)]*LIMIT\s+1[^)]*\)/i.test(content))
        return [];
    return [{
            file, line: findPatternLine(lines, /get_results.*LIMIT\s+1/i), type: 'warning',
            message: 'Use $wpdb->get_row() instead of get_results() with LIMIT 1.',
            code: 'db-wrong-method',
        }];
}
// ─── New v2.0 checks ────────────────────────────────────────────
/**
 * Find the closing brace index for a block starting at a given position.
 */
function findBlockEnd(content, startIndex) {
    let braceCount = 0;
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{')
            braceCount++;
        if (content[i] === '}')
            braceCount--;
        if (braceCount === 0 && i > startIndex)
            return i;
    }
    return content.length;
}
function checkNPlusOneQueries(file, content) {
    const issues = [];
    const loopPattern = /(?:foreach|while|for)\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = loopPattern.exec(content)) !== null) {
        const loopEnd = findBlockEnd(content, match.index);
        const loopBody = content.substring(match.index, loopEnd);
        const dbCallPattern = /(?:get_post_meta|get_user_meta|get_term_meta|\$wpdb\s*->\s*get_(?:results|row|var|col))\s*\(/g;
        let dbMatch;
        while ((dbMatch = dbCallPattern.exec(loopBody)) !== null) {
            issues.push({
                file, line: getLineNumber(content, match.index + dbMatch.index), type: 'error',
                message: 'N+1 query: database/meta call inside a loop. Batch-fetch data before the loop.',
                code: 'n-plus-one-query',
            });
        }
    }
    return issues;
}
function checkExpensiveOpsInLoops(file, content) {
    const issues = [];
    const loopPattern = /(?:foreach|while|for)\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = loopPattern.exec(content)) !== null) {
        const loopEnd = findBlockEnd(content, match.index);
        const loopBody = content.substring(match.index, loopEnd);
        const expensiveOps = /\b(get_option|get_post|get_user_by)\s*\(/g;
        let opMatch;
        while ((opMatch = expensiveOps.exec(loopBody)) !== null) {
            issues.push({
                file, line: getLineNumber(content, match.index + opMatch.index), type: 'warning',
                message: `${opMatch[1]}() inside loop. Cache the result before the loop.`,
                code: 'expensive-op-in-loop',
            });
        }
    }
    return issues;
}
function checkAutoloadedOptions(file, content) {
    const issues = [];
    const addOptionPattern = /add_option\s*\(\s*['"][^'"]+['"]\s*,/g;
    let match;
    while ((match = addOptionPattern.exec(content)) !== null) {
        const callContext = content.substring(match.index, match.index + 300);
        const hasAutoloadNo = /['"]no['"]|false\s*\)/i.test(callContext);
        const looksLarge = /array\s*\(|serialize|json_encode/i.test(callContext);
        if (looksLarge && !hasAutoloadNo) {
            issues.push({
                file, line: getLineNumber(content, match.index), type: 'warning',
                message: "add_option() with large data should set autoload to 'no' to avoid loading on every page.",
                code: 'autoloaded-large-option',
            });
        }
    }
    return issues;
}
function checkMissingRemoteTimeout(file, content) {
    const issues = [];
    const remotePattern = /wp_remote_(?:get|post|head|request)\s*\(/g;
    let match;
    while ((match = remotePattern.exec(content)) !== null) {
        const callContext = content.substring(match.index, match.index + 500);
        if (!/timeout/i.test(callContext)) {
            issues.push({
                file, line: getLineNumber(content, match.index), type: 'warning',
                message: "wp_remote_* call without 'timeout' parameter. Set a reasonable timeout (e.g., 15 seconds).",
                code: 'missing-remote-timeout',
            });
        }
    }
    return issues;
}
function checkUnthrottledApiCalls(file, content) {
    const issues = [];
    const loopPattern = /(?:foreach|while|for)\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = loopPattern.exec(content)) !== null) {
        const loopEnd = findBlockEnd(content, match.index);
        const loopBody = content.substring(match.index, loopEnd);
        if (/wp_remote_(?:get|post|head|request)\s*\(/i.test(loopBody)) {
            if (!/sleep|usleep|rate_limit|throttle/i.test(loopBody)) {
                issues.push({
                    file, line: getLineNumber(content, match.index), type: 'warning',
                    message: 'wp_remote_* call inside loop without rate limiting. Add throttling to avoid API bans.',
                    code: 'unthrottled-api-calls',
                });
            }
        }
    }
    return issues;
}
function checkNoPagination(file, content) {
    const issues = [];
    const pattern = /(?:posts_per_page|numberposts)\s*(?:=>|=)\s*-1/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        issues.push({
            file, line: getLineNumber(content, match.index), type: 'warning',
            message: 'Query with posts_per_page = -1 fetches ALL posts. Use pagination or a reasonable limit.',
            code: 'no-pagination',
        });
    }
    return issues;
}
function checkUnpaginatedDbQuery(file, content) {
    const issues = [];
    const pattern = /\$wpdb\s*->\s*get_results\s*\(/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const queryContext = content.substring(match.index, match.index + 500);
        if (!/LIMIT/i.test(queryContext)) {
            issues.push({
                file, line: getLineNumber(content, match.index), type: 'warning',
                message: '$wpdb->get_results() without LIMIT clause. Add LIMIT to prevent fetching unbounded data.',
                code: 'unpaginated-db-query',
            });
        }
    }
    return issues;
}
function checkRedundantCalls(file, content) {
    const issues = [];
    const funcPattern = /function\s+\w+\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = funcPattern.exec(content)) !== null) {
        const funcEnd = findBlockEnd(content, match.index);
        const funcBody = content.substring(match.index, funcEnd);
        const optionCallPattern = /get_option\s*\(\s*['"]([^'"]+)['"]/g;
        const keyCounts = {};
        let optMatch;
        while ((optMatch = optionCallPattern.exec(funcBody)) !== null) {
            keyCounts[optMatch[1]] = (keyCounts[optMatch[1]] || 0) + 1;
        }
        for (const [key, count] of Object.entries(keyCounts)) {
            if (count >= 2) {
                issues.push({
                    file, line: getLineNumber(content, match.index), type: 'warning',
                    message: `get_option('${key}') called ${count} times in same function. Store in a variable.`,
                    code: 'redundant-option-call',
                });
            }
        }
    }
    return issues;
}
function checkObjectCacheSuggestion(file, content) {
    const optionCount = (content.match(/get_option\s*\(/g) || []).length;
    const transientCount = (content.match(/get_transient\s*\(/g) || []).length;
    const totalLookups = optionCount + transientCount;
    const hasCacheUsage = /wp_cache_get|wp_cache_set|wp_cache_add/i.test(content);
    if (totalLookups >= 5 && !hasCacheUsage) {
        return [{
                file, line: 1, type: 'info',
                message: `${totalLookups} option/transient lookups without object cache usage. Consider wp_cache_* for frequently accessed data.`,
                code: 'object-cache-suggestion',
            }];
    }
    return [];
}
//# sourceMappingURL=performance-checker.js.map