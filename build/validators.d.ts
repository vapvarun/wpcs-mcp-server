/**
 * WPCS MCP Server - Validators
 * Lightweight checks for plugin/theme headers, readme, i18n, and new v2.0 validations
 * No external dependencies - pure file analysis
 */
import type { ValidationResult, ProjectType } from './types.js';
/**
 * Detect project type
 */
export declare function detectProjectType(projectPath: string): ProjectType;
/**
 * Validate plugin headers
 */
export declare function validatePluginHeaders(projectPath: string): ValidationResult;
/**
 * Validate theme headers
 */
export declare function validateThemeHeaders(projectPath: string): ValidationResult;
/**
 * Validate readme.txt
 */
export declare function validateReadme(projectPath: string): ValidationResult;
/**
 * Check text domain consistency
 */
export declare function validateTextDomain(projectPath: string, expectedDomain?: string): ValidationResult;
/**
 * Validate .pot file exists and is valid
 */
export declare function validatePotFile(projectPath: string, textDomain?: string): ValidationResult;
/**
 * Validate stable tag matches plugin version
 */
export declare function validateStableTagMatch(projectPath: string): ValidationResult;
/**
 * Validate GPL license presence
 */
export declare function validateGplLicense(projectPath: string): ValidationResult;
/**
 * Validate uninstall cleanup mechanism exists
 */
export declare function validateUninstallCleanup(projectPath: string): ValidationResult;
