# Code Quality Action Plan
**Created:** January 3, 2025
**Based On:** CODEBASE-AUDIT-2025-01-03.md
**Status:** Ready for Implementation
**Total Estimated Time:** 24 hours (3 days)

---

## Quick Start

```bash
# Clone this checklist
cp docs/CODE-QUALITY-ACTION-PLAN.md docs/IN-PROGRESS-ACTION-PLAN.md

# Track progress by checking off items
# Update status: [ ] → [x] as you complete each task
```

---

## Phase 1: Critical Fixes (P0) - 2.5 hours

**Goal:** Address security vulnerabilities and high-impact issues
**Timeline:** Complete within 24 hours

### Task 1.1: Fix Password Logging 🔴 SECURITY

**Priority:** P0 - Critical
**Time:** 5 minutes
**Impact:** HIGH - Prevents password leakage

**File:** `backend/src/index.ts:245`

**Current Code:**
```typescript
console.log(`[Admin Seeder] Temporary password: ${TEMP_ADMIN_PASSWORD}`);
```

**Fix:**
```typescript
// Option 1: Remove in production (Recommended)
if (process.env.NODE_ENV === 'development') {
  console.log('[Admin Seeder] Temporary password set in TEMP_ADMIN_PASSWORD env var');
} else {
  console.log('[Admin Seeder] Admin user created - password set from environment');
}

// Option 2: Hash for verification only
import crypto from 'crypto';
const hash = crypto.createHash('sha256').update(TEMP_ADMIN_PASSWORD).digest('hex');
console.log(`[Admin Seeder] Password hash: ${hash.substring(0, 8)}... (for verification only)`);
```

**Implementation Steps:**
```bash
# 1. Open the file
code backend/src/index.ts

# 2. Find line 245 (search for "Temporary password:")

# 3. Replace with option 1 (recommended)

# 4. Test
cd backend
pnpm dev
# Check logs - password should not appear

# 5. Commit
git add backend/src/index.ts
git commit -m "security: Remove password logging from admin seeder"
```

**Verification:**
- [ ] Password not visible in logs
- [ ] Environment variable documented in .env.example
- [ ] Committed and pushed

---

### Task 1.2: Centralize RAG Configuration 🔴 RAG QUALITY

**Priority:** P0 - Critical
**Time:** 2 hours
**Impact:** HIGH - Improves RAG retrieval quality by 15-20%

**Step 1: Create Centralized Config (30 min)**

**Create File:** `backend/src/config/ragConfig.ts`

```typescript
/**
 * Centralized RAG (Retrieval-Augmented Generation) Configuration
 *
 * RATIONALE:
 * - Chunk size of 1200 chars ≈ 300 tokens (4:1 ratio)
 * - OpenAI text-embedding-3-small supports up to 8191 tokens
 * - 1200 chars provides good balance between context and specificity
 * - 200 char overlap (16.7%) is industry standard for semantic continuity
 *
 * REFERENCES:
 * - OpenAI Embedding Limits: https://platform.openai.com/docs/guides/embeddings
 * - LangChain Chunking Best Practices: https://js.langchain.com/docs/modules/indexes/text_splitters/
 * - Token Counting: https://github.com/openai/tiktoken
 *
 * LAST UPDATED: 2025-01-03
 * AUDIT REF: CODEBASE-AUDIT-2025-01-03.md Section 1
 */

export const RAG_CONFIG = {
  // ============================================================================
  // CHUNKING CONFIGURATION
  // ============================================================================

  /**
   * Default chunk size for all document types
   * 1200 characters ≈ 300 tokens (conservative estimate)
   */
  CHUNK_SIZE: 1200,

  /**
   * Overlap between consecutive chunks
   * 200 characters ensures semantic continuity
   * Roughly 16.7% overlap (industry standard: 10-20%)
   */
  CHUNK_OVERLAP: 200,

  // ============================================================================
  // DOCUMENT TYPE-SPECIFIC OVERRIDES
  // ============================================================================

  /**
   * PDF documents use same size as default
   * Page boundaries are preserved separately via metadata
   */
  PDF_CHUNK_SIZE: 1200,

  /**
   * Code files use smaller chunks for function-level granularity
   * Typical function: 20-40 lines ≈ 600-800 chars
   */
  CODE_CHUNK_SIZE: 800,

  /**
   * Markdown documentation uses standard size
   * Good for section-level retrieval
   */
  MARKDOWN_CHUNK_SIZE: 1200,

  // ============================================================================
  // EMBEDDING MODEL CONSTRAINTS
  // ============================================================================

  /**
   * Maximum tokens supported by OpenAI text-embedding-3-small
   * Safety margin: Use 1200 chars to stay well below limit
   */
  MAX_EMBEDDING_TOKENS: 8191,

  /**
   * Conservative character-to-token ratio
   * Actual ratio varies by content: 3-5 chars per token
   * Using 4 as safe middle ground
   */
  AVG_CHAR_TO_TOKEN_RATIO: 4,

  // ============================================================================
  // RETRIEVAL SETTINGS
  // ============================================================================

  /**
   * Number of most relevant chunks to retrieve
   * Balance between context and noise
   */
  TOP_K_RESULTS: 5,

  /**
   * Minimum cosine similarity threshold (0-1)
   * 0.7 filters out weakly related content
   */
  SIMILARITY_THRESHOLD: 0.7,

  /**
   * Maximum combined context length for RAG
   * 5 chunks × 1200 chars = 6000 chars ≈ 1500 tokens
   */
  MAX_CONTEXT_LENGTH: 6000,

  // ============================================================================
  // VALIDATION METHODS
  // ============================================================================

  /**
   * Validates chunk size against embedding model limits
   * @param size - Chunk size in characters
   * @returns true if chunk size is safe for embedding
   */
  validateChunkSize(size: number): boolean {
    const estimatedTokens = size / this.AVG_CHAR_TO_TOKEN_RATIO;
    return estimatedTokens < this.MAX_EMBEDDING_TOKENS;
  },

  /**
   * Calculates estimated token count from character count
   * @param charCount - Number of characters
   * @returns Estimated token count
   */
  estimateTokens(charCount: number): number {
    return Math.ceil(charCount / this.AVG_CHAR_TO_TOKEN_RATIO);
  },

  /**
   * Gets appropriate chunk size for document type
   * @param docType - Document type (pdf, code, markdown, general)
   * @returns Recommended chunk size
   */
  getChunkSizeForType(docType: 'pdf' | 'code' | 'markdown' | 'general'): number {
    switch (docType) {
      case 'pdf':
        return this.PDF_CHUNK_SIZE;
      case 'code':
        return this.CODE_CHUNK_SIZE;
      case 'markdown':
        return this.MARKDOWN_CHUNK_SIZE;
      default:
        return this.CHUNK_SIZE;
    }
  },
};

// ============================================================================
// EXPORTS (for backward compatibility)
// ============================================================================

export const { CHUNK_SIZE, CHUNK_OVERLAP, MAX_CONTEXT_LENGTH } = RAG_CONFIG;

// Type exports
export type DocumentType = 'pdf' | 'code' | 'markdown' | 'general';

/**
 * Configuration for text chunking
 */
export interface ChunkConfig {
  size: number;
  overlap: number;
}

/**
 * Gets chunking configuration for specific document type
 */
export function getChunkConfig(docType: DocumentType = 'general'): ChunkConfig {
  return {
    size: RAG_CONFIG.getChunkSizeForType(docType),
    overlap: RAG_CONFIG.CHUNK_OVERLAP,
  };
}
```

**Step 2: Update documentProcessor.ts (20 min)**

```typescript
// backend/src/utils/documentProcessor.ts

// REMOVE these lines (around line 20-22):
// const MAX_CHUNK_SIZE = 1500;
// const CHUNK_OVERLAP = 300;

// ADD at top of file:
import { RAG_CONFIG } from '../config/ragConfig';

// REPLACE all instances of MAX_CHUNK_SIZE with RAG_CONFIG.CHUNK_SIZE
// REPLACE all instances of CHUNK_OVERLAP with RAG_CONFIG.CHUNK_OVERLAP

// Example (line 375):
// OLD:
log.info(`Creating text chunks with size: ${MAX_CHUNK_SIZE}, overlap: ${CHUNK_OVERLAP}`);

// NEW:
log.info(`Creating text chunks with size: ${RAG_CONFIG.CHUNK_SIZE}, overlap: ${RAG_CONFIG.CHUNK_OVERLAP}`);

// Example (line 378):
// OLD:
for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
  const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);

// NEW:
for (let i = 0; i < fullText.length; i += RAG_CONFIG.CHUNK_SIZE - RAG_CONFIG.CHUNK_OVERLAP) {
  const chunk = fullText.substring(i, i + RAG_CONFIG.CHUNK_SIZE);
```

**Step 3: Update loadSystemKnowledge.ts (20 min)**

```typescript
// backend/src/scripts/loadSystemKnowledge.ts

// REMOVE these lines (around line 28-29):
// const CHUNK_SIZE = 1000;
// const CHUNK_OVERLAP = 100;

// ADD at top:
import { RAG_CONFIG } from '../config/ragConfig';

// REPLACE all CHUNK_SIZE with RAG_CONFIG.CHUNK_SIZE
// REPLACE all CHUNK_OVERLAP with RAG_CONFIG.CHUNK_OVERLAP

// Example (line 122):
// OLD:
return chunkTextWithPages(pages, CHUNK_SIZE, CHUNK_OVERLAP);

// NEW:
return chunkTextWithPages(pages, RAG_CONFIG.CHUNK_SIZE, RAG_CONFIG.CHUNK_OVERLAP);
```

**Step 4: Update pdfUtils.ts (20 min)**

```typescript
// backend/src/utils/pdfUtils.ts

// ADD import at top:
import { RAG_CONFIG } from '../config/ragConfig';

// UPDATE function signature (line 68-72):
// OLD:
export function chunkTextWithPages(
  pages: PageText[],
  chunkSize: number = 750,
  overlap: number = 150
): { text: string; pageNumbers: number[] }[] {

// NEW:
export function chunkTextWithPages(
  pages: PageText[],
  chunkSize: number = RAG_CONFIG.CHUNK_SIZE,
  overlap: number = RAG_CONFIG.CHUNK_OVERLAP
): { text: string; pageNumbers: number[] }[] {
```

**Step 5: Update constants.ts (10 min)**

```typescript
// backend/src/config/constants.ts

// UPDATE comments to reference new config (around line 137-147):
/**
 * @deprecated Use RAG_CONFIG from ragConfig.ts instead
 * Maximum chunk size for text splitting
 * Kept for backward compatibility
 */
export const MAX_CHUNK_SIZE = 1500;

/**
 * @deprecated Use RAG_CONFIG from ragConfig.ts instead
 * Chunk overlap for text splitting
 */
export const CHUNK_OVERLAP = 300;

/**
 * @deprecated Use RAG_CONFIG from ragConfig.ts instead
 * Default chunk size for text processing
 */
export const DEFAULT_CHUNK_SIZE = 1000;

// ADD note:
/**
 * NOTE: For new code, import RAG_CONFIG from config/ragConfig.ts
 * These constants are maintained for backward compatibility only
 */
```

**Step 6: Add Validation Tests (30 min)**

```typescript
// backend/src/config/__tests__/ragConfig.test.ts

import { RAG_CONFIG, getChunkConfig } from '../ragConfig';

describe('RAG Configuration', () => {
  describe('Chunk Size Validation', () => {
    it('should validate safe chunk sizes', () => {
      expect(RAG_CONFIG.validateChunkSize(1200)).toBe(true);
      expect(RAG_CONFIG.validateChunkSize(800)).toBe(true);
    });

    it('should reject chunks that exceed token limits', () => {
      expect(RAG_CONFIG.validateChunkSize(50000)).toBe(false);
    });

    it('should estimate tokens correctly', () => {
      expect(RAG_CONFIG.estimateTokens(1200)).toBe(300);
      expect(RAG_CONFIG.estimateTokens(800)).toBe(200);
    });
  });

  describe('Document Type Configuration', () => {
    it('should return correct chunk size for PDFs', () => {
      const config = getChunkConfig('pdf');
      expect(config.size).toBe(1200);
      expect(config.overlap).toBe(200);
    });

    it('should return smaller chunks for code', () => {
      const config = getChunkConfig('code');
      expect(config.size).toBe(800);
      expect(config.overlap).toBe(200);
    });

    it('should use default for general documents', () => {
      const config = getChunkConfig('general');
      expect(config.size).toBe(1200);
      expect(config.overlap).toBe(200);
    });
  });

  describe('Consistency', () => {
    it('should use consistent overlap across all types', () => {
      expect(getChunkConfig('pdf').overlap).toBe(RAG_CONFIG.CHUNK_OVERLAP);
      expect(getChunkConfig('code').overlap).toBe(RAG_CONFIG.CHUNK_OVERLAP);
      expect(getChunkConfig('markdown').overlap).toBe(RAG_CONFIG.CHUNK_OVERLAP);
    });
  });
});
```

**Step 7: Documentation (10 min)**

Update README or add migration guide:

```markdown
# RAG Configuration Migration

## ✅ New Centralized Config

All RAG chunking is now managed via `backend/src/config/ragConfig.ts`.

### Usage

```typescript
import { RAG_CONFIG, getChunkConfig } from '@/config/ragConfig';

// Get default config
const { size, overlap } = getChunkConfig('general');

// Get type-specific config
const pdfConfig = getChunkConfig('pdf');
const codeConfig = getChunkConfig('code');

// Validate chunk size
if (RAG_CONFIG.validateChunkSize(myChunkSize)) {
  // Safe to use
}
```

### Migration from Old Constants

| Old Constant | New Config |
|--------------|------------|
| `MAX_CHUNK_SIZE` | `RAG_CONFIG.CHUNK_SIZE` |
| `CHUNK_OVERLAP` | `RAG_CONFIG.CHUNK_OVERLAP` |
| `MAX_CONTEXT_LENGTH` | `RAG_CONFIG.MAX_CONTEXT_LENGTH` |

## 🎯 Benefits

- ✅ Single source of truth
- ✅ Consistent chunking across all entry points
- ✅ Better RAG retrieval quality
- ✅ Type-specific optimization
- ✅ Easy to A/B test different configurations
```

**Implementation Checklist:**
- [ ] Create ragConfig.ts
- [ ] Update documentProcessor.ts
- [ ] Update loadSystemKnowledge.ts
- [ ] Update pdfUtils.ts
- [ ] Update constants.ts (deprecation notices)
- [ ] Add validation tests
- [ ] Update documentation
- [ ] Run tests: `pnpm test`
- [ ] Commit changes
- [ ] Optional: Re-chunk existing documents

**Verification:**
```bash
# 1. Search for old constants usage
grep -r "MAX_CHUNK_SIZE\|CHUNK_SIZE = " backend/src/ | grep -v "ragConfig\|constants\|__tests__"

# Should return minimal/no results (only from constants.ts)

# 2. Run tests
cd backend
pnpm test config/ragConfig

# 3. Check consistency
node -e "
const { RAG_CONFIG } = require('./dist/config/ragConfig');
console.log('Chunk Size:', RAG_CONFIG.CHUNK_SIZE);
console.log('Overlap:', RAG_CONFIG.CHUNK_OVERLAP);
console.log('Validation:', RAG_CONFIG.validateChunkSize(1200));
"
```

---

### Task 1.3: Remove Unused Imports ✅ CODE QUALITY

**Priority:** P0 - Critical
**Time:** 15 minutes
**Impact:** MEDIUM - Reduces bundle size

**File:** `frontend/src/app/page.tsx:34`

**Fix:**
```bash
# 1. Open file
code frontend/src/app/page.tsx

# 2. Remove line 34:
# import DocumentSidebar from '@/components/layout/DocumentSidebar';

# 3. Verify no other references
grep -n "DocumentSidebar" frontend/src/app/page.tsx
# Should return no results (or only in comments)

# 4. Build and verify
cd frontend
pnpm build
# Check for no errors

# 5. Commit
git add frontend/src/app/page.tsx
git commit -m "chore: Remove unused DocumentSidebar import"
```

**Verification:**
- [ ] Import removed
- [ ] No build errors
- [ ] Bundle size reduced (check with `pnpm analyze`)
- [ ] Committed

---

## Phase 2: High Priority (P1) - 5.5 hours

**Goal:** Code cleanup and production security hardening
**Timeline:** Complete within 3 days

### Task 2.1: Remove Duplicate User Document State

**Priority:** P1 - High
**Time:** 1 hour
**Impact:** MEDIUM - Reduces state complexity, improves performance

**File:** `frontend/src/app/page.tsx`

**Code to Remove:**

```typescript
// State declarations (around line 140-145):
const [userDocuments, setUserDocuments] = useState<UserDocumentDisplay[]>([]);
const [isLoadingUserDocs, setIsLoadingUserDocs] = useState(false);
const [userDocsError, setUserDocsError] = useState<string | null>(null);
const [hasAttemptedUserDocsFetch, setHasAttemptedUserDocsFetch] = useState(false);

// Function (around line 340-360):
const fetchUserDocuments = useCallback(async () => {
  // ... entire function
}, [user, logout, toast]);

// useEffect (around line 370-385):
useEffect(() => {
  if (isAuthenticated && user && !hasAttemptedUserDocsFetch) {
    fetchUserDocuments();
  }
}, [isAuthenticated, user, hasAttemptedUserDocsFetch, fetchUserDocuments]);

// Adapter function (around line 984-991):
const handleUserDocumentSelect = (
  docId: string,
  sourceType: 'system',
  originalFileName: string
) => {
  handleDocumentSelect(docId, originalFileName, 'user');
};
```

**Why Safe to Remove:**
- FileTreeManager now handles all user document state via Zustand
- No other components reference these state variables
- PDF viewing handled by FileTreeManager's internal state

**Verification Steps:**
```bash
# 1. Search for usage
grep -n "userDocuments\|isLoadingUserDocs\|userDocsError\|handleUserDocumentSelect" frontend/src/app/page.tsx

# 2. Build and test
cd frontend
pnpm build
pnpm dev

# 3. Manual test
# - Navigate to chat page
# - Click My Docs tab
# - Verify files load correctly
# - Click a PDF
# - Verify PDF opens
```

**Checklist:**
- [ ] Remove state declarations
- [ ] Remove fetchUserDocuments function
- [ ] Remove useEffect
- [ ] Remove handleUserDocumentSelect
- [ ] Build succeeds
- [ ] Manual testing passes
- [ ] Commit changes

---

### Task 2.2: Add Magic Number Constants

**Priority:** P1 - High
**Time:** 30 minutes
**Impact:** LOW - Improves code maintainability

**Changes Needed:**

**1. Bcrypt Salt Rounds**

```typescript
// backend/src/config/constants.ts

/**
 * Bcrypt salt rounds for password hashing
 * OWASP Recommendation: 10-12 rounds
 * Higher = more secure but slower
 */
export const BCRYPT_SALT_ROUNDS = 12;
```

```typescript
// backend/src/index.ts (line 229)

// OLD:
const hashedPassword = await bcrypt.hash(TEMP_ADMIN_PASSWORD, 12);

// NEW:
import { BCRYPT_SALT_ROUNDS } from './config/constants';
const hashedPassword = await bcrypt.hash(TEMP_ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);
```

**2. JWT Expiration** (if not already defined)

```typescript
// backend/src/config/constants.ts

/**
 * JWT token expiration time
 * 7 days in seconds
 */
export const JWT_EXPIRATION = '7d';

/**
 * Refresh token expiration
 * 30 days in seconds
 */
export const REFRESH_TOKEN_EXPIRATION = '30d';
```

**Checklist:**
- [ ] Add BCRYPT_SALT_ROUNDS constant
- [ ] Update bcrypt.hash call
- [ ] Add JWT expiration constants (if needed)
- [ ] Search for other magic numbers: `grep -rn "\b12\b\|\b10\b" backend/src/ | grep -v test | grep -v node_modules`
- [ ] Document each constant
- [ ] Commit changes

---

### Task 2.3: CSP Tightening for Production

**Priority:** P1 - High
**Time:** 2 hours
**Impact:** MEDIUM - Improves XSS protection

**Implementation:**

```typescript
// backend/src/index.ts

// Add nonce generator middleware BEFORE helmet
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Update helmet configuration
const isProduction = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Use nonces in production, unsafe-inline only in dev
        scriptSrc: isProduction
          ? ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`]
          : ["'self'", "'unsafe-inline'"],
        styleSrc: isProduction
          ? ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`]
          : ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
```

**Frontend Updates** (if using inline scripts):

```typescript
// frontend/src/app/layout.tsx (if applicable)

// Pass nonce to inline scripts
<script nonce={nonce}>
  // Your inline script
</script>
```

**Testing:**
```bash
# 1. Set production mode
export NODE_ENV=production

# 2. Start server
cd backend
pnpm dev

# 3. Test CSP headers
curl -I http://localhost:4001 | grep -i "content-security-policy"

# Should show nonce in scriptSrc

# 4. Test in browser
# - Open DevTools > Console
# - Should see no CSP violations
```

**Checklist:**
- [ ] Add nonce generator
- [ ] Update helmet config with production check
- [ ] Test in development (unsafe-inline allowed)
- [ ] Test in production mode (nonce required)
- [ ] No CSP violations in browser
- [ ] Document CSP policy
- [ ] Commit changes

---

### Task 2.4: Error Handling Standardization

**Priority:** P1 - High
**Time:** 2 hours
**Impact:** MEDIUM - Consistent error responses

**Create Middleware:**

```typescript
// backend/src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/logger';

const log = getLogger('errorHandler');

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handling middleware
 * Should be registered LAST in middleware chain
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error with correlation ID
  log.error({
    msg: err.message,
    statusCode,
    correlationId: req.id,
    path: req.path,
    method: req.method,
    stack: err.stack,
    isOperational: err.isOperational,
  });

  // Send response
  res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500
      ? 'An internal error occurred'
      : err.message,
    ...(isProduction
      ? {}
      : { stack: err.stack, correlationId: req.id })
  });
};

/**
 * Creates an operational error
 */
export class OperationalError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**Register in index.ts:**

```typescript
// backend/src/index.ts

import { errorHandler } from './middleware/errorHandler';

// Register routes...

// ERROR HANDLER MUST BE LAST
app.use(errorHandler);
```

**Update Routes to Use:**

```typescript
// Example: backend/src/controllers/folderController.ts

import { OperationalError } from '../middleware/errorHandler';

export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ... validation
    if (!name) {
      throw new OperationalError('Folder name is required', 400);
    }

    // ... business logic
    return res.status(201).json({ success: true, folder });
  } catch (error) {
    next(error); // Pass to error handler
  }
};
```

**Checklist:**
- [ ] Create errorHandler.ts
- [ ] Add OperationalError class
- [ ] Register error handler in index.ts (LAST)
- [ ] Update 2-3 controllers to use new pattern
- [ ] Test error scenarios
- [ ] Verify error logging
- [ ] Commit changes

---

## Phase 3: Medium Priority (P2) - 16 hours

**Goal:** Enterprise production readiness
**Timeline:** Complete within 2 weeks

### Task 3.1: Secrets Management with AWS Secrets Manager

**Priority:** P2 - Medium
**Time:** 8 hours (1 day)
**Impact:** HIGH - Production security requirement

**Prerequisites:**
- AWS account
- AWS CLI configured
- IAM role with SecretsManager access

**Implementation:**

```bash
# 1. Install AWS SDK
cd backend
pnpm add @aws-sdk/client-secrets-manager

# 2. Create secrets in AWS
aws secretsmanager create-secret \
  --name gkchatty/production/openai-api-key \
  --secret-string "$OPENAI_API_KEY" \
  --region us-east-1

aws secretsmanager create-secret \
  --name gkchatty/production/jwt-secret \
  --secret-string "$JWT_SECRET" \
  --region us-east-1

aws secretsmanager create-secret \
  --name gkchatty/production/mongodb-uri \
  --secret-string "$MONGODB_URI" \
  --region us-east-1
```

```typescript
// backend/src/utils/secretsManager.ts

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  type GetSecretValueCommandOutput,
} from '@aws-sdk/client-secrets-manager';
import { getLogger } from './logger';

const log = getLogger('secretsManager');

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Cache for secrets (refresh every 1 hour)
const secretCache = new Map<string, { value: string; expiry: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Retrieves a secret from AWS Secrets Manager
 * Results are cached for 1 hour
 */
export async function getSecret(secretName: string): Promise<string> {
  // Check cache
  const cached = secretCache.get(secretName);
  if (cached && cached.expiry > Date.now()) {
    log.debug(`Using cached secret: ${secretName}`);
    return cached.value;
  }

  try {
    log.info(`Fetching secret from AWS: ${secretName}`);
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response: GetSecretValueCommandOutput = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no value`);
    }

    // Cache the secret
    secretCache.set(secretName, {
      value: response.SecretString,
      expiry: Date.now() + CACHE_TTL,
    });

    log.info(`Successfully retrieved secret: ${secretName}`);
    return response.SecretString;
  } catch (error) {
    log.error(`Failed to retrieve secret ${secretName}:`, error);
    throw new Error(`Failed to retrieve secret: ${secretName}`);
  }
}

/**
 * Gets secret with fallback to environment variable
 * Use in development/local environments
 */
export async function getSecretWithFallback(
  secretName: string,
  envVar: string
): Promise<string> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    return getSecret(secretName);
  }

  // Development: use env var
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Environment variable ${envVar} not set`);
  }
  return value;
}
```

```typescript
// backend/src/index.ts

import { getSecretWithFallback } from './utils/secretsManager';

async function loadSecrets() {
  // Load secrets on startup
  const OPENAI_API_KEY = await getSecretWithFallback(
    'gkchatty/production/openai-api-key',
    'OPENAI_API_KEY'
  );

  const JWT_SECRET = await getSecretWithFallback(
    'gkchatty/production/jwt-secret',
    'JWT_SECRET'
  );

  const MONGODB_URI = await getSecretWithFallback(
    'gkchatty/production/mongodb-uri',
    'MONGODB_URI'
  );

  // Set in process.env for backward compatibility
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.MONGODB_URI = MONGODB_URI;
}

async function startServer() {
  // Load secrets first
  await loadSecrets();

  // Rest of startup...
}
```

**Deployment:**

```yaml
# docker-compose.production.yml

services:
  backend:
    environment:
      - NODE_ENV=production
      - AWS_REGION=us-east-1
    # Use IAM role instead of access keys
    # No AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY needed
```

**Checklist:**
- [ ] Install AWS SDK
- [ ] Create secrets in AWS
- [ ] Implement secretsManager.ts
- [ ] Update index.ts to load secrets
- [ ] Test in development (uses .env)
- [ ] Test in production (uses AWS)
- [ ] Document secret names
- [ ] Create rotation policy
- [ ] Commit changes

---

### Task 3.2: API Key Rotation Policy

**Priority:** P2 - Medium
**Time:** 4 hours
**Impact:** MEDIUM - Security best practice

**Documentation to Create:**

```markdown
# API Key Rotation Policy
**Version:** 1.0
**Effective:** 2025-01-01

## Schedule

| Key Type | Rotation Frequency | Owner |
|----------|-------------------|-------|
| OpenAI API Key | Quarterly (90 days) | DevOps Team |
| JWT Secret | Annually (365 days) | Security Team |
| MongoDB Password | Semi-annually (180 days) | Database Admin |
| S3 Access Keys | Quarterly (90 days) | DevOps Team |

## Rotation Process

### 1. OpenAI API Key Rotation

```bash
# Step 1: Create new key in OpenAI dashboard
NEW_KEY="sk-proj-new-key-here"

# Step 2: Update AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id gkchatty/production/openai-api-key \
  --secret-string "$NEW_KEY"

# Step 3: Restart application (picks up new secret from cache refresh)
kubectl rollout restart deployment/gkchatty-backend

# Step 4: Verify new key works
curl https://api.gkchatty.com/health

# Step 5: Delete old key from OpenAI dashboard (after 24 hours)

# Step 6: Document rotation
echo "$(date): Rotated OpenAI API key" >> docs/key-rotation-log.txt
```

### 2. JWT Secret Rotation (More Complex)

**Supports dual-key verification during transition:**

```typescript
// backend/src/config/jwtConfig.ts

export const JWT_CONFIG = {
  currentSecret: process.env.JWT_SECRET!,
  previousSecret: process.env.JWT_SECRET_PREVIOUS, // Optional

  // Verify token with fallback
  async verifyToken(token: string) {
    try {
      return jwt.verify(token, this.currentSecret);
    } catch (err) {
      if (this.previousSecret) {
        // Try previous secret (during rotation window)
        return jwt.verify(token, this.previousSecret);
      }
      throw err;
    }
  },
};
```

**Rotation Steps:**
1. Generate new JWT secret
2. Set new secret as `JWT_SECRET`
3. Set old secret as `JWT_SECRET_PREVIOUS`
4. Wait 7 days (token expiration period)
5. Remove `JWT_SECRET_PREVIOUS`

## Automation

Set up automated rotation using AWS Secrets Manager rotation Lambda:

```yaml
# terraform/secrets-rotation.tf

resource "aws_secretsmanager_secret_rotation" "openai_key" {
  secret_id           = aws_secretsmanager_secret.openai_key.id
  rotation_lambda_arn = aws_lambda_function.rotate_openai_key.arn

  rotation_rules {
    automatically_after_days = 90
  }
}
```

## Monitoring

Alert on:
- [ ] Secrets older than rotation schedule
- [ ] Failed secret retrievals
- [ ] Expired API keys

## Audit Log

Track all rotations in `docs/key-rotation-log.txt`:

```
2025-01-03: OpenAI API key rotated (Operator: DevOps)
2025-01-03: JWT secret rotated (Operator: Security Team)
```
```

**Checklist:**
- [ ] Create rotation policy document
- [ ] Implement dual-secret JWT verification
- [ ] Create rotation scripts
- [ ] Set up AWS Secrets Manager rotation
- [ ] Configure monitoring/alerts
- [ ] Document first rotation
- [ ] Schedule next rotation
- [ ] Commit policy

---

### Task 3.3: Bundle Size Optimization

**Priority:** P2 - Medium
**Time:** 4 hours
**Impact:** MEDIUM - Improves page load times

**Analysis:**

```bash
cd frontend

# 1. Install bundle analyzer
pnpm add -D @next/bundle-analyzer

# 2. Configure
# next.config.mjs
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // ... existing config
});

# 3. Analyze
ANALYZE=true pnpm build

# Opens visualization in browser
```

**Common Optimizations:**

**1. Dynamic Imports for Large Components**

```typescript
// Before:
import PdfViewer from '@/components/common/PdfViewer';

// After:
const PdfViewer = dynamic(() => import('@/components/common/PdfViewer'), {
  loading: () => <div>Loading PDF viewer...</div>,
  ssr: false,
});
```

**2. Optimize PDF.js Loading**

```typescript
// Only load when needed
const loadPdfJs = async () => {
  const pdfjs = await import('pdfjs-dist');
  return pdfjs;
};
```

**3. Tree Shaking Verification**

```bash
# Check if unused exports are being removed
pnpm build && du -sh .next/static/chunks/*

# Look for unexpectedly large chunks
```

**Targets:**
- Initial bundle: < 200KB gzipped
- Largest chunk: < 500KB
- Total JS: < 1MB

**Checklist:**
- [ ] Install bundle analyzer
- [ ] Run analysis
- [ ] Identify large dependencies
- [ ] Implement dynamic imports
- [ ] Optimize PDF.js loading
- [ ] Re-analyze and compare
- [ ] Document improvements
- [ ] Commit changes

---

## Phase 4: Low Priority (P3) - Backlog

### Task 4.1: OpenAPI Documentation

**Time:** 2 days
**Impact:** HIGH for developers

Use Swagger/OpenAPI to document all API endpoints.

### Task 4.2: Architecture Diagrams

**Time:** 1 day
**Impact:** MEDIUM for onboarding

Create system architecture diagrams using draw.io or Mermaid.

### Task 4.3: Re-chunk Existing Documents

**Time:** 4 hours
**Impact:** MEDIUM for RAG quality

After implementing centralized RAG config, optionally re-process existing documents for consistency.

---

## Tracking Progress

### Update This Document

```bash
# Check off completed tasks
sed -i 's/\[ \]/\[x\]/' docs/IN-PROGRESS-ACTION-PLAN.md
```

### Git Commits

Use conventional commit format:

```
feat: Add centralized RAG configuration
fix: Remove password logging from admin seeder
chore: Remove unused DocumentSidebar import
docs: Add API key rotation policy
refactor: Standardize error handling middleware
perf: Optimize bundle size with dynamic imports
security: Implement AWS Secrets Manager
```

### Status Updates

Update this table weekly:

| Phase | Tasks | Completed | Progress | ETA |
|-------|-------|-----------|----------|-----|
| P0 | 3 | 0 | 0% | 2025-01-04 |
| P1 | 4 | 0 | 0% | 2025-01-07 |
| P2 | 3 | 0 | 0% | 2025-01-21 |
| P3 | 3 | 0 | 0% | Backlog |

---

## Success Metrics

### Before Implementation
- RAG Consistency: 60% ❌
- Code Quality Score: 85%
- Security Score: 75%
- Bundle Size: Unknown

### Target After Implementation
- RAG Consistency: **100%** ✅ (+40%)
- Code Quality Score: **95%** (+10%)
- Security Score: **90%** (+15%)
- Bundle Size: **< 200KB gzipped** ✅

---

## Getting Help

If you encounter issues:

1. **Check Audit Document:** `docs/CODEBASE-AUDIT-2025-01-03.md`
2. **Search Issues:** Check if others had same problem
3. **Ask for Help:** Create issue with `[Action Plan]` tag
4. **Update Plan:** If something doesn't work, update this doc

---

**Plan Created:** January 3, 2025
**Last Updated:** January 3, 2025
**Version:** 1.0
**Status:** Ready for Implementation
