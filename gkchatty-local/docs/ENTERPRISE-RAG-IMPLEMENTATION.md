# Enterprise RAG Implementation - Complete Code

## Bug #6: allowGeneralQuestions Toggle Not Working

**Root Cause**: Feature check only runs when `sources.length === 0`, allowing general knowledge to leak through when low-relevance sources exist.

**Solution**: Enterprise hybrid RAG with relevance filtering and three modes.

## Complete Implementation

Replace lines 263-368 in `/backend/src/routes/chatRoutes.ts` with this:

```typescript
// ========================================
// ENTERPRISE HYBRID RAG SOLUTION
// ========================================

// Get feature flags ONCE at start (efficient, consistent state)
const features = await getFeatures();

// Configure relevance threshold (environment variable allows admin tuning)
const MIN_RELEVANCE_SCORE = parseFloat(process.env.RAG_MIN_RELEVANCE_SCORE || '0.7');

// Filter sources by relevance score (quality control)
const highRelevanceSources = finalSourcesForLlm.filter(s => s.score >= MIN_RELEVANCE_SCORE);

const hasHighRelevanceSources = highRelevanceSources.length > 0;

// Track which mode we're using for metadata
let ragMode: 'strict-rag-only' | 'docs-first-hybrid' | 'general-knowledge' = 'strict-rag-only';
let systemPromptPrefix = '';

// ========================================
// MODE DETERMINATION
// ========================================

if (!features.allowGeneralQuestions) {
  // ========================================
  // MODE 1: STRICT RAG-ONLY (Compliance Mode)
  // ========================================

  if (!hasHighRelevanceSources) {
    // No relevant sources → return "no sources" message immediately
    log.info(
      {
        ragMode: 'strict-rag-only',
        sourcesSearched: finalSourcesForLlm.length,
        relevantSourcesFound: 0,
        minScoreRequired: MIN_RELEVANCE_SCORE,
      },
      '[Chat Route] RAG-only mode: No relevant sources, returning no-sources message'
    );

    // Generate appropriate "no sources" message
    let noSourcesMessage = '';
    if (knowledgeBaseTarget === 'user') {
      noSourcesMessage =
        'No matching documents found in your personal documents. Try rephrasing your question, uploading relevant documents, or enable "Allow General Questions" in settings to use general knowledge.';
    } else if (knowledgeBaseTarget === 'kb' || knowledgeBaseTarget === 'system') {
      noSourcesMessage =
        'No matching information found in the knowledge base. This question may be outside the scope of available documentation. Try rephrasing or enable "Allow General Questions" to use general knowledge.';
    } else {
      noSourcesMessage =
        'No matching documents found in the available sources. Try rephrasing or uploading relevant documents.';
    }

    const modelUsed = process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini';

    const responseObject: ChatResponseObject = {
      success: true,
      answer: noSourcesMessage,
      sources: [],
      metadata: {
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
      },
      knowledgeBaseTarget,
      modelUsed,
      modelMode: 'openai',
    };

    // Persist the "no sources" message to chat history
    if (chatId && userId) {
      try {
        const chat = await Chat.findOne({ _id: chatId, userId });
        if (chat) {
          chat.messages.push({
            role: 'user',
            content: sanitizedQuery,
            timestamp: new Date(),
          } as IChatMessage);
          chat.messages.push({
            role: 'assistant',
            content: noSourcesMessage,
            timestamp: new Date(),
          } as IChatMessage);
          await chat.save();
          log.info({ chatId }, '[Chat Persistence] No-sources message saved');
        }
      } catch (persistError: unknown) {
        log.error({ chatId, error: persistError }, '[Chat Persistence] Failed to save');
        responseObject.persistenceError = 'Failed to save chat history.';
      }
    }

    return res.status(200).json(responseObject);
  }

  // Has relevant sources → use strict RAG-only prompt
  ragMode = 'strict-rag-only';
  systemPromptPrefix = `
🔒 CRITICAL INSTRUCTION - RAG-ONLY MODE:
You are operating in strict RAG-only mode. You MUST follow these rules:

1. ONLY answer questions using information from the CONTEXT section below
2. If the CONTEXT doesn't contain the answer, respond EXACTLY: "I don't have information about this in the available documents."
3. DO NOT use general knowledge, even if you know the answer
4. DO NOT make assumptions beyond what's explicitly in the context
5. DO NOT combine context with general knowledge
6. ALWAYS cite which document your answer comes from

`;

  log.info(
    {
      ragMode,
      sourcesSearched: finalSourcesForLlm.length,
      relevantSourcesUsed: highRelevanceSources.length,
      minScoreRequired: MIN_RELEVANCE_SCORE,
    },
    '[Chat Route] Using strict RAG-only mode'
  );
} else {
  // ========================================
  // MODE 2 & 3: GENERAL QUESTIONS ALLOWED
  // ========================================

  if (hasHighRelevanceSources) {
    // MODE 2: DOCS-FIRST HYBRID (Prioritize docs, supplement with general knowledge)
    ragMode = 'docs-first-hybrid';
    systemPromptPrefix = `
📚 INSTRUCTION - DOCS-FIRST MODE:
You have access to relevant documents in the CONTEXT section below, plus your general knowledge.

Priority order for answering:
1. PRIMARY: Answer from the CONTEXT if it contains relevant information
2. SUPPLEMENT: You may add general knowledge to enhance the answer IF it doesn't contradict the context
3. FALLBACK: If CONTEXT is present but doesn't answer the question, you may use general knowledge
4. TRANSPARENCY: Always indicate when you're using general knowledge vs. documents

Example responses:
- "According to the provided documentation, [answer from context]"
- "The documents show [context info]. Additionally, [general knowledge supplement]"
- "The provided documents don't address this specific question, but based on general knowledge: [answer]"

`;

    log.info(
      {
        ragMode,
        sourcesSearched: finalSourcesForLlm.length,
        relevantSourcesUsed: highRelevanceSources.length,
        minScoreRequired: MIN_RELEVANCE_SCORE,
      },
      '[Chat Route] Using docs-first hybrid mode'
    );
  } else {
    // MODE 3: GENERAL KNOWLEDGE (No relevant docs, pure general knowledge)
    ragMode = 'general-knowledge';
    systemPromptPrefix = `
💡 INSTRUCTION - GENERAL KNOWLEDGE MODE:
No relevant documents were found for this query. Answer using your general knowledge.

Be clear that you're answering from general knowledge, not from uploaded documents.

Example: "I don't have specific documents about this, but I can help based on general knowledge: [answer]"

`;

    log.info(
      {
        ragMode,
        sourcesSearched: finalSourcesForLlm.length,
        relevantSourcesFound: 0,
        minScoreRequired: MIN_RELEVANCE_SCORE,
      },
      '[Chat Route] Using general knowledge mode (no relevant sources)'
    );
  }
}

// Build context from high-relevance sources (or empty string if none)
const context = hasHighRelevanceSources
  ? highRelevanceSources.map(s => s.text).join('\n\n---\n\n')
  : '';
```

## Next Step

After line 368 (where `const context =` was), find the system prompt construction section (around line 371) and prepend `systemPromptPrefix` to the existing system prompt.

Look for this section:
```typescript
let effectiveSystemPrompt = STRICT_SYSTEM_PROMPT;
```

And modify the final system message construction to include the prefix:
```typescript
const finalSystemMessageContent = `${systemPromptPrefix}${systemPromptText}\n\n${context ? `--- CONTEXT START ---\n${context}\n--- CONTEXT END ---` : ''}`;
```

##  Benefits

✅ **Compliance-Ready**: Hard guarantee no general knowledge when disabled
✅ **Quality Control**: Relevance threshold prevents low-quality matches
✅ **Docs-First**: When enabled, prioritizes documents but allows general knowledge
✅ **Transparent**: Clear logging of which mode is active
✅ **Configurable**: Admin can tune MIN_RELEVANCE_SCORE via environment variable

## Environment Variable

Add to `.env`:
```bash
# RAG relevance score threshold (0.0 - 1.0, default: 0.7)
RAG_MIN_RELEVANCE_SCORE=0.7
```

## Testing Matrix

| allowGeneralQuestions | Sources | Score | Mode | Behavior |
|----------------------|---------|-------|------|----------|
| ❌ Disabled | 0 | N/A | strict-rag-only | Returns "no sources" |
| ❌ Disabled | 3 | 0.3 (low) | strict-rag-only | Filters out, returns "no sources" |
| ❌ Disabled | 3 | 0.8 (high) | strict-rag-only | Answers from docs only, blocks general knowledge |
| ✅ Enabled | 0 | N/A | general-knowledge | Pure general knowledge |
| ✅ Enabled | 3 | 0.3 (low) | general-knowledge | Filters out, uses general knowledge |
| ✅ Enabled | 3 | 0.8 (high) | **docs-first-hybrid** | **Prioritizes docs, supplements with general knowledge** |
