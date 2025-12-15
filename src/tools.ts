/**
 * WPCS MCP Server - Tool Definitions
 * Optimized for WordPress plugin and theme development
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'wpcs_check_staged',
    description:
      'Check all staged PHP files against WordPress Coding Standards. Use this before committing to ensure code quality. Automatically excludes vendor/, node_modules/, and build/ directories.',
    inputSchema: {
      type: 'object',
      properties: {
        working_dir: {
          type: 'string',
          description: 'Working directory (git repository root). Defaults to current directory.',
        },
      },
    },
  },
  {
    name: 'wpcs_check_file',
    description: 'Check a single PHP file against WordPress Coding Standards.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the PHP file to check (absolute or relative to working_dir)',
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for relative paths',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'wpcs_check_directory',
    description:
      'Check all PHP files in a directory against WordPress Coding Standards. Automatically excludes vendor/, node_modules/, and build/ directories.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Path to the directory to check',
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for relative paths',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'wpcs_fix_file',
    description:
      'Auto-fix WordPress Coding Standards violations in a PHP file using phpcbf. Fixes spacing, formatting, and other auto-fixable issues.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the PHP file to fix',
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for relative paths',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'wpcs_pre_commit',
    description:
      'Pre-commit workflow optimized for WordPress plugins/themes: Auto-fix staged PHP files, re-stage them, and report remaining issues. Automatically excludes vendor/, node_modules/, and build/ directories. Returns whether commit should proceed.',
    inputSchema: {
      type: 'object',
      properties: {
        working_dir: {
          type: 'string',
          description: 'Git repository root directory',
        },
        auto_stage: {
          type: 'boolean',
          description: 'Automatically re-stage fixed files (default: true)',
          default: true,
        },
      },
    },
  },
  {
    name: 'wpcs_check_php_compatibility',
    description:
      'Check PHP files for compatibility with specific PHP versions (8.1, 8.2, 8.3, 8.4). Uses PHPCompatibilityWP to detect deprecated functions, removed features, and syntax incompatibilities. Essential for ensuring your plugin/theme works across PHP versions.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'File or directory to check',
        },
        php_version: {
          type: 'string',
          description: 'PHP version to check compatibility for (e.g., "8.1", "8.2", "8.3", "8.4"). Can also specify range like "7.4-8.4"',
          default: '7.4-',
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for relative paths',
        },
      },
      required: ['target'],
    },
  },
];
