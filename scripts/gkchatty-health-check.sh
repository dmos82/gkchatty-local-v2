#!/bin/bash
# GKChatty Health Check and Auto-Recovery
# Part of BMAD v2.0 Enhancement - Bottleneck #2 Fix
# Date: October 24, 2025

GKCHATTY_URL="${GKCHATTY_URL:-http://localhost:4001}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY="${RETRY_DELAY:-5}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_gkchatty_health() {
    log_info "Checking GKChatty health at $GKCHATTY_URL/health..."

    local response=$(curl -sf "$GKCHATTY_URL/health" 2>/dev/null)
    local curl_status=$?

    if [ $curl_status -eq 0 ]; then
        # Parse JSON response for status
        local health_status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

        if [ "$health_status" = "healthy" ]; then
            log_info "✓ GKChatty is healthy"
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
            return 0
        else
            log_warn "✗ GKChatty returned status: $health_status"
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
            return 1
        fi
    else
        log_error "✗ GKChatty is unreachable (curl exit code: $curl_status)"
        return 1
    fi
}

check_readiness() {
    log_info "Checking GKChatty readiness..."

    local response=$(curl -sf "$GKCHATTY_URL/ready" 2>/dev/null)
    local curl_status=$?

    if [ $curl_status -eq 0 ]; then
        local ready_status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

        if [ "$ready_status" = "ready" ]; then
            log_info "✓ GKChatty is ready to receive traffic"
            return 0
        else
            log_warn "✗ GKChatty is not ready: $ready_status"
            return 1
        fi
    else
        log_error "✗ Readiness check failed (curl exit code: $curl_status)"
        return 1
    fi
}

restart_gkchatty() {
    log_warn "Restarting GKChatty services..."

    # Stop services
    if [ -f "$SCRIPT_DIR/stop.sh" ]; then
        log_info "Stopping GKChatty..."
        cd "$SCRIPT_DIR/.." && ./scripts/stop.sh
    else
        log_warn "stop.sh not found, attempting to kill processes..."
        pkill -f "gkchatty" 2>/dev/null || true
    fi

    sleep 2

    # Start services
    if [ -f "$SCRIPT_DIR/start.sh" ]; then
        log_info "Starting GKChatty..."
        cd "$SCRIPT_DIR/.." && ./scripts/start.sh
    else
        log_error "start.sh not found, cannot restart"
        return 1
    fi

    # Wait for services to initialize
    log_info "Waiting for services to initialize..."
    sleep 5
}

# Main health check loop with auto-recovery
main() {
    log_info "GKChatty Health Check - Max retries: $MAX_RETRIES, Delay: ${RETRY_DELAY}s"

    for attempt in $(seq 1 $MAX_RETRIES); do
        log_info "Attempt $attempt/$MAX_RETRIES"

        if check_gkchatty_health; then
            # Health check passed, verify readiness
            if check_readiness; then
                log_info "✓ GKChatty is fully operational"
                exit 0
            fi
        fi

        log_error "Health check failed on attempt $attempt"

        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Initiating auto-recovery (attempt $attempt)..."
            restart_gkchatty
            sleep $RETRY_DELAY
        fi
    done

    log_error "CRITICAL: GKChatty failed health check after $MAX_RETRIES attempts"
    log_error "Manual intervention required. Check logs at:"
    log_error "  - Backend: gkchatty-ecosystem/packages/backend/logs/"
    log_error "  - Frontend: gkchatty-ecosystem/packages/frontend/logs/"
    exit 1
}

# Run main function
main
