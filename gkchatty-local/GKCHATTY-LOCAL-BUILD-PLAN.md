# GKChatty Local - Build Plan (M2 MacBook Pro Optimized)

**Date:** November 2, 2025
**Target Hardware:** MacBook Pro 13" M2, 24GB RAM
**Build Tool:** BMAD Builder Pro with Claude Code
**Embedding Model:** nomic-embed-text-v1.5 (MPS-accelerated)

---

## Project Overview

Build GKChatty Local with:
- **Auto-detection** of available local embedding models
- **User-selectable** models with UI
- **API provider support** (OpenAI, Cohere, Voyage, Jina, Gemini)
- **M2 optimization** using Metal Performance Shaders (MPS)
- **Zero cloud costs** for local embeddings
- **100% offline** capability (except API providers)

**Goal:** Replace cloud dependencies (MongoDB Atlas, Pinecone, OpenAI API) with local storage (SQLite, ChromaDB, local embeddings).

---

## Architecture Summary

```
┌─────────────────────────────────────┐
│  Backend API (localhost:4001)        │
│                                      │
│  ┌────────────────────────────────┐ │
│  │   Embedding Provider System     │ │
│  │   ├── Model Detector           │ │
│  │   ├── Provider Registry         │ │
│  │   └── User Configuration        │ │
│  └────────────────────────────────┘ │
│               │                      │
│               ↓                      │
│  ┌────────────────────────────────┐ │
│  │   Storage Adapter               │ │
│  │   ├── Local Provider (selected) │ │
│  │   ├── API Provider (optional)   │ │
│  │   └── Fallback Chain            │ │
│  └────────────────────────────────┘ │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│  Storage Backends (Local)            │
│  ├── SQLite (documents)              │
│  ├── ChromaDB (vectors)              │
│  └── Local Models (~/.gkchatty/)     │
└─────────────────────────────────────┘
```

---

## Components to Build

### 1. Model Detection System

**File:** `backend/src/services/embedding/modelDetector.ts`

**Purpose:** Auto-discover embedding models on user's machine

**Features:**
- Scan HuggingFace cache (`~/.cache/huggingface/hub/`)
- Scan PyTorch hub (`~/.cache/torch/hub/`)
- Scan custom directory (`~/.gkchatty/models/`)
- Detect system capabilities (MPS, CUDA, memory)
- Benchmark model speed on actual hardware

**Key Methods:**
```typescript
class ModelDetector {
  async scanForModels(): Promise<DetectedModel[]>
  async detectBestDevice(): Promise<'cpu' | 'mps' | 'cuda'>
  async benchmarkModel(model: DetectedModel): Promise<number>
  private async hasMPS(): Promise<boolean>
}
```

**Algorithm:**
1. Search known model paths
2. Parse `config.json` to extract model info
3. Test each model's availability
4. Benchmark speed on M2 hardware
5. Return list of available models

---

### 2. Provider Registry

**File:** `backend/src/services/embedding/providerRegistry.ts`

**Purpose:** Centralized registry of all available embedding providers

**Features:**
- Register local models (auto-detected)
- Register API providers (always available if user has key)
- Recommend best provider for hardware
- Allow user override

**Key Methods:**
```typescript
class ProviderRegistry {
  async initialize(): Promise<void>
  getAvailableProviders(): ProviderConfig[]
  getProvider(id: string): ProviderConfig | undefined
  getRecommendedProvider(): ProviderConfig
}
```

**Providers to Register:**

**Local Models:**
- all-MiniLM-L6-v2 (384 dims, 80MB)
- all-mpnet-base-v2 (768 dims, 420MB)
- nomic-embed-text-v1.5 (768 dims, 550MB) ← **Recommended for M2**
- bge-small-en-v1.5 (384 dims, 120MB)
- stella-1.5B-v5 (768 dims, 3GB)
- gte-Qwen2-7B-instruct (3584 dims, 14GB)

**API Providers:**
- OpenAI (text-embedding-3-small/large)
- Cohere (embed-v4)
- Voyage AI (voyage-3-large)
- Jina AI (jina-embeddings-v3)
- Google Gemini (text-embedding-004)

---

### 3. Unified Provider Interface

**File:** `backend/src/services/embedding/types.ts`

**Purpose:** Common interface all providers must implement

```typescript
interface EmbeddingProvider {
  name: string;
  type: 'local' | 'api';
  dimensions: number;
  maxTokens: number;

  // Core methods
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // Metadata
  getInfo(): ProviderInfo;
  estimateCost(tokens: number): number;
  estimateLatency(texts: number): number;
}

interface DetectedModel {
  id: string;
  name: string;
  path: string;
  size: number;
  dimensions: number;
  available: boolean;
  device: 'cpu' | 'mps' | 'cuda';
  estimatedSpeed: number;
}

interface ProviderConfig {
  id: string;
  name: string;
  type: 'local' | 'api';
  modelId?: string;
  dimensions: number;
  available: boolean;
  requiresApiKey: boolean;
  estimatedCost?: string;
}
```

---

### 4. Local Embedding Providers

**File:** `backend/src/services/embedding/providers/localProvider.ts`

**Purpose:** Adapter for local Transformers.js models

**M2 Optimization:**
```typescript
class LocalEmbeddingProvider implements EmbeddingProvider {
  private model: any;
  private device: 'cpu' | 'mps';

  async initialize() {
    // Detect M2 MPS availability
    const hasMPS = await this.detectMPS();
    this.device = hasMPS ? 'mps' : 'cpu';

    // Load model with optimal settings for M2
    this.model = await this.loadModel({
      device: this.device,
      dtype: 'float32',  // MPS doesn't support float16
      batchSize: 64,     // Optimal for 24GB RAM
      numThreads: 8,     // M2 has 8 performance cores
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Use optimal batch size for M2
    const batchSize = 64;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await this.model.encode(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }
}
```

---

### 5. API Embedding Providers

**Files:**
- `backend/src/services/embedding/providers/openaiProvider.ts`
- `backend/src/services/embedding/providers/cohereProvider.ts`
- `backend/src/services/embedding/providers/voyageProvider.ts`
- `backend/src/services/embedding/providers/jinaProvider.ts`

**Purpose:** Adapters for external API providers

**Example (OpenAI):**
```typescript
class OpenAIProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  estimateCost(tokens: number): number {
    // text-embedding-3-small: $0.02 per 1M tokens
    return (tokens / 1_000_000) * 0.02;
  }
}
```

---

### 6. Updated Storage Adapter

**File:** `backend/src/utils/storageAdapter.ts`

**Purpose:** Integrate provider system with existing storage

**Changes:**
```typescript
class StorageAdapter {
  private providerRegistry: ProviderRegistry;
  private currentProvider: EmbeddingProvider;
  private db: Database;
  private vectorStore: ChromaDB;

  async initialize() {
    // 1. Initialize provider system
    this.providerRegistry = new ProviderRegistry();
    await this.providerRegistry.initialize();

    // 2. Load user's preference or use recommended
    const providerId = await this.loadUserPreference() ||
                      this.providerRegistry.getRecommendedProvider().id;

    this.currentProvider = await this.loadProvider(providerId);

    // 3. Initialize storage backends
    this.db = await this.initializeDatabase();
    this.vectorStore = await this.initializeVectorStore();

    console.log(`✅ Using ${this.currentProvider.name}`);
    console.log(`✅ Device: ${this.currentProvider.device || 'N/A'}`);
  }

  async uploadDocument(doc: Document): Promise<void> {
    // 1. Store in SQLite
    await this.db.insertDocument(doc);

    // 2. Generate embedding with current provider
    const embedding = await this.currentProvider.embed(doc.content);

    // 3. Store vector in ChromaDB
    await this.vectorStore.upsert({
      id: doc.id,
      vector: embedding,
      metadata: doc.metadata,
    });
  }

  async searchDocuments(query: string, topK: number = 10): Promise<Document[]> {
    // 1. Generate query embedding
    const queryEmbedding = await this.currentProvider.embed(query);

    // 2. Search ChromaDB
    const results = await this.vectorStore.query(queryEmbedding, topK);

    // 3. Fetch full documents from SQLite
    const documents = await this.db.getDocumentsByIds(
      results.map(r => r.id)
    );

    return documents;
  }

  async switchProvider(providerId: string, apiKey?: string): Promise<void> {
    // Switch to new provider
    this.currentProvider = await this.loadProvider(providerId, apiKey);

    // Save preference
    await this.saveUserPreference(providerId, apiKey);

    console.log(`✅ Switched to ${this.currentProvider.name}`);
  }
}
```

---

### 7. API Endpoints

**File:** `backend/src/routes/embeddings.ts`

**Purpose:** HTTP endpoints for provider management

**Endpoints:**
```typescript
// GET /api/embeddings/providers
// Returns list of available providers
{
  providers: [
    {
      id: 'nomic-embed-text-v1.5',
      name: 'Nomic Embed v1.5',
      type: 'local',
      dimensions: 768,
      available: true,
      requiresApiKey: false,
    },
    {
      id: 'openai-small',
      name: 'OpenAI (text-embedding-3-small)',
      type: 'api',
      dimensions: 1536,
      available: true,
      requiresApiKey: true,
      estimatedCost: '$0.02 per 1M tokens',
    },
  ],
  recommended: 'nomic-embed-text-v1.5',
}

// POST /api/embeddings/scan
// Re-scans for local models
{ success: true }

// POST /api/embeddings/test
// Tests a provider
{
  provider: 'nomic-embed-text-v1.5',
  apiKey: null,
}
→ {
  success: true,
  message: 'Generated 768-dimensional embedding',
  dimensions: 768,
  speed: '5000 embeddings/sec',
  device: 'mps',
}

// POST /api/embeddings/set-provider
// Switches to a different provider
{
  provider: 'openai-small',
  apiKey: 'sk-...',
}
→ { success: true }

// GET /api/embeddings/benchmark
// Benchmarks current provider
→ {
  provider: 'nomic-embed-text-v1.5',
  speed: 5000,
  latency: 200,
  device: 'mps',
}
```

---

### 8. Frontend UI

**File:** `web/src/pages/settings/embeddings.tsx`

**Purpose:** User interface for provider selection

**Features:**
- Show detected local models
- Show API providers
- Allow provider selection
- Test connection button
- Benchmark tool
- System information display

**UI Mockup:**
```
┌─────────────────────────────────────────────┐
│ Embedding Provider Settings                 │
├─────────────────────────────────────────────┤
│                                              │
│ [Scan for Local Models]                     │
│                                              │
│ Local Models (3 found)                      │
│ ○ MiniLM (384 dims) - 20,000/sec           │
│ ○ MPNet (768 dims) - 10,000/sec            │
│ ◉ Nomic v1.5 (768 dims) - 5,000/sec        │
│   [Recommended for your Mac] ✅             │
│                                              │
│ API Providers (Requires API Key)            │
│ ○ OpenAI ($0.02/1M tokens)                  │
│ ○ Cohere ($0.12/1M tokens)                  │
│ ○ Jina AI (Free tier)                       │
│                                              │
│ [Test Connection] [Benchmark]               │
│                                              │
│ System Information                           │
│ Device: MacBook Pro M2                      │
│ Memory: 24 GB                                │
│ Acceleration: ✅ MPS available              │
│                                              │
│ [Save Settings]                              │
└─────────────────────────────────────────────┘
```

---

### 9. Configuration Files

**File:** `.gkchatty/embedding-config.yml`

```yaml
# Primary provider
primary:
  type: local
  model: nomic-embed-text-v1.5
  device: mps
  batch_size: 64
  dimensions: 768

# Fallback chain
fallbacks:
  - type: local
    model: all-mpnet-base-v2
    device: mps

  - type: api
    provider: cohere
    api_key: ${COHERE_API_KEY}
    model: embed-v4

# Auto-detection rules for M2
auto_select:
  enable: true
  hardware:
    chip: M2
    memory_gb: 24
    has_mps: true
  recommended_model: nomic-embed-text-v1.5

# Performance tuning
performance:
  cache_embeddings: true
  cache_ttl: 86400
  parallel_requests: 4
  timeout: 30000
```

---

## Implementation Steps

### Step 1: Model Detection System

**Tasks:**
1. Create `modelDetector.ts` with:
   - `scanForModels()` - Search HuggingFace cache and custom dirs
   - `detectBestDevice()` - Check for MPS/CUDA availability
   - `benchmarkModel()` - Test speed on actual hardware
   - `hasMPS()` - Detect Apple Silicon MPS

2. Test on M2 Mac:
   ```bash
   npm run scan-models
   # Should find any existing HuggingFace models
   ```

**Acceptance Criteria:**
- ✅ Detects models in `~/.cache/huggingface/hub/`
- ✅ Detects MPS availability on M2
- ✅ Returns list of available models with metadata
- ✅ Can benchmark model speed

---

### Step 2: Provider Registry

**Tasks:**
1. Create `providerRegistry.ts` with:
   - `initialize()` - Scan models + register providers
   - `getAvailableProviders()` - Return all providers
   - `getRecommendedProvider()` - Choose best for hardware

2. Register local models:
   - MiniLM, MPNet, Nomic, BGE, stella, gte-Qwen2

3. Register API providers:
   - OpenAI, Cohere, Voyage, Jina, Gemini

**Acceptance Criteria:**
- ✅ Returns list of all available providers
- ✅ Recommends Nomic v1.5 for M2 Mac with 24GB RAM
- ✅ Marks which models are installed vs available

---

### Step 3: Provider Interface & Implementations

**Tasks:**
1. Create `types.ts` with `EmbeddingProvider` interface

2. Create `localProvider.ts`:
   - Implements Transformers.js embedding
   - Detects and uses MPS acceleration
   - Optimizes batch size for 24GB RAM

3. Create API providers:
   - `openaiProvider.ts` - OpenAI client
   - `cohereProvider.ts` - Cohere client
   - `voyageProvider.ts` - Voyage client
   - `jinaProvider.ts` - Jina client

**Acceptance Criteria:**
- ✅ All providers implement `EmbeddingProvider` interface
- ✅ Local provider uses MPS on M2
- ✅ API providers handle rate limiting
- ✅ Error handling for missing API keys

---

### Step 4: Storage Adapter Integration

**Tasks:**
1. Update `storageAdapter.ts`:
   - Add `providerRegistry` initialization
   - Add `currentProvider` management
   - Replace hardcoded embedding calls with `currentProvider.embed()`
   - Add `switchProvider()` method

2. Update `sqliteHelper.ts`:
   - Already exists, verify compatibility

3. Update `chromaService.ts`:
   - Already exists, verify compatibility

**Acceptance Criteria:**
- ✅ Storage adapter uses provider system
- ✅ Can switch providers without breaking storage
- ✅ Embeddings stored correctly in ChromaDB
- ✅ Search works with any provider

---

### Step 5: API Endpoints

**Tasks:**
1. Create `routes/embeddings.ts` with:
   - `GET /api/embeddings/providers`
   - `POST /api/embeddings/scan`
   - `POST /api/embeddings/test`
   - `POST /api/embeddings/set-provider`
   - `GET /api/embeddings/benchmark`

2. Add authentication middleware
3. Add error handling

**Acceptance Criteria:**
- ✅ All endpoints return correct data
- ✅ Test endpoint validates provider works
- ✅ Benchmark endpoint measures speed
- ✅ Errors are handled gracefully

---

### Step 6: Frontend UI

**Tasks:**
1. Create `web/src/pages/settings/embeddings.tsx`:
   - Provider list with radio buttons
   - Scan button to re-detect models
   - Test connection button
   - API key input for API providers
   - System information display

2. Add to settings navigation

3. Style with TailwindCSS

**Acceptance Criteria:**
- ✅ UI shows detected models
- ✅ User can select provider
- ✅ Test button validates provider works
- ✅ Saves preference to backend
- ✅ Shows system info (M2, MPS available)

---

### Step 7: Configuration System

**Tasks:**
1. Create `~/.gkchatty/embedding-config.yml` schema
2. Add config loader to backend
3. Support environment variable overrides
4. Add validation

**Acceptance Criteria:**
- ✅ Config file is read on startup
- ✅ Defaults to recommended provider for hardware
- ✅ Environment variables override config
- ✅ Invalid config shows helpful error

---

### Step 8: Testing & Optimization

**Tasks:**
1. Unit tests for each component
2. Integration tests for full flow
3. M2-specific performance tests
4. API provider tests (with test keys)

**Acceptance Criteria:**
- ✅ All tests pass
- ✅ Nomic v1.5 with MPS achieves 4000+ emb/sec on M2
- ✅ Memory usage stays under 4GB
- ✅ Can switch providers without data loss

---

## M2 Optimization Checklist

**Hardware Detection:**
- [ ] Detect Apple Silicon (M2)
- [ ] Detect available memory (24GB)
- [ ] Enable MPS (Metal Performance Shaders)
- [ ] Set optimal batch size (64 for 24GB)

**Performance Tuning:**
- [ ] Use float32 (MPS doesn't support float16)
- [ ] Set num_threads = 8 (M2 performance cores)
- [ ] Enable batch processing
- [ ] Cache embeddings

**Expected Performance on M2:**
- Nomic v1.5: 4,000-6,000 embeddings/sec with MPS
- MPNet: 8,000-12,000 embeddings/sec with MPS
- MiniLM: 15,000-25,000 embeddings/sec with MPS

---

## Testing Plan

### Unit Tests

```typescript
// Test model detection
describe('ModelDetector', () => {
  it('should detect MPS on M2', async () => {
    const detector = new ModelDetector();
    const device = await detector.detectBestDevice();
    expect(device).toBe('mps');
  });

  it('should find HuggingFace models', async () => {
    const detector = new ModelDetector();
    const models = await detector.scanForModels();
    expect(models.length).toBeGreaterThan(0);
  });
});

// Test provider registry
describe('ProviderRegistry', () => {
  it('should recommend Nomic v1.5 for M2', async () => {
    const registry = new ProviderRegistry();
    await registry.initialize();
    const recommended = registry.getRecommendedProvider();
    expect(recommended.id).toBe('nomic-embed-text-v1.5');
  });
});

// Test embedding generation
describe('LocalProvider', () => {
  it('should generate embeddings with MPS', async () => {
    const provider = new LocalProvider('nomic-embed-text-v1.5');
    await provider.initialize();
    const embedding = await provider.embed('test');
    expect(embedding.length).toBe(768);
    expect(provider.device).toBe('mps');
  });
});
```

### Integration Tests

```typescript
// Test full flow
describe('Storage Adapter with Providers', () => {
  it('should upload and search documents', async () => {
    const storage = new StorageAdapter();
    await storage.initialize();

    // Upload document
    await storage.uploadDocument({
      id: 'test-1',
      content: 'Test document about TypeScript',
    });

    // Search for it
    const results = await storage.searchDocuments('TypeScript');
    expect(results[0].id).toBe('test-1');
  });

  it('should switch providers', async () => {
    const storage = new StorageAdapter();
    await storage.initialize();

    const before = storage.currentProvider.name;
    await storage.switchProvider('all-mpnet-base-v2');
    const after = storage.currentProvider.name;

    expect(before).not.toBe(after);
  });
});
```

### Performance Benchmarks

```bash
# Benchmark script
npm run benchmark:m2

Expected output:
┌──────────────────────┬────────┬──────────┬─────────┐
│ Model                │ Device │ Speed    │ Memory  │
├──────────────────────┼────────┼──────────┼─────────┤
│ nomic-embed-text-v1.5│ MPS    │ 5000/sec │ 2GB     │
│ all-mpnet-base-v2    │ MPS    │ 10000/sec│ 500MB   │
│ all-MiniLM-L6-v2     │ MPS    │ 20000/sec│ 200MB   │
└──────────────────────┴────────┴──────────┴─────────┘

✅ All models using MPS acceleration
✅ Memory usage within limits
```

---

## Success Criteria

### Functional Requirements
- ✅ Auto-detects available local models on M2 Mac
- ✅ User can select from detected models
- ✅ Supports API providers with user-supplied keys
- ✅ Uses MPS acceleration on M2
- ✅ Stores embeddings in ChromaDB
- ✅ Search returns relevant results

### Performance Requirements
- ✅ Nomic v1.5: 4,000+ embeddings/sec (MPS)
- ✅ Memory usage: < 4GB per model
- ✅ Latency: < 1ms per embedding (batch mode)
- ✅ Search: < 100ms for 10K documents

### Quality Requirements
- ✅ All tests pass
- ✅ Zero TypeScript errors
- ✅ Code follows existing patterns
- ✅ Documented with JSDoc
- ✅ Error handling comprehensive

---

## Dependencies to Install

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "chromadb": "^1.8.0",
    "@xenova/transformers": "^2.14.0",
    "openai": "^4.20.0",
    "cohere-ai": "^7.7.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "jest": "^29.7.0",
    "typescript": "^5.3.0"
  }
}
```

**Python dependencies** (for local models):
```bash
pip3 install torch torchvision torchaudio
pip3 install sentence-transformers
pip3 install transformers
```

---

## File Structure

```
gkchatty-local/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   └── embedding/
│   │   │       ├── modelDetector.ts          # NEW
│   │   │       ├── providerRegistry.ts       # NEW
│   │   │       ├── types.ts                  # NEW
│   │   │       └── providers/
│   │   │           ├── localProvider.ts      # NEW
│   │   │           ├── openaiProvider.ts     # NEW
│   │   │           ├── cohereProvider.ts     # NEW
│   │   │           ├── voyageProvider.ts     # NEW
│   │   │           └── jinaProvider.ts       # NEW
│   │   ├── routes/
│   │   │   └── embeddings.ts                 # NEW
│   │   └── utils/
│   │       ├── storageAdapter.ts             # MODIFY
│   │       └── local/
│   │           ├── sqliteHelper.ts           # EXISTS
│   │           ├── chromaService.ts          # EXISTS
│   │           └── embeddingService.ts       # EXISTS
│   └── package.json                          # UPDATE
├── web/
│   └── src/
│       └── pages/
│           └── settings/
│               └── embeddings.tsx            # NEW
├── .gkchatty/
│   └── embedding-config.yml                  # NEW
├── scripts/
│   ├── download_model.py                     # NEW
│   └── benchmark_m2.py                       # NEW
└── tests/
    ├── modelDetector.test.ts                 # NEW
    ├── providerRegistry.test.ts              # NEW
    └── storageAdapter.test.ts                # UPDATE
```

---

## BMAD Builder Pro Execution

**Upload to GKChatty:**
```bash
# Upload this plan and related docs
gkchatty upload GKCHATTY-LOCAL-BUILD-PLAN.md
gkchatty upload EMBEDDING-MODELS-RESEARCH-2025.md
```

**Execute BMAD:**
```bash
/bmad-pro-build "Implement GKChatty Local with pluggable embedding architecture, auto-detection of local models, API provider support, and M2 optimization as specified in GKCHATTY-LOCAL-BUILD-PLAN.md. Use nomic-embed-text-v1.5 as the recommended model for MacBook Pro M2 with 24GB RAM."
```

**BMAD will:**
1. Read this plan from GKChatty (via RAG queries)
2. Break down into steps
3. Query GKChatty for specific implementation details per step
4. Build each component systematically
5. Test on M2 Mac
6. Validate MPS acceleration works

**Expected build time:** 2-4 hours
**Expected token usage:** ~100K tokens (vs 1.2M without RAG)
**Token savings:** ~92%

---

## Post-Build Validation

After BMAD completes:

1. **Verify model detection:**
   ```bash
   npm run scan-models
   # Should find local models
   ```

2. **Test embedding generation:**
   ```bash
   npm run test:embedding
   # Should use MPS acceleration
   ```

3. **Benchmark performance:**
   ```bash
   npm run benchmark:m2
   # Should show 4000+ emb/sec for Nomic v1.5
   ```

4. **Test full flow:**
   ```bash
   npm run test:integration
   # Upload, search, switch providers
   ```

5. **Launch frontend:**
   ```bash
   npm run dev
   # Visit http://localhost:4003/settings/embeddings
   # Verify UI shows detected models
   ```

---

**Status:** Ready for BMAD Builder Pro execution ✅
**Confidence:** HIGH - Plan is comprehensive and optimized for M2 Mac
**Expected Outcome:** Fully functional GKChatty Local with flexible embedding system

Let's build it! 🚀
