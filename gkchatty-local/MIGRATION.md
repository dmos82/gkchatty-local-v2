# GKChatty Migration Guide

**Last Updated:** 2025-11-14
**Status:** 🚧 Future Feature (Local mode not yet fully integrated)

---

## Overview

This guide covers migrating data between GKChatty storage modes:
- **Cloud Mode:** MongoDB + Pinecone + OpenAI
- **Local Mode:** SQLite + ChromaDB + Ollama (planned)

⚠️ **IMPORTANT:** Local mode is planned but not yet fully integrated. This guide is prepared for future use.

---

## Table of Contents

1. [Switching Storage Modes](#switching-storage-modes)
2. [Cloud to Local Migration](#cloud-to-local-migration)
3. [Local to Cloud Migration](#local-to-cloud-migration)
4. [Data Compatibility](#data-compatibility)
5. [Troubleshooting](#troubleshooting)

---

## Switching Storage Modes

### Current Status

**✅ Cloud Mode:** Fully implemented and working
**⚠️ Local Mode:** Planned but not yet integrated

### Quick Mode Switch (Future)

Once local mode is fully integrated, switching modes will be as simple as:

```bash
# Switch to cloud mode
./switch-mode.sh cloud
cd backend && npm run dev

# Switch to local mode
./switch-mode.sh local
cd backend && npm run dev
```

The `switch-mode.sh` script:
1. Backs up current `.env` file
2. Copies appropriate template (`.env.cloud` or `.env.local`)
3. Verifies prerequisites (Ollama for local, API keys for cloud)
4. Prompts you to edit credentials

### Manual Mode Switch

Alternatively, manually copy the template:

```bash
# For cloud mode
cp backend/.env.cloud backend/.env
# Edit .env and add your API keys

# For local mode (future)
cp backend/.env.local backend/.env
# Ensure Ollama is running
```

Then restart the backend:

```bash
cd backend
npm run dev
```

---

## Cloud to Local Migration

### When to Migrate Cloud → Local

**Use Cases:**
- Moving from development to on-premise deployment
- Reducing cloud costs (save $50-200/month)
- Improving privacy (all data stays local)
- Working offline
- Faster performance (10-20x improvement)

### Prerequisites

**Before migrating, ensure you have:**

1. **Ollama Installed**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Models Pulled**
   ```bash
   ollama pull llama3.2:3b
   ollama pull qwen2.5:3b
   ```

3. **Disk Space**
   - Minimum: 5GB free
   - Recommended: 10GB free
   - Models: ~3-7GB
   - Data: Variable based on your documents

4. **Backup Cloud Data**
   ```bash
   # Export from MongoDB
   mongodump --uri="your-mongodb-uri" --out=./cloud-backup

   # Download vectors from Pinecone (via script)
   # See scripts/export-pinecone.js
   ```

### Migration Steps

#### Step 1: Export Cloud Data

```bash
# Run export script (future)
cd backend
npm run export:cloud -- --output=./migration/cloud-data

# This creates:
# - migration/cloud-data/users.json
# - migration/cloud-data/documents.json
# - migration/cloud-data/chatsessions.json
# - migration/cloud-data/vectors.json
```

#### Step 2: Switch to Local Mode

```bash
# Use mode switcher
./switch-mode.sh local

# Or manually
cp backend/.env.local backend/.env
```

#### Step 3: Import to Local Storage

```bash
# Run import script (future)
cd backend
npm run import:local -- --input=./migration/cloud-data

# This:
# 1. Creates SQLite database
# 2. Imports user accounts
# 3. Imports documents
# 4. Imports chat sessions
# 5. Imports vectors to ChromaDB
# 6. Verifies data integrity
```

#### Step 4: Verify Migration

```bash
# Start backend in local mode
cd backend
npm run dev

# Check health
curl http://localhost:4001/health

# Test login
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"youruser","password":"yourpass"}'

# Verify document count matches
# Check SQLite: sqlite3 ~/.gkchatty/data/gkchatty.db "SELECT COUNT(*) FROM documents"
# Check ChromaDB: curl http://localhost:8000/api/v1/collections/gkchatty_documents/count
```

### Data Mapping: Cloud → Local

| Cloud Component | Local Component | Notes |
|----------------|-----------------|-------|
| MongoDB `users` | SQLite `users` | Direct mapping |
| MongoDB `documents` | SQLite `documents` | Direct mapping |
| MongoDB `chatsessions` | SQLite `chat_sessions` | Direct mapping |
| Pinecone vectors | ChromaDB collection | Metadata preserved |
| OpenAI embeddings | Re-computed locally | Different model dimensions |

⚠️ **Embedding Compatibility:**
- Cloud: OpenAI text-embedding-3-small (1536 dimensions)
- Local: Xenova/all-MiniLM-L6-v2 (384 dimensions)

Documents must be **re-embedded** when migrating to local mode.

---

## Local to Cloud Migration

### When to Migrate Local → Cloud

**Use Cases:**
- Scaling beyond single server
- Enabling team collaboration
- Deploying to Netlify/Vercel
- Mobile app backend
- Need for advanced OpenAI models (GPT-4)

### Prerequisites

**Before migrating, ensure you have:**

1. **Cloud Accounts Set Up**
   - MongoDB Atlas account (free M0 cluster or paid)
   - Pinecone account (free tier or paid)
   - OpenAI API key with billing enabled

2. **Created Resources**
   - MongoDB database created
   - Pinecone index created (1536 dimensions, cosine metric)
   - OpenAI API key generated

3. **Backup Local Data**
   ```bash
   # SQLite backup
   cp ~/.gkchatty/data/gkchatty.db ./local-backup-$(date +%Y%m%d).db

   # ChromaDB backup
   cp -r ~/.gkchatty/data/vectors ./chromadb-backup-$(date +%Y%m%d)
   ```

### Migration Steps

#### Step 1: Export Local Data

```bash
# Run export script (future)
cd backend
npm run export:local -- --output=./migration/local-data

# This creates:
# - migration/local-data/users.json
# - migration/local-data/documents.json
# - migration/local-data/chatsessions.json
# - migration/local-data/vectors.json
```

#### Step 2: Switch to Cloud Mode

```bash
# Use mode switcher
./switch-mode.sh cloud

# Edit .env with your credentials
nano backend/.env
# Add MONGODB_URI, PINECONE_API_KEY, OPENAI_API_KEY
```

#### Step 3: Import to Cloud Storage

```bash
# Run import script (future)
cd backend
npm run import:cloud -- --input=./migration/local-data

# This:
# 1. Connects to MongoDB Atlas
# 2. Imports user accounts
# 3. Imports documents
# 4. Imports chat sessions
# 5. Re-embeds documents with OpenAI
# 6. Uploads vectors to Pinecone
# 7. Verifies data integrity
```

#### Step 4: Verify Migration

```bash
# Start backend in cloud mode
cd backend
npm run dev

# Check health
curl http://localhost:4001/health

# Test login
# Verify document count matches
# Check MongoDB: mongosh and run db.documents.countDocuments()
# Check Pinecone: View index stats in dashboard
```

### Data Mapping: Local → Cloud

| Local Component | Cloud Component | Notes |
|----------------|-----------------|-------|
| SQLite `users` | MongoDB `users` | Direct mapping |
| SQLite `documents` | MongoDB `documents` | Direct mapping |
| SQLite `chat_sessions` | MongoDB `chatsessions` | Direct mapping |
| ChromaDB collection | Pinecone vectors | Metadata preserved |
| Local embeddings | OpenAI embeddings | Re-computed with OpenAI |

⚠️ **Re-embedding Required:**
Documents must be re-embedded with OpenAI's model (1536 dimensions) when migrating to cloud mode.

---

## Data Compatibility

### Schema Compatibility

Both storage modes use the **same logical schema**:

**Users:**
```json
{
  "_id": "unique-id",
  "username": "string",
  "email": "string",
  "passwordHash": "string",
  "activeSessionIds": ["array", "of", "session-ids"],
  "isAdmin": "boolean",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Documents:**
```json
{
  "_id": "unique-id",
  "userId": "user-id",
  "filename": "string",
  "originalName": "string",
  "mimeType": "string",
  "size": "number",
  "uploadedAt": "timestamp",
  "metadata": {
    "chunks": "number",
    "embedded": "boolean"
  }
}
```

**Chat Sessions:**
```json
{
  "_id": "unique-id",
  "userId": "user-id",
  "messages": [
    {
      "role": "user|assistant",
      "content": "string",
      "timestamp": "timestamp"
    }
  ],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### Vector Metadata Compatibility

Both Pinecone and ChromaDB store:
- `documentId` - Reference to document
- `chunkIndex` - Chunk number within document
- `text` - Original text chunk
- `userId` - User who owns the document

### What Gets Migrated

✅ **Migrated:**
- User accounts and credentials
- Document metadata (filename, size, upload date)
- Chat history (all messages)
- Vector metadata (document references, chunk info)

⚠️ **Re-processed:**
- Embeddings (different models, different dimensions)
- Vector indices (rebuilt in destination storage)

❌ **Not Migrated (Regenerated):**
- JWT tokens (users must log in again)
- Active sessions (cleared during migration)

---

## Migration Scripts (Future)

### Export Cloud Data

```bash
# Export from cloud storage
npm run export:cloud -- \
  --output=./migration/cloud-data \
  --include=users,documents,sessions,vectors

# Options:
# --include: Comma-separated list of what to export
# --output: Directory to save export files
# --format: json (default) or csv
```

### Export Local Data

```bash
# Export from local storage
npm run export:local -- \
  --output=./migration/local-data \
  --include=users,documents,sessions,vectors
```

### Import to Cloud

```bash
# Import to cloud storage
npm run import:cloud -- \
  --input=./migration/local-data \
  --re-embed  # Re-embed documents with OpenAI

# Options:
# --input: Directory containing export files
# --re-embed: Re-generate embeddings (required for local→cloud)
# --dry-run: Show what would be imported without actually importing
```

### Import to Local

```bash
# Import to local storage
npm run import:local -- \
  --input=./migration/cloud-data \
  --re-embed  # Re-embed documents with local model

# Options:
# --input: Directory containing export files
# --re-embed: Re-generate embeddings (required for cloud→local)
# --dry-run: Show what would be imported without actually importing
```

---

## Troubleshooting

### Migration Fails: "Cannot connect to database"

**Cause:** Destination storage not configured or not running

**Solution:**

For cloud mode:
```bash
# Verify MongoDB connection string in .env
mongosh "your-mongodb-uri"

# Verify Pinecone API key
curl https://controller.us-east-1.pinecone.io/actions/whoami \
  -H "Api-Key: your-pinecone-key"
```

For local mode:
```bash
# Verify SQLite database exists
ls ~/.gkchatty/data/gkchatty.db

# Verify Ollama is running
curl http://localhost:11434/api/tags
```

---

### Migration Succeeds but Documents Missing

**Cause:** Vector embeddings not migrated properly

**Solution:**

```bash
# Re-embed all documents
npm run re-embed -- --all

# Or re-embed specific user's documents
npm run re-embed -- --userId=user-id
```

---

### Embedding Dimension Mismatch Error

**Cause:** Trying to use cloud embeddings in local mode (or vice versa)

**Solution:**

Documents must be re-embedded when switching modes:

```bash
# During import, use --re-embed flag
npm run import:local -- --input=./data --re-embed
```

---

### Some Users Can't Log In After Migration

**Cause:** Password hashes use different bcrypt rounds

**Solution:**

```bash
# Reset passwords for affected users
npm run reset-password -- --username=affected-user
```

Or users can use "Forgot Password" flow in the UI.

---

### Vector Search Returns No Results After Migration

**Cause:** Vectors not indexed properly in destination storage

**Solution:**

```bash
# Rebuild vector index
npm run rebuild-vectors

# For Pinecone (cloud)
# Vectors may take 1-2 minutes to index

# For ChromaDB (local)
# Index rebuilds immediately
```

---

## Best Practices

### Before Migration

1. **Backup everything**
   - Export data to JSON
   - Database dumps
   - File system snapshots

2. **Test in development first**
   - Don't migrate production data directly
   - Use copy of data for testing
   - Verify migration with small dataset

3. **Document current state**
   - User count
   - Document count
   - Vector count
   - Chat session count

4. **Notify users (if applicable)**
   - Service downtime window
   - Need to log in again after migration
   - Potential delays in search results while re-indexing

### During Migration

1. **Put service in maintenance mode**
   ```bash
   export MAINTENANCE_MODE=true
   npm run dev
   ```

2. **Run migration with logging**
   ```bash
   npm run import:cloud -- --input=./data 2>&1 | tee migration.log
   ```

3. **Monitor progress**
   - Watch for errors in logs
   - Check resource usage (disk, memory)
   - Verify partial imports incrementally

### After Migration

1. **Verify data integrity**
   - Count records (should match export counts)
   - Test random user logins
   - Test document search
   - Test chat functionality

2. **Performance testing**
   - Response times acceptable?
   - Vector search working?
   - No errors in logs?

3. **Keep backups for 7 days**
   - Don't delete old data immediately
   - Easy rollback if issues found
   - Users may report issues days later

4. **Document what happened**
   - Migration date and time
   - Data counts before/after
   - Any issues encountered
   - How long it took

---

## Rollback Procedures

### If Migration Fails

**Option 1: Restore from Backup (Recommended)**

```bash
# For cloud mode
mongorestore --uri="your-mongodb-uri" ./backup-folder

# For local mode
cp ./gkchatty-backup.db ~/.gkchatty/data/gkchatty.db
cp -r ./chromadb-backup/* ~/.gkchatty/data/vectors/
```

**Option 2: Switch Back to Original Mode**

```bash
# If migrated cloud→local and had issues
./switch-mode.sh cloud
# Restore .env.backup file
cp backend/.env.backup.YYYYMMDD-HHMMSS backend/.env
npm run dev
```

### If Data Corrupted After Migration

1. **Stop backend immediately**
   ```bash
   # Kill backend process
   pkill -f "node.*backend"
   ```

2. **Restore from most recent backup**
   ```bash
   # See Option 1 above
   ```

3. **Investigate root cause**
   ```bash
   # Check migration logs
   cat migration.log | grep ERROR

   # Check backend logs
   cat backend/logs/error.log
   ```

4. **Fix issue and re-try migration**
   ```bash
   # Fix the problem
   # Then run migration again with fresh export
   ```

---

## Migration Checklist

### Pre-Migration

- [ ] Backup all data
- [ ] Test migration in development
- [ ] Document current state (counts, users, etc.)
- [ ] Notify users of downtime (if applicable)
- [ ] Verify destination storage is ready
- [ ] Verify sufficient disk space

### During Migration

- [ ] Put service in maintenance mode
- [ ] Run export script
- [ ] Verify export files created
- [ ] Switch storage mode
- [ ] Run import script with logging
- [ ] Monitor progress

### Post-Migration

- [ ] Verify data counts match
- [ ] Test user login
- [ ] Test document upload
- [ ] Test vector search
- [ ] Test chat functionality
- [ ] Check backend logs for errors
- [ ] Performance testing
- [ ] Remove maintenance mode
- [ ] Notify users migration complete

### Cleanup (7 days later)

- [ ] Confirm no issues reported
- [ ] Archive migration logs
- [ ] Delete temporary export files
- [ ] Optionally delete old backups (keep at least one)

---

## Future Enhancements

### Planned Features

1. **Incremental Migration**
   - Migrate data in batches
   - Resume from last successful batch
   - Reduce downtime

2. **Live Migration**
   - Dual-write to both storage modes
   - Zero downtime migration
   - Gradual cutover

3. **Automated Testing**
   - Compare data before/after migration
   - Automated verification tests
   - Performance benchmarks

4. **Migration Dashboard**
   - Real-time progress monitoring
   - Visual data integrity checks
   - One-click rollback

---

## Related Documentation

- **Architecture:** `docs/architecture/CURRENT-STACK.md`
- **Deployment:** `docs/deployment/NETLIFY-DEPLOYMENT.md`
- **Development:** `docs/development/LOCAL-DEVELOPMENT.md`
- **Merge Plan:** `CLEANUP-AND-MERGE-PLAN.md`

---

**Last Updated:** 2025-11-14
**Status:** Prepared for future use (local mode not yet integrated)
**Next Update:** When local mode implementation begins (Phase 4)
