/**
 * WPCS MCP Server - PHPCS/PHPCBF Runner
 */

import { execSync } from 'child_process';
import { PhpcsResult, WpcsCheckResult, WpcsFixResult } from './types.js';

export class PhpcsRunner {
  private standard: string;

  constructor(standard: string = 'WordPress') {
    this.standard = standard;
  }

  /**
   * Run phpcs on a single file or directory
   */
  async check(target: string, workingDir?: string): Promise<WpcsCheckResult> {
    const options = workingDir ? { cwd: workingDir } : {};

    try {
      const command = `phpcs --standard=${this.standard} --report=json "${target}"`;

      try {
        execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe' });

        // If no errors, phpcs exits with 0
        return {
          success: true,
          canCommit: true,
          totalErrors: 0,
          totalWarnings: 0,
          fixableCount: 0,
          files: [],
          summary: 'No coding standard violations found.',
        };
      } catch (error: unknown) {
        const execError = error as { stdout?: string; message?: string };
        const output = execError.stdout || '';

        if (!output) {
          throw new Error(`phpcs failed: ${execError.message || 'Unknown error'}`);
        }

        const result: PhpcsResult = JSON.parse(output);

        const files = Object.entries(result.files).map(([path, data]) => ({
          path,
          errors: data.errors,
          warnings: data.warnings,
          messages: data.messages,
        }));

        const canCommit = result.totals.errors === 0;

        return {
          success: false,
          canCommit,
          totalErrors: result.totals.errors,
          totalWarnings: result.totals.warnings,
          fixableCount: result.totals.fixable,
          files,
          summary: this.formatSummary(result.totals, files.length),
        };
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      return {
        success: false,
        canCommit: false,
        totalErrors: 1,
        totalWarnings: 0,
        fixableCount: 0,
        files: [],
        summary: `Error running phpcs: ${err.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Run phpcbf to auto-fix a file
   */
  async fix(filePath: string, workingDir?: string): Promise<WpcsFixResult> {
    const options = workingDir ? { cwd: workingDir } : {};

    try {
      // Get state before fixing
      const beforeCheck = await this.check(filePath, workingDir);

      if (beforeCheck.success) {
        return {
          success: true,
          fixed: false,
          file: filePath,
          remainingIssues: beforeCheck,
        };
      }

      // Run phpcbf
      const command = `phpcbf --standard=${this.standard} "${filePath}"`;

      try {
        execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe' });
      } catch (error: unknown) {
        const execError = error as { status?: number; message?: string };
        // phpcbf exits with 1 when fixes are made, 2 when fixes failed
        if (execError.status === 2) {
          throw new Error(`phpcbf failed: ${execError.message || 'Unknown error'}`);
        }
        // Status 1 means fixes were applied
      }

      // Check remaining issues
      const afterCheck = await this.check(filePath, workingDir);

      return {
        success: true,
        fixed: true,
        file: filePath,
        remainingIssues: afterCheck,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return {
        success: false,
        fixed: false,
        file: filePath,
        diff: `Error: ${err.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Check multiple files
   */
  async checkFiles(files: string[], workingDir?: string): Promise<WpcsCheckResult> {
    if (files.length === 0) {
      return {
        success: true,
        canCommit: true,
        totalErrors: 0,
        totalWarnings: 0,
        fixableCount: 0,
        files: [],
        summary: 'No PHP files to check.',
      };
    }

    // Run phpcs on all files at once
    const fileList = files.map((f) => `"${f}"`).join(' ');
    const command = `phpcs --standard=${this.standard} --report=json ${fileList}`;
    const options = workingDir ? { cwd: workingDir } : {};

    try {
      execSync(command, { ...options, encoding: 'utf-8', stdio: 'pipe' });

      return {
        success: true,
        canCommit: true,
        totalErrors: 0,
        totalWarnings: 0,
        fixableCount: 0,
        files: [],
        summary: `All ${files.length} PHP file(s) pass WordPress coding standards.`,
      };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; message?: string };
      const output = execError.stdout || '';

      if (!output) {
        return {
          success: false,
          canCommit: false,
          totalErrors: 1,
          totalWarnings: 0,
          fixableCount: 0,
          files: [],
          summary: `phpcs failed: ${execError.message || 'Unknown error'}`,
        };
      }

      const result: PhpcsResult = JSON.parse(output);

      const resultFiles = Object.entries(result.files).map(([path, data]) => ({
        path,
        errors: data.errors,
        warnings: data.warnings,
        messages: data.messages,
      }));

      return {
        success: false,
        canCommit: result.totals.errors === 0,
        totalErrors: result.totals.errors,
        totalWarnings: result.totals.warnings,
        fixableCount: result.totals.fixable,
        files: resultFiles,
        summary: this.formatSummary(result.totals, resultFiles.length),
      };
    }
  }

  /**
   * Fix and check workflow for pre-commit
   */
  async fixAndCheck(
    files: string[],
    workingDir?: string
  ): Promise<{
    checkResult: WpcsCheckResult;
    fixedFiles: string[];
    reStageCommand?: string;
  }> {
    const fixedFiles: string[] = [];

    // First, try to auto-fix all files
    for (const file of files) {
      const fixResult = await this.fix(file, workingDir);
      if (fixResult.fixed) {
        fixedFiles.push(file);
      }
    }

    // Then check all files
    const checkResult = await this.checkFiles(files, workingDir);

    // If files were fixed, they need to be re-staged
    const reStageCommand =
      fixedFiles.length > 0
        ? `git add ${fixedFiles.map((f) => `"${f}"`).join(' ')}`
        : undefined;

    return {
      checkResult,
      fixedFiles,
      reStageCommand,
    };
  }

  private formatSummary(
    totals: { errors: number; warnings: number; fixable: number },
    fileCount: number
  ): string {
    const parts = [];

    if (totals.errors > 0) {
      parts.push(`${totals.errors} error(s)`);
    }
    if (totals.warnings > 0) {
      parts.push(`${totals.warnings} warning(s)`);
    }

    let summary = `Found ${parts.join(' and ')} in ${fileCount} file(s).`;

    if (totals.fixable > 0) {
      summary += ` ${totals.fixable} can be auto-fixed with phpcbf.`;
    }

    if (totals.errors > 0) {
      summary += ' COMMIT BLOCKED - fix errors before committing.';
    }

    return summary;
  }
}
