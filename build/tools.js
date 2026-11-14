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
        description: 'Static PHPCompatibilityWP sniff for a PHP version or range (portfolio range 8.1-8.5): deprecated functions, removed features, syntax a version does not have. It does not execute or lint the code on each version (php -l runs in wpcs_full_check). Errors out, instead of passing, when phpcs crashes or returns no parseable report.',
        inputSchema: {
            type: 'object',
            properties: {
                target: {
                    type: 'string',
                    description: 'File or directory to check',
                },
                php_version: {
                    type: 'string',
                    description: 'PHP version to check compatibility for (e.g., "8.1", "8.2", "8.3", "8.4", "8.5"). Can also be a range like "8.1-8.5" or "8.1-" (8.1 and newer, the default)',
                    default: '8.1-',
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
        description: 'Supplementary grep heuristics WPCS does not cover: hook and enqueue timing, hooks in constructors, direct output, hardcoded URLs / WP paths / table prefix, unprefixed functions, missing wp_reset_postdata, img without alt, non-descriptive links, oversized files. It runs NO security checks (no SQL injection, XSS, SSRF, nonce or shell-exec detection): use the wp-security-review skill and Plugin Check for security.',
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
        description: 'Run the static release gate in order: php -l with every available PHP binary (fail-fast; reports which versions linted) -> WPCS (phpcs) -> PHPCompatibilityWP -> project/readme validation -> supplementary Quality heuristics (hooks, performance, a11y; no security checks) -> Frontend consistency. A stage that cannot run (bad path, phpcs crash, unparseable output) is an error, never a pass. PHPStan (wpcs_phpstan_check), Plugin Check and security review (wp-security-review skill, release Gate G) are separate and not run here.',
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
        description: "Run PHPStan static analysis with the project's vendor binary (or a global one), honouring its phpstan.neon. If PHPStan is not installed the result is NOT RUN and an error, not a pass.",
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