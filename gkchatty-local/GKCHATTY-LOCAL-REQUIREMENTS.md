# GKChatty Local - Requirements Document

## Project Overview
Transform GKChatty from a cloud-dependent service to a hybrid local-first platform that stores all data on the user's machine while maintaining compatibility with the existing MCP interface.

## Core Requirements

### 1. Storage Migration
- **FROM:** MongoDB Atlas (cloud) → **TO:** SQLite (local database at ~/.gkchatty/data/gkchatty.db)
- **FROM:** Pinecone (cloud vectors) → **TO:** ChromaDB (local vector database)
- **FROM:** OpenAI embeddings API → **TO:** sentence-transformers (local embeddings)

### 2. Architecture Components

#### Local Agent (Desktop Application)
- Runs as system tray/menu bar application
- Starts automatically on boot
- Provides MCP server on localhost:7860
- Local web UI on localhost:7861
- Shows status, document count, storage mode

#### Storage Abstraction Layer
- Interface that supports both local and cloud backends
- Toggle switch for storage mode (local vs cloud)
- Migration tools for cloud ↔ local data transfer

#### MCP Interface Compatibility
- MUST maintain exact same MCP interface as current GKChatty
- Methods: upload_to_gkchatty, query_gkchatty, switch_user, etc.
- Claude Code should work without any changes

### 3. Technical Specifications

#### SQLite Backend
- Database path: ~/.gkchatty/data/gkchatty.db
- Schema to match MongoDB collections:
  - users table
  - documents table
  - projects table
  - settings table

#### ChromaDB Integration
- Path: ~/.gkchatty/data/vectors/
- Collections per project for isolation
- Metadata filtering support
- Persistence between sessions

#### Local Embeddings
- Model: all-MiniLM-L6-v2 (384 dimensions)
- Cached at: ~/.gkchatty/data/models/
- Batch processing for performance
- CPU and GPU support

### 4. User Experience

#### Installation
- One-command installation: `curl -fsSL https://install.gkchatty.com/local.sh | sh`
- Installers for Mac (.dmg), Windows (.msi), Linux (.deb/.rpm)
- Auto-update mechanism

#### System Tray Interface
```
GKChatty ✅
├── Storage: Local
├── Documents: 0
├── Projects: 0
├── Status: Running
│
├── Switch to Cloud Mode...
├── Open Dashboard...
├── Settings...
└── Quit
```

#### Storage Toggle
- Web dashboard setting to switch between local/cloud
- Data migration when switching modes
- Clear indication of current mode

### 5. Performance Requirements
- Query latency: < 50ms (local) vs 200-500ms (cloud)
- Upload time: < 0.1s per document (local) vs 1-2s (cloud)
- Startup time: < 2 seconds
- Memory usage: < 100MB for agent

### 6. Security Requirements
- All data stays in ~/.gkchatty/ folder
- No telemetry without explicit consent
- Optional web dashboard connection (can work fully offline)
- Encrypted storage option for sensitive data

### 7. Compatibility Requirements
- Works with existing Claude Code MCP setup
- Backward compatible with cloud version
- Same API surface for all methods
- Project isolation maintained

### 8. Testing Requirements
- Unit tests for all storage backends
- Integration tests for MCP interface
- Performance benchmarks (local vs cloud)
- Migration tests (cloud → local → cloud)

## Implementation Plan

### Phase 1: Core Storage (Week 1)
1. SQLite backend implementation
2. ChromaDB integration
3. Local embeddings setup
4. Storage abstraction layer

### Phase 2: Desktop Agent (Week 2)
1. System tray application
2. Local MCP server
3. Auto-start mechanism
4. Local web UI

### Phase 3: Migration & Toggle (Week 3)
1. Data migration tools
2. Storage mode toggle
3. Web dashboard integration
4. Settings synchronization

### Phase 4: Polish & Release (Week 4)
1. Installers for all platforms
2. Documentation
3. Performance optimization
4. Public launch

## Success Criteria
- ✅ 100% MCP compatibility maintained
- ✅ Query latency < 50ms
- ✅ Zero data leaves user's machine in local mode
- ✅ Installation time < 5 minutes
- ✅ Works offline (except Claude API calls)
- ✅ Passes all existing GKChatty tests

## Technical Stack
- **Language:** Node.js (match existing codebase)
- **Database:** SQLite3 (via better-sqlite3)
- **Vectors:** ChromaDB (via chromadb-node)
- **Embeddings:** sentence-transformers (via transformers.js)
- **Desktop:** Electron (for system tray)
- **MCP:** @modelcontextprotocol/sdk
- **Testing:** Jest + Playwright

## Constraints
- Must maintain backward compatibility
- Cannot break existing user workflows
- Must support both local and cloud modes
- Should not require root/admin privileges
- Must work on macOS, Windows, Linux

## Deliverables
1. gkchatty-local npm package
2. Desktop application with installers
3. Migration tools and scripts
4. Updated documentation
5. Performance benchmark report
6. Test coverage report