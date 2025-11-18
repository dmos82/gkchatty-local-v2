# GKChatty Cost Analysis: 50 Users (Insurance Company)

**Date:** November 17, 2025
**Use Case:** Insurance company internal knowledge base
**Scale:** 50 users, 20-30 queries/day per user
**Current Stack:** Next.js + Express + RAG (OpenAI/Ollama) + ChromaDB/Pinecone

---

## Usage Profile

**Daily Volume:**
- Users: 50
- Queries per user: 20-30 (avg 25)
- **Total daily queries: 1,250**
- **Total monthly queries: ~37,500**

**Query Assumptions:**
- Average query length: 100 tokens
- Average response length: 500 tokens
- Average context (RAG): 3,000 tokens
- **Total per query: ~3,600 tokens**

---

## Cost Breakdown

### Option 1: OpenAI GPT-4 (Premium Quality)

**Model Costs (gpt-4-turbo-2024-04-09):**
- Input: $10.00 / 1M tokens
- Output: $30.00 / 1M tokens

**Monthly Cost Calculation:**
```
Queries:           37,500/month
Input tokens:      37,500 × 3,100 = 116.25M tokens
Output tokens:     37,500 × 500 = 18.75M tokens

Input cost:        116.25M × $10/1M = $1,162.50
Output cost:       18.75M × $30/1M = $562.50
Total Model Cost:  $1,725/month
```

**Embedding Costs (text-embedding-3-small):**
```
Price:             $0.02 / 1M tokens
Queries:           37,500 queries × 100 tokens = 3.75M tokens
Document chunks:   Assume 10,000 chunks × 200 tokens = 2M tokens (one-time)
Monthly cost:      3.75M × $0.02/1M = $0.08
One-time setup:    2M × $0.02/1M = $0.04
```

**Total OpenAI (GPT-4):** ~$1,725/month + hosting

---

### Option 2: OpenAI GPT-3.5 Turbo (Cost-Optimized)

**Model Costs (gpt-3.5-turbo):**
- Input: $0.50 / 1M tokens
- Output: $1.50 / 1M tokens

**Monthly Cost Calculation:**
```
Input cost:        116.25M × $0.50/1M = $58.13
Output cost:       18.75M × $1.50/1M = $28.13
Total Model Cost:  $86.26/month
```

**Total OpenAI (GPT-3.5):** ~$86/month + hosting

---

### Option 3: Hybrid (Smart Routing)

**Recommended for insurance use case:**
- 70% queries: GPT-3.5 Turbo (simple/medium complexity)
- 30% queries: GPT-4 Turbo (complex queries, critical decisions)

**Monthly Cost Calculation:**
```
GPT-3.5 (70%):     26,250 queries × $0.0023 = $60.38
GPT-4 (30%):       11,250 queries × $0.046 = $517.50
Total Model Cost:  $577.88/month
```

**Total Hybrid:** ~$578/month + hosting

---

### Option 4: Local Ollama (Zero API Costs)

**Hardware Requirements:**
- GPU: NVIDIA RTX 4090 or A6000 (24GB VRAM)
- RAM: 64GB minimum
- Storage: 1TB NVMe SSD

**Model Recommendations:**
- Medium queries: Llama 3.1 8B (~16GB VRAM)
- Complex queries: Llama 3.1 70B (~40GB VRAM, needs multi-GPU)

**Monthly Costs:**
```
GPU Server:        $500-800/month (cloud) or $5,000-8,000 (on-prem purchase)
Electricity:       ~$50/month (on-prem)
Maintenance:       $100/month
Total:             $650-950/month (cloud) OR $50-150/month (on-prem after purchase)
```

**Total Ollama (Cloud):** ~$650-950/month
**Total Ollama (On-Prem):** ~$50-150/month (after $5-8k initial investment)

---

## Hosting Costs (Current Stack)

**Netlify (Frontend):**
- Plan: Pro ($19/month) or Business ($99/month)
- Bandwidth: 100GB/month (Pro) or 400GB/month (Business)
- **Estimated:** $19-99/month

**Render (Backend):**
- Instance: Professional ($25/month for 512MB RAM)
- For 50 users: Standard Plus ($85/month for 2GB RAM) recommended
- Database: PostgreSQL ($7-25/month)
- **Estimated:** $92-110/month

**Vector Database:**

*Option A: ChromaDB (Local on Render)*
- Cost: $0 (included in server cost)
- Requires: Upgrade to 4GB RAM server ($175/month)
- **Total:** $175/month

*Option B: Pinecone (Cloud)*
- Serverless: $0.096 per million read units
- Storage: $0.30 per GB/month
- Estimated: 37,500 queries × 3 vectors = 112,500 reads = $10.80
- Storage: ~2GB = $0.60
- **Total:** $11.40/month

**Total Hosting:** $130-285/month (depending on configuration)

---

## Total Monthly Cost Summary

| Configuration | Model Cost | Hosting | Total/Month | $/User/Month |
|--------------|-----------|---------|-------------|--------------|
| **GPT-4 + Pinecone** | $1,725 | $130 | **$1,855** | **$37.10** |
| **GPT-3.5 + Pinecone** | $86 | $130 | **$216** | **$4.32** |
| **Hybrid + Pinecone** | $578 | $130 | **$708** | **$14.16** |
| **Ollama Cloud + ChromaDB** | $0 | $950 | **$950** | **$19.00** |
| **Ollama On-Prem + ChromaDB** | $0 | $50-150* | **$50-150** | **$1-3** |

*After $5,000-8,000 initial hardware investment

---

## Recommended Configuration (Insurance Use Case)

### **Hybrid GPT-3.5/GPT-4 + Pinecone**

**Why:**
- **Quality:** GPT-4 for critical insurance queries (claims, policy interpretation)
- **Cost-effective:** GPT-3.5 for simple lookups (contact info, definitions)
- **Reliable:** Cloud-based, no hardware management
- **Scalable:** Pinecone handles growth automatically
- **Compliance-friendly:** Cloud providers have SOC2/HIPAA compliance

**Monthly Cost:** ~$708 ($14.16/user)

**Break-even vs On-Prem Ollama:** 7-11 months

---

## Predicted Bottlenecks & Solutions

### 1. **API Rate Limits**

**OpenAI Rate Limits (Tier 1):**
- GPT-4: 500 requests/min (RPM)
- GPT-3.5: 3,500 RPM
- Embeddings: 3,000 RPM

**Your Usage:**
- Peak: 50 users × 5 queries/hour = 250 queries/hour = ~4 queries/min
- **Verdict:** ✅ No bottleneck (well within limits)

**Solution if needed:**
- Implement request queuing
- Upgrade to Tier 2 ($50+ spend/month) for 5,000 RPM
- Add retry logic with exponential backoff

---

### 2. **Concurrent User Spike**

**Scenario:** 20 users submit queries simultaneously

**Current Render Setup:**
- Standard Plus: 2GB RAM, 2 CPUs
- Can handle ~10 concurrent requests

**Bottleneck:** Response time degrades after 10 concurrent users

**Solutions:**
- ✅ **Immediate:** Upgrade to Pro ($175/month, 4GB RAM, 4 CPUs) → 25 concurrent
- ✅ **Scale:** Enable auto-scaling (2-4 instances) → 50-100 concurrent
- ✅ **Architecture:** Add Redis caching for frequent queries (30% cache hit = 30% faster)

---

### 3. **RAG Context Retrieval Speed**

**Current Performance:**
- ChromaDB local: ~50-100ms per query
- Pinecone cloud: ~30-50ms per query

**At Scale (37,500/month):**
- Average: ~1,250 queries/day = ~1 query/minute
- Peak hours (9am-5pm): ~150 queries/hour = ~2.5 queries/min

**Bottleneck:** Not a bottleneck at this scale

**Optimization:**
- ✅ Cache top 100 most-queried chunks (Redis) → 50% faster
- ✅ Pre-warm frequently accessed namespaces

---

### 4. **Document Upload/Processing**

**Current Process:**
1. Upload PDF/DOCX (user waits)
2. Extract text (blocking)
3. Chunk text (blocking)
4. Generate embeddings (OpenAI API call)
5. Store in vector DB (blocking)

**Bottleneck:** Large documents (100+ pages) take 30-60 seconds

**Solutions:**
- ✅ **Immediate:** Move to background job queue (Bull.js + Redis)
- ✅ **UX:** Show progress bar, allow user to continue working
- ✅ **Performance:** Batch embeddings (100 chunks/request)
- ✅ **Scale:** Add dedicated worker instance for document processing

---

### 5. **Vector Database Storage Growth**

**Initial State:**
- 100 insurance policy documents
- Average: 50 pages × 4 chunks/page = 200 chunks/doc
- Total: 100 docs × 200 chunks = 20,000 vectors
- Storage: ~2GB

**Growth Rate (estimated):**
- 10 new documents/month
- 12 months = 120 new docs = 24,000 vectors
- Total after 1 year: 44,000 vectors (~4.4GB)

**Pinecone Cost Growth:**
```
Year 1: 4.4GB × $0.30/GB = $1.32/month
Year 2: 8.8GB × $0.30/GB = $2.64/month
```

**Bottleneck:** Not a bottleneck (storage is cheap)

---

### 6. **Network Latency (Users → Render → OpenAI)**

**Current Latency:**
- User → Netlify CDN: 20-50ms
- Netlify → Render (API): 100-200ms
- Render → OpenAI: 200-500ms
- OpenAI processing: 2,000-5,000ms (streaming)
- **Total:** 2,320-5,750ms (~2-6 seconds)

**User Expectation:** <3 seconds for simple queries

**Bottleneck:** Complex queries with long context

**Solutions:**
- ✅ **Immediate:** Enable streaming responses (show tokens as they arrive)
- ✅ **Backend:** Deploy Render in same region as OpenAI (us-east-1)
- ✅ **Frontend:** Show "thinking" animation with progress
- ✅ **Caching:** Cache identical queries (Redis) → instant response

---

### 7. **Memory Usage (Context Window)**

**Current Setup:**
- RAG retrieves top 5 chunks × 600 tokens = 3,000 tokens
- Conversation history: last 10 messages = ~2,000 tokens
- System prompt: 500 tokens
- **Total context:** ~5,500 tokens

**GPT-4 Turbo Limits:**
- Max context: 128,000 tokens
- **Verdict:** ✅ No bottleneck (using 4% of capacity)

**Memory on Render (2GB RAM):**
- Node.js baseline: 200MB
- Express server: 100MB
- OpenAI client: 50MB
- ChromaDB client: 300MB
- **Total:** 650MB used / 2GB available

**Bottleneck:** Not a bottleneck

---

### 8. **Database Connection Pool**

**Postgres Connection Limits:**
- Render Postgres: 97 connections (Standard tier)

**Your Usage:**
- 1 connection per API request
- Peak: 10 concurrent requests = 10 connections
- **Verdict:** ✅ No bottleneck

**Best Practice:**
- Set pool max: 20 connections (pg Pool)
- Add connection timeout: 30 seconds

---

## Cost Optimization Strategies

### 1. **Implement Intelligent Caching**

**Redis Cache Layer:**
```
Cost: $10-25/month (Redis Cloud)
Benefit: 30-40% cache hit rate
Savings: 30% of $578 = $173/month
ROI: $173 - $25 = $148/month savings
```

**Cache Strategy:**
- Exact query match: 1 hour TTL
- Similar query (embedding distance <0.1): 10 min TTL
- Frequent documents: 24 hour TTL

---

### 2. **Smart Prompt Compression**

**Problem:** Long system prompts waste tokens

**Solution:**
- Compress persona prompts (300 tokens → 150 tokens)
- Remove redundant instructions
- **Savings:** 150 tokens × 37,500 queries = 5.6M tokens = $5.60/month

---

### 3. **Batch Embedding Calls**

**Current:** 1 API call per document chunk
**Optimized:** 100 chunks per API call (OpenAI batching)

**Savings:**
- Reduce API overhead by 99%
- Faster document processing (60s → 5s)

---

### 4. **Off-Peak Processing**

**Strategy:**
- Schedule document processing for overnight (11pm-6am)
- Use cheaper compute instances during off-peak

**Savings:** ~15-20% on compute costs

---

## Scaling Roadmap

### Phase 1: Current (50 users)
- ✅ Hybrid GPT-3.5/GPT-4
- ✅ Pinecone vector DB
- ✅ Render Standard Plus (2GB RAM)
- **Cost:** $708/month

### Phase 2: 100 users (next 6 months)
- Upgrade: Render Pro (4GB RAM, auto-scaling)
- Add: Redis caching layer
- **Cost:** $1,050/month ($10.50/user)

### Phase 3: 200+ users (1 year)
- Consider: Migrate to AWS/GCP for better pricing
- Add: Load balancer + multiple instances
- Evaluate: On-prem Ollama for 70% of queries
- **Cost:** $1,800-2,200/month ($9-11/user)

---

## Risk Mitigation

### 1. **OpenAI Outage**
- **Fallback:** Configure Ollama as backup (local llama-3.1-8b)
- **Setup time:** 2 hours
- **Graceful degradation:** "AI temporarily using backup model"

### 2. **Cost Overrun**
- **Monitoring:** Set up OpenAI usage alerts ($500, $700, $900)
- **Budget cap:** Implement daily/monthly query limits per user
- **Circuit breaker:** Auto-switch to GPT-3.5 if approaching budget

### 3. **Compliance (Insurance Data)**
- **Data residency:** Verify OpenAI doesn't train on your data (opt-out)
- **Audit trail:** Log all queries + responses for compliance
- **PII detection:** Scan queries for SSN, policy numbers before sending

---

## Action Items

### Immediate (Week 1)
- [ ] Set up OpenAI usage monitoring dashboard
- [ ] Configure budget alerts ($600, $800, $1000/month)
- [ ] Implement request queuing for concurrent users
- [ ] Add Redis caching for frequently asked questions

### Short-term (Month 1)
- [ ] Deploy background job queue for document processing
- [ ] Optimize RAG chunk retrieval (top 3 instead of top 5)
- [ ] Compress system prompts to reduce token usage
- [ ] Set up performance monitoring (response times)

### Medium-term (Quarter 1)
- [ ] Implement smart caching (30-40% hit rate target)
- [ ] Evaluate on-prem Ollama ROI at 6 months
- [ ] Build internal analytics dashboard (cost per user, popular queries)
- [ ] Test auto-scaling for peak usage hours

---

## Summary

**Recommended Starting Point:**
- **Model:** Hybrid GPT-3.5 (70%) + GPT-4 (30%)
- **Vector DB:** Pinecone (serverless)
- **Hosting:** Render Standard Plus
- **Monthly Cost:** ~$708 ($14.16/user)

**Key Bottlenecks:**
1. ✅ Concurrent users (10+) → Upgrade to Render Pro
2. ✅ Document processing speed → Background jobs
3. ⚠️ Cost optimization → Implement caching

**Cost Efficiency:**
- At 50 users: GPT-3.5/4 Hybrid is optimal ($14/user)
- At 200+ users: Consider on-prem Ollama ($9-11/user after hardware ROI)

**Next Steps:**
Start with Hybrid configuration, monitor usage for 1 month, then optimize based on real data.

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Contact:** Generated by Claude Code
