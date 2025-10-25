#!/bin/bash

# GKChatty Ecosystem - Stop Script
# Safely stops ONLY GKChatty services, NOT MCP servers
# Part of: Startup Infrastructure Improvements (Oct 25, 2025)

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping GKChatty Ecosystem${NC}"
echo "======================================"

# Function to check if process is running
is_running() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Function to stop service by port
stop_by_port() {
    local port=$1
    local name=$2

    echo -n "Stopping $name (port $port)... "

    if is_running $port; then
        # Get PID
        local pid=$(lsof -ti:$port)

        # Try graceful shutdown first (SIGTERM)
        kill -TERM $pid 2>/dev/null || true

        # Wait up to 5 seconds for graceful shutdown
        for i in {1..5}; do
            if ! is_running $port; then
                echo -e "${GREEN}✅ Stopped gracefully${NC}"
                return 0
            fi
            sleep 1
        done

        # Force kill if still running (SIGKILL)
        if is_running $port; then
            kill -9 $pid 2>/dev/null || true
            sleep 1

            if ! is_running $port; then
                echo -e "${YELLOW}⚠️  Stopped (forced)${NC}"
            else
                echo -e "${RED}❌ Failed to stop${NC}"
                return 1
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  Not running${NC}"
    fi
}

# Check if PM2 is available and services are running under PM2
if command -v pm2 &> /dev/null; then
    PM2_LIST=$(pm2 list 2>/dev/null | grep -E "gkchatty-(backend|frontend)" || true)

    if [ -n "$PM2_LIST" ]; then
        echo "Using PM2 for process management..."

        # Stop backend
        if pm2 list 2>/dev/null | grep -q "gkchatty-backend"; then
            echo -n "Stopping backend via PM2... "
            pm2 stop gkchatty-backend > /dev/null 2>&1 && echo -e "${GREEN}✅${NC}" || echo -e "${RED}❌${NC}"
        fi

        # Stop frontend
        if pm2 list 2>/dev/null | grep -q "gkchatty-frontend"; then
            echo -n "Stopping frontend via PM2... "
            pm2 stop gkchatty-frontend > /dev/null 2>&1 && echo -e "${GREEN}✅${NC}" || echo -e "${RED}❌${NC}"
        fi
    else
        echo "PM2 not managing GKChatty services, using port-based shutdown..."
        stop_by_port 4001 "Backend"
        stop_by_port 4003 "Frontend"
    fi
else
    echo "Using port-based shutdown (PM2 not installed)..."
    stop_by_port 4001 "Backend"
    stop_by_port 4003 "Frontend"
fi

# Verify MCP servers are still running
echo ""
echo "Verifying MCP servers..."
MCP_COUNT=$(ps aux | grep -E "(gkchatty-mcp|builder-pro-mcp)" | grep -v grep | wc -l | tr -d ' ')

if [ "$MCP_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✅ MCP servers still running ($MCP_COUNT processes)${NC}"
else
    echo -e "${YELLOW}⚠️  Only $MCP_COUNT MCP process(es) detected${NC}"
    echo "   This is normal if Claude Code is not running"
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ GKChatty services stopped${NC}"
echo ""
echo "Note: MCP servers are managed by Claude Code and remain running."
echo "To restart GKChatty: ./scripts/start.sh or pnpm start"
echo ""
