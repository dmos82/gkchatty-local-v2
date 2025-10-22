#!/bin/bash
set -e

echo "🚀 GKChatty Ecosystem - One-Command Setup"
echo "=========================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is required but not installed."
    echo "   Download: https://nodejs.org/"
    exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "❌ pnpm is required but not installed."
    echo "   Install: npm install -g pnpm"
    exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
    echo "⚠️  MongoDB is not installed."
    echo "   Install: brew install mongodb-community"
    echo "   Continue anyway? (y/n)"
    read -r response
    if [[ "$response" != "y" ]]; then
        exit 1
    fi
fi

echo "✅ Prerequisites OK"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

echo "✅ Dependencies installed"
echo ""

# Build shared package first
echo "🔨 Building shared package..."
cd packages/shared && pnpm run build && cd ../..

echo "✅ Shared package built"
echo ""

# Setup environment
if [ ! -f packages/backend/.env ]; then
    echo "⚙️  Setting up environment..."
    cp packages/backend/.env.example packages/backend/.env
    echo "⚠️  IMPORTANT: Edit packages/backend/.env with your API keys!"
    echo "   Required: PINECONE_API_KEY, OPENAI_API_KEY, JWT_SECRET"
else
    echo "✅ Environment file exists"
fi

echo ""

# Run health check
echo "🏥 Running health check..."
./scripts/health-check.sh || echo "⚠️  Some services not running (expected on first install)"

echo ""
echo "======================================"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit packages/backend/.env with your API keys"
echo "2. Start MongoDB: brew services start mongodb-community"
echo "3. Start services: ./scripts/start.sh"
echo "4. Check health: ./scripts/health-check.sh"
echo ""
