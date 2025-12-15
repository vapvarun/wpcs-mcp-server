# WPCS MCP Server

A Model Context Protocol (MCP) server that integrates WordPress Coding Standards (WPCS) with Claude AI. Automatically check and fix your WordPress plugin/theme code to meet WordPress.org standards.

## Why Use This?

If you're developing WordPress plugins or themes, your code must follow [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/) to:

- ✅ Get approved on WordPress.org plugin/theme directory
- ✅ Write consistent, readable code
- ✅ Follow security best practices
- ✅ Make your code maintainable

**This MCP server lets Claude AI automatically check and fix your PHP code against WPCS before you commit.**

---

## Quick Start (3 Steps)

### Step 1: Clone & Build

```bash
git clone https://github.com/vapvarun/wpcs-mcp-server.git ~/.mcp-servers/wpcs-mcp-server
cd ~/.mcp-servers/wpcs-mcp-server
npm install && npm run build
```

### Step 2: Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": ["~/.mcp-servers/wpcs-mcp-server/build/index.js"]
    }
  }
}
```

### Step 3: Restart Claude Desktop

That's it! On first run, the server will **auto-install phpcs and WPCS** if not already installed.

---

## Requirements

| Requirement | Why |
|-------------|-----|
| **Composer** | To auto-install phpcs/WPCS ([Install](https://getcomposer.org)) |
| **Node.js 18+** | To run the MCP server |
| **Claude Desktop or Claude Code** | To use the tools |

---

## What Gets Auto-Installed

When you first run the server, it automatically installs (if missing):

- **PHP_CodeSniffer** - The code analysis tool
- **WordPress Coding Standards** - The WordPress ruleset
- **PHPCompatibilityWP** - PHP version compatibility checks
- **phpcodesniffer-composer-installer** - Auto-configures paths

No manual setup needed!

---

## Available Tools

| Tool | What It Does |
|------|--------------|
| `wpcs_pre_commit` | **Most useful!** Auto-fix staged files, re-stage, report remaining issues |
| `wpcs_check_staged` | Check all staged PHP files before commit |
| `wpcs_check_file` | Check a single PHP file |
| `wpcs_check_directory` | Check all PHP files in a directory |
| `wpcs_fix_file` | Auto-fix WPCS violations in a file |
| `wpcs_check_php_compatibility` | **NEW!** Check PHP 8.1/8.2/8.3/8.4 compatibility |

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

WordPress.org requires **PHP 7.4+** minimum, so use `"7.4-"` to ensure broad compatibility

---

## Configuration Options

### For Claude Desktop (macOS)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"],
      "env": {
        "PATH": "/Users/YOUR_USERNAME/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

### For Claude Desktop (Windows)

```json
// %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\.mcp-servers\\wpcs-mcp-server\\build\\index.js"]
    }
  }
}
```

### For Claude Code CLI

Add MCP server to `~/.claude.json`:

```json
{
  "projects": {
    "/Users/YOUR_USERNAME": {
      "mcpServers": {
        "wpcs": {
          "type": "stdio",
          "command": "node",
          "args": ["/Users/YOUR_USERNAME/.mcp-servers/wpcs-mcp-server/build/index.js"]
        }
      }
    }
  }
}
```

Add permissions to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__wpcs__wpcs_check_staged",
      "mcp__wpcs__wpcs_check_file",
      "mcp__wpcs__wpcs_check_directory",
      "mcp__wpcs__wpcs_fix_file",
      "mcp__wpcs__wpcs_pre_commit"
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

### "phpcs not found"

The server should auto-install, but if it fails:

```bash
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
```

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export PATH="$HOME/.composer/vendor/bin:$PATH"
```

### "WordPress standard not found"

```bash
phpcs -i  # Should list WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra
```

If not listed:

```bash
phpcs --config-set installed_paths ~/.composer/vendor/wp-coding-standards/wpcs
```

### MCP server not loading

1. Verify the path in your config is correct
2. Ensure you ran `npm run build`
3. Restart Claude Desktop or Claude Code
4. Check logs: `node ~/.mcp-servers/wpcs-mcp-server/build/index.js`

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
