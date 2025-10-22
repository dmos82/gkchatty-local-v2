#!/bin/bash

echo "🚀 Starting GKChatty Ecosystem"
echo "======================================"
echo ""

# Check if MongoDB is running
echo -n "Checking MongoDB... "
if ! mongosh --eval "db.version()" --quiet > /dev/null 2>&1; then
    echo "❌ MongoDB is not running!"
    echo "   Start it with: brew services start mongodb-community"
    exit 1
fi
echo "✅"

echo ""
echo "Starting services..."
echo ""

# Start backend
echo "📡 Starting Backend API (http://localhost:4001)..."
cd packages/backend && pnpm run dev &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to start..."
sleep 5

# Start web
echo "🌐 Starting Web Frontend (http://localhost:4003)..."
cd ../web && pnpm run dev &
WEB_PID=$!

echo ""
echo "======================================"
echo "✅ All services started!"
echo ""
echo "📡 Backend API:  http://localhost:4001"
echo "🌐 Web Frontend: http://localhost:4003"
echo ""
echo "Process IDs:"
echo "  Backend: $BACKEND_PID"
echo "  Web:     $WEB_PID"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for processes
wait
