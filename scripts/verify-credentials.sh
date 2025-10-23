#!/bin/bash

# GKChatty Ecosystem - Credential Verification Script
# This script verifies that test credentials are consistent across the entire codebase

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔐 Verifying Test Credentials Consistency"
echo "=========================================="
echo ""

# Load credentials from central file
CREDS_FILE=".test-credentials.json"

if [ ! -f "$CREDS_FILE" ]; then
  echo -e "${RED}❌ ERROR: $CREDS_FILE not found!${NC}"
  exit 1
fi

# Extract expected credentials using jq (or fallback to grep)
if command -v jq &> /dev/null; then
  DEV_USERNAME=$(jq -r '.credentials.dev.username' "$CREDS_FILE")
  DEV_PASSWORD=$(jq -r '.credentials.dev.password' "$CREDS_FILE")
else
  # Fallback to grep if jq not available
  DEV_USERNAME="dev"
  DEV_PASSWORD="dev123"
  echo -e "${YELLOW}⚠️  jq not found, using fallback values${NC}"
fi

echo "Expected credentials:"
echo "  Username: $DEV_USERNAME"
echo "  Password: $DEV_PASSWORD"
echo ""

ISSUES=0

# Check 1: Stress test script
echo "🔍 Checking scripts/stress-test.sh..."
# Look for the dev user login specifically (not test user registration)
if grep "Auth - User login" scripts/stress-test.sh -A5 | grep -q "username.*$DEV_USERNAME.*password.*$DEV_PASSWORD"; then
  echo -e "  ${GREEN}✅ Credentials match${NC}"
else
  echo -e "  ${RED}❌ Credentials MISMATCH!${NC}"
  echo "     Expected: username:$DEV_USERNAME, password:$DEV_PASSWORD"
  echo "     Found in login test:"
  grep "Auth - User login" scripts/stress-test.sh -A5 | grep "username.*password"
  ISSUES=$((ISSUES + 1))
fi

# Check 2: MCP environment variables (if they exist in a config file)
echo ""
echo "🔍 Checking MCP environment variables..."
if [ -f "packages/gkchatty-mcp/.env.example" ] || [ -f "packages/gkchatty-mcp/.env" ]; then
  if grep -q "GKCHATTY_USERNAME=$DEV_USERNAME" packages/gkchatty-mcp/.env* 2>/dev/null && \
     grep -q "GKCHATTY_PASSWORD=$DEV_PASSWORD" packages/gkchatty-mcp/.env* 2>/dev/null; then
    echo -e "  ${GREEN}✅ MCP credentials match${NC}"
  else
    echo -e "  ${YELLOW}⚠️  MCP credentials may not match (check manually)${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  No MCP .env file found (credentials set elsewhere)${NC}"
fi

# Check 3: Backend .env.example
echo ""
echo "🔍 Checking packages/backend/.env.example..."
if [ -f "packages/backend/.env.example" ]; then
  echo -e "  ${GREEN}✅ File exists${NC}"
  echo "     (Note: .env.example doesn't contain test credentials by design)"
else
  echo -e "  ${YELLOW}⚠️  File not found${NC}"
fi

# Check 4: MongoDB actual user (requires MongoDB running)
echo ""
echo "🔍 Checking MongoDB actual user..."
if command -v mongosh &> /dev/null; then
  if nc -z localhost 27017 2>/dev/null; then
    MONGO_USER=$(mongosh gkckb --quiet --eval "db.users.findOne({username: '$DEV_USERNAME'}, {username: 1, _id: 0}).username" 2>/dev/null | grep -v "switched to" | tr -d ' ')

    if [ "$MONGO_USER" == "$DEV_USERNAME" ]; then
      echo -e "  ${GREEN}✅ User '$DEV_USERNAME' exists in MongoDB${NC}"

      # Try to verify password (this requires actually logging in)
      echo "     Verifying password via API..."
      if command -v curl &> /dev/null && nc -z localhost 4001 2>/dev/null; then
        LOGIN_TEST=$(curl -s -X POST http://localhost:4001/api/auth/login \
          -H "Content-Type: application/json" \
          -d "{\"username\":\"$DEV_USERNAME\",\"password\":\"$DEV_PASSWORD\"}" 2>/dev/null)

        if echo "$LOGIN_TEST" | grep -q "success"; then
          echo -e "     ${GREEN}✅ Password verified via API${NC}"
        else
          echo -e "     ${RED}❌ Password INCORRECT!${NC}"
          echo "        API returned: $(echo $LOGIN_TEST | head -c 100)..."
          ISSUES=$((ISSUES + 1))
        fi
      else
        echo -e "     ${YELLOW}⚠️  Cannot verify password (API not running)${NC}"
      fi
    else
      echo -e "  ${RED}❌ User '$DEV_USERNAME' NOT found in MongoDB!${NC}"
      ISSUES=$((ISSUES + 1))
    fi
  else
    echo -e "  ${YELLOW}⚠️  MongoDB not running (cannot verify)${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  mongosh not found (cannot verify)${NC}"
fi

# Final report
echo ""
echo "=========================================="
if [ $ISSUES -eq 0 ]; then
  echo -e "${GREEN}✅ All credential checks passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Found $ISSUES credential inconsistencies${NC}"
  echo ""
  echo "To fix:"
  echo "  1. Check .test-credentials.json for the source of truth"
  echo "  2. Update all mismatched files"
  echo "  3. Re-run this script to verify"
  exit 1
fi
