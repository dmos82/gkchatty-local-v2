import { getLogger } from '../utils/logger';
import { generateEmbeddings } from '../utils/openaiHelper';
import { queryVectors } from '../utils/pineconeService';
import { UserDocument } from '../models/UserDocument';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getSystemKbNamespace, getUserNamespace } from '../utils/pineconeNamespace';
import { escapeRegExp } from '../utils/regexEscape';

const log = getLogger('ragService');

const KEYWORD_SEARCH_LIMIT = 5;
const SEMANTIC_SEARCH_TOP_K = 8;
const MIN_CONFIDENCE_SCORE = 0.3; // Lowered from 0.5 to capture more potentially relevant results
const KWD_BOOST_FACTOR = 1.5;

interface SearchOptions {
  knowledgeBaseTarget?: 'unified' | 'user' | 'system' | 'kb';
  tenantKbId?: string;
}

async function getContext(
  query: string,
  userId: string,
  options: SearchOptions = {}
): Promise<any[]> {
  const { knowledgeBaseTarget = 'unified' } = options;

  // DEBUG: Log the search mode being used
  log.debug(`[RAG Service] getContext called with knowledgeBaseTarget: ${knowledgeBaseTarget}`);
  log.info({ knowledgeBaseTarget, userId }, '[RAG Service] Starting context retrieval');

  const originalQuery = query;
  let queryForEmbedding = originalQuery.toLowerCase();

  // Query enhancement for contact information requests
  const contactPatterns = /(?:email|mail|phone|tel|contact|address|reach)/i;
  const namePattern = /(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

  if (contactPatterns.test(originalQuery)) {
    const names = originalQuery.match(namePattern);
    if (names && names.length > 0) {
      // Add the person's name as additional context to improve retrieval
      const personName = names[0].trim();
      queryForEmbedding = `${queryForEmbedding} ${personName} contact information`;
      log.info(
        { originalQuery, enhancedQuery: queryForEmbedding },
        '[RAG Service] Enhanced contact query for better retrieval'
      );
    }
  }

  // SECURITY FIX: Escape user query for safe regex operations
  const escapedQuery = escapeRegExp(queryForEmbedding);

  log.debug(
    { originalQuery, queryForEmbedding, escapedQuery },
    `[RAG Service] Starting context search`
  );
  const queryEmbedding = await generateEmbeddings([queryForEmbedding]);
  if (!queryEmbedding || !queryEmbedding[0]) {
    throw new Error('Failed to generate query embedding.');
  }

  let systemKeywordDocIds: string[] = [];
  let userKeywordDocIds: string[] = [];
  let systemResults: any = { matches: [] };
  let userResults: any = { matches: [] };

  // Collect async Pinecone queries to run in parallel when multiple namespaces are required
  const promises: Array<Promise<{ type: 'system' | 'user'; data: any }>> = [];

  log.debug('[DIAGNOSTIC] getRelevantContext started.');
  log.debug(`[DIAGNOSTIC] knowledgeBaseTarget: ${knowledgeBaseTarget}`);

  // Process System KB content search
  if (
    knowledgeBaseTarget === 'unified' ||
    knowledgeBaseTarget === 'system' ||
    knowledgeBaseTarget === 'kb'
  ) {
    // In 'kb' or 'system' mode, we search ONLY System KB documents
    // In 'unified' mode, we search System KB AND user documents
    try {
      const systemKeywordDocs = await SystemKbDocument.find({
        originalFileName: { $regex: escapedQuery, $options: 'i' },
      })
        .select('_id')
        .limit(KEYWORD_SEARCH_LIMIT)
        .lean();
      systemKeywordDocIds = systemKeywordDocs.map(doc => doc._id.toString());
      log.debug(
        { count: systemKeywordDocIds.length },
        '[RAG Service] System KB keyword matches found'
      );
    } catch (e) {
      log.error(e, '[RAG Service] System KB keyword search failed');
    }

    // Construct the Pinecone filter for System KB
    const systemFilter: Record<string, any> = { sourceType: 'system' };

    log.debug(
      { filter: systemFilter, mode: knowledgeBaseTarget },
      '[RAG Service] Using strict system-only filter for system/kb mode'
    );

    // Diagnostic log to confirm the fix
    log.debug(
      `[DIAGNOSTIC] Constructed Pinecone Filter for System KBs: ${JSON.stringify(systemFilter)}`
    );

    // Determine the correct Pinecone namespace based on environment and index
    const searchNamespace = getSystemKbNamespace();

    log.debug(
      {
        searchNamespace,
        indexName: process.env.PINECONE_INDEX_NAME,
        envNamespace: process.env.PINECONE_NAMESPACE,
      },
      '[RAG Service] Using namespace for system KB search'
    );

    // Prepare promise for Pinecone query (execute later if we also need user query)
    const systemQueryPromise = queryVectors(
      queryEmbedding[0],
      SEMANTIC_SEARCH_TOP_K,
      systemFilter,
      searchNamespace
    );

    // Store promise so we can await with others
    promises.push(systemQueryPromise.then(r => ({ type: 'system', data: r })));
  }

  // Process User documents search (only if in user or unified mode)
  if (knowledgeBaseTarget === 'unified' || knowledgeBaseTarget === 'user') {
    try {
      const userKeywordDocs = await UserDocument.find({
        userId,
        sourceType: 'user',
        originalFileName: { $regex: escapedQuery, $options: 'i' },
      })
        .select('_id')
        .limit(KEYWORD_SEARCH_LIMIT)
        .lean();
      userKeywordDocIds = userKeywordDocs.map(doc => doc._id.toString());
      log.debug(
        { count: userKeywordDocIds.length },
        '[RAG Service] User docs keyword matches found'
      );
    } catch (e) {
      log.error(e, '[RAG Service] User docs keyword search failed');
    }

    const userNamespace = getUserNamespace(userId);
    // CRITICAL: In 'user' mode, we must ONLY search for user documents
    const userFilter = {
      userId,
      sourceType: 'user', // STRICT: Only user documents
    };

    const userQueryPromise = queryVectors(
      queryEmbedding[0],
      SEMANTIC_SEARCH_TOP_K,
      userFilter,
      userNamespace
    );

    log.debug(
      { userNamespace, userId, filter: JSON.stringify(userFilter), mode: knowledgeBaseTarget },
      '[RAG Service] Using namespace for user document search'
    );

    promises.push(userQueryPromise.then(r => ({ type: 'user', data: r })));
  }

  // --- Await any queued vector queries (allows concurrent execution) ---
  const resolvedResults = promises.length ? await Promise.all(promises) : [];

  // Assign to systemResults / userResults based on resolution
  resolvedResults.forEach(item => {
    if (item.type === 'system') systemResults = item.data;
    else if (item.type === 'user') userResults = item.data;
  });

  // This log should capture the raw results from Pinecone BEFORE score filtering
  log.debug(`[DIAGNOSTIC] Raw matches from Pinecone: ${JSON.stringify(resolvedResults, null, 2)}`);

  // Combine all keyword doc IDs
  const allKeywordDocIds = [...new Set([...systemKeywordDocIds, ...userKeywordDocIds])];

  // Map results to a consistent format
  const mapResults = (results: any, type: 'system' | 'user') => {
    // Log raw matches before filtering
    const rawMatches = results?.matches || [];
    log.debug(
      {
        type,
        rawMatchCount: rawMatches.length,
        scoreThreshold: MIN_CONFIDENCE_SCORE,
      },
      `[RAG Service] Raw matches before filtering`
    );

    // Enhanced logging: Log ALL matches with their scores and metadata
    if (rawMatches.length > 0) {
      log.info(`[RAG Service - ${type}] ALL PINECONE MATCHES (before filtering):`);
      rawMatches.forEach((match: any, idx: number) => {
        log.info(
          {
            index: idx,
            matchId: match.id,
            score: match.score,
            documentId: match.metadata?.documentId,
            fileName: match.metadata?.originalFileName,
            sourceType: match.metadata?.sourceType,
            textPreview: match.metadata?.text?.substring(0, 200) + '...',
            wouldPassFilter: match.score >= MIN_CONFIDENCE_SCORE,
          },
          `[RAG Service - ${type}] Match ${idx + 1}/${rawMatches.length}`
        );
      });
    }

    return rawMatches
      .filter((match: any) => {
        const threshold = MIN_CONFIDENCE_SCORE;
        const passesThreshold = match.score >= threshold;

        if (!passesThreshold) {
          log.debug(
            {
              matchId: match.id,
              score: match.score,
              threshold: threshold,
              sourceType: match.metadata?.sourceType,
              fileName: match.metadata?.originalFileName,
            },
            `[RAG Service] Filtering out low-score match`
          );
        }
        return passesThreshold;
      })
      .map((match: any) => {
        const docId = match.metadata?.documentId;
        const sourceType = match.metadata?.sourceType || type;
        let origin = 'Unknown';

        if (sourceType === 'system') {
          origin = 'System KB';
        } else {
          origin = 'My Document';
        }

        return {
          id: match.id,
          score: match.score,
          boostedScore:
            docId && allKeywordDocIds.includes(docId)
              ? match.score * KWD_BOOST_FACTOR
              : match.score,
          isKeywordMatch: docId && allKeywordDocIds.includes(docId),
          text: match.metadata?.text || '',
          fileName: match.metadata?.originalFileName || 'Unknown',
          documentId: docId || null,
          type: sourceType,
          origin: origin,
        };
      });
  };

  // CRITICAL FIX: Strict result combination based on search mode
  let allCombinedSources: any[] = [];

  // Add comprehensive logging for debugging
  log.info(
    {
      knowledgeBaseTarget,
      systemResultsCount: systemResults?.matches?.length || 0,
      userResultsCount: userResults?.matches?.length || 0,
    },
    '[RAG Service] Raw result counts before combination'
  );

  if (knowledgeBaseTarget === 'user') {
    // In 'user' mode, ONLY include user results - NEVER system
    allCombinedSources = [...mapResults(userResults, 'user')];

    // CRITICAL: Filter out any non-user documents that might have contaminated user results
    allCombinedSources = allCombinedSources.filter(source => {
      const isUserDoc = source.type === 'user';
      if (!isUserDoc) {
        log.warn(
          {
            fileName: source.fileName,
            sourceType: source.type,
            origin: source.origin,
          },
          '[RAG Service] CONTAMINATION DETECTED: Non-user document found in user mode - filtering out'
        );
      }
      return isUserDoc;
    });

    log.info(
      { count: allCombinedSources.length },
      '[RAG Service] User mode: Using ONLY user documents'
    );
  } else if (knowledgeBaseTarget === 'system' || knowledgeBaseTarget === 'kb') {
    // In 'system' or 'kb' mode, ONLY include system KB results - NEVER user
    allCombinedSources = [...mapResults(systemResults, 'system')];

    // CRITICAL: Filter out any non-system documents that might have contaminated system results
    allCombinedSources = allCombinedSources.filter(source => {
      const isSystemDoc = source.type === 'system';
      if (!isSystemDoc) {
        log.warn(
          {
            fileName: source.fileName,
            sourceType: source.type,
            origin: source.origin,
          },
          '[RAG Service] CONTAMINATION DETECTED: Non-system document found in system/kb mode - filtering out'
        );
      }
      return isSystemDoc;
    });

    log.info(
      { count: allCombinedSources.length },
      '[RAG Service] System/KB mode: Using ONLY system KB documents'
    );
  } else if (knowledgeBaseTarget === 'unified') {
    // In 'unified' mode, include ALL results
    allCombinedSources = [
      ...mapResults(systemResults, 'system'),
      ...mapResults(userResults, 'user'),
    ];

    log.info(
      { count: allCombinedSources.length },
      '[RAG Service] Unified mode: Using system and user document types'
    );
  }

  // Log detailed breakdown of what we're including
  const sourceBreakdown = allCombinedSources.reduce(
    (acc, source) => {
      acc[source.type] = (acc[source.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  log.info(
    {
      mode: knowledgeBaseTarget,
      breakdown: sourceBreakdown,
      totalSources: allCombinedSources.length,
    },
    '[RAG Service] Final source breakdown by type'
  );

  allCombinedSources.sort((a, b) => b.boostedScore - a.boostedScore);

  // CRITICAL FIX: Validate that documents still exist in MongoDB before returning
  // This filters out "ghost documents" that exist in Pinecone but were deleted from MongoDB
  log.debug(
    { count: allCombinedSources.length },
    '[RAG Service] Validating documents exist in MongoDB (ghost document filter)'
  );

  const documentIdsToValidate = allCombinedSources
    .map(source => source.documentId)
    .filter(Boolean);

  // Query MongoDB to get list of valid document IDs AND correct filenames
  // This ensures we show the actual filename, not the S3 key
  const validSystemDocs = await SystemKbDocument.find({
    _id: { $in: documentIdsToValidate },
  })
    .select('_id originalFileName')
    .lean();

  const validSystemDocMap = new Map(
    validSystemDocs.map(doc => [doc._id.toString(), doc.originalFileName])
  );

  const validUserDocs = await UserDocument.find({
    _id: { $in: documentIdsToValidate },
    userId, // CRITICAL: Also filter by userId for user documents
  })
    .select('_id originalFileName')
    .lean();

  const validUserDocMap = new Map(
    validUserDocs.map(doc => [doc._id.toString(), doc.originalFileName])
  );

  // Filter out ghost documents and fix filenames from MongoDB
  const validatedSources = allCombinedSources
    .filter(source => {
      if (!source.documentId) {
        log.warn(
          { fileName: source.fileName },
          '[RAG Service] GHOST DOCUMENT: Missing documentId - filtering out'
        );
        return false;
      }

      const isValidSystem = source.type === 'system' && validSystemDocMap.has(source.documentId);
      const isValidUser = source.type === 'user' && validUserDocMap.has(source.documentId);

      if (!isValidSystem && !isValidUser) {
        log.warn(
          {
            documentId: source.documentId,
            fileName: source.fileName,
            sourceType: source.type,
            userId,
          },
          '[RAG Service] GHOST DOCUMENT: Not found in MongoDB or wrong user - filtering out'
        );
        return false;
      }

      return true;
    })
    .map(source => {
      // Fix filename from MongoDB if it's a numeric S3 key
      const correctFileName =
        source.type === 'system'
          ? validSystemDocMap.get(source.documentId)
          : validUserDocMap.get(source.documentId);

      // Detect if Pinecone has the S3 key instead of the actual filename
      const hasNumericFilename = /^\d{13}-\d+\.pdf$/.test(source.fileName);

      if (correctFileName && (hasNumericFilename || source.fileName === 'Unknown')) {
        log.debug(
          {
            documentId: source.documentId,
            pineconeFileName: source.fileName,
            mongoFileName: correctFileName,
          },
          '[RAG Service] FILENAME FIX: Corrected S3 key to actual filename from MongoDB'
        );

        return {
          ...source,
          fileName: correctFileName,
        };
      }

      return source;
    });

  const ghostCount = allCombinedSources.length - validatedSources.length;
  if (ghostCount > 0) {
    log.warn(
      {
        totalSources: allCombinedSources.length,
        validSources: validatedSources.length,
        ghostDocuments: ghostCount,
      },
      '[RAG Service] GHOST DOCUMENTS DETECTED AND FILTERED'
    );
  } else {
    log.debug('[RAG Service] All documents validated - no ghost documents found');
  }

  // Deduplicate by fileName, keeping the highest-scoring entry for each document
  const uniqueSourcesMap = new Map<string, any>();
  for (const source of validatedSources) {
    if (!uniqueSourcesMap.has(source.fileName)) {
      uniqueSourcesMap.set(source.fileName, source);
    }
  }
  const deduplicatedSources = Array.from(uniqueSourcesMap.values());

  log.info(
    {
      initialCount: allCombinedSources.length,
      validatedCount: validatedSources.length,
      deduplicatedCount: deduplicatedSources.length,
      ghostFiltered: ghostCount,
      removedDuplicates: validatedSources.length - deduplicatedSources.length,
    },
    'Validated and deduplicated search results'
  );

  return deduplicatedSources;
}

export { getContext };
