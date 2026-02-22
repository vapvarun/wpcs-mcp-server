/**
 * WPCS MCP Server - Deprecated WordPress Functions Database
 * ~100 commonly used deprecated functions from WP 2.0 through 6.7.
 */
import type { DeprecatedFunction } from './types.js';
export declare const DEPRECATED_FUNCTIONS: DeprecatedFunction[];
/**
 * Build a quick lookup map: functionName -> DeprecatedFunction
 */
export declare function buildDeprecatedMap(): Map<string, DeprecatedFunction>;
