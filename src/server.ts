/**
 * WPCS MCP Server - Main Implementation (v2.0.0)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { PhpcsRunner } from './phpcs-runner.js';
import { tools } from './tools.js';
import {
  detectProjectType,
  validatePluginHeaders,
  validateThemeHeaders,
  validateReadme,
  validateTextDomain,
  validatePotFile,
  validateStableTagMatch,
  validateGplLicense,
  validateUninstallCleanup,
} from './validators.js';
import { runQualityChecks } from './quality-checker.js';
import { runFrontendChecks } from './frontend-checker.js';
import { runCodeAnalysis } from './code-analyzer.js';
import { runSubmissionChecks } from './submission-checker.js';
import { generateReport, buildSection } from './report-generator.js';
import {
  getStagedPhpFiles,
  checkPhpcsInstalled,
  checkWpcsInstalled,
  formatPath,
} from './utils.js';
import type { WpcsCheckResult, ValidationResult, ReportFormat } from './types.js';

export class WpcsMcpServer {
  private server: Server;
  private phpcsRunner: PhpcsRunner;

  constructor() {
    this.server = new Server(
      {
        name: 'wpcs-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.phpcsRunner = new PhpcsRunner('WordPress');
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = (args || {}) as Record<string, unknown>;

      try {
        switch (name) {
          case 'wpcs_check_staged':
            return await this.checkStagedFiles(toolArgs.working_dir as string | undefined);

          case 'wpcs_check_file':
            return await this.checkFile(
              toolArgs.file_path as string,
              toolArgs.working_dir as string | undefined
            );

          case 'wpcs_check_directory':
            return await this.checkDirectory(
              toolArgs.directory as string,
              toolArgs.working_dir as string | undefined
            );

          case 'wpcs_fix_file':
            return await this.fixFile(
              toolArgs.file_path as string,
              toolArgs.working_dir as string | undefined
            );

          case 'wpcs_pre_commit':
            return await this.preCommitWorkflow(
              toolArgs.working_dir as string | undefined,
              toolArgs.auto_stage !== false
            );

          case 'wpcs_check_php_compatibility':
            return await this.checkPhpCompatibility(
              toolArgs.target as string,
              toolArgs.php_version as string | undefined,
              toolArgs.working_dir as string | undefined
            );

          case 'wpcs_quality_check':
            return this.qualityCheck(toolArgs.path as string);

          case 'wpcs_validate_project':
            return this.validateProject(
              toolArgs.path as string,
              toolArgs.text_domain as string | undefined
            );

          case 'wpcs_full_check':
            return await this.fullCheck(
              toolArgs.path as string,
              toolArgs.php_version as string | undefined,
              toolArgs.text_domain as string | undefined
            );

          case 'wpcs_frontend_check':
            return this.frontendCheck(toolArgs.path as string);

          case 'wpcs_code_analysis':
            return this.codeAnalysis(toolArgs.path as string);

          case 'wpcs_submission_check':
            return this.submissionCheck(toolArgs.path as string);

          case 'wpcs_generate_report':
            return this.reportGenerate(
              toolArgs.path as string,
              (toolArgs.format as ReportFormat) || 'summary',
              toolArgs.output_file as string | undefined
            );

          case 'wpcs_phpstan_check':
            return await this.phpstanCheck(
              toolArgs.path as string,
              (toolArgs.level as number) || 5
            );

          default:
            return this.errorResult(`Unknown tool: ${name}`);
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        return this.errorResult(`Tool execution failed: ${err.message || 'Unknown error'}`);
      }
    });
  }

  private async checkStagedFiles(workingDir?: string): Promise<CallToolResult> {
    const stagedFiles = getStagedPhpFiles(workingDir);

    if (stagedFiles.length === 0) {
      return this.successResult('No staged PHP files to check.');
    }

    const filePaths = stagedFiles.map((f) => f.path);
    const result = await this.phpcsRunner.checkFiles(filePaths, workingDir);

    return this.formatCheckResult(result, workingDir);
  }

  private async checkFile(filePath: string, workingDir?: string): Promise<CallToolResult> {
    if (!filePath) {
      return this.errorResult('file_path is required');
    }

    const result = await this.phpcsRunner.check(filePath, workingDir);
    return this.formatCheckResult(result, workingDir);
  }

  private async checkDirectory(directory: string, workingDir?: string): Promise<CallToolResult> {
    if (!directory) {
      return this.errorResult('directory is required');
    }

    const result = await this.phpcsRunner.check(directory, workingDir);
    return this.formatCheckResult(result, workingDir);
  }

  private async fixFile(filePath: string, workingDir?: string): Promise<CallToolResult> {
    if (!filePath) {
      return this.errorResult('file_path is required');
    }

    const result = await this.phpcsRunner.fix(filePath, workingDir);

    if (!result.success) {
      return this.errorResult(`Failed to fix file: ${result.diff || 'Unknown error'}`);
    }

    if (!result.fixed) {
      return this.successResult(`No fixable issues found in ${formatPath(filePath, workingDir)}`);
    }

    let message = `Fixed ${formatPath(filePath, workingDir)}\n\n`;

    if (result.remainingIssues) {
      if (result.remainingIssues.success) {
        message += 'All issues resolved. File now passes WordPress coding standards.';
      } else {
        message += `Remaining issues:\n${result.remainingIssues.summary}`;

        for (const file of result.remainingIssues.files) {
          for (const msg of file.messages) {
            message += `\n  Line ${msg.line}: [${msg.type}] ${msg.message}`;
          }
        }
      }
    }

    return this.successResult(message);
  }

  private async preCommitWorkflow(
    workingDir?: string,
    autoStage: boolean = true
  ): Promise<CallToolResult> {
    // Check prerequisites
    const phpcsCheck = checkPhpcsInstalled();
    if (!phpcsCheck.installed) {
      return this.errorResult(phpcsCheck.error!);
    }

    const wpcsCheck = checkWpcsInstalled();
    if (!wpcsCheck.installed) {
      return this.errorResult(wpcsCheck.error!);
    }

    // Get staged PHP files
    const stagedFiles = getStagedPhpFiles(workingDir);

    if (stagedFiles.length === 0) {
      return this.successResult(
        'PRE-COMMIT: PASSED\n\nNo staged PHP files to check. Commit can proceed.'
      );
    }

    const filePaths = stagedFiles.map((f) => f.path);

    // Run fix and check workflow
    const { checkResult, fixedFiles, reStageCommand } = await this.phpcsRunner.fixAndCheck(
      filePaths,
      workingDir
    );

    let message = '';

    // Report fixed files
    if (fixedFiles.length > 0) {
      message += `AUTO-FIXED ${fixedFiles.length} file(s):\n`;
      for (const file of fixedFiles) {
        message += `  - ${formatPath(file, workingDir)}\n`;
      }
      message += '\n';

      // Re-stage fixed files
      if (autoStage && reStageCommand) {
        try {
          const options = workingDir ? { cwd: workingDir } : {};
          execSync(reStageCommand, options);
          message += 'Fixed files have been re-staged.\n\n';
        } catch {
          message += `Warning: Could not re-stage files. Run manually:\n  ${reStageCommand}\n\n`;
        }
      } else if (reStageCommand) {
        message += `Re-stage fixed files with:\n  ${reStageCommand}\n\n`;
      }
    }

    // Report final status
    if (checkResult.canCommit) {
      message += 'PRE-COMMIT: PASSED\n\n';
      message += checkResult.summary;
      message += '\n\nCommit can proceed.';
    } else {
      message += 'PRE-COMMIT: BLOCKED\n\n';
      message += checkResult.summary;
      message += '\n\nRemaining issues:\n';

      for (const file of checkResult.files) {
        message += `\n${formatPath(file.path, workingDir)} (${file.errors} errors, ${file.warnings} warnings):\n`;
        for (const msg of file.messages) {
          const prefix = msg.type === 'ERROR' ? '[ERROR]' : '[WARNING]';
          const fixable = msg.fixable ? ' (fixable)' : '';
          message += `  Line ${msg.line}: ${prefix} ${msg.message}${fixable}\n`;
        }
      }

      message += '\n\nFix errors before committing.';
    }

    return {
      content: [
        {
          type: 'text',
          text: message,
        } as TextContent,
      ],
      isError: !checkResult.canCommit,
    };
  }

  private async checkPhpCompatibility(
    target: string,
    phpVersion?: string,
    workingDir?: string
  ): Promise<CallToolResult> {
    if (!target) {
      return this.errorResult('target is required');
    }

    const version = phpVersion || '7.4-';
    const options = workingDir ? { cwd: workingDir } : {};

    // Build exclude patterns
    const excludePatterns = [
      'vendor/*',
      'node_modules/*',
      'build/*',
      'dist/*',
      '.git/*',
    ];

    let command = `phpcs --standard=PHPCompatibilityWP --runtime-set testVersion ${version} --report=json`;
    command += ` --ignore=${excludePatterns.join(',')}`;
    command += ` "${target}"`;

    try {
      try {
        execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe' });

        return this.successResult(
          `PHP COMPATIBILITY: PASSED\n\nAll files are compatible with PHP ${version}.\nNo deprecated functions, removed features, or syntax issues found.`
        );
      } catch (error: unknown) {
        const execError = error as { stdout?: string; message?: string };
        const output = execError.stdout || '';

        if (!output) {
          return this.errorResult(`phpcs failed: ${execError.message || 'Unknown error'}`);
        }

        const result = JSON.parse(output);

        let message = `PHP COMPATIBILITY: ISSUES FOUND\n\n`;
        message += `Checking compatibility with PHP ${version}\n\n`;

        let totalErrors = 0;
        let totalWarnings = 0;

        for (const [filePath, data] of Object.entries(result.files) as [string, { errors: number; warnings: number; messages: Array<{ line: number; type: string; message: string; source: string }> }][]) {
          totalErrors += data.errors;
          totalWarnings += data.warnings;

          message += `${formatPath(filePath, workingDir)} (${data.errors} errors, ${data.warnings} warnings):\n`;

          for (const msg of data.messages) {
            const prefix = msg.type === 'ERROR' ? '[ERROR]' : '[WARNING]';
            message += `  Line ${msg.line}: ${prefix} ${msg.message}\n`;

            // Add helpful context for common issues
            if (msg.source.includes('RemovedFunction')) {
              message += `    → This function was removed in a newer PHP version\n`;
            } else if (msg.source.includes('DeprecatedFunction')) {
              message += `    → This function is deprecated and may be removed\n`;
            } else if (msg.source.includes('NewFeature')) {
              message += `    → This feature requires a newer PHP version\n`;
            }
          }
          message += '\n';
        }

        message += `\nSummary: ${totalErrors} error(s), ${totalWarnings} warning(s)\n`;

        if (totalErrors > 0) {
          message += '\nFix these issues to ensure compatibility with PHP ' + version;
        }

        return {
          content: [{ type: 'text', text: message } as TextContent],
          isError: totalErrors > 0,
        };
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      return this.errorResult(`PHP compatibility check failed: ${err.message || 'Unknown error'}`);
    }
  }

  private qualityCheck(projectPath: string): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const result = runQualityChecks(projectPath);

    let message = `QUALITY CHECK\n${'='.repeat(50)}\n\n`;
    message += `Path: ${projectPath}\n`;
    message += `Files analyzed: ${result.issues.length > 0 ? 'Multiple' : '0'}\n\n`;

    if (result.issues.length === 0) {
      message += `✓ No quality issues found!\n`;
      return this.successResult(message);
    }

    // Group by category
    const byCategory = new Map<string, typeof result.issues>();
    for (const issue of result.issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    const categoryLabels: Record<string, string> = {
      hooks: '1. HOOK USAGE',
      performance: '2. PERFORMANCE',
      accessibility: '3. ACCESSIBILITY',
      security: '4. SECURITY',
      deprecated: '5. DEPRECATED FUNCTIONS',
    };

    for (const [category, issues] of byCategory) {
      message += `${categoryLabels[category] || category.toUpperCase()}\n${'-'.repeat(40)}\n`;

      for (const issue of issues.slice(0, 15)) {
        const prefix = issue.type === 'error' ? '[ERROR]' : '[WARN]';
        message += `${prefix} ${issue.file}:${issue.line}\n`;
        message += `  ${issue.message}\n`;
        message += `  Code: ${issue.code}\n\n`;
      }

      if (issues.length > 15) {
        message += `  ... and ${issues.length - 15} more ${category} issues\n\n`;
      }
    }

    // Summary
    message += `${'='.repeat(50)}\n`;
    message += `SUMMARY: ${result.summary.errors} error(s), ${result.summary.warnings} warning(s)\n`;
    message += `By category: ${Object.entries(result.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: result.summary.errors > 0,
    };
  }

  private frontendCheck(projectPath: string): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const result = runFrontendChecks(projectPath);

    let message = `FRONTEND CONSISTENCY CHECK\n${'='.repeat(50)}\n\n`;
    message += `Path: ${projectPath}\n\n`;

    if (result.issues.length === 0) {
      message += `✓ No frontend consistency issues found!\n`;
      return this.successResult(message);
    }

    // Group by category
    const byCategory = new Map<string, typeof result.issues>();
    for (const issue of result.issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    const categoryLabels: Record<string, string> = {
      html: '1. HTML ISSUES',
      css: '2. CSS ISSUES',
      consistency: '3. CONSISTENCY',
      responsive: '4. RESPONSIVE DESIGN',
      naming: '5. FILE NAMING',
    };

    for (const [category, issues] of byCategory) {
      message += `${categoryLabels[category] || category.toUpperCase()}\n${'-'.repeat(40)}\n`;

      for (const issue of issues.slice(0, 10)) {
        const prefix = issue.type === 'error' ? '[ERROR]' : '[WARN]';
        message += `${prefix} ${issue.file}${issue.line > 0 ? `:${issue.line}` : ''}\n`;
        message += `  ${issue.message}\n`;
        message += `  Code: ${issue.code}\n\n`;
      }

      if (issues.length > 10) {
        message += `  ... and ${issues.length - 10} more ${category} issues\n\n`;
      }
    }

    // Patterns detected
    if (result.patterns.classNaming.length > 0 || result.patterns.colorFormats.length > 0) {
      message += `PATTERNS DETECTED\n${'-'.repeat(40)}\n`;

      const classCount = result.patterns.classNaming.reduce((acc, n) => {
        acc[n] = (acc[n] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      if (Object.keys(classCount).length > 0) {
        message += `Class naming: ${Object.entries(classCount).map(([s, c]) => `${s}(${c})`).join(', ')}\n`;
      }

      const colorCount = result.patterns.colorFormats.reduce((acc, c) => {
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      if (Object.keys(colorCount).length > 0) {
        message += `Color formats: ${Object.entries(colorCount).map(([f, c]) => `${f}(${c})`).join(', ')}\n`;
      }

      const unitCount = result.patterns.units.reduce((acc, u) => {
        acc[u] = (acc[u] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      if (Object.keys(unitCount).length > 0) {
        message += `CSS units: ${Object.entries(unitCount).map(([u, c]) => `${u}(${c})`).join(', ')}\n`;
      }
      message += '\n';
    }

    // Summary
    message += `${'='.repeat(50)}\n`;
    message += `SUMMARY: ${result.summary.errors} error(s), ${result.summary.warnings} warning(s)\n`;
    message += `By category: ${Object.entries(result.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: result.summary.errors > 0,
    };
  }

  private codeAnalysis(projectPath: string): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const result = runCodeAnalysis(projectPath);

    let message = `CODE ANALYSIS (Dead Code Detection)\n${'='.repeat(50)}\n\n`;
    message += `Path: ${projectPath}\n`;
    message += `Functions: ${result.stats.totalFunctions} | Classes: ${result.stats.totalClasses} | Hooks: ${result.stats.totalHooks}\n\n`;

    if (result.issues.length === 0) {
      message += `✓ No dead code or disconnected functions found!\n`;
      return this.successResult(message);
    }

    // Group by category
    const byCategory = new Map<string, typeof result.issues>();
    for (const issue of result.issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    const categoryLabels: Record<string, string> = {
      undefined: '1. UNDEFINED FUNCTIONS (called but not found)',
      unused: '2. UNUSED CODE (defined but never called)',
      orphan: '3. ORPHAN HOOKS (callback doesn\'t exist)',
      duplicate: '4. DUPLICATES',
    };

    for (const [category, issues] of byCategory) {
      message += `${categoryLabels[category] || category.toUpperCase()}\n${'-'.repeat(40)}\n`;

      for (const issue of issues.slice(0, 15)) {
        const prefix = issue.type === 'error' ? '[ERROR]' : '[WARN]';
        message += `${prefix} ${issue.file}:${issue.line}\n`;
        message += `  ${issue.message}\n\n`;
      }

      if (issues.length > 15) {
        message += `  ... and ${issues.length - 15} more ${category} issues\n\n`;
      }
    }

    // Summary
    message += `${'='.repeat(50)}\n`;
    message += `SUMMARY: ${result.summary.errors} error(s), ${result.summary.warnings} warning(s)\n`;
    message += `By category: ${Object.entries(result.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: result.summary.errors > 0,
    };
  }

  private validateProject(
    projectPath: string,
    textDomain?: string
  ): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const projectType = detectProjectType(projectPath);
    let message = `PROJECT VALIDATION\n${'='.repeat(40)}\n\n`;
    message += `Path: ${projectPath}\n`;
    message += `Type: ${projectType}\n\n`;

    let hasErrors = false;

    // 1. Validate headers
    message += `1. HEADERS\n${'-'.repeat(30)}\n`;
    let headerResult: ValidationResult;

    if (projectType === 'plugin') {
      headerResult = validatePluginHeaders(projectPath);
    } else if (projectType === 'theme') {
      headerResult = validateThemeHeaders(projectPath);
    } else {
      message += `⚠ Could not detect project type\n\n`;
      headerResult = { valid: false, errors: ['Unknown project type'], warnings: [], info: {} };
    }

    if (headerResult.valid) {
      message += `✓ Headers valid\n`;
    } else {
      hasErrors = true;
      message += `✗ Header issues found\n`;
    }

    for (const error of headerResult.errors) {
      message += `  [ERROR] ${error}\n`;
    }
    for (const warning of headerResult.warnings) {
      message += `  [WARN] ${warning}\n`;
    }

    if (Object.keys(headerResult.info).length > 0) {
      message += `  Info:\n`;
      for (const [key, value] of Object.entries(headerResult.info)) {
        message += `    ${key}: ${value}\n`;
      }
    }
    message += '\n';

    // 2. Validate readme
    message += `2. README\n${'-'.repeat(30)}\n`;
    const readmeResult = validateReadme(projectPath);

    if (readmeResult.valid) {
      message += `✓ readme.txt valid\n`;
    } else {
      hasErrors = true;
      message += `✗ readme.txt issues found\n`;
    }

    for (const error of readmeResult.errors) {
      message += `  [ERROR] ${error}\n`;
    }
    for (const warning of readmeResult.warnings) {
      message += `  [WARN] ${warning}\n`;
    }
    message += '\n';

    // 3. Validate text domain
    message += `3. TEXT DOMAIN (i18n)\n${'-'.repeat(30)}\n`;
    const i18nResult = validateTextDomain(projectPath, textDomain);

    if (i18nResult.warnings.length === 0 && i18nResult.errors.length === 0) {
      message += `✓ Text domain consistent: ${i18nResult.info['Expected Text Domain']}\n`;
    } else {
      message += `⚠ Text domain issues:\n`;
    }

    for (const error of i18nResult.errors) {
      message += `  [ERROR] ${error}\n`;
    }
    for (const warning of i18nResult.warnings.slice(0, 10)) {
      message += `  [WARN] ${warning}\n`;
    }
    if (i18nResult.warnings.length > 10) {
      message += `  ... and ${i18nResult.warnings.length - 10} more\n`;
    }
    message += '\n';

    // 4. Stable tag match (v2.0)
    message += `4. STABLE TAG\n${'-'.repeat(30)}\n`;
    const stableResult = validateStableTagMatch(projectPath);
    if (stableResult.valid) {
      message += `✓ Stable tag matches plugin version\n`;
    } else {
      hasErrors = true;
      for (const error of stableResult.errors) message += `  [ERROR] ${error}\n`;
    }
    for (const warning of stableResult.warnings) message += `  [WARN] ${warning}\n`;
    message += '\n';

    // 5. GPL License (v2.0)
    message += `5. LICENSE\n${'-'.repeat(30)}\n`;
    const gplResult = validateGplLicense(projectPath);
    if (gplResult.valid) {
      message += `✓ GPL license found\n`;
    } else {
      hasErrors = true;
      for (const error of gplResult.errors) message += `  [ERROR] ${error}\n`;
    }
    for (const warning of gplResult.warnings) message += `  [WARN] ${warning}\n`;
    message += '\n';

    // 6. Uninstall cleanup (v2.0)
    message += `6. UNINSTALL CLEANUP\n${'-'.repeat(30)}\n`;
    const uninstallResult = validateUninstallCleanup(projectPath);
    if (uninstallResult.warnings.length === 0) {
      message += `✓ Uninstall mechanism found\n`;
    } else {
      for (const warning of uninstallResult.warnings) message += `  [WARN] ${warning}\n`;
    }
    message += '\n';

    // 7. POT file (v2.0)
    message += `7. TRANSLATION FILE\n${'-'.repeat(30)}\n`;
    const potResult = validatePotFile(projectPath, textDomain);
    if (potResult.valid && potResult.warnings.length === 0) {
      message += `✓ POT file valid\n`;
    } else {
      if (!potResult.valid) hasErrors = true;
      for (const error of potResult.errors) message += `  [ERROR] ${error}\n`;
      for (const warning of potResult.warnings) message += `  [WARN] ${warning}\n`;
    }
    message += '\n';

    // Summary
    message += `${'='.repeat(40)}\n`;
    if (hasErrors) {
      message += `✗ Project has validation errors. Fix before WordPress.org submission.`;
    } else {
      message += `✓ Project validation passed.`;
    }

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: hasErrors,
    };
  }

  private async fullCheck(
    projectPath: string,
    phpVersion?: string,
    textDomain?: string
  ): Promise<CallToolResult> {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const projectType = detectProjectType(projectPath);
    const version = phpVersion || '7.4-';

    let message = `FULL WORDPRESS CHECK\n${'='.repeat(50)}\n\n`;
    message += `Path: ${projectPath}\n`;
    message += `Type: ${projectType}\n`;
    message += `PHP Version: ${version}\n\n`;

    let totalErrors = 0;
    let totalWarnings = 0;

    // 1. WPCS Check
    message += `1. WORDPRESS CODING STANDARDS\n${'-'.repeat(40)}\n`;
    const wpcsResult = await this.phpcsRunner.check(projectPath, undefined);

    if (wpcsResult.success) {
      message += `✓ PASSED\n\n`;
    } else {
      totalErrors += wpcsResult.totalErrors;
      totalWarnings += wpcsResult.totalWarnings;
      message += `✗ ${wpcsResult.totalErrors} error(s), ${wpcsResult.totalWarnings} warning(s)\n`;
      message += `${wpcsResult.summary}\n\n`;
    }

    // 2. PHP Compatibility
    message += `2. PHP COMPATIBILITY (${version})\n${'-'.repeat(40)}\n`;
    const compatResult = await this.runPhpCompatibility(projectPath, version);

    if (compatResult.errors === 0 && compatResult.warnings === 0) {
      message += `✓ PASSED\n\n`;
    } else {
      totalErrors += compatResult.errors;
      totalWarnings += compatResult.warnings;
      message += `✗ ${compatResult.errors} error(s), ${compatResult.warnings} warning(s)\n\n`;
    }

    // 3. Project Validation (headers, readme, i18n)
    message += `3. PROJECT VALIDATION\n${'-'.repeat(40)}\n`;

    // Headers
    let headerResult: ValidationResult;
    if (projectType === 'plugin') {
      headerResult = validatePluginHeaders(projectPath);
    } else if (projectType === 'theme') {
      headerResult = validateThemeHeaders(projectPath);
    } else {
      headerResult = { valid: false, errors: ['Unknown project type'], warnings: [], info: {} };
    }

    if (headerResult.valid) {
      message += `✓ Headers: Valid\n`;
    } else {
      totalErrors += headerResult.errors.length;
      message += `✗ Headers: ${headerResult.errors.length} error(s)\n`;
      for (const err of headerResult.errors) {
        message += `    ${err}\n`;
      }
    }
    totalWarnings += headerResult.warnings.length;

    // Readme
    const readmeResult = validateReadme(projectPath);
    if (readmeResult.valid) {
      message += `✓ Readme: Valid\n`;
    } else {
      totalErrors += readmeResult.errors.length;
      message += `✗ Readme: ${readmeResult.errors.length} error(s)\n`;
      for (const err of readmeResult.errors) {
        message += `    ${err}\n`;
      }
    }
    totalWarnings += readmeResult.warnings.length;

    // i18n
    const i18nResult = validateTextDomain(projectPath, textDomain);
    if (i18nResult.warnings.length === 0) {
      message += `✓ i18n: Consistent\n`;
    } else {
      totalWarnings += i18nResult.warnings.length;
      message += `⚠ i18n: ${i18nResult.warnings.length} warning(s)\n`;
    }

    message += '\n';

    // 4. Quality Check (hooks, performance, accessibility, security)
    message += `4. QUALITY CHECK\n${'-'.repeat(40)}\n`;
    const qualityResult = runQualityChecks(projectPath);

    if (qualityResult.summary.errors === 0 && qualityResult.summary.warnings === 0) {
      message += `✓ PASSED\n\n`;
    } else {
      totalErrors += qualityResult.summary.errors;
      totalWarnings += qualityResult.summary.warnings;
      message += `✗ ${qualityResult.summary.errors} error(s), ${qualityResult.summary.warnings} warning(s)\n`;
      message += `  Categories: ${Object.entries(qualityResult.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`;
    }

    // 5. Frontend Consistency (HTML, CSS, responsive)
    message += `5. FRONTEND CONSISTENCY\n${'-'.repeat(40)}\n`;
    const frontendResult = runFrontendChecks(projectPath);

    if (frontendResult.summary.errors === 0 && frontendResult.summary.warnings === 0) {
      message += `✓ PASSED\n\n`;
    } else {
      totalErrors += frontendResult.summary.errors;
      totalWarnings += frontendResult.summary.warnings;
      message += `✗ ${frontendResult.summary.errors} error(s), ${frontendResult.summary.warnings} warning(s)\n`;
      message += `  Categories: ${Object.entries(frontendResult.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`;
    }

    // 6. Code Analysis (dead code, unused functions)
    message += `6. CODE ANALYSIS\n${'-'.repeat(40)}\n`;
    const codeResult = runCodeAnalysis(projectPath);

    if (codeResult.summary.errors === 0 && codeResult.summary.warnings === 0) {
      message += `✓ PASSED\n`;
      message += `  Functions: ${codeResult.stats.totalFunctions} | Classes: ${codeResult.stats.totalClasses} | Hooks: ${codeResult.stats.totalHooks}\n\n`;
    } else {
      totalErrors += codeResult.summary.errors;
      totalWarnings += codeResult.summary.warnings;
      message += `✗ ${codeResult.summary.errors} error(s), ${codeResult.summary.warnings} warning(s)\n`;
      message += `  Categories: ${Object.entries(codeResult.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`;
    }

    // 7. Submission Check (v2.0)
    message += `7. SUBMISSION READINESS\n${'-'.repeat(40)}\n`;
    const submissionResult = runSubmissionChecks(projectPath);

    if (submissionResult.passed) {
      message += `✓ PASSED\n\n`;
    } else {
      totalErrors += submissionResult.summary.errors;
      totalWarnings += submissionResult.summary.warnings;
      message += `✗ ${submissionResult.summary.errors} error(s), ${submissionResult.summary.warnings} warning(s)\n`;
      message += `  Categories: ${Object.entries(submissionResult.summary.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`;
    }

    // Summary
    message += `${'='.repeat(50)}\n`;
    message += `SUMMARY: ${totalErrors} error(s), ${totalWarnings} warning(s)\n`;
    message += `${'='.repeat(50)}\n\n`;

    if (totalErrors === 0) {
      message += `✓ READY FOR SUBMISSION\n`;
      message += `This ${projectType} passes all checks.`;
    } else {
      message += `✗ NOT READY\n`;
      message += `Fix ${totalErrors} error(s) before WordPress.org submission.`;
    }

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: totalErrors > 0,
    };
  }

  private async runPhpCompatibility(
    target: string,
    phpVersion: string
  ): Promise<{ errors: number; warnings: number }> {
    const excludePatterns = ['vendor/*', 'node_modules/*', 'build/*', 'dist/*', '.git/*'];
    const command = `phpcs --standard=PHPCompatibilityWP --runtime-set testVersion ${phpVersion} --report=json --ignore=${excludePatterns.join(',')} "${target}"`;

    try {
      execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      return { errors: 0, warnings: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string };
      const output = execError.stdout || '';

      if (!output) {
        return { errors: 0, warnings: 0 };
      }

      try {
        const result = JSON.parse(output);
        let errors = 0;
        let warnings = 0;

        for (const data of Object.values(result.files) as { errors: number; warnings: number }[]) {
          errors += data.errors;
          warnings += data.warnings;
        }

        return { errors, warnings };
      } catch {
        return { errors: 0, warnings: 0 };
      }
    }
  }

  private formatCheckResult(result: WpcsCheckResult, workingDir?: string): CallToolResult {
    if (result.success) {
      return this.successResult(result.summary);
    }

    let message = `${result.summary}\n\n`;

    // Cap individual issues so a large directory can't blow the response/token budget.
    // The pass/fail (canCommit), summary, and fixable count are always preserved.
    const MAX_ISSUES = 100;
    let shown = 0;
    const omittedBySource = new Map<string, number>();

    for (const file of result.files) {
      if (shown >= MAX_ISSUES) {
        for (const msg of file.messages) omittedBySource.set(msg.source, (omittedBySource.get(msg.source) ?? 0) + 1);
        continue;
      }
      message += `${formatPath(file.path, workingDir)} (${file.errors} errors, ${file.warnings} warnings):\n`;
      for (const msg of file.messages) {
        if (shown >= MAX_ISSUES) { omittedBySource.set(msg.source, (omittedBySource.get(msg.source) ?? 0) + 1); continue; }
        const prefix = msg.type === 'ERROR' ? '[ERROR]' : '[WARNING]';
        const fixable = msg.fixable ? ' (fixable)' : '';
        message += `  Line ${msg.line}, Col ${msg.column}: ${prefix} ${msg.message}${fixable}\n`;
        message += `    Source: ${msg.source}\n`;
        shown++;
      }
      message += '\n';
    }

    if (omittedBySource.size > 0) {
      const total = [...omittedBySource.values()].reduce((a, b) => a + b, 0);
      message += `\n... ${total} more issue(s) omitted (showing first ${MAX_ISSUES}). Top sources:\n`;
      [...omittedBySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
        .forEach(([s, n]) => message += `  ${n}x ${s}\n`);
    }

    if (result.fixableCount > 0) {
      message += `\nTip: Run wpcs_fix_file to auto-fix ${result.fixableCount} issue(s).`;
    }

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: !result.canCommit,
    };
  }

  private successResult(message: string): CallToolResult {
    return {
      content: [{ type: 'text', text: message } as TextContent],
    };
  }

  private errorResult(message: string): CallToolResult {
    return {
      content: [{ type: 'text', text: `Error: ${message}` } as TextContent],
      isError: true,
    };
  }

  private submissionCheck(projectPath: string): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const result = runSubmissionChecks(projectPath);

    let message = `WORDPRESS.ORG SUBMISSION CHECK\n${'='.repeat(50)}\n\n`;
    message += `Path: ${projectPath}\n\n`;

    if (result.passed) {
      message += `✓ All submission checks passed! Ready for WordPress.org.\n`;
      return this.successResult(message);
    }

    const byCategory = new Map<string, typeof result.issues>();
    for (const issue of result.issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    for (const [category, issues] of byCategory) {
      message += `${category.toUpperCase()}\n${'-'.repeat(40)}\n`;
      for (const issue of issues) {
        const prefix = issue.type === 'error' ? '[ERROR]' : issue.type === 'warning' ? '[WARN]' : '[INFO]';
        message += `${prefix} ${issue.file}${issue.line > 0 ? `:${issue.line}` : ''}\n`;
        message += `  ${issue.message}\n\n`;
      }
    }

    message += `${'='.repeat(50)}\n`;
    message += `SUMMARY: ${result.summary.errors} error(s), ${result.summary.warnings} warning(s), ${result.summary.infos} info(s)\n`;
    if (result.summary.errors > 0) {
      message += `Fix errors before WordPress.org submission.`;
    }

    return {
      content: [{ type: 'text', text: message } as TextContent],
      isError: result.summary.errors > 0,
    };
  }

  private reportGenerate(
    projectPath: string,
    format: ReportFormat,
    outputFile?: string
  ): CallToolResult {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    const projectType = detectProjectType(projectPath);

    const qualityResult = runQualityChecks(projectPath);
    const frontendResult = runFrontendChecks(projectPath);
    const codeResult = runCodeAnalysis(projectPath);
    const submissionResult = runSubmissionChecks(projectPath);

    const sections = [
      buildSection('Quality', qualityResult.issues),
      buildSection('Frontend', frontendResult.issues),
      buildSection('Code Analysis', codeResult.issues),
      buildSection('Submission Readiness', submissionResult.issues),
    ];

    const { content } = generateReport(projectPath, projectType, sections, format, outputFile);

    let message = content;
    if (outputFile) {
      message += `\n\nReport written to: ${outputFile}`;
    }

    return this.successResult(message);
  }

  private async phpstanCheck(projectPath: string, level: number): Promise<CallToolResult> {
    if (!projectPath) {
      return this.errorResult('path is required');
    }

    // Detect PHPStan binary
    let phpstanPath: string | null = null;
    const candidates = [
      `${projectPath}/vendor/bin/phpstan`,
      `${process.env.HOME}/.composer/vendor/bin/phpstan`,
    ];

    for (const p of candidates) {
      try {
        execSync(`test -f "${p}"`, { stdio: 'pipe' });
        phpstanPath = p;
        break;
      } catch { /* not found */ }
    }

    if (!phpstanPath) {
      try {
        execSync('which phpstan', { stdio: 'pipe' });
        phpstanPath = 'phpstan';
      } catch { /* not found */ }
    }

    if (!phpstanPath) {
      return this.successResult(
        'PHPStan is not installed. To enable static analysis:\n' +
        '  composer require --dev phpstan/phpstan\n' +
        '  composer require --dev szepeviktor/phpstan-wordpress\n\n' +
        'Skipping static analysis.'
      );
    }

    const safeLevel = Math.max(0, Math.min(9, level));

    // Check if project has phpstan.neon — if so, respect it
    const hasPhpstanConfig = existsSync(`${projectPath}/phpstan.neon`) ||
                              existsSync(`${projectPath}/phpstan.neon.dist`) ||
                              existsSync(`${projectPath}/phpstan.dist.neon`);

    let command: string;
    if (hasPhpstanConfig) {
      // Project config defines level, paths, scanDirectories — respect it
      command = `"${phpstanPath}" analyse --error-format=json --no-progress --memory-limit=1G`;
    } else {
      // No project config — use defaults
      command = `"${phpstanPath}" analyse "${projectPath}" --level=${safeLevel} --error-format=json --no-progress --memory-limit=512M`;
    }

    try {
      execSync(command, { encoding: 'utf-8', stdio: 'pipe', timeout: 300000, cwd: projectPath });
      return this.successResult(
        `PHPSTAN: PASSED\n\nAll files pass PHPStan level ${safeLevel} analysis.\nNo type errors found.`
      );
    } catch (error: unknown) {
      const execError = error as { stdout?: string; message?: string };
      const output = execError.stdout || '';

      if (!output) {
        return this.errorResult(`PHPStan failed: ${execError.message || 'Unknown error'}`);
      }

      try {
        const result = JSON.parse(output);
        const totalErrors = result.totals?.file_errors || 0;

        let message = `PHPSTAN: ISSUES FOUND (Level ${safeLevel})\n${'='.repeat(50)}\n\n`;

        if (result.files) {
          for (const [filePath, data] of Object.entries(result.files) as [string, { errors: number; messages: Array<{ line: number; message: string }> }][]) {
            const rel = filePath.replace(projectPath + '/', '');
            message += `${rel} (${data.errors} error(s)):\n`;
            for (const msg of data.messages) {
              message += `  Line ${msg.line}: ${msg.message}\n`;
            }
            message += '\n';
          }
        }

        message += `${'='.repeat(50)}\nTotal: ${totalErrors} error(s)\n`;

        return {
          content: [{ type: 'text', text: message } as TextContent],
          isError: totalErrors > 0,
        };
      } catch {
        return this.errorResult(`PHPStan output could not be parsed: ${output.substring(0, 200)}`);
      }
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WPCS MCP Server v2.0.0 running on stdio');
  }
}
