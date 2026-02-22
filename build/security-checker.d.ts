/**
 * WPCS MCP Server - Security Checker
 * Extracted + expanded security checks.
 */
import type { SecurityResult } from './types.js';
/**
 * Run all security checks on a project directory.
 */
export declare function runSecurityChecks(projectPath: string): SecurityResult;
