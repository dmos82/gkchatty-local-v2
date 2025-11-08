/**
 * RAG (Retrieval-Augmented Generation) Configuration
 *
 * Centralized configuration for chunk sizes, embeddings, and retrieval settings.
 * All RAG-related constants should be imported from this file to ensure consistency.
 */

export const RAG_CONFIG = {
  // ============================================
  // CHUNKING CONFIGURATION
  // ============================================

  /**
   * Standard chunk size for most documents (characters)
   * Optimized for GPT-3.5/4 context windows
   */
  CHUNK_SIZE: 1200,

  /**
   * Overlap between chunks to preserve context (characters)
   */
  CHUNK_OVERLAP: 200,

  /**
   * PDF-specific chunk size (may differ due to formatting)
   */
  PDF_CHUNK_SIZE: 1200,

  /**
   * Code file chunk size (smaller for better granularity)
   */
  CODE_CHUNK_SIZE: 800,

  // ============================================
  // EMBEDDING LIMITS
  // ============================================

  /**
   * Maximum tokens for OpenAI text-embedding-ada-002
   * Model limit: 8191 tokens
   */
  MAX_EMBEDDING_TOKENS: 8191,

  /**
   * Average character-to-token ratio for estimation
   * OpenAI: ~4 characters per token
   */
  AVG_CHAR_TO_TOKEN_RATIO: 4,

  /**
   * Safety margin for token counting (multiplier)
   */
  TOKEN_SAFETY_MARGIN: 0.9,

  // ============================================
  // RETRIEVAL CONFIGURATION
  // ============================================

  /**
   * Number of top results to retrieve from vector search
   */
  TOP_K_RESULTS: 5,

  /**
   * Minimum similarity score threshold (0-1)
   */
  SIMILARITY_THRESHOLD: 0.7,

  /**
   * Maximum total context length for RAG responses (characters)
   */
  MAX_CONTEXT_LENGTH: 6000,

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Validate that chunk size won't exceed embedding token limit
   * @param chunkSize - Size in characters
   * @returns true if valid, false if exceeds limit
   */
  validateChunkSize(chunkSize: number): boolean {
    const estimatedTokens = chunkSize / this.AVG_CHAR_TO_TOKEN_RATIO;
    return estimatedTokens < (this.MAX_EMBEDDING_TOKENS * this.TOKEN_SAFETY_MARGIN);
  },

  /**
   * Estimate token count from character length
   * @param charLength - Number of characters
   * @returns Estimated token count
   */
  estimateTokens(charLength: number): number {
    return Math.ceil(charLength / this.AVG_CHAR_TO_TOKEN_RATIO);
  },

  /**
   * Get recommended chunk size for a document type
   * @param type - Document type: 'pdf', 'code', 'text'
   * @returns Recommended chunk size
   */
  getChunkSizeForType(type: 'pdf' | 'code' | 'text'): number {
    switch (type) {
      case 'pdf':
        return this.PDF_CHUNK_SIZE;
      case 'code':
        return this.CODE_CHUNK_SIZE;
      default:
        return this.CHUNK_SIZE;
    }
  },
};

/**
 * Re-export individual values for convenience
 */
export const {
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  PDF_CHUNK_SIZE,
  CODE_CHUNK_SIZE,
  MAX_EMBEDDING_TOKENS,
  TOP_K_RESULTS,
  SIMILARITY_THRESHOLD,
} = RAG_CONFIG;

/**
 * Export default for easy import
 */
export default RAG_CONFIG;
