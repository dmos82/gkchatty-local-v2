# GKChatty-Pure Implementation Plan

**Project:** gkchatty-pure Backend Clean Rebuild
**Date:** 2025-11-11
**Status:** Ready for Implementation
**Estimated Effort:** 16-20 hours across 5 sessions

---

## Executive Summary
- **Total Steps:** 47 actionable steps across 5 phases
- **Estimated Time:** 16-20 hours
- **Critical Path:** Setup → Decontamination → Expansion → Integration → Validation
- **Risk Areas:**
  - `chatService.ts` (complex OpenAI removal)
  - `documentProcessingService.ts` (S3 removal + local filesystem)
  - Frontend-backend integration (CORS, auth flow)

**Key Insight:** This is NOT a greenfield rebuild. 86% of code exists and is reusable. We only need to:
1. Decontaminate 15 files (4-6 hours)
2. Expand 10 files (8-10 hours)
3. Integrate and validate (4 hours)

---

## Phase 1: Setup & Validation (1-2 hours)

### Step 1.1: Verify Ollama Installation and Models
**Objective:** Ensure Ollama is running and required models are available

**Current State:** Ollama may or may not be installed/running

**Actions:**
1. Check Ollama installation:
```bash
which ollama
ollama --version
```

2. Verify Ollama service:
```bash
curl http://localhost:11434/api/tags
```

3. Pull required models:
```bash
ollama pull llama2  # Chat model
ollama pull nomic-embed-text  # Embedding model
```

**Acceptance Criteria:**
- [x] Ollama binary found
- [x] Ollama service responds on port 11434
- [x] Both required models downloaded

**Validation:**
```bash
ollama list | grep -E "(llama2|nomic-embed-text)"
```

**Time Estimate:** 0.25 hours
**Dependencies:** None
**Rollback:** N/A (no changes made)

---

### Step 1.2: Run Audit Script and Document Current Contamination
**Objective:** Establish baseline contamination level before cleanup

**Current State:** Unknown contamination status

**Actions:**
1. Make audit script executable:
```bash
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-pure/backend
chmod +x ../scripts/audit-local.sh
```

2. Run audit and save output:
```bash
../scripts/audit-local.sh > audit-baseline.txt 2>&1
```

3. Review contamination report:
```bash
cat audit-baseline.txt | grep -A 5 "CONTAMINATION"
```

**Acceptance Criteria:**
- [x] Audit script runs successfully
- [x] Baseline contamination documented
- [x] Known issues match discovery report

**Validation:**
```bash
test -f audit-baseline.txt && echo "Baseline captured"
```

**Time Estimate:** 0.25 hours
**Dependencies:** Step 1.1 (Ollama verification)
**Rollback:** Delete `audit-baseline.txt`

---

### Step 1.3: Switch Entry Point to server.ts
**Objective:** Use local-only entry point instead of cloud-contaminated `index.ts`

**Current State:** Package.json may point to `src/index.ts`

**Actions:**
1. Update `package.json` start scripts:
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "start": "ts-node src/server.ts",
    "build": "tsc",
    "start:prod": "node dist/server.js"
  }
}
```

2. Verify `server.ts` exists and is local-only:
```bash
cat src/server.ts | grep -E "(openai|s3|aws)" && echo "CONTAMINATED" || echo "CLEAN"
```

**Acceptance Criteria:**
- [x] Package.json updated
- [x] `server.ts` confirmed local-only
- [x] Entry point switched

**Validation:**
```bash
npm run dev
# Should start without OpenAI/AWS errors
```

**Time Estimate:** 0.25 hours
**Dependencies:** Step 1.2 (audit complete)
**Rollback:** Revert `package.json` changes

---

### Step 1.4: Run Existing Test Suite and Establish Baseline
**Objective:** Document current test coverage and passing rate

**Current State:** Unknown test status

**Actions:**
1. Install dependencies:
```bash
npm install
```

2. Run test suite:
```bash
npm test > test-baseline.txt 2>&1 || true
```

3. Analyze results:
```bash
cat test-baseline.txt | grep -E "(passing|failing|coverage)"
```

**Acceptance Criteria:**
- [x] Dependencies installed
- [x] Test suite runs (even if failing)
- [x] Baseline test results documented

**Validation:**
```bash
test -f test-baseline.txt && echo "Test baseline captured"
```

**Time Estimate:** 0.25 hours
**Dependencies:** Step 1.3 (entry point switched)
**Rollback:** Delete `node_modules`, `test-baseline.txt`

---

### Step 1.5: Initialize SQLite Database with Migrations
**Objective:** Create local SQLite database with all required tables

**Current State:** Database may not exist

**Actions:**
1. Verify migrations directory:
```bash
ls -la src/migrations/*.sql 2>/dev/null || echo "No SQL migrations found"
```

2. Create database directory:
```bash
mkdir -p ~/.gkchatty-pure/data
```

3. Run migrations using migration runner:
```bash
npx ts-node src/scripts/runMigrations.ts
```

4. Verify tables created:
```bash
sqlite3 ~/.gkchatty-pure/data/gkchatty.db ".tables"
```

**Acceptance Criteria:**
- [x] Database file created
- [x] All migrations applied
- [x] Tables verified in database

**Validation:**
```bash
sqlite3 ~/.gkchatty-pure/data/gkchatty.db "SELECT name FROM sqlite_master WHERE type='table';" | wc -l
# Should output 7+ tables
```

**Time Estimate:** 0.5 hours
**Dependencies:** Step 1.4 (dependencies installed)
**Rollback:** `rm -rf ~/.gkchatty-pure/data/gkchatty.db`

---

## Phase 2: Decontamination (4-6 hours)

### Step 2.1: Decontaminate openaiHelper.ts
**Objective:** Replace OpenAI API calls with Ollama

**Current State:** File uses `openai` package for chat and embeddings

**Contamination:**
- OpenAI client import and initialization
- `generateChatCompletion()` uses OpenAI API
- `generateEmbedding()` uses OpenAI embeddings

**Solution:**
1. Replace OpenAI imports with Ollama:
```typescript
// REMOVE:
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ADD:
import axios from 'axios';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
```

2. Replace `generateChatCompletion()`:
```typescript
export async function generateChatCompletion(
  messages: Array<{ role: string; content: string }>,
  model: string = 'llama2'
): Promise<string> {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model,
      messages,
      stream: false
    });
    return response.data.message.content;
  } catch (error) {
    console.error('Ollama chat error:', error);
    throw new Error('Failed to generate chat completion');
  }
}
```

3. Replace `generateEmbedding()`:
```typescript
export async function generateEmbedding(
  text: string,
  model: string = 'nomic-embed-text'
): Promise<number[]> {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
      model,
      prompt: text
    });
    return response.data.embedding;
  } catch (error) {
    console.error('Ollama embedding error:', error);
    throw new Error('Failed to generate embedding');
  }
}
```

**Acceptance Criteria:**
- [x] No `openai` package imports
- [x] All functions use Ollama API
- [x] Error handling preserved
- [x] TypeScript compiles

**Validation:**
```bash
# 1. Check for OpenAI references
grep -n "openai" src/utils/openaiHelper.ts && echo "STILL CONTAMINATED" || echo "CLEAN"

# 2. Test compilation
npx tsc --noEmit src/utils/openaiHelper.ts

# 3. Run unit tests
npm test -- openaiHelper.test.ts || true
```

**Time Estimate:** 1.5 hours
**Dependencies:** Step 1.5 (database initialized)
**Rollback:** `git checkout src/utils/openaiHelper.ts`

---

### Step 2.2: Decontaminate s3Helper.ts
**Objective:** Replace AWS S3 with local filesystem operations

**Current State:** File uses AWS SDK for document storage

**Contamination:**
- AWS S3 client import and initialization
- `uploadDocument()` uses S3 putObject
- `downloadDocument()` uses S3 getObject
- `deleteDocument()` uses S3 deleteObject

**Solution:**
1. Replace AWS imports with Node.js filesystem:
```typescript
// REMOVE:
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ADD:
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
```

2. Replace `uploadDocument()`:
```typescript
export async function uploadDocument(
  file: Express.Multer.File,
  userId: string,
  documentType: 'user_kb' | 'system_kb'
): Promise<{ filePath: string; fileSize: number }> {
  try {
    // Create directory structure
    const baseDir = path.join(
      process.env.HOME!,
      '.gkchatty-pure',
      'uploads',
      documentType,
      userId
    );
    await fs.mkdir(baseDir, { recursive: true });

    // Generate unique filename
    const fileHash = crypto.createHash('md5')
      .update(file.originalname + Date.now())
      .digest('hex');
    const fileName = `${fileHash}_${file.originalname}`;
    const filePath = path.join(baseDir, fileName);

    // Write file
    await fs.writeFile(filePath, file.buffer);

    return {
      filePath: path.relative(process.env.HOME!, filePath),
      fileSize: file.size
    };
  } catch (error) {
    console.error('File upload error:', error);
    throw new Error('Failed to upload document');
  }
}
```

3. Replace `downloadDocument()`:
```typescript
export async function downloadDocument(
  filePath: string
): Promise<Buffer> {
  try {
    const absolutePath = path.join(process.env.HOME!, filePath);
    const fileBuffer = await fs.readFile(absolutePath);
    return fileBuffer;
  } catch (error) {
    console.error('File download error:', error);
    throw new Error('Failed to download document');
  }
}
```

4. Replace `deleteDocument()`:
```typescript
export async function deleteDocument(
  filePath: string
): Promise<void> {
  try {
    const absolutePath = path.join(process.env.HOME!, filePath);
    await fs.unlink(absolutePath);
  } catch (error) {
    console.error('File delete error:', error);
    throw new Error('Failed to delete document');
  }
}
```

**Acceptance Criteria:**
- [x] No AWS SDK imports
- [x] All functions use local filesystem
- [x] Directory structure created automatically
- [x] Error handling preserved

**Validation:**
```bash
# 1. Check for AWS references
grep -n -E "(aws|s3)" src/utils/s3Helper.ts && echo "STILL CONTAMINATED" || echo "CLEAN"

# 2. Test compilation
npx tsc --noEmit src/utils/s3Helper.ts

# 3. Test file operations
npm test -- s3Helper.test.ts || true
```

**Time Estimate:** 2 hours
**Dependencies:** Step 2.1 (openaiHelper.ts decontaminated)
**Rollback:** `git checkout src/utils/s3Helper.ts`

---

### Step 2.3: Decontaminate chatService.ts
**Objective:** Remove OpenAI dependencies, use Ollama via local helper

**Current State:** Service may directly import OpenAI client

**Actions:**
1. Review current imports:
```bash
head -20 src/services/chatService.ts
```

2. Replace OpenAI imports with local helper:
```typescript
// REMOVE (if exists):
import OpenAI from 'openai';

// ADD (if not already present):
import { generateChatCompletion } from '../utils/openaiHelper'; // Now uses Ollama
```

3. Update `sendMessage()` to use helper:
```typescript
export async function sendMessage(
  conversationId: string,
  content: string,
  userId: string
): Promise<{ message: Message; response: string }> {
  try {
    // Fetch conversation history
    const messages = await getConversationHistory(conversationId);

    // Build context from RAG (if ragService exists)
    const context = await ragService.search(content, userId);

    // Build prompt with context
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant. Use this context to answer:\n${context}`
    };

    const chatMessages = [
      systemMessage,
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ];

    // Generate response using Ollama (via helper)
    const response = await generateChatCompletion(chatMessages);

    // Save messages to database
    const userMessage = await saveMessage(conversationId, userId, 'user', content);
    await saveMessage(conversationId, userId, 'assistant', response);

    return { message: userMessage, response };
  } catch (error) {
    console.error('Send message error:', error);
    throw new Error('Failed to send message');
  }
}
```

**Acceptance Criteria:**
- [x] No direct OpenAI imports
- [x] Uses local `generateChatCompletion()` helper
- [x] RAG context integration preserved
- [x] Message persistence works

**Validation:**
```bash
# 1. Check for OpenAI references
grep -n "openai\|tiktoken" src/services/chatService.ts && echo "STILL CONTAMINATED" || echo "CLEAN"

# 2. Test compilation
npx tsc --noEmit src/services/chatService.ts

# 3. Integration test
npm test -- chatService.test.ts || true
```

**Time Estimate:** 2 hours
**Dependencies:** Step 2.1 (openaiHelper.ts decontaminated)
**Rollback:** `git checkout src/services/chatService.ts`

---

### Step 2.4: Decontaminate documentProcessingService.ts
**Objective:** Replace S3 storage with local filesystem, use Ollama embeddings

**Current State:** Service may use S3 for storage and OpenAI for embeddings

**Actions:**
1. Review current imports:
```bash
head -30 src/services/documentProcessingService.ts | grep import
```

2. Ensure uses local helpers:
```typescript
// Should import:
import { uploadDocument, downloadDocument, deleteDocument } from '../utils/s3Helper'; // Now local FS
import { generateEmbedding } from '../services/embeddingService'; // Uses Ollama
```

3. Verify `processDocument()` uses local storage:
```typescript
export async function processDocument(
  file: Express.Multer.File,
  userId: string,
  documentType: 'user_kb' | 'system_kb'
): Promise<Document> {
  try {
    // Upload to local filesystem
    const { filePath, fileSize } = await uploadDocument(file, userId, documentType);

    // Extract text
    const text = await extractTextFromFile(filePath);

    // Chunk text
    const chunks = chunkText(text, 500);

    // Generate embeddings using Ollama
    const embeddings = await Promise.all(
      chunks.map(chunk => generateEmbedding(chunk.text))
    );

    // Store in ChromaDB
    const collection = await chromaService.getOrCreateCollection(
      documentType === 'user_kb' ? `user_${userId}` : 'system_kb'
    );

    await collection.add({
      ids: chunks.map(c => c.id),
      documents: chunks.map(c => c.text),
      embeddings: embeddings,
      metadatas: chunks.map(c => ({
        documentId: file.originalname,
        chunkIndex: c.index
      }))
    });

    // Save document record to SQLite
    const document = await saveDocumentRecord(filePath, fileSize, userId, documentType);

    return document;
  } catch (error) {
    console.error('Document processing error:', error);
    throw new Error('Failed to process document');
  }
}
```

**Acceptance Criteria:**
- [x] Uses local filesystem storage
- [x] Uses Ollama embeddings
- [x] ChromaDB integration works
- [x] Document records saved to SQLite

**Validation:**
```bash
# 1. Check for S3/AWS references
grep -n -E "(s3|aws)" src/services/documentProcessingService.ts && echo "STILL CONTAMINATED" || echo "CLEAN"

# 2. Test compilation
npx tsc --noEmit src/services/documentProcessingService.ts

# 3. End-to-end test
npm test -- documentProcessingService.test.ts || true
```

**Time Estimate:** 2 hours
**Dependencies:** Steps 2.1, 2.2 (helpers decontaminated)
**Rollback:** `git checkout src/services/documentProcessingService.ts`

---

### Step 2.5: Verify authMiddleware.ts is Local-Only
**Objective:** Confirm JWT verification doesn't use external services

**Current State:** Middleware likely uses local JWT signing

**Actions:**
1. Review `authMiddleware.ts`:
```bash
cat src/middleware/authMiddleware.ts | grep -E "(aws|cognito|auth0|firebase)"
```

2. Verify JWT secret comes from environment:
```bash
grep "JWT_SECRET" src/middleware/authMiddleware.ts
```

3. Confirm no external API calls in verification

**Acceptance Criteria:**
- [x] No external auth service imports
- [x] JWT verification uses local secret
- [x] No API calls to external services

**Validation:**
```bash
# Check for external auth services
grep -n -E "(cognito|auth0|firebase|oauth)" src/middleware/authMiddleware.ts && echo "CONTAMINATED" || echo "CLEAN"
```

**Time Estimate:** 0.5 hours
**Dependencies:** Step 2.4 (documentProcessingService decontaminated)
**Rollback:** N/A (likely no changes needed)

---

## Phase 3: Expansion (8-10 hours)

### Step 3.1: Expand UserKBAccess.ts Model
**Objective:** Complete KB access control model with CRUD operations

**File:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/models/UserKBAccess.ts`

**Implementation:** Add permission enum, access control methods, bulk operations

**Time Estimate:** 2 hours
**Dependencies:** Step 2.5 (decontamination complete)

---

### Step 3.2: Expand SystemKbDocument.ts Model
**Objective:** Add system-wide KB management capabilities

**File:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/models/SystemKbDocument.ts`

**Implementation:** Versioning system, public/private access, category/tag search

**Time Estimate:** 2 hours
**Dependencies:** Step 3.1 (UserKBAccess expanded)

---

### Step 3.3: Expand adminSystemKbController.ts
**Objective:** Complete admin operations for system KB management

**File:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/controllers/adminSystemKbController.ts`

**Implementation:** Bulk upload, analytics endpoint, approval workflow

**Time Estimate:** 2 hours
**Dependencies:** Step 3.2 (SystemKbDocument expanded)

---

### Step 3.4: Expand tenantKBController.ts
**Objective:** Complete tenant (user) KB operations

**File:** `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-pure/backend/src/controllers/tenantKBController.ts`

**Implementation:** KB sharing, tenant search, statistics

**Time Estimate:** 2 hours
**Dependencies:** Step 3.3 (adminSystemKbController expanded)

---

### Step 3.5: Add Missing API Endpoints
**Objective:** Implement any endpoints defined in architecture but missing from codebase

**Actions:** Cross-reference architecture Part 2 with existing routes, implement skeleton endpoints

**Time Estimate:** 2-3 hours
**Dependencies:** Steps 3.1-3.4 (models/controllers complete)

---

## Phase 4: Integration Testing (2 hours)

### Step 4.1: End-to-End RAG Flow Test
**Objective:** Verify complete document upload → query cycle

**Test:** Upload document → Verify processed → Query content → Verify results

**Time Estimate:** 0.5 hours

---

### Step 4.2: Auth Flow Test
**Objective:** Verify complete authentication cycle

**Test:** Signup → Login → Authenticated request → Token validation

**Time Estimate:** 0.5 hours

---

### Step 4.3: Chat Flow Test
**Objective:** Verify conversation creation and messaging

**Test:** Create conversation → Send messages → Verify history → Follow-up messages

**Time Estimate:** 0.5 hours

---

### Step 4.4: Frontend-Backend Integration Test
**Objective:** Verify frontend can connect to backend successfully

**Test:** Start servers → Test CORS → Test auth flow → Test upload → Test chat

**Time Estimate:** 0.5 hours

---

## Phase 5: Final Validation (1-2 hours)

### Step 5.1: Run Audit Script (Must Pass with Zero Violations)
**Objective:** Verify complete decontamination

**Time Estimate:** 0.25 hours

---

### Step 5.2: Run Full Test Suite (80%+ Coverage Required)
**Objective:** Verify all functionality works

**Time Estimate:** 0.5 hours

---

### Step 5.3: Performance Benchmarks
**Objective:** Verify system meets performance requirements

**Tests:** RAG query < 10s, Upload < 5s, Chat < 3s, DB query < 100ms

**Time Estimate:** 0.5 hours

---

### Step 5.4: Security Review (OWASP Checklist)
**Objective:** Verify system meets security standards

**Checklist:** OWASP Top 10 items

**Time Estimate:** 0.5 hours

---

## Risk Mitigation

### Risk 1: Ollama Models Not Available
**Mitigation:** Early verification in Step 1.1, provide install commands

### Risk 2: ChromaDB Connection Issues
**Mitigation:** Verify ChromaDB in Step 1.5, provide Docker Compose if needed

### Risk 3: Test Failures During Integration
**Mitigation:** Increase timeouts, add retry logic, use test fixtures

### Risk 4: Performance Benchmarks Fail
**Mitigation:** Optimize queries, reduce chunk size, add caching

### Risk 5: Frontend-Backend CORS Issues
**Mitigation:** Add explicit CORS configuration, test in Step 4.4

---

## Success Criteria

### ✅ MVP Complete When:
- [ ] Backend runs on `localhost:3001`
- [ ] Frontend connects successfully from `localhost:3004`
- [ ] Audit script passes (zero contamination)
- [ ] All tests passing (80%+ coverage)
- [ ] Full RAG flow works (upload → query → response)
- [ ] Auth flow works (signup → login → authenticated request)
- [ ] Chat flow works (create conversation → send messages)
- [ ] Performance benchmarks met (RAG < 10s, upload < 5s)
- [ ] Security review passed (OWASP checklist complete)
- [ ] Documentation updated (README, API docs)

---

## Implementation Sessions

### Session 1 (4 hours): Setup + Decontamination Start
- Phase 1: All steps (1-2 hours)
- Phase 2: Steps 2.1-2.2 (2-3 hours)

### Session 2 (4 hours): Decontamination Complete
- Phase 2: Steps 2.3-2.5 (2-3 hours)
- Phase 3: Step 3.1 (2 hours)

### Session 3 (4 hours): Expansion
- Phase 3: Steps 3.2-3.5 (4 hours)

### Session 4 (2 hours): Integration Testing
- Phase 4: All steps (2 hours)

### Session 5 (2 hours): Final Validation
- Phase 5: All steps (1-2 hours)

**Total:** 16-20 hours over 5 sessions

---

**Plan Status:** Ready for Implementation
**Next Step:** Begin Phase 1 (Setup & Validation)
