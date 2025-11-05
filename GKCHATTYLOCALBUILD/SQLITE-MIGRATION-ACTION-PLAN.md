# GKCHATTYLOCALBUILD - SQLite Migration Action Plan

**Date:** 2025-11-03
**Goal:** Complete SQLite + LanceDB migration to enable local-only operation

---

## 📊 Audit Summary

| Model | Files Using It | Status |
|-------|---------------|---------|
| UserModel | 27 files | ❌ All using MongoDB import |
| DocumentModel | 51 files | ❌ All using MongoDB import |
| PersonaModel | 4 files | ❌ All using MongoDB import |
| SettingModel | 1 file | ❌ Using MongoDB import |

**Total Files to Fix:** ~83 imports across ~30 unique files

---

## 🎯 Strategy: Phased Approach

### Phase 1: Auth System (CRITICAL - Unblocks Everything)
**Goal:** Get login working so we can test other features

**Files to Fix (Priority Order):**
1. `middleware/authMiddleware.ts` ⚠️ HIGHEST PRIORITY
2. `routes/authRoutes.ts`
3. `controllers/admin.controller.ts` (if used by auth)

**Estimated Time:** 30-60 minutes

**Success Criteria:**
- ✅ Login with admin/admin succeeds
- ✅ Returns valid JWT token
- ✅ Protected routes work

---

### Phase 2: Document Upload (HIGH PRIORITY)
**Goal:** Test SQLite + LanceDB integration end-to-end

**Files to Fix:**
1. Document controllers
2. Document routes
3. Document processing services

**Estimated Time:** 1-2 hours

**Success Criteria:**
- ✅ Upload document via API succeeds
- ✅ Document saved to SQLite (not MongoDB)
- ✅ Document embedded with Transformers.js
- ✅ Vectors stored in LanceDB

---

### Phase 3: Search/Chat (MEDIUM PRIORITY)
**Goal:** Verify RAG pipeline works with LanceDB

**Files to Fix:**
1. Chat routes
2. Search routes
3. Chat controllers

**Estimated Time:** 1-2 hours

**Success Criteria:**
- ✅ Search queries work against LanceDB
- ✅ Chat responses generated from LanceDB vectors
- ✅ No MongoDB queries during search

---

### Phase 4: Remaining Features (LOW PRIORITY)
**Goal:** Complete migration for all features

**Files to Fix:**
1. User settings
2. Personas
3. Admin features
4. Health checks

**Estimated Time:** 2-3 hours

---

## 🔧 Implementation Details

### Step-by-Step: Phase 1 (Auth System)

#### Step 1.1: Fix authMiddleware.ts

**Current Code:**
```typescript
import User from '../models/UserModel';
```

**New Code:**
```typescript
import { UserModel as User } from '../utils/modelFactory';
```

**File:** `backend/src/middleware/authMiddleware.ts`

**Test:** After this change, try login - should not crash

---

#### Step 1.2: Fix authRoutes.ts

**Same change as above**

**File:** `backend/src/routes/authRoutes.ts`

**Test:** Login should work

---

#### Step 1.3: Test Login

```bash
curl -X POST http://localhost:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "admin",
    "role": "admin"
  }
}
```

---

### Automated Fix Script

We can create a script to automatically replace imports:

```bash
#!/bin/bash
# fix-imports.sh

# Fix UserModel imports
find backend/src -name "*.ts" -not -path "*/node_modules/*" -not -name "*.test.ts" \
  -exec sed -i '' "s/from '\.\.\/models\/UserModel'/from '..\/utils\/modelFactory'/g" {} +

# Fix DocumentModel imports
find backend/src -name "*.ts" -not -path "*/node_modules/*" -not -name "*.test.ts" \
  -exec sed -i '' "s/from '\.\.\/models\/.*Document.*'/from '..\/utils\/modelFactory'/g" {} +

# Fix PersonaModel imports
find backend/src -name "*.ts" -not -path "*/node_modules/*" -not -name "*.test.ts" \
  -exec sed -i '' "s/from '\.\.\/models\/PersonaModel'/from '..\/utils\/modelFactory'/g" {} +

echo "✅ Import paths updated. Now update variable names..."
```

**WARNING:** This is risky - might break things. Better to do manually for critical files first.

---

## 🚀 Recommended Execution Plan

### Option A: Manual Fix (RECOMMENDED)
**Pros:** Safe, controlled, test as you go
**Cons:** Takes longer

**Steps:**
1. Fix `authMiddleware.ts` manually
2. Test login
3. Fix `authRoutes.ts` manually
4. Test login again
5. Move to Phase 2 once login works

**Time:** 4-6 hours total (all phases)

---

### Option B: Automated Fix with Manual Verification
**Pros:** Faster
**Cons:** Might break more things at once

**Steps:**
1. Create backup: `cp -r backend/src backend/src.backup`
2. Run automated script on auth files only
3. Test thoroughly
4. If works, continue to other files
5. If breaks, restore backup and go manual

**Time:** 2-3 hours total (all phases) if no issues

---

### Option C: Hybrid Approach (BEST)
**Pros:** Balance of speed and safety
**Cons:** Requires careful planning

**Steps:**
1. Phase 1 (Auth): Manual fix + test (30-60 min)
2. Phase 2 (Docs): Automated fix + test (1 hour)
3. Phase 3 (Chat): Automated fix + test (1 hour)
4. Phase 4 (Rest): Automated fix + test (1 hour)

**Time:** 3-4 hours total

---

## 📝 Testing Checklist

After each phase:

**Phase 1 (Auth):**
- [ ] Login with admin/admin succeeds
- [ ] JWT token generated
- [ ] Protected route `/api/users/me` works
- [ ] Logout works

**Phase 2 (Documents):**
- [ ] Upload test document
- [ ] Check SQLite database has document record
- [ ] Check LanceDB has vectors
- [ ] Query document by ID works

**Phase 3 (Search/Chat):**
- [ ] Search for uploaded document
- [ ] Chat query returns results
- [ ] Results come from LanceDB (check logs)

**Phase 4 (Complete):**
- [ ] All features tested
- [ ] No MongoDB errors in logs
- [ ] Health check passes

---

## 🎯 Success Metrics

**Definition of Done:**
1. ✅ All 27 UserModel imports updated
2. ✅ All 51 DocumentModel imports updated
3. ✅ All 4 PersonaModel imports updated
4. ✅ Login works with SQLite
5. ✅ Document upload works with SQLite + LanceDB
6. ✅ Search/chat works with LanceDB
7. ✅ No MongoDB connection attempts
8. ✅ All features work locally without cloud dependencies

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Break existing MongoDB mode | High | Test in GKCHATTYLOCALBUILD only, keep modelFactory pattern |
| Mongoose-specific code breaks | Medium | Audit for `.populate()`, `.lean()`, etc. before fixing |
| Missing SQLite models | High | Add to sqliteAdapter.ts as needed |
| Performance issues | Low | SQLite is fast for single-user |

---

## 📋 Next Immediate Action

**START HERE:**

1. Open `backend/src/middleware/authMiddleware.ts`
2. Change line that imports User from models to import from modelFactory
3. Save file
4. Restart backend
5. Test login

**Command to test:**
```bash
curl -X POST http://localhost:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

If login works → Move to Phase 2
If login fails → Debug and fix before continuing
