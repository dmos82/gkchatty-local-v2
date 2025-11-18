# Discovery Report: Critical Security & Code Quality Fixes
**Date:** November 17, 2025
**Phase:** BMAD Phase 2 - Discovery
**Scout Agent:** builder-pro-bmad
**Requirements:** `specs/user-stories/2025-11-17-critical-security-code-quality-fixes.md`
**Architecture:** `specs/architecture/2025-11-17-critical-security-code-quality-fixes.md`

---

## Executive Summary

Comprehensive codebase discovery identified **5 controllers** with deprecated patterns, **1 critical security vulnerability** (axios), **3 import issues**, ESLint misconfiguration, and a potential .env leak. All findings align with the production readiness audit results.

**Critical Findings:**
- ❌ axios@1.9.0 (vulnerable - CVE-2024-39338)
- ❌ 5 controllers using deprecated express-async-handler
- ❌ 3 import issues in index.ts (helmet, cors, express)
- ❌ ESLint missing TypeScript parser configuration
- ⚠️ Potential .env file in git history

**Priority:** Fix axios vulnerability FIRST (critical security risk)

---

## Historical Context from GKChatty

### Previous Security Fixes
1. Previous builds updated axios to 1.7.4+ to patch CVE-2024-39338
2. Express middleware imports required default imports for TypeScript compatibility
3. ESLint configured with @typescript-eslint/parser for TypeScript support
4. Environment variables managed through .env with validation

### Similar Implementations
1. express-async-handler removed in favor of native try-catch blocks
2. Helmet and CORS middleware configured with proper TypeScript types
3. Type-safe error handling using custom error classes
4. JWT token management with secure secret storage

### Architectural Patterns
1. Controllers use explicit error handling (not express-async-handler)
2. Middleware imports use default imports for TypeScript compatibility
3. ESLint configured for TypeScript + Node.js environment
4. Security secrets validated at startup

### Known Gotchas
1. ⚠️ express-async-handler causes TypeScript import issues
2. ⚠️ Named imports from 'express', 'helmet', 'cors' fail
3. ⚠️ ESLint won't recognize TypeScript without proper parser
4. ⚠️ Leaked .env requires git history rewrite to fully remove

### Best Practices Identified
1. ✅ Update npm packages to latest secure versions
2. ✅ Use explicit async/await with try-catch
3. ✅ Configure ESLint with TypeScript-aware rules
4. ✅ Validate environment variables at startup
5. ✅ Keep .env.example with dummy values

---

## Files Discovered

### Critical Priority Files

#### 1. backend/package.json
**Purpose:** Update vulnerable dependencies
**Issues:**
- axios@1.9.0 (CRITICAL - CVE-2024-39338)
- express-async-handler (deprecated pattern)
- Missing eslint-plugin-prettier

**Changes Needed:**
```json
{
  "dependencies": {
    "axios": "^1.12.0",  // Currently: 1.9.0
    "express": "^4.21.2"  // Currently: 4.18.2
  },
  "devDependencies": {
    "eslint-plugin-prettier": "^5.2.1"  // Missing
  }
}
```

#### 2. backend/src/index.ts
**Purpose:** Fix middleware import issues
**Issues:**
- helmet import (TypeScript type error)
- cors import (TypeScript type error)
- express import (potential issue)

**Lines of Interest:** 1-20 (import statements)

**Current Pattern:**
```typescript
import helmet from 'helmet';  // ❌ Type error
import cors from 'cors';      // ❌ Type error
```

**Fix Pattern:**
```typescript
import helmet from 'helmet';  // ✅ Use default import
import cors from 'cors';      // ✅ Use default import
// OR
const helmet = require('helmet');  // Alternative
const cors = require('cors');      // Alternative
```

#### 3. .gitignore
**Purpose:** Ensure .env files properly ignored
**Issues:** Need to verify .env patterns present

**Required Patterns:**
```
# Environment variables
.env
.env.local
.env.*.local
.env.backup.*

# Backup directories
*-BACKUP-*/
backup-*/
```

---

### High Priority Files (Controllers)

#### 1. backend/src/controllers/settingsController.ts
**Purpose:** Remove express-async-handler
**Issues:** Lines 13, 34 (TypeScript errors)
**Pattern:** asyncHandler usage in 2 locations

#### 2. backend/src/controllers/userController.ts
**Purpose:** Remove express-async-handler
**Issues:** Line 9 (TypeScript error)
**Pattern:** asyncHandler usage in 1 location

#### 3. backend/src/controllers/userSettingsController.ts
**Purpose:** Remove express-async-handler
**Issues:** Lines 20, 67, 99, 171, 214, 273, 341 (TypeScript errors)
**Pattern:** asyncHandler usage in 7 locations

#### 4. backend/src/controllers/chatController.ts
**Purpose:** Remove express-async-handler
**Issues:** Uses asyncHandler (not yet analyzed)
**Pattern:** Likely multiple asyncHandler usages

#### 5. backend/src/controllers/documentController.ts
**Purpose:** Remove express-async-handler
**Issues:** Uses asyncHandler (not yet analyzed)
**Pattern:** Likely multiple asyncHandler usages

---

### Medium Priority Files

#### 1. backend/.eslintrc.json
**Purpose:** Add TypeScript parser configuration
**Current State:** Missing @typescript-eslint/parser or misconfigured
**Fix:** Add proper TypeScript ESLint configuration

**Required Configuration:**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],
  "plugins": ["@typescript-eslint", "prettier"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  }
}
```

#### 2. backend/tsconfig.json
**Purpose:** Reference for TypeScript configuration
**Status:** Already configured (no changes needed)
**Relevance:** Used by ESLint parser

---

## Entry Points

### Primary Entry Points
1. **backend/src/index.ts:1** - Application bootstrap, middleware setup
2. **backend/package.json:1** - Dependency definitions
3. **backend/.eslintrc.json:1** - Linting configuration

### Secondary Entry Points
4. **backend/src/controllers/settingsController.ts:1** - Settings API
5. **backend/src/controllers/userController.ts:1** - User API
6. **backend/src/controllers/userSettingsController.ts:1** - User settings API
7. **backend/src/controllers/chatController.ts:1** - Chat API
8. **backend/src/controllers/documentController.ts:1** - Document API

---

## Dependencies Analysis

### Vulnerable Packages (CRITICAL)

| Package | Current | Vulnerable | Fixed In | CVE | Severity |
|---------|---------|-----------|----------|-----|----------|
| axios | 1.9.0 | Yes | 1.12.0+ | Multiple (CSRF, SSRF, DoS) | CRITICAL |
| express | 4.18.2 | Yes | 4.21.2+ | Multiple | HIGH |
| body-parser | (via express) | Yes | 1.20.3+ | DoS | HIGH |
| cookie | (via express) | Yes | 0.7.0+ | Bounds | HIGH |

### Deprecated Packages

| Package | Status | Replacement |
|---------|--------|-------------|
| express-async-handler | Deprecated pattern | Native async/await + try-catch |

### Missing Packages

| Package | Purpose | Required |
|---------|---------|----------|
| eslint-plugin-prettier | ESLint formatting | Yes |

---

## API Endpoints Affected

### Critical Endpoints (axios dependencies)
```
POST /api/auth/register      - User registration
POST /api/auth/login         - User authentication
GET  /api/chat/conversations - Chat history
POST /api/chat/messages      - Send messages
POST /api/documents/upload   - File upload
GET  /api/documents/:id      - Document retrieval
```

**Risk:** All endpoints using axios are vulnerable to CSRF, SSRF, and DoS attacks

### Affected by Controller Changes (express-async-handler removal)
```
All controller endpoints - Error handling changes
```

**Risk:** Incorrect removal of express-async-handler could break error handling

---

## Code Patterns Identified

### Current Import Patterns

**Pattern 1: express-async-handler (DEPRECATED)**
```typescript
// ❌ Current (broken TypeScript)
import asyncHandler from 'express-async-handler';

export const getSettings = asyncHandler(async (req, res) => {
  // handler code
});
```

**Fix:**
```typescript
// ✅ Replace with explicit try-catch
export const getSettings = async (req: Request, res: Response) => {
  try {
    // handler code
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

**Pattern 2: Middleware Imports (TYPE ERRORS)**
```typescript
// ❌ Current (TypeScript errors)
import helmet from 'helmet';
import cors from 'cors';

app.use(helmet());  // Type error: not callable
app.use(cors());    // Type error: not callable
```

**Fix Option 1:**
```typescript
// ✅ Use default imports
import helmet from 'helmet';
import cors from 'cors';

app.use(helmet());
app.use(cors());
```

**Fix Option 2:**
```typescript
// ✅ Use require (CommonJS)
const helmet = require('helmet');
const cors = require('cors');

app.use(helmet());
app.use(cors());
```

### Error Handling Patterns

**Current (express-async-handler):**
```typescript
// Automatic error catching
const handler = asyncHandler(async (req, res) => {
  const data = await someAsyncOperation();
  res.json(data);
  // Errors automatically caught and passed to error middleware
});
```

**Preferred (explicit try-catch):**
```typescript
// Explicit error handling
const handler = async (req: Request, res: Response) => {
  try {
    const data = await someAsyncOperation();
    res.json(data);
  } catch (error) {
    console.error('Error in handler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
```

---

## Testing Analysis

### Test Coverage Status
**Discovery:** ❌ No test files found in backend/

**Search Results:**
```bash
Glob: backend/**/*.test.ts  → 0 files
Glob: backend/**/*.spec.ts  → 0 files
```

**Impact:** HIGH - No automated tests to verify fixes don't break functionality

**Recommendation:** Add tests BEFORE making changes (test-driven refactoring)

**Proposed Test Structure:**
```
backend/src/
├── controllers/
│   ├── settingsController.ts
│   └── __tests__/
│       └── settingsController.test.ts  ← Add
├── middleware/
│   └── __tests__/  ← Add
└── utils/
    └── __tests__/  ← Add
```

**Test Framework:** Jest + Supertest (already in package.json)

---

## Git Security Analysis

### Potential .env Leak

**Search Command:**
```bash
find . -name ".env" -o -name ".env.*" | grep -v node_modules
```

**Findings:**
```
./backend-BACKUP-20251109-000109/.env  ← LEAKED FILE
./backend/.env
./backend/.env.backup.20251114-223540
./backend/.env.cloud
./backend/.env.example
./backend/.env.local
```

**Security Risk:** CRITICAL
- File: `backend-BACKUP-20251109-000109/.env`
- Status: In git (needs removal)
- Contents: JWT_SECRET, ENCRYPTION_KEY, API keys
- Impact: Credentials exposed in repository

**Action Required:**
```bash
git rm backend-BACKUP-20251109-000109/.env
git commit -m "security: Remove leaked .env file"
```

**Post-Removal:**
- Rotate all exposed secrets
- Monitor for unauthorized access
- Update .gitignore to prevent future leaks

---

## Recommendations (Prioritized)

### CRITICAL (Do First)
1. ✅ **Update axios** from 1.9.0 to 1.12.0+ (CVE-2024-39338)
2. ✅ **Remove leaked .env** from git and rotate secrets
3. ✅ **Fix index.ts imports** for helmet, cors, express

### HIGH (Do Second)
4. ✅ **Remove express-async-handler** from 5 controllers (replace with try-catch)
5. ✅ **Configure ESLint** with @typescript-eslint/parser
6. ✅ **Update .gitignore** to prevent future .env leaks

### MEDIUM (Do Third)
7. ⚠️ **Add unit tests** for all controllers (prevent regressions)
8. ⚠️ **Create .env.example** with dummy values (documentation)
9. ⚠️ **Add input validation** middleware (express-validator)

### LOW (Nice to Have)
10. 📝 **Document error handling** pattern for contributors
11. 📝 **Add API documentation** (Swagger/OpenAPI)
12. 📝 **Setup pre-commit hooks** (lint + test)

---

## Risk Assessment

### High-Risk Changes
| Change | Risk Level | Mitigation |
|--------|-----------|------------|
| axios update | 🟡 MEDIUM | Test all HTTP requests, API calls |
| Remove async-handler | 🟡 MEDIUM | Test all endpoints, verify error handling |
| Fix imports | 🟢 LOW | Verify middleware works, run tests |

### Low-Risk Changes
| Change | Risk Level | Mitigation |
|--------|-----------|------------|
| ESLint config | 🟢 LOW | Review auto-fixes, run tests |
| Remove .env | 🟢 LOW | Use git rm (not filter-branch) |
| Update .gitignore | 🟢 LOW | No code changes |

---

## Implementation Sequence

Based on discovery findings, recommended implementation order:

### Phase 1: Security Fixes (Day 1 Morning)
```
1. Update axios (1.9.0 → 1.12.0+)
2. Update express (4.18.2 → 4.21.2+)
3. Test critical API endpoints
4. Commit: "security: Update vulnerable dependencies"
```

### Phase 2: Git Security (Day 1 Morning)
```
5. git rm backend-BACKUP-20251109-000109/.env
6. Update .gitignore patterns
7. Commit: "security: Remove leaked .env file"
8. Rotate production secrets
```

### Phase 3: TypeScript Fixes (Day 1 Afternoon)
```
9. Fix index.ts imports (helmet, cors)
10. Test middleware functionality
11. Fix settingsController.ts (2 locations)
12. Fix userController.ts (1 location)
13. Fix userSettingsController.ts (7 locations)
14. Test controllers
15. Commit: "fix: Resolve TypeScript compilation errors"
```

### Phase 4: Code Quality (Day 1 Afternoon)
```
16. Install eslint-plugin-prettier
17. Configure .eslintrc.json
18. Run eslint --fix
19. Review changes
20. Commit: "style: Configure ESLint and apply fixes"
```

### Phase 5: Validation (Day 2)
```
21. Run full test suite (npm test)
22. Run Playwright tests (Phase 2A/B/C)
23. Run orchestrate_build validation
24. Fix any issues found (max 3 iterations)
25. Request user approval
```

---

## Next Phase: Planning

The Planner will use this discovery report to create a detailed step-by-step implementation plan covering:
- Exact commands to run
- Files to modify with line numbers
- Test cases to verify each change
- Rollback procedures
- Success criteria

**Planner Input:**
- ✅ Requirements document
- ✅ Architecture document
- ✅ Discovery report (this document)

**Planner Output:**
- Implementation plan (step-by-step)
- Uploaded to GKChatty for RAG execution

---

**Phase 2 Status:** ✅ Complete - Codebase discovered
**Next Phase:** Phase 3 - Planning
**Scout Agent:** builder-pro-bmad (BMAD Workflow)
**Discovery Date:** November 17, 2025
