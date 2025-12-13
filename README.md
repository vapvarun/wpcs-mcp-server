# WPCS MCP Server

A Model Context Protocol (MCP) server that integrates WordPress Coding Standards (WPCS) with Claude AI. This server enables automatic code quality checks and fixes for WordPress plugins and themes before commits.

## Features

- **Pre-commit WPCS validation** - Automatically check staged PHP files against WordPress Coding Standards
- **Auto-fix support** - Automatically fix coding standard violations using phpcbf
- **Block commits on errors** - Prevent commits when WPCS errors are found
- **Claude Code integration** - Seamless integration with Claude Code CLI
- **Multiple check modes** - Check individual files, directories, or all staged files

## Available Tools

| Tool | Description |
|------|-------------|
| `wpcs_check_staged` | Check all staged PHP files against WPCS |
| `wpcs_check_file` | Check a single PHP file |
| `wpcs_check_directory` | Check all PHP files in a directory |
| `wpcs_fix_file` | Auto-fix WPCS violations in a file |
| `wpcs_pre_commit` | Full pre-commit workflow: auto-fix, re-stage, and report |

## Prerequisites

### 1. Install PHP CodeSniffer and WordPress Coding Standards

```bash
# Install globally via Composer
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer

# Add composer bin to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.composer/vendor/bin:$PATH"

# Verify installation
phpcs -i
# Should show: WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra
```

### 2. Node.js 18+

Ensure you have Node.js version 18 or higher installed.

## Installation

### Option 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/vapvarun/wpcs-mcp-server.git ~/.mcp-servers/wpcs-mcp-server

# Install dependencies
cd ~/.mcp-servers/wpcs-mcp-server
npm install --include=dev

# Build
npm run build
```

### Option 2: NPM Install (Coming Soon)

```bash
npm install -g wpcs-mcp-server
```

## Configuration

### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "wpcs": {
      "command": "node",
      "args": [
        "/path/to/wpcs-mcp-server/build/index.js"
      ],
      "env": {
        "PATH": "/Users/YOUR_USERNAME/.composer/vendor/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

### For Claude Code CLI

Add to `~/.claude/settings.json`:

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

### Pre-commit Hook (Optional)

Create `~/.claude/hooks/wpcs-pre-commit.sh`:

```bash
#!/bin/bash
export PATH="$HOME/.composer/vendor/bin:$PATH"

# Get staged PHP files
STAGED_PHP=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.php$' || true)

if [ -z "$STAGED_PHP" ]; then
    exit 0
fi

# Check each file
TOTAL_ERRORS=0
for file in $STAGED_PHP; do
    if [ -f "$file" ]; then
        RESULT=$(phpcs --standard=WordPress --report=json "$file" 2>/dev/null || true)
        FILE_ERRORS=$(echo "$RESULT" | grep -o '"errors":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")
        if [ "$FILE_ERRORS" -gt 0 ] 2>/dev/null; then
            TOTAL_ERRORS=$((TOTAL_ERRORS + FILE_ERRORS))
        fi
    fi
done

if [ "$TOTAL_ERRORS" -gt 0 ]; then
    echo "WPCS ERROR: Found $TOTAL_ERRORS coding standard error(s)"
    echo "Run: wpcs_pre_commit to fix"
    exit 2
fi

exit 0
```

Then add to `~/.claude/settings.json`:

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

## Usage

### With Claude

Simply ask Claude to check your WordPress code:

```
"Check my staged files for WPCS violations"
"Run wpcs_pre_commit before I commit"
"Fix WPCS issues in includes/class-my-plugin.php"
"Check the entire src/ directory for coding standards"
```

### Example Workflow

1. Make changes to your WordPress plugin/theme
2. Stage your changes: `git add .`
3. Ask Claude: "Run wpcs_pre_commit"
4. Claude will:
   - Auto-fix what can be fixed
   - Re-stage the fixed files
   - Report any remaining issues
5. If no errors, commit proceeds; otherwise, fix remaining issues

## Tool Details

### wpcs_pre_commit

The most commonly used tool. It performs a complete pre-commit workflow:

```
Input:
  - working_dir (optional): Git repository root
  - auto_stage (optional): Re-stage fixed files (default: true)

Output:
  - PRE-COMMIT: PASSED or PRE-COMMIT: BLOCKED
  - List of auto-fixed files
  - Remaining issues with line numbers
```

### wpcs_check_file

Check a single PHP file:

```
Input:
  - file_path (required): Path to PHP file
  - working_dir (optional): Working directory

Output:
  - Errors and warnings with line/column numbers
  - Source of each violation
  - Whether each issue is auto-fixable
```

### wpcs_fix_file

Auto-fix a single file:

```
Input:
  - file_path (required): Path to PHP file
  - working_dir (optional): Working directory

Output:
  - Confirmation of fixes applied
  - Remaining issues that couldn't be auto-fixed
```

## WordPress Coding Standards

This server uses the `WordPress` ruleset which includes:

- **WordPress-Core** - Essential WordPress coding standards
- **WordPress-Extra** - Additional best practices
- **WordPress-Docs** - Documentation standards

## Development

```bash
# Clone
git clone https://github.com/vapvarun/wpcs-mcp-server.git
cd wpcs-mcp-server

# Install dependencies
npm install --include=dev

# Build
npm run build

# Watch mode
npm run dev
```

## Troubleshooting

### phpcs not found

Ensure composer bin is in your PATH:

```bash
export PATH="$HOME/.composer/vendor/bin:$PATH"
```

Add this to your shell profile (`~/.zshrc` or `~/.bashrc`).

### WordPress standard not found

Reinstall WPCS:

```bash
composer global require wp-coding-standards/wpcs
phpcs -i  # Verify WordPress is listed
```

### MCP server not loading

1. Check the path in your config is correct
2. Ensure the server is built: `npm run build`
3. Restart Claude Desktop or Claude Code

## License

GPL-2.0-or-later

## Author

**Varun Dubey** ([@vapvarun](https://github.com/vapvarun))
- Website: [wbcomdesigns.com](https://wbcomdesigns.com)
- Email: varun@wbcomdesigns.com

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- [WordPress Coding Standards](https://github.com/WordPress/WordPress-Coding-Standards)
- [PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer)
- [Model Context Protocol](https://modelcontextprotocol.io/)
