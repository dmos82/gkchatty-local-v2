#!/bin/bash
# Development Services Manager
# Prevents multiple instances and port conflicts

BACKEND_PORT=4001
FRONTEND_PORT=4003
BACKEND_DIR="/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/packages/backend"
FRONTEND_DIR="/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/packages/web"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to kill processes on a port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}Killing processes on port $port: $pids${NC}"
        kill -9 $pids 2>/dev/null
        sleep 1
    fi
}

# Function to check if a port is in use
is_port_in_use() {
    lsof -ti:$1 >/dev/null 2>&1
    return $?
}

# Function to start backend
start_backend() {
    echo -e "${GREEN}Starting backend on port $BACKEND_PORT...${NC}"
    cd "$BACKEND_DIR"
    pnpm dev > /tmp/gkchatty-backend.log 2>&1 &
    echo $! > /tmp/gkchatty-backend.pid
    sleep 3

    if is_port_in_use $BACKEND_PORT; then
        echo -e "${GREEN}✓ Backend started successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Backend failed to start${NC}"
        return 1
    fi
}

# Function to start frontend
start_frontend() {
    echo -e "${GREEN}Starting frontend on port $FRONTEND_PORT...${NC}"
    cd "$FRONTEND_DIR"
    pnpm dev > /tmp/gkchatty-frontend.log 2>&1 &
    echo $! > /tmp/gkchatty-frontend.pid
    sleep 3

    if is_port_in_use $FRONTEND_PORT; then
        echo -e "${GREEN}✓ Frontend started successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Frontend failed to start${NC}"
        return 1
    fi
}

# Function to stop services
stop_services() {
    echo -e "${YELLOW}Stopping all dev services...${NC}"

    # Kill by PID files
    if [ -f /tmp/gkchatty-backend.pid ]; then
        kill -9 $(cat /tmp/gkchatty-backend.pid) 2>/dev/null
        rm /tmp/gkchatty-backend.pid
    fi

    if [ -f /tmp/gkchatty-frontend.pid ]; then
        kill -9 $(cat /tmp/gkchatty-frontend.pid) 2>/dev/null
        rm /tmp/gkchatty-frontend.pid
    fi

    # Also kill by port
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT

    # Kill any remaining pnpm dev processes
    pkill -9 -f "pnpm dev" 2>/dev/null
    pkill -9 -f "ts-node-dev" 2>/dev/null
    pkill -9 -f "next dev" 2>/dev/null

    echo -e "${GREEN}✓ All services stopped${NC}"
}

# Function to check status
check_status() {
    echo -e "\n${GREEN}Service Status:${NC}"

    if is_port_in_use $BACKEND_PORT; then
        echo -e "  Backend (port $BACKEND_PORT): ${GREEN}RUNNING${NC}"
    else
        echo -e "  Backend (port $BACKEND_PORT): ${RED}STOPPED${NC}"
    fi

    if is_port_in_use $FRONTEND_PORT; then
        echo -e "  Frontend (port $FRONTEND_PORT): ${GREEN}RUNNING${NC}"
    else
        echo -e "  Frontend (port $FRONTEND_PORT): ${RED}STOPPED${NC}"
    fi
    echo ""
}

# Function to restart services
restart_services() {
    echo -e "${YELLOW}Restarting all services...${NC}"
    stop_services
    sleep 2
    start_all
}

# Function to start all services
start_all() {
    # Check for existing processes first
    if is_port_in_use $BACKEND_PORT || is_port_in_use $FRONTEND_PORT; then
        echo -e "${YELLOW}Warning: Services already running${NC}"
        check_status
        read -p "Do you want to restart? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            restart_services
            return
        else
            echo -e "${YELLOW}Aborted${NC}"
            return 1
        fi
    fi

    start_backend
    start_frontend
    check_status

    echo -e "\n${GREEN}Logs:${NC}"
    echo -e "  Backend:  tail -f /tmp/gkchatty-backend.log"
    echo -e "  Frontend: tail -f /tmp/gkchatty-frontend.log"
}

# Main script
case "$1" in
    start)
        start_all
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        check_status
        ;;
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|backend|frontend}"
        echo ""
        echo "Commands:"
        echo "  start     - Start both backend and frontend"
        echo "  stop      - Stop all services"
        echo "  restart   - Restart all services"
        echo "  status    - Check service status"
        echo "  backend   - Start only backend"
        echo "  frontend  - Start only frontend"
        exit 1
        ;;
esac
