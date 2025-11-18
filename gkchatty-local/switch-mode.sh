#!/bin/bash

# ==========================================
# GKChatty Storage Mode Switcher
# ==========================================
# Switches between cloud and local storage modes
#
# Usage:
#   ./switch-mode.sh cloud   # Switch to cloud mode
#   ./switch-mode.sh local   # Switch to local mode
#   ./switch-mode.sh status  # Show current mode
#
# ⚠️ FUTURE FEATURE - NOT YET FULLY IMPLEMENTED
# Local mode is planned but not yet integrated
# For now, only cloud mode works
# ==========================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"
CLOUD_TEMPLATE="$BACKEND_DIR/.env.cloud"
LOCAL_TEMPLATE="$BACKEND_DIR/.env.local"

# ==========================================
# Functions
# ==========================================

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  GKChatty Storage Mode Switcher${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

get_current_mode() {
    if [ -f "$ENV_FILE" ]; then
        MODE=$(grep "^GKCHATTY_STORAGE=" "$ENV_FILE" | cut -d'=' -f2)
        echo "$MODE"
    else
        echo "none"
    fi
}

check_prerequisites() {
    MODE=$1

    if [ "$MODE" == "cloud" ]; then
        print_info "Checking cloud mode prerequisites..."

        # Check if MongoDB is accessible
        if command -v mongosh &> /dev/null; then
            print_success "MongoDB client installed"
        else
            print_warning "MongoDB client (mongosh) not found - install for easier DB management"
        fi

        print_info "Ensure you have:"
        echo "  - MongoDB (local or Atlas)"
        echo "  - Pinecone API key"
        echo "  - OpenAI API key"
        echo ""

    elif [ "$MODE" == "local" ]; then
        print_info "Checking local mode prerequisites..."

        # Check Ollama
        if command -v ollama &> /dev/null; then
            print_success "Ollama installed"

            # Check if Ollama is running
            if curl -s http://localhost:11434/api/tags &> /dev/null; then
                print_success "Ollama is running"

                # List available models
                MODELS=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
                if [ -n "$MODELS" ]; then
                    print_success "Available Ollama models:"
                    echo "$MODELS" | sed 's/^/    - /'
                else
                    print_warning "No Ollama models found - run: ollama pull llama3.2:3b"
                fi
            else
                print_warning "Ollama not running - start with: ollama serve"
            fi
        else
            print_error "Ollama not installed"
            echo ""
            echo "Install Ollama:"
            echo "  curl -fsSL https://ollama.com/install.sh | sh"
            echo ""
            echo "Then pull models:"
            echo "  ollama pull llama3.2:3b"
            echo "  ollama pull qwen2.5:3b"
            echo ""
            return 1
        fi

        # Check for GKChatty home directory
        GKCHATTY_HOME="${HOME}/.gkchatty"
        if [ -d "$GKCHATTY_HOME" ]; then
            print_success "GKChatty home directory exists: $GKCHATTY_HOME"
        else
            print_warning "GKChatty home directory not found"
            echo "  Creating: $GKCHATTY_HOME"
            mkdir -p "$GKCHATTY_HOME"/{data,uploads}
            print_success "Created directory structure"
        fi

        print_warning "Local mode is PLANNED but not yet fully integrated"
        echo "  See CLEANUP-AND-MERGE-PLAN.md for implementation timeline"
        echo ""
    fi

    return 0
}

backup_env() {
    if [ -f "$ENV_FILE" ]; then
        BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"
        cp "$ENV_FILE" "$BACKUP_FILE"
        print_success "Backed up current .env to: $(basename $BACKUP_FILE)"
    fi
}

switch_to_cloud() {
    print_header
    print_info "Switching to CLOUD mode..."
    echo ""

    # Check prerequisites
    check_prerequisites "cloud" || return 1

    # Backup current .env
    backup_env

    # Copy cloud template
    if [ -f "$CLOUD_TEMPLATE" ]; then
        cp "$CLOUD_TEMPLATE" "$ENV_FILE"
        print_success "Copied .env.cloud template to .env"
        print_warning "Edit backend/.env and add your credentials:"
        echo "  - MONGODB_URI"
        echo "  - PINECONE_API_KEY"
        echo "  - OPENAI_API_KEY"
        echo ""
    else
        print_error "Cloud template not found: $CLOUD_TEMPLATE"
        return 1
    fi

    print_success "Switched to CLOUD mode"
    print_info "Restart backend: cd backend && npm run dev"
    echo ""
}

switch_to_local() {
    print_header
    print_info "Switching to LOCAL mode..."
    echo ""

    print_warning "Local mode is PLANNED but not yet fully integrated"
    print_info "Current status: Code exists in backend/src/utils/local/ but not connected"
    print_info "See CLEANUP-AND-MERGE-PLAN.md for implementation timeline"
    echo ""

    # Check prerequisites
    check_prerequisites "local" || return 1

    # Backup current .env
    backup_env

    # Copy local template
    if [ -f "$LOCAL_TEMPLATE" ]; then
        cp "$LOCAL_TEMPLATE" "$ENV_FILE"
        print_success "Copied .env.local template to .env"
        print_warning "Local mode template configured, but backend not yet updated to use it"
        print_info "To make local mode work, backend/src/index.ts needs to:"
        echo "  1. Import sqliteHelper instead of mongoHelper"
        echo "  2. Import chromaService instead of pineconeService"
        echo "  3. Import ollamaHelper instead of openaiHelper"
        echo ""
    else
        print_error "Local template not found: $LOCAL_TEMPLATE"
        return 1
    fi

    print_info "Once local mode is fully integrated:"
    echo "  - 100% offline functionality"
    echo "  - Zero cloud costs"
    echo "  - Complete data privacy"
    echo "  - 10-20x faster performance"
    echo ""
}

show_status() {
    print_header

    CURRENT_MODE=$(get_current_mode)

    if [ "$CURRENT_MODE" == "cloud" ]; then
        print_info "Current mode: ${GREEN}CLOUD${NC}"
        echo ""
        echo "Stack:"
        echo "  - Database: MongoDB"
        echo "  - Vector DB: Pinecone"
        echo "  - LLM: OpenAI API"
        echo ""
        echo "Status: ✅ Fully implemented and working"

    elif [ "$CURRENT_MODE" == "local" ]; then
        print_info "Current mode: ${YELLOW}LOCAL${NC}"
        echo ""
        echo "Stack:"
        echo "  - Database: SQLite"
        echo "  - Vector DB: ChromaDB"
        echo "  - LLM: Ollama"
        echo ""
        print_warning "Status: ⚠️  Planned but not yet fully integrated"
        echo "  Code exists but not connected to backend entry point"

    else
        print_warning "No .env file found"
        echo ""
        echo "Run one of:"
        echo "  ./switch-mode.sh cloud   # Use cloud services"
        echo "  ./switch-mode.sh local   # Use local services (future)"
    fi
    echo ""
}

show_help() {
    print_header
    echo "Usage:"
    echo "  ./switch-mode.sh cloud   # Switch to cloud mode (MongoDB + Pinecone + OpenAI)"
    echo "  ./switch-mode.sh local   # Switch to local mode (SQLite + ChromaDB + Ollama)"
    echo "  ./switch-mode.sh status  # Show current mode"
    echo "  ./switch-mode.sh help    # Show this help"
    echo ""
    echo "Current Status:"
    echo "  ✅ Cloud mode: Fully implemented"
    echo "  ⚠️  Local mode: Planned (see CLEANUP-AND-MERGE-PLAN.md)"
    echo ""
    echo "Examples:"
    echo "  # Switch to cloud mode"
    echo "  ./switch-mode.sh cloud"
    echo "  cd backend"
    echo "  npm run dev"
    echo ""
    echo "  # Check current mode"
    echo "  ./switch-mode.sh status"
    echo ""
}

# ==========================================
# Main
# ==========================================

case "${1:-}" in
    cloud)
        switch_to_cloud
        ;;
    local)
        switch_to_local
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Invalid command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
