/**
 * WPCS MCP Server - Report Generator
 * Generates JSON, Markdown, or summary reports.
 */
import type { ReportFormat, ReportResult, ReportSection, IssueSeverity } from './types.js';
/**
 * Generate a report from collected sections.
 */
export declare function generateReport(projectPath: string, projectType: string, sections: ReportSection[], format: ReportFormat, outputFile?: string): {
    content: string;
    report: ReportResult;
};
/**
 * Helper to build a report section from a generic checker result.
 */
export declare function buildSection(name: string, issues: Array<{
    file: string;
    line: number;
    type: IssueSeverity;
    message: string;
    code: string;
}>): ReportSection;
