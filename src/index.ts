#!/usr/bin/env node

/**
 * WPCS MCP Server - Entry Point
 * WordPress Coding Standards checker for Claude AI
 *
 * @author Varun Dubey (vapvarun) <varun@wbcomdesigns.com>
 * @license GPL-2.0-or-later
 */

import { WpcsMcpServer } from './server.js';
import { checkPhpcsInstalled, checkWpcsInstalled, autoInstallWpcs, ensureComposerInPath } from './utils.js';

async function main() {
  // Ensure composer bin is in PATH
  ensureComposerInPath();

  // Check if phpcs is installed
  let phpcsCheck = checkPhpcsInstalled();
  let wpcsCheck = checkWpcsInstalled();

  // Auto-install if not found
  if (!phpcsCheck.installed || !wpcsCheck.installed) {
    console.error('WPCS dependencies not found. Attempting auto-install...');

    const installResult = await autoInstallWpcs();

    if (!installResult.success) {
      console.error('Auto-install failed:', installResult.message);
      console.error('\nManual installation:');
      console.error('  composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true');
      console.error('  composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer');
      console.error('  export PATH="$HOME/.composer/vendor/bin:$PATH"');
      process.exit(1);
    }

    console.error(installResult.message);

    // Re-check after installation
    phpcsCheck = checkPhpcsInstalled();
    wpcsCheck = checkWpcsInstalled();

    if (!phpcsCheck.installed || !wpcsCheck.installed) {
      console.error('Installation completed but verification failed.');
      console.error('Please add composer bin to your PATH: export PATH="$HOME/.composer/vendor/bin:$PATH"');
      process.exit(1);
    }
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
