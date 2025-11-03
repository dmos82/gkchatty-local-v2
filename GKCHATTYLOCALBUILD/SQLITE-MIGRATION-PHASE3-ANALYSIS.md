# SQLite Migration Phase 3: Chat System Analysis

**Date:** 2025-11-03
**Status:** Analysis Complete - Ready for Implementation
**Phase:** 3 of 4
**Previous Phase:** [Phase 2 - Document System](./SQLITE-MIGRATION-PHASE2-COMPLETE.md)

## Executive Summary

Phase 3 focuses on migrating the chat system from MongoDB to SQLite. The GKChatty application has a **single Chat model** (no separate Conversation model), making this phase simpler than Phase 2.

### Scope Overview

- **5 files** use `ChatModel`
- **1 model** to migrate: Chat (with embedded messages)
- **Core systems affected:** Chat history, message storage, chat listing
- **Estimated complexity:** Medium (simpler than Phase 2, but messages are embedded documents)

## Chat Model Analysis

### ChatModel

**File:** `backend/src/models/ChatModel.ts`

**Schema Fields:**
```typescript
{
  userId: ObjectId (ref: 'User'),
  chatName: string (default: 'New Chat'),
  messages: IChatMessage[],  // EMBEDDED subdocuments
  notes?: string,
  createdAt: Date (auto),
  updatedAt: Date (auto),

  // Extended fields (from interface, may not be in schema):
  personaId?: ObjectId,
  currentSearchMode: 'unified' | 'user' | 'system' | 'kb',
  activeTenantKbId?: ObjectId
}
```

**Message Subdocument Schema (IChatMessage):**
```typescript
{
  _id: ObjectId (auto-generated),
  role: 'user' | 'assistant',
  content: string,
  sources?: ISource[],  // NESTED subdocuments
  metadata?: {
    tokenUsage: {
      prompt: number,
      completion: number,
      total: number
    },
    cost: number
  },
  timestamp: Date
}
```

**Source Subdocument Schema (ISource):**
```typescript
{
  documentId: string | null,
  fileName: string,
  pageNumbers?: number[],
  type: 'user' | 'system',
  text?: string
}
```

**Indexes:**
- `{ userId }` - Primary user chat queries
- `{ userId, updatedAt: -1 }` - Fetch user's chats sorted by update time
- `{ userId, _id }` - For delete operations

## Files Using Chat Model (5 files)

### Core Routes (2 files)
1. `routes/chatRoutes.ts` - **PRIMARY** - Chat CRUD operations
2. `routes/chatRoutes.ts.bak` - Backup file (can skip)

### Routes (Other) (1 file)
3. `routes/documentRoutes.ts` - Uses Chat model (document-related chat context)

### Controllers (1 file)
4. `controllers/admin.controller.ts` - Admin chat management

### Tests (1 file)
5. `controllers/__tests__/admin.controller.test.ts` - Test file (defer to Phase 4)

## Critical Operations to Support

### Chat Operations (chatRoutes.ts likely uses)

**Chat CRUD:**
- `Chat.find({ userId })` - List all chats for a user
- `Chat.findOne({ _id, userId })` - Get specific chat
- `Chat.findById(chatId)` - Get chat by ID
- `Chat.create({ userId, chatName, messages: [] })` - Create new chat
- `Chat.findByIdAndUpdate(chatId, { chatName, updatedAt })` - Rename chat
- `Chat.findByIdAndDelete(chatId)` - Delete chat

**Message Operations:**
- `Chat.findByIdAndUpdate(chatId, { $push: { messages: newMessage } })` - Add message
- `Chat.findByIdAndUpdate(chatId, { $pull: { messages: { _id: messageId } } })` - Delete message
- `Chat.findOne({ _id: chatId }, { messages: { $slice: -50 } })` - Paginate messages

**Advanced Queries:**
- `Chat.find({ userId }).sort({ updatedAt: -1 }).limit(20)` - Recent chats
- `Chat.find({ userId, chatName: /searchTerm/i })` - Search by name

## SQLite Adapter Requirements

### New ChatModel Class Needed

```typescript
export class ChatModel {
  // Query methods
  static find(query: any): any[]
  static findOne(query: any): any | null
  static findById(id: string | number): any | null

  // Mutation methods
  static create(chatData: any): any
  static findByIdAndUpdate(id: string | number, updates: any): any | null
  static findByIdAndDelete(id: string | number): any | null

  // Special methods for messages
  static addMessage(chatId: string | number, message: any): any | null
  static deleteMessage(chatId: string | number, messageId: string): any | null
  static getMessages(chatId: string | number, limit?: number, offset?: number): any[]

  // Utility methods
  static select(fields: string): any
  static sort(sortObj: any): any
  static limit(count: number): any

  // Deserialization
  private static deserialize(row: any): any | null
}
```

## SQLite Schema Design

### Approach 1: Single Table with JSON (Recommended)

**Why:** Simpler, matches MongoDB's document structure, easier migration

```sql
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  userId TEXT NOT NULL,
  chatName TEXT NOT NULL DEFAULT 'New Chat',
  messages TEXT DEFAULT '[]',  -- JSON array of messages
  notes TEXT,
  personaId TEXT,
  currentSearchMode TEXT DEFAULT 'unified',  -- 'unified', 'user', 'system', 'kb'
  activeTenantKbId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chats_userId ON chats(userId);
CREATE INDEX IF NOT EXISTS idx_chats_userId_updatedAt ON chats(userId, updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_chats_userId_id ON chats(userId, _id);
```

**Messages stored as JSON:**
```json
[
  {
    "_id": "60a1b2c3d4e5f6789abcdef0",
    "role": "user",
    "content": "What is RAG?",
    "timestamp": "2025-11-03T10:00:00.000Z"
  },
  {
    "_id": "60a1b2c3d4e5f6789abcdef1",
    "role": "assistant",
    "content": "RAG stands for Retrieval-Augmented Generation...",
    "sources": [
      {
        "documentId": "123abc",
        "fileName": "rag-paper.pdf",
        "pageNumbers": [1, 2],
        "type": "system",
        "text": "RAG is a technique..."
      }
    ],
    "metadata": {
      "tokenUsage": { "prompt": 100, "completion": 200, "total": 300 },
      "cost": 0.002
    },
    "timestamp": "2025-11-03T10:00:05.000Z"
  }
]
```

**Pros:**
- Simple schema (1 table)
- Easy to understand
- Matches MongoDB structure
- Easy message operations (parse JSON → modify → save)

**Cons:**
- Can't query individual messages directly
- Large JSON blobs for chats with many messages
- Full JSON parse/stringify on every operation

### Approach 2: Separate Messages Table (Alternative)

**Why:** Better for querying individual messages, more normalized

```sql
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  userId TEXT NOT NULL,
  chatName TEXT NOT NULL DEFAULT 'New Chat',
  notes TEXT,
  personaId TEXT,
  currentSearchMode TEXT DEFAULT 'unified',
  activeTenantKbId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  _id TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(12)))),
  chatId TEXT NOT NULL,  -- Foreign key to chats._id
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  sources TEXT DEFAULT '[]',  -- JSON array of sources
  metadata TEXT,  -- JSON object
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chatId) REFERENCES chats(_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_chatId ON chat_messages(chatId);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp);
```

**Pros:**
- More normalized
- Can query individual messages
- Smaller JSON blobs
- Better for very large chats

**Cons:**
- More complex schema (2 tables)
- Requires JOINs to get full chat
- More complex message operations

### Recommendation: **Approach 1 (Single Table with JSON)**

**Reason:**
- Simpler implementation (matches Phases 1 & 2 patterns)
- GKChatty doesn't need to query individual messages across chats
- Chats are retrieved as complete units (all messages at once)
- Easier to maintain compatibility with MongoDB structure
- Faster for typical operations (get full chat, add message, delete chat)

**Decision:** Use Approach 1 unless performance issues arise.

## Phase 3 Implementation Plan

### Step 1: Expand SQLite Adapter
**File:** `backend/src/utils/sqliteAdapter.ts`

**Tasks:**
1. Add `chats` table creation to `createTables()`
2. Implement `ChatModel` class with all required methods
3. Handle complex field serialization:
   - `messages` field (JSON array of objects with nested sources/metadata)
   - `userId` field (ObjectId → TEXT)
   - `personaId` field (ObjectId → TEXT)
   - `activeTenantKbId` field (ObjectId → TEXT)
   - Date fields (createdAt, updatedAt, message timestamps)
   - Enum field (currentSearchMode)

**Key Methods:**

**find(query):**
```typescript
static find(query: any = {}): any[] {
  const db = getDatabase();
  let sql = 'SELECT * FROM chats';
  const params: any[] = [];

  if (query.userId) {
    sql += ' WHERE userId = ?';
    params.push(query.userId.toString ? query.userId.toString() : query.userId);
  }

  if (query._id) {
    sql += sql.includes('WHERE') ? ' AND' : ' WHERE';
    sql += ' _id = ?';
    params.push(query._id.toString ? query._id.toString() : query._id);
  }

  // Add sorting (default: updatedAt DESC)
  sql += ' ORDER BY updatedAt DESC';

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => this.deserialize(row));
}
```

**create(chatData):**
```typescript
static create(chatData: any): any {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO chats (
      userId, chatName, messages, notes, personaId,
      currentSearchMode, activeTenantKbId
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    chatData.userId ? chatData.userId.toString() : null,
    chatData.chatName || 'New Chat',
    JSON.stringify(chatData.messages || []),
    chatData.notes || null,
    chatData.personaId ? chatData.personaId.toString() : null,
    chatData.currentSearchMode || 'unified',
    chatData.activeTenantKbId ? chatData.activeTenantKbId.toString() : null
  );

  return this.findById(Number(result.lastInsertRowid));
}
```

**addMessage(chatId, message):**
```typescript
static addMessage(chatId: string | number, message: any): any | null {
  const chat = this.findById(chatId);
  if (!chat) return null;

  // Parse existing messages
  const messages = Array.isArray(chat.messages) ? chat.messages : JSON.parse(chat.messages || '[]');

  // Add new message with auto-generated _id
  const newMessage = {
    _id: message._id || this.generateObjectId(),
    role: message.role,
    content: message.content,
    sources: message.sources || [],
    metadata: message.metadata || null,
    timestamp: message.timestamp || new Date().toISOString()
  };

  messages.push(newMessage);

  // Update chat with new messages array
  return this.findByIdAndUpdate(chatId, {
    messages: messages,
    updatedAt: new Date().toISOString()
  });
}
```

**deserialize(row):**
```typescript
private static deserialize(row: any): any | null {
  if (!row) return null;

  // Parse messages JSON array
  if (row.messages) {
    try {
      row.messages = JSON.parse(row.messages);
    } catch (e) {
      row.messages = [];
    }
  }

  // Convert timestamps to Date objects
  if (row.createdAt) row.createdAt = new Date(row.createdAt);
  if (row.updatedAt) row.updatedAt = new Date(row.updatedAt);

  // Convert message timestamps
  if (Array.isArray(row.messages)) {
    row.messages = row.messages.map((msg: any) => ({
      ...msg,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
    }));
  }

  // Add Mongoose-like _id
  if (!row._id && row.id) {
    row._id = row.id.toString();
  }

  return row;
}
```

### Step 2: Update Model Factory
**File:** `backend/src/utils/modelFactory.ts`

**Tasks:**
1. Import Chat from MongoDB model
2. Import ChatModel from SQLite adapter
3. Export appropriate model based on USE_SQLITE flag:

```typescript
// Export Chat model (for chat history)
export const ChatModel = USE_SQLITE
  ? require('./sqliteAdapter').ChatModel
  : require('../models/ChatModel').default;
```

### Step 3: Fix Core Routes
**Priority order:**
1. `routes/chatRoutes.ts` - Primary chat operations
2. `routes/documentRoutes.ts` - If it uses Chat model
3. `controllers/admin.controller.ts` - Admin chat operations

**Change pattern:**
```typescript
// BEFORE:
import Chat from '../models/ChatModel';

// AFTER:
import { ChatModel as Chat } from '../utils/modelFactory';
import { IChat, IChatMessage } from '../models/ChatModel';  // Keep interfaces
```

### Step 4: Handle MongoDB-Specific Operations

**MongoDB `$push` operator:**
```typescript
// BEFORE (MongoDB):
await Chat.findByIdAndUpdate(chatId, {
  $push: { messages: newMessage }
});

// AFTER (SQLite):
const chat = await ChatModel.findById(chatId);
const messages = chat.messages || [];
messages.push(newMessage);
await ChatModel.findByIdAndUpdate(chatId, { messages, updatedAt: new Date() });

// OR use helper:
await ChatModel.addMessage(chatId, newMessage);
```

**MongoDB `$pull` operator:**
```typescript
// BEFORE (MongoDB):
await Chat.findByIdAndUpdate(chatId, {
  $pull: { messages: { _id: messageId } }
});

// AFTER (SQLite):
const chat = await ChatModel.findById(chatId);
const messages = (chat.messages || []).filter((msg: any) => msg._id !== messageId);
await ChatModel.findByIdAndUpdate(chatId, { messages, updatedAt: new Date() });

// OR use helper:
await ChatModel.deleteMessage(chatId, messageId);
```

**MongoDB `$slice` for pagination:**
```typescript
// BEFORE (MongoDB):
await Chat.findOne({ _id: chatId }, { messages: { $slice: -50 } });

// AFTER (SQLite):
const chat = await ChatModel.findById(chatId);
const recentMessages = (chat.messages || []).slice(-50);  // Last 50 messages
// OR
const messages = await ChatModel.getMessages(chatId, 50);  // Helper method
```

### Step 5: Testing
**Test scenarios:**
1. Create new chat (POST /api/chats)
2. List user's chats (GET /api/chats)
3. Get specific chat (GET /api/chats/:chatId)
4. Add message to chat (POST /api/chats/:chatId/messages)
5. Delete message from chat (DELETE /api/chats/:chatId/messages/:messageId)
6. Rename chat (PATCH /api/chats/:chatId)
7. Delete chat (DELETE /api/chats/:chatId)

### Step 6: Deferred Items (Phase 4)
**Test files to fix later:**
- `controllers/__tests__/admin.controller.test.ts`

## Known Challenges

### Challenge 1: Embedded Messages as JSON
**Issue:** MongoDB has native subdocument support, SQLite uses JSON strings
**Solution:** Parse/stringify JSON on every operation. Add helper methods for common patterns (addMessage, deleteMessage).

### Challenge 2: MongoDB Update Operators
**Issue:** SQLite doesn't support `$push`, `$pull`, `$slice`
**Solution:** Implement equivalent logic in adapter (fetch → modify → save pattern).

### Challenge 3: Message _id Generation
**Issue:** MongoDB auto-generates ObjectIds for subdocuments
**Solution:** Generate 12-byte hex string in adapter when creating messages.

### Challenge 4: Large Message Arrays
**Issue:** Storing entire message history as single JSON blob can be slow for large chats
**Solution:**
- Start with Approach 1 (single table)
- Add pagination helpers (getMessages with offset/limit)
- If performance issues arise, migrate to Approach 2 (separate table)

### Challenge 5: Sorting and Filtering
**Issue:** Can't sort by message timestamp using SQL
**Solution:** Sort in application code after deserializing. For most queries, sorting by `updatedAt` is sufficient.

## Success Criteria

- ✅ SQLite adapter has ChatModel class
- ✅ All core routes use modelFactory instead of direct MongoDB imports
- ✅ Chat creation works end-to-end
- ✅ Message add/delete works correctly
- ✅ Chat listing and retrieval works
- ✅ No MongoDB dependency for chat operations
- ✅ All CRUD operations work correctly
- ✅ Message sources and metadata preserved correctly

## Risk Assessment

**High Risk Areas:**
1. Message manipulation (add/delete) - Requires fetch → modify → save pattern
2. Message pagination - No native $slice support
3. JSON serialization - Large message arrays may be slow

**Medium Risk Areas:**
1. Chat listing - Simple queries, low risk
2. Chat CRUD - Standard operations
3. Admin operations - Similar to user operations

**Low Risk Areas:**
1. Chat creation - Simple insert
2. Chat deletion - Simple delete
3. Chat renaming - Simple update

## Estimated Timeline

**Step 1 (SQLite Adapter):** 2-3 hours
- Single model, but complex due to embedded messages
- Need helper methods for message operations

**Step 2 (Model Factory):** 10 minutes
- Simple export addition

**Step 3 (Core Routes):** 1-2 hours
- 3 route files to update
- Need to replace MongoDB operators with helper methods

**Step 4 (Handle MongoDB Operators):** 1-2 hours
- Find and replace $push/$pull patterns
- Test each operation

**Step 5 (Testing):** 1-2 hours
- Test all CRUD operations
- Test message operations
- Debug any issues found

**Total Estimated Time:** 5-9 hours

## Comparison with Phase 2

| Aspect | Phase 2 (Documents) | Phase 3 (Chat) |
|--------|---------------------|----------------|
| **Models** | 2 (UserDocument, SystemKbDocument) | 1 (Chat) |
| **Files to update** | 14 | 3-4 |
| **Lines of adapter code** | ~450 | ~300 (est.) |
| **Field count** | 27 (16 + 11) | 10 + embedded messages |
| **Complexity** | High | Medium |
| **Critical operations** | Upload, process, search, RAG | Create, list, add message, delete |
| **Embedded documents** | None | Messages (array of objects) |
| **Special operators** | None | $push, $pull, $slice |
| **Testing complexity** | Complex (S3, LanceDB) | Medium (message manipulation) |

## Next Steps

1. **Implement Step 1:** Expand SQLite adapter with ChatModel class
2. **Implement Step 2:** Update modelFactory exports
3. **Implement Step 3:** Fix core routes one by one
4. **Implement Step 4:** Replace MongoDB operators with helper methods
5. **Implement Step 5:** Comprehensive testing
6. **Document results:** Create SQLITE-MIGRATION-PHASE3-COMPLETE.md
7. **Commit:** Git commit Phase 3 changes

---

**Analysis Complete:** Ready to proceed with implementation
**Next Action:** Expand sqliteAdapter.ts with ChatModel class
