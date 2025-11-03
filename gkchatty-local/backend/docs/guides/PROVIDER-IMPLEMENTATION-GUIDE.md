# Provider Implementation Guide

**GKChatty Local - Pluggable Embedding Architecture**

This guide explains how to implement new embedding providers for GKChatty Local. Follow this guide to add support for providers like Cohere, Voyage AI, Jina AI, Google Gemini, or custom local models.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Provider Interface](#provider-interface)
3. [Implementation Steps](#implementation-steps)
4. [Error Handling](#error-handling)
5. [Testing Your Provider](#testing-your-provider)
6. [Registration & Usage](#registration--usage)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

---

## Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────┐
│         ProviderRegistry (Singleton)            │
│  - Manages all providers                        │
│  - Health checks (5-min intervals)              │
│  - Statistics tracking                          │
│  - Circuit breakers                             │
└─────────────────────────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │   EmbeddingProvider         │
        │   (Interface)               │
        │  - embed(text)              │
        │  - embedBatch(texts)        │
        │  - getInfo()                │
        │  - initialize()             │
        │  - cleanup()                │
        └─────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │  Your Custom Provider       │
        │  (Implementation)           │
        └─────────────────────────────┘
```

### Key Features

- **Unified Interface**: All providers implement the same `EmbeddingProvider` interface
- **Error Handling**: Built-in retry logic, circuit breakers, and error normalization
- **Resource Monitoring**: Automatic disk space and memory validation
- **Statistics Tracking**: Tokens, cost, latency, errors tracked automatically
- **Fallback Support**: Automatic failover to backup providers
- **Health Monitoring**: Periodic health checks with circuit breaker integration

---

## Provider Interface

### TypeScript Definition

```typescript
/**
 * Core interface that all embedding providers must implement
 */
export interface EmbeddingProvider {
  /**
   * Initialize the provider (connect to API, load model, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @returns Embedding vector (array of numbers)
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (optional but recommended)
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  embedBatch?(texts: string[]): Promise<number[][]>;

  /**
   * Get provider metadata
   */
  getInfo(): ProviderInfo;

  /**
   * Cleanup resources (close connections, free memory)
   */
  cleanup?(): Promise<void>;
}

/**
 * Provider metadata
 */
export interface ProviderInfo {
  id: string;                    // Unique identifier (e.g., "openai-text-embedding-3-small")
  name: string;                  // Human-readable name
  type: 'local' | 'api';         // Provider type
  dimensions: number;            // Embedding dimensions (384, 768, 1536, etc.)
  maxTokens?: number;            // Max tokens per request
  batchSize?: number;            // Max batch size
  requiresApiKey: boolean;       // Does this provider need an API key?
  estimatedCost?: string;        // Cost estimate (e.g., "$0.020 per million tokens")
  modelPath?: string;            // Path to local model (for local providers)
}
```

---

## Implementation Steps

### Step 1: Create Provider File

Create a new file in `backend/src/services/embedding/providers/`:

```bash
touch backend/src/services/embedding/providers/YourProvider.ts
```

### Step 2: Implement the Interface

```typescript
/**
 * Example: Cohere Embedding Provider
 */

import axios from 'axios';
import type { EmbeddingProvider, ProviderInfo } from '../types';
import {
  NetworkError,
  RateLimitError,
  AuthenticationError,
  normalizeError
} from '../errors';

export interface CohereConfig {
  apiKey: string;
  model?: 'embed-english-v3.0' | 'embed-multilingual-v3.0';
  inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
}

export class CohereProvider implements EmbeddingProvider {
  private config: Required<CohereConfig>;
  private baseUrl = 'https://api.cohere.ai/v1';

  constructor(config: CohereConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'embed-english-v3.0',
      inputType: config.inputType || 'search_document',
    };
  }

  async initialize(): Promise<void> {
    // Validate API key
    if (!this.config.apiKey) {
      throw new AuthenticationError('cohere', { reason: 'API key is required' });
    }

    // Optional: Test connection
    try {
      await this.embed('test');
      console.log('[CohereProvider] Initialized successfully');
    } catch (error) {
      const normalized = normalizeError(error, 'cohere');
      console.error('[CohereProvider] Initialization failed:', normalized.message);
      throw normalized;
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/embed`,
        {
          texts: [text],
          model: this.config.model,
          input_type: this.config.inputType,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      // Cohere returns { embeddings: [[...]], meta: {...} }
      return response.data.embeddings[0];
    } catch (error: any) {
      // Normalize common errors
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        throw new RateLimitError('cohere', retryAfter ? parseInt(retryAfter) : undefined);
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new AuthenticationError('cohere', { status: error.response.status });
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new NetworkError(`Cohere API connection failed: ${error.message}`);
      }

      // Let normalizeError handle other cases
      throw normalizeError(error, 'cohere');
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/embed`,
        {
          texts,
          model: this.config.model,
          input_type: this.config.inputType,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60 second timeout for batch
        }
      );

      return response.data.embeddings;
    } catch (error) {
      throw normalizeError(error, 'cohere');
    }
  }

  getInfo(): ProviderInfo {
    return {
      id: `cohere-${this.config.model}`,
      name: `Cohere ${this.config.model}`,
      type: 'api',
      dimensions: this.config.model === 'embed-english-v3.0' ? 1024 : 1024,
      maxTokens: 2048,
      batchSize: 96, // Cohere supports up to 96 texts per request
      requiresApiKey: true,
      estimatedCost: '$0.100 per million tokens',
    };
  }

  async cleanup(): Promise<void> {
    // Cohere uses HTTP requests, no persistent connections to close
    console.log('[CohereProvider] Cleanup complete');
  }
}
```

### Step 3: Export Provider

Add to `backend/src/services/embedding/providers/index.ts`:

```typescript
export * from './CohereProvider';
```

---

## Error Handling

### Built-in Error Types

Use these error classes from `errors.ts`:

```typescript
import {
  NetworkError,           // Connection failures, timeouts
  RateLimitError,        // API rate limits (429)
  AuthenticationError,   // Auth failures (401, 403)
  TimeoutError,          // Request timeouts
  ModelNotFoundError,    // Model not available
  ProviderError,         // Generic provider error
  normalizeError,        // Convert any error to EmbeddingError
} from '../errors';
```

### Error Handling Pattern

```typescript
async embed(text: string): Promise<number[]> {
  try {
    // Your embedding logic here
    const result = await someApiCall(text);
    return result;
  } catch (error: any) {
    // Handle specific HTTP status codes
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      throw new RateLimitError('your-provider', retryAfter ? parseInt(retryAfter) : undefined);
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new AuthenticationError('your-provider');
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new NetworkError(`Connection failed: ${error.message}`);
    }

    // Let normalizeError handle everything else
    throw normalizeError(error, 'your-provider');
  }
}
```

### Why Use Custom Errors?

1. **Automatic Retry**: `NetworkError` and `TimeoutError` are retryable
2. **Circuit Breaker**: Errors update circuit breaker state automatically
3. **Statistics**: Errors are tracked in provider statistics
4. **Fallback**: Non-recoverable errors trigger fallback to next provider
5. **Debugging**: Errors include context for easier troubleshooting

---

## Testing Your Provider

### Unit Tests

Create `backend/src/services/embedding/providers/__tests__/YourProvider.test.ts`:

```typescript
import { CohereProvider } from '../CohereProvider';
import { AuthenticationError, NetworkError } from '../../errors';

describe('CohereProvider', () => {
  let provider: CohereProvider;

  beforeEach(() => {
    provider = new CohereProvider({
      apiKey: process.env.COHERE_API_KEY || 'test-key',
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid API key', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should throw AuthenticationError without API key', async () => {
      const invalidProvider = new CohereProvider({ apiKey: '' });
      await expect(invalidProvider.initialize()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Embedding', () => {
    it('should generate embedding for single text', async () => {
      const embedding = await provider.embed('test text');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1024); // Cohere v3 dimensions
      expect(typeof embedding[0]).toBe('number');
    });

    it('should generate embeddings for batch', async () => {
      const embeddings = await provider.embedBatch(['test 1', 'test 2', 'test 3']);

      expect(embeddings.length).toBe(3);
      embeddings.forEach(emb => {
        expect(emb.length).toBe(1024);
      });
    });
  });

  describe('Provider Info', () => {
    it('should return correct metadata', () => {
      const info = provider.getInfo();

      expect(info.id).toBe('cohere-embed-english-v3.0');
      expect(info.type).toBe('api');
      expect(info.dimensions).toBe(1024);
      expect(info.requiresApiKey).toBe(true);
    });
  });
});
```

### Integration Tests

Test with actual API (optional, requires API key):

```bash
# Set API key
export COHERE_API_KEY="your-key-here"

# Run tests
npm test -- CohereProvider.test.ts
```

### Manual Testing

Create `test-cohere.js`:

```javascript
const { CohereProvider } = require('./dist/services/embedding/providers/CohereProvider');

async function testCohere() {
  const provider = new CohereProvider({
    apiKey: process.env.COHERE_API_KEY,
  });

  await provider.initialize();
  console.log('✅ Provider initialized');

  const embedding = await provider.embed('Hello, world!');
  console.log(`✅ Embedding generated: ${embedding.length} dimensions`);

  const info = provider.getInfo();
  console.log('✅ Provider info:', info);
}

testCohere().catch(console.error);
```

---

## Registration & Usage

### Register Your Provider

In `backend/src/index.ts` or during runtime:

```typescript
import { getProviderRegistry } from './services/embedding/ProviderRegistry';
import { CohereProvider } from './services/embedding/providers/CohereProvider';

// At startup
const registry = getProviderRegistry();

// Register Cohere provider if API key is available
if (process.env.COHERE_API_KEY) {
  const cohereProvider = new CohereProvider({
    apiKey: process.env.COHERE_API_KEY,
    model: 'embed-english-v3.0',
  });

  await registry.registerProvider(cohereProvider);
  console.log('✅ Cohere provider registered');
}
```

### Use Your Provider

```typescript
// Switch to your provider
await registry.setActiveProvider('cohere-embed-english-v3.0');

// Generate embeddings
const activeProvider = registry.getActiveProvider();
const embedding = await activeProvider.embed('Your text here');
```

### Add to API Routes

In `backend/src/routes/embeddingsRoutes.ts`, add provider detection:

```typescript
// In /api/embeddings/scan endpoint
if (process.env.COHERE_API_KEY) {
  detected.apiProviders.push('cohere');
}

// In /api/embeddings/set-provider endpoint
if (providerId.startsWith('cohere-')) {
  const model = providerId.replace('cohere-', '') as 'embed-english-v3.0' | 'embed-multilingual-v3.0';
  const provider = new CohereProvider({
    apiKey: apiKey || process.env.COHERE_API_KEY!,
    model,
  });
  await registry.registerProvider(provider);
}
```

---

## Best Practices

### 1. **Error Handling**

✅ **DO**:
- Use custom error classes (`NetworkError`, `RateLimitError`, etc.)
- Include context in errors
- Use `normalizeError()` for unknown errors
- Handle rate limits with `retry-after` header

❌ **DON'T**:
- Throw generic `Error` objects
- Swallow errors silently
- Ignore rate limit headers

### 2. **Resource Management**

✅ **DO**:
- Implement `cleanup()` for persistent connections
- Close HTTP clients in cleanup
- Free model memory for local providers
- Use timeouts for all requests

❌ **DON'T**:
- Leave connections open
- Hold onto large model objects
- Block indefinitely on requests

### 3. **Performance**

✅ **DO**:
- Implement `embedBatch()` for better throughput
- Use connection pooling for HTTP clients
- Cache model metadata
- Set reasonable timeouts (30s single, 60s batch)

❌ **DON'T**:
- Call `embed()` in a loop (use `embedBatch()`)
- Create new HTTP clients per request
- Make unnecessary API calls

### 4. **Configuration**

✅ **DO**:
- Use environment variables for API keys
- Provide sensible defaults
- Validate configuration in `initialize()`
- Document all config options

❌ **DON'T**:
- Hardcode API keys
- Require config that can be auto-detected
- Skip validation

### 5. **Metadata**

✅ **DO**:
- Return accurate dimensions
- Include cost estimates
- Document max tokens and batch size
- Use descriptive IDs (e.g., `cohere-embed-english-v3.0`)

❌ **DON'T**:
- Guess dimensions
- Omit cost information
- Use ambiguous IDs (e.g., `provider1`)

---

## Examples

### Example 1: API Provider (Voyage AI)

```typescript
import axios from 'axios';
import type { EmbeddingProvider, ProviderInfo } from '../types';
import { normalizeError, AuthenticationError } from '../errors';

export class VoyageProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'voyage-02';
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AuthenticationError('voyage', { reason: 'API key required' });
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        'https://api.voyageai.com/v1/embeddings',
        { input: [text], model: this.model },
        { headers: { 'Authorization': `Bearer ${this.apiKey}` }, timeout: 30000 }
      );
      return response.data.data[0].embedding;
    } catch (error) {
      throw normalizeError(error, 'voyage');
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await axios.post(
        'https://api.voyageai.com/v1/embeddings',
        { input: texts, model: this.model },
        { headers: { 'Authorization': `Bearer ${this.apiKey}` }, timeout: 60000 }
      );
      return response.data.data.map((item: any) => item.embedding);
    } catch (error) {
      throw normalizeError(error, 'voyage');
    }
  }

  getInfo(): ProviderInfo {
    return {
      id: `voyage-${this.model}`,
      name: `Voyage AI ${this.model}`,
      type: 'api',
      dimensions: 1024,
      batchSize: 128,
      requiresApiKey: true,
      estimatedCost: '$0.012 per million tokens',
    };
  }
}
```

### Example 2: Local Provider (HuggingFace Transformers)

```typescript
import type { EmbeddingProvider, ProviderInfo } from '../types';
import { ModelNotFoundError, MemoryError } from '../errors';
import { checkResources } from '../resourceMonitor';

export class HuggingFaceProvider implements EmbeddingProvider {
  private modelId: string;
  private model: any; // HuggingFace model instance
  private tokenizer: any;

  constructor(config: { modelId: string; modelPath?: string }) {
    this.modelId = config.modelId;
  }

  async initialize(): Promise<void> {
    // Check system resources
    const status = checkResources();
    if (status.memory.status === 'critical') {
      throw new MemoryError(512, status.memory.freeMB);
    }

    try {
      // Load model (pseudo-code - actual implementation depends on library)
      const { AutoModel, AutoTokenizer } = require('@xenova/transformers');

      this.model = await AutoModel.from_pretrained(this.modelId);
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);

      console.log(`[HuggingFaceProvider] Loaded model: ${this.modelId}`);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        throw new ModelNotFoundError(this.modelId);
      }
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    const tokens = await this.tokenizer(text, { return_tensors: 'pt' });
    const output = await this.model(tokens);

    // Mean pooling (example - depends on model)
    const embedding = output.last_hidden_state.mean(1).squeeze().tolist();
    return embedding;
  }

  getInfo(): ProviderInfo {
    return {
      id: `huggingface-${this.modelId}`,
      name: `HuggingFace ${this.modelId}`,
      type: 'local',
      dimensions: 384, // Model-specific
      requiresApiKey: false,
      estimatedCost: '$0 (local)',
      modelPath: `~/.cache/huggingface/hub/${this.modelId}`,
    };
  }

  async cleanup(): Promise<void> {
    // Free model memory
    this.model = null;
    this.tokenizer = null;
    if (global.gc) global.gc(); // Force garbage collection if available
  }
}
```

---

## Checklist

Before submitting your provider:

- [ ] Implements all required methods (`initialize`, `embed`, `getInfo`)
- [ ] Implements `embedBatch` for better performance
- [ ] Implements `cleanup` if using persistent resources
- [ ] Uses custom error classes for common failure modes
- [ ] Includes unit tests with >80% coverage
- [ ] Handles API rate limits with `RateLimitError`
- [ ] Handles authentication failures with `AuthenticationError`
- [ ] Validates configuration in `initialize()`
- [ ] Returns accurate metadata in `getInfo()`
- [ ] Includes cost estimates in metadata
- [ ] Documented in API routes (`embeddingsRoutes.ts`)
- [ ] Added to provider auto-detection (`/api/embeddings/scan`)
- [ ] Tested on production hardware (M2 Mac, Windows, Linux)

---

## Support

**Questions?** Check these resources:

- Architecture: `backend/src/services/embedding/types.ts`
- Error handling: `backend/src/services/embedding/errors.ts`
- Existing providers: `backend/src/services/embedding/providers/`
- API routes: `backend/src/routes/embeddingsRoutes.ts`

**Issues?** Common problems:

1. **"Provider not found"** - Did you register it in the registry?
2. **"Authentication failed"** - Check API key environment variable
3. **"Insufficient memory"** - Resource monitor detected low memory
4. **"Circuit breaker open"** - Too many failures, wait for reset timeout

---

*GKChatty Local - Provider Implementation Guide v1.0*
*Last Updated: November 3, 2025*
