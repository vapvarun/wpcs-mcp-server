# WPCS MCP Server

A Model Context Protocol (MCP) server that integrates WordPress Coding Standards (WPCS) with Claude AI. Automatically check and fix your WordPress plugin/theme code to meet WordPress.org standards.

> **Don't use Claude AI?** No problem! See [GIT-HOOKS-SETUP.md](GIT-HOOKS-SETUP.md) for standalone Git hooks, GitHub Actions, and CI/CD setup.

## One-Line Install (Git Hooks Only)

For automatic WPCS checks on every commit **without Claude AI**:

```bash
curl -sSL https://raw.githubusercontent.com/vapvarun/wpcs-mcp-server/main/scripts/install-hooks.sh | bash
```

This installs phpcs + WPCS + PHPCompatibility and sets up pre-commit hooks in your current repo.

---

## Why Use This?

If you're developing WordPress plugins or themes, your code must follow [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/) to:

- ✅ Get approved on WordPress.org plugin/theme directory
- ✅ Write consistent, readable code
- ✅ Follow security best practices
- ✅ Make your code maintainable

**This MCP server lets Claude AI automatically check and fix your PHP code against WPCS before you commit.**

---

## Requirements Checklist

Before installing, ensure you have all requirements:

| Requirement | Minimum Version | Check Command | Install Guide |
|-------------|-----------------|---------------|---------------|
| **Node.js** | 18+ | `node -v` | [nodejs.org](https://nodejs.org) |
| **PHP** | 8.2+ | `php -v` | See PHP Setup below |
| **Composer** | 2.0+ | `composer -V` | [getcomposer.org](https://getcomposer.org) |
| **Claude Desktop or Claude Code** | Latest | `claude --version` | [claude.ai](https://claude.ai) |

### PHP Setup by Platform

<details>
<summary><strong>macOS with Laravel Herd (Recommended)</strong></summary>

```bash
# Herd installs PHP at:
# ~/Library/Application Support/Herd/bin/php

# Verify Herd PHP
~/Library/Application\ Support/Herd/bin/php -v
# Should show PHP 8.2+

# Herd also provides Composer at:
# ~/Library/Application Support/Herd/bin/composer
```

</details>

<details>
<summary><strong>macOS with Homebrew</strong></summary>

```bash
# Install PHP 8.4
brew install php@8.4

# Add to PATH in ~/.zshrc
export PATH="/opt/homebrew/opt/php@8.4/bin:$PATH"

# Verify
php -v
```

</details>

<details>
<summary><strong>macOS with MAMP</strong></summary>

```bash
# MAMP PHP location
/Applications/MAMP/bin/php/php8.2.x/bin/php

# Add to PATH in ~/.zshrc
export PATH="/Applications/MAMP/bin/php/php8.2.x/bin:$PATH"
```

</details>

<details>
<summary><strong>Windows</strong></summary>

```powershell
# Install via Chocolatey
choco install php --version=8.4

# Or download from php.net and add to PATH
```

</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
sudo apt update
sudo apt install php8.2 php8.2-cli composer
```

</details>

---

## Quick Start

### Step 1: Clone & Build

```bash
git clone https://github.com/vapvarun/wpcs-mcp-server.git ~/.mcp-servers/wpcs-mcp-server
cd ~/.mcp-servers/wpcs-mcp-server
npm install --include=dev && npm run build
```

> **Important:** Use `npm install --include=dev` to ensure TypeScript compiler is available for building.

### Step 2: Install WPCS Dependencies

The server attempts auto-install, but for reliability, install manually:

```bash
# Allow the composer installer plugin
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true

# Install phpcs, WPCS, and PHPCompatibility
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

# Verify installation
~/.composer/vendor/bin/phpcs -i
# Should show: WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra, PHPCompatibility, PHPCompatibilityWP
```

### Step 3: Configure MCP Server

Choose your setup method:

---

## Configuration Options

### For Claude Code CLI (Recommended)

**Option A: Using CLI Command (Global)**

```bash
claude mcp add wpcs --scope user -- node ~/.mcp-servers/wpcs-mcp-server/build/index.js
```

Then manually add the PATH environment in `~/.claude.json`:

```json
{
  "mcpServers": {
    "wpcs": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"],
      "env": {
        "PATH": "/Users/YOUR_USERNAME/Library/Application Support/Herd/bin:/Users/YOUR_USERNAME/.composer/vendor/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

**Option B: Manual Configuration (Global)**

Add to `~/.claude.json` under the `mcpServers` key at root level:

```json
{
  "mcpServers": {
    "wpcs": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"],
      "env": {
        "PATH": "/Users/YOUR_USERNAME/Library/Application Support/Herd/bin:/Users/YOUR_USERNAME/.composer/vendor/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

**Option C: Project-Level Configuration**

Add to `~/.claude.json` under a specific project:

```json
{
  "projects": {
    "/path/to/your/wordpress-project": {
      "mcpServers": {
        "wpcs": {
          "type": "stdio",
          "command": "node",
          "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"],
          "env": {
            "PATH": "/Users/YOUR_USERNAME/Library/Application Support/Herd/bin:/Users/YOUR_USERNAME/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin"
          }
        }
      }
    }
  }
}
```

### For Claude Desktop

**macOS** - Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"],
      "env": {
        "PATH": "/Users/YOUR_USERNAME/Library/Application Support/Herd/bin:/Users/YOUR_USERNAME/.composer/vendor/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

**Windows** - Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\.mcp-servers\\wpcs-mcp-server\\build\\index.js"],
      "env": {
        "PATH": "C:\\php;C:\\Users\\YOUR_USERNAME\\AppData\\Roaming\\Composer\\vendor\\bin;%PATH%"
      }
    }
  }
}
```

---

## PATH Configuration by Setup

Choose the correct PATH based on your PHP installation:

| PHP Setup | PATH Value |
|-----------|------------|
| **Herd (macOS)** | `~/Library/Application Support/Herd/bin:~/.composer/vendor/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` |
| **Homebrew (macOS)** | `/opt/homebrew/opt/php@8.4/bin:~/.composer/vendor/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` |
| **MAMP (macOS)** | `/Applications/MAMP/bin/php/php8.2.x/bin:~/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin` |
| **System PHP (Linux)** | `~/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin` |
| **Windows** | `C:\php;C:\Users\YOU\AppData\Roaming\Composer\vendor\bin` |

> **Important:** Replace `~` with your full home path (e.g., `/Users/yourname`) in JSON configs.

---

## Step 4: Verify Installation

```bash
# Check MCP server status
claude mcp list

# Should show:
# wpcs: node ~/.mcp-servers/wpcs-mcp-server/build/index.js - ✓ Connected
```

### Test the Server Manually

```bash
cd ~/.mcp-servers/wpcs-mcp-server
PATH="YOUR_PHP_PATH:$HOME/.composer/vendor/bin:$PATH" node build/index.js

# Should output:
# Starting WPCS MCP Server...
# phpcs path: /Users/you/.composer/vendor/bin/phpcs
# Available standards: ... WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra, PHPCompatibility ...
# WPCS MCP Server running on stdio
```

---

## Available Tools

| Tool | What It Does |
|------|--------------|
| `wpcs_pre_commit` | **Most useful!** Auto-fix staged files, re-stage, report remaining issues |
| `wpcs_check_staged` | Check all staged PHP files before commit |
| `wpcs_check_file` | Check a single PHP file |
| `wpcs_check_directory` | Check all PHP files in a directory |
| `wpcs_fix_file` | Auto-fix WPCS violations in a file |
| `wpcs_check_php_compatibility` | Check PHP 8.1/8.2/8.3/8.4 compatibility |

---

## Usage Examples

Just ask Claude in natural language:

```
"Check my staged files for WPCS issues"
"Run wpcs_pre_commit before I commit"
"Fix WPCS issues in includes/class-my-plugin.php"
"Check the entire src/ directory for coding standards"
"Check PHP 8.2 compatibility for my plugin"
"Is my code compatible with PHP 8.1 to 8.4?"
```

### Typical Workflow

1. Write your WordPress plugin/theme code
2. Stage your changes: `git add .`
3. Ask Claude: **"Run wpcs_pre_commit"**
4. Claude will:
   - Auto-fix what can be fixed (spacing, formatting, etc.)
   - Re-stage the fixed files
   - Report any remaining issues that need manual fixes
5. Commit your clean code!

---

## What WPCS Checks

The `WordPress` ruleset includes:

| Standard | What It Checks |
|----------|----------------|
| **WordPress-Core** | Naming conventions, spacing, formatting, PHP compatibility |
| **WordPress-Extra** | Discouraged functions, loose comparisons, Yoda conditions |
| **WordPress-Docs** | PHPDoc comments, inline documentation |

### Common Issues It Catches:

- ❌ `if($x == true)` → ✅ `if ( true === $x )`
- ❌ Missing spaces in function calls
- ❌ Using `extract()`, `eval()`, `create_function()`
- ❌ Missing or incorrect PHPDoc blocks
- ❌ Incorrect text domain in translations
- ❌ Direct database queries without preparation

---

## PHP Compatibility Checking

Check if your code works with PHP 8.1, 8.2, 8.3, and 8.4:

```
"Check PHP 8.2 compatibility for src/"
"Is my plugin compatible with PHP 8.1-8.4?"
```

### What It Detects:

| Issue Type | Example |
|------------|---------|
| **Removed Functions** | `create_function()` removed in PHP 8.0 |
| **Deprecated Features** | `${var}` string interpolation deprecated in 8.2 |
| **New Syntax** | Named arguments require PHP 8.0+ |
| **Type Changes** | Return type changes in built-in functions |
| **Removed Constants** | `FILTER_SANITIZE_STRING` removed in 8.1 |

### Version Examples:

```
"8.1"      → Check for PHP 8.1 compatibility only
"8.2"      → Check for PHP 8.2 compatibility only
"7.4-"     → Check PHP 7.4 and all newer versions
"8.1-8.4"  → Check PHP 8.1 through 8.4 compatibility
```

WordPress.org requires **PHP 7.4+** minimum, so use `"7.4-"` to ensure broad compatibility.

---

## Add Tool Permissions (Claude Code)

Add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__wpcs__wpcs_check_staged",
      "mcp__wpcs__wpcs_check_file",
      "mcp__wpcs__wpcs_check_directory",
      "mcp__wpcs__wpcs_fix_file",
      "mcp__wpcs__wpcs_pre_commit",
      "mcp__wpcs__wpcs_check_php_compatibility"
    ]
  }
}
```

---

## Optional: Auto-Check Before Commits

Add a Claude Code hook to automatically check WPCS before every commit.

Create `~/.claude/hooks/wpcs-pre-commit.sh`:

```bash
#!/bin/bash
export PATH="$HOME/.composer/vendor/bin:$PATH"

STAGED_PHP=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.php$' || true)

if [ -z "$STAGED_PHP" ]; then
    exit 0
fi

PHP_COUNT=$(echo "$STAGED_PHP" | wc -l | tr -d ' ')
echo "WPCS: Found $PHP_COUNT staged PHP file(s). Run wpcs_pre_commit to check."
exit 0
```

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$HOME/.claude/hooks/wpcs-pre-commit.sh\""
          }
        ]
      }
    ]
  }
}
```

---

## Troubleshooting

### "Failed to connect" in `claude mcp list`

**Most common cause:** Wrong PHP version in PATH.

```bash
# Check which PHP the MCP server sees
cd ~/.mcp-servers/wpcs-mcp-server
PATH="YOUR_CONFIG_PATH" node build/index.js 2>&1 | head -5

# If you see "PHP Fatal error: Composer detected issues... require PHP >= 8.2"
# Your PATH doesn't include PHP 8.2+
```

**Fix:** Update the PATH in your MCP config to include your PHP 8.2+ binary directory FIRST.

### "phpcs not found"

```bash
# Install manually
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

# Verify
~/.composer/vendor/bin/phpcs --version
```

### "WordPress standard not found"

```bash
# Check available standards
~/.composer/vendor/bin/phpcs -i

# If WordPress not listed, reinstall:
composer global remove wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
composer global require wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
```

### Build fails with "tsc: command not found"

```bash
cd ~/.mcp-servers/wpcs-mcp-server
rm -rf node_modules
npm install --include=dev
npm run build
```

### "Auto-install failed" on server startup

This happens when:
1. PHP version is too old (need 8.2+)
2. Composer version is too old (need 2.0+)
3. Network issues

**Fix:** Install dependencies manually (see Step 2 above).

### MCP server not loading in Claude Desktop

1. Verify the path in your config uses absolute paths (no `~`)
2. Ensure you ran `npm run build`
3. Restart Claude Desktop completely (quit and reopen)
4. Check the path exists: `ls -la ~/.mcp-servers/wpcs-mcp-server/build/index.js`

---

## Development

```bash
git clone https://github.com/vapvarun/wpcs-mcp-server.git
cd wpcs-mcp-server
npm install --include=dev
npm run build

# Watch mode for development
npm run dev
```

---

## Complete Setup Checklist

Use this checklist to ensure everything is configured correctly:

- [ ] **Node.js 18+** installed (`node -v`)
- [ ] **PHP 8.2+** installed and in PATH (`php -v`)
- [ ] **Composer 2.0+** installed (`composer -V`)
- [ ] **Repository cloned** to `~/.mcp-servers/wpcs-mcp-server`
- [ ] **Built with dev dependencies** (`npm install --include=dev && npm run build`)
- [ ] **WPCS installed globally** via Composer
- [ ] **phpcs shows WordPress standards** (`~/.composer/vendor/bin/phpcs -i`)
- [ ] **MCP config added** to `~/.claude.json` or Claude Desktop config
- [ ] **PATH includes PHP binary directory** in MCP env config
- [ ] **PATH includes composer/vendor/bin** in MCP env config
- [ ] **Server shows Connected** (`claude mcp list`)

---

## License

GPL-2.0-or-later

## Author

**Varun Dubey** ([@vapvarun](https://github.com/vapvarun))
- Website: [wbcomdesigns.com](https://wbcomdesigns.com)
- Email: varun@wbcomdesigns.com

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [WordPress Coding Standards](https://github.com/WordPress/WordPress-Coding-Standards)
- [PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer)
- [Model Context Protocol](https://modelcontextprotocol.io/)
