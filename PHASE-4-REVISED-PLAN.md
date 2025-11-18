# Phase 4: Incremental Feature Addition - REVISED PLAN

**Date Created:** 2025-11-14
**Replaces:** Original merge plan (gkchatty-pure → gkchatty-local)
**Duration:** 20 days (4 weeks)
**Status:** 📋 Planning

---

## Executive Summary

**Original Plan:** Merge gkchatty-pure codebase into gkchatty-local
**Problem:** gkchatty-pure "not in good shape", high risk of breaking existing functionality

**NEW APPROACH:** Cherry-pick best ideas, implement them properly with feature flags

### What We're Adding

1. **Local Model Access (Ollama)** - Dropdown to select from detected local models
2. **Smart Model Routing** - Auto-select best model based on query complexity
3. **Model Transparency** - Show which model answered each message

### Why This is Better

| Old Approach | New Approach |
|--------------|--------------|
| Merge broken code | Build features properly |
| High risk of breakage | Feature flags = zero risk |
| Hard to rollback | Instant disable via .env |
| 7 days (optimistic) | 20 days (realistic) |
| Full regression testing | Incremental testing |

---

## Architecture Overview

### Current State (Phase 3 Complete)

```
User → Frontend → Backend → OpenAI API
                           → MongoDB
                           → Pinecone
```

**Single model per chat**, no intelligence, cloud-only

### Target State (Phase 4 Complete)

```
User → Frontend → Backend → Query Analyzer (NEW)
                           ↓
                      Model Router (NEW)
                           ↓
                    ┌──────┴──────┐
                    ↓             ↓
              Ollama Service   OpenAI API
              (Local Models)   (Cloud Models)
                    ↓             ↓
                  Response + Metadata
                    ↓
                 MongoDB (stores which model answered)
```

**Features:**
- ✅ User can select Ollama or OpenAI
- ✅ Smart routing auto-selects best model
- ✅ Each message shows which model answered
- ✅ Both local and cloud models supported

---

## Feature Breakdown

### Feature 1: Local Model Access (Ollama Integration)

**User Story:**
> As a user, I want to select from available Ollama models so I can use local AI without API costs

**Technical Implementation:**

1. **Backend Service** (`backend/src/services/ollamaService.ts`):
```typescript
export class OllamaService {
  private baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    return data.models.map(m => m.name);
  }

  async chat(model: string, messages: Message[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: false
      })
    });

    const data = await response.json();
    return data.message.content;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/api/tags`);
      return true;
    } catch {
      return false;
    }
  }
}
```

2. **API Routes** (`backend/src/routes/chatRoutes.ts`):
```typescript
// NEW: List available Ollama models
router.get('/models/ollama', async (req, res) => {
  if (!features.ollama) {
    return res.status(404).json({ error: 'Ollama feature disabled' });
  }

  try {
    const models = await ollamaService.listModels();
    res.json({ models, available: models.length > 0 });
  } catch (error) {
    res.json({ models: [], available: false, error: error.message });
  }
});

// MODIFIED: Chat endpoint supports Ollama
router.post('/chat', async (req, res) => {
  const { modelMode, selectedModel, message } = req.body;
  let response;

  if (modelMode === 'ollama' && features.ollama) {
    // Use Ollama
    response = await ollamaService.chat(selectedModel, messages);
  } else {
    // Existing OpenAI logic (unchanged)
    response = await openaiService.chat(messages);
  }

  // Save message with metadata
  await Message.create({
    ...messageData,
    modelUsed: selectedModel,
    modelMode: modelMode
  });

  res.json({ response });
});
```

3. **Frontend UI** (`frontend/components/ModelSelector.tsx`):
```tsx
export function ModelSelector() {
  const [modelMode, setModelMode] = useState<'openai' | 'ollama'>('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);

  useEffect(() => {
    if (featureFlags.ollama) {
      fetch('/api/models/ollama')
        .then(res => res.json())
        .then(data => {
          setOllamaModels(data.models);
          setOllamaAvailable(data.available);
        });
    }
  }, []);

  return (
    <div className="model-selector">
      {featureFlags.ollama && (
        <Select value={modelMode} onChange={e => setModelMode(e.target.value)}>
          <option value="openai">OpenAI (Cloud)</option>
          <option value="ollama" disabled={!ollamaAvailable}>
            Ollama (Local) {!ollamaAvailable && '- Not Available'}
          </option>
        </Select>
      )}

      {modelMode === 'openai' ? (
        <Select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
          <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
          <option value="gpt-4o">GPT-4o (Best)</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</option>
        </Select>
      ) : (
        <Select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
          {ollamaModels.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
        </Select>
      )}
    </div>
  );
}
```

**Database Changes:**
```typescript
// Message schema addition (backward compatible)
{
  modelUsed?: string;      // e.g., "gpt-4o-mini" or "llama3.2:3b"
  modelMode?: 'ollama' | 'openai';  // Which service
}
```

**Feature Flag:**
```bash
FEATURE_OLLAMA_MODELS=false  # Start disabled
```

**Rollback Plan:**
- Set `FEATURE_OLLAMA_MODELS=false`
- Restart backend
- UI hides Ollama option
- All chats use OpenAI (existing behavior)

---

### Feature 2: Smart Model Routing

**User Story:**
> As a user, I want the system to automatically select the best model for my question so I get optimal speed/quality/cost

**Technical Implementation:**

1. **Query Analyzer** (`backend/src/services/queryAnalyzer.ts`):
```typescript
export interface QueryComplexity {
  level: 'simple' | 'medium' | 'complex';
  confidence: number;  // 0-1
  indicators: string[];  // Why we chose this level
}

export class QueryAnalyzer {
  analyze(query: string): QueryComplexity {
    const indicators: string[] = [];
    let score = 0;

    // 1. Length analysis
    if (query.length < 50) {
      score += 0;
      indicators.push('Short query');
    } else if (query.length < 150) {
      score += 3;
      indicators.push('Medium length');
    } else {
      score += 5;
      indicators.push('Long query');
    }

    // 2. Keyword analysis
    const simpleKeywords = ['what is', 'define', 'list', 'show me', 'how do i'];
    const complexKeywords = ['explain why', 'analyze', 'compare', 'design', 'evaluate', 'critique'];

    const hasSimple = simpleKeywords.some(kw => query.toLowerCase().includes(kw));
    const hasComplex = complexKeywords.some(kw => query.toLowerCase().includes(kw));

    if (hasSimple) {
      score += 0;
      indicators.push('Simple keywords detected');
    }
    if (hasComplex) {
      score += 4;
      indicators.push('Complex keywords detected');
    }

    // 3. Question depth (multiple questions = complex)
    const questionCount = (query.match(/\?/g) || []).length;
    if (questionCount > 1) {
      score += 2;
      indicators.push('Multiple questions');
    }

    // 4. Technical terms (presence of code, technical jargon)
    const hasTechnical = /\b(function|class|API|database|algorithm|interface)\b/i.test(query);
    if (hasTechnical) {
      score += 2;
      indicators.push('Technical terms detected');
    }

    // 5. Context requirements (references to "above", "previous", etc.)
    const needsContext = /\b(above|previous|earlier|context|mentioned)\b/i.test(query);
    if (needsContext) {
      score += 3;
      indicators.push('Requires context tracking');
    }

    // Determine level based on score
    let level: 'simple' | 'medium' | 'complex';
    if (score <= 3) {
      level = 'simple';
    } else if (score <= 7) {
      level = 'medium';
    } else {
      level = 'complex';
    }

    return {
      level,
      confidence: Math.min(score / 10, 1),
      indicators
    };
  }
}
```

2. **Model Router** (`backend/src/services/modelRouter.ts`):
```typescript
export class ModelRouter {
  private routes = {
    ollama: {
      simple: 'llama3.2:1b',      // 1.3GB, very fast
      medium: 'llama3.2:3b',      // 2GB, balanced
      complex: 'qwen2.5:7b'       // 4.7GB, powerful
    },
    openai: {
      simple: 'gpt-4o-mini',      // Cheap, fast
      medium: 'gpt-4o-mini',      // Still good enough
      complex: 'gpt-4o'           // Best quality
    }
  };

  selectModel(
    complexity: QueryComplexity,
    mode: 'ollama' | 'openai'
  ): string {
    return this.routes[mode][complexity.level];
  }

  getRoutes() {
    return this.routes;
  }

  updateRoute(
    mode: 'ollama' | 'openai',
    level: 'simple' | 'medium' | 'complex',
    model: string
  ) {
    this.routes[mode][level] = model;
  }
}
```

3. **Integration** (`backend/src/routes/chatRoutes.ts`):
```typescript
router.post('/chat', async (req, res) => {
  const { modelMode, selectedModel, message, smartRouting } = req.body;
  let finalModel = selectedModel;
  let complexityInfo;

  // Smart routing (if enabled)
  if (smartRouting && features.smartRouting) {
    const complexity = queryAnalyzer.analyze(message);
    finalModel = modelRouter.selectModel(complexity, modelMode);
    complexityInfo = complexity;
  }

  // Execute chat
  let response;
  if (modelMode === 'ollama' && features.ollama) {
    response = await ollamaService.chat(finalModel, messages);
  } else {
    response = await openaiService.chat(finalModel, messages);
  }

  // Save with full metadata
  await Message.create({
    ...messageData,
    modelUsed: finalModel,
    modelMode: modelMode,
    modelComplexity: complexityInfo?.level,
    smartRoutingUsed: smartRouting
  });

  res.json({
    response,
    metadata: {
      modelUsed: finalModel,
      complexity: complexityInfo
    }
  });
});
```

4. **Frontend UI** (`frontend/components/SmartRoutingToggle.tsx`):
```tsx
export function SmartRoutingToggle() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="smart-routing-toggle">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        Smart Model Routing
      </label>
      <InfoTooltip>
        Automatically selects the best model based on your question complexity.
        Simple questions use faster/cheaper models, complex questions use more powerful models.
      </InfoTooltip>
    </div>
  );
}
```

**Database Changes:**
```typescript
// Message schema additions
{
  modelComplexity?: 'simple' | 'medium' | 'complex';
  smartRoutingUsed?: boolean;
}
```

**Feature Flag:**
```bash
FEATURE_SMART_ROUTING=false  # Start disabled
```

**Rollback Plan:**
- Set `FEATURE_SMART_ROUTING=false`
- Restart backend
- UI hides smart routing toggle
- All chats use user-selected model (existing behavior)

---

### Feature 3: Model Transparency (Show Which Model Answered)

**User Story:**
> As a user, I want to see which model answered each of my messages so I understand the source and quality of responses

**Technical Implementation:**

1. **Backend** (Already done in Features 1 & 2):
   - Messages already save `modelUsed` field
   - API returns model metadata

2. **Frontend Components**:

**ModelBadge.tsx:**
```tsx
interface ModelBadgeProps {
  model: string;
  mode: 'ollama' | 'openai';
  wasSmartRouted?: boolean;
}

export function ModelBadge({ model, mode, wasSmartRouted }: ModelBadgeProps) {
  const badgeColor = mode === 'ollama' ? 'blue' : 'green';
  const prefix = wasSmartRouted ? 'Auto: ' : '';

  return (
    <span className={`model-badge model-badge-${badgeColor}`}>
      {prefix}{model}
    </span>
  );
}
```

**ChatMessage.tsx (Enhanced):**
```tsx
export function ChatMessage({ message }) {
  return (
    <div className="chat-message">
      <div className="message-header">
        <Avatar user={message.role} />

        {message.modelUsed && featureFlags.showModelUsed && (
          <ModelBadge
            model={message.modelUsed}
            mode={message.modelMode}
            wasSmartRouted={message.smartRoutingUsed}
          />
        )}

        <Timestamp date={message.createdAt} />
      </div>

      <div className="message-content">
        {message.content}
      </div>

      {message.modelComplexity && (
        <div className="message-metadata">
          <small>Complexity: {message.modelComplexity}</small>
        </div>
      )}
    </div>
  );
}
```

3. **Styling** (`frontend/styles/ModelBadge.css`):
```css
.model-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  margin-left: 8px;
}

.model-badge-green {
  background: #d4edda;
  color: #155724;
}

.model-badge-blue {
  background: #cce5ff;
  color: #004085;
}
```

**Feature Flag:**
```bash
FEATURE_SHOW_MODEL_USED=true  # Can enable immediately (non-breaking)
```

**Rollback Plan:**
- Set `FEATURE_SHOW_MODEL_USED=false`
- No restart needed (frontend-only)
- UI hides model badges
- Messages still saved with metadata for future

---

## Implementation Timeline

### Week 1: Foundation (Days 1-5) - ZERO RISK

**Goal:** Prepare infrastructure without changing existing functionality

#### Day 1: Database Schema Updates

**Files Modified:**
- `backend/src/models/Message.ts`

**Changes:**
```typescript
// Add optional fields (backward compatible)
export interface IMessage {
  // ... existing fields ...

  // NEW FIELDS (all optional)
  modelUsed?: string;
  modelMode?: 'ollama' | 'openai';
  modelComplexity?: 'simple' | 'medium' | 'complex';
  smartRoutingUsed?: boolean;
}
```

**Testing:**
- Verify existing messages still load
- Create test message with new fields
- Verify backward compatibility

**Risk:** ZERO - Optional fields don't break existing data

---

#### Day 2: Feature Flag System

**Files Created:**
- `backend/src/config/features.ts`

**Implementation:**
```typescript
export interface FeatureFlags {
  ollama: boolean;
  smartRouting: boolean;
  showModelUsed: boolean;
}

export const features: FeatureFlags = {
  ollama: process.env.FEATURE_OLLAMA_MODELS === 'true',
  smartRouting: process.env.FEATURE_SMART_ROUTING === 'true',
  showModelUsed: process.env.FEATURE_SHOW_MODEL_USED === 'true'
};

// Endpoint to check feature flags (useful for frontend)
export function getFeaturesForClient(): Partial<FeatureFlags> {
  return {
    ollama: features.ollama,
    smartRouting: features.smartRouting,
    showModelUsed: features.showModelUsed
  };
}
```

**Environment Variables:**
```bash
# Add to backend/.env
FEATURE_OLLAMA_MODELS=false
FEATURE_SMART_ROUTING=false
FEATURE_SHOW_MODEL_USED=false
```

**API Route:**
```typescript
// backend/src/routes/featureRoutes.ts
router.get('/features', (req, res) => {
  res.json(getFeaturesForClient());
});
```

**Frontend Integration:**
```typescript
// frontend/hooks/useFeatureFlags.ts
export function useFeatureFlags() {
  const [flags, setFlags] = useState({
    ollama: false,
    smartRouting: false,
    showModelUsed: false
  });

  useEffect(() => {
    fetch('/api/features')
      .then(res => res.json())
      .then(setFlags);
  }, []);

  return flags;
}
```

**Testing:**
- Toggle each flag
- Verify frontend receives correct values
- Test with all combinations

**Risk:** ZERO - No features using flags yet

---

#### Day 3-4: Backend Service Stubs

**Files Created:**
- `backend/src/services/ollamaService.ts` (stub)
- `backend/src/services/queryAnalyzer.ts` (stub)
- `backend/src/services/modelRouter.ts` (stub)

**Implementation:**
```typescript
// ollamaService.ts - Stub that always fails gracefully
export class OllamaService {
  async listModels(): Promise<string[]> {
    throw new Error('Ollama service not yet implemented');
  }

  async chat(model: string, messages: any[]): Promise<string> {
    throw new Error('Ollama service not yet implemented');
  }
}

// Export singleton
export const ollamaService = new OllamaService();
```

**Testing:**
- Import services in routes (don't call yet)
- Verify TypeScript compilation
- Verify no runtime errors

**Risk:** ZERO - Stubs not called yet

---

#### Day 5: Documentation & Testing

**Files Created:**
- `docs/features/OLLAMA-INTEGRATION.md`
- `docs/features/SMART-ROUTING.md`
- `docs/features/MODEL-TRANSPARENCY.md`

**Testing:**
- Run full test suite (should pass - nothing changed)
- Verify backend starts with all flags false
- Verify frontend loads feature flags correctly

**Week 1 Deliverables:**
- ✅ Database schema extended (backward compatible)
- ✅ Feature flag system operational
- ✅ Service stubs created
- ✅ Documentation written
- ✅ Zero impact on existing functionality

---

### Week 2: Ollama Integration (Days 6-10) - LOW RISK

**Goal:** Enable local model selection (opt-in via flag)

#### Day 6-7: Ollama Service Implementation

**File:** `backend/src/services/ollamaService.ts`

**Full Implementation:**
```typescript
export class OllamaService {
  private baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        timeout: 3000
      });

      if (!response.ok) {
        throw new Error('Ollama not responding');
      }

      const data = await response.json();
      return data.models.map((m: any) => m.name).sort();
    } catch (error) {
      log.warn('Ollama not available:', error.message);
      return [];
    }
  }

  async chat(model: string, messages: Message[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}
```

**Testing:**
- Start Ollama locally
- Test `listModels()` returns models
- Test `chat()` with simple message
- Test graceful failure when Ollama offline

---

#### Day 8-9: Backend Routes Integration

**File:** `backend/src/routes/chatRoutes.ts`

**Modifications:**
```typescript
// NEW ROUTE: List Ollama models
router.get('/models/ollama', async (req, res) => {
  if (!features.ollama) {
    return res.status(404).json({
      error: 'Ollama feature not enabled',
      available: false
    });
  }

  try {
    const models = await ollamaService.listModels();
    const healthy = models.length > 0;

    res.json({
      models,
      available: healthy,
      ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    });
  } catch (error) {
    res.json({
      models: [],
      available: false,
      error: error.message
    });
  }
});

// MODIFIED ROUTE: Chat supports Ollama
router.post('/chat', authMiddleware, async (req, res) => {
  const {
    conversationId,
    message,
    modelMode = 'openai',
    selectedModel = 'gpt-4o-mini'
  } = req.body;

  let response;
  let actualModelUsed = selectedModel;

  try {
    // Get conversation history
    const conversation = await Conversation.findById(conversationId);
    const messages = await Message.find({ conversationId });

    // Route to appropriate service
    if (modelMode === 'ollama' && features.ollama) {
      response = await ollamaService.chat(selectedModel, messages);
    } else {
      // Existing OpenAI logic
      response = await openaiService.chat(selectedModel, messages);
    }

    // Save assistant message with metadata
    const assistantMessage = await Message.create({
      conversationId,
      role: 'assistant',
      content: response,
      modelUsed: actualModelUsed,
      modelMode: modelMode
    });

    res.json({
      message: assistantMessage,
      metadata: {
        modelUsed: actualModelUsed,
        modelMode: modelMode
      }
    });

  } catch (error) {
    log.error('Chat error:', error);

    // Fallback to OpenAI if Ollama fails
    if (modelMode === 'ollama') {
      log.warn('Ollama failed, falling back to OpenAI');

      try {
        response = await openaiService.chat('gpt-4o-mini', messages);
        actualModelUsed = 'gpt-4o-mini';

        const assistantMessage = await Message.create({
          conversationId,
          role: 'assistant',
          content: response,
          modelUsed: actualModelUsed,
          modelMode: 'openai'
        });

        return res.json({
          message: assistantMessage,
          fallback: true
        });
      } catch (fallbackError) {
        return res.status(500).json({ error: 'Both Ollama and OpenAI failed' });
      }
    }

    res.status(500).json({ error: error.message });
  }
});
```

**Testing:**
- Test with `FEATURE_OLLAMA_MODELS=false` (should reject)
- Test with `FEATURE_OLLAMA_MODELS=true` + Ollama running
- Test with `FEATURE_OLLAMA_MODELS=true` + Ollama offline (fallback)
- Verify messages saved with correct metadata

---

#### Day 10: Frontend UI

**Files Created:**
- `frontend/components/ModelSelector.tsx`

**Implementation:**
```tsx
export function ModelSelector({ value, onChange }) {
  const featureFlags = useFeatureFlags();
  const [modelMode, setModelMode] = useState<'openai' | 'ollama'>('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);

  // Load Ollama models
  useEffect(() => {
    if (featureFlags.ollama) {
      fetch('/api/models/ollama')
        .then(res => res.json())
        .then(data => {
          setOllamaModels(data.models);
          setOllamaAvailable(data.available);
        });
    }
  }, [featureFlags.ollama]);

  // Notify parent of changes
  useEffect(() => {
    onChange({ modelMode, selectedModel });
  }, [modelMode, selectedModel]);

  if (!featureFlags.ollama) {
    // Old behavior - just OpenAI models
    return (
      <select
        value={selectedModel}
        onChange={e => setSelectedModel(e.target.value)}
      >
        <option value="gpt-4o-mini">GPT-4o Mini</option>
        <option value="gpt-4o">GPT-4o</option>
        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
      </select>
    );
  }

  // New behavior - show mode selector
  return (
    <div className="model-selector">
      <select
        value={modelMode}
        onChange={e => setModelMode(e.target.value as any)}
      >
        <option value="openai">OpenAI (Cloud)</option>
        <option value="ollama" disabled={!ollamaAvailable}>
          Ollama (Local) {!ollamaAvailable && '- Offline'}
        </option>
      </select>

      <select
        value={selectedModel}
        onChange={e => setSelectedModel(e.target.value)}
      >
        {modelMode === 'openai' ? (
          <>
            <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
            <option value="gpt-4o">GPT-4o (Best Quality)</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</option>
          </>
        ) : (
          ollamaModels.length > 0 ? (
            ollamaModels.map(model => (
              <option key={model} value={model}>{model}</option>
            ))
          ) : (
            <option disabled>No models available</option>
          )
        )}
      </select>
    </div>
  );
}
```

**Integration in Chat Page:**
```tsx
// frontend/pages/chat.tsx
export default function ChatPage() {
  const [modelConfig, setModelConfig] = useState({
    modelMode: 'openai',
    selectedModel: 'gpt-4o-mini'
  });

  async function sendMessage(message: string) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        message,
        ...modelConfig  // Include model selection
      })
    });

    // Handle response...
  }

  return (
    <div>
      <ModelSelector
        value={modelConfig}
        onChange={setModelConfig}
      />
      <ChatWindow onSend={sendMessage} />
    </div>
  );
}
```

**Testing:**
- Flag disabled: Only see OpenAI dropdown (old behavior)
- Flag enabled + Ollama offline: See disabled Ollama option
- Flag enabled + Ollama online: See Ollama models list
- Send messages with each mode
- Verify messages saved correctly

**Week 2 Deliverables:**
- ✅ Ollama service fully implemented
- ✅ Backend routes support Ollama
- ✅ Frontend dropdown shows Ollama models
- ✅ Graceful fallback when Ollama fails
- ✅ All functionality behind feature flag

---

### Week 3: Smart Routing (Days 11-15) - MEDIUM RISK

**Goal:** Auto-select best model based on query complexity

#### Day 11-12: Query Analyzer

**File:** `backend/src/services/queryAnalyzer.ts`

**(See full implementation in Feature 2 section above)**

**Testing:**
```typescript
// Test cases
const tests = [
  { query: 'What is React?', expected: 'simple' },
  { query: 'How do I create a component?', expected: 'simple' },
  { query: 'Explain the difference between useEffect and useLayoutEffect and when to use each', expected: 'complex' },
  { query: 'Design a scalable microservices architecture for an e-commerce platform', expected: 'complex' },
  { query: 'Compare MongoDB and PostgreSQL', expected: 'medium' }
];

tests.forEach(test => {
  const result = queryAnalyzer.analyze(test.query);
  assert.equal(result.level, test.expected);
});
```

---

#### Day 13-14: Model Router

**File:** `backend/src/services/modelRouter.ts`

**(See full implementation in Feature 2 section above)**

**Configuration Endpoint:**
```typescript
// Allow users to customize routing
router.get('/models/routes', authMiddleware, async (req, res) => {
  res.json(modelRouter.getRoutes());
});

router.put('/models/routes', authMiddleware, async (req, res) => {
  const { mode, level, model } = req.body;
  modelRouter.updateRoute(mode, level, model);
  res.json({ success: true });
});
```

**Testing:**
- Test each complexity level routes correctly
- Test route customization
- Test with missing models (fallback)

---

#### Day 15: Integration & Testing

**Backend Integration:**
```typescript
// backend/src/routes/chatRoutes.ts
router.post('/chat', authMiddleware, async (req, res) => {
  const {
    message,
    modelMode = 'openai',
    selectedModel,
    smartRouting = false  // NEW
  } = req.body;

  let finalModel = selectedModel;
  let complexityInfo;

  // Smart routing (if enabled)
  if (smartRouting && features.smartRouting) {
    const complexity = queryAnalyzer.analyze(message);
    finalModel = modelRouter.selectModel(complexity, modelMode);
    complexityInfo = complexity;

    log.info('Smart routing', {
      query: message.substring(0, 50),
      complexity: complexity.level,
      selectedModel: finalModel,
      indicators: complexity.indicators
    });
  }

  // Execute chat (same as before)
  // ...

  // Save with metadata
  const assistantMessage = await Message.create({
    conversationId,
    role: 'assistant',
    content: response,
    modelUsed: finalModel,
    modelMode: modelMode,
    modelComplexity: complexityInfo?.level,
    smartRoutingUsed: smartRouting
  });

  res.json({
    message: assistantMessage,
    metadata: {
      modelUsed: finalModel,
      complexity: complexityInfo
    }
  });
});
```

**Frontend Integration:**
```tsx
// frontend/components/SmartRoutingToggle.tsx
export function SmartRoutingToggle({ value, onChange }) {
  const featureFlags = useFeatureFlags();

  if (!featureFlags.smartRouting) {
    return null;  // Hide if feature disabled
  }

  return (
    <label className="smart-routing-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
      />
      <span>Smart Model Routing</span>
      <Tooltip>
        Automatically select the best model based on your question complexity.
        Simple → Fast models, Complex → Powerful models
      </Tooltip>
    </label>
  );
}

// Add to chat page
const [smartRouting, setSmartRouting] = useState(false);

<SmartRoutingToggle
  value={smartRouting}
  onChange={setSmartRouting}
/>
```

**Testing:**
- Test simple queries → small models
- Test complex queries → large models
- Test with feature flag disabled
- Monitor routing decisions in logs
- Get user feedback on routing quality

**Week 3 Deliverables:**
- ✅ Query analyzer working
- ✅ Model router implemented
- ✅ Smart routing integrated in chat
- ✅ Frontend toggle available
- ✅ Logging for debugging routing decisions

---

### Week 4: Polish & Launch (Days 16-20) - LOW RISK

**Goal:** UI polish, documentation, and gradual rollout

#### Day 16-17: Model Badge UI

**Files:**
- `frontend/components/ModelBadge.tsx` (created)
- `frontend/components/ChatMessage.tsx` (modified)
- `frontend/styles/ModelBadge.css` (created)

**(See full implementation in Feature 3 section above)**

**Testing:**
- Verify badges show for new messages
- Verify backward compatibility (old messages without metadata)
- Test different badge styles (Ollama vs OpenAI)
- Test "Auto:" prefix for smart-routed messages

---

#### Day 18: Settings Panel

**File:** `frontend/components/Settings.tsx`

**Implementation:**
```tsx
export function Settings() {
  const featureFlags = useFeatureFlags();
  const [settings, setSettings] = useState({
    ollamaEnabled: false,
    smartRouting: false,
    defaultModelMode: 'openai',
    defaultModel: 'gpt-4o-mini'
  });

  // Load user settings
  useEffect(() => {
    fetch('/api/user/settings')
      .then(res => res.json())
      .then(setSettings);
  }, []);

  // Save settings
  async function saveSettings() {
    await fetch('/api/user/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  }

  return (
    <div className="settings-panel">
      <h2>Model Settings</h2>

      {featureFlags.ollama && (
        <Section title="Local Models (Ollama)">
          <Toggle
            label="Enable Ollama models"
            checked={settings.ollamaEnabled}
            onChange={v => setSettings({...settings, ollamaEnabled: v})}
          />
          <p className="help-text">
            Use local Ollama models for privacy and zero API costs.
            Requires Ollama running on your machine.
          </p>
        </Section>
      )}

      {featureFlags.smartRouting && (
        <Section title="Smart Routing">
          <Toggle
            label="Enable smart model routing"
            checked={settings.smartRouting}
            onChange={v => setSettings({...settings, smartRouting: v})}
          />
          <p className="help-text">
            Automatically select the best model based on question complexity.
            Simple questions use fast models, complex questions use powerful models.
          </p>
        </Section>
      )}

      <Section title="Default Model">
        <Select
          value={settings.defaultModelMode}
          onChange={e => setSettings({...settings, defaultModelMode: e.target.value})}
        >
          <option value="openai">OpenAI</option>
          {featureFlags.ollama && <option value="ollama">Ollama</option>}
        </Select>

        <Select
          value={settings.defaultModel}
          onChange={e => setSettings({...settings, defaultModel: e.target.value})}
        >
          {/* Model options based on mode */}
        </Select>
      </Section>

      <button onClick={saveSettings}>Save Settings</button>
    </div>
  );
}
```

---

#### Day 19: Documentation

**Files Created:**
- `docs/features/USER-GUIDE-OLLAMA.md`
- `docs/features/USER-GUIDE-SMART-ROUTING.md`
- `docs/features/DEVELOPER-GUIDE-MODEL-SYSTEM.md`

**Content:**
- How to set up Ollama
- How to use model selector
- How smart routing works
- How to customize routing rules
- Troubleshooting guide

**Update Existing Docs:**
- `README.md` - Add features section
- `CONTRIBUTING.md` - Add feature flag guidelines
- `backend/README.md` - Document new API endpoints

---

#### Day 20: Gradual Rollout & Monitoring

**Rollout Plan:**

**Phase 1: Internal Testing (Day 20)**
```bash
# Enable for your account only
FEATURE_OLLAMA_MODELS=true
FEATURE_SMART_ROUTING=true
FEATURE_SHOW_MODEL_USED=true
```

**Phase 2: Beta Testing (Days 21-23)**
- Enable for 10-20% of users
- Monitor logs for errors
- Collect feedback
- Adjust routing rules if needed

**Phase 3: Full Rollout (Day 24+)**
- Enable for all users
- Remove feature flags (code cleanup)
- Archive as stable features

**Monitoring Dashboard:**
```typescript
// Track usage metrics
interface ModelMetrics {
  totalMessages: number;
  ollamaUsage: number;
  openaiUsage: number;
  smartRoutingUsage: number;
  routingAccuracy: number;  // Based on user feedback
  failureRate: number;
  averageResponseTime: {
    ollama: number;
    openai: number;
  };
}

router.get('/admin/metrics/models', authMiddleware, async (req, res) => {
  const metrics = await calculateModelMetrics();
  res.json(metrics);
});
```

**Week 4 Deliverables:**
- ✅ Model badges in UI
- ✅ Settings panel complete
- ✅ Documentation written
- ✅ Gradual rollout started
- ✅ Monitoring in place

---

## Safety Mechanisms

### 1. Feature Flags (Kill Switch)

**Instant Disable:**
```bash
# Something broke? Disable instantly:
FEATURE_OLLAMA_MODELS=false
FEATURE_SMART_ROUTING=false

# Restart backend
pm2 restart gkchatty-backend

# Features disabled, back to normal
```

**No code deploy needed** - just environment variable change

---

### 2. Graceful Fallbacks

**Ollama Offline:**
```typescript
try {
  response = await ollamaService.chat(model, messages);
} catch (error) {
  log.warn('Ollama failed, using OpenAI');
  response = await openaiService.chat('gpt-4o-mini', messages);
}
```

**Smart Routing Failure:**
```typescript
try {
  const complexity = queryAnalyzer.analyze(message);
  model = modelRouter.selectModel(complexity, mode);
} catch (error) {
  log.error('Routing failed, using user selection');
  model = selectedModel;  // Fallback to manual selection
}
```

**Database Migration Failure:**
```typescript
// Old messages without new fields
const modelUsed = message.modelUsed || 'gpt-4o-mini (legacy)';
const modelMode = message.modelMode || 'openai';
```

---

### 3. Backward Compatibility

**Database:**
- All new fields are optional
- Old messages still render correctly
- No migration required

**API:**
- Old requests without `modelMode` default to `'openai'`
- Old requests without `smartRouting` default to `false`
- Existing OpenAI flow untouched

**Frontend:**
- If flags disabled, UI shows old interface
- Progressive enhancement (features appear when enabled)

---

### 4. Monitoring & Alerts

**Log Everything:**
```typescript
log.info('Model selection', {
  query: message.substring(0, 50),
  userSelected: selectedModel,
  actualUsed: finalModel,
  wasRouted: smartRouting,
  complexity: complexity?.level,
  mode: modelMode
});

log.error('Ollama failure', {
  model,
  error: error.message,
  fellBackTo: 'gpt-4o-mini'
});
```

**Alert Conditions:**
- Ollama failure rate > 10%
- Smart routing failure rate > 5%
- Average response time > 30 seconds
- Feature flag toggled off

---

### 5. Rollback Plan

**Severity 1: Feature Broken (e.g., Ollama always fails)**
```bash
# 1. Disable feature flag
FEATURE_OLLAMA_MODELS=false

# 2. Restart backend
pm2 restart gkchatty-backend

# 3. Notify users (banner in UI)
"Local models temporarily unavailable. Using cloud models."

# Time: 2 minutes
```

**Severity 2: Performance Issues (e.g., Smart routing slow)**
```bash
# 1. Disable smart routing
FEATURE_SMART_ROUTING=false

# 2. Restart backend
pm2 restart gkchatty-backend

# Time: 2 minutes
```

**Severity 3: Data Corruption (unlikely with optional fields)**
```bash
# 1. Disable all new features
FEATURE_OLLAMA_MODELS=false
FEATURE_SMART_ROUTING=false
FEATURE_SHOW_MODEL_USED=false

# 2. Restore from backup (if needed)
mongorestore --drop

# 3. Investigate and fix

# Time: 10-30 minutes
```

---

## Testing Strategy

### Unit Tests

**Query Analyzer:**
```typescript
describe('QueryAnalyzer', () => {
  test('classifies simple queries correctly', () => {
    const result = analyzer.analyze('What is React?');
    expect(result.level).toBe('simple');
  });

  test('classifies complex queries correctly', () => {
    const result = analyzer.analyze('Design a scalable microservices architecture');
    expect(result.level).toBe('complex');
  });

  test('handles edge cases', () => {
    const result = analyzer.analyze('');
    expect(result.level).toBe('simple');
  });
});
```

**Model Router:**
```typescript
describe('ModelRouter', () => {
  test('routes simple queries to small models', () => {
    const model = router.selectModel({ level: 'simple' }, 'ollama');
    expect(model).toBe('llama3.2:1b');
  });

  test('routes complex queries to large models', () => {
    const model = router.selectModel({ level: 'complex' }, 'openai');
    expect(model).toBe('gpt-4o');
  });
});
```

---

### Integration Tests

**Ollama Service:**
```typescript
describe('OllamaService', () => {
  test('lists models when Ollama is running', async () => {
    const models = await ollamaService.listModels();
    expect(models.length).toBeGreaterThan(0);
  });

  test('handles Ollama offline gracefully', async () => {
    // Stop Ollama
    const models = await ollamaService.listModels();
    expect(models).toEqual([]);
  });

  test('sends chat messages successfully', async () => {
    const response = await ollamaService.chat('llama3.2:3b', [
      { role: 'user', content: 'Hello' }
    ]);
    expect(response).toBeTruthy();
  });
});
```

**Chat Routes:**
```typescript
describe('POST /api/chat', () => {
  test('uses OpenAI when modelMode is openai', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        conversationId: 'test',
        message: 'Hello',
        modelMode: 'openai',
        selectedModel: 'gpt-4o-mini'
      });

    expect(res.body.metadata.modelMode).toBe('openai');
  });

  test('uses Ollama when modelMode is ollama', async () => {
    // Enable feature flag
    process.env.FEATURE_OLLAMA_MODELS = 'true';

    const res = await request(app)
      .post('/api/chat')
      .send({
        conversationId: 'test',
        message: 'Hello',
        modelMode: 'ollama',
        selectedModel: 'llama3.2:3b'
      });

    expect(res.body.metadata.modelMode).toBe('ollama');
  });

  test('smart routing selects correct model', async () => {
    process.env.FEATURE_SMART_ROUTING = 'true';

    const res = await request(app)
      .post('/api/chat')
      .send({
        conversationId: 'test',
        message: 'Design a complex system',
        modelMode: 'openai',
        smartRouting: true
      });

    expect(res.body.metadata.modelUsed).toBe('gpt-4o');
  });
});
```

---

### End-to-End Tests

**Playwright Tests:**
```typescript
test('user can select Ollama models', async ({ page }) => {
  await page.goto('http://localhost:4003/chat');

  // Enable Ollama feature
  await enableFeatureFlag('FEATURE_OLLAMA_MODELS');

  // Wait for model selector
  await page.waitForSelector('.model-selector');

  // Select Ollama
  await page.selectOption('select[name="modelMode"]', 'ollama');

  // Verify Ollama models appear
  const models = await page.$$eval('select[name="selectedModel"] option',
    options => options.map(o => o.textContent)
  );

  expect(models).toContain('llama3.2:3b');
});

test('smart routing badge appears on messages', async ({ page }) => {
  await page.goto('http://localhost:4003/chat');

  // Enable features
  await enableFeatureFlag('FEATURE_SMART_ROUTING');
  await enableFeatureFlag('FEATURE_SHOW_MODEL_USED');

  // Enable smart routing
  await page.check('input[name="smartRouting"]');

  // Send complex message
  await page.fill('textarea', 'Design a microservices architecture');
  await page.click('button[type="submit"]');

  // Wait for response
  await page.waitForSelector('.model-badge');

  // Verify badge shows "Auto: gpt-4o"
  const badge = await page.textContent('.model-badge');
  expect(badge).toContain('Auto:');
  expect(badge).toContain('gpt-4o');
});
```

---

## Success Metrics

### Week 1 Success Criteria
- ✅ All tests pass
- ✅ Database schema extended (no errors)
- ✅ Feature flags working
- ✅ Zero impact on existing functionality

### Week 2 Success Criteria
- ✅ Ollama models list correctly
- ✅ Chat works with Ollama
- ✅ Graceful fallback when Ollama offline
- ✅ Messages saved with correct metadata
- ✅ Feature can be disabled instantly

### Week 3 Success Criteria
- ✅ Query analyzer accuracy > 80%
- ✅ Smart routing makes sensible choices
- ✅ No performance degradation
- ✅ User feedback positive
- ✅ Logging provides good debugging info

### Week 4 Success Criteria
- ✅ UI polished and intuitive
- ✅ Documentation complete
- ✅ Beta testing successful
- ✅ Ready for full rollout
- ✅ Monitoring dashboard operational

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ollama offline | High | Low | Graceful fallback to OpenAI |
| Smart routing wrong | Medium | Low | User can disable + override |
| Performance degradation | Low | Medium | Monitoring + feature flags |
| Database migration issues | Very Low | High | Optional fields + backward compat |
| User confusion | Low | Low | Documentation + tooltips |
| Breaking existing features | Very Low | High | Feature flags + testing |

**Overall Risk:** LOW (with current mitigation strategies)

---

## Comparison: Old vs New Approach

| Aspect | Old (Merge gkchatty-pure) | New (Incremental Features) |
|--------|---------------------------|----------------------------|
| **Codebase Quality** | "Not in good shape" | Built properly from scratch |
| **Risk Level** | HIGH | LOW |
| **Rollback Time** | Hours (revert merge) | Minutes (toggle flag) |
| **Testing Complexity** | Full regression | Feature-by-feature |
| **User Impact** | Potential breakage | Zero (opt-in) |
| **Timeline** | 7 days (optimistic) | 20 days (realistic) |
| **Maintenance** | Complex (merged code) | Clean (isolated features) |
| **Flexibility** | All-or-nothing | Gradual rollout |

---

## Next Steps After Phase 4

Once Phase 4 is complete and stable, we can consider:

1. **Enhanced Routing** - ML-based complexity detection
2. **Cost Tracking** - Show API costs per conversation
3. **Model Comparison** - A/B test different models
4. **Local Vector DB** - ChromaDB integration (Phase 5)
5. **Full Local Mode** - SQLite + ChromaDB + Ollama (Phase 6)

---

## Conclusion

This revised Phase 4 plan provides a **safe, incremental, and reversible** approach to adding powerful new features:

- ✅ **Ollama Integration** - Local model support
- ✅ **Smart Routing** - Intelligent model selection
- ✅ **Model Transparency** - Know which model answered

All features are:
- Behind feature flags (instant disable)
- Backward compatible (existing functionality untouched)
- Gracefully degrading (fallbacks everywhere)
- Well-tested (unit + integration + E2E)
- Well-documented (user + developer guides)

**Timeline:** 20 days
**Risk:** LOW (vs HIGH for original merge plan)
**Quality:** HIGH (built properly, not inherited)

---

**Ready to begin implementation:** ✅ YES

**Approved By:** Awaiting user approval
**Start Date:** TBD
**Estimated Completion:** TBD + 20 days

---

## Appendix: File Structure After Phase 4

```
backend/
├── src/
│   ├── config/
│   │   └── features.ts           # NEW - Feature flags
│   ├── models/
│   │   └── Message.ts            # MODIFIED - New optional fields
│   ├── routes/
│   │   ├── chatRoutes.ts         # MODIFIED - Supports Ollama + routing
│   │   └── featureRoutes.ts      # NEW - Feature flag API
│   ├── services/
│   │   ├── ollamaService.ts      # NEW - Ollama integration
│   │   ├── queryAnalyzer.ts      # NEW - Complexity detection
│   │   ├── modelRouter.ts        # NEW - Model selection logic
│   │   └── openaiService.ts      # UNCHANGED
│   └── index.ts                  # UNCHANGED
├── .env
│   # NEW VARIABLES:
│   FEATURE_OLLAMA_MODELS=false
│   FEATURE_SMART_ROUTING=false
│   FEATURE_SHOW_MODEL_USED=false
│   OLLAMA_BASE_URL=http://localhost:11434

frontend/
├── components/
│   ├── ModelSelector.tsx         # NEW - Model dropdown
│   ├── SmartRoutingToggle.tsx    # NEW - Toggle for routing
│   ├── ModelBadge.tsx            # NEW - Shows which model
│   ├── ChatMessage.tsx           # MODIFIED - Displays badges
│   └── Settings.tsx              # MODIFIED - New settings
├── hooks/
│   └── useFeatureFlags.ts        # NEW - Feature flag hook
├── styles/
│   └── ModelBadge.css            # NEW - Badge styles

docs/
├── features/
│   ├── OLLAMA-INTEGRATION.md     # NEW
│   ├── SMART-ROUTING.md          # NEW
│   ├── MODEL-TRANSPARENCY.md     # NEW
│   ├── USER-GUIDE-OLLAMA.md      # NEW
│   └── USER-GUIDE-SMART-ROUTING.md  # NEW
└── PHASE-4-REVISED-PLAN.md       # This document
```
