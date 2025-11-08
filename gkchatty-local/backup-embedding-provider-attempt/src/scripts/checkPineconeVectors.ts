import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

(async () => {
  try {
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || 'gkchatty-prod';
    if (!apiKey) {
      console.error('Missing PINECONE_API_KEY');
      process.exit(1);
    }
    const pc = new Pinecone({ apiKey });
    const stats = await pc.index(indexName).describeIndexStats();
    const count = stats.namespaces?.['system-kb']?.recordCount ?? 0;
    console.log('Vector count in system-kb:', count);
  } catch (err: any) {
    console.error('Error checking Pinecone vector count:', err.message);
  }
})();
