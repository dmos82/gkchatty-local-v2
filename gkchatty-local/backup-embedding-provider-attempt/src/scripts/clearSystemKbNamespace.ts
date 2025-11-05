import path from 'path';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

// Load environment variables from apps/api/.env (adjust path if necessary)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

(async () => {
  try {
    const apiKey = process.env.PINECONE_API_KEY;
    const environment = process.env.PINECONE_ENVIRONMENT;
    const indexName = process.env.PINECONE_INDEX_NAME || 'gkchatty-prod';

    if (!apiKey || !environment) {
      console.error(
        '[ClearPinecone] Missing PINECONE_API_KEY or PINECONE_ENVIRONMENT in environment vars.'
      );
      process.exit(1);
    }

    const pinecone = new Pinecone({ apiKey });
    const index = pinecone.index(indexName);

    console.log(
      `[ClearPinecone] Deleting all vectors in namespace 'system-kb' for index '${indexName}'...`
    );
    await index.namespace('system-kb').deleteAll();
    console.log('[ClearPinecone] system-kb namespace cleared successfully.');
  } catch (err: any) {
    console.error('[ClearPinecone] Failed to clear system-kb namespace:', err.message);
    process.exit(1);
  }
})();
