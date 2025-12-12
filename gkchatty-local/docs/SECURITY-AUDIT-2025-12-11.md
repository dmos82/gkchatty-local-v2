# GKChatty Security Audit Report

**Date:** December 11, 2025
**Auditor:** Automated Security Scan
**Scope:** Full backend and frontend codebase

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| **CRITICAL** | 7 | Requires immediate action |
| **HIGH** | 12 | Fix within 1 week |
| **MEDIUM** | 11 | Fix within 2-4 weeks |
| **LOW** | 4 | Address as resources permit |
| **TOTAL** | 34 | - |

### Previously Fixed (This Session)
- CRITICAL-001: Generic error messages ✅
- CRITICAL-003: Clear sessions on password change ✅
- CRITICAL-004: Sanitize filenames in uploads ✅
- HIGH-005: Remove unsafe-inline from CSP ✅
- HIGH-007: Prototype pollution protection ✅

### Fixed (Current Session - Dec 11, 2025)
- SEC-004: Double middleware invocation ✅ (adminAuthMiddleware.ts - proper composition)
- SEC-005: Unprotected Ollama routes ✅ (ollamaRoutes.ts - added protect middleware)
- SEC-006: System KB IDOR vulnerability ✅ (systemKbRoutes.ts - folder permission filtering)
- SEC-007: Command injection ✅ (resourceMonitor.ts - spawnSync with arg arrays)
- SEC-008: XSS in WordViewer ✅ (WordViewer.tsx - DOMPurify.sanitize on dangerouslySetInnerHTML)
- SEC-009: XSS in CollaborativeEditor ✅ (CollaborativeEditor.tsx - DOMParser instead of innerHTML)
- SEC-010: NoSQL injection in auditService ✅ (auditService.ts - escapeRegExp on username filter)
- SEC-011: NoSQL injection in persona migration ✅ (migrateUserCustomPrompts.ts - escapeRegExp)
- SEC-013: Debug logging of secrets ✅ (authMiddleware.ts - removed JWT_SECRET debug logs)
- SEC-014: Presigned URL rate limit bypass ✅ (rateLimiter.ts - removed skip condition)
- SEC-017: Account enumeration ✅ (authRoutes.ts - generic INVALID_CREDENTIALS reason)
- SEC-018: Admin role not re-verified ✅ (authMiddleware.ts - fetch fresh role from DB)
- SEC-019: Weak encryption key fallback ✅ (cryptoUtils.ts - throw error in production)
- SEC-015: WebSocket message flooding ✅ (socketService.ts - added per-socket rate limiting)
- SEC-016: JWT 8-hour expiration too long ✅ (authRoutes.ts - reduced to 1h with refresh token endpoint)
- Added backend/.gitignore to prevent .env commits ✅

---

## CRITICAL FINDINGS (7)

### SEC-001: Hardcoded AWS Credentials in .env
**File:** `backend/.env:28-29`
**Risk:** Full AWS account compromise

```
AWS_ACCESS_KEY_ID=[REDACTED - credential exposed in .env]
AWS_SECRET_ACCESS_KEY=[REDACTED - credential exposed in .env]
```

**Impact:** Attacker can access S3 buckets, incur costs, exfiltrate data
**Fix:**
1. Rotate credentials IMMEDIATELY
2. Use IAM roles or AWS credential profiles
3. Add `.env` to `.gitignore`
4. Run `git-filter-repo` to remove from history

---

### SEC-002: Hardcoded Pinecone API Key
**File:** `backend/.env:35`
**Risk:** Vector database compromise

**Impact:** Read/modify/delete all RAG embeddings
**Fix:** Rotate key immediately in Pinecone dashboard

---

### SEC-003: Hardcoded Redis Credentials
**File:** `backend/.env:91`
**Risk:** Session/cache compromise

**Impact:** Bypass rate limiting, access cached data
**Fix:** Change Redis password in Redis Cloud

---

### SEC-004: Double Middleware Invocation
**File:** `backend/src/middleware/adminAuthMiddleware.ts:7-36`
**Risk:** Authentication bypass

```typescript
export const adminProtect = async (req: Request, res: Response, next: NextFunction) => {
  // BUG: protect() called as callback, not proper middleware
  await protect(req, res, async () => {
    await isAdmin(req, res, next);
  });
};
```

**Impact:** Improper Express middleware chaining can skip auth
**Fix:** Use proper middleware composition:
```typescript
export const adminProtect = [protect, isAdmin];
```

---

### SEC-005: Unprotected Ollama Routes
**File:** `backend/src/routes/ollamaRoutes.ts:24-38`
**Risk:** Unauthorized LLM access

**Impact:** Public access to `/api/models/ollama/*` endpoints
**Fix:** Add `protect` middleware to all Ollama routes

---

### SEC-006: System KB IDOR Vulnerability
**File:** `backend/src/routes/systemKbRoutes.ts:26-57, 162-187`
**Risk:** Document access without authorization

**Impact:** Any authenticated user can access any System KB document by ID
**Fix:** Verify folder permissions before serving documents

---

### SEC-007: Command Injection (Windows)
**File:** `backend/src/services/embedding/resourceMonitor.ts:77`
**Risk:** Remote code execution

```typescript
const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace`, {
  encoding: 'utf-8',
});
```

**Impact:** Arbitrary command execution if `targetPath` contains special chars
**Fix:** Use `spawnSync()` with argument array, not string interpolation

---

## HIGH SEVERITY FINDINGS (12)

### SEC-008: XSS via dangerouslySetInnerHTML
**File:** `frontend/src/components/viewers/WordViewer.tsx:168`

```typescript
<article dangerouslySetInnerHTML={{ __html: htmlContent }} />
```

**Fix:** Sanitize with DOMPurify before rendering

---

### SEC-009: XSS via innerHTML
**File:** `frontend/src/components/im/CollaborativeEditor.tsx:237`

```typescript
tempDiv.innerHTML = html; // Direct assignment
```

**Fix:** Use DOMParser with validation

---

### SEC-010: NoSQL Injection in Audit Service
**File:** `backend/src/services/auditService.ts:111`

```typescript
query.username = { $regex: filters.username, $options: 'i' };
```

**Fix:** Use `escapeRegExp()` utility

---

### SEC-011: NoSQL Injection in Persona Migration
**File:** `backend/src/scripts/migrateUserCustomPrompts.ts:40`

```typescript
name: { $regex: new RegExp(`^${name}$`, 'i') }
```

**Fix:** Escape user input with `escapeRegExp()`

---

### SEC-012: Stack Traces in API Responses
**Files:** Multiple (healthRoutes.ts, pineconeService.ts, searchRoutes.ts, etc.)

```typescript
error: { message: error.message, stack: error.stack }
```

**Fix:** Only expose stack traces in development mode

---

### SEC-013: Debug Logging of Secrets
**File:** `backend/src/middleware/authMiddleware.ts:254-264`

Logs JWT_SECRET length, first/last characters, full headers, cookies

**Fix:** Remove sensitive debug logging or use structured logger with redaction

---

### SEC-014: Presigned URL Rate Limit Bypass
**File:** `backend/src/middleware/rateLimiter.ts:256-270`

```typescript
skip: (req) => req.path.includes('/get-presigned-url')
```

**Impact:** Unlimited presigned URL generation
**Fix:** Remove skip condition

---

### SEC-015: WebSocket Message Flooding
**File:** `backend/src/services/socketService.ts:348-413`

No rate limiting on socket events (dm:send, collab:sync, etc.)

**Fix:** Implement per-socket rate limiting

---

### SEC-016: JWT 8-Hour Expiration Too Long
**File:** `backend/src/middleware/authMiddleware.ts`

**Fix:** Reduce to 30-60 minutes with refresh tokens

---

### SEC-017: Account Enumeration via Audit Logs
**File:** `backend/src/routes/authRoutes.ts:204-231`

Audit logs differentiate `USER_NOT_FOUND` vs `INVALID_PASSWORD`

**Fix:** Log generic `LOGIN_FAILED` for both cases

---

### SEC-018: Admin Role Not Re-verified from DB
**File:** `backend/src/middleware/authMiddleware.ts:152-173`

`isAdmin` trusts JWT claim without database verification

**Fix:** Fetch user from DB and verify current role

---

### SEC-019: Weak Encryption Key Fallback
**File:** `backend/src/utils/cryptoUtils.ts:8, 58-62`

```typescript
const BASE_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef...';
```

**Fix:** Throw error in production if ENCRYPTION_KEY not set

---

## MEDIUM SEVERITY FINDINGS (11)

| ID | Finding | File | Line |
|----|---------|------|------|
| SEC-020 | Weak password (6 char min) | authRoutes.ts | 16 |
| SEC-021 | No rate limit on password change | authRoutes.ts | 154-156 |
| SEC-022 | Session array unbounded (10 max) | authRoutes.ts | 297-310 |
| SEC-023 | ReDoS in persona query | migrateUserCustomPrompts.ts | 38-42 |
| SEC-024 | Regex injection in folder ops | folderController.ts | 357-365 |
| SEC-025 | Reaction array unbounded | socketService.ts | 820-861 |
| SEC-026 | Missing .env.example entries | .env.example | - |
| SEC-027 | Test credentials in git | .test-credentials.json | - |
| SEC-028 | Hardcoded test passwords | test scripts | Multiple |
| SEC-029 | Cipher fallback in prod | cryptoUtils.ts | 26-34 |
| SEC-030 | Console output unfiltered | Multiple | Multiple |

---

## LOW SEVERITY FINDINGS (4)

| ID | Finding | File |
|----|---------|------|
| SEC-031 | Weak presigned URL expiry (1hr) | conversationRoutes.ts |
| SEC-032 | Permissive CORS in dev | index.ts |
| SEC-033 | Missing request ID validation | index.ts |
| SEC-034 | Inconsistent regex escaping | audit-systemkbdocuments.ts |

---

## SECURITY POSITIVES

The codebase demonstrates several good security practices:

1. **Bcrypt with 12 rounds** - Proper password hashing
2. **JWT with JTI** - Session tracking via token ID
3. **Helmet.js** - Security headers configured
4. **CORS configuration** - Proper origin validation
5. **Input sanitization middleware** - DOMPurify-based sanitizer exists
6. **Regex escape utility** - `escapeRegExp()` available (but underutilized)
7. **File validation** - Magic number + MIME type checking
8. **File size limits** - Proper limits per file type
9. **Request body limits** - 10MB JSON limit configured
10. **WebSocket authentication** - JWT validation on connection

---

## REMEDIATION PRIORITY

### Immediate (Today)
1. **Rotate all exposed credentials** (SEC-001, SEC-002, SEC-003)
2. **Remove .env from git history**
3. **Fix command injection** (SEC-007)

### Week 1
1. Fix double middleware invocation (SEC-004)
2. Add auth to Ollama routes (SEC-005)
3. Fix System KB IDOR (SEC-006)
4. Sanitize XSS vectors (SEC-008, SEC-009)
5. Fix NoSQL injection (SEC-010, SEC-011)

### Week 2
1. Remove stack traces from production (SEC-012)
2. Clean up debug logging (SEC-013)
3. Restore presigned URL rate limiting (SEC-014)
4. Implement socket rate limiting (SEC-015)

### Week 3-4
1. Reduce JWT expiration (SEC-016)
2. Fix account enumeration (SEC-017)
3. Re-verify admin role from DB (SEC-018)
4. Remove encryption fallback (SEC-019)

### Ongoing
1. Improve password policy (SEC-020)
2. Add rate limiting to more endpoints (SEC-021)
3. Reduce session limits (SEC-022)
4. Address remaining medium/low findings

---

## TESTING RECOMMENDATIONS

### Penetration Testing
- Test all auth bypass scenarios
- Test NoSQL injection on search/filter endpoints
- Test XSS in document viewers and chat
- Test IDOR on document access

### Load Testing
- Test WebSocket flood resilience
- Test presigned URL generation limits
- Test reaction/message limits

### Security Scanning
- Run `npm audit` weekly
- Implement git-secrets pre-commit hook
- Add SAST to CI/CD pipeline

---

## APPENDIX: File Quick Reference

| Category | Key Files |
|----------|-----------|
| Auth | `authMiddleware.ts`, `authRoutes.ts`, `adminAuthMiddleware.ts` |
| File Upload | `multerConfig.ts`, `s3Helper.ts`, `documentRoutes.ts` |
| WebSocket | `socketService.ts` |
| Rate Limiting | `rateLimiter.ts` |
| Crypto | `cryptoUtils.ts` |
| XSS Risk | `WordViewer.tsx`, `CollaborativeEditor.tsx` |
| Injection Risk | `auditService.ts`, `folderController.ts` |

---

*Report generated automatically. Manual verification recommended for all findings.*
