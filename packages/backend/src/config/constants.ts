/**
 * Application-wide constants for the GKCHATTY API
 * All magic numbers should be defined here with meaningful names
 */

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

/** Default API server port if not specified in environment */
export const DEFAULT_API_PORT = 4001;

/** Default frontend port for CORS configuration */
export const DEFAULT_FRONTEND_PORT = 3000;

// ============================================================================
// RATE LIMITING
// ============================================================================

/** Maximum retry attempts for Redis reconnection */
export const REDIS_MAX_RETRY_ATTEMPTS = 10;

/** Base delay for Redis reconnection retry (milliseconds) */
export const REDIS_RETRY_BASE_DELAY_MS = 100;

/** Maximum delay for Redis reconnection retry (milliseconds) */
export const REDIS_RETRY_MAX_DELAY_MS = 3000;

/** Standard rate limit window duration (milliseconds) - 15 minutes */
export const RATE_LIMIT_STANDARD_WINDOW_MS = 15 * 60 * 1000;

/** Standard rate limit max requests in development mode */
export const RATE_LIMIT_STANDARD_MAX_DEV = 10000;

/** Standard rate limit max requests in production mode */
export const RATE_LIMIT_STANDARD_MAX_PROD = 100;

/** Default retry after seconds when rate limit info unavailable */
export const RATE_LIMIT_DEFAULT_RETRY_AFTER_SECONDS = 60;

/** Auth rate limit window duration (milliseconds) - 1 minute */
export const RATE_LIMIT_AUTH_WINDOW_MS = 1 * 60 * 1000;

/** Auth rate limit max requests in development mode */
export const RATE_LIMIT_AUTH_MAX_DEV = 200;

/** Auth rate limit max requests in production mode */
export const RATE_LIMIT_AUTH_MAX_PROD = 20;

/** AI rate limit window duration (milliseconds) - 1 minute */
export const RATE_LIMIT_AI_WINDOW_MS = 1 * 60 * 1000;

/** AI rate limit max requests in development mode */
export const RATE_LIMIT_AI_MAX_DEV = 300;

/** AI rate limit max requests in production mode */
export const RATE_LIMIT_AI_MAX_PROD = 30;

/** Upload rate limit window duration (milliseconds) - 5 minutes */
export const RATE_LIMIT_UPLOAD_WINDOW_MS = 5 * 60 * 1000;

/** Upload rate limit max requests in development mode */
export const RATE_LIMIT_UPLOAD_MAX_DEV = 1500;

/** Upload rate limit max requests in production mode */
export const RATE_LIMIT_UPLOAD_MAX_PROD = 150;

/** Default retry after seconds for upload rate limit */
export const RATE_LIMIT_UPLOAD_DEFAULT_RETRY_AFTER_SECONDS = 300;

/** Admin rate limit window duration (milliseconds) - 15 minutes */
export const RATE_LIMIT_ADMIN_WINDOW_MS = 15 * 60 * 1000;

/** Admin rate limit max requests in development mode */
export const RATE_LIMIT_ADMIN_MAX_DEV = 2000;

/** Admin rate limit max requests in production mode */
export const RATE_LIMIT_ADMIN_MAX_PROD = 200;

// ============================================================================
// VALIDATION LIMITS
// ============================================================================

/** Maximum length for persona name */
export const PERSONA_NAME_MAX_LENGTH = 100;

/** Maximum length for persona prompt */
export const PERSONA_PROMPT_MAX_LENGTH = 5000;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/** Default number of retry attempts for Pinecone operations */
export const PINECONE_DEFAULT_RETRY_ATTEMPTS = 3;

/** Minimum timeout for Pinecone retry (milliseconds) */
export const PINECONE_MIN_TIMEOUT_MS = 1000;

/** Maximum timeout for Pinecone retry (milliseconds) */
export const PINECONE_MAX_TIMEOUT_MS = 5000;

/** Retry factor for exponential backoff */
export const RETRY_EXPONENTIAL_FACTOR = 2;

/** Timeout for Pinecone upsert operations (milliseconds) */
export const PINECONE_UPSERT_TIMEOUT_MS = 5000;

/** Reset timeout for Pinecone upsert operations (milliseconds) */
export const PINECONE_UPSERT_RESET_TIMEOUT_MS = 30_000;

/** Reset timeout for Pinecone delete operations (milliseconds) */
export const PINECONE_DELETE_RESET_TIMEOUT_MS = 60_000;

/** Reset timeout for Pinecone query operations (milliseconds) */
export const PINECONE_QUERY_RESET_TIMEOUT_MS = 60_000;

/** Minimum timeout for Mistral API retry (milliseconds) */
export const MISTRAL_MIN_TIMEOUT_MS = 1000;

/** Maximum timeout for Mistral API retry (milliseconds) */
export const MISTRAL_MAX_TIMEOUT_MS = 3000;

/** Reset timeout for Mistral API operations (milliseconds) */
export const MISTRAL_RESET_TIMEOUT_MS = 45_000;

/** Reset timeout for OpenAI API operations (milliseconds) */
export const OPENAI_RESET_TIMEOUT_MS = 60_000;

/** Minimum timeout for retry operations (milliseconds) */
export const RETRY_MIN_TIMEOUT_MS = 1000;

// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================

/** Maximum chunk size for text splitting */
export const MAX_CHUNK_SIZE = 1500;

/** Chunk overlap for text splitting */
export const CHUNK_OVERLAP = 300;

/** Default chunk size for text processing */
export const DEFAULT_CHUNK_SIZE = 1000;

/** Maximum context length for document processing */
export const MAX_CONTEXT_LENGTH = 3000;

/** Batch size for Pinecone vector operations */
export const PINECONE_BATCH_SIZE = 100;

/** Default batch size for metadata fix operations */
export const METADATA_FIX_BATCH_SIZE = 100;

/** Default delay between batches (milliseconds) */
export const BATCH_DELAY_MS = 2000;

/** Delay between retry attempts (milliseconds) */
export const RETRY_DELAY_MS = 100;

/** Standard delay for async operations (milliseconds) */
export const ASYNC_OPERATION_DELAY_MS = 5000;

/** Extended delay for reindexing operations (milliseconds) */
export const REINDEX_OPERATION_DELAY_MS = 8000;

/** Short delay for quick retries (milliseconds) */
export const SHORT_RETRY_DELAY_MS = 1000;

/** Medium delay for batch operations (milliseconds) */
export const MEDIUM_DELAY_MS = 2000;

// ============================================================================
// TESTING
// ============================================================================

/** Default test timeout (milliseconds) */
export const TEST_TIMEOUT_MS = 30000;

/** Auth cookie max age for testing (milliseconds) */
export const AUTH_COOKIE_TEST_MAX_AGE_MS = 60000;

// ============================================================================
// PREVIEW/DISPLAY
// ============================================================================

/** Preview text length for system prompts */
export const SYSTEM_PROMPT_PREVIEW_LENGTH = 100;

/** Preview text length for document text snippets */
export const TEXT_SNIPPET_PREVIEW_LENGTH = 1000;

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================

/** Default SMTP port */
export const DEFAULT_SMTP_PORT = 587;

/** Secure SMTP port (SSL/TLS) */
export const SECURE_SMTP_PORT = 465;

// ============================================================================
// EXTERNAL SERVICES
// ============================================================================

/** Default ChromaDB URL */
export const DEFAULT_CHROMA_URL = 'http://localhost:8000';

/** Default MongoDB port */
export const DEFAULT_MONGODB_PORT = 27017;

/** Default Redis port */
export const DEFAULT_REDIS_PORT = 6379;

/** HTTPS port for production services */
export const HTTPS_PORT = 443;
