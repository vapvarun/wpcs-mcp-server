#!/bin/bash

# WPCS Git Hooks Installer
# One-line install: curl -sSL https://raw.githubusercontent.com/vapvarun/wpcs-mcp-server/main/scripts/install-hooks.sh | bash
#
# This script:
# 1. Installs phpcs + WPCS + PHPCompatibility globally
# 2. Sets up a pre-commit hook in your current repo

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   WPCS Git Hooks Installer             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    echo "Please run this from your WordPress plugin/theme directory"
    exit 1
fi

# Check for Composer
if ! command -v composer &> /dev/null; then
    echo -e "${RED}Error: Composer not found${NC}"
    echo "Install from: https://getcomposer.org/download/"
    exit 1
fi

echo -e "${YELLOW}Step 1/3: Installing WPCS dependencies...${NC}"

# Configure composer
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true 2>/dev/null || true

# Install packages
composer global require --quiet squizlabs/php_codesniffer wp-coding-standards/wpcs phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer

# Add to PATH for this session
export PATH="$HOME/.composer/vendor/bin:$PATH"

# Verify installation
if ! command -v phpcs &> /dev/null; then
    echo -e "${RED}Error: phpcs installation failed${NC}"
    echo "Add to your shell profile: export PATH=\"\$HOME/.composer/vendor/bin:\$PATH\""
    exit 1
fi

echo -e "${GREEN}✓ WPCS installed successfully${NC}"

# Check if WordPress standard is available
if ! phpcs -i | grep -q "WordPress"; then
    echo -e "${RED}Error: WordPress standard not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ WordPress standard available${NC}"

echo ""
echo -e "${YELLOW}Step 2/3: Creating pre-commit hook...${NC}"

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create pre-commit hook
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/bash

# WPCS Pre-Commit Hook
# Auto-fixes and checks WordPress Coding Standards

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

export PATH="$HOME/.composer/vendor/bin:$PATH"

if ! command -v phpcs &> /dev/null; then
    echo -e "${RED}Error: phpcs not found. Run the WPCS installer again.${NC}"
    exit 1
fi

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.php$' || true)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

echo -e "${YELLOW}WPCS: Checking $(echo "$STAGED_FILES" | wc -l | tr -d ' ') PHP file(s)...${NC}"

# Auto-fix files
FIXED_FILES=""
for FILE in $STAGED_FILES; do
    if [ -f "$FILE" ]; then
        HASH_BEFORE=$(md5sum "$FILE" 2>/dev/null | cut -d' ' -f1 || md5 -q "$FILE" 2>/dev/null)
        phpcbf --standard=WordPress "$FILE" > /dev/null 2>&1 || true
        HASH_AFTER=$(md5sum "$FILE" 2>/dev/null | cut -d' ' -f1 || md5 -q "$FILE" 2>/dev/null)

        if [ "$HASH_BEFORE" != "$HASH_AFTER" ]; then
            FIXED_FILES="$FIXED_FILES $FILE"
            git add "$FILE"
        fi
    fi
done

if [ -n "$FIXED_FILES" ]; then
    echo -e "${GREEN}Auto-fixed:${NC}$FIXED_FILES"
fi

# Check for remaining errors
ERRORS=0
FAILED_FILES=""
for FILE in $STAGED_FILES; do
    if [ -f "$FILE" ]; then
        RESULT=$(phpcs --standard=WordPress --report=json "$FILE" 2>/dev/null || true)
        FILE_ERRORS=$(echo "$RESULT" | grep -o '"errors":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")

        if [ "$FILE_ERRORS" -gt 0 ] 2>/dev/null; then
            ERRORS=$((ERRORS + FILE_ERRORS))
            FAILED_FILES="$FAILED_FILES\n  - $FILE ($FILE_ERRORS errors)"
        fi
    fi
done

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}  COMMIT BLOCKED: $ERRORS WPCS error(s)${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "$FAILED_FILES"
    echo ""
    echo "Run 'phpcs --standard=WordPress <file>' for details"
    echo "Bypass with: git commit --no-verify"
    exit 1
fi

echo -e "${GREEN}✓ WPCS: All checks passed${NC}"
exit 0
HOOK

chmod +x .git/hooks/pre-commit

echo -e "${GREEN}✓ Pre-commit hook created${NC}"

echo ""
echo -e "${YELLOW}Step 3/3: Creating phpcs.xml config...${NC}"

# Create phpcs.xml if it doesn't exist
if [ ! -f "phpcs.xml" ] && [ ! -f "phpcs.xml.dist" ]; then
    cat > phpcs.xml << 'CONFIG'
<?xml version="1.0"?>
<ruleset name="WordPress Plugin/Theme">
    <description>WordPress Coding Standards</description>

    <file>.</file>

    <exclude-pattern>/vendor/*</exclude-pattern>
    <exclude-pattern>/node_modules/*</exclude-pattern>
    <exclude-pattern>/build/*</exclude-pattern>
    <exclude-pattern>/dist/*</exclude-pattern>
    <exclude-pattern>*.min.js</exclude-pattern>
    <exclude-pattern>*.min.css</exclude-pattern>

    <rule ref="WordPress"/>

    <config name="testVersion" value="7.4-"/>
    <rule ref="PHPCompatibilityWP"/>
</ruleset>
CONFIG
    echo -e "${GREEN}✓ phpcs.xml created${NC}"
else
    echo -e "${YELLOW}⚠ phpcs.xml already exists, skipping${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installation Complete!               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "What happens now:"
echo "  • PHP files are auto-checked on every commit"
echo "  • Fixable issues are auto-corrected"
echo "  • Unfixable errors block the commit"
echo ""
echo "Commands:"
echo "  phpcs .                    Check all files"
echo "  phpcbf .                   Auto-fix all files"
echo "  phpcs --standard=WordPress <file>"
echo ""
echo "Add to ~/.zshrc or ~/.bashrc:"
echo "  export PATH=\"\$HOME/.composer/vendor/bin:\$PATH\""
echo ""
