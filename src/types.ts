/**
 * WPCS MCP Server - Type Definitions
 */

export interface PhpcsMessage {
  message: string;
  source: string;
  severity: number;
  fixable: boolean;
  type: 'ERROR' | 'WARNING';
  line: number;
  column: number;
}

export interface PhpcsFileResult {
  errors: number;
  warnings: number;
  messages: PhpcsMessage[];
}

export interface PhpcsResult {
  totals: {
    errors: number;
    warnings: number;
    fixable: number;
  };
  files: Record<string, PhpcsFileResult>;
}

export interface WpcsCheckResult {
  success: boolean;
  canCommit: boolean;
  totalErrors: number;
  totalWarnings: number;
  fixableCount: number;
  files: Array<{
    path: string;
    errors: number;
    warnings: number;
    messages: PhpcsMessage[];
  }>;
  summary: string;
}

export interface WpcsFixResult {
  success: boolean;
  fixed: boolean;
  file: string;
  diff?: string;
  remainingIssues?: WpcsCheckResult;
}

export interface StagedFile {
  status: string;
  path: string;
}
