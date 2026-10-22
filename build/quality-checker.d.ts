/**
 * WPCS MCP Server - Quality Checker
 * Supplementary heuristics WPCS/PHPStan do not cover: hook timing, enqueue
 * placement, hardcoded URLs/paths, large files, basic a11y. Delegates perf
 * heuristics to performance-checker. Security/standards/deprecated are owned by
 * WPCS + PHPStan (static) and Gate G (authz) - not re-implemented here.
 * Pure file analysis - no external dependencies.
 */
import type { QualityResult } from './types.js';
/**
 * Run all quality checks on a directory.
 */
export declare function runQualityChecks(projectPath: string): QualityResult;
