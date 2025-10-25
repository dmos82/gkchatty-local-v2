#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

echo "🏥 GKChatty Ecosystem Health Check"
echo "======================================"
echo ""

# Function to check MongoDB
check_mongodb() {
    echo -n "MongoDB (localhost:27017)... "
    if mongosh --eval "db.version()" --quiet > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
        echo "   → Start MongoDB: brew services start mongodb-community"
        FAILED=1
    fi
}

# Function to check Backend API
check_backend() {
    echo -n "Backend API (http://localhost:4001)... "
    if curl -sf http://localhost:4001/api/version > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
        echo "   → Start backend: cd packages/backend && pnpm run dev"
        FAILED=1
    fi
}

# Function to check Web Frontend
check_web() {
    echo -n "Web Frontend (http://localhost:4003)... "
    if curl -sf http://localhost:4003 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
    else
        echo -e "${YELLOW}⚠️  NOT RUNNING${NC}"
        echo "   → Start web: cd packages/web && pnpm run dev"
    fi
}

# Function to check MCPs registered
check_mcps() {
    echo -n "MCPs Registered... "
    if [ -f ~/.config/claude/mcp.json ]; then
        echo -e "${GREEN}✅ Configured${NC}"
    else
        echo -e "${YELLOW}⚠️  NOT REGISTERED${NC}"
        echo "   → Register MCPs: ./scripts/fix-mcp.sh"
    fi
}

# Function to check MCP servers running (informational)
check_mcp_servers() {
    echo -n "MCP Servers (gkchatty-mcp, builder-pro-mcp)... "
    MCP_COUNT=$(ps aux | grep -E "(gkchatty-mcp|builder-pro-mcp)" | grep -v grep | wc -l | tr -d ' ')

    if [ "$MCP_COUNT" -ge 2 ]; then
        echo -e "${GREEN}✅ Running ($MCP_COUNT processes)${NC}"
    elif [ "$MCP_COUNT" -eq 1 ]; then
        echo -e "${YELLOW}⚠️  Only 1 MCP process running${NC}"
        echo "   → Expected: 2 (gkchatty-mcp + builder-pro-mcp)"
        echo "   → MCPs are managed by Claude Code"
    else
        echo -e "${YELLOW}⚠️  No MCP processes detected${NC}"
        echo "   → MCPs are managed by Claude Code"
        echo "   → Restart Claude Code if needed"
    fi
}

# Function to check environment variables
check_env() {
    echo -n "Environment Variables... "
    if [ -f packages/backend/.env ]; then
        if grep -q "OPENAI_API_KEY" packages/backend/.env && \
           grep -q "PINECONE_API_KEY" packages/backend/.env && \
           grep -q "JWT_SECRET" packages/backend/.env; then
            echo -e "${GREEN}✅ Configured${NC}"
        else
            echo -e "${YELLOW}⚠️  INCOMPLETE${NC}"
            echo "   → Missing keys in packages/backend/.env"
            FAILED=1
        fi
    else
        echo -e "${RED}❌ NOT FOUND${NC}"
        echo "   → Copy packages/backend/.env.example to packages/backend/.env"
        FAILED=1
    fi
}

# Function to check Node version
check_node() {
    echo -n "Node.js Version... "
    REQUIRED="20.19.5"
    CURRENT=$(node -v | cut -d'v' -f2)
    if [ "$CURRENT" == "$REQUIRED" ]; then
        echo -e "${GREEN}✅ $CURRENT${NC}"
    else
        echo -e "${YELLOW}⚠️  $CURRENT (expected $REQUIRED)${NC}"
        echo "   → Use nvm: nvm use"
    fi
}

# Function to check pnpm
check_pnpm() {
    echo -n "pnpm... "
    if command -v pnpm >/dev/null 2>&1; then
        VERSION=$(pnpm -v)
        echo -e "${GREEN}✅ $VERSION${NC}"
    else
        echo -e "${RED}❌ NOT INSTALLED${NC}"
        echo "   → Install: npm install -g pnpm"
        FAILED=1
    fi
}

# Run all checks
check_node
check_pnpm
check_mongodb
check_env
check_backend
check_web
check_mcps
check_mcp_servers

echo ""
echo "======================================"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some services need attention${NC}"
    exit 1
fi
