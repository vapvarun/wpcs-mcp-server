/**
 * WPCS MCP Server - Quality Checker
 * Orchestrates hooks, deprecated functions, and delegates to security/performance checkers.
 * Pure file analysis - no external dependencies.
 */
import type { QualityResult } from './types.js';
/**
 * Run all quality checks on a directory.
 */
export declare function runQualityChecks(projectPath: string): QualityResult;
