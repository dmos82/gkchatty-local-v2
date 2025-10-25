#!/bin/bash

# GKChatty Ecosystem - Start Script (Enhanced)
# Safely starts GKChatty services with pre-flight checks
# Part of: Startup Infrastructure Improvements (Oct 25, 2025)

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting GKChatty Ecosystem${NC}"
echo "======================================"
echo ""

# Function to check if port is in use
check_port() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Function to get process name using a port
get_process_on_port() {
    lsof -ti:$1 | xargs ps -p 2>/dev/null | tail -n +2
}

###########################################
# PRE-FLIGHT CHECKS
###########################################

echo -e "${YELLOW}Running pre-flight checks...${NC}"
echo ""

# 1. Check MongoDB
echo -n "MongoDB (localhost:27017)... "
if mongosh --eval "db.version()" --quiet > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ NOT RUNNING${NC}"
    echo ""
    echo "MongoDB is required. Start it with:"
    echo "  brew services start mongodb-community"
    echo ""
    exit 1
fi

# 2. Check environment variables
echo -n "Environment variables... "
if [ -f packages/backend/.env ]; then
    if grep -q "OPENAI_API_KEY" packages/backend/.env && \
       grep -q "PINECONE_API_KEY" packages/backend/.env && \
       grep -q "JWT_SECRET" packages/backend/.env; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${YELLOW}⚠️  INCOMPLETE${NC}"
        echo ""
        echo "Some required environment variables are missing in packages/backend/.env"
        echo "Please check: OPENAI_API_KEY, PINECONE_API_KEY, JWT_SECRET"
        echo ""
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${RED}❌ NOT FOUND${NC}"
    echo ""
    echo "Missing packages/backend/.env file"
    echo "Copy from example:"
    echo "  cp packages/backend/.env.example packages/backend/.env"
    echo ""
    exit 1
fi

# 3. Check for port conflicts
echo -n "Port 4001 (backend)... "
if check_port 4001; then
    echo -e "${RED}❌ IN USE${NC}"
    echo ""
    echo "Port 4001 is already in use:"
    get_process_on_port 4001
    echo ""
    echo "Stop the conflicting process with:"
    echo "  ./scripts/stop.sh"
    echo "  OR: kill \$(lsof -ti:4001)"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ Available${NC}"
fi

echo -n "Port 4003 (frontend)... "
if check_port 4003; then
    echo -e "${RED}❌ IN USE${NC}"
    echo ""
    echo "Port 4003 is already in use:"
    get_process_on_port 4003
    echo ""
    echo "Stop the conflicting process with:"
    echo "  ./scripts/stop.sh"
    echo "  OR: kill \$(lsof -ti:4003)"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ Available${NC}"
fi

# 4. Check for pnpm
echo -n "pnpm package manager... "
if command -v pnpm >/dev/null 2>&1; then
    echo -e "${GREEN}✅ $(pnpm -v)${NC}"
else
    echo -e "${RED}❌ NOT INSTALLED${NC}"
    echo ""
    echo "pnpm is required. Install it with:"
    echo "  npm install -g pnpm"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Pre-flight checks passed!${NC}"
echo ""

###########################################
# START SERVICES
###########################################

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo -e "${BLUE}Using PM2 for process management...${NC}"
    echo ""

    # Check if services are already running under PM2
    if pm2 list 2>/dev/null | grep -q "gkchatty-backend"; then
        echo -e "${YELLOW}⚠️  Services already running under PM2${NC}"
        echo ""
        pm2 list | grep gkchatty
        echo ""
        echo "To restart: pm2 restart all"
        echo "To stop: pm2 stop all"
        exit 0
    fi

    # Start with PM2
    pm2 start ecosystem.config.js

    echo ""
    echo "⏳ Waiting for services to initialize..."
    sleep 8

    # Check if services are running
    if pm2 list 2>/dev/null | grep -q "gkchatty-backend" && \
       pm2 list 2>/dev/null | grep -q "gkchatty-frontend"; then
        echo ""
        echo "======================================"
        echo -e "${GREEN}✅ All services started successfully!${NC}"
        echo "======================================"
        echo ""
        echo "📡 Backend API:  http://localhost:4001"
        echo "   Health: http://localhost:4001/health"
        echo ""
        echo "🌐 Web Frontend: http://localhost:4003"
        echo ""
        echo "Useful PM2 commands:"
        echo "  pm2 list         # View all processes"
        echo "  pm2 logs         # View logs"
        echo "  pm2 monit        # Monitor resources"
        echo "  pm2 stop all     # Stop services"
        echo "  pm2 restart all  # Restart services"
        echo ""
        echo "Stop services: ./scripts/stop.sh or pnpm stop"
        echo ""
    else
        echo -e "${RED}❌ Failed to start services${NC}"
        echo ""
        echo "Check PM2 logs:"
        echo "  pm2 logs"
        exit 1
    fi

else
    # PM2 not available, use background processes
    echo -e "${YELLOW}Using background processes (consider installing PM2 for better management)${NC}"
    echo -e "${YELLOW}Install PM2: npm install -g pm2${NC}"
    echo ""

    # Start backend
    echo "📡 Starting Backend API (http://localhost:4001)..."
    cd packages/backend && PORT=4001 pnpm run dev > /dev/null 2>&1 &
    BACKEND_PID=$!

    # Save PID for stop script
    echo $BACKEND_PID > /tmp/gkchatty-backend.pid

    # Wait for backend to initialize
    echo "⏳ Waiting for backend to start..."
    sleep 8

    # Verify backend is running
    if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "${RED}❌ Backend failed to start${NC}"
        echo ""
        echo "Check logs by running manually:"
        echo "  cd packages/backend && pnpm run dev"
        exit 1
    fi

    # Check if backend is responding
    if curl -sf http://localhost:4001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is running${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend started but not responding to health check${NC}"
        echo "Give it a few more seconds..."
    fi

    # Start frontend
    echo "🌐 Starting Web Frontend (http://localhost:4003)..."
    cd ../web && PORT=4003 pnpm run dev > /dev/null 2>&1 &
    WEB_PID=$!

    # Save PID for stop script
    echo $WEB_PID > /tmp/gkchatty-frontend.pid

    # Wait for frontend to initialize
    sleep 5

    # Verify frontend is running
    if ! ps -p $WEB_PID > /dev/null 2>&1; then
        echo -e "${RED}❌ Frontend failed to start${NC}"
        echo ""
        echo "Stopping backend..."
        kill $BACKEND_PID 2>/dev/null || true
        echo ""
        echo "Check logs by running manually:"
        echo "  cd packages/web && pnpm run dev"
        exit 1
    else
        echo -e "${GREEN}✅ Frontend is running${NC}"
    fi

    echo ""
    echo "======================================"
    echo -e "${GREEN}✅ All services started!${NC}"
    echo "======================================"
    echo ""
    echo "📡 Backend API:  http://localhost:4001"
    echo "   Health: http://localhost:4001/health"
    echo ""
    echo "🌐 Web Frontend: http://localhost:4003"
    echo ""
    echo "Process IDs:"
    echo "  Backend:  $BACKEND_PID"
    echo "  Frontend: $WEB_PID"
    echo ""
    echo "Stop services: ./scripts/stop.sh or pnpm stop"
    echo ""
    echo "Note: Services are running in background."
    echo "      Logs are suppressed. For debugging, start manually:"
    echo "      cd packages/backend && pnpm run dev"
    echo ""
fi

# Verify MCP servers are running (informational only)
echo "Checking MCP servers..."
MCP_COUNT=$(ps aux | grep -E "(gkchatty-mcp|builder-pro-mcp)" | grep -v grep | wc -l | tr -d ' ')

if [ "$MCP_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✅ MCP servers are running ($MCP_COUNT processes)${NC}"
else
    echo -e "${YELLOW}⚠️  Only $MCP_COUNT MCP process(es) detected${NC}"
    echo "   MCPs are managed by Claude Code. This is normal if Claude Code is not running."
fi

echo ""
echo "======================================"
echo -e "${GREEN}🎉 GKChatty is ready!${NC}"
echo "======================================"
