# WPCS Git Hooks Setup (No Claude Required)

Use WordPress Coding Standards checks on every commit - works with any Git workflow, GitHub, GitLab, or local development.

## Quick Start

### Option 1: One-Line Install (Recommended)

Run this in your WordPress plugin/theme directory:

```bash
curl -sSL https://raw.githubusercontent.com/vapvarun/wpcs-mcp-server/main/scripts/install-hooks.sh | bash
```

This will:
- Install phpcs + WPCS globally (if not installed)
- Set up a pre-commit hook in your repo
- Auto-fix and check PHP files on every commit

---

## Manual Setup

### Step 1: Install WPCS

```bash
# Install Composer if not installed
# https://getcomposer.org/download/

# Install phpcs + WPCS + PHPCompatibility globally
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.composer/vendor/bin:$PATH"

# Verify installation
phpcs -i
# Should show: WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra, PHPCompatibilityWP
```

### Step 2: Create Pre-Commit Hook

Create `.git/hooks/pre-commit` in your repo:

```bash
#!/bin/bash

# WPCS Pre-Commit Hook
# Automatically checks and fixes WordPress Coding Standards

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure phpcs is available
export PATH="$HOME/.composer/vendor/bin:$PATH"

if ! command -v phpcs &> /dev/null; then
    echo -e "${RED}Error: phpcs not found${NC}"
    echo "Install with: composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs"
    exit 1
fi

# Get staged PHP files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.php$')

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

echo -e "${YELLOW}WPCS: Checking staged PHP files...${NC}"

# Try to auto-fix files
FIXED_FILES=""
for FILE in $STAGED_FILES; do
    if [ -f "$FILE" ]; then
        # Get hash before fix
        HASH_BEFORE=$(md5sum "$FILE" 2>/dev/null | cut -d' ' -f1 || md5 -q "$FILE" 2>/dev/null)

        # Auto-fix
        phpcbf --standard=WordPress "$FILE" > /dev/null 2>&1 || true

        # Get hash after fix
        HASH_AFTER=$(md5sum "$FILE" 2>/dev/null | cut -d' ' -f1 || md5 -q "$FILE" 2>/dev/null)

        # Track if fixed
        if [ "$HASH_BEFORE" != "$HASH_AFTER" ]; then
            FIXED_FILES="$FIXED_FILES $FILE"
            git add "$FILE"
        fi
    fi
done

if [ -n "$FIXED_FILES" ]; then
    echo -e "${GREEN}Auto-fixed and re-staged:${NC}$FIXED_FILES"
fi

# Check for remaining errors
ERRORS=0
for FILE in $STAGED_FILES; do
    if [ -f "$FILE" ]; then
        RESULT=$(phpcs --standard=WordPress --report=json "$FILE" 2>/dev/null || true)
        FILE_ERRORS=$(echo "$RESULT" | grep -o '"errors":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")

        if [ "$FILE_ERRORS" -gt 0 ] 2>/dev/null; then
            ERRORS=$((ERRORS + FILE_ERRORS))
            echo -e "${RED}✗ $FILE ($FILE_ERRORS errors)${NC}"
            phpcs --standard=WordPress --report=summary "$FILE" 2>/dev/null || true
        else
            echo -e "${GREEN}✓ $FILE${NC}"
        fi
    fi
done

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}  COMMIT BLOCKED: $ERRORS WPCS error(s)${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo ""
    echo "Fix errors manually or run:"
    echo "  phpcs --standard=WordPress <file>"
    echo ""
    echo "To bypass (not recommended):"
    echo "  git commit --no-verify"
    exit 1
fi

echo -e "${GREEN}WPCS: All checks passed!${NC}"
exit 0
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

---

## GitHub Actions (CI/CD)

Add this to `.github/workflows/wpcs.yml` for automatic checks on PRs:

```yaml
name: WordPress Coding Standards

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

jobs:
  wpcs:
    name: WPCS Check
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer, cs2pr

      - name: Install WPCS
        run: |
          composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
          composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

      - name: Run WPCS
        run: |
          ~/.composer/vendor/bin/phpcs --standard=WordPress --extensions=php --ignore=vendor/*,node_modules/*,build/* . --report=checkstyle | cs2pr

  php-compatibility:
    name: PHP Compatibility
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer

      - name: Install PHPCompatibility
        run: |
          composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
          composer global require squizlabs/php_codesniffer phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

      - name: Check PHP 7.4+ Compatibility
        run: |
          ~/.composer/vendor/bin/phpcs --standard=PHPCompatibilityWP --runtime-set testVersion 7.4- --extensions=php --ignore=vendor/*,node_modules/*,build/* .
```

---

## GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
wpcs:
  image: php:8.2-cli
  before_script:
    - apt-get update && apt-get install -y git unzip
    - curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
    - composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
    - composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer
  script:
    - ~/.composer/vendor/bin/phpcs --standard=WordPress --extensions=php --ignore=vendor/*,node_modules/*,build/* .
  only:
    - merge_requests
    - main
```

---

## Bitbucket Pipelines

Add to `bitbucket-pipelines.yml`:

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: WPCS Check
          image: php:8.2-cli
          script:
            - apt-get update && apt-get install -y git unzip
            - curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
            - composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
            - composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
            - ~/.composer/vendor/bin/phpcs --standard=WordPress --extensions=php --ignore=vendor/*,node_modules/*,build/* .
```

---

## Project-Level Config (Optional)

Create `phpcs.xml` in your repo root for custom rules:

```xml
<?xml version="1.0"?>
<ruleset name="My Plugin WPCS">
    <description>WordPress Coding Standards for My Plugin</description>

    <!-- What to scan -->
    <file>.</file>

    <!-- Exclude paths -->
    <exclude-pattern>/vendor/*</exclude-pattern>
    <exclude-pattern>/node_modules/*</exclude-pattern>
    <exclude-pattern>/build/*</exclude-pattern>
    <exclude-pattern>/assets/js/vendor/*</exclude-pattern>
    <exclude-pattern>*.min.js</exclude-pattern>
    <exclude-pattern>*.min.css</exclude-pattern>

    <!-- Use WordPress standard -->
    <rule ref="WordPress"/>

    <!-- Set text domain for i18n -->
    <rule ref="WordPress.WP.I18n">
        <properties>
            <property name="text_domain" type="array">
                <element value="my-plugin-textdomain"/>
            </property>
        </properties>
    </rule>

    <!-- Set minimum PHP version -->
    <config name="testVersion" value="7.4-"/>
    <rule ref="PHPCompatibilityWP"/>

    <!-- Customize specific rules (optional) -->
    <rule ref="WordPress.Files.FileName">
        <properties>
            <property name="strict_class_file_names" value="false"/>
        </properties>
    </rule>
</ruleset>
```

Then just run:

```bash
phpcs  # Uses phpcs.xml automatically
```

---

## VS Code Integration

Install the [PHP Sniffer & Beautifier](https://marketplace.visualstudio.com/items?itemName=ValeryanM.vscode-phpsab) extension.

Add to `.vscode/settings.json`:

```json
{
    "phpsab.executablePathCS": "~/.composer/vendor/bin/phpcs",
    "phpsab.executablePathCBF": "~/.composer/vendor/bin/phpcbf",
    "phpsab.standard": "WordPress",
    "phpsab.autoRulesetSearch": true,
    "phpsab.fixerEnable": true,
    "editor.formatOnSave": true,
    "[php]": {
        "editor.defaultFormatter": "ValeryanM.vscode-phpsab"
    }
}
```

---

## Husky + lint-staged (For npm projects)

If your WordPress project uses npm:

```bash
npm install --save-dev husky lint-staged
npx husky init
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.php": [
      "~/.composer/vendor/bin/phpcbf --standard=WordPress",
      "~/.composer/vendor/bin/phpcs --standard=WordPress"
    ]
  }
}
```

Create `.husky/pre-commit`:

```bash
npx lint-staged
```

---

## Summary

| Method | Best For |
|--------|----------|
| **Git Hook** | Local development, any project |
| **GitHub Actions** | Open source, team projects |
| **GitLab CI** | GitLab hosted projects |
| **phpcs.xml** | Custom rules per project |
| **VS Code** | Real-time feedback while coding |
| **Husky** | npm-based WordPress projects |

---

## Need Help?

- [WordPress Coding Standards Docs](https://developer.wordpress.org/coding-standards/)
- [PHP_CodeSniffer Wiki](https://github.com/squizlabs/PHP_CodeSniffer/wiki)
- [PHPCompatibility](https://github.com/PHPCompatibility/PHPCompatibility)

---

**Want AI-powered checks?** Use the [WPCS MCP Server](https://github.com/vapvarun/wpcs-mcp-server) with Claude AI for natural language code reviews.
