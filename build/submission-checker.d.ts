/**
 * WPCS MCP Server - WordPress.org Submission Checker
 * Validates plugin/theme against WP.org submission requirements.
 */
import type { SubmissionResult } from './types.js';
/**
 * Run all WP.org submission checks.
 */
export declare function runSubmissionChecks(projectPath: string): SubmissionResult;
