# COMPREHENSIVE MONGOOSE DIRECT IMPORT AUDIT
## Backend SQLite Migration - Phase 4

**Date:** November 4, 2025
**Codebase:** GKChatty Backend
**Objective:** Identify ALL locations where Mongoose models are being imported directly instead of using modelFactory.ts

---

## SUMMARY OF FINDINGS

**Total Files with Direct Mongoose Imports:** 16
**Critical Issues (Active Code Paths):** 4
**Medium Issues (Secondary/Test Code):** 12

**Models Affected:**
- User (UserModel) - 8 files
- Setting (SettingModel) - 6 files
- Chat (ChatModel) - 3 files
- Persona (PersonaModel) - 2 files
- Folder (FolderModel) - 1 file (interface only)
- UserSettings - 1 file
- UserDocument - 0 files (correctly imported via modelFactory)
- SystemKbDocument - 0 files (correctly imported via modelFactory)

---

## CRITICAL ISSUES - PRODUCTION CODE

### File 1: src/routes/admin.ts
**Severity:** CRITICAL
**Lines:** 2
**Imported Models:** User (direct Mongoose)
**Usage:** ACTIVE - User.find() queries on line 13
**Impact:** HIGH - This route is active in production and directly uses Mongoose
**Database Connection:** Will fail to switch to SQLite; will only work with MongoDB

**Current Code:**
```typescript
import User from '../models/UserModel';  // LINE 2 - DIRECT MONGOOSE IMPORT
```

**Expected Fix:**
```typescript
import { UserModel as User } from '../utils/modelFactory';
```

---

### File 2: src/routes/chatRoutes.ts
**Severity:** CRITICAL
**Lines:** 9, 10, 13
**Imported Models:** Chat (ChatModel), Setting (SettingModel), UserSettings
**Usage:** ACTIVE - Multiple queries throughout the file
**Impact:** HIGH - Chat functionality completely broken in SQLite mode

**Current Code:**
```typescript
// LINE 8 - PARTIALLY CORRECT
import { ChatModel as Chat, UserModel as User, IUser, IChat } from '../utils/modelFactory';

// LINE 9 - WRONG - DIRECT MONGOOSE IMPORT
import { IChatMessage } from '../models/ChatModel';

// LINE 10 - WRONG - DIRECT MONGOOSE IMPORT
import Setting from '../models/SettingModel';

// LINE 13 - WRONG - DIRECT MONGOOSE IMPORT
import UserSettings, { IUserSettings } from '../models/UserSettings';
```

**Issues:**
- Line 10: `Setting` is imported directly from SettingModel (NOT from modelFactory)
- Line 13: `UserSettings` is imported directly from models (NOT from modelFactory)
- These are used in active chat operations

**Expected Fix:**
```typescript
import { ChatModel as Chat, UserModel as User, IUser, IChat, SettingModel as Setting, UserSettingsModel as UserSettings } from '../utils/modelFactory';
import { IChatMessage, IUserSettings } from '../models/ChatModel';
```

---

### File 3: src/routes/adminSettingsRoutes.ts
**Severity:** CRITICAL
**Lines:** 11
**Imported Models:** Setting (SettingModel)
**Usage:** ACTIVE - Used in admin settings endpoints
**Impact:** HIGH - Admin settings functionality broken in SQLite mode

**Current Code:**
```typescript
import Setting from '../models/SettingModel'; // LINE 11 - DIRECT MONGOOSE IMPORT
```

**Expected Fix:**
```typescript
import { SettingModel as Setting } from '../utils/modelFactory';
```

---

### File 4: src/routes/documentRoutes.ts
**Severity:** HIGH
**Lines:** 25, 26
**Imported Models:** Chat (IChatSession interfaces), Persona (PersonaModel)
**Usage:** ACTIVE - Used in document processing and context retrieval
**Impact:** MEDIUM-HIGH - Document route functionality affected

**Current Code:**
```typescript
// LINE 25 - WRONG - DIRECT MONGOOSE IMPORT (INTERFACE ONLY)
import { IChat as IChatSession, IChatMessage } from '../models/ChatModel';

// LINE 26 - WRONG - DIRECT MONGOOSE IMPORT (MODEL + INTERFACE)
import { default as Persona, IPersona } from '../models/PersonaModel';
```

**Issues:**
- Line 25: Importing interfaces directly from ChatModel instead of modelFactory
- Line 26: Importing the Persona model directly (not using modelFactory)
- Note: Line 24 correctly imports ChatSession from modelFactory, but line 26 overrides it

**Expected Fix:**
```typescript
import { PersonaModel as Persona, ChatModel as ChatSession } from '../utils/modelFactory';
import { IChat as IChatSession, IChatMessage } from '../models/ChatModel';
import { IPersona } from '../models/PersonaModel';
```

---

## MEDIUM-HIGH ISSUES - SERVICES & CONTROLLERS

### File 5: src/services/settingsService.ts
**Severity:** MEDIUM-HIGH
**Lines:** 1
**Imported Models:** Setting (SettingModel)
**Usage:** ACTIVE - Core service used by multiple controllers
**Impact:** MEDIUM - Settings queries fail in SQLite mode

**Current Code:**
```typescript
import Setting from '../models/SettingModel'; // LINE 1 - DIRECT MONGOOSE IMPORT
```

**Expected Fix:**
```typescript
import { SettingModel as Setting } from '../utils/modelFactory';
```

**Note:** This is a service that's heavily used by multiple routes (settingsController, adminSettingsRoutes, etc.). Direct import here cascades the problem.

---

### File 6: src/controllers/settingsController.ts
**Severity:** MEDIUM
**Lines:** 2
**Imported Models:** Setting (SettingModel)
**Usage:** ACTIVE - GET/PUT system prompt endpoints
**Impact:** MEDIUM - Settings endpoints broken in SQLite mode

**Current Code:**
```typescript
import Setting from '../models/SettingModel'; // LINE 2 - DIRECT MONGOOSE IMPORT
```

**Expected Fix:**
```typescript
import { SettingModel as Setting } from '../utils/modelFactory';
```

---

### File 7: src/controllers/example-async-handler.controller.ts
**Severity:** LOW (Example/Test Code)
**Lines:** 5
**Imported Models:** User (UserModel)
**Usage:** Example controller (likely not active)
**Impact:** LOW - Example file

**Current Code:**
```typescript
import User from '../models/UserModel'; // LINE 5 - DIRECT MONGOOSE IMPORT
```

---

## TEST FILE ISSUES - 8 FILES

### Test Files with Direct Mongoose Imports:
The following test files have direct imports, but these are test-only and don't affect production:

1. **src/routes/__tests__/adminSettingsRoutes.test.ts**
   - Lines: 8, 9
   - Imports: User, Setting (direct)
   
2. **src/routes/__tests__/authRoutes.test.ts**
   - Line: 5
   - Imports: User (direct)
   
3. **src/routes/__tests__/chatRoutes.test.ts**
   - Lines: 8, 9
   - Imports: Setting, User (direct)
   
4. **src/controllers/__tests__/admin.controller.test.ts**
   - Lines: 37, 40
   - Imports: User, Chat (direct)
   
5. **src/services/__tests__/personaService.test.ts**
   - Lines: 29, 30
   - Imports: PersonaModel, User (direct)
   
6. **src/services/__tests__/settingsService.unit.test.ts**
   - Line: 6
   - Imports: Setting (direct)
   
7. **src/middleware/__tests__/authMiddleware.edge.test.ts**
   - Line: 5
   - Imports: User (direct)

8. **src/scripts/verifyPersonaIntegration.ts**
   - Line: 6
   - Imports: User (direct)

---

## MIGRATION SCRIPTS & ONE-TIME SETUP ISSUES - 8 FILES

### Scripts Using Direct Imports (Non-Critical but Should Be Fixed):

1. **src/index.ts** - Seeding script
   - Lines: 6, 7
   - Imports: Setting, User (direct)
   - Usage: Database initialization/seeding

2. **scripts/create-admin.ts**
   - Line: 18
   - Imports: User (direct)

3. **src/scripts/create-admin-user.ts**
   - Line: 4
   - Imports: User (direct)

4. **src/scripts/create-test-admin.ts**
   - Line: 4
   - Imports: User (direct)

5. **src/scripts/create-default-persona.ts**
   - Line: 2
   - Imports: PersonaModel (direct)

6. **src/scripts/debug-settings.ts**
   - Line: 3
   - Imports: Setting (direct)

7. **src/scripts/migrate-kb-access.ts**
   - Line: 4
   - Imports: User (direct)

8. **src/scripts/migrateUserCustomPrompts.ts**
   - Lines: 5, 7
   - Imports: User, PersonaModel (direct)

9. **src/scripts/migrateUserPersonaActive.ts**
   - Line: 2
   - Imports: User (direct)

10. **src/scripts/ensure-sales-kb.ts**
    - Line: 5
    - Imports: User (direct)

11. **src/scripts/setup-test-user-kb-access.ts**
    - Line: 4
    - Imports: User (direct)

12. **src/scripts/verify-search-modes.ts**
    - Line: 7
    - Imports: User (direct)

13. **src/scripts/seedSystemSettings.ts**
    - Line: 2
    - Imports: Setting (direct)

---

## CORRECT IMPLEMENTATIONS (FOR REFERENCE)

These files are correctly using modelFactory and serve as examples:

### ✅ src/controllers/admin.controller.ts
```typescript
import { FeedbackModel as Feedback } from '../utils/modelFactory';
import { UserModel as User } from '../utils/modelFactory';
import { SystemKbDocumentModel as SystemKbDocument } from '../utils/modelFactory';
import { UserDocumentModel as UserDocument } from '../utils/modelFactory';
import { ChatModel as Chat } from '../utils/modelFactory';
import { IChat, IChatMessage } from '../models/ChatModel'; // Interfaces are OK
```

### ✅ src/controllers/folderController.ts
```typescript
import { FolderModel as Folder } from '../utils/modelFactory';
import { UserDocumentModel as UserDocument } from '../utils/modelFactory';
import { SystemKbDocumentModel as SystemKbDocument } from '../utils/modelFactory';
import { IFolder } from '../models/FolderModel'; // Interfaces are OK
```

### ✅ src/middleware/authMiddleware.ts
```typescript
import { UserModel as User } from '../utils/modelFactory';
import { IUser } from '../models/UserModel'; // Interfaces are OK
```

### ✅ src/routes/documentRoutes.ts (PARTIAL)
```typescript
import { UserDocumentModel as UserDocument } from '../utils/modelFactory'; // CORRECT
import { ChatModel as ChatSession } from '../utils/modelFactory'; // CORRECT
import { IUserDocument } from '../models/UserDocument'; // Interface is OK
```

---

## PRIORITY FIX ORDER

### PHASE 1: CRITICAL (Must fix for SQLite to work)
1. **src/routes/admin.ts** - Line 2
2. **src/routes/adminSettingsRoutes.ts** - Line 11
3. **src/routes/chatRoutes.ts** - Lines 10, 13
4. **src/routes/documentRoutes.ts** - Line 26

### PHASE 2: HIGH (Service layer - affects multiple routes)
1. **src/services/settingsService.ts** - Line 1
2. **src/controllers/settingsController.ts** - Line 2

### PHASE 3: MEDIUM (Other controllers)
1. **src/controllers/example-async-handler.controller.ts** - Line 5

### PHASE 4: LOW-PRIORITY (Tests & Scripts)
- All test files (8 files)
- All migration scripts (13 files)
- These don't affect production but should be fixed for consistency

---

## STATISTICS

| Category | Count |
|----------|-------|
| **CRITICAL Production Files** | 4 |
| **MEDIUM Production Files** | 2 |
| **LOW Example/Test Files** | 1 |
| **Test Files** | 8 |
| **Scripts/Migrations** | 13 |
| **Total Files** | 28 |

---

## PATTERN ANALYSIS

### Anti-Pattern (WRONG):
```typescript
// Direct imports bypass modelFactory switching logic
import Setting from '../models/SettingModel';
import User from '../models/UserModel';
import { default as Persona } from '../models/PersonaModel';
```

### Correct Pattern (RIGHT):
```typescript
// modelFactory handles MongoDB ↔ SQLite switching
import { SettingModel as Setting } from '../utils/modelFactory';
import { UserModel as User } from '../utils/modelFactory';
import { PersonaModel as Persona } from '../utils/modelFactory';

// Interfaces can be imported directly (they're just TypeScript types)
import { IUser, IChat, ISetting } from '../models/UserModel';
```

---

## WHY THIS MATTERS

The modelFactory in `src/utils/modelFactory.ts` contains this critical logic:

```typescript
const USE_SQLITE = process.env.USE_SQLITE === 'true';

export const UserModel = USE_SQLITE
  ? require('./sqliteAdapter').UserModel
  : require('../models/UserModel').default;

export const SettingModel = USE_SQLITE
  ? require('./sqliteAdapter').SettingModel
  : require('../models/SettingModel').default;

// ... etc for all models
```

When files import directly from the models directory, they SKIP this switching logic and always use the Mongoose MongoDB models, causing:
- ❌ "MongoServerError: connect ECONNREFUSED"
- ❌ "Cannot read property 'findOne' of undefined"
- ❌ "Buffering timed out" errors
- ❌ SQLite adapter never gets used even when `USE_SQLITE=true`

---

## RECOMMENDED ACTION PLAN

### Immediate (Today)
1. Fix 4 critical production files (Phase 1)
2. Fix 2 service/controller files (Phase 2)
3. Test with `USE_SQLITE=true` environment

### Short-term (This Week)
4. Fix example controller (Phase 3)
5. Update test files to use modelFactory

### Medium-term (This Sprint)
6. Update all migration scripts
7. Add ESLint rule to prevent direct model imports
8. Document the pattern in code comments

---

## VERIFICATION CHECKLIST

After fixes, verify:
- [ ] `USE_SQLITE=true npm start` works without MongoDB
- [ ] All admin endpoints return data
- [ ] Chat routes work with SQLite
- [ ] Settings can be saved/loaded
- [ ] Document upload works
- [ ] No "Buffering timed out" errors
- [ ] No "connect ECONNREFUSED" errors
- [ ] Tests pass with mock SQLite database

