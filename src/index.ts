#!/usr/bin/env node

/**
 * WPCS MCP Server - Entry Point
 * WordPress Coding Standards checker for Claude AI
 *
 * @author Varun Dubey (vapvarun) <varun@wbcomdesigns.com>
 * @license GPL-2.0-or-later
 */

import { WpcsMcpServer } from './server.js';
import { checkPhpcsInstalled, checkWpcsInstalled } from './utils.js';

async function main() {
  // Verify dependencies
  const phpcsCheck = checkPhpcsInstalled();
  if (!phpcsCheck.installed) {
    console.error('ERROR: phpcs not found');
    console.error(phpcsCheck.error);
    console.error('\nInstallation:');
    console.error('  composer global require squizlabs/php_codesniffer');
    console.error('  composer global require wp-coding-standards/wpcs');
    process.exit(1);
  }

  const wpcsCheck = checkWpcsInstalled();
  if (!wpcsCheck.installed) {
    console.error('ERROR: WordPress coding standard not found');
    console.error(wpcsCheck.error);
    process.exit(1);
  }

  console.error('Starting WPCS MCP Server...');
  console.error('phpcs path:', phpcsCheck.path);
  console.error('Available standards:', wpcsCheck.standards?.join(', '));

  const server = new WpcsMcpServer();
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
