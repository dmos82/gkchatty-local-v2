# GKCHATTYLOCALBUILD - SQLite Migration Audit Report

**Date:** 2025-11-03
**Audit Focus:** Identify all blockers preventing SQLite-only operation

---

## 🔴 CRITICAL BLOCKERS

### Blocker #1: UserModel Imports (27 files)

**27 files** are importing `UserModel` from `models/UserModel` instead of `utils/modelFactory`

**Critical Files (Auth-related):**
1. `middleware/authMiddleware.ts` ⚠️ BLOCKS ALL AUTH
2. `routes/authRoutes.ts` ⚠️ BLOCKS LOGIN
3. `controllers/admin.controller.ts`
4. `routes/adminRoutes.ts`
5. `routes/userRoutes.ts`
6. `routes/chatRoutes.ts`
7. `routes/healthRoutes.ts`
8. `controllers/userSettingsController.ts`
9. `services/personaService.ts`

**Non-Critical Files (Scripts/Tests):**
- `scripts/*` (9 files) - Only run manually, not blocking
- `*test.ts` (4 files) - Test files, not blocking production

**Impact:** Cannot authenticate, cannot login, all protected routes fail

**Fix Required:** Change imports from:
```typescript
import User from '../models/UserModel';
```
To:
```typescript
import { UserModel as User } from '../utils/modelFactory';
```

---

### Blocker #2: Missing Models in SQLite Adapter

**Current SQLite Adapter Models:**
- ✅ `UserModel` (complete)
- ✅ `DocumentModel` (complete)

**Potentially Missing Models:**
- ❓ `PersonaModel` - Used in 2+ files
- ❓ `SettingModel` - Used in 1+ file (index.ts seeder)
- ❓ `ChatModel` / `MessageModel` - May be used for chat history
- ❓ `SystemKbDocumentModel` - May be used for system KB

**Impact:** Unknown - need to test each feature to see what breaks

**Fix Required:**
1. Audit which models are actually needed
2. Add missing models to `sqliteAdapter.ts`
3. Export from `modelFactory.ts`

---

### Blocker #3: Mongoose-Specific Code

**Potential Issues:**
- `.populate()` - Mongoose method for joins (SQLite adapter doesn't support)
- `.lean()` - Mongoose method to return plain objects
- Schema validators - MongoDB-specific
- Mongoose middleware (pre/post hooks)
- Virtual properties

**Impact:** Unknown - need to audit controllers/services

**Fix Required:**
1. Find all uses of `.populate()` and rewrite joins
2. Replace `.lean()` with SQLite-compatible code
3. Remove or adapt Mongoose-specific features

---

##Human: when you greping use single quotes please