#!/bin/bash
# BMAD Project Setup Script
# Purpose: Create isolated GKChatty user for BMAD project and upload specs
#
# Usage: ./bmad-project-setup.sh <project-name> <spec-files...>
# Example: ./bmad-project-setup.sh reddit-blog-platform specs/user-stories/story.md specs/architecture/arch.md specs/plans/plan.md

set -e # Exit on error

# =====================================
# Enterprise Path Resolution
# =====================================

# Auto-detect project root (searches up from current dir for specs/ directory)
# This handles nested git repos (gkchatty-ecosystem inside main project)
detect_project_root() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        # Look for specs/ directory as marker of BMAD project root
        if [[ -d "$dir/specs" ]]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    # Fallback to current directory
    echo "$PWD"
}

PROJECT_ROOT="${PROJECT_ROOT:-$(detect_project_root)}"

# Validation: ensure PROJECT_ROOT has specs/ directory
if [[ ! -d "$PROJECT_ROOT/specs" ]]; then
    echo -e "${YELLOW}⚠ Warning: specs/ directory not found at PROJECT_ROOT${NC}"
    echo -e "${YELLOW}  You may need to set PROJECT_ROOT environment variable${NC}"
fi

# Configuration
GKCHATTY_API_URL="${GKCHATTY_API_URL:-http://localhost:4001}"
ADMIN_USERNAME="${GKCHATTY_ADMIN_USERNAME:-davidmorinmusic}"
ADMIN_PASSWORD="${GKCHATTY_ADMIN_PASSWORD:-123123}"
PROJECT_USER_PASSWORD="Bmad123!" # Standard password for all BMAD project users (meets requirements)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}Error: Insufficient arguments${NC}"
    echo "Usage: $0 <project-name> <spec-file1> [spec-file2] [spec-file3]"
    echo "Example: $0 reddit-blog-platform specs/user-stories/story.md specs/plans/plan.md"
    exit 1
fi

PROJECT_NAME="$1"
shift # Remove project name from arguments, rest are spec files
SPEC_FILES=("$@")

# =====================================
# Normalize all file paths
# =====================================
echo -e "${BLUE}Project Root: ${PROJECT_ROOT}${NC}"

NORMALIZED_FILES=()
for SPEC_FILE in "${SPEC_FILES[@]}"; do
    # If absolute path, use as-is
    if [[ "$SPEC_FILE" == /* ]]; then
        NORMALIZED_FILES+=("$SPEC_FILE")
    else
        # Relative path - resolve relative to PROJECT_ROOT
        NORMALIZED_FILES+=("$PROJECT_ROOT/$SPEC_FILE")
    fi
done

# Replace SPEC_FILES with normalized paths
SPEC_FILES=("${NORMALIZED_FILES[@]}")

echo -e "${BLUE}=== BMAD Project Setup: ${PROJECT_NAME} ===${NC}\n"

# Step 1: Authenticate as admin
echo -e "${BLUE}[1/4] Authenticating as admin...${NC}"
AUTH_RESPONSE=$(curl -s -X POST "${GKCHATTY_API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  -c /tmp/gkchatty_admin_cookies.txt)

if echo "$AUTH_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Admin authentication successful${NC}"
    ADMIN_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}✗ Admin authentication failed${NC}"
    echo "Response: $AUTH_RESPONSE"
    exit 1
fi

# Step 2: Create project user (if doesn't exist)
echo -e "\n${BLUE}[2/4] Creating project user: ${PROJECT_NAME}...${NC}"
CREATE_USER_RESPONSE=$(curl -s -X POST "${GKCHATTY_API_URL}/api/admin/users" \
  -H "Content-Type: application/json" \
  -b /tmp/gkchatty_admin_cookies.txt \
  -d "{\"username\":\"${PROJECT_NAME}\",\"password\":\"${PROJECT_USER_PASSWORD}\",\"role\":\"user\"}")

if echo "$CREATE_USER_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ User '${PROJECT_NAME}' created successfully${NC}"
elif echo "$CREATE_USER_RESPONSE" | grep -q "already exists"; then
    echo -e "${YELLOW}⚠ User '${PROJECT_NAME}' already exists (continuing...)${NC}"
else
    echo -e "${RED}✗ User creation failed${NC}"
    echo "Response: $CREATE_USER_RESPONSE"
    exit 1
fi

# Step 3: Authenticate as project user
echo -e "\n${BLUE}[3/4] Authenticating as project user...${NC}"
PROJECT_AUTH_RESPONSE=$(curl -s -X POST "${GKCHATTY_API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${PROJECT_NAME}\",\"password\":\"${PROJECT_USER_PASSWORD}\"}" \
  -c /tmp/gkchatty_project_cookies.txt)

if echo "$PROJECT_AUTH_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Project user authentication successful${NC}"
else
    echo -e "${RED}✗ Project user authentication failed${NC}"
    echo "Response: $PROJECT_AUTH_RESPONSE"
    exit 1
fi

# Step 4: Upload spec files to project user's documents
echo -e "\n${BLUE}[4/4] Uploading ${#SPEC_FILES[@]} spec file(s)...${NC}"

UPLOAD_COUNT=0
FAIL_COUNT=0

for SPEC_FILE in "${SPEC_FILES[@]}"; do
    if [ ! -f "$SPEC_FILE" ]; then
        echo -e "${RED}✗ File not found: ${SPEC_FILE}${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    FILENAME=$(basename "$SPEC_FILE")
    echo -e "  ${BLUE}Uploading: ${FILENAME}${NC}"

    UPLOAD_RESPONSE=$(curl -s -X POST "${GKCHATTY_API_URL}/api/documents/upload" \
      -b /tmp/gkchatty_project_cookies.txt \
      -F "files=@${SPEC_FILE}")

    if echo "$UPLOAD_RESPONSE" | grep -q '"success":true'; then
        echo -e "  ${GREEN}✓ ${FILENAME} uploaded successfully${NC}"
        UPLOAD_COUNT=$((UPLOAD_COUNT + 1))
    else
        echo -e "  ${RED}✗ ${FILENAME} upload failed${NC}"
        echo "  Response: $UPLOAD_RESPONSE"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

# Cleanup cookies
rm -f /tmp/gkchatty_admin_cookies.txt /tmp/gkchatty_project_cookies.txt

# Summary
echo -e "\n${BLUE}=== Setup Complete ===${NC}"
echo -e "${GREEN}✓ Project User: ${PROJECT_NAME}${NC}"
echo -e "${GREEN}✓ Password: ${PROJECT_USER_PASSWORD}${NC}"
echo -e "${GREEN}✓ Documents Uploaded: ${UPLOAD_COUNT}/${#SPEC_FILES[@]}${NC}"

if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}✗ Failed Uploads: ${FAIL_COUNT}${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 BMAD project '${PROJECT_NAME}' is now isolated in GKChatty!${NC}"
echo -e "${BLUE}Access specs via: User '${PROJECT_NAME}' -> My Documents${NC}"
