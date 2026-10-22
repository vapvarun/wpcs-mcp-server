/**
 * WPCS MCP Server - Tool Definitions
 * Optimized for WordPress plugin and theme development
 */
export const tools = [
    {
        name: 'wpcs_check_staged',
        description: 'Check all staged PHP files against WordPress Coding Standards. Use this before committing to ensure code quality. Automatically excludes vendor/, node_modules/, and build/ directories.',
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
        description: 'Check all PHP files in a directory against WordPress Coding Standards. Automatically excludes vendor/, node_modules/, and build/ directories.',
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
        description: 'Auto-fix WordPress Coding Standards violations in a PHP file using phpcbf. Fixes spacing, formatting, and other auto-fixable issues.',
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
        description: 'Pre-commit workflow optimized for WordPress plugins/themes: Auto-fix staged PHP files, re-stage them, and report remaining issues. Automatically excludes vendor/, node_modules/, and build/ directories. Returns whether commit should proceed.',
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
        description: 'Check PHP files for compatibility with specific PHP versions (8.1, 8.2, 8.3, 8.4). Uses PHPCompatibilityWP to detect deprecated functions, removed features, and syntax incompatibilities. Essential for ensuring your plugin/theme works across PHP versions.',
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
    {
        name: 'wpcs_quality_check',
        description: 'Advanced quality checks: hook usage, enqueue timing, security (SQL injection, XSS, SSRF, nonce mismatch, shell exec), performance (N+1 queries, unbounded queries, missing timeouts), accessibility, deprecated WP functions. Catches issues WPCS misses.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'wpcs_validate_project',
        description: 'Validate WordPress plugin or theme project. Checks headers, readme.txt, text domain, .pot file, stable tag match, GPL license, and uninstall cleanup. Auto-detects project type.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
                text_domain: {
                    type: 'string',
                    description: 'Expected text domain (defaults to folder name)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'wpcs_full_check',
        description: 'Run the static release gate in order: WPCS (phpcs) + PHP Compatibility + Project/readme validation + supplementary Quality heuristics (hooks, performance, a11y) + Frontend consistency. Run php -l, PHPStan and Plugin Check (security) separately; authz/SSRF live in release Gate G.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
                php_version: {
                    type: 'string',
                    description: 'PHP version range for compatibility check (portfolio standard: "8.1-")',
                    default: '8.1-',
                },
                text_domain: {
                    type: 'string',
                    description: 'Expected text domain (defaults to folder name)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'wpcs_frontend_check',
        description: 'Check HTML/CSS/JS consistency and accessibility: file naming, class naming (BEM), vendor prefixes, responsive design, ARIA role validation, heading hierarchy, skip links, form label association, button types, tabindex.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'wpcs_generate_report',
        description: 'Graded (A-F) report of the supplementary Quality + Frontend heuristics only, in JSON, Markdown, or summary format. NOT the release gate - run wpcs_full_check for WPCS/compat/validation. Optionally writes to a file for CI/CD integration.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
                format: {
                    type: 'string',
                    enum: ['json', 'markdown', 'summary'],
                    description: 'Report format (default: summary)',
                    default: 'summary',
                },
                output_file: {
                    type: 'string',
                    description: 'Optional file path to write the report to',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'wpcs_phpstan_check',
        description: 'Run PHPStan static analysis (if installed). Uses WordPress stubs for better type checking. Falls back gracefully if PHPStan is not installed.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the plugin or theme directory',
                },
                level: {
                    type: 'number',
                    description: 'PHPStan analysis level (0-9, default: 5)',
                    default: 5,
                },
            },
            required: ['path'],
        },
    },
];
//# sourceMappingURL=tools.js.map