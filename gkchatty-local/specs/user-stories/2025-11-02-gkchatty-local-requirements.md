# GKChatty Local - Pluggable Embedding Architecture Requirements

## Epic Overview

**Title:** GKChatty Local - Pluggable Embedding Architecture

**Description:** Transform GKChatty from cloud-dependent to 100% offline-capable by implementing a pluggable embedding architecture that auto-detects local models, supports API providers with user-supplied keys, and leverages M2 Metal Performance Shaders for 5-10x faster local inference.

**Business Value:**
- **Zero cloud costs** for users running local embeddings exclusively
- **Privacy-first** operation with 100% offline capability
- **Flexibility** to use API providers when needed (user choice)
- **Performance** optimized for M2 Macs with MPS acceleration
- **User experience** simplified with auto-detection and one-click provider switching

**Target Platform:** macOS (M2 MacBook Pro with 24GB RAM)

---

## User Stories

### US-1: Auto-detect local embedding models on system

**Priority:** HIGH

**As a** GKChatty user
**I want** the system to automatically detect all local embedding models installed on my machine
**So that** I can use them without manual configuration

**Acceptance Criteria:**
- System scans HuggingFace cache directory (`~/.cache/huggingface/hub`) on startup
- Detects all models with 'sentence-transformers' or 'embed' in model card
- Extracts model metadata (name, dimensions, provider, size)
- Returns list of detected models via API endpoint `GET /api/embeddings/providers/local`
- Handles missing cache directory gracefully (empty array, no error)
- Detection completes in < 2 seconds for typical cache (< 20 models)

**Technical Notes:**
- Use Node.js `fs.readdirSync` to scan cache directory
- Parse model cards (config.json) to extract metadata
- Filter models by architecture (sentence-transformers compatible)
- Cache detection results for 5 minutes (avoid re-scanning on every request)

---

### US-2: Select and activate embedding provider via UI

**Priority:** HIGH

**As a** GKChatty user
**I want** to select an embedding provider (local or API) from a dropdown menu
**So that** I can control which model generates embeddings

**Acceptance Criteria:**
- UI displays dropdown with all detected local models + API provider options
- Shows model metadata (name, dimensions, provider type, status)
- Displays 'RECOMMENDED' badge next to nomic-embed-text-v1.5
- User can switch providers without restarting application
- UI shows current active provider with checkmark icon
- Switch triggers `POST /api/embeddings/providers/activate` with provider_id
- Shows loading indicator during activation (< 5 seconds)
- Displays success/error toast notification after activation

**UI Mockup:**
```
┌─────────────────────────────────────────┐
│  Embedding Provider                     │
├─────────────────────────────────────────┤
│  ✓ nomic-embed-text-v1.5 [RECOMMENDED] │
│    768 dimensions | Local (MPS)         │
│                                         │
│    all-MiniLM-L6-v2                     │
│    384 dimensions | Local (CPU)         │
│                                         │
│    OpenAI (text-embedding-3-small)      │
│    1536 dimensions | API                │
└─────────────────────────────────────────┘
```

---

### US-3: Generate embeddings using local MPS-accelerated models

**Priority:** HIGH

**As a** GKChatty user
**I want** to generate embeddings using local models accelerated by M2 Metal Performance Shaders
**So that** I get fast inference without cloud costs

**Acceptance Criteria:**
- System initializes Transformers.js pipeline with `device='mps'` on M2 Macs
- Falls back to `'cpu'` if MPS not available (Intel Macs, Linux)
- Embedding generation uses selected local model from provider registry
- Batch processing supported (up to 32 texts per batch)
- MPS acceleration achieves 5-10x speedup vs CPU (benchmark test)
- Single embedding generates in < 100ms (768-dim model, MPS enabled)
- Handles model loading errors gracefully (retry with CPU fallback)
- Memory usage stays under 2GB for nomic-embed-text-v1.5

**Technical Implementation:**
```typescript
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline(
  'feature-extraction',
  'nomic-ai/nomic-embed-text-v1.5',
  { device: 'mps' } // Auto-detects MPS availability
);

const embeddings = await embedder(texts, {
  pooling: 'mean',
  normalize: true
});
```

**Performance Target:**
- CPU (M2): ~500ms per embedding (768-dim)
- MPS (M2): ~50-100ms per embedding (768-dim)
- Batch (32 texts, MPS): ~2-3 seconds total

---

### US-4: Configure API providers with user-supplied keys

**Priority:** HIGH

**As a** GKChatty user
**I want** to add API provider credentials (OpenAI, Cohere, Voyage, Jina, Gemini)
**So that** I can use cloud embeddings when needed

**Acceptance Criteria:**
- UI shows 'Add API Provider' button in settings
- Modal form with fields: provider (dropdown), API key (password input), model name (text)
- Validates API key format (non-empty, min 20 chars)
- `POST /api/embeddings/providers/api` endpoint saves encrypted credentials
- Test connection button verifies API key with test embedding request
- Shows provider status: 'Active', 'Invalid Key', 'Rate Limited', 'Offline'
- User can edit/delete API provider credentials
- API keys stored encrypted in SQLite (AES-256-GCM)
- Supports providers: OpenAI (`text-embedding-3-small`), Cohere (`embed-english-v3.0`), Voyage (`voyage-2`), Jina (`jina-embeddings-v2-base-en`), Gemini (`text-embedding-004`)

**Security Requirements:**
- API keys encrypted at rest using AES-256-GCM
- Encryption key derived from system keychain (macOS Keychain Access)
- Keys never logged or exposed in API responses
- Test connection uses minimal data (single test embedding)

---

### US-5: Unified provider interface for all embedding sources

**Priority:** HIGH

**As a** developer
**I want** a unified provider interface
**So that** embedding generation works identically regardless of source (local or API)

**Acceptance Criteria:**
- Interface `EmbeddingProvider` with methods: `initialize()`, `embed(texts)`, `getDimensions()`, `getStatus()`
- `LocalProvider` implementation uses Transformers.js with MPS
- `APIProvider` implementations for OpenAI, Cohere, Voyage, Jina, Gemini
- All providers return same format: `{embeddings: number[][], dimensions: number}`
- Error handling standardized across providers (`ProviderError` class)
- Retry logic for transient failures (3 retries, exponential backoff)
- Rate limiting handled per-provider (respects API limits)
- Provider initialization validates model availability before activation

**Interface Definition:**
```typescript
interface EmbeddingProvider {
  id: string;
  type: 'local' | 'api';
  name: string;
  modelName: string;
  dimensions: number;

  initialize(): Promise<void>;
  embed(texts: string[]): Promise<{embeddings: number[][], dimensions: number}>;
  getDimensions(): number;
  getStatus(): Promise<ProviderStatus>;
  cleanup(): Promise<void>;
}

type ProviderStatus = 'healthy' | 'degraded' | 'unavailable';
```

---

### US-6: Store embeddings in ChromaDB with provider metadata

**Priority:** MEDIUM

**As a** GKChatty user
**I want** my embeddings stored in local ChromaDB with provider metadata
**So that** I can switch providers without re-embedding existing documents

**Acceptance Criteria:**
- ChromaDB collection stores metadata: `provider_id`, `model_name`, `dimensions`, `created_at`
- Query filters by `provider_id` to ensure consistent embedding space
- Collection naming: `gkchatty_{user_id}_{provider_id}`
- Migration path: switching providers creates new collection, preserves old
- UI warns user when switching providers (requires re-embedding)
- Batch upsert supports up to 1000 documents per call
- Similarity search returns top-k results with metadata
- Delete collection endpoint: `DELETE /api/embeddings/collections/{collection_id}`

**Data Model:**
```typescript
interface ChromaDocument {
  id: string;
  embedding: number[];
  metadata: {
    provider_id: string;
    model_name: string;
    dimensions: number;
    created_at: string;
    user_id: string;
    content_hash: string;
  };
  document: string;
}
```

---

### US-7: Provider status monitoring and health checks

**Priority:** MEDIUM

**As a** GKChatty user
**I want** real-time provider status monitoring
**So that** I know when my embedding provider is unavailable or degraded

**Acceptance Criteria:**
- Health check endpoint `GET /api/embeddings/providers/{provider_id}/health`
- Status indicators: 'healthy' (green), 'degraded' (yellow), 'unavailable' (red)
- Automatic health checks every 5 minutes for active provider
- UI displays status badge next to provider name
- Degraded status shows warning: 'Slow response times detected'
- Unavailable status shows error: 'Provider offline, switch to backup'
- Metrics tracked: `avg_response_time`, `error_rate`, `requests_per_minute`
- Alert notification when active provider becomes unavailable

**Health Check Logic:**
```typescript
async function checkHealth(provider: EmbeddingProvider): Promise<HealthStatus> {
  const startTime = Date.now();
  try {
    await provider.embed(['test']);
    const responseTime = Date.now() - startTime;

    if (responseTime > 5000) return 'degraded';
    return 'healthy';
  } catch (error) {
    return 'unavailable';
  }
}
```

---

### US-8: Embedding performance benchmarking

**Priority:** LOW

**As a** GKChatty user
**I want** to benchmark embedding providers
**So that** I can choose the fastest option for my hardware

**Acceptance Criteria:**
- Benchmark endpoint `POST /api/embeddings/benchmark` with payload: `provider_id`, `test_size` (10/100/1000 texts)
- Measures: `total_time`, `avg_time_per_embedding`, `throughput` (embeddings/sec)
- Compares MPS vs CPU performance for local models
- UI displays benchmark results in table (sortable by speed)
- Recommended provider highlighted based on speed + availability
- Benchmark uses sample texts from different domains (code, docs, chat)
- Results cached for 24 hours per provider
- Export benchmark results to JSON/CSV

**Benchmark Output:**
```json
{
  "provider_id": "nomic-embed-mps",
  "test_size": 100,
  "total_time_ms": 5234,
  "avg_time_per_embedding_ms": 52.34,
  "throughput_per_sec": 19.1,
  "device": "mps",
  "timestamp": "2025-11-02T10:30:00Z"
}
```

---

### US-9: Offline mode for 100% local operation

**Priority:** MEDIUM

**As a** GKChatty user
**I want** to use GKChatty completely offline with local embeddings
**So that** I have zero cloud dependencies

**Acceptance Criteria:**
- System detects network availability on startup
- Offline mode auto-enabled if no internet connection
- UI shows 'Offline Mode' indicator in header
- Only local providers available in offline mode (API providers hidden)
- Document upload, embedding, and search work without network
- Chat completions work with local LLMs (Ollama integration)
- Settings persist offline mode preference in SQLite
- Manual toggle: 'Force Offline Mode' in settings

**Offline Mode Behavior:**
- API provider selection disabled (greyed out)
- Network-dependent features hidden (cloud sync, telemetry)
- Error messages clarify: "Feature requires internet connection"
- Automatic fallback to cached data when available

---

### US-10: Provider configuration persistence

**Priority:** MEDIUM

**As a** GKChatty user
**I want** my provider settings to persist across restarts
**So that** I don't need to reconfigure every time

**Acceptance Criteria:**
- SQLite table: `embedding_providers` (id, type, name, model_name, api_key_encrypted, dimensions, status, is_active, created_at, updated_at)
- Active provider restored on application startup
- User preferences table stores: `preferred_provider_id`, `offline_mode_enabled`
- Configuration export/import via JSON (excluding encrypted API keys)
- Backup/restore settings from `~/.gkchatty/config.json`
- Migration scripts for schema changes (Knex.js migrations)
- Config validation on startup (invalid configs auto-fixed)
- Reset to defaults button: restores factory settings

**Database Schema:**
```sql
CREATE TABLE embedding_providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('local', 'api')),
  name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  api_key_encrypted TEXT,
  dimensions INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  is_active BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  preferred_provider_id TEXT,
  offline_mode_enabled BOOLEAN DEFAULT 0,
  FOREIGN KEY (preferred_provider_id) REFERENCES embedding_providers(id)
);
```

---

### US-11: Model download and installation via UI

**Priority:** LOW

**As a** GKChatty user
**I want** to download embedding models directly from HuggingFace via the UI
**So that** I don't need to use CLI tools

**Acceptance Criteria:**
- UI shows 'Download Model' button in provider settings
- Model browser with curated list (nomic-embed-text-v1.5, all-MiniLM-L6-v2, etc.)
- Download progress bar with percentage and estimated time
- `POST /api/embeddings/models/download` endpoint triggers HuggingFace download
- Uses HuggingFace Hub API to fetch model files to `~/.cache/huggingface/hub`
- Validates model compatibility (sentence-transformers architecture)
- Shows disk space required before download (with available space check)
- Auto-detects new model after download completes
- Cancel download button with cleanup of partial files

**Curated Model List:**
- `nomic-ai/nomic-embed-text-v1.5` (768 dims, RECOMMENDED)
- `sentence-transformers/all-MiniLM-L6-v2` (384 dims)
- `sentence-transformers/all-mpnet-base-v2` (768 dims)
- `BAAI/bge-small-en-v1.5` (384 dims)
- `thenlper/gte-base` (768 dims)

---

### US-12: Cost tracking for API providers

**Priority:** LOW

**As a** GKChatty user
**I want** to see embedding costs for API providers
**So that** I can monitor my cloud spending

**Acceptance Criteria:**
- SQLite table: `embedding_usage` (id, provider_id, user_id, texts_embedded, tokens_processed, cost_usd, timestamp)
- Cost calculation based on provider pricing: OpenAI ($0.00002/1K tokens), Cohere ($0.0001/1K tokens), etc.
- Dashboard widget shows: `total_cost_this_month`, `embeddings_generated`, `cost_breakdown_by_provider`
- Export usage report to CSV (monthly/yearly)
- Alert when monthly cost exceeds threshold (configurable)
- Comparison: "Local embeddings saved you $X this month"
- Cost projection: "At current usage, expect $X/month"
- Reset usage stats button (admin only)

**Cost Formula:**
```typescript
const PRICING = {
  'openai': 0.00002,  // per 1K tokens
  'cohere': 0.0001,
  'voyage': 0.0001,
  'jina': 0.00002,
  'gemini': 0.00001
};

function calculateCost(provider: string, tokenCount: number): number {
  const pricePerToken = PRICING[provider] / 1000;
  return tokenCount * pricePerToken;
}
```

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                    │
│  - Provider selection UI                                │
│  - Settings panel                                       │
│  - Status indicators                                    │
│  - Benchmark results                                    │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────┐
│                  Backend (Node.js)                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Provider Registry                        │  │
│  │  - LocalProvider (Transformers.js + MPS)         │  │
│  │  - OpenAIProvider                                │  │
│  │  - CohereProvider                                │  │
│  │  - VoyageProvider                                │  │
│  │  - JinaProvider                                  │  │
│  │  - GeminiProvider                                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Storage Adapter                          │  │
│  │  - ChromaDB client                               │  │
│  │  - SQLite metadata store                         │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Storage Layer                          │
│  - ChromaDB (vector storage)                            │
│  - SQLite (provider configs, metadata, usage stats)     │
│  - HuggingFace cache (~/.cache/huggingface/hub)         │
└─────────────────────────────────────────────────────────┘
```

### API Endpoints

#### Provider Management
- `GET /api/embeddings/providers` - List all providers (local + API)
- `GET /api/embeddings/providers/local` - List detected local models
- `POST /api/embeddings/providers/api` - Add API provider with credentials
- `PUT /api/embeddings/providers/{id}` - Update provider config
- `DELETE /api/embeddings/providers/{id}` - Remove provider
- `POST /api/embeddings/providers/{id}/activate` - Switch active provider
- `GET /api/embeddings/providers/{id}/health` - Check provider status
- `POST /api/embeddings/benchmark` - Run performance benchmark

#### Embedding Operations
- `POST /api/embeddings/generate` - Generate embeddings for texts
- `POST /api/embeddings/search` - Similarity search in ChromaDB
- `POST /api/embeddings/upsert` - Add/update embeddings in collection
- `DELETE /api/embeddings/{id}` - Delete embedding by ID

#### Model Management
- `GET /api/embeddings/models` - List available models (curated)
- `POST /api/embeddings/models/download` - Download model from HuggingFace
- `GET /api/embeddings/models/download/{id}/status` - Download progress
- `DELETE /api/embeddings/models/download/{id}` - Cancel download

#### Collections
- `GET /api/embeddings/collections` - List all collections
- `POST /api/embeddings/collections` - Create new collection
- `DELETE /api/embeddings/collections/{id}` - Delete collection
- `GET /api/embeddings/collections/{id}/stats` - Collection statistics

#### Usage & Analytics
- `GET /api/embeddings/usage` - Get usage stats (costs, counts)
- `GET /api/embeddings/usage/export` - Export usage report (CSV/JSON)
- `POST /api/embeddings/usage/reset` - Reset usage stats (admin)

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- Create `EmbeddingProvider` interface
- Implement `LocalProvider` with Transformers.js
- Implement MPS device detection
- Create provider registry service
- Setup SQLite schema for provider storage

### Phase 2: Model Detection (Week 1)
- Implement HuggingFace cache scanner
- Parse model metadata from config.json
- Create API endpoint for local model listing
- Cache detection results

### Phase 3: API Providers (Week 2)
- Implement `OpenAIProvider`
- Implement `CohereProvider`
- Implement `VoyageProvider`
- Implement `JinaProvider`
- Implement `GeminiProvider`
- Add encryption for API keys (AES-256-GCM)

### Phase 4: ChromaDB Integration (Week 2)
- Update ChromaDB service to support provider metadata
- Implement collection-per-provider strategy
- Add migration warnings for provider switches
- Batch upsert optimization

### Phase 5: Frontend UI (Week 3)
- Provider selection dropdown
- Add API provider modal
- Provider status indicators
- Settings persistence UI
- Offline mode toggle

### Phase 6: Health & Monitoring (Week 3)
- Implement health check service
- Add automatic health monitoring (5-min intervals)
- Create status badge UI components
- Alert notifications for provider failures

### Phase 7: Advanced Features (Week 4)
- Performance benchmarking tool
- Model download UI
- Cost tracking dashboard
- Usage analytics
- Export/import configurations

### Phase 8: Testing & Polish (Week 4)
- Unit tests for all providers
- Integration tests for provider switching
- MPS vs CPU benchmark validation
- Offline mode testing
- Security audit (API key encryption)

---

## Success Metrics

### Performance Metrics
- **Model detection speed:** < 2 seconds for 20 models
- **MPS acceleration:** 5-10x faster than CPU (M2 Macs)
- **Embedding generation:** < 100ms per embedding (768-dim, MPS)
- **Provider switching:** < 5 seconds to activate
- **Memory efficiency:** < 2GB RAM for local models
- **UI responsiveness:** Dropdown loads in < 1 second

### Reliability Metrics
- **Auto-detection accuracy:** 100% of installed models detected
- **Error recovery:** 95%+ success rate for transient API failures
- **Offline capability:** 100% functional without network (local only)
- **Health check accuracy:** 99%+ correct status detection

### Business Metrics
- **Cost savings:** $0/month for local-only users
- **API provider support:** All 5 providers functional
- **User satisfaction:** 90%+ successful provider switches
- **Adoption rate:** 70%+ of users try local embeddings

---

## Constraints & Assumptions

### Platform Requirements
- **macOS 12+** (Metal Performance Shaders availability)
- **M2 Mac** (MPS optimization target)
- **8GB RAM minimum** (16GB+ recommended)
- **5GB free disk space** (for model cache)

### Technology Stack
- **Node.js 18+** (ES modules, native fetch)
- **Transformers.js 2.6.0+** (local inference)
- **ChromaDB 0.4.0+** (vector storage)
- **SQLite 3.40+** (metadata storage)
- **React 18+** (frontend UI)

### Assumptions
- Users have HuggingFace models installed OR willing to download
- M2 MPS provides consistent 5-10x speedup (validated)
- API providers maintain backward compatibility
- ChromaDB local instance performs adequately (< 10ms query)
- SQLite handles 10K+ provider configs without performance issues

### Out of Scope (MVP)
- Cloud deployment (Docker, Kubernetes)
- Non-macOS platforms (Windows, Linux)
- GPU acceleration for non-Apple hardware (CUDA)
- Embedding model fine-tuning
- Multi-user provider sharing
- Mobile app support

---

## Risk Assessment

### Technical Risks

**Risk:** MPS acceleration not available on all M2 Macs
**Mitigation:** Graceful fallback to CPU, detection on startup
**Impact:** Medium (performance degradation)
**Probability:** Low (MPS widely supported on macOS 12+)

**Risk:** HuggingFace cache structure changes
**Mitigation:** Version detection, fallback to manual model paths
**Impact:** Medium (model detection fails)
**Probability:** Low (stable API)

**Risk:** API provider rate limiting
**Mitigation:** Retry logic, exponential backoff, rate limit tracking
**Impact:** Low (temporary degradation)
**Probability:** Medium (expected behavior)

**Risk:** ChromaDB performance issues with large collections
**Mitigation:** Collection partitioning, pagination, index optimization
**Impact:** High (poor search performance)
**Probability:** Low (ChromaDB optimized for this use case)

### Security Risks

**Risk:** API keys leaked in logs or API responses
**Mitigation:** Encryption at rest, sanitized logging, secure storage
**Impact:** Critical (credential compromise)
**Probability:** Low (security best practices enforced)

**Risk:** Malicious model files in HuggingFace cache
**Mitigation:** Model validation, signature verification (future)
**Impact:** Medium (code execution risk)
**Probability:** Very Low (trusted source)

---

## Glossary

- **Embedding:** Dense vector representation of text (e.g., 768-dimensional array)
- **MPS:** Metal Performance Shaders (Apple's GPU acceleration framework)
- **Provider:** Service that generates embeddings (local model or API)
- **ChromaDB:** Open-source vector database for similarity search
- **Transformers.js:** JavaScript library for running transformer models in Node.js
- **HuggingFace:** Platform for sharing and discovering machine learning models
- **Sentence-Transformers:** Framework for generating sentence/text embeddings
- **RAG:** Retrieval-Augmented Generation (search + LLM completion)

---

## Appendix: Provider Comparison

| Provider | Model | Dimensions | Cost (1M embeddings) | Speed (M2 MPS) | Offline |
|----------|-------|------------|----------------------|----------------|----------|
| **nomic-embed-text-v1.5** | Local | 768 | $0 | 50-100ms | ✅ |
| all-MiniLM-L6-v2 | Local | 384 | $0 | 30-60ms | ✅ |
| OpenAI (text-embedding-3-small) | API | 1536 | $20 | 200-500ms | ❌ |
| Cohere (embed-english-v3.0) | API | 1024 | $100 | 300-600ms | ❌ |
| Voyage (voyage-2) | API | 1024 | $100 | 250-550ms | ❌ |
| Jina (jina-embeddings-v2) | API | 768 | $20 | 200-500ms | ❌ |
| Gemini (text-embedding-004) | API | 768 | $10 | 150-400ms | ❌ |

**Recommendation:** Use `nomic-embed-text-v1.5` for offline, cost-free operation with excellent quality.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-02
**Author:** Product Owner (BMAD Workflow)
**Status:** Approved for Development