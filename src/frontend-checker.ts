/**
 * WPCS MCP Server - Frontend Consistency Checker
 * HTML, CSS, file naming, responsive design, accessibility checks
 */

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { FrontendIssue, FrontendResult, FrontendCategory, IssueSeverity } from './types.js';
import { findFilesByExt, findAllCodeFiles, getLineNumber as sharedGetLineNumber, findPatternLine as sharedFindPatternLine } from './shared-utils.js';

/**
 * Run frontend consistency checks
 */
export function runFrontendChecks(projectPath: string): FrontendResult {
  const issues: FrontendIssue[] = [];
  const patterns = {
    classNaming: [] as string[],
    colorFormats: [] as string[],
    units: [] as string[],
    fileNaming: [] as string[],
  };

  // Check file naming consistency
  issues.push(...checkFileNaming(projectPath, patterns));

  // Check PHP files for inline HTML
  const phpFiles = findFiles(projectPath, '.php');
  for (const file of phpFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    issues.push(...checkHtmlInPhp(relativePath, content));
    detectPatterns(content, patterns);
  }

  // Check CSS files
  const cssFiles = findFiles(projectPath, '.css');
  for (const file of cssFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    issues.push(...checkCssPatterns(relativePath, content));
    issues.push(...checkResponsiveDesign(relativePath, content));
    detectCssPatterns(content, patterns);
  }

  // Check SCSS files
  const scssFiles = findFiles(projectPath, '.scss');
  for (const file of scssFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    issues.push(...checkScssPatterns(relativePath, content));
    issues.push(...checkResponsiveDesign(relativePath, content));
  }

  // Check JS files
  const jsFiles = findFiles(projectPath, '.js');
  for (const file of jsFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    issues.push(...checkJsPatterns(relativePath, content));
  }

  // Analyze consistency across files
  issues.push(...analyzeConsistency(patterns, projectPath));

  // Accessibility checks (new v2.0)
  for (const file of phpFiles) {
    const relativePath = file.replace(projectPath + '/', '');
    const content = readFileSync(file, 'utf-8');
    issues.push(...checkAccessibilityPatterns(relativePath, content));
  }

  // Calculate summary
  const summary = {
    errors: issues.filter(i => i.type === 'error').length,
    warnings: issues.filter(i => i.type === 'warning').length,
    byCategory: {} as Record<string, number>,
  };

  for (const issue of issues) {
    summary.byCategory[issue.category] = (summary.byCategory[issue.category] || 0) + 1;
  }

  return { issues, summary, patterns };
}

/**
 * Check file naming consistency
 */
function checkFileNaming(projectPath: string, patterns: FrontendResult['patterns']): FrontendIssue[] {
  const issues: FrontendIssue[] = [];
  const allFiles = findAllFiles(projectPath);

  const namingStyles: Record<string, string[]> = {
    'kebab-case': [],
    'snake_case': [],
    'camelCase': [],
    'PascalCase': [],
    'class-prefix': [], // class-*.php
    'mixed': [],
  };

  for (const file of allFiles) {
    const name = basename(file).replace(/\.[^.]+$/, '');

    // WordPress class file convention (class-*.php)
    if (/^class-[\w-]+$/.test(name)) {
      namingStyles['class-prefix'].push(name);
      patterns.fileNaming.push('class-prefix');
    }
    // kebab-case
    else if (/^[a-z]+(-[a-z0-9]+)*$/.test(name)) {
      namingStyles['kebab-case'].push(name);
      patterns.fileNaming.push('kebab-case');
    }
    // snake_case
    else if (/^[a-z]+(_[a-z0-9]+)*$/.test(name)) {
      namingStyles['snake_case'].push(name);
      patterns.fileNaming.push('snake_case');
    }
    // camelCase
    else if (/^[a-z]+[a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) {
      namingStyles['camelCase'].push(name);
      patterns.fileNaming.push('camelCase');
    }
    // PascalCase
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      namingStyles['PascalCase'].push(name);
      patterns.fileNaming.push('PascalCase');
    }
    // Mixed or other
    else if (name.includes('-') && name.includes('_')) {
      namingStyles['mixed'].push(name);
      patterns.fileNaming.push('mixed');
    }
  }

  // Check for mixed naming (excluding class- prefix which is WP standard)
  const usedStyles = Object.entries(namingStyles)
    .filter(([style, files]) => files.length > 0 && style !== 'class-prefix')
    .map(([style, files]) => `${style}(${files.length})`);

  if (usedStyles.length > 2) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'naming',
      message: `Inconsistent file naming: ${usedStyles.join(', ')}. WordPress recommends kebab-case.`,
      code: 'mixed-file-naming',
    });
  }

  // Check for files with mixed separators
  if (namingStyles['mixed'].length > 0) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'naming',
      message: `Files with mixed separators: ${namingStyles['mixed'].slice(0, 5).join(', ')}${namingStyles['mixed'].length > 5 ? '...' : ''}`,
      code: 'mixed-separators',
    });
  }

  return issues;
}

/**
 * Check HTML patterns in PHP files
 */
function checkHtmlInPhp(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // Inline styles (should use classes)
  const inlineStylePattern = /style\s*=\s*["'][^"']{20,}["']/gi;
  let match;
  while ((match = inlineStylePattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'html',
      message: 'Long inline style detected. Consider using CSS classes instead.',
      code: 'inline-style',
    });
  }

  // Deprecated HTML tags
  const deprecatedTags = /<(font|center|marquee|blink|strike|big|tt)\b/gi;
  while ((match = deprecatedTags.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'error',
      category: 'html',
      message: `Deprecated HTML tag <${match[1]}>. Use CSS for styling.`,
      code: 'deprecated-tag',
    });
  }

  // Missing semantic elements
  const divSoupPattern = /<div[^>]*class\s*=\s*["'][^"']*(header|footer|nav|main|aside|article|section)[^"']*["']/gi;
  while ((match = divSoupPattern.exec(content)) !== null) {
    const semanticElement = match[1].toLowerCase();
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'html',
      message: `Consider using <${semanticElement}> element instead of <div class="${semanticElement}">`,
      code: 'missing-semantic',
    });
  }

  // onclick handlers (should use addEventListener)
  const onclickPattern = /\bonclick\s*=\s*["'][^"']+["']/gi;
  while ((match = onclickPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'html',
      message: 'Inline onclick handler. Use addEventListener() for better separation.',
      code: 'inline-handler',
    });
  }

  // Empty href="#" or href="javascript:"
  const emptyHrefPattern = /href\s*=\s*["'](?:#|javascript:void\(0\)|javascript:;?)["']/gi;
  while ((match = emptyHrefPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'html',
      message: 'Empty href="#" or javascript:. Use <button> for actions.',
      code: 'empty-href',
    });
  }

  // Inconsistent class naming
  const classPattern = /class\s*=\s*["']([^"']+)["']/gi;
  const classStyles: Set<string> = new Set();

  while ((match = classPattern.exec(content)) !== null) {
    const classes = match[1].split(/\s+/);
    for (const cls of classes) {
      if (cls.includes('__') || cls.includes('--')) classStyles.add('BEM');
      else if (/^[a-z]+[A-Z]/.test(cls)) classStyles.add('camelCase');
      else if (cls.includes('-')) classStyles.add('kebab-case');
      else if (cls.includes('_') && !cls.includes('__')) classStyles.add('snake_case');
    }
  }

  if (classStyles.size > 2) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'consistency',
      message: `Mixed class naming: ${Array.from(classStyles).join(', ')}. Pick one style.`,
      code: 'mixed-class-naming',
    });
  }

  // Duplicate IDs
  const idPattern = /id\s*=\s*["']([^"']+)["']/gi;
  const ids: string[] = [];
  while ((match = idPattern.exec(content)) !== null) {
    ids.push(match[1]);
  }

  const duplicateIds = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (duplicateIds.length > 0) {
    issues.push({
      file,
      line: 1,
      type: 'error',
      category: 'html',
      message: `Duplicate IDs: ${[...new Set(duplicateIds)].join(', ')}. IDs must be unique.`,
      code: 'duplicate-id',
    });
  }

  return issues;
}

/**
 * Check CSS patterns
 */
function checkCssPatterns(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // !important overuse
  const importantCount = (content.match(/!important/gi) || []).length;
  if (importantCount > 5) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'css',
      message: `${importantCount} !important declarations. Refactor specificity instead.`,
      code: 'important-overuse',
    });
  }

  // Missing vendor prefixes for common properties
  const prefixableProperties = [
    { prop: 'transform', prefixes: ['-webkit-', '-ms-'] },
    { prop: 'transition', prefixes: ['-webkit-'] },
    { prop: 'flex', prefixes: ['-webkit-', '-ms-'] },
    { prop: 'animation', prefixes: ['-webkit-'] },
    { prop: 'user-select', prefixes: ['-webkit-', '-moz-', '-ms-'] },
    { prop: 'appearance', prefixes: ['-webkit-', '-moz-'] },
  ];

  for (const { prop, prefixes } of prefixableProperties) {
    const propRegex = new RegExp(`(?<!-)${prop}\\s*:`, 'gi');
    let match;
    while ((match = propRegex.exec(content)) !== null) {
      const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index);
      const missingPrefixes = prefixes.filter(p => !surroundingCode.includes(`${p}${prop}`));

      if (missingPrefixes.length === prefixes.length) {
        issues.push({
          file,
          line: getLineNumber(content, match.index),
          type: 'warning',
          category: 'css',
          message: `${prop} without vendor prefixes. Consider adding: ${missingPrefixes.map(p => p + prop).join(', ')}`,
          code: 'missing-vendor-prefix',
        });
      }
    }
  }

  // Vendor prefix without standard property
  const vendorPrefixPattern = /(-webkit-|-moz-|-ms-|-o-)([\w-]+)\s*:/g;
  let match;
  while ((match = vendorPrefixPattern.exec(content)) !== null) {
    const standardProperty = match[2];
    const afterMatch = content.substring(match.index, match.index + 300);
    const standardRegex = new RegExp(`(?<!-)${standardProperty}\\s*:`);

    if (!standardRegex.test(afterMatch)) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'css',
        message: `Vendor prefix ${match[1]}${match[2]} without standard property.`,
        code: 'missing-standard-property',
      });
    }
  }

  // Inconsistent color formats
  const hexColors = (content.match(/#[0-9a-fA-F]{3,6}\b/g) || []).length;
  const rgbColors = (content.match(/rgba?\(/gi) || []).length;
  const hslColors = (content.match(/hsla?\(/gi) || []).length;

  const colorFormats = [];
  if (hexColors > 0) colorFormats.push(`hex(${hexColors})`);
  if (rgbColors > 0) colorFormats.push(`rgb(${rgbColors})`);
  if (hslColors > 0) colorFormats.push(`hsl(${hslColors})`);

  if (colorFormats.length > 2) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'consistency',
      message: `Mixed color formats: ${colorFormats.join(', ')}. Standardize.`,
      code: 'mixed-color-format',
    });
  }

  // Magic numbers
  const magicNumberPattern = /:\s*(\d{3,}(?:px)?)\s*[;}\n]/g;
  let magicCount = 0;
  while ((match = magicNumberPattern.exec(content)) !== null) {
    if (!['100%', '100vh', '100vw'].includes(match[1])) {
      magicCount++;
    }
  }
  if (magicCount > 10) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'css',
      message: `Many magic numbers. Consider CSS custom properties (--variable).`,
      code: 'magic-numbers',
    });
  }

  // Duplicate selectors
  const selectorPattern = /^([.#]?[\w-]+(?:\s+[.#]?[\w-]+)*)\s*\{/gm;
  const selectors: Map<string, number[]> = new Map();

  while ((match = selectorPattern.exec(content)) !== null) {
    const selector = match[1].trim();
    const lineNum = getLineNumber(content, match.index);
    const existing = selectors.get(selector) || [];
    existing.push(lineNum);
    selectors.set(selector, existing);
  }

  for (const [selector, lines] of selectors) {
    if (lines.length > 1) {
      issues.push({
        file,
        line: lines[0],
        type: 'warning',
        category: 'css',
        message: `Duplicate selector "${selector}" on lines ${lines.join(', ')}.`,
        code: 'duplicate-selector',
      });
    }
  }

  // Deep nesting (specificity)
  const deepSelectorPattern = /^((?:[.#]?[\w-]+\s+){4,}[.#]?[\w-]+)\s*\{/gm;
  while ((match = deepSelectorPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'css',
      message: `Deep selector (${match[1].split(/\s+/).length} levels). Simplify.`,
      code: 'deep-selector',
    });
  }

  // ID selector overuse
  let idSelectorCount = (content.match(/^#[\w-]+\s*\{/gm) || []).length;
  if (idSelectorCount > 5) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'css',
      message: `${idSelectorCount} ID selectors. Prefer class selectors.`,
      code: 'id-selector-overuse',
    });
  }

  return issues;
}

/**
 * Check responsive design patterns
 */
function checkResponsiveDesign(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // Check for media queries
  const hasMediaQueries = /@media\s*\(/gi.test(content);
  const lineCount = content.split('\n').length;

  // If substantial CSS but no media queries
  if (lineCount > 100 && !hasMediaQueries) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'responsive',
      message: 'No media queries found. Consider adding responsive breakpoints.',
      code: 'no-media-queries',
    });
  }

  // Check for common responsive issues
  let match;

  // Fixed widths in pixels (should be max-width or %)
  const fixedWidthPattern = /(?<!max-|min-)width\s*:\s*(\d{3,})px/gi;
  while ((match = fixedWidthPattern.exec(content)) !== null) {
    const width = parseInt(match[1], 10);
    if (width > 320) {
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'responsive',
        message: `Fixed width ${width}px may cause overflow. Consider max-width or percentage.`,
        code: 'fixed-width',
      });
    }
  }

  // Fixed heights (can cause issues)
  const fixedHeightPattern = /(?<!max-|min-|line-)height\s*:\s*(\d{3,})px/gi;
  while ((match = fixedHeightPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'warning',
      category: 'responsive',
      message: 'Fixed height may cause content overflow on small screens.',
      code: 'fixed-height',
    });
  }

  // Check for viewport units (good)
  const hasViewportUnits = /\d+v[wh]/gi.test(content);

  // Check for clamp/min/max (modern responsive)
  const hasClamp = /clamp\s*\(|min\s*\(|max\s*\(/gi.test(content);

  // Check for flexbox/grid (good responsive patterns)
  const hasFlexbox = /display\s*:\s*flex/gi.test(content);
  const hasGrid = /display\s*:\s*grid/gi.test(content);

  // Missing mobile-first approach (using max-width instead of min-width)
  const maxWidthQueries = (content.match(/@media[^{]*max-width/gi) || []).length;
  const minWidthQueries = (content.match(/@media[^{]*min-width/gi) || []).length;

  if (maxWidthQueries > 0 && minWidthQueries === 0) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'responsive',
      message: 'Using max-width queries (desktop-first). Consider min-width (mobile-first).',
      code: 'desktop-first',
    });
  }

  // Inconsistent breakpoints
  const breakpointPattern = /@media[^{]*(?:min|max)-width\s*:\s*(\d+)px/gi;
  const breakpoints: number[] = [];
  while ((match = breakpointPattern.exec(content)) !== null) {
    breakpoints.push(parseInt(match[1], 10));
  }

  const uniqueBreakpoints = [...new Set(breakpoints)];
  if (uniqueBreakpoints.length > 6) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'responsive',
      message: `${uniqueBreakpoints.length} different breakpoints. Standardize to 3-5 breakpoints.`,
      code: 'too-many-breakpoints',
    });
  }

  // Check for missing touch-friendly sizing
  const smallTouchTargets = /(?:width|height)\s*:\s*([12]\d|[1-9])px/gi;
  while ((match = smallTouchTargets.exec(content)) !== null) {
    const size = parseInt(match[1], 10);
    if (size < 44) {
      // 44px is recommended minimum
      issues.push({
        file,
        line: getLineNumber(content, match.index),
        type: 'warning',
        category: 'responsive',
        message: `Small touch target (${size}px). Minimum recommended is 44px.`,
        code: 'small-touch-target',
      });
    }
  }

  // Check for overflow handling
  const hasOverflowHandling = /overflow(?:-x|-y)?\s*:\s*(?:auto|scroll|hidden)/gi.test(content);
  if (lineCount > 100 && !hasOverflowHandling) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'responsive',
      message: 'No overflow handling found. Consider handling overflow for mobile.',
      code: 'no-overflow-handling',
    });
  }

  return issues;
}

/**
 * Check SCSS specific patterns
 */
function checkScssPatterns(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // Deep nesting
  const lines = content.split('\n');
  let maxNesting = 0;
  let currentNesting = 0;
  let deepNestingLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    currentNesting += opens - closes;

    if (currentNesting > maxNesting) {
      maxNesting = currentNesting;
      deepNestingLine = i + 1;
    }
  }

  if (maxNesting > 4) {
    issues.push({
      file,
      line: deepNestingLine,
      type: 'warning',
      category: 'css',
      message: `Deep SCSS nesting (${maxNesting} levels). Keep under 3-4.`,
      code: 'deep-scss-nesting',
    });
  }

  // @extend overuse
  const extendCount = (content.match(/@extend\s/g) || []).length;
  if (extendCount > 3) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'css',
      message: `${extendCount} @extend usages. Consider @mixin instead.`,
      code: 'extend-overuse',
    });
  }

  return issues;
}

/**
 * Check JavaScript patterns
 */
function checkJsPatterns(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // document.write
  if (/document\.write\s*\(/i.test(content)) {
    const lineNum = findPatternLine(content.split('\n'), /document\.write/);
    issues.push({
      file,
      line: lineNum,
      type: 'error',
      category: 'html',
      message: 'Avoid document.write(). It blocks parsing.',
      code: 'document-write',
    });
  }

  // innerHTML with dynamic content
  const innerHtmlPattern = /\.innerHTML\s*=\s*[^;]*(\$|user|input|data|response)/gi;
  let match;
  while ((match = innerHtmlPattern.exec(content)) !== null) {
    issues.push({
      file,
      line: getLineNumber(content, match.index),
      type: 'error',
      category: 'html',
      message: 'innerHTML with dynamic content. Sanitize or use textContent.',
      code: 'innerHTML-xss',
    });
  }

  // Mixed jQuery and vanilla
  const hasJquery = /\$\s*\(|jQuery\s*\(/i.test(content);
  const hasVanilla = /document\.querySelector|document\.getElementById/i.test(content);

  if (hasJquery && hasVanilla) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'consistency',
      message: 'Mixed jQuery and vanilla DOM methods. Pick one.',
      code: 'mixed-dom-methods',
    });
  }

  // Hardcoded colors in JS
  let colorCount = (content.match(/['"]#[0-9a-fA-F]{3,6}['"]|['"]rgb\(/gi) || []).length;
  if (colorCount > 3) {
    issues.push({
      file,
      line: 1,
      type: 'warning',
      category: 'consistency',
      message: `${colorCount} hardcoded colors in JS. Use CSS variables.`,
      code: 'hardcoded-colors-js',
    });
  }

  return issues;
}

/**
 * Detect patterns for cross-file consistency
 */
function detectPatterns(content: string, patterns: FrontendResult['patterns']): void {
  const classPattern = /class\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = classPattern.exec(content)) !== null) {
    const classes = match[1].split(/\s+/);
    for (const cls of classes) {
      if (cls.includes('__')) patterns.classNaming.push('BEM');
      else if (/^[a-z]+[A-Z]/.test(cls)) patterns.classNaming.push('camelCase');
      else if (cls.includes('-')) patterns.classNaming.push('kebab-case');
    }
  }
}

/**
 * Detect CSS patterns
 */
function detectCssPatterns(content: string, patterns: FrontendResult['patterns']): void {
  if (/#[0-9a-fA-F]{3,6}\b/.test(content)) patterns.colorFormats.push('hex');
  if (/rgba?\(/i.test(content)) patterns.colorFormats.push('rgb');
  if (/hsla?\(/i.test(content)) patterns.colorFormats.push('hsl');

  if (/\d+px/.test(content)) patterns.units.push('px');
  if (/\d+(?:\.\d+)?rem/.test(content)) patterns.units.push('rem');
  if (/\d+(?:\.\d+)?em/.test(content)) patterns.units.push('em');
}

/**
 * Analyze cross-file consistency
 */
function analyzeConsistency(patterns: FrontendResult['patterns'], projectPath: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];

  // Class naming consistency
  const namingCounts = patterns.classNaming.reduce((acc, n) => {
    acc[n] = (acc[n] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (Object.keys(namingCounts).length > 2) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'consistency',
      message: `Mixed class naming: ${Object.entries(namingCounts).map(([s, c]) => `${s}(${c})`).join(', ')}`,
      code: 'project-class-naming',
    });
  }

  // Color format consistency
  const colorCounts = patterns.colorFormats.reduce((acc, c) => {
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (Object.keys(colorCounts).length > 2) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'consistency',
      message: `Mixed color formats: ${Object.entries(colorCounts).map(([f, c]) => `${f}(${c})`).join(', ')}`,
      code: 'project-color-format',
    });
  }

  // Unit consistency
  const unitCounts = patterns.units.reduce((acc, u) => {
    acc[u] = (acc[u] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (unitCounts['px'] > 20 && unitCounts['rem'] > 20) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'consistency',
      message: `Heavy px(${unitCounts['px']}) and rem(${unitCounts['rem']}) mix. Standardize.`,
      code: 'project-unit-mix',
    });
  }

  // File naming consistency
  const fileNameCounts = patterns.fileNaming.reduce((acc, n) => {
    acc[n] = (acc[n] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const nonClassStyles = Object.entries(fileNameCounts).filter(([style]) => style !== 'class-prefix');
  if (nonClassStyles.length > 2) {
    issues.push({
      file: 'project-wide',
      line: 0,
      type: 'warning',
      category: 'naming',
      message: `Mixed file naming: ${nonClassStyles.map(([s, c]) => `${s}(${c})`).join(', ')}`,
      code: 'project-file-naming',
    });
  }

  return issues;
}

// ─── Accessibility Pattern Checks (v2.0) ────────────────────────

const VALID_ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell',
  'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo',
  'definition', 'dialog', 'directory', 'document', 'feed', 'figure', 'form',
  'grid', 'gridcell', 'group', 'heading', 'img', 'link', 'list', 'listbox',
  'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
  'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row',
  'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
  'slider', 'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist',
  'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree',
  'treegrid', 'treeitem',
]);

function checkAccessibilityPatterns(file: string, content: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];
  let match;

  // 1. ARIA role validation
  const rolePattern = /role\s*=\s*["']([^"']+)["']/gi;
  while ((match = rolePattern.exec(content)) !== null) {
    const role = match[1].trim().toLowerCase();
    if (!VALID_ARIA_ROLES.has(role)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        category: 'accessibility',
        message: `Invalid ARIA role "${role}". Check WAI-ARIA specification.`,
        code: 'invalid-aria-role',
      });
    }
  }

  // 2. Heading hierarchy - detect skipped levels
  const headingPattern = /<h([1-6])\b/gi;
  const headingLevels: { level: number; index: number }[] = [];
  while ((match = headingPattern.exec(content)) !== null) {
    headingLevels.push({ level: parseInt(match[1], 10), index: match.index });
  }
  for (let i = 1; i < headingLevels.length; i++) {
    const prev = headingLevels[i - 1].level;
    const curr = headingLevels[i].level;
    if (curr > prev + 1) {
      issues.push({
        file, line: getLineNumber(content, headingLevels[i].index), type: 'warning',
        category: 'accessibility',
        message: `Skipped heading level: <h${prev}> to <h${curr}>. Use sequential headings.`,
        code: 'heading-hierarchy-skip',
      });
    }
  }

  // 3. Skip link check (template files)
  const isTemplate = /get_header|get_footer|wp_head|<!DOCTYPE/i.test(content);
  if (isTemplate && /<body/i.test(content)) {
    if (!/skip.*content|skip.*nav|skip.*main/i.test(content)) {
      issues.push({
        file, line: 1, type: 'warning',
        category: 'accessibility',
        message: 'Template missing skip-to-content link for keyboard navigation.',
        code: 'missing-skip-link',
      });
    }
  }

  // 4. Form label association
  const inputPattern = /<input\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = inputPattern.exec(content)) !== null) {
    const inputId = match[1];
    const inputTag = match[0];
    // Skip hidden inputs and submit/button types
    if (/type\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(inputTag)) continue;
    // Check for matching label or aria-label/aria-labelledby
    if (/aria-label\s*=|aria-labelledby\s*=/i.test(inputTag)) continue;
    const labelPattern = new RegExp(`<label[^>]*for\\s*=\\s*["']${inputId}["']`, 'i');
    if (!labelPattern.test(content)) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'error',
        category: 'accessibility',
        message: `Input #${inputId} has no associated <label for="${inputId}"> or aria-label.`,
        code: 'input-missing-label',
      });
    }
  }

  // 5. Button type
  const buttonPattern = /<button(?:\s[^>]*)?>|<button>/gi;
  while ((match = buttonPattern.exec(content)) !== null) {
    if (!/type\s*=\s*["'](?:button|submit|reset)["']/i.test(match[0])) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        category: 'accessibility',
        message: '<button> without explicit type. Add type="button" or type="submit".',
        code: 'button-missing-type',
      });
    }
  }

  // 6. Tabindex misuse
  const tabindexPattern = /tabindex\s*=\s*["'](\d+)["']/gi;
  while ((match = tabindexPattern.exec(content)) !== null) {
    const value = parseInt(match[1], 10);
    if (value > 0) {
      issues.push({
        file, line: getLineNumber(content, match.index), type: 'warning',
        category: 'accessibility',
        message: `tabindex="${value}" disrupts natural tab order. Use 0 or -1 only.`,
        code: 'positive-tabindex',
      });
    }
  }

  return issues;
}

/**
 * Helper: Get line number
 */
function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

/**
 * Helper: Find line of pattern
 */
function findPatternLine(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return 1;
}

/**
 * Helper: Find files by extension
 */
function findFiles(dir: string, ext: string, files: string[] = []): string[] {
  const excludeDirs = ['vendor', 'node_modules', 'build', 'dist', '.git'];

  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        if (!excludeDirs.includes(item.name)) findFiles(fullPath, ext, files);
      } else if (item.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore */ }

  return files;
}

/**
 * Helper: Find all code files
 */
function findAllFiles(dir: string, files: string[] = []): string[] {
  const excludeDirs = ['vendor', 'node_modules', 'build', 'dist', '.git'];
  const codeExts = ['.php', '.js', '.css', '.scss', '.ts', '.jsx', '.tsx'];

  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        if (!excludeDirs.includes(item.name)) findAllFiles(fullPath, files);
      } else if (codeExts.some(ext => item.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore */ }

  return files;
}
