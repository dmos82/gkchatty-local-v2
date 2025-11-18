# Enterprise Hybrid RAG - Automated Testing Guide

**Date:** 2025-01-16
**Bug Fixed:** #6 - allowGeneralQuestions toggle not working
**Solution:** Enterprise Hybrid RAG with three modes

---

## 🎯 Testing Strategy

This guide explains how to test the Enterprise Hybrid RAG implementation using automated Playwright tests that:

✅ **Authenticate via API** (dev/dev123)
✅ **Toggle feature flags programmatically**
✅ **Verify all three RAG modes work correctly**
✅ **Capture screenshots for visual verification**
✅ **Test both API and UI flows**

---

## 🚀 Quick Start

### Prerequisites

1. **Backend running** on `http://localhost:4001`
2. **Frontend running** on `http://localhost:4003`
3. **Playwright installed** (`pnpm add -D -w @playwright/test`)

### Run All Tests

```bash
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem/gkchatty-local
npx playwright test tests/enterprise-rag.spec.ts
```

### Run Individual Test

```bash
# Test Mode 1: Strict RAG-Only
npx playwright test tests/enterprise-rag.spec.ts -g "Mode 1"

# Test Mode 2: Docs-First Hybrid
npx playwright test tests/enterprise-rag.spec.ts -g "Mode 2"

# Test Mode 3: General Knowledge
npx playwright test tests/enterprise-rag.spec.ts -g "Mode 3"
```

### View Test Report

```bash
npx playwright show-report tests/playwright-report
```

---

## 📋 Test Scenarios

### Phase 1: Pre-Test Verification
**What it does:**
- Authenticates as dev/dev123
- Retrieves current feature flag state
- Verifies API structure

**Expected output:**
```
✅ Login successful, token obtained
📊 Current feature flags: {
  features: {
    ollama: true,
    smartRouting: false,
    showModelUsed: true,
    allowGeneralQuestions: false  // Current state
  }
}
```

---

### Mode 1: Strict RAG-Only (Compliance Mode)
**Scenario:** Feature toggle OFF + no relevant docs

**Steps:**
1. Set `allowGeneralQuestions: false` via API
2. Ask: "What is the capital of France?" (no docs exist)
3. Verify response contains "no matching information"
4. Verify response does NOT contain "Paris"

**Expected response:**
```
No matching information found in the knowledge base.
This question may be outside the scope of available documentation.
Try rephrasing or enable "Allow General Questions" to use general knowledge.
```

**Screenshot:** `tests/screenshots/mode1-strict-rag-only.png`

**Logs to verify:**
```
[Chat Route] RAG-only mode: No relevant sources, returning no-sources message
ragMode: 'strict-rag-only'
sourcesSearched: 5
relevantSourcesFound: 0
minScoreRequired: 0.7
```

---

### Mode 2: Docs-First Hybrid
**Scenario:** Feature toggle ON + has relevant docs

**Steps:**
1. Set `allowGeneralQuestions: true` via API
2. Ask: "What is GKChatty?" (assuming docs exist)
3. Verify response uses docs OR general knowledge (gracefully)
4. Check if response cites documents

**Expected response (if docs found):**
```
According to the provided documentation, GKChatty is...
```

**Expected response (if no docs found):**
```
I don't have specific documents about this, but I can help based on general knowledge: ...
```

**Screenshot:** `tests/screenshots/mode2-docs-first-hybrid.png`

**Logs to verify:**
```
[Chat Route] Using docs-first hybrid mode
ragMode: 'docs-first-hybrid'
relevantSourcesUsed: 3
```

---

### Mode 3: General Knowledge Fallback
**Scenario:** Feature toggle ON + no relevant docs

**Steps:**
1. Set `allowGeneralQuestions: true` via API
2. Ask: "What is the capital of Spain?" (no docs exist)
3. Verify response contains "Madrid"
4. Verify response indicates general knowledge usage

**Expected response:**
```
I don't have specific documents about this, but I can help based on general knowledge:
The capital of Spain is Madrid.
```

**Screenshot:** `tests/screenshots/mode3-general-knowledge.png`

**Logs to verify:**
```
[Chat Route] Using general knowledge mode (no relevant sources)
ragMode: 'general-knowledge'
sourcesSearched: 5
relevantSourcesFound: 0
```

---

## 🔧 Test Architecture

### Authentication Flow
```typescript
// Login via API
POST http://localhost:4001/api/auth/login
Body: { username: "dev", password: "dev123" }
Response: { success: true, token: "eyJhbGc..." }

// Use token for all subsequent requests
Headers: { Authorization: "Bearer eyJhbGc..." }
```

### Feature Flag Management
```typescript
// Get current flags
GET http://localhost:4001/api/settings/features
Response: {
  success: true,
  features: { allowGeneralQuestions: false }
}

// Update flag
PUT http://localhost:4001/api/settings/features
Body: { allowGeneralQuestions: true }
```

### Chat API
```typescript
// Send message
POST http://localhost:4001/api/chat
Body: {
  query: "What is the capital of France?",
  knowledgeBaseTarget: "system"
}
Response: {
  success: true,
  answer: "No matching information found...",
  sources: [],
  modelUsed: "gpt-4o-mini"
}
```

---

## 📸 Screenshots

All tests automatically capture screenshots in `tests/screenshots/`:

1. `mode1-strict-rag-only.png` - No sources message
2. `mode2-docs-first-hybrid.png` - Docs-first response
3. `mode3-general-knowledge.png` - General knowledge response
4. `ui-chat-flow.png` - Full UI interaction

---

## 🐛 Troubleshooting

### Issue: "Login failed"
**Solution:** Verify dev user exists with password dev123
```bash
# Check MongoDB
mongosh gkchatty
db.users.findOne({ username: "dev" })
```

### Issue: "Feature flag not updating"
**Solution:** Check MongoDB feature flags collection
```bash
mongosh gkchatty
db.featureflags.find()
```

### Issue: "Chat input not found"
**Solution:** Frontend might not be running or route changed
```bash
# Verify frontend
curl http://localhost:4003/chat
```

### Issue: "Test timeout"
**Solution:** Backend might be slow (LLM call)
- Increase timeout in test
- Check backend logs for errors

---

## 📊 Expected Test Results

### All Tests Passing
```
Running 5 tests using 1 worker

✓ Phase 1: Verify initial feature flag state (107ms)
✓ Mode 1: Strict RAG-Only (allowGeneralQuestions: false) (2.5s)
✓ Mode 2: Docs-First Hybrid (allowGeneralQuestions: true + has docs) (3.2s)
✓ Mode 3: General Knowledge (allowGeneralQuestions: true + no docs) (2.8s)
✓ Phase 5: Test UI Chat Flow with Playwright (6.5s)

5 passed (15.2s)
```

### Test Coverage

| Feature | API Tests | UI Tests | Screenshots |
|---------|-----------|----------|-------------|
| Login | ✅ | ✅ | ✅ |
| Feature Flags | ✅ | ❌ | ❌ |
| Mode 1 (Strict RAG) | ✅ | ✅ | ✅ |
| Mode 2 (Docs-First) | ✅ | ✅ | ✅ |
| Mode 3 (General Knowledge) | ✅ | ✅ | ✅ |
| Chat UI Flow | ❌ | ✅ | ✅ |

---

## 🎬 Next Steps

1. **Run the tests:** `npx playwright test tests/enterprise-rag.spec.ts`
2. **Review screenshots:** Check `tests/screenshots/` folder
3. **Verify logs:** Check backend logs for RAG mode indicators
4. **Manual verification:** Test in the UI at http://localhost:4003/chat

---

## 📝 Manual Testing Checklist

For additional manual verification:

- [ ] Login as dev/dev123
- [ ] Navigate to Settings → Feature Flags
- [ ] Toggle "Allow General Questions" OFF
- [ ] Ask: "What is the capital of France?"
- [ ] Verify: "No matching information" message
- [ ] Toggle "Allow General Questions" ON
- [ ] Ask: "What is the capital of Spain?"
- [ ] Verify: "Madrid" with general knowledge indicator
- [ ] Check console logs for `ragMode:` entries

---

**Report Generated:** 2025-01-16
**Test Suite:** `tests/enterprise-rag.spec.ts`
**Configuration:** `playwright.config.ts`
**Status:** ✅ Ready for automated testing
