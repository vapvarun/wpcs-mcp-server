/**
 * WPCS MCP Server - Code Analyzer
 * Dead code detection, undefined functions, unused hooks, hook analysis
 */
import type { CodeAnalysisResult } from './types.js';
/**
 * Run code analysis
 */
export declare function runCodeAnalysis(projectPath: string): CodeAnalysisResult;
