#!/bin/bash

##
# GKChatty Local - API Testing Script
# Tests all 6 REST API endpoints
##

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="http://localhost:6001"
# Replace with actual token if authentication is enabled
TOKEN="test-token"

echo "══════════════════════════════════════════"
echo "  GKChatty Local - API Test Suite"
echo "══════════════════════════════════════════"
echo ""

# Test 1: Health Check
echo -e "${BLUE}[Test 1/6]${NC} Health Check"
if curl -s "$BASE_URL/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ PASS${NC} - Backend is healthy"
else
  echo -e "${RED}❌ FAIL${NC} - Backend not responding"
  exit 1
fi
echo ""

# Test 2: List Providers
echo -e "${BLUE}[Test 2/6]${NC} List Providers"
PROVIDERS=$(curl -s "$BASE_URL/api/embeddings/providers" \
  -H "Authorization: Bearer $TOKEN" || echo "{}")
if echo "$PROVIDERS" | grep -q "providers"; then
  echo -e "${GREEN}✅ PASS${NC} - Providers endpoint works"
  echo "$PROVIDERS" | jq '.providers[] | {id, name, type}' 2>/dev/null || echo "$PROVIDERS"
else
  echo -e "${RED}❌ FAIL${NC} - Could not list providers"
fi
echo ""

# Test 3: Scan for Models
echo -e "${BLUE}[Test 3/6]${NC} Scan for Models"
SCAN=$(curl -s -X POST "$BASE_URL/api/embeddings/scan" \
  -H "Authorization: Bearer $TOKEN" || echo "{}")
if echo "$SCAN" | grep -q "localModels"; then
  echo -e "${GREEN}✅ PASS${NC} - Model scan works"
  echo "$SCAN" | jq '{localModels, apiProviders, recommended}' 2>/dev/null || echo "$SCAN"
else
  echo -e "${RED}⚠️  WARN${NC} - Scan returned unexpected response"
fi
echo ""

# Test 4: Get System Info
echo -e "${BLUE}[Test 4/6]${NC} Get System Info"
INFO=$(curl -s "$BASE_URL/api/embeddings/info" \
  -H "Authorization: Bearer $TOKEN" || echo "{}")
if echo "$INFO" | grep -q "storageMode"; then
  echo -e "${GREEN}✅ PASS${NC} - System info endpoint works"
  echo "$INFO" | jq '{storageMode, activeProvider, providerInfo}' 2>/dev/null || echo "$INFO"
else
  echo -e "${RED}❌ FAIL${NC} - Could not get system info"
fi
echo ""

# Test 5: Test Provider Health (if provider exists)
echo -e "${BLUE}[Test 5/6]${NC} Test Provider Health"
ACTIVE_PROVIDER=$(echo "$INFO" | jq -r '.activeProvider' 2>/dev/null || echo "")
if [ -n "$ACTIVE_PROVIDER" ] && [ "$ACTIVE_PROVIDER" != "null" ]; then
  HEALTH=$(curl -s -X POST "$BASE_URL/api/embeddings/test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"providerId\":\"$ACTIVE_PROVIDER\"}" || echo "{}")

  if echo "$HEALTH" | grep -q "healthy"; then
    HEALTHY=$(echo "$HEALTH" | jq -r '.healthy' 2>/dev/null)
    if [ "$HEALTHY" = "true" ]; then
      echo -e "${GREEN}✅ PASS${NC} - Provider $ACTIVE_PROVIDER is healthy"
      echo "$HEALTH" | jq '{providerId, latency, dimensions}' 2>/dev/null || echo "$HEALTH"
    else
      echo -e "${RED}⚠️  WARN${NC} - Provider $ACTIVE_PROVIDER is unhealthy"
      echo "$HEALTH" | jq '.error' 2>/dev/null || echo "$HEALTH"
    fi
  else
    echo -e "${RED}❌ FAIL${NC} - Health check failed"
  fi
else
  echo -e "${RED}⚠️  SKIP${NC} - No active provider to test"
fi
echo ""

# Test 6: Benchmark (if provider exists)
echo -e "${BLUE}[Test 6/6]${NC} Performance Benchmark"
if [ -n "$ACTIVE_PROVIDER" ] && [ "$ACTIVE_PROVIDER" != "null" ]; then
  echo "Running benchmark with 10 samples (this may take 10-30 seconds)..."
  BENCH=$(curl -s "$BASE_URL/api/embeddings/benchmark?samples=10" \
    -H "Authorization: Bearer $TOKEN" || echo "{}")

  if echo "$BENCH" | grep -q "avgLatency"; then
    echo -e "${GREEN}✅ PASS${NC} - Benchmark completed"
    echo "$BENCH" | jq '{providerId, samples, avgLatency, throughput, dimensions}' 2>/dev/null || echo "$BENCH"
  else
    echo -e "${RED}❌ FAIL${NC} - Benchmark failed"
  fi
else
  echo -e "${RED}⚠️  SKIP${NC} - No active provider for benchmarking"
fi
echo ""

echo "══════════════════════════════════════════"
echo -e "${GREEN}API Testing Complete!${NC}"
echo "══════════════════════════════════════════"
