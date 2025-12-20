#!/usr/bin/env node

/**
 * WPCS MCP Server - Entry Point
 * WordPress Coding Standards checker for Claude AI
 *
 * @author Varun Dubey (vapvarun) <varun@wbcomdesigns.com>
 * @license GPL-2.0-or-later
 */

import { WpcsMcpServer } from './server.js';
import {
  checkPhpcsInstalled,
  checkWpcsInstalled,
  checkPhpVersion,
  autoInstallWpcs,
  setupEnvironmentPath,
} from './utils.js';

async function main() {
  // Setup environment PATH (auto-detects PHP from common locations)
  const envSetup = setupEnvironmentPath();

  if (envSetup.warnings.length > 0) {
    console.error('Environment warnings:');
    envSetup.warnings.forEach((w) => console.error(`  - ${w}`));
  }

  // Check PHP version first (critical requirement)
  const phpCheck = checkPhpVersion();
  if (!phpCheck.valid) {
    console.error('\n❌ PHP Version Error');
    console.error('━'.repeat(50));
    console.error(phpCheck.error);
    console.error('\nTo fix this, update your MCP config with the correct PHP path:');
    console.error('\nFor Laravel Herd (macOS):');
    console.error('  "env": {');
    console.error('    "PATH": "$HOME/Library/Application Support/Herd/bin:$HOME/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin"');
    console.error('  }');
    console.error('\nFor Homebrew (macOS):');
    console.error('  "env": {');
    console.error('    "PATH": "/opt/homebrew/opt/php@8.4/bin:$HOME/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin"');
    console.error('  }');
    console.error('\nNote: Replace $HOME with your actual home directory path in JSON configs.');
    process.exit(1);
  }

  console.error(`PHP ${phpCheck.version} detected at ${phpCheck.path}`);

  // Check if phpcs is installed
  let phpcsCheck = checkPhpcsInstalled();
  let wpcsCheck = checkWpcsInstalled();

  // Auto-install if not found
  if (!phpcsCheck.installed || !wpcsCheck.installed) {
    console.error('WPCS dependencies not found. Attempting auto-install...');

    const installResult = await autoInstallWpcs();

    if (!installResult.success) {
      console.error('\n❌ Auto-install Failed');
      console.error('━'.repeat(50));
      console.error(installResult.message);
      console.error('\n📋 Manual Installation Steps:');
      console.error('  1. composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true');
      console.error('  2. composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer');
      console.error('  3. Verify: ~/.composer/vendor/bin/phpcs -i');
      console.error('\n📋 MCP Config PATH:');
      console.error('  Make sure your MCP config includes ~/.composer/vendor/bin in PATH');
      process.exit(1);
    }

    console.error('✅ ' + installResult.message);

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
