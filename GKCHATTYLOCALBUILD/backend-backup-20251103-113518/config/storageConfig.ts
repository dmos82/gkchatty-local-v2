// --- REMOVE LOCAL DEV PATHS ---
/*
const localDevStoragePath = path.resolve(__dirname, '..', '..', '.local_uploads', 'kb_docs');
*/

// --- SIMPLIFY: Use ENV var or default S3 path convention (adjust default if needed) ---
// Assume system docs will live in a prefix within the main bucket
export const KNOWLEDGE_BASE_S3_PREFIX = process.env.KB_S3_PREFIX || 'system_docs/';
console.log(`[Storage Config] KNOWLEDGE_BASE_S3_PREFIX set to: ${KNOWLEDGE_BASE_S3_PREFIX}`);

/*
export const KNOWLEDGE_BASE_DIR = process.env.NODE_ENV === 'production'
  ? process.env.KB_STORAGE_PATH || '/data/knowledge_base_docs'
  : localDevStoragePath;
console.log(`[Storage Config] KNOWLEDGE_BASE_DIR set to: ${KNOWLEDGE_BASE_DIR}`);
*/

// --- REMOVE LOCAL DEV PATHS ---
/*
const localUserDocPath = path.resolve(__dirname, '..', '..', '.local_uploads', 'user_docs');
*/

// --- SIMPLIFY: Use ENV var or default S3 path convention ---
// Assume user docs will live under a prefix within the main bucket
export const USER_DOC_S3_PREFIX = process.env.USER_DOC_S3_PREFIX || 'user_docs/';
console.log(`[Storage Config] USER_DOC_S3_PREFIX set to: ${USER_DOC_S3_PREFIX}`);

/*
export const USER_DOC_DIR = process.env.NODE_ENV === 'production'
  ? process.env.USER_DOC_STORAGE_PATH || '/data/user_docs'
  : localUserDocPath;
console.log(`[Storage Config] USER_DOC_DIR set to: ${USER_DOC_DIR}`); 
*/
