/**
 * WPCS MCP Server - Main Implementation
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
import { PhpcsRunner } from './phpcs-runner.js';
import { tools } from './tools.js';
import {
  getStagedPhpFiles,
  checkPhpcsInstalled,
  checkWpcsInstalled,
  formatPath,
} from './utils.js';
import { WpcsCheckResult } from './types.js';

export class WpcsMcpServer {
  private server: Server;
  private phpcsRunner: PhpcsRunner;

  constructor() {
    this.server = new Server(
      {
        name: 'wpcs-mcp-server',
        version: '1.0.0',
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

  private formatCheckResult(result: WpcsCheckResult, workingDir?: string): CallToolResult {
    if (result.success) {
      return this.successResult(result.summary);
    }

    let message = `${result.summary}\n\n`;

    for (const file of result.files) {
      message += `${formatPath(file.path, workingDir)} (${file.errors} errors, ${file.warnings} warnings):\n`;
      for (const msg of file.messages) {
        const prefix = msg.type === 'ERROR' ? '[ERROR]' : '[WARNING]';
        const fixable = msg.fixable ? ' (fixable)' : '';
        message += `  Line ${msg.line}, Col ${msg.column}: ${prefix} ${msg.message}${fixable}\n`;
        message += `    Source: ${msg.source}\n`;
      }
      message += '\n';
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WPCS MCP Server running on stdio');
  }
}
