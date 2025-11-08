import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { getSystemKbNamespace } from '../utils/pineconeNamespace';

async function testReindexLocally() {
  console.log('🔍 TESTING SYSTEM KB REINDEX LOCALLY');
  console.log('=====================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Get namespace
    const systemKbNamespace = getSystemKbNamespace();
    console.log(`📍 Target namespace: "${systemKbNamespace}"`);

    // Get System KB documents
    const documents = await SystemKbDocument.find({}).select('_id s3Key filename mimeType').lean();
    console.log(`📄 Found ${documents.length} System KB documents\n`);

    // Test processing first document only
    if (documents.length > 0) {
      const doc = documents[0];
      console.log(`🧪 Testing with first document:`);
      console.log(`  - ID: ${doc._id}`);
      console.log(`  - Filename: ${doc.filename}`);
      console.log(`  - S3 Key: ${doc.s3Key}`);
      console.log(`  - MIME Type: ${doc.mimeType}\n`);

      const bucketName =
        process.env.S3_BUCKET_NAME ||
        process.env.AWS_BUCKET_NAME ||
        'gk-chatty-documents-goldkeyinsurance';

      console.log(`🪣 Using S3 bucket: ${bucketName}`);
      console.log(`🔑 AWS credentials check:`);
      console.log(
        `  - AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '[SET]' : '[NOT SET]'}`
      );
      console.log(
        `  - AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '[SET]' : '[NOT SET]'}`
      );
      console.log(`  - AWS_REGION: ${process.env.AWS_REGION || '[NOT SET]'}\n`);

      try {
        console.log('📥 Attempting to process document...');
        await processAndEmbedDocument(
          doc._id.toString(),
          bucketName,
          doc.s3Key,
          'system',
          doc.filename,
          doc.mimeType,
          undefined,
          'test-reindex-local'
        );
        console.log('✅ Document processed successfully!');
      } catch (error: any) {
        console.error('\n❌ ERROR PROCESSING DOCUMENT:');
        console.error(`  - Error Type: ${error.constructor.name}`);
        console.error(`  - Error Message: ${error.message}`);
        console.error(`  - Error Code: ${error.code || 'N/A'}`);
        console.error(
          `  - Status Code: ${error.statusCode || error.$metadata?.httpStatusCode || 'N/A'}`
        );

        if (error.$metadata) {
          console.error('\n📋 AWS SDK Error Metadata:');
          console.error(JSON.stringify(error.$metadata, null, 2));
        }

        if (error.stack) {
          console.error('\n📚 Stack Trace:');
          console.error(error.stack);
        }
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete');
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

testReindexLocally();
