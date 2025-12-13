/**
 * WPCS MCP Server - Tool Definitions
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'wpcs_check_staged',
    description:
      'Check all staged PHP files against WordPress Coding Standards. Use this before committing to ensure code quality.',
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
    description: 'Check all PHP files in a directory against WordPress Coding Standards.',
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
    description: 'Auto-fix WordPress Coding Standards violations in a PHP file using phpcbf.',
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
      'Pre-commit workflow: Auto-fix staged PHP files, re-stage them, and report remaining issues. Returns whether commit should proceed.',
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
];
