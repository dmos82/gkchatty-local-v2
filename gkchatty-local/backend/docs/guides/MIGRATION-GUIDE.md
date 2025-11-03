# Migration Guide

**GKChatty Local - Cloud ↔ Local Data Migration**

This guide explains how to migrate your GKChatty data between cloud and local storage, switch embedding providers, and ensure zero downtime during transitions.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Cloud to Local Migration](#cloud-to-local-migration)
4. [Local to Cloud Migration](#local-to-cloud-migration)
5. [Provider Switching](#provider-switching)
6. [Re-embedding Strategy](#re-embedding-strategy)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

### Migration Scenarios

| Scenario | Duration | Complexity | Zero Downtime? |
|----------|----------|------------|----------------|
| Cloud → Local (Same Dimensions) | 1-2 hours | Low | ✅ Yes |
| Cloud → Local (Different Dimensions) | 3-6 hours | Medium | ⚠️ Partial |
| Local → Cloud | 1-2 hours | Low | ✅ Yes |
| Provider Switch (Same Dimensions) | 15 minutes | Very Low | ✅ Yes |
| Provider Switch (Different Dimensions) | 3-6 hours | Medium | ⚠️ Partial |

### Key Considerations

1. **Embedding Dimensions**: Switching providers with different dimensions requires re-embedding
2. **API Costs**: Re-embedding via API providers can incur significant costs
3. **Hardware Requirements**: Local providers require sufficient RAM/GPU
4. **Data Volume**: Large document collections take longer to re-embed
5. **Search Accuracy**: Different embedding models may affect search quality

---

## Prerequisites

### System Requirements

**For Local Providers:**
- **Minimum**: 8GB RAM, 10GB disk space
- **Recommended**: 16GB+ RAM (24GB for M2 Mac), 50GB+ disk space
- **Optimal**: M1/M2/M3 Mac with MPS, or NVIDIA GPU with CUDA

**For Cloud Providers:**
- Active API key (OpenAI, Cohere, etc.)
- Stable internet connection
- Budget for re-embedding costs

### Backup Requirements

```bash
# Minimum required backups
✅ Documents database (SQLite/PostgreSQL)
✅ Embeddings directory (./data/embeddings/)
✅ Configuration files (.env, provider settings)

# Recommended backups
✅ Full application directory
✅ Environment variables
✅ User data
```

### Pre-Migration Checklist

- [ ] Current storage mode documented (`local` or `cloud`)
- [ ] Current provider documented (ID, dimensions, model)
- [ ] Data volume calculated (number of documents, total size)
- [ ] Target provider selected and tested
- [ ] System resources validated (disk space, memory)
- [ ] Backup created and verified
- [ ] Maintenance window scheduled (if zero downtime not required)

---

## Cloud to Local Migration

**Goal**: Move from API-based embeddings (OpenAI, Cohere) to local embeddings (Ollama, HuggingFace) to reduce costs and improve latency.

### Step 1: Backup Current Data

```bash
# 1. Stop the application
pm2 stop gkchatty-backend

# 2. Backup documents database
cp ./data/gkchatty.db ./backups/gkchatty-$(date +%Y%m%d).db

# 3. Backup embeddings directory
tar -czf ./backups/embeddings-$(date +%Y%m%d).tar.gz ./data/embeddings/

# 4. Backup environment config
cp .env ./backups/.env-$(date +%Y%m%d)

# 5. Verify backups
ls -lh ./backups/
```

### Step 2: Install Local Provider

#### Option A: Ollama (Recommended for M2 Mac)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama server
ollama serve

# Pull nomic-embed-text model (768 dimensions)
ollama pull nomic-embed-text

# Verify installation
curl http://localhost:11434/api/tags
```

#### Option B: HuggingFace Transformers

```bash
# Install transformers library
pip install transformers torch

# Download model (example: all-MiniLM-L6-v2)
python -c "from transformers import AutoModel; AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')"
```

### Step 3: Update Configuration

```bash
# Edit .env file
vim .env
```

```env
# Change storage mode
GKCHATTY_STORAGE=local

# Remove cloud provider API key (optional)
# OPENAI_API_KEY=sk-...

# Set embedding model (for Ollama)
EMBEDDING_MODEL=nomic-embed-text-v1.5

# Set port (if changed)
PORT=6001
```

### Step 4: Check Embedding Dimensions

```bash
# Check current embeddings
node -e "
const fs = require('fs');
const files = fs.readdirSync('./data/embeddings/');
const sample = JSON.parse(fs.readFileSync(\`./data/embeddings/\${files[0]}\`));
console.log('Current dimensions:', sample.embedding.length);
"
```

**Decision Point:**

- **Same dimensions** (e.g., OpenAI 768 → Ollama 768): No re-embedding needed ✅
- **Different dimensions** (e.g., OpenAI 1536 → Ollama 768): Re-embedding required ⚠️

### Step 5A: No Re-embedding Required (Same Dimensions)

```bash
# 1. Start application with new provider
npm run dev

# 2. Test embedding generation
curl -X POST http://localhost:6001/api/embeddings/scan \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Switch to local provider
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "ollama-nomic-embed-text"}'

# 4. Verify search still works
# (Search should work immediately with existing embeddings)
```

### Step 5B: Re-embedding Required (Different Dimensions)

**⚠️ Warning**: This process may take hours for large datasets and will affect search during re-embedding.

```bash
# 1. Start application
npm run dev

# 2. Register new provider
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "ollama-nomic-embed-text"}'

# 3. Run re-embedding script (create this script)
node scripts/re-embed-all.js
```

**Re-embedding Script** (`scripts/re-embed-all.js`):

```javascript
const { getProviderRegistry } = require('../dist/services/embedding/ProviderRegistry');
const storageAdapter = require('../dist/utils/storageAdapter').default;
const fs = require('fs');
const path = require('path');

async function reEmbedAll() {
  const registry = getProviderRegistry();
  const provider = registry.getActiveProvider();

  console.log('Starting re-embedding with:', provider.getInfo().name);

  // Get all documents (your implementation here)
  const documents = await storageAdapter.getAllDocuments();

  console.log(`Found ${documents.length} documents to re-embed`);

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    try {
      // Generate new embedding
      const newEmbedding = await provider.embed(doc.content);

      // Save new embedding
      await storageAdapter.saveEmbedding(doc.id, newEmbedding);

      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${documents.length} (${Math.round((i + 1) / documents.length * 100)}%)`);
      }
    } catch (error) {
      console.error(`Failed to re-embed document ${doc.id}:`, error.message);
    }
  }

  console.log('✅ Re-embedding complete!');
}

reEmbedAll().catch(console.error);
```

### Step 6: Verify Migration

```bash
# 1. Check provider status
curl http://localhost:6001/api/embeddings/info \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected output:
# {
#   "success": true,
#   "storageMode": "local",
#   "activeProvider": "ollama-nomic-embed-text",
#   "providerInfo": {
#     "type": "local",
#     "dimensions": 768,
#     "estimatedCost": "$0 (local)"
#   }
# }

# 2. Test search functionality
curl http://localhost:6001/api/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "test search"}'

# 3. Run benchmark
curl http://localhost:6001/api/embeddings/benchmark?samples=10 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 7: Monitor Performance

```bash
# Monitor system resources
watch -n 5 'free -h && df -h'

# Monitor application logs
tail -f logs/gkchatty-backend.log

# Check provider statistics
curl http://localhost:6001/api/embeddings/info \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.providerInfo.stats'
```

---

## Local to Cloud Migration

**Goal**: Move from local embeddings to cloud API (for better accuracy, multi-language support, or resource constraints).

### Step 1: Backup Current Data

```bash
# Same as Cloud → Local Step 1
cp ./data/gkchatty.db ./backups/gkchatty-$(date +%Y%m%d).db
tar -czf ./backups/embeddings-$(date +%Y%m%d).tar.gz ./data/embeddings/
```

### Step 2: Get API Key

```bash
# For OpenAI
# 1. Go to https://platform.openai.com/api-keys
# 2. Create new API key
# 3. Add to .env

echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

### Step 3: Update Configuration

```env
# .env
GKCHATTY_STORAGE=local  # Keep local storage, just change provider
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
```

### Step 4: Switch Provider

```bash
# Register and switch to OpenAI
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "openai-text-embedding-3-small"}'
```

### Step 5: Re-embed (if dimensions changed)

**⚠️ Cost Warning**: Re-embedding 10,000 documents costs ~$0.20-$0.40 with OpenAI.

```bash
# Estimate cost first
node -e "
const docCount = require('./dist/utils/storageAdapter').default.getDocumentCount();
const costPerMillion = 0.020; // OpenAI text-embedding-3-small
const avgTokensPerDoc = 500;
const estimatedCost = (docCount * avgTokensPerDoc / 1000000) * costPerMillion;
console.log(\`Estimated re-embedding cost: $\${estimatedCost.toFixed(2)}\`);
"

# If acceptable, run re-embedding
node scripts/re-embed-all.js
```

---

## Provider Switching

### Same Provider Family (No Re-embedding)

**Example**: `ollama-nomic-embed-text` → `ollama-nomic-embed-text-v1.5`

```bash
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "ollama-nomic-embed-text-v1.5"}'
```

Search works immediately if dimensions match.

### Different Provider (Re-embedding Required)

**Example**: `openai-text-embedding-3-small` (1536 dims) → `ollama-nomic-embed-text` (768 dims)

```bash
# 1. Switch provider
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "ollama-nomic-embed-text"}'

# 2. Re-embed all documents
node scripts/re-embed-all.js

# ⚠️ Search will be degraded until re-embedding completes
```

---

## Re-embedding Strategy

### Incremental Re-embedding (Zero Downtime)

For large datasets, re-embed incrementally to maintain partial search functionality:

```javascript
// scripts/incremental-re-embed.js
async function incrementalReEmbed() {
  const batchSize = 100;
  const documents = await getAllDocuments();

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);

    // Re-embed batch
    await Promise.all(batch.map(async (doc) => {
      const newEmbedding = await provider.embed(doc.content);
      await saveEmbedding(doc.id, newEmbedding);
    }));

    // Delay to avoid rate limits and allow search queries
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`Progress: ${i + batchSize}/${documents.length}`);
  }
}
```

### Parallel Re-embedding (Faster but Higher Load)

```javascript
// Use provider.embedBatch() for 10x faster re-embedding
async function parallelReEmbed() {
  const batchSize = 50; // API provider batch limit
  const documents = await getAllDocuments();

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const texts = batch.map(doc => doc.content);

    // Batch embed (much faster)
    const embeddings = await provider.embedBatch(texts);

    // Save all embeddings
    await Promise.all(batch.map((doc, idx) =>
      saveEmbedding(doc.id, embeddings[idx])
    ));

    console.log(`Progress: ${i + batchSize}/${documents.length}`);
  }
}
```

### Background Re-embedding (Best for Production)

```javascript
// Run re-embedding as background job
const Queue = require('bull');
const reEmbedQueue = new Queue('re-embedding', 'redis://localhost:6379');

// Add all documents to queue
documents.forEach(doc => {
  reEmbedQueue.add({ documentId: doc.id, content: doc.content });
});

// Process queue with concurrency
reEmbedQueue.process(10, async (job) => {
  const { documentId, content } = job.data;
  const embedding = await provider.embed(content);
  await saveEmbedding(documentId, embedding);
});
```

---

## Troubleshooting

### Issue: "Insufficient memory to load model"

**Cause**: Local model requires more RAM than available

**Solution**:
```bash
# 1. Check system memory
free -h

# 2. Close other applications
# 3. Switch to smaller model
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "ollama-all-minilm"}'  # Smaller model

# 4. Or use API provider
curl -X POST http://localhost:6001/api/embeddings/set-provider \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "openai-text-embedding-3-small"}'
```

### Issue: "Circuit breaker open"

**Cause**: Too many failures from provider

**Solution**:
```bash
# 1. Check provider health
curl -X POST http://localhost:6001/api/embeddings/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId": "your-provider"}'

# 2. Wait for circuit breaker reset (default: 1 minute)

# 3. Or manually reset by restarting application
pm2 restart gkchatty-backend
```

### Issue: "Search results are poor after migration"

**Cause**: Different embedding models have different semantic representations

**Solution**:
```bash
# 1. Verify embeddings were re-generated
ls -lh ./data/embeddings/ | wc -l

# 2. Check embedding dimensions match provider
curl http://localhost:6001/api/embeddings/info \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. If still poor, try different provider
# Some models are better for specific domains (code vs. general text)
```

### Issue: "Re-embedding is too slow"

**Cause**: Using single embed() calls instead of batch

**Solution**:
```javascript
// ❌ Slow (1 request per document)
for (const doc of documents) {
  await provider.embed(doc.content);
}

// ✅ Fast (1 request per 50 documents)
for (let i = 0; i < documents.length; i += 50) {
  const batch = documents.slice(i, i + 50);
  await provider.embedBatch(batch.map(d => d.content));
}
```

---

## Best Practices

### 1. **Always Backup**

✅ **DO**:
- Backup before any migration
- Test restore process
- Keep multiple backup versions
- Backup to external storage

❌ **DON'T**:
- Skip backups "just this once"
- Overwrite backups without verification
- Store backups on same disk

### 2. **Test First**

✅ **DO**:
- Test migration on staging environment
- Verify provider performance with benchmarks
- Test search quality with sample queries
- Monitor resource usage

❌ **DON'T**:
- Test in production
- Skip performance testing
- Assume same quality across providers

### 3. **Plan for Costs**

✅ **DO**:
- Calculate re-embedding costs before starting
- Set API rate limits
- Monitor usage during migration
- Use batch endpoints for efficiency

❌ **DON'T**:
- Start re-embedding without cost estimate
- Use single embed() calls
- Ignore rate limits

### 4. **Monitor Migration**

✅ **DO**:
- Log progress (documents re-embedded)
- Track errors and retry failed documents
- Monitor system resources (RAM, disk, CPU)
- Set up alerts for failures

❌ **DON'T**:
- Run migration in fire-and-forget mode
- Ignore errors
- Let disk space run out mid-migration

### 5. **Gradual Rollout**

✅ **DO**:
- Start with small batch (100 documents)
- Verify quality before full migration
- Keep old embeddings until migration complete
- Allow rollback if issues found

❌ **DON'T**:
- Delete old embeddings immediately
- Migrate all documents without testing
- Skip quality verification

---

## Migration Checklist

### Pre-Migration

- [ ] Backup created and verified
- [ ] Target provider tested and working
- [ ] System resources validated (disk, memory)
- [ ] Re-embedding cost calculated (if applicable)
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback plan documented

### During Migration

- [ ] Provider switched successfully
- [ ] Health check passing
- [ ] Re-embedding script running (if needed)
- [ ] Progress monitored (% complete)
- [ ] Errors logged and handled
- [ ] System resources monitored

### Post-Migration

- [ ] Search functionality verified
- [ ] Provider statistics reviewed
- [ ] Performance benchmarked
- [ ] Old embeddings archived (not deleted yet)
- [ ] Documentation updated
- [ ] Team notified of changes

### One Week Later

- [ ] No rollback needed
- [ ] Performance metrics stable
- [ ] Cost tracking accurate
- [ ] Old backups can be deleted

---

## Support

**Questions?** Check these resources:

- API Documentation: `docs/api/openapi.yml`
- Provider Guide: `docs/guides/PROVIDER-IMPLEMENTATION-GUIDE.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`

**Emergency Rollback**:

```bash
# 1. Stop application
pm2 stop gkchatty-backend

# 2. Restore backup
cp ./backups/gkchatty-YYYYMMDD.db ./data/gkchatty.db
tar -xzf ./backups/embeddings-YYYYMMDD.tar.gz -C ./data/

# 3. Restore .env
cp ./backups/.env-YYYYMMDD .env

# 4. Restart application
pm2 start gkchatty-backend
```

---

*GKChatty Local - Migration Guide v1.0*
*Last Updated: November 3, 2025*
