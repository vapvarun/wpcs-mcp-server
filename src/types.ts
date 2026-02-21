/**
 * WPCS MCP Server - Type Definitions
 */

// ─── PHPCS Types ────────────────────────────────────────────────

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

// ─── Issue Severity ─────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

// ─── Quality Issue Types ────────────────────────────────────────

export type QualityCategory = 'hooks' | 'performance' | 'accessibility' | 'security' | 'deprecated';

export interface QualityIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  category: QualityCategory;
  message: string;
  code: string;
}

export interface QualityResult {
  issues: QualityIssue[];
  summary: {
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
}

// ─── Security Issue Types ───────────────────────────────────────

export interface SecurityIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  message: string;
  code: string;
}

export interface SecurityResult {
  issues: SecurityIssue[];
  summary: { errors: number; warnings: number };
}

// ─── Performance Issue Types ────────────────────────────────────

export interface PerformanceIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  message: string;
  code: string;
}

export interface PerformanceResult {
  issues: PerformanceIssue[];
  summary: { errors: number; warnings: number; infos: number };
}

// ─── Submission Check Types ─────────────────────────────────────

export interface SubmissionIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  message: string;
  code: string;
  category: string;
}

export interface SubmissionResult {
  issues: SubmissionIssue[];
  passed: boolean;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<string, number>;
  };
}

// ─── Report Types ───────────────────────────────────────────────

export type ReportFormat = 'json' | 'markdown' | 'summary';

export interface ReportSection {
  name: string;
  passed: boolean;
  errors: number;
  warnings: number;
  issues: Array<{
    file: string;
    line: number;
    type: IssueSeverity;
    message: string;
    code: string;
  }>;
}

export interface ReportResult {
  projectPath: string;
  projectType: string;
  timestamp: string;
  grade: string;
  sections: ReportSection[];
  totals: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

// ─── Deprecated Function Types ──────────────────────────────────

export interface DeprecatedFunction {
  name: string;
  replacement: string;
  since: string;
}

// ─── Config Types ───────────────────────────────────────────────

export interface WpcsConfig {
  standard: string;
  phpVersion: string;
  textDomain: string | null;
  exclude: string[];
  severity: {
    security: IssueSeverity;
    performance: IssueSeverity;
    accessibility: IssueSeverity;
  };
  checks: {
    security: boolean;
    performance: boolean;
    accessibility: boolean;
    submission: boolean;
    deprecated: boolean;
    phpstan: boolean;
  };
  ignore: {
    rules: string[];
    files: string[];
  };
  report: {
    format: ReportFormat;
    maxIssuesPerFile: number;
  };
}

// ─── Cache Types ────────────────────────────────────────────────

export interface CacheEntry {
  hash: string;
  timestamp: number;
  results: Record<string, unknown>;
}

export interface CacheStore {
  version: string;
  entries: Record<string, CacheEntry>;
}

// ─── Frontend Types ─────────────────────────────────────────────

export type FrontendCategory = 'html' | 'css' | 'consistency' | 'responsive' | 'naming' | 'accessibility';

export interface FrontendIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  category: FrontendCategory;
  message: string;
  code: string;
}

export interface FrontendResult {
  issues: FrontendIssue[];
  summary: {
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
  patterns: {
    classNaming: string[];
    colorFormats: string[];
    units: string[];
    fileNaming: string[];
  };
}

// ─── Code Analysis Types ────────────────────────────────────────

export type CodeCategory = 'undefined' | 'unused' | 'orphan' | 'duplicate' | 'hook-analysis';

export interface CodeIssue {
  file: string;
  line: number;
  type: IssueSeverity;
  category: CodeCategory;
  message: string;
  code: string;
}

export interface CodeAnalysisResult {
  issues: CodeIssue[];
  summary: {
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
  stats: {
    totalFunctions: number;
    totalClasses: number;
    totalHooks: number;
    definedFunctions: string[];
    calledFunctions: string[];
    registeredHooks: string[];
  };
}

// ─── Validator Types ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: Record<string, string>;
}

export type ProjectType = 'plugin' | 'theme' | 'unknown';
