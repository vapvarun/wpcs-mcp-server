/**
 * WPCS MCP Server - Configuration
 * Loads per-project .wpcs-mcp.json, searching from project root upward.
 */
import type { WpcsConfig } from './types.js';
/**
 * Default configuration used when no .wpcs-mcp.json is found.
 */
export declare function getDefaultConfig(): WpcsConfig;
/**
 * Load project configuration, merging with defaults.
 * If `configPath` is provided, use that directly; otherwise search from `projectPath` upward.
 */
export declare function loadConfig(projectPath: string, configPath?: string): WpcsConfig;
/**
 * Check if a rule should be ignored based on config.
 */
export declare function isRuleIgnored(ruleCode: string, config: WpcsConfig): boolean;
/**
 * Check if a file should be ignored based on config.
 */
export declare function isFileIgnored(filePath: string, config: WpcsConfig): boolean;
