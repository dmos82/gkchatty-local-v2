import express, { Request, Response, Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { protect, checkSession } from '../middleware/authMiddleware';
import { getChatCompletion, getChatCompletionStream } from '../utils/openaiHelper';
import { withRetry, DEFAULT_OPENAI_RETRY_CONFIG } from '../utils/retryHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import Chat, { IChat, IChatMessage } from '../models/ChatModel';
import User, { IUser } from '../models/UserModel';
import Setting from '../models/SettingModel';
import { inspect } from 'util';
import { getLogger } from '../utils/logger';
import UserSettings, { IUserSettings } from '../models/UserSettings';
import { aiLimiter } from '../middleware/rateLimiter';
import { getContext } from '../services/ragService';
import { auditChatQuery } from '../middleware/auditMiddleware';
import { recordKnowledgeGap } from '../services/knowledgeGapService';

// Type for chat response object
interface ChatResponseObject {
  success: boolean;
  answer: string;
  sources: unknown[];
  metadata?: {
    tokenUsage: { prompt: number; completion: number; total: number };
    cost: number;
  };
  knowledgeBaseTarget?: string;
  chatId?: string;
  persistenceError?: string;
  iconUrl?: string;
  modelUsed?: string; // Show which AI model generated the response
  modelMode?: string; // Show model mode (e.g., "thinking", "chat")
}

const router: Router = express.Router();

const log = getLogger('chatRoute');
// Diagnostic: broaden match criteria
const MIN_SOURCE_SCORE_THRESHOLD = 0.1;

// --- START ADDITION: Model Pricing ---
// NOTE: Update these placeholder values with ACCURATE pricing for your models!
// Prices are per 1,000,000 tokens for consistency with some provider docs
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Prices per MILLION tokens (Input, Output)
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 }, // Example: 2024-04-09 pricing
  'gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  // Fallback/default - set to 0 or a sensible default
  default: { input: 0, output: 0 },
};
// --- END ADDITION: Model Pricing ---

// Apply protect and checkSession middleware to all chat routes
router.use(protect, checkSession);

// Apply AI rate limiter to all chat routes
router.use(aiLimiter);

// New Stricter System Prompt (Task 69) - Kept for fallback
const STRICT_SYSTEM_PROMPT = `You are an AI assistant for Gold Key Insurance. Your ONLY task is to answer the user's question based STRICTLY and SOLELY on the provided context snippets below. Do NOT use any external knowledge or make assumptions. If the answer is explicitly found in the context, provide it concisely. If the answer is NOT explicitly found within the provided snippets, you MUST respond with the exact phrase: 'The provided documents do not contain specific information to answer that question.' Do not add any pleasantries or extra information to this specific phrase.`;

// Utility: safely stringify objects that may contain circular references
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (_) {
    return inspect(obj, { depth: null, colors: false });
  }
}

// POST /api/chats - Handle chat queries and persist history
router.post('/', auditChatQuery, async (req: Request, res: Response): Promise<void | Response> => {
  // Diagnostic log for Render preview (PR31)
  log.debug(
    { path: req.path, method: req.method },
    `PR31_CHAT_ROUTE_HIT_TEST_V2: Request received for /api/chat at ${new Date().toISOString()}`
  );
  log.info({ path: req.path }, 'Chat route hit - request received');

  const userId = req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId;
  // Fetch User and UserSettings documents early
  let userDoc:
    | (mongoose.Document<unknown, object, IUser> & IUser & Required<{ _id: unknown }>)
    | null = null;
  let userSettingsDoc:
    | (mongoose.Document<unknown, object, IUserSettings> &
        IUserSettings &
        Required<{ _id: unknown }>)
    | null = null;

  if (userId) {
    try {
      userDoc = await User.findById(userId).select('isPersonaEnabled canCustomizePersona');
      userSettingsDoc = await UserSettings.findOne({ userId });
    } catch (fetchError: unknown) {
      log.error({ userId, error: fetchError }, 'Error fetching User or UserSettings');
    }
  }

  log.info({ userId }, 'Received chat request');

  const {
    query,
    history = [],
    chatId,
    isNotesInitiated,
    initialChatName: requestedChatName,
    knowledgeBaseTarget: rawKnowledgeBaseTarget,
    searchMode, // Primary field from frontend
    activePersonaId, // Changed from personaId to activePersonaId
  } = req.body as Record<string, unknown>;

  // --- Normalize knowledge base targeting parameters ---
  let knowledgeBaseTarget: string | undefined = (rawKnowledgeBaseTarget as string) || (searchMode as string);

  // Map any legacy values to the canonical set
  switch (knowledgeBaseTarget) {
    case 'system-kb':
      knowledgeBaseTarget = 'kb';
      break;
    case 'user-docs':
      knowledgeBaseTarget = 'user';
      break;
    case 'hybrid':
      knowledgeBaseTarget = 'unified';
      break;
    default:
      // Leave as‐is
      break;
  }

  if (!knowledgeBaseTarget) knowledgeBaseTarget = 'unified';

  // Log the knowledgeBaseTarget being used
  log.info({ searchMode, knowledgeBaseTarget }, 'Search mode mapping and target selection');

  // Use personaIdFromRequest consistent with the new logic
  log.info(
    { activePersonaId: activePersonaId || null },
    'Incoming chat request - persona ID from payload'
  );

  if (!userId) {
    log.error('[Chat] Critical: userId missing after protect middleware.');
    return res
      .status(401)
      .json({ success: false, message: 'Authentication error: User ID could not be determined.' });
  }

  // Validate knowledgeBaseTarget
  if (
    knowledgeBaseTarget !== 'unified' &&
    knowledgeBaseTarget !== 'user' &&
    knowledgeBaseTarget !== 'system' &&
    knowledgeBaseTarget !== 'kb'
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid knowledgeBaseTarget value. Must be "unified", "user", "system", or "kb".',
    });
  }

  // Log the knowledge base target for debugging
  log.info(
    { userId, knowledgeBaseTarget },
    `[Chat Route] Query with knowledgeBaseTarget: ${knowledgeBaseTarget}${
      knowledgeBaseTarget === 'kb' ? ' (System KB + Tenant KBs only)' : ''
    }`
  );

  // Handle chat creation initiated by notes without a query
  if (isNotesInitiated === true && !query) {
    try {
      const defaultChatName =
        typeof requestedChatName === 'string' && requestedChatName.trim()
          ? requestedChatName.trim()
          : 'New Chat (from Notes)';

      log.info(
        { userId, chatName: defaultChatName },
        `[Chat Persistence] Creating new chat for notes for user`
      );
      const newChat: IChat = new Chat({
        userId: new mongoose.Types.ObjectId(userId.toString()),
        chatName: defaultChatName,
        messages: [], // Start with empty messages
        notes: '', // Initialize with empty notes
      });
      await newChat.save();
      log.info(
        { userId, chatId: newChat._id, chatName: defaultChatName },
        `[Chat Persistence] New chat for notes created`
      );
      return res.status(201).json({
        success: true,
        message: 'Chat created successfully for notes.',
        chatId: (newChat._id as Types.ObjectId).toString(),
        chatName: newChat.chatName,
        messages: newChat.messages,
        notes: newChat.notes,
      });
    } catch (dbError: unknown) {
      log.error(
        { error: dbError, userId },
        '[Chat Persistence] Error creating new chat for notes:'
      );
      return res.status(500).json({
        success: false,
        message: 'Failed to create chat for notes.',
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  // Existing logic: if query is missing (and not notesInitiated), it's an error.
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Query is required and cannot be empty.',
    });
  }

  // Sanitize the query
  const sanitizedQuery = query.trim();

  // --- START: Always Search Both (System KB & User Docs) ---
  log.info(
    { userId },
    `[Chat Route] Unified Search: Always querying System KB and User Docs for user`
  );
  // --- END: Always Search Both ---

  // Log with actual userId now that auth is enabled
  log.info(
    { userId, queryPreview: sanitizedQuery.substring(0, 50), chatId },
    `[Chat] Received query from user`
  );

  try {
    // SECURITY: Pass user role for folder permission checks
    const userRole = req.user?.role || 'user';

    const finalSourcesForLlm = await getContext(sanitizedQuery, userId.toString(), {
      knowledgeBaseTarget,
      userRole, // Pass role for permission filtering
    });

    // Debug log to check what sources we got from RAG service
    log.debug(
      {
        sourcesCount: finalSourcesForLlm.length,
        sources: finalSourcesForLlm.map(s => ({
          fileName: s.fileName,
          type: s.type,
          origin: s.origin,
          score: s.score,
          documentId: s.documentId,
        })),
      },
      '[Chat Route] Sources returned from RAG service'
    );

    // Track knowledge gaps: Calculate best score and record if below threshold
    const bestSourceScore = finalSourcesForLlm.length > 0
      ? Math.max(...finalSourcesForLlm.map(s => s.score ?? 0))
      : 0;

    // Record knowledge gap asynchronously (don't block response)
    // The service will only record if bestScore < 0.5
    recordKnowledgeGap(sanitizedQuery, bestSourceScore, userId?.toString() || null).catch(err => {
      log.error({ error: err }, '[Knowledge Gap] Failed to record potential gap');
    });

    // CRITICAL FIX: Check if we have any sources before proceeding
    if (finalSourcesForLlm.length === 0) {
      log.info(
        { knowledgeBaseTarget, query: sanitizedQuery.substring(0, 50) },
        '[Chat Route] No sources found for query - preventing hallucination'
      );

      // Note: Knowledge gap already tracked above (bestSourceScore = 0)

      // Return a specific message based on the search mode
      let noSourcesMessage = '';
      if (knowledgeBaseTarget === 'user') {
        noSourcesMessage =
          'No matching documents found in your personal documents. Please upload relevant documents or try a different search.';
      } else if (knowledgeBaseTarget === 'kb' || knowledgeBaseTarget === 'system') {
        noSourcesMessage =
          'No matching information found in the knowledge base. Please try rephrasing your question or contact support.';
      } else {
        noSourcesMessage =
          'No matching documents found in the available sources. Please try a different search or contact support.';
      }

      // Still save the chat history but with the no-sources message
      const responseObject: ChatResponseObject = {
        success: true,
        answer: noSourcesMessage,
        sources: [],
        metadata: {
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          cost: 0,
        },
        knowledgeBaseTarget,
      };

      // Chat persistence logic (simplified for no-sources case)
      if (userId) {
        try {
          const userMessage: IChatMessage = {
            role: 'user',
            content: sanitizedQuery,
            timestamp: new Date(),
          };

          const assistantMessage: IChatMessage = {
            role: 'assistant',
            content: noSourcesMessage,
            sources: [],
            timestamp: new Date(),
            metadata: responseObject.metadata,
          };

          let chat: IChat | null = null;
          if (chatId && mongoose.Types.ObjectId.isValid(chatId as string)) {
            chat = await Chat.findOne({ _id: chatId as string, userId: userId });
          }

          if (chat) {
            chat.messages.push(userMessage, assistantMessage);
            chat.updatedAt = new Date();
          } else {
            const MAX_TITLE_LENGTH = 40;
            let generatedChatName = sanitizedQuery.substring(0, MAX_TITLE_LENGTH);
            if (sanitizedQuery.length > MAX_TITLE_LENGTH) generatedChatName += '...';
            if (!generatedChatName.trim()) generatedChatName = 'Chat Session';

            chat = new Chat({
              userId: new mongoose.Types.ObjectId(userId.toString()),
              chatName: generatedChatName.trim(),
              messages: [userMessage, assistantMessage],
            });
          }

          if (chat) {
            await chat.save();
            responseObject.chatId = chat._id?.toString();
          }
        } catch (dbError: unknown) {
          log.error({ error: dbError }, '[Chat Persistence] Error saving no-sources chat');
          responseObject.persistenceError = 'Failed to save chat history.';
        }
      }

      return res.status(200).json(responseObject);
    }

    const context = finalSourcesForLlm.map(s => s.text).join('\n\n---\n\n');

    // --- START: Revised Logic for Persona and System Prompt Determination (Supercoder Input) ---
    let effectiveSystemPrompt = STRICT_SYSTEM_PROMPT; // Default fallback
    let promptSource = 'Default'; // Default source for logging

    const isPersonaFeatureEnabledForUser = userDoc?.isPersonaEnabled || false;
    const userCustomPrompt = userSettingsDoc?.customPrompt || '';
    // personaIdFromRequest is already destructured from req.body

    // ARCHITECTURAL FIX: Ignore activePersonaId for non-user knowledge base targets
    // Personas should ONLY be used for "My Docs" (user) mode, never for KB/system modes
    const shouldUsePersona = activePersonaId && knowledgeBaseTarget === 'user';

    if (shouldUsePersona) {
      log.info({ activePersonaId, knowledgeBaseTarget }, 'Processing persona ID for user docs');
    } else if (activePersonaId && knowledgeBaseTarget !== 'user') {
      log.info(
        { activePersonaId, knowledgeBaseTarget },
        'Ignoring persona ID - not in user docs mode'
      );
    }

    if (shouldUsePersona) {
      log.info({ activePersonaId }, 'Processing with persona ID');

      // Import PersonaModel
      const { PersonaModel } = await import('../models/PersonaModel');

      // Attempt to load the user's persona by ID
      const persona = await PersonaModel.findOne({
        _id: activePersonaId,
        userId: userId,
      }).select('name prompt');

      if (persona && persona.prompt) {
        effectiveSystemPrompt = persona.prompt;
        promptSource = `User Persona: ${persona.name} (ID: ${activePersonaId})`;
        log.info(
          {
            personaName: persona.name,
            activePersonaId,
            promptPreview: effectiveSystemPrompt.substring(0, 150),
          },
          'Using user persona prompt'
        );
      } else {
        log.info({ activePersonaId, userId }, 'No persona found for ID - falling back to default');
        // If personaId is provided but not found, fall back to user's custom prompt if enabled
        if (isPersonaFeatureEnabledForUser && userCustomPrompt) {
          effectiveSystemPrompt = userCustomPrompt;
          promptSource = `User Custom Prompt (Persona ID ${activePersonaId} not found)`;
          log.info(
            { promptPreview: effectiveSystemPrompt.substring(0, 150) },
            'Using user custom prompt as fallback'
          );
        } else {
          effectiveSystemPrompt = STRICT_SYSTEM_PROMPT;
          promptSource = `Strict Default (Persona ID ${activePersonaId} not found, User custom prompt N/A)`;
          log.info(
            { activePersonaId },
            'No persona and no user custom prompt - using default system prompt'
          );
        }
      }
    } else {
      log.debug('No persona ID provided in request');
      // No specific personaId from request. Check user's general persona setting.
      if (isPersonaFeatureEnabledForUser && userCustomPrompt) {
        effectiveSystemPrompt = userCustomPrompt;
        promptSource = 'User Custom Prompt (No Persona ID Provided)';
        log.info(
          { promptPreview: effectiveSystemPrompt.substring(0, 150) },
          'Using user custom prompt (no persona ID)'
        );
      } else {
        log.debug('No persona ID and user custom prompt unavailable - checking system default');
        // Fallback to general system prompt from Settings or strict default
        const systemPromptSetting = await Setting.findOne({ key: 'systemPrompt' });
        if (systemPromptSetting && systemPromptSetting.value) {
          effectiveSystemPrompt = systemPromptSetting.value;
          promptSource = 'System Default from Settings (No Persona ID, User custom N/A)';
          log.info(
            { promptPreview: effectiveSystemPrompt.substring(0, 150) },
            'Using general system default prompt from settings'
          );
        } else {
          effectiveSystemPrompt = STRICT_SYSTEM_PROMPT;
          promptSource =
            'Strict Default Fallback (No Persona ID, User custom N/A, System Default N/A)';
          log.info('No system default in settings - using hardcoded strict system prompt');
        }
      }
    }

    // Assign the final prompt to systemPromptText
    const systemPromptText = effectiveSystemPrompt;

    // --- Logging for Debugging (retain these) ---
    const chatLogInfo = {
      userId: userDoc?._id?.toString(), // Ensure toString for ObjectId
      personaIdFromRequest: activePersonaId || null, // Ensure null if undefined
      isPersonaFeatureEnabledForUser,
      userCustomPromptExists: !!userCustomPrompt,
      effectiveSystemPromptSource: promptSource,
      effectiveSystemPromptPreview: systemPromptText.substring(0, 100) + '...',
    };
    log.info(chatLogInfo, 'GKCHATTY Backend: System prompt determined.');
    // --- END: Revised Logic for Persona and System Prompt Determination ---

    const finalSystemMessageContent = `${systemPromptText}\n\n--- CONTEXT START --- \n${context}\n--- CONTEXT END ---`;
    const messagesForOpenAI: OpenAIChatCompletionMessageParam[] = [
      { role: 'system', content: finalSystemMessageContent },
      ...(history as Array<{role?: string; content?: string}>)
        .filter(
          (msg: { role?: string; content?: string }) =>
            msg.role &&
            msg.content &&
            typeof msg.content === 'string' &&
            msg.content.trim().length > 0
        )
        .map((msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content.trim(),
        })),
      { role: 'user' as const, content: sanitizedQuery },
    ];

    // --- START ADDITION: Log messages array before OpenAI call ---
    log.debug('[RAG DEBUG] Messages sent to OpenAI:', JSON.stringify(messagesForOpenAI, null, 2));
    // --- END ADDITION ---

    // --- ADDED DIAGNOSTIC LOGGING (Task 68) ---
    // Add type check to satisfy linter for complex content types, though we expect string here
    const systemContent = messagesForOpenAI[0].content;
    log.debug(
      {
        systemPromptSentToOpenAI:
          typeof systemContent === 'string'
            ? systemContent.substring(0, 150)
            : '[Non-string system content]',
      },
      `[Chat Route] System prompt SENT TO OPENAI (after context injection):`
    );
    log.debug(
      { contextSentToOpenAI: context.substring(0, 150) },
      `[Chat Route] Context SENT TO OPENAI (first 150 chars):`
    );
    // --- END ADDED LOGGING ---

    // 9. Call OpenAI (No change needed here, getChatCompletion takes messages)
    log.debug({ timerLabel: 'OpenAICallDuration' }, 'Timer started for OpenAICallDuration');

    // Add logging to verify OpenAI configuration is being used
    log.info('[Chat Route] Calling getChatCompletion with admin-aware configuration');

    // Wrap the OpenAI call with withRetry to ensure errors are properly retried
    const completion = await withRetry<ChatCompletion>(
      async (): Promise<ChatCompletion> => {
        const result = await getChatCompletion(messagesForOpenAI);
        if (!result) {
          const err = new Error(
            'Failed to get response from AI assistant: Null result'
          ) as Error & { status: number };
          err.status = 503;
          throw err;
        }

        // Additional safety: verify completion tokens and content
        if (result.usage?.completion_tokens === 0 || !result.choices?.[0]?.message?.content) {
          log.error(
            '[Chat Route] Detected zero completion tokens or empty content – triggering retry'
          );
          const err = new Error('OpenAI returned response with no generated content') as Error & {
            status: number;
          };
          err.status = 503;
          throw err;
        }

        return result;
      },
      DEFAULT_OPENAI_RETRY_CONFIG,
      'Chat Route - OpenAI Call'
    );

    log.debug({ timerLabel: 'OpenAICallDuration' }, 'Timer ended for OpenAICallDuration');

    // Log the raw OpenAI response for diagnostic purposes
    log.debug('[OpenAI Raw Chat Response]', safeStringify(completion));

    // --- Token Usage & Cost ---
    let requestCost = 0;
    let tokenUsage = null; // Renamed from usageData for clarity

    // --- START REPLACEMENT: Dynamic Pricing ---
    const configuredModel = process.env.OPENAI_CHAT_MODEL || 'default';
    const prices = MODEL_PRICING[configuredModel] || MODEL_PRICING['default'];

    if (completion && completion.usage) {
      tokenUsage = {
        // Structure for response/persistence
        prompt: completion.usage.prompt_tokens ?? 0,
        completion: completion.usage.completion_tokens ?? 0,
        total: completion.usage.total_tokens ?? 0,
      };

      // Calculate cost based on MILLION tokens pricing
      requestCost =
        (tokenUsage.prompt / 1_000_000) * prices.input +
        (tokenUsage.completion / 1_000_000) * prices.output;

      log.debug(
        {
          model: configuredModel,
          promptTokens: tokenUsage.prompt,
          completionTokens: tokenUsage.completion,
          totalTokens: tokenUsage.total,
          calculatedCost: requestCost.toFixed(8),
        },
        `[Chat] OpenAI usage for model`
      );
      // --- END REPLACEMENT: Dynamic Pricing ---

      // --- Usage Tracking Update (Uses requestCost, tokenUsage.prompt, tokenUsage.completion) ---
      if (userId && tokenUsage.prompt >= 0 && tokenUsage.completion >= 0) {
        try {
          const now = new Date();
          const currentMonthMarker = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          // Select the necessary fields for update logic
          const user = await User.findById(userId).select(
            '+usageMonthMarker +currentMonthPromptTokens +currentMonthCompletionTokens +currentMonthCost'
          );
          if (user) {
            let updateOperation = {};
            // Use requestCost, tokenUsage.prompt, tokenUsage.completion directly
            if (user.usageMonthMarker === currentMonthMarker) {
              updateOperation = {
                $inc: {
                  currentMonthPromptTokens: tokenUsage.prompt,
                  currentMonthCompletionTokens: tokenUsage.completion,
                  currentMonthCost: requestCost,
                },
              };
            } else {
              updateOperation = {
                $set: {
                  usageMonthMarker: currentMonthMarker,
                  currentMonthPromptTokens: tokenUsage.prompt,
                  currentMonthCompletionTokens: tokenUsage.completion,
                  currentMonthCost: requestCost,
                },
              };
            }
            await User.findByIdAndUpdate(userId, updateOperation);
            log.info(`[Usage Tracking] Successfully updated usage stats for user ${userId}`);
          } else {
            log.error(`[Usage Tracking] Could not find user ${userId} to update usage stats.`);
          }
        } catch (usageUpdateError: unknown) {
          log.error(
            { error: usageUpdateError },
            `[Usage Tracking] Failed to update usage stats for user ${userId}:`
          );
        }
      } else {
        if (!userId) log.warn('[Usage Tracking] Cannot update usage stats: userId is missing.');
        if (!(tokenUsage.prompt >= 0 && tokenUsage.completion >= 0))
          log.warn('[Usage Tracking] Cannot update usage stats: Invalid token counts.', {
            tokenUsage,
          });
      }
      // --- END Usage Tracking ---\
    } else {
      log.warn('[Chat] OpenAI completion response did not contain usage data.');
    }
    // --- End Token Usage ---\

    // Note: These checks are redundant now since the withRetry wrapper already validates the response
    // If we get here, the completion object has already been validated

    // Get the answer from the validated completion object
    const answer = completion?.choices?.[0]?.message?.content?.trim() || '';

    // DEBUG: Log the entire completion object to see what OpenAI is returning
    log.debug('[Chat] Full completion object:', JSON.stringify(completion, null, 2));

    // Extract model used from completion response
    const modelUsed = completion?.model || undefined;
    log.debug(`[Chat] Extracted modelUsed: ${modelUsed}`);

    // Validate the answer is not empty before proceeding with chat persistence
    if (!answer || answer.length === 0) {
      log.error('[Chat] OpenAI returned empty or null response content');
      return res.status(500).json({
        success: false,
        message: 'Failed to generate a response. Please try again.',
      });
    }

    log.info('[Chat] Received response from OpenAI.');

    // 8. Prepare response
    const finalSourcesForResponse = await Promise.all(
      finalSourcesForLlm.map(async (fs, index) => {
        // Add detailed logging inside the map function
        log.debug({ index, input: fs }, `[Map Source ${index}] Input fs:`);

        // Add checks for potentially problematic fields
        if (!fs || typeof fs !== 'object') {
          log.warn(
            { index, sourceType: typeof fs },
            `[Map Source ${index}] Skipping invalid source object type:`
          );
          return null; // Skip invalid objects
        }

        // --- Start new filename resolution logic (DB authoritative) ---
        let resolvedFileName: string | null = null; // Renamed to avoid conflict
        const docIdFromFs: string | null = fs.documentId || null; // Renamed to avoid conflict
        const docTypeFromFs: string = fs.type || fs.metadata?.sourceType || 'unknown'; // Renamed & use fs.type first

        // Pinecone-provided filename (used only as a fallback)
        const fileNameFromPinecone: string | null =
          fs.fileName || fs.metadata?.originalFileName || null; // Use fs.fileName first

        try {
          if (docTypeFromFs === 'system' && docIdFromFs) {
            log.debug(
              { docId: docIdFromFs },
              `[SrcMap - System DB] Attempting SystemKbDocument lookup for ID: ${docIdFromFs}. Pinecone proposed: "${fileNameFromPinecone}"`
            );

            const { SystemKbDocument } = await import('../models/SystemKbDocument');
            const systemDoc = await SystemKbDocument.findById(docIdFromFs).select('filename');

            if (systemDoc && systemDoc.filename) {
              resolvedFileName = systemDoc.filename;
              log.info(`[SrcMap - System DB] Using DB filename: "${resolvedFileName}"`);
            } else {
              resolvedFileName = fileNameFromPinecone;
              log.info(
                { docId: docIdFromFs, fileName: fileNameFromPinecone },
                `[SrcMap - System DB] ID ${docIdFromFs} missing in DB or no filename. Using Pinecone fallback: "${resolvedFileName}"`
              );
            }
          } else if (docTypeFromFs === 'user' && docIdFromFs) {
            log.debug(
              { docId: docIdFromFs },
              `[SrcMap - User DB] Attempting UserDocument lookup for ID: ${docIdFromFs}. Pinecone proposed: "${fileNameFromPinecone}"`
            );

            const { UserDocument } = await import('../models/UserDocument');
            const userDocDb = await UserDocument.findById(docIdFromFs).select('originalFileName'); // Renamed userDoc to userDocDb

            if (userDocDb && userDocDb.originalFileName) {
              resolvedFileName = userDocDb.originalFileName;
              log.info(`[SrcMap - User DB] Using DB originalFileName: "${resolvedFileName}"`);
            } else {
              resolvedFileName = fileNameFromPinecone;
              log.info(
                { docId: docIdFromFs, fileName: fileNameFromPinecone },
                `[SrcMap - User DB] ID ${docIdFromFs} missing in DB or no originalFileName. Using Pinecone fallback: "${resolvedFileName}"`
              );
            }
          } else if (docTypeFromFs === 'tenant' && docIdFromFs) {
            log.debug(
              { docId: docIdFromFs },
              `[SrcMap - Tenant DB] Attempting UserDocument lookup for tenant KB ID: ${docIdFromFs}. Pinecone proposed: "${fileNameFromPinecone}"`
            );

            const { UserDocument } = await import('../models/UserDocument');
            const tenantDocDb = await UserDocument.findById(docIdFromFs).select('originalFileName');

            if (tenantDocDb && tenantDocDb.originalFileName) {
              resolvedFileName = tenantDocDb.originalFileName;
              log.info(`[SrcMap - Tenant DB] Using DB originalFileName: "${resolvedFileName}"`);
            } else {
              resolvedFileName = fileNameFromPinecone;
              log.info(
                { docId: docIdFromFs, fileName: fileNameFromPinecone },
                `[SrcMap - Tenant DB] ID ${docIdFromFs} missing in DB or no originalFileName. Using Pinecone fallback: "${resolvedFileName}"`
              );
            }
          } else {
            // Unknown type or missing docId – rely on Pinecone metadata
            resolvedFileName = fileNameFromPinecone;
            log.info(
              { docId: docIdFromFs, docType: docTypeFromFs },
              `[SrcMap - UnknownType/NoID] Using Pinecone fallback: "${resolvedFileName}" for docId: ${docIdFromFs}, docType: ${docTypeFromFs}`
            );
          }
        } catch (fileErr) {
          log.error(
            { error: fileErr },
            `[SrcMap] Error resolving filename for docId ${docIdFromFs}:`
          );
          resolvedFileName = fileNameFromPinecone; // fallback if DB lookup errored
        }

        // Final safety fallback
        if (!resolvedFileName) {
          resolvedFileName = docIdFromFs
            ? `Document ${docIdFromFs}`
            : `Unknown Document (index ${index + 1})`;
          log.info(`[SrcMap - Fallback] Using default fallback filename: "${resolvedFileName}"`);
        }
        // --- End new filename resolution logic ---

        // Ensure required fields exist, provide defaults
        const mappedSource = {
          documentId: fs.documentId || null,
          type: fs.type || fs.metadata?.sourceType || 'unknown', // Use fs.type first
          fileName: resolvedFileName, // Use the determined fileName from above
          score:
            typeof fs.boostedScore === 'number'
              ? fs.boostedScore
              : typeof fs.score === 'number'
                ? fs.score
                : 0,
          keywordMatch: typeof fs.isKeywordMatch === 'boolean' ? fs.isKeywordMatch : false,
          pageNumbers: fs.pageNumbers || [],
          snippet: fs.text || '', // fs.text should be from mapResults (Pinecone metadata.text)
          origin: fs.origin, // Ensure origin is passed through
        };

        log.debug({ index, output: mappedSource }, `[Map Source ${index}] Output mappedSource:`);

        // Filter out objects missing critical info AFTER logging
        if (!mappedSource.documentId) {
          log.warn(
            { docId: mappedSource.documentId },
            `[Map Source ${index}] Filtering out source due to missing ID`
          );
          return null;
        }

        return mappedSource;
      })
    );

    // Filter out nulls and apply score threshold
    const filteredSources = finalSourcesForResponse
      .filter(Boolean) // Remove nulls introduced by the map
      .filter(source => {
        const isRelevantEnough = source!.score >= MIN_SOURCE_SCORE_THRESHOLD;
        if (!isRelevantEnough) {
          log.debug(
            { source: source, threshold: MIN_SOURCE_SCORE_THRESHOLD }, // Log threshold for context
            `[Score Filter] Filtering out source: ${source!.fileName} (Origin: ${source!.origin}, Score: ${source!.score.toFixed(3)} < ${MIN_SOURCE_SCORE_THRESHOLD})`
          );
        } else {
          log.debug(
            {
              fileName: source!.fileName,
              score: source!.score,
              threshold: MIN_SOURCE_SCORE_THRESHOLD,
            },
            `[Score Filter] PASSED: ${source!.fileName} (Score: ${source!.score.toFixed(3)} >= ${MIN_SOURCE_SCORE_THRESHOLD})`
          );
        }
        return isRelevantEnough;
      }) as Array<NonNullable<(typeof finalSourcesForResponse)[0]>>; // Type assertion after filter(Boolean)

    const uniqueSourcesMap = new Map();
    filteredSources.forEach(source => {
      if (source && source.documentId && !uniqueSourcesMap.has(source.documentId)) {
        uniqueSourcesMap.set(source.documentId, source);
      }
    });
    const uniqueFinalSources = Array.from(uniqueSourcesMap.values());
    log.debug(
      {
        filteredSourcesCount: filteredSources.length,
        uniqueSourcesCount: uniqueFinalSources.length,
      },
      `[Chat Deduplicate] Reduced ${filteredSources.length} sources to ${uniqueFinalSources.length} unique sources.`
    );

    const messageMetadata = tokenUsage
      ? { tokenUsage, cost: requestCost, ...(modelUsed && { modelUsed }) }
      : undefined;

    // Check if we should include a custom user icon
    let iconUrl = null;
    try {
      if (knowledgeBaseTarget === 'user') {
        // For user-targeted queries, look for a custom icon
        const userSettingsForIcon = await UserSettings.findOne({ userId }); // Renamed to avoid conflict with userSettingsDoc
        if (userSettingsForIcon?.iconUrl) {
          iconUrl = userSettingsForIcon.iconUrl;
          log.debug(
            { userId, knowledgeBaseTarget },
            '[Chat] Using custom user icon for "user" knowledge base target'
          );
        }
      } else if (knowledgeBaseTarget === 'system') {
        // For system-targeted queries, use a system icon (if we have one defined)
        iconUrl = '/system-kb-icon.png'; // This assumes we have this icon available on the frontend
        log.debug(
          { knowledgeBaseTarget },
          '[Chat] Using system icon for "system" knowledge base target'
        );
      }
      // For unified queries, leave iconUrl as null
    } catch (iconError) {
      log.error({ error: iconError, knowledgeBaseTarget }, '[Chat] Error determining icon:');
    }

    const responseObject: ChatResponseObject = {
      success: true,
      answer,
      sources: uniqueFinalSources,
      metadata: messageMetadata,
      iconUrl,
      knowledgeBaseTarget, // Include the target in the response for the frontend
      modelUsed, // Include model used
      modelMode: 'openai', // Indicate which service was used
    };

    log.debug(
      {
        answerLength: answer.length,
        sourcesCount: uniqueFinalSources.length,
        metadataIncluded: !!messageMetadata,
        hasCustomIcon: !!iconUrl,
      },
      '[Chat] Sending final response. Answer length:'
    );

    // --- DEBUG: Log final sources being returned ---
    log.debug(
      '[Chat Route Final Response] Sources being sent to frontend:',
      JSON.stringify(uniqueFinalSources, null, 2)
    );

    // --- Chat Persistence ---
    if (userId && responseObject && responseObject.answer) {
      try {
        // Additional safety validation before creating messages
        if (!sanitizedQuery || sanitizedQuery.length === 0) {
          throw new Error('User query is empty - cannot save to database');
        }
        if (!responseObject.answer || responseObject.answer.length === 0) {
          throw new Error('Assistant response is empty - cannot save to database');
        }

        const userMessage: IChatMessage = {
          role: 'user',
          content: sanitizedQuery,
          timestamp: new Date(),
        };

        const assistantMessage: IChatMessage = {
          role: 'assistant',
          content: responseObject.answer,
          sources: (uniqueFinalSources || []).map(s => {
            return {
              documentId: s!.documentId!,
              fileName: s!.fileName!,
              type: s!.type || 'unknown',
              pageNumbers: s!.pageNumbers || [],
              snippet: s!.snippet || '',
              // Persist origin if needed, though 'type' already indicates user/system
              // origin: s!.origin
            };
          }),
          timestamp: new Date(),
          metadata: messageMetadata,
        };

        let chat: IChat | null = null;
        if (chatId && mongoose.Types.ObjectId.isValid(chatId as string)) {
          log.info({ userId, chatId }, `[Chat Persistence] Attempting to find existing chat`);
          chat = await Chat.findOne({ _id: chatId as string, userId: userId });
        }

        if (chat) {
          log.info(`[Chat Persistence] Found existing chat ${chatId}. Appending messages.`);
          chat.messages.push(userMessage, assistantMessage);
          chat.updatedAt = new Date();
        } else {
          log.info(
            { userId },
            `[Chat Persistence] No existing chat found or ID invalid/missing. Creating new chat for user`
          );
          const MAX_TITLE_LENGTH = 40;
          let generatedChatName = sanitizedQuery.substring(0, MAX_TITLE_LENGTH);
          if (sanitizedQuery.length > MAX_TITLE_LENGTH) generatedChatName += '...';
          if (!generatedChatName.trim()) generatedChatName = 'Chat Session';

          chat = new Chat({
            userId: new mongoose.Types.ObjectId(userId.toString()),
            chatName: generatedChatName.trim(),
            messages: [userMessage, assistantMessage],
          });
          log.info(
            { userId, chatId: chat._id, chatName: generatedChatName.trim() },
            `[Chat Persistence] New chat object created`
          );
        }

        // Add null check before saving and accessing _id
        if (chat) {
          await chat.save();
          log.info(`[Chat Persistence] Chat ${chat._id} saved successfully.`);
          // Use optional chaining for safety, although chat should exist here
          responseObject.chatId = chat._id?.toString();
        } else {
          // This case should ideally not be reached if creation succeeded
          log.error('[Chat Persistence] CRITICAL: Chat object is null after creation attempt!');
          responseObject.persistenceError = 'Failed to create or save chat history.';
        }
      } catch (dbError: unknown) {
        log.error({ error: dbError }, '[Chat Persistence] Error saving chat to database:');
        responseObject.persistenceError = 'Failed to save chat history.';
      }
    } else {
      if (!userId) log.info('[Chat Persistence] Skipping chat save because userId is missing.');
      if (!responseObject || !responseObject.answer)
        log.error('[Chat Persistence] No answer generated, cannot persist chat message.');
    }
    // --- End Chat Persistence ---

    log.debug({ responseObject }, '[Chat Response] Sending final response object:');
    return res.status(200).json(responseObject);
  } catch (error: unknown) {
    log.error('[Chat] Error processing chat query:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing chat query.',
      error: error instanceof Error ? error.message : String(error) || String(error),
    });
  }
});

// GET /api/chats/latest - Fetch the most recently updated chat for the user
router.get('/latest', async (req: Request, res: Response): Promise<void | Response> => {
  const userId = req.user?._id; // Use optional chaining and get ObjectId directly

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: 'Authentication error: User ID not found.' });
  }

  try {
    log.info({ userId }, 'Fetching latest chat for user');
    const latestChat = await Chat.findOne({ userId: userId }).sort({ updatedAt: -1 }); // Sort by update timestamp descending

    if (!latestChat) {
      log.info({ userId }, 'No chats found for user');
      return res
        .status(200)
        .json({ success: true, chat: null, message: 'No chats found for this user.' });
    } else {
      log.info({ chatId: latestChat._id, updatedAt: latestChat.updatedAt }, 'Found latest chat');
      return res.status(200).json({ success: true, chat: latestChat });
    }
  } catch (error) {
    log.error('[Chat Latest] Error fetching latest chat:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching latest chat.',
      error:
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : String(error),
    });
  }
});

// GET /api/chats - Fetch list of chats for the logged-in user
router.get('/', async (req: Request, res: Response): Promise<void | Response> => {
  const userId = req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: 'Authentication error: User ID not found.' }); // Revert to 401 if auth is required
  }

  try {
    log.info({ userId }, 'Fetching chats for user');
    const chats = await Chat.find({ userId: userId })
      .select('_id chatName updatedAt createdAt')
      .sort({ updatedAt: -1 });

    log.info({ userId, chatsCount: chats.length }, 'Found chats for user');
    return res.status(200).json({ success: true, chats });
  } catch (error) {
    log.error('[Chat List] Error fetching chat list:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching chat list.',
      error:
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : String(error),
    });
  }
});

// GET /api/chats/:chatId - Fetch a specific chat by its ID
router.get('/:chatId', async (req: Request, res: Response): Promise<void | Response> => {
  const userId = req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId;
  const { chatId } = req.params;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: 'Authentication error: User ID not found.' });
  }
  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    log.info(`[Chat Detail] Invalid chatId format received: ${chatId}`);
    return res.status(400).json({ success: false, message: 'Invalid chat ID format.' });
  }

  try {
    log.info({ userId, chatId }, 'Fetching chat');
    const chat = await Chat.findOne({ _id: chatId, userId: userId });

    if (!chat) {
      log.info({ chatId, userId }, 'Chat not found or does not belong to user');
      return res.status(404).json({ success: false, message: 'Chat not found or access denied.' });
    }

    log.info({ chatId, messageCount: chat.messages.length }, 'Successfully fetched chat');
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    log.error('[Chat Detail] Error fetching chat:', error);
    res.status(500).json({ success: false, message: 'Error fetching chat details.' });
  }
});

// DELETE /api/chats - Delete all chats for the logged-in user
router.delete('/', async (req: Request, res: Response): Promise<void | Response> => {
  const userId = req.user?._id;
  const username = req.user?.username; // For logging

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: 'Authentication error: User ID not found.' });
  }
  log.info(
    { username, userId },
    `[Chat Delete All /chats] Request received for user: ${username || 'Unknown'} (ID: ${userId})`
  );

  try {
    const result = await Chat.deleteMany({ userId: userId });
    const deletedCount = result.deletedCount || 0;
    log.info(
      { username, userId, deletedCount },
      `[Chat Delete All /chats] Deleted ${deletedCount} chats for user ${username || 'Unknown'} (ID: ${userId}).`
    );
    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${deletedCount} chat(s).`,
      deletedCount: deletedCount,
    });
  } catch (error: unknown) {
    log.error(
      { error, username, userId },
      `[Chat Delete All /chats] Error deleting chats for user ${username || 'Unknown'} (ID: ${userId}):`
    );
    return res.status(500).json({
      success: false,
      message: 'Error deleting chat history.',
      error: error instanceof Error ? error.message : String(error) || String(error),
    });
  }
});

// Route to update notes for a specific chat
router.put(
  '/:chatId/notes',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    log.info(
      { chatId: req.params.chatId, userId: req.user?._id },
      `[PUT /api/chats/:chatId/notes - ENTRY] ChatId: ${req.params.chatId}, User: ${req.user?._id}`
    );

    const chatId = req.params.chatId;
    const notes = req.body.notes;
    const userId = req.user?._id; // User ID from protect middleware

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      log.info(`[PUT /api/chats/:chatId/notes] Invalid chatId format received: ${chatId}`);
      return res.status(400).json({ message: 'Invalid chat ID format.' });
    }

    if (typeof notes !== 'string') {
      log.info(`[PUT /api/chats/:chatId/notes] Invalid notes format received: ${typeof notes}`);
      return res.status(400).json({ message: 'Notes must be a string' });
    }

    if (!userId) {
      // This should theoretically be caught by 'protect', but double-check
      log.error(
        { userId },
        '[PUT /api/chats/:chatId/notes] Critical: Missing userId after protect middleware.'
      );
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      // Find by ID AND User ID to ensure ownership
      // Use .lean(false) or omit lean() if you need the full Mongoose document with methods like .save()
      const chat = await Chat.findOne({ _id: chatId, userId: userId });

      if (!chat) {
        log.warn(
          { chatId, userId },
          `[PUT /api/chats/:chatId/notes] Chat not found or not owned by user`
        );
        return res.status(404).json({ message: 'Chat not found or access denied' });
      }

      // Update the notes field
      chat.notes = notes;
      chat.updatedAt = new Date(); // Explicitly update timestamp
      await chat.save();

      log.info({ chatId, userId }, `[PUT /api/chats/:chatId/notes] Notes saved for chat`);
      // Send back the updated notes or just a success message
      res
        .status(200)
        .json({ success: true, message: 'Notes saved successfully', notes: chat.notes });
      // Alternatively, use 204 No Content:
      // res.status(204).send();
    } catch (error) {
      log.error(
        { error, chatId, userId },
        `[PUT /api/chats/:chatId/notes] Error saving notes for chat`
      );
      res.status(500).json({ success: false, message: 'Server error saving notes' });
    }
  }
);

// --- ADDED: Route to update chat name ---
router.put(
  '/:chatId/name',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void | Response> => {
    log.info(
      { chatId: req.params.chatId, userId: req.user?._id },
      `[PUT /api/chats/:chatId/name - ENTRY] ChatId: ${req.params.chatId}, User: ${req.user?._id}`
    );

    const chatId = req.params.chatId;
    const newChatName = req.body.chatName;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      log.info(`[PUT /api/chats/:chatId/name] Invalid chatId format: ${chatId}`);
      return res.status(400).json({ message: 'Invalid chat ID format.' });
    }

    if (typeof newChatName !== 'string' || newChatName.trim().length === 0) {
      log.info(`[PUT /api/chats/:chatId/name] Invalid chatName received: ${newChatName}`);
      return res.status(400).json({ message: 'Chat name cannot be empty.' });
    }

    if (!userId) {
      log.error(
        { userId },
        '[PUT /api/chats/:chatId/name] Critical: Missing userId after protect middleware.'
      );
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const chat = await Chat.findOne({ _id: chatId, userId: userId });

      if (!chat) {
        log.warn(
          { chatId, userId },
          `[PUT /api/chats/:chatId/name] Chat not found or not owned by user`
        );
        return res.status(404).json({ message: 'Chat not found or access denied' });
      }

      // Trim the name before saving
      const trimmedName = newChatName.trim();
      chat.chatName = trimmedName;
      chat.updatedAt = new Date(); // Update timestamp
      await chat.save();

      log.info(
        { chatId, userId, chatName: trimmedName },
        `[PUT /api/chats/:chatId/name] Chat name updated for`
      );
      // Send back the updated chat or just a success message
      res
        .status(200)
        .json({ success: true, message: 'Chat name updated successfully', chatName: trimmedName });
    } catch (error) {
      log.error(
        { error, chatId, userId },
        `[PUT /api/chats/:chatId/name] Error updating chat name for`
      );
      res.status(500).json({ success: false, message: 'Server error updating chat name' });
    }
  }
);
// --- END ADDED ROUTE ---

// --- START ADDITION: Delete Chat by ID --- (Uncommenting)
router.delete(
  '/:chatId',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void> => {
    log.info(
      { chatId: req.params.chatId, userId: req.user?._id },
      `[Chat Delete /:chatId - HANDLER ENTRY] Received request to delete chat: ${req.params.chatId} for user: ${req.user?._id}`
    );

    const userId = req.user?._id;
    const { chatId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized: User ID missing.' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      log.info(`[Chat Delete /:chatId] Invalid chatId format received: ${chatId}`);
      res.status(400).json({ success: false, message: 'Invalid chat ID format.' });
      return;
    }

    try {
      log.info(`[Chat Delete /:chatId] Attempting to delete chat ${chatId} for user ${userId}`);
      const result = await Chat.findOneAndDelete({ _id: chatId, userId: userId });

      if (result) {
        log.info(
          { chatId, userId },
          `[Chat Delete /:chatId] Successfully deleted chat ${chatId} for user ${userId}`
        );
        res.status(200).json({ success: true, message: 'Chat deleted successfully.' });
        return;
      } else {
        log.info(
          { chatId, userId },
          `[Chat Delete /:chatId] Chat ${chatId} not found or user ${userId} not authorized to delete.`
        );
        res.status(404).json({ success: false, message: 'Chat not found or not authorized.' });
        return;
      }
    } catch (error: unknown) {
      log.error({ error, chatId, userId }, `[Chat Delete /:chatId] Error deleting chat ${chatId}:`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error deleting chat.' });
        return;
      } else {
        log.error(
          { chatId, userId },
          `[Chat Delete /:chatId] Headers already sent, cannot send error for chat ${chatId}`
        );
        return;
      }
    }
  }
);
// --- END ADDITION: Delete Chat by ID --- (Uncommented)

// --- START: Route to update chat notes (PATCH) ---
// Note: This is functionally similar to the PUT /:chatId/notes. Consider consolidating if PUT is preferred.
router.patch('/:chatId/notes', async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { chatId } = req.params;
  const { notes } = req.body;

  log.info(
    { chatId, userId },
    `[PATCH /notes] Request received for chat ${chatId} by user ${userId}`
  );

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ success: false, message: 'Invalid chat ID format' });
  }

  // Basic validation for notes content (ensure it's a string, could add length limits)
  if (typeof notes !== 'string') {
    // Allow empty string, but reject non-string types
    return res
      .status(400)
      .json({ success: false, message: 'Invalid notes content: must be a string.' });
  }

  try {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      log.info(`[PATCH /notes] Chat not found: ${chatId}`);
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Authorization check: Ensure the logged-in user owns this chat
    if (chat.userId.toString() !== userId?.toString()) {
      log.warn(
        { userId, chatId },
        `[PATCH /notes] Authorization failed: User ${userId} attempted to update notes for chat ${chatId} owned by ${chat.userId}`
      );
      return res
        .status(403)
        .json({ success: false, message: 'Forbidden: You do not own this chat' });
    }

    // Update the notes field
    chat.notes = notes;
    await chat.save();

    log.info(`[PATCH /notes] Notes updated successfully for chat ${chatId}`);
    return res.status(200).json({
      success: true,
      message: 'Notes updated successfully',
      // Optionally return the updated chat or just notes
      // notes: chat.notes
    });
  } catch (error: unknown) {
    log.error({ error, chatId, userId }, `[PATCH /notes] Error updating notes for chat`);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : String(error) || 'Failed to update notes due to server error',
    });
  }
});
// --- END: Route to update chat notes ---

// --- NEW STREAMING CHAT ROUTE ----------------------------------------------------

// POST /api/chats/stream - SSE-style streaming endpoint
router.post(
  '/stream',
  protect,
  checkSession,
  async (req: Request, res: Response): Promise<void> => {
    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const { messages } = req.body as { messages: OpenAIChatCompletionMessageParam[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.write(`event: error\ndata: Invalid or missing messages array\n\n`);
      res.end();
      return;
    }

    let completed = false;

    try {
      await getChatCompletionStream(messages, (chunk: string) => {
        // Stream each delta as an SSE data frame
        res.write(`data: ${chunk.replace(/\n/g, ' ')}\n\n`);
      });
      completed = true;
      res.write('data: [DONE]\n\n');
    } catch (err: unknown) {
      log.error('[Chat Stream] Error during streaming chat completion:', err);
      const errorMessage = err instanceof Error ? err.message : 'Internal server error';
      res.write(`event: error\ndata: ${errorMessage}\n\n`);
    } finally {
      if (!completed) {
        res.write('data: [DONE]\n\n');
      }
      res.end();
    }
  }
);
// --- END STREAMING ROUTE ---------------------------------------------------------

export default router;
