# SQLite Migration Phase 4: Remaining Models - Analysis

**Date:** 2025-11-03
**Status:** 📋 PLANNING
**Phase:** 4 of 4
**Previous Phase:** [Phase 3 - Chat System](./SQLITE-MIGRATION-PHASE3-COMPLETE.md)

## Executive Summary

Phase 4 is the **final phase** of the SQLite migration, focusing on migrating the remaining 6 models that weren't covered in Phases 1-3. This phase completes the transformation of GKChatty from a cloud-dependent MongoDB application to a fully local SQLite-based system.

### Scope Overview

**Models to migrate (6 total):**
1. PersonaModel - User AI persona configurations
2. SettingModel - System-wide settings (key-value store)
3. FolderModel - Folder hierarchy for document organization
4. TenantKnowledgeBase - Multi-tenant knowledge bases
5. UserSettings - Per-user settings and preferences
6. Feedback - User feedback submissions

**Files affected:**
- **Core routes/controllers:** ~12 files
- **Services:** ~3 files
- **Scripts:** ~15 scripts (maintenance utilities)
- **Tests:** ~5 test files

**Estimated effort:** 6-10 hours (larger than Phase 3 due to 6 models vs 1)

## Models Already Migrated

✅ **Phase 1:** UserModel
✅ **Phase 2:** UserDocumentModel, SystemKbDocumentModel
✅ **Phase 3:** ChatModel

## Detailed Model Analysis

### 1. PersonaModel

**Purpose:** Stores user-defined AI personas with custom prompts

**Schema (backend/src/models/PersonaModel.ts):**
```typescript
interface IPersona {
  _id: ObjectId
  name: string              // Max 100 chars
  prompt: string            // Max 5000 chars
  systemPrompt: string      // Max 10000 chars (optional)
  userId: ObjectId          // Foreign key to User
  isActive: boolean         // Currently active persona for user
  isDefault: boolean        // Default system persona
  createdAt: Date
  updatedAt: Date
}
```

**Indexes:**
- `userId` (standard index)
- `{userId: 1, isActive: 1}` (unique, sparse, partial filter for isActive=true)
- `isDefault` (standard index)

**Critical Operations:**
- Find personas by userId
- Set active persona for user
- Create/update/delete persona
- Get default system persona

**Files using PersonaModel (8):**
- `routes/documentRoutes.ts`
- `routes/chatRoutes.ts`
- `services/personaService.ts`
- `index.ts`
- `services/__tests__/personaService.test.ts`
- `chatRoutes.ts.bak`
- `scripts/migrateUserCustomPrompts.ts`
- `scripts/create-default-persona.ts`

**Complexity:** Medium
- Simple flat schema
- Unique constraint on active persona per user (via partial index)
- No embedded documents

---

### 2. SettingModel

**Purpose:** System-wide settings stored as key-value pairs

**Schema (backend/src/models/SettingModel.ts):**
```typescript
interface ISetting {
  _id: ObjectId
  key: string          // Unique, indexed
  value: string
  createdAt: Date
  updatedAt: Date
}
```

**Indexes:**
- `key` (unique index)

**Critical Operations:**
- Get setting by key
- Set setting value
- List all settings
- Update setting

**Files using SettingModel (10):**
- `routes/chatRoutes.ts`
- `index.ts`
- `routes/adminSettingsRoutes.ts`
- `services/settingsService.ts`
- `services/__tests__/settingsService.unit.test.ts`
- `routes/__tests__/adminSettingsRoutes.test.ts`
- `routes/__tests__/chatRoutes.test.ts`
- `controllers/settingsController.ts`
- `scripts/debug-settings.ts`
- `scripts/seedSystemSettings.ts`

**Complexity:** Low
- Simple key-value schema
- No relationships
- No embedded documents

---

### 3. FolderModel

**Purpose:** Hierarchical folder structure for organizing documents

**Schema (backend/src/models/FolderModel.ts):**
```typescript
interface IFolder {
  _id: ObjectId
  name: string
  parentId: ObjectId | null        // Self-referencing foreign key
  knowledgeBaseId: ObjectId        // Foreign key to TenantKnowledgeBase
  path: string                     // Full path (e.g., "/folder1/folder2")
  ownerId: ObjectId                // Foreign key to User
  createdAt: Date
  updatedAt: Date

  // Methods
  buildPath(): string              // Constructs full path from hierarchy
}
```

**Indexes:**
- `path` (standard index)
- `ownerId` (standard index)
- `{ownerId: 1, parentId: 1}` (compound index)
- `{knowledgeBaseId: 1, parentId: 1}` (compound index)
- `{path: 1, ownerId: 1}` (compound index)

**Pre-save Hook:**
- Automatically builds path from parent hierarchy when parentId or name changes

**Critical Operations:**
- Create folder with parent
- Get folder tree for user
- Get folder tree for knowledge base
- Delete folder (with cascade to children)
- Move folder to new parent

**Files using FolderModel (2):**
- `controllers/folderController.ts`
- `utils/__tests__/localStorageHelper.test.ts`

**Complexity:** High
- Self-referencing hierarchy (parentId → _id)
- Pre-save hook for path building
- Recursive operations required (tree traversal)
- Cascade deletes for children

**Challenge:** SQLite doesn't support recursive queries easily. Need to implement path building in application code.

---

### 4. TenantKnowledgeBase

**Purpose:** Multi-tenant knowledge base management

**Schema (backend/src/models/TenantKnowledgeBase.ts):**
```typescript
interface ITenantKnowledgeBase {
  _id: ObjectId
  name: string              // Display name (max 100 chars)
  slug: string              // URL-safe identifier (unique, lowercase)
  description: string       // Optional (max 500 chars)
  s3Prefix: string          // S3 storage prefix (unique)
  color: string             // Hex color (default: #6B7280)
  icon: string              // Icon URL/emoji (max 500 chars)
  shortName: string         // Short display name (max 10 chars)

  // Access control
  accessType: 'public' | 'restricted' | 'role-based'
  allowedRoles: string[]    // ['admin', 'user', 'viewer']
  allowedUsers: ObjectId[]  // Array of user IDs

  // Metadata
  isActive: boolean
  documentCount: number
  createdBy: ObjectId       // Foreign key to User
  lastModifiedBy: ObjectId  // Foreign key to User

  createdAt: Date
  updatedAt: Date

  // Methods
  hasAccess(userId: string, userRole?: string): boolean
}
```

**Indexes:**
- `slug` (unique index)
- `isActive` (standard index)
- `allowedUsers` (standard index)
- `createdAt` (descending index)

**Pre-save Hook:**
- Auto-generates slug from name
- Auto-generates s3Prefix from slug
- Auto-generates shortName from name

**Critical Operations:**
- Create knowledge base
- List active knowledge bases for user
- Check access permissions
- Update knowledge base settings
- Deactivate knowledge base

**Files using TenantKnowledgeBase (13):**
- `routes/documentRoutes.ts`
- `controllers/tenantKBController.ts`
- `scripts/verify-tenant-kb-documents.ts`
- `scripts/setup-test-user-kb-access.ts`
- `scripts/reindex-system-tenant-kb.ts`
- `scripts/seed-dev-kb.ts`
- `scripts/activate-sales-kb.ts`
- `scripts/ensure-sales-kb.ts`
- `scripts/list-tenant-kbs.ts`
- `scripts/migrate-kb-access.ts`
- `scripts/verify-specific-tenant-doc.ts`
- `scripts/reindex-tenant-kb.ts`
- `scripts/verify-search-modes.ts`

**Complexity:** High
- Array fields (allowedRoles, allowedUsers)
- Pre-save hook for auto-generation
- Method implementation (hasAccess)
- Access control logic

**Challenge:** Array fields (allowedUsers, allowedRoles) need JSON serialization.

---

### 5. UserSettings

**Purpose:** Per-user settings and preferences

**Schema (backend/src/models/UserSettings.ts):**
```typescript
interface IUserSettings {
  _id: ObjectId
  userId: ObjectId          // Foreign key to User (unique)
  customPrompt: string      // Optional user-defined prompt
  iconUrl: string           // Optional user avatar URL
  createdAt: Date
  updatedAt: Date
}
```

**Indexes:**
- `userId` (unique index)

**Critical Operations:**
- Get settings by userId
- Create default settings for new user
- Update settings

**Files using UserSettings (6):**
- `routes/chatRoutes.ts`
- `controllers/userSettingsController.ts`
- `routes/__tests__/userRoutes.test.ts`
- `routes/__tests__/chatRoutes.test.ts`
- `chatRoutes.ts.bak`
- `scripts/migrateUserCustomPrompts.ts`

**Complexity:** Low
- Simple flat schema
- One-to-one relationship with User
- No special logic

---

### 6. Feedback

**Purpose:** User feedback submissions

**Schema (backend/src/models/Feedback.model.ts):**
```typescript
interface IFeedback {
  _id: ObjectId
  feedbackText: string      // Required, min 1 char
  userId: ObjectId          // Foreign key to User
  username: string          // Denormalized for display
  chatId: ObjectId          // Optional foreign key to Chat
  createdAt: Date
}
```

**Indexes:**
- `userId` (standard index)
- `chatId` (standard index)
- `createdAt` (standard index)

**Critical Operations:**
- Submit feedback
- List all feedback (admin)
- List feedback by user
- List feedback for specific chat

**Files using Feedback (5):**
- `controllers/admin.controller.ts`
- `routes/feedback.routes.ts`
- `routes/feedbackRoutes.ts`
- `controllers/__tests__/admin.controller.test.ts`
- `controllers/feedback.controller.ts`

**Complexity:** Low
- Simple flat schema
- No special logic
- Denormalized username field (acceptable)

---

## Files to Update

### Core Routes (5 files)
1. `routes/documentRoutes.ts` - Uses PersonaModel, TenantKnowledgeBase
2. `routes/chatRoutes.ts` - Uses PersonaModel, SettingModel, UserSettings
3. `routes/adminSettingsRoutes.ts` - Uses SettingModel
4. `routes/feedback.routes.ts` - Uses Feedback
5. `routes/feedbackRoutes.ts` - Uses Feedback

### Controllers (4 files)
1. `controllers/tenantKBController.ts` - Uses TenantKnowledgeBase
2. `controllers/settingsController.ts` - Uses SettingModel
3. `controllers/userSettingsController.ts` - Uses UserSettings
4. `controllers/folderController.ts` - Uses FolderModel
5. `controllers/feedback.controller.ts` - Uses Feedback
6. `controllers/admin.controller.ts` - Uses Feedback (already touched in Phase 3)

### Services (2 files)
1. `services/personaService.ts` - Uses PersonaModel
2. `services/settingsService.ts` - Uses SettingModel

### Main Entry (1 file)
1. `index.ts` - Uses PersonaModel, SettingModel

### Scripts (15 files - can be deferred)
**PersonaModel scripts (2):**
- `scripts/migrateUserCustomPrompts.ts`
- `scripts/create-default-persona.ts`

**SettingModel scripts (2):**
- `scripts/debug-settings.ts`
- `scripts/seedSystemSettings.ts`

**TenantKnowledgeBase scripts (11):**
- `scripts/verify-tenant-kb-documents.ts`
- `scripts/setup-test-user-kb-access.ts`
- `scripts/reindex-system-tenant-kb.ts`
- `scripts/seed-dev-kb.ts`
- `scripts/activate-sales-kb.ts`
- `scripts/ensure-sales-kb.ts`
- `scripts/list-tenant-kbs.ts`
- `scripts/migrate-kb-access.ts`
- `scripts/verify-specific-tenant-doc.ts`
- `scripts/reindex-tenant-kb.ts`
- `scripts/verify-search-modes.ts`

### Tests (5 files - can be updated later)
- `services/__tests__/personaService.test.ts`
- `services/__tests__/settingsService.unit.test.ts`
- `routes/__tests__/adminSettingsRoutes.test.ts`
- `routes/__tests__/chatRoutes.test.ts`
- `routes/__tests__/userRoutes.test.ts`
- `controllers/__tests__/admin.controller.test.ts`
- `utils/__tests__/localStorageHelper.test.ts`

---

## SQLite Adapter Requirements

### Tables to Create

**1. personas table:**
```sql
CREATE TABLE IF NOT EXISTS personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  systemPrompt TEXT,
  userId TEXT NOT NULL,
  isActive INTEGER DEFAULT 0,
  isDefault INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_personas_userId ON personas(userId);
CREATE INDEX IF NOT EXISTS idx_personas_isDefault ON personas(isDefault);
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_userId_isActive
  ON personas(userId, isActive) WHERE isActive = 1;
```

**2. settings table:**
```sql
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
```

**3. folders table:**
```sql
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  name TEXT NOT NULL,
  parentId TEXT,
  knowledgeBaseId TEXT,
  path TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
CREATE INDEX IF NOT EXISTS idx_folders_ownerId ON folders(ownerId);
CREATE INDEX IF NOT EXISTS idx_folders_ownerId_parentId ON folders(ownerId, parentId);
CREATE INDEX IF NOT EXISTS idx_folders_knowledgeBaseId_parentId ON folders(knowledgeBaseId, parentId);
CREATE INDEX IF NOT EXISTS idx_folders_path_ownerId ON folders(path, ownerId);
```

**4. tenant_knowledge_bases table:**
```sql
CREATE TABLE IF NOT EXISTS tenant_knowledge_bases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  s3Prefix TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#6B7280',
  icon TEXT,
  shortName TEXT,
  accessType TEXT DEFAULT 'restricted',
  allowedRoles TEXT DEFAULT '[]',          -- JSON array
  allowedUsers TEXT DEFAULT '[]',          -- JSON array of ObjectIds
  isActive INTEGER DEFAULT 1,
  documentCount INTEGER DEFAULT 0,
  createdBy TEXT NOT NULL,
  lastModifiedBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_tkb_slug ON tenant_knowledge_bases(slug);
CREATE INDEX IF NOT EXISTS idx_tkb_isActive ON tenant_knowledge_bases(isActive);
CREATE INDEX IF NOT EXISTS idx_tkb_createdAt ON tenant_knowledge_bases(createdAt DESC);
```

**5. user_settings table:**
```sql
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  userId TEXT UNIQUE NOT NULL,
  customPrompt TEXT,
  iconUrl TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings(userId);
```

**6. feedback table:**
```sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  feedbackText TEXT NOT NULL,
  userId TEXT NOT NULL,
  username TEXT NOT NULL,
  chatId TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_userId ON feedback(userId);
CREATE INDEX IF NOT EXISTS idx_feedback_chatId ON feedback(chatId);
CREATE INDEX IF NOT EXISTS idx_feedback_createdAt ON feedback(createdAt);
```

### Model Classes to Implement

**1. PersonaModel class:**
- Standard CRUD methods
- Enforce unique active persona per user (validate before insert/update)
- Handle isActive boolean → INTEGER conversion

**2. SettingModel class:**
- Standard CRUD methods
- findByKey() helper
- upsert() helper (insert or update)

**3. FolderModel class:**
- Standard CRUD methods
- buildPath() method - recursive hierarchy traversal
- findByPath() helper
- getChildren() helper
- Pre-save path building logic

**4. TenantKnowledgeBaseModel class:**
- Standard CRUD methods
- Serialize allowedRoles and allowedUsers as JSON
- hasAccess() method implementation
- Pre-save hooks for slug/s3Prefix/shortName generation

**5. UserSettingsModel class:**
- Standard CRUD methods
- findByUserId() helper

**6. FeedbackModel class:**
- Standard CRUD methods
- findByUserId() helper
- findByChatId() helper

---

## Implementation Plan

### Step 1: Expand SQLite Adapter ✅

**File:** `backend/src/utils/sqliteAdapter.ts`

**Add table creation SQL (lines ~195-350):**
- personas table + indexes
- settings table + indexes
- folders table + indexes
- tenant_knowledge_bases table + indexes
- user_settings table + indexes
- feedback table + indexes

**Add model classes (lines ~1270-2500):**
- PersonaModel class (~200 lines)
- SettingModel class (~150 lines)
- FolderModel class (~300 lines - complex due to hierarchy)
- TenantKnowledgeBaseModel class (~350 lines - array fields + methods)
- UserSettingsModel class (~150 lines)
- FeedbackModel class (~150 lines)

**Estimated lines:** ~1300 lines of new code

---

### Step 2: Update Model Factory ✅

**File:** `backend/src/utils/modelFactory.ts`

**Add exports (lines ~40-65):**
```typescript
export const PersonaModel = USE_SQLITE
  ? require('./sqliteAdapter').PersonaModel
  : require('../models/PersonaModel').default;

export const SettingModel = USE_SQLITE
  ? require('./sqliteAdapter').SettingModel
  : require('../models/SettingModel').default;

export const FolderModel = USE_SQLITE
  ? require('./sqliteAdapter').FolderModel
  : require('../models/FolderModel').Folder;

export const TenantKnowledgeBaseModel = USE_SQLITE
  ? require('./sqliteAdapter').TenantKnowledgeBaseModel
  : require('../models/TenantKnowledgeBase').TenantKnowledgeBase;

export const UserSettingsModel = USE_SQLITE
  ? require('./sqliteAdapter').UserSettingsModel
  : require('../models/UserSettings').default;

export const FeedbackModel = USE_SQLITE
  ? require('./sqliteAdapter').FeedbackModel
  : require('../models/Feedback.model').default;
```

---

### Step 3: Fix Core Routes and Controllers ✅

**Pattern:**
```typescript
// BEFORE:
import PersonaModel from '../models/PersonaModel';

// AFTER:
import { PersonaModel } from '../utils/modelFactory';
import { IPersona } from '../models/PersonaModel';  // Keep interfaces
```

**Files to update (12 total):**

**Routes (5):**
1. `routes/documentRoutes.ts` - PersonaModel, TenantKnowledgeBaseModel
2. `routes/chatRoutes.ts` - PersonaModel, SettingModel, UserSettingsModel
3. `routes/adminSettingsRoutes.ts` - SettingModel
4. `routes/feedback.routes.ts` - FeedbackModel
5. `routes/feedbackRoutes.ts` - FeedbackModel

**Controllers (5):**
1. `controllers/tenantKBController.ts` - TenantKnowledgeBaseModel
2. `controllers/settingsController.ts` - SettingModel
3. `controllers/userSettingsController.ts` - UserSettingsModel
4. `controllers/folderController.ts` - FolderModel
5. `controllers/feedback.controller.ts` - FeedbackModel

**Services (2):**
1. `services/personaService.ts` - PersonaModel
2. `services/settingsService.ts` - SettingModel

**Main entry (1):**
1. `index.ts` - PersonaModel, SettingModel

---

### Step 4: Test Backend ✅

**Actions:**
1. Kill existing backend processes
2. Start fresh backend
3. Check for compilation errors
4. Check for runtime errors
5. Test login (integration test with Phases 1-3)
6. Test persona operations (optional - if time permits)
7. Test settings operations (optional)

---

### Step 5: Create Documentation ✅

**Files to create:**
1. `SQLITE-MIGRATION-PHASE4-COMPLETE.md` - Completion summary

---

### Step 6: Commit Changes ✅

**Files to commit:**
- `backend/src/utils/sqliteAdapter.ts`
- `backend/src/utils/modelFactory.ts`
- All routes/controllers/services (12 files)
- `index.ts`
- `SQLITE-MIGRATION-PHASE4-ANALYSIS.md`
- `SQLITE-MIGRATION-PHASE4-COMPLETE.md`

**Commit message pattern:**
```
feat: SQLite Migration Phase 4 - Remaining Models Complete

Migrated 6 remaining models from MongoDB to SQLite:

Models Migrated:
- PersonaModel (user AI personas)
- SettingModel (system settings)
- FolderModel (document folders)
- TenantKnowledgeBaseModel (multi-tenant KB)
- UserSettingsModel (user preferences)
- FeedbackModel (user feedback)

Backend Changes:
- Expanded SQLite adapter with 6 model classes (~1300 lines)
- Created 6 new tables with proper indexes
- Updated modelFactory to export all 6 models
- Fixed 12 core files to use modelFactory

Complexity Highlights:
- FolderModel: Hierarchical self-referencing structure with path building
- TenantKnowledgeBaseModel: Array fields + access control methods + pre-save hooks
- PersonaModel: Unique active persona constraint per user

Test Results:
✅ Backend compiles with zero TypeScript errors
✅ Backend starts with zero runtime errors
✅ All routes registered successfully
✅ Login test passed (Phases 1-3 integration verified)

Scripts Deferred:
- 15 maintenance scripts (not critical for core functionality)
- Will be updated in future if needed

Next: All core models migrated! SQLite migration complete.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Known Challenges

### 1. Folder Hierarchy (FolderModel)

**Challenge:** Self-referencing parentId field requires recursive path building.

**MongoDB approach:**
- Pre-save hook traverses parent chain to build full path
- Uses async/await with findById()

**SQLite approach:**
- Implement buildPath() as class method
- Traverse parent chain using while loop:
  ```typescript
  async buildPath(folderId: string): Promise<string> {
    const folder = this.findById(folderId);
    const parts = [folder.name];
    let currentParentId = folder.parentId;

    while (currentParentId) {
      const parent = this.findById(currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentId;
    }

    return '/' + parts.join('/');
  }
  ```
- Call buildPath() before insert/update when parentId or name changes

**Complexity:** Medium - requires careful handling of circular references

---

### 2. TenantKnowledgeBase Array Fields

**Challenge:** allowedRoles and allowedUsers are arrays that need JSON serialization.

**MongoDB approach:**
- Native array support
- Direct storage and querying

**SQLite approach:**
- Store as JSON TEXT:
  ```typescript
  allowedRoles: JSON.stringify(data.allowedRoles || [])
  allowedUsers: JSON.stringify(data.allowedUsers || [])
  ```
- Deserialize on read:
  ```typescript
  allowedRoles: JSON.parse(row.allowedRoles || '[]')
  allowedUsers: JSON.parse(row.allowedUsers || '[]')
  ```
- hasAccess() method needs to parse arrays to check membership

**Complexity:** Medium - JSON parsing overhead, can't query array contents with SQL

---

### 3. TenantKnowledgeBase Pre-save Hooks

**Challenge:** MongoDB pre-save hook auto-generates slug, s3Prefix, and shortName.

**MongoDB approach:**
- Pre-save hook modifies document before save
- Automatic execution

**SQLite approach:**
- Implement in create() method before INSERT:
  ```typescript
  static create(data: any) {
    // Auto-generate slug if not provided
    if (!data.slug && data.name) {
      data.slug = data.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Auto-generate s3Prefix from slug
    if (!data.s3Prefix && data.slug) {
      data.s3Prefix = `tenant_kb/${data.slug}/`;
    }

    // Auto-generate shortName
    if (!data.shortName && data.name) {
      data.shortName = data.name.split(' ')[0].substring(0, 10);
    }

    // Then INSERT...
  }
  ```

**Complexity:** Low - straightforward implementation in create()

---

### 4. Unique Active Persona Constraint

**Challenge:** MongoDB uses partial index to enforce only one active persona per user.

**MongoDB index:**
```javascript
{
  unique: true,
  sparse: true,
  partialFilterExpression: { isActive: true }
}
```

**SQLite approach:**
- Use partial index (SQLite 3.8.0+):
  ```sql
  CREATE UNIQUE INDEX idx_personas_userId_isActive
    ON personas(userId, isActive) WHERE isActive = 1;
  ```
- Or validate in application code before insert/update:
  ```typescript
  static setActive(personaId: string, userId: string) {
    // First, deactivate all personas for this user
    db.prepare('UPDATE personas SET isActive = 0 WHERE userId = ?').run(userId);

    // Then activate the requested persona
    return this.findByIdAndUpdate(personaId, { isActive: 1 });
  }
  ```

**Complexity:** Low - SQLite supports partial indexes, or easy to validate manually

---

### 5. SettingModel Upsert Pattern

**Challenge:** Settings often use "upsert" pattern (insert or update if exists).

**MongoDB approach:**
- `findOneAndUpdate()` with `upsert: true` option

**SQLite approach:**
- Use INSERT OR REPLACE:
  ```typescript
  static upsert(key: string, value: string) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updatedAt = datetime('now')
    `);
    stmt.run(key, value);
    return this.findOne({ key });
  }
  ```

**Complexity:** Low - SQLite supports INSERT OR REPLACE and ON CONFLICT

---

## Scripts Status

**Deferred (15 scripts):**
- These are maintenance/utility scripts, not critical for core app functionality
- Can be updated later if needed
- Most can work with MongoDB fallback via modelFactory

**If scripts are needed:**
- Update imports to use modelFactory
- Test each script individually
- Estimated effort: 2-3 hours for all 15 scripts

---

## Success Criteria

Phase 4 is complete when:

1. ✅ SQLite adapter has all 6 model classes (PersonaModel, SettingModel, FolderModel, TenantKnowledgeBaseModel, UserSettingsModel, FeedbackModel)
2. ✅ All 6 tables created with proper indexes
3. ✅ Model factory exports all 6 models with USE_SQLITE switching
4. ✅ All core routes/controllers/services use modelFactory (12 files)
5. ✅ Backend compiles with zero TypeScript errors
6. ✅ Backend starts with zero runtime errors
7. ✅ All routes register successfully
8. ✅ Login test passes (integration with Phases 1-3)
9. ✅ No MongoDB dependency for core operations
10. ✅ Documentation created (analysis + completion docs)
11. ✅ Changes committed to git

**Optional (nice-to-have):**
- Scripts updated (15 files)
- Tests updated (7 files)
- End-to-end persona testing
- End-to-end settings testing

---

## Risk Assessment

### High-Risk Areas

1. **FolderModel hierarchy** - Recursive logic, potential for infinite loops
2. **TenantKnowledgeBase arrays** - JSON serialization, access control logic
3. **PersonaModel unique constraint** - Active persona enforcement

### Mitigation Strategies

1. **For FolderModel:**
   - Add max depth limit to buildPath() (e.g., 20 levels)
   - Track visited IDs to detect circular references
   - Thorough testing of nested folder operations

2. **For TenantKnowledgeBase:**
   - Validate array JSON before storage
   - Add error handling for JSON.parse()
   - Test hasAccess() method with various scenarios

3. **For PersonaModel:**
   - Use partial index if SQLite version supports it
   - Otherwise, validate in setActive() method
   - Test edge cases (multiple setActive calls, concurrent updates)

### Medium-Risk Areas

- Pre-save hook logic in TenantKnowledgeBase (slug generation)
- SettingModel upsert operations

### Low-Risk Areas

- UserSettingsModel (simple schema)
- FeedbackModel (simple schema)

---

## Estimated Timeline

**Optimistic:** 6 hours
**Realistic:** 8 hours
**Pessimistic:** 10 hours

**Breakdown:**
1. SQLite adapter expansion (6 models): 4-5 hours
2. Model factory updates: 0.5 hours
3. Fix core routes/controllers/services (12 files): 2-3 hours
4. Testing and debugging: 1-2 hours
5. Documentation: 1 hour
6. Git commit: 0.25 hours

**Total actual time (Phase 3):** 2-3 hours (estimated 5-9 hours)
**Expectation for Phase 4:** Likely 4-6 hours (shorter than estimate due to patterns established)

---

## Comparison with Previous Phases

| Aspect | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|---------|---------|---------|---------|
| **Models** | 1 (User) | 2 (Docs) | 1 (Chat) | 6 (Remaining) |
| **Fields** | ~10 | 27 | 10 | ~40 |
| **Files updated** | ~10 | 14 | 5 | ~12 |
| **Adapter code** | ~200 lines | ~450 lines | ~300 lines | ~1300 lines |
| **Complexity** | Low | High | Medium | High |
| **Special features** | Auth, JWT | Uploads, S3 | Messages | Arrays, Hierarchy |
| **Estimated time** | 3-5 hrs | 4-8 hrs | 5-9 hrs | 6-10 hrs |
| **Actual time** | ~2 hrs | ~4 hrs | ~2 hrs | TBD |

**Phase 4 is the largest phase** due to:
- 6 models vs 1-2 in previous phases
- Complex features (hierarchy, arrays, methods)
- Most files to update (12 core files)

However, patterns are well-established from Phases 1-3, so implementation should be faster than estimates.

---

## Post-Phase 4: Migration Complete

After Phase 4, **all core models will be migrated**:
- ✅ UserModel
- ✅ UserDocumentModel
- ✅ SystemKbDocumentModel
- ✅ ChatModel
- ✅ PersonaModel
- ✅ SettingModel
- ✅ FolderModel
- ✅ TenantKnowledgeBaseModel
- ✅ UserSettingsModel
- ✅ FeedbackModel

**GKChatty will be fully operational in local SQLite mode** with:
- User authentication
- Document uploads and processing
- Chat conversations with AI
- Persona management
- System settings
- Folder organization
- Multi-tenant knowledge bases
- User preferences
- Feedback collection

**Remaining work (optional):**
- Update 15 maintenance scripts
- Update 7 test files
- Performance tuning
- Data migration utilities (MongoDB → SQLite)

---

**Phase 4 Status:** 📋 PLANNING
**Ready to implement:** Yes
**Estimated completion:** 6-10 hours
**Next Step:** Expand SQLite adapter with 6 model classes
