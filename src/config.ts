/**
 * WPCS MCP Server - Configuration
 * Loads per-project .wpcs-mcp.json, searching from project root upward.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { WpcsConfig } from './types.js';

const CONFIG_FILE_NAME = '.wpcs-mcp.json';

/**
 * Default configuration used when no .wpcs-mcp.json is found.
 */
export function getDefaultConfig(): WpcsConfig {
  return {
    standard: 'WordPress',
    phpVersion: '7.4-',
    textDomain: null,
    exclude: ['vendor/*', 'node_modules/*', 'tests/*', 'build/*', 'dist/*'],
    severity: {
      security: 'error',
      performance: 'warning',
      accessibility: 'warning',
    },
    checks: {
      security: true,
      performance: true,
      accessibility: true,
      submission: false,
      deprecated: true,
      phpstan: false,
    },
    ignore: {
      rules: [],
      files: [],
    },
    report: {
      format: 'text' as 'json',
      maxIssuesPerFile: 20,
    },
  };
}

/**
 * Search for .wpcs-mcp.json starting from `startDir` and walking up.
 * Returns the path if found, null otherwise.
 */
function findConfigFile(startDir: string): string | null {
  let dir = startDir;
  const root = dirname(dir) === dir ? dir : '/';

  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, CONFIG_FILE_NAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return null;
}

/**
 * Load project configuration, merging with defaults.
 * If `configPath` is provided, use that directly; otherwise search from `projectPath` upward.
 */
export function loadConfig(projectPath: string, configPath?: string): WpcsConfig {
  const defaults = getDefaultConfig();

  const filePath = configPath || findConfigFile(projectPath);
  if (!filePath || !existsSync(filePath)) {
    return defaults;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const userConfig = JSON.parse(raw) as Partial<WpcsConfig>;

    return {
      standard: userConfig.standard ?? defaults.standard,
      phpVersion: userConfig.phpVersion ?? defaults.phpVersion,
      textDomain: userConfig.textDomain ?? defaults.textDomain,
      exclude: userConfig.exclude ?? defaults.exclude,
      severity: {
        ...defaults.severity,
        ...(userConfig.severity || {}),
      },
      checks: {
        ...defaults.checks,
        ...(userConfig.checks || {}),
      },
      ignore: {
        rules: userConfig.ignore?.rules ?? defaults.ignore.rules,
        files: userConfig.ignore?.files ?? defaults.ignore.files,
      },
      report: {
        ...defaults.report,
        ...(userConfig.report || {}),
      },
    };
  } catch {
    // If config is invalid JSON, fall back to defaults
    return defaults;
  }
}

/**
 * Check if a rule should be ignored based on config.
 */
export function isRuleIgnored(ruleCode: string, config: WpcsConfig): boolean {
  return config.ignore.rules.includes(ruleCode);
}

/**
 * Check if a file should be ignored based on config.
 */
export function isFileIgnored(filePath: string, config: WpcsConfig): boolean {
  return config.ignore.files.some(pattern => {
    // Simple glob matching: convert * to regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filePath);
  });
}
