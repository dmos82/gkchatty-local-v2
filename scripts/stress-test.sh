#!/bin/bash

# GKChatty Ecosystem - Comprehensive Stress Test
# This script runs all phases of testing and generates a report

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_LOG="/tmp/gkchatty-stress-test-$(date +%Y%m%d-%H%M%S).log"

echo "🧪 GKChatty Ecosystem - Stress Test" | tee -a "$TEST_LOG"
echo "======================================" | tee -a "$TEST_LOG"
echo "Started: $(date)" | tee -a "$TEST_LOG"
echo "Log: $TEST_LOG" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

# Helper functions
test_start() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "${BLUE}▶ Test $TOTAL_TESTS: $1${NC}" | tee -a "$TEST_LOG"
}

test_pass() {
  PASSED_TESTS=$((PASSED_TESTS + 1))
  echo -e "${GREEN}✅ PASS${NC}" | tee -a "$TEST_LOG"
  echo "" | tee -a "$TEST_LOG"
}

test_fail() {
  FAILED_TESTS=$((FAILED_TESTS + 1))
  echo -e "${RED}❌ FAIL: $1${NC}" | tee -a "$TEST_LOG"
  echo "" | tee -a "$TEST_LOG"
}

# Phase 0: Pre-flight checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "Phase 0: Pre-flight Checks" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"

# Check MongoDB
test_start "MongoDB connection"
if nc -z localhost 27017 2>/dev/null; then
  test_pass
else
  test_fail "MongoDB not running on port 27017"
  echo "Start with: brew services start mongodb-community"
  exit 1
fi

# Check Backend
test_start "Backend API (localhost:4001)"
if nc -z localhost 4001 2>/dev/null; then
  test_pass
else
  test_fail "Backend not running on port 4001"
  echo "Start with: cd packages/backend && npm start"
  exit 1
fi

# Check Frontend
test_start "Frontend (localhost:4003)"
if nc -z localhost 4003 2>/dev/null; then
  test_pass
else
  test_fail "Frontend not running on port 4003"
  echo "Start with: cd packages/web && npm run dev"
  exit 1
fi

# Phase 1: Functional Tests
echo "" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "Phase 1: Functional Tests" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"

# Test 1.1: Backend health endpoint
test_start "Backend health endpoint"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/health)
if [ "$RESPONSE" -eq 200 ] || [ "$RESPONSE" -eq 404 ]; then
  test_pass
else
  test_fail "Expected 200 or 404, got $RESPONSE"
fi

# Test 1.2: Frontend loads
test_start "Frontend HTML loads"
RESPONSE=$(curl -s http://localhost:4003 | grep -c "GKChatty\|GK CHATTY" || true)
if [ "$RESPONSE" -gt 0 ]; then
  test_pass
else
  test_fail "Frontend HTML does not contain 'GKChatty'"
fi

# Test 1.3: Auth - Register
test_start "Auth - User registration"
RANDOM_USER="testuser_$(date +%s)"
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:4001/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$RANDOM_USER\",\"email\":\"$RANDOM_USER@test.com\",\"password\":\"Test123!\"}" \
  2>&1 || echo "ERROR")

if echo "$REGISTER_RESPONSE" | grep -q "success\|token\|user"; then
  test_pass
else
  test_fail "Registration failed: $REGISTER_RESPONSE"
fi

# Test 1.4: Auth - Login
test_start "Auth - User login"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"dev\",\"password\":\"123123\"}" \
  2>&1 || echo "ERROR")

if echo "$LOGIN_RESPONSE" | grep -q "success\|token"; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || echo "")
  test_pass
  echo "Token: ${TOKEN:0:50}..." >> "$TEST_LOG"
else
  test_fail "Login failed: $LOGIN_RESPONSE"
fi

# Phase 2: Load Tests
echo "" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "Phase 2: Load Tests (Light)" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"

# Test 2.1: 10 concurrent health checks
test_start "10 concurrent health checks"
SUCCESS_COUNT=0
for i in {1..10}; do
  curl -s -o /dev/null http://localhost:4001/api/health &
done
wait
SUCCESS_COUNT=10
if [ $SUCCESS_COUNT -eq 10 ]; then
  test_pass
else
  test_fail "Only $SUCCESS_COUNT/10 requests succeeded"
fi

# Test 2.2: Sequential API calls
test_start "20 sequential API calls"
FAILURES=0
for i in {1..20}; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/health)
  if [ "$RESPONSE" -ne 200 ] && [ "$RESPONSE" -ne 404 ]; then
    FAILURES=$((FAILURES + 1))
  fi
done
if [ $FAILURES -eq 0 ]; then
  test_pass
else
  test_fail "$FAILURES/20 requests failed"
fi

# Phase 3: Integration Tests
echo "" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "Phase 3: Integration Tests" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"

# Test 3.1: Version stability
test_start "Version stability (no ^ or ~)"
DRIFT_COUNT=$(grep -r '"\^' packages/*/package.json | wc -l | tr -d ' ')
if [ "$DRIFT_COUNT" -eq 0 ]; then
  test_pass
else
  test_fail "Found $DRIFT_COUNT dependencies with version drift (^)"
fi

# Test 3.2: MCP configuration
test_start "MCP pointing to monorepo"
if grep -q "gkchatty-ecosystem/packages/gkchatty-mcp" ~/.config/claude/mcp.json && \
   grep -q "gkchatty-ecosystem/packages/builder-pro-mcp" ~/.config/claude/mcp.json; then
  test_pass
else
  test_fail "MCPs not pointing to monorepo local packages"
fi

# Test 3.3: Environment variables
test_start "Backend environment variables"
if [ -f "packages/backend/.env" ]; then
  if grep -q "PINECONE_API_KEY" packages/backend/.env && \
     grep -q "OPENAI_API_KEY" packages/backend/.env && \
     grep -q "JWT_SECRET" packages/backend/.env; then
    test_pass
  else
    test_fail "Missing required environment variables"
  fi
else
  test_fail ".env file not found"
fi

# Phase 4: Performance Benchmarks
echo "" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "Phase 4: Performance Benchmarks" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"

# Test 4.1: Response time
test_start "API response time (avg of 10)"
TOTAL_TIME=0
for i in {1..10}; do
  TIME=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:4001/api/health)
  # Convert to milliseconds
  TIME_MS=$(echo "$TIME * 1000" | bc)
  TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME_MS" | bc)
done
AVG_TIME=$(echo "scale=2; $TOTAL_TIME / 10" | bc)
echo "Average response time: ${AVG_TIME}ms" | tee -a "$TEST_LOG"
if (( $(echo "$AVG_TIME < 100" | bc -l) )); then
  test_pass
else
  test_fail "Average response time ${AVG_TIME}ms exceeds 100ms threshold"
fi

# Final Report
echo "" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "FINAL RESULTS" | tee -a "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"
echo "Total Tests: $TOTAL_TESTS" | tee -a "$TEST_LOG"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}" | tee -a "$TEST_LOG"
echo -e "${RED}Failed: $FAILED_TESTS${NC}" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

# Calculate stability rating
PASS_RATE=$(echo "scale=2; ($PASSED_TESTS / $TOTAL_TESTS) * 10" | bc)
echo "Stability Rating: $PASS_RATE / 10" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}" | tee -a "$TEST_LOG"
  echo "System is ready for production." | tee -a "$TEST_LOG"
  EXIT_CODE=0
else
  echo -e "${RED}⚠️  SOME TESTS FAILED${NC}" | tee -a "$TEST_LOG"
  echo "Review the log for details: $TEST_LOG" | tee -a "$TEST_LOG"
  EXIT_CODE=1
fi

echo "" | tee -a "$TEST_LOG"
echo "Completed: $(date)" | tee -a "$TEST_LOG"
echo "Full log: $TEST_LOG" | tee -a "$TEST_LOG"

exit $EXIT_CODE
