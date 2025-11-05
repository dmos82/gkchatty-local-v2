import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { getPineconeIndex } from '../utils/pineconeService';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';

async function verifyReindex() {
  console.log('🔍 EMERGENCY REINDEX VERIFICATION');
  console.log('=================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Check System KB documents
    const systemDocs = await SystemKbDocument.find({});
    console.log(`\n📄 System KB Documents in MongoDB: ${systemDocs.length}`);

    // Check S3 keys
    const docsWithCorrectS3Keys = systemDocs.filter(
      doc => doc.s3Key?.startsWith('system-kb/') && doc.s3Key?.endsWith('.pdf')
    );
    console.log(`✅ Docs with correct S3 keys: ${docsWithCorrectS3Keys.length}`);

    // Check Pinecone
    const pineconeIndex = await getPineconeIndex();
    const targetNamespace = getSystemKbNamespace();
    console.log(`\n📍 Target namespace: "${targetNamespace}"`);

    // Get stats
    const stats = await pineconeIndex.describeIndexStats();
    console.log('\n📊 Pinecone Stats:');
    Object.entries(stats.namespaces || {}).forEach(([ns, data]) => {
      console.log(`  - Namespace "${ns}": ${(data as any).recordCount} vectors`);
    });

    // Query for System KB vectors
    console.log('\n🔍 Querying for System KB vectors...');
    const queryResponse = await pineconeIndex.namespace(targetNamespace).query({
      vector: new Array(1536).fill(0),
      topK: 10,
      includeMetadata: true,
      filter: { sourceType: 'system' },
    });

    console.log(
      `\n✅ Found ${queryResponse.matches?.length || 0} vectors with sourceType: "system"`
    );

    // Check a sample of all vectors
    const allVectorsResponse = await pineconeIndex.namespace(targetNamespace).query({
      vector: new Array(1536).fill(0),
      topK: 5,
      includeMetadata: true,
    });

    console.log('\n📋 Sample vectors in target namespace:');
    allVectorsResponse.matches?.forEach((match: any, i: number) => {
      console.log(`  ${i + 1}. ID: ${match.id}`);
      console.log(`     sourceType: ${match.metadata?.sourceType}`);
      console.log(`     documentId: ${match.metadata?.documentId}`);
      console.log(`     fileName: ${match.metadata?.originalFileName}`);
    });

    // Check environment variables
    console.log('\n🔧 Environment Check:');
    console.log(`  - S3_BUCKET_NAME: ${process.env.S3_BUCKET_NAME || 'NOT SET'}`);
    console.log(`  - AWS_BUCKET_NAME: ${process.env.AWS_BUCKET_NAME || 'NOT SET'}`);
    console.log(`  - S3_BUCKET: ${process.env.S3_BUCKET || 'NOT SET'}`);

    await mongoose.disconnect();
    console.log('\n✅ Verification complete');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyReindex();
