# GKChatty Ecosystem - Comprehensive Stress Test Plan

**Date:** 2025-10-22
**Purpose:** Validate production-readiness of monorepo after migration
**Target:** Achieve 9/10 stability rating

---

## 🎯 Test Objectives

1. **Verify Monorepo Integration** - All packages work together
2. **Load Testing** - System handles concurrent requests
3. **MCP Integration** - RAG tools work with Claude Code
4. **Version Stability** - Locked dependencies prevent drift
5. **Recovery** - System handles failures gracefully

---

## 📋 Pre-Test Checklist

- [x] MongoDB running (localhost:27017)
- [x] Backend API running (localhost:4001)
- [x] Web frontend running (localhost:4003)
- [x] Dependencies installed (pnpm install)
- [ ] **MCPs pointing to monorepo** (CRITICAL - currently using globals!)
- [ ] Test data seeded
- [ ] Health check passing

---

## Phase 1: Functional Testing (30 mins)

### 1.1 Backend API Tests

**Endpoint Coverage:**
```bash
# Health check
curl http://localhost:4001/api/health

# Auth endpoints
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/verify

# User endpoints
GET  /api/users/:id
PUT  /api/users/:id

# Document endpoints
POST /api/documents/upload
GET  /api/documents
GET  /api/documents/:id
DELETE /api/documents/:id

# RAG endpoints
POST /api/chat
POST /api/chat/stream
GET  /api/chat/history

# Knowledge base endpoints
GET  /api/knowledgebases
POST /api/knowledgebases
GET  /api/knowledgebases/:id
PUT  /api/knowledgebases/:id
DELETE /api/knowledgebases/:id
```

**Expected Results:**
- ✅ All endpoints return proper status codes
- ✅ Authentication works (JWT tokens)
- ✅ Database operations succeed
- ✅ Error handling returns proper messages

### 1.2 Frontend Tests

**User Flows:**
1. Load homepage → Verify UI renders
2. Register new user → Verify account creation
3. Login → Verify session handling
4. Upload document → Verify file processing
5. Chat with RAG → Verify streaming responses
6. Logout → Verify session cleanup

**Expected Results:**
- ✅ No console errors
- ✅ All pages load < 2 seconds
- ✅ Forms validate properly
- ✅ WebSocket connections stable

### 1.3 MCP Tests (CRITICAL)

**Test Cases:**
```javascript
// Test 1: Query GKChatty
mcp__gkchatty-kb__query_gkchatty({
  query: "What is GKChatty?"
})

// Test 2: Upload document
mcp__gkchatty-kb__upload_to_gkchatty({
  file_path: "/path/to/test.pdf"
})

// Test 3: Search knowledge base
mcp__gkchatty-kb__search_gkchatty({
  query: "insurance policy"
})

// Test 4: Code review
mcp__builder-pro-mcp__review_file({
  filePath: "packages/backend/src/index.ts"
})

// Test 5: Security scan
mcp__builder-pro-mcp__security_scan({
  code: "const password = 'hardcoded123';"
})
```

**Expected Results:**
- ✅ MCP tools connect successfully
- ✅ Query responses are accurate
- ✅ File uploads work with cookie auth
- ✅ RAG retrieval returns relevant docs
- ✅ No version conflicts

---

## Phase 2: Load Testing (30 mins)

### 2.1 Concurrent Users

**Scenario:** 50 concurrent users, 5 minutes
```bash
# Install load testing tool
npm install -g artillery

# Run test
artillery quick --count 50 --num 300 http://localhost:4001/api/health
```

**Metrics to Track:**
- Response time (p50, p95, p99)
- Throughput (requests/sec)
- Error rate
- Memory usage
- CPU usage

**Expected Results:**
- ✅ p95 response time < 500ms
- ✅ Error rate < 1%
- ✅ No memory leaks
- ✅ System remains stable

### 2.2 Document Upload Stress

**Scenario:** 20 concurrent document uploads
```bash
# Create test files
for i in {1..20}; do
  echo "Test document $i content..." > test-doc-$i.txt
done

# Upload concurrently
for i in {1..20}; do
  curl -X POST http://localhost:4001/api/documents/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test-doc-$i.txt" &
done
wait
```

**Expected Results:**
- ✅ All uploads succeed
- ✅ Files processed correctly
- ✅ Vector embeddings created
- ✅ No database deadlocks

### 2.3 RAG Query Stress

**Scenario:** 100 sequential RAG queries
```bash
# Rapid-fire queries
for i in {1..100}; do
  curl -X POST http://localhost:4001/api/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"message":"What is insurance?","kbId":"test-kb"}' &
done
wait
```

**Expected Results:**
- ✅ All queries complete
- ✅ Responses are coherent
- ✅ Pinecone rate limits not hit
- ✅ OpenAI API stable

---

## Phase 3: Integration Testing (30 mins)

### 3.1 MCP + Backend Integration

**Test Flow:**
1. Use MCP to upload document
2. Verify document appears in backend
3. Query document via MCP
4. Verify response matches backend data

**Expected Results:**
- ✅ Data consistency across MCP and API
- ✅ Cookie authentication works
- ✅ No version conflicts
- ✅ Error messages are clear

### 3.2 Version Stability Test

**Test:**
```bash
# Verify locked versions
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem
grep -r '"version":' packages/*/package.json

# Check for version drift
pnpm list --depth=0

# Verify no ^ or ~ in dependencies
grep -r '"\^' packages/*/package.json
grep -r '"~' packages/*/package.json
```

**Expected Results:**
- ✅ All versions are exact (no ^ or ~)
- ✅ `pnpm list` shows locked versions
- ✅ No unexpected updates

### 3.3 Recovery Testing

**Scenarios:**
1. Kill backend → Restart → Verify data intact
2. Fill disk (simulate) → Verify graceful error
3. Kill MongoDB → Restart → Verify reconnection
4. Invalid API keys → Verify error handling

**Expected Results:**
- ✅ System recovers automatically
- ✅ No data corruption
- ✅ Error logs are helpful
- ✅ Health check detects issues

---

## Phase 4: Performance Benchmarks (15 mins)

### 4.1 Baseline Metrics

**Record:**
- Cold start time (services from stopped)
- Warm start time (services already running)
- First query response time
- Average query response time (100 queries)
- Memory usage (idle)
- Memory usage (under load)

**Target Benchmarks:**
- Cold start: < 30 seconds
- Warm start: < 5 seconds
- First query: < 3 seconds
- Average query: < 1 second
- Idle memory: < 500 MB
- Load memory: < 2 GB

### 4.2 Comparison with OLD System

**Before Monorepo:**
- Global packages (version drift)
- Cookie auth broken
- No health checks
- Manual dependency management

**After Monorepo:**
- Local packages (locked versions)
- Cookie auth fixed
- Automated health checks
- Workspace management

**Expected Improvement:**
- ✅ 50% fewer "it broke randomly" incidents
- ✅ 80% faster troubleshooting
- ✅ 100% reproducible builds

---

## 🚨 Critical Issues to Watch

1. **MCP Global vs Local**
   - Current: MCPs use `npx` (global packages)
   - Target: MCPs use monorepo local packages
   - Risk: Version mismatch, random failures

2. **Cookie Authentication**
   - Current: Fixed in local packages
   - Risk: Global packages still have bug
   - Test: Upload document via MCP

3. **Port Conflicts**
   - Backend: 4001
   - Frontend: 4003
   - MongoDB: 27017
   - Risk: Services already running elsewhere

4. **Environment Variables**
   - Required: PINECONE_API_KEY, OPENAI_API_KEY, JWT_SECRET
   - Risk: Missing or invalid keys

5. **Memory Leaks**
   - Watch: Node.js process memory over time
   - Risk: Crashes after extended use

---

## 📊 Success Criteria

### Must Pass (P0)
- [ ] All backend endpoints return 200 OK
- [ ] Frontend loads without errors
- [ ] MCPs connect successfully
- [ ] File upload works via MCP
- [ ] RAG queries return accurate results
- [ ] No version conflicts detected

### Should Pass (P1)
- [ ] Load test completes without errors
- [ ] p95 response time < 500ms
- [ ] No memory leaks detected
- [ ] Health check detects all issues
- [ ] Recovery scenarios work

### Nice to Have (P2)
- [ ] Benchmarks meet targets
- [ ] 50% improvement over old system
- [ ] Documentation complete
- [ ] CI/CD pipeline ready

---

## 🎯 Post-Test Actions

### If All Tests Pass (9/10 stability)
1. Tag release: `git tag v1.0.0-stable`
2. Update PROGRESS.md to 100%
3. Create LAUNCH-CHECKLIST.md
4. Deploy to production

### If Tests Fail (< 7/10 stability)
1. Document all failures in ISSUES.md
2. Prioritize by severity (P0, P1, P2)
3. Fix P0 issues immediately
4. Rerun stress test
5. Repeat until 9/10 achieved

---

## 📝 Test Execution Log

**Test Run:** #1
**Date:** 2025-10-22
**Tester:** SuperClaude + David

### Phase 1 Results
- [ ] Backend API: ___ / ___ endpoints passed
- [ ] Frontend: ___ / ___ flows passed
- [ ] MCP: ___ / ___ tests passed

### Phase 2 Results
- [ ] Load test: ___ req/sec, ___ errors
- [ ] Upload stress: ___ / 20 succeeded
- [ ] Query stress: ___ / 100 succeeded

### Phase 3 Results
- [ ] MCP integration: ___
- [ ] Version stability: ___
- [ ] Recovery: ___ / 4 scenarios passed

### Phase 4 Results
- [ ] Cold start: ___ seconds
- [ ] Warm start: ___ seconds
- [ ] First query: ___ seconds
- [ ] Average query: ___ seconds

### Final Score
**Stability Rating:** ___ / 10

**Critical Issues Found:**
1.
2.
3.

**Recommendations:**
1.
2.
3.

---

*Ready to execute? Run: `./scripts/stress-test.sh`*
