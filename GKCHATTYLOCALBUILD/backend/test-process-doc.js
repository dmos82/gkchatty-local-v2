// Test script to manually trigger document processing
require('dotenv/config'); // Load .env file first
const path = require('path');

// Set additional environment
process.env.USE_SQLITE = 'true';
process.env.FILE_STORAGE_MODE = 'local';
process.env.LOCAL_FILE_STORAGE_DIR = path.join(process.env.HOME, '.gkchatty/data/documents');

async function testProcessDocument() {
  console.log('Loading modules...');

  // Import after env vars are set
  const { processAndEmbedDocument } = require('./dist/utils/documentProcessor');

  const documentId = '897cbf9ba990660076caed45';
  const userId = '6243454cf24e17a1081e5d7e';

  console.log(`Testing document processing for doc: ${documentId}`);
  console.log(`User: ${userId}`);

  try {
    await processAndEmbedDocument(documentId, userId);
    console.log('✅ Document processing completed successfully!');
  } catch (error) {
    console.error('❌ Document processing failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

testProcessDocument();
