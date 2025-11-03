#!/bin/bash

##
# GKChatty Local - Deployment Script
#
# Deploys GKChatty Local with automatic provider detection,
# model pulling, and health checks.
#
# Usage:
#   ./scripts/deploy.sh [--local|--cloud] [--pull-models]
#
# Options:
#   --local         Deploy with local provider (Ollama)
#   --cloud         Deploy with cloud provider (OpenAI)
#   --pull-models   Pull Ollama models before starting
#   --no-docker     Deploy without Docker (local dev mode)
##

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROVIDER_MODE="${1:---local}"  # Default to local
PULL_MODELS="${2:-}"
NO_DOCKER="${3:-}"

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
  echo -e "${RED}❌${NC} $1"
}

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js 18+"
    exit 1
  fi

  local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$node_version" -lt 18 ]; then
    log_error "Node.js version 18+ required. Current version: $(node -v)"
    exit 1
  fi

  log_success "Node.js $(node -v) found"

  # Check Docker (if not --no-docker)
  if [ "$NO_DOCKER" != "--no-docker" ]; then
    if ! command -v docker &> /dev/null; then
      log_warning "Docker not found. Use --no-docker for local dev mode."
      exit 1
    fi
    log_success "Docker $(docker --version) found"
  fi

  # Check system resources
  log_info "Checking system resources..."

  if command -v free &> /dev/null; then
    local free_mem_mb=$(free -m | awk '/^Mem:/{print $7}')
    if [ "$free_mem_mb" -lt 2048 ]; then
      log_warning "Low memory: ${free_mem_mb}MB free (recommended: 2GB+)"
    else
      log_success "Memory: ${free_mem_mb}MB free"
    fi
  fi

  local free_disk_gb=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')
  if [ "$free_disk_gb" -lt 10 ]; then
    log_warning "Low disk space: ${free_disk_gb}GB free (recommended: 10GB+)"
  else
    log_success "Disk space: ${free_disk_gb}GB free"
  fi
}

# Setup environment
setup_environment() {
  log_info "Setting up environment..."

  # Create .env if not exists
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      log_success "Created .env from .env.example"
    else
      log_warning ".env not found. Creating minimal config..."
      cat > .env <<EOF
# Server Configuration
PORT=6001
NODE_ENV=production

# Storage Mode
GKCHATTY_STORAGE=local

# Embedding Model (for local provider)
EMBEDDING_MODEL=nomic-embed-text-v1.5

# API Keys (optional)
# OPENAI_API_KEY=sk-...
EOF
      log_success "Created .env"
    fi
  else
    log_success ".env found"
  fi

  # Update .env based on provider mode
  if [ "$PROVIDER_MODE" == "--local" ]; then
    log_info "Configuring for local provider (Ollama)..."
    sed -i.bak 's/GKCHATTY_STORAGE=.*/GKCHATTY_STORAGE=local/' .env
    sed -i.bak 's/EMBEDDING_MODEL=.*/EMBEDDING_MODEL=nomic-embed-text-v1.5/' .env
  elif [ "$PROVIDER_MODE" == "--cloud" ]; then
    log_info "Configuring for cloud provider (OpenAI)..."
    if ! grep -q "OPENAI_API_KEY=" .env || grep -q "^# OPENAI_API_KEY=" .env; then
      log_error "OPENAI_API_KEY not set in .env"
      log_info "Please add your OpenAI API key to .env:"
      log_info "  echo 'OPENAI_API_KEY=sk-your-key-here' >> .env"
      exit 1
    fi
  fi

  # Create required directories
  mkdir -p data/documents data/embeddings logs backups
  log_success "Created data directories"
}

# Pull Ollama models
pull_ollama_models() {
  if [ "$PROVIDER_MODE" != "--local" ]; then
    return 0
  fi

  if [ "$PULL_MODELS" != "--pull-models" ]; then
    log_info "Skipping model pull (use --pull-models to pull)"
    return 0
  fi

  log_info "Pulling Ollama models..."

  # Check if Ollama is running
  if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    log_error "Ollama server not running. Start with: ollama serve"
    exit 1
  fi

  # Pull nomic-embed-text
  log_info "Pulling nomic-embed-text (recommended for M2 Mac)..."
  if ollama pull nomic-embed-text; then
    log_success "nomic-embed-text pulled successfully"
  else
    log_error "Failed to pull nomic-embed-text"
    exit 1
  fi

  # List available models
  log_info "Available models:"
  ollama list
}

# Deploy with Docker
deploy_docker() {
  log_info "Deploying with Docker Compose..."

  # Build images
  log_info "Building Docker images..."
  docker-compose build

  # Start services
  log_info "Starting services..."
  docker-compose up -d

  # Wait for Ollama to be healthy
  if [ "$PROVIDER_MODE" == "--local" ]; then
    log_info "Waiting for Ollama to be ready..."
    for i in {1..30}; do
      if docker-compose exec -T ollama curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log_success "Ollama is ready"
        break
      fi
      echo -n "."
      sleep 2
    done
    echo ""

    # Pull models inside container
    if [ "$PULL_MODELS" == "--pull-models" ]; then
      log_info "Pulling models in Ollama container..."
      docker-compose exec -T ollama ollama pull nomic-embed-text
      log_success "Models pulled"
    fi
  fi

  # Wait for backend to be healthy
  log_info "Waiting for backend to be ready..."
  for i in {1..30}; do
    if curl -s http://localhost:6001/health > /dev/null 2>&1; then
      log_success "Backend is ready"
      break
    fi
    echo -n "."
    sleep 2
  done
  echo ""

  # Show status
  docker-compose ps

  log_success "Deployment complete!"
  log_info "Backend API: http://localhost:6001"
  log_info "Ollama API: http://localhost:11434"
  log_info ""
  log_info "Check logs:"
  log_info "  docker-compose logs -f gkchatty-backend"
  log_info "  docker-compose logs -f ollama"
}

# Deploy without Docker
deploy_local() {
  log_info "Deploying in local dev mode..."

  # Install dependencies
  log_info "Installing dependencies..."
  npm install

  # Build TypeScript
  log_info "Building TypeScript..."
  npm run build

  # Start application with PM2 (if available) or node
  if command -v pm2 &> /dev/null; then
    log_info "Starting with PM2..."
    pm2 stop gkchatty-backend || true
    pm2 start dist/index.js --name gkchatty-backend
    pm2 save
    log_success "Started with PM2"
    log_info "View logs: pm2 logs gkchatty-backend"
  else
    log_info "PM2 not found. Starting with node..."
    log_warning "For production, install PM2: npm install -g pm2"
    node dist/index.js &
    echo $! > .pid
    log_success "Started with node (PID: $(cat .pid))"
    log_info "Stop with: kill $(cat .pid)"
  fi
}

# Health check
health_check() {
  log_info "Running health checks..."

  # Check backend
  if curl -s http://localhost:6001/health > /dev/null 2>&1; then
    log_success "Backend is healthy"
  else
    log_error "Backend is not responding"
    return 1
  fi

  # Check provider
  local provider_info=$(curl -s http://localhost:6001/api/embeddings/info -H "Authorization: Bearer test" || echo "{}")
  local active_provider=$(echo "$provider_info" | grep -o '"activeProvider":"[^"]*"' | cut -d'"' -f4)

  if [ -n "$active_provider" ]; then
    log_success "Active provider: $active_provider"
  else
    log_warning "No active provider detected"
  fi

  # Test embedding generation
  log_info "Testing embedding generation..."
  if curl -s http://localhost:6001/api/embeddings/test \
    -H "Authorization: Bearer test" \
    -H "Content-Type: application/json" \
    -d "{\"providerId\":\"$active_provider\"}" \
    | grep -q '"healthy":true'; then
    log_success "Embedding generation works"
  else
    log_warning "Embedding generation test failed"
  fi
}

# Main execution
main() {
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  GKChatty Local - Deployment Script"
  echo "═══════════════════════════════════════════"
  echo ""

  check_prerequisites
  setup_environment

  if [ "$PROVIDER_MODE" == "--local" ]; then
    pull_ollama_models
  fi

  if [ "$NO_DOCKER" == "--no-docker" ]; then
    deploy_local
  else
    deploy_docker
  fi

  echo ""
  health_check

  echo ""
  echo "═══════════════════════════════════════════"
  log_success "Deployment successful!"
  echo "═══════════════════════════════════════════"
  echo ""
}

# Run main function
main
