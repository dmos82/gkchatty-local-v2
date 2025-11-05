#!/usr/bin/env ts-node
/**
 * CRITICAL PRODUCTION SCRIPT: Purge System KB Data
 *
 * This script performs a complete purge of System KB data across all services:
 * 1. Pinecone - Deletes all vectors in the 'system-kb' namespace (corrected namespace)
 * 2. MongoDB - Deletes all documents from systemkbdocuments collection
 * 3. S3 - Deletes all objects under the system-kb/ prefix
 *
 * USE WITH EXTREME CAUTION - THIS IS DESTRUCTIVE AND IRREVERSIBLE
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../utils/mongoHelper';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { Pinecone } from '@pinecone-database/pinecone';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import * as readline from 'readline';

// Verify we're in production environment
if (process.env.NODE_ENV !== 'production') {
  console.error('❌ This script must be run with NODE_ENV=production');
  process.exit(1);
}

// Double-check confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirmAction(): Promise<boolean> {
  return new Promise(resolve => {
    rl.question(
      '\n⚠️  WARNING: This will PERMANENTLY DELETE all System KB data from production.\n' +
        'This includes:\n' +
        '- All vectors in Pinecone system-kb namespace\n' + // Updated namespace in warning
        '- All documents in MongoDB systemkbdocuments collection\n' +
        '- All files in S3 system-kb/ prefix\n\n' +
        'Type "DELETE SYSTEM KB" to confirm: ',
      answer => {
        rl.close();
        resolve(answer === 'DELETE SYSTEM KB');
      }
    );
  });
}

async function purgeSystemKB() {
  console.log('\n🚀 Starting System KB Purge Process...\n');

  try {
    // Step 1: Purge Pinecone
    console.log('📍 Step 1: Purging Pinecone system-kb namespace...'); // Updated namespace in log
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
    const namespace = 'system-kb'; // *** CRITICAL CORRECTION: Use 'system-kb' namespace ***

    try {
      // Delete all vectors in the system-kb namespace
      await index.namespace(namespace).deleteAll();
      console.log('✅ Pinecone system-kb namespace purged successfully'); // Updated namespace in log
    } catch (error: any) {
      // Check if it's a 404 error indicating namespace doesn't exist or is empty
      if (error.name === 'PineconeNotFoundError' && error.message.includes('404')) {
        console.log(
          '⚠️  Pinecone system-kb namespace is already empty or does not exist. Skipping Pinecone purge.' // Updated namespace in warning
        );
      } else {
        // For any other error, throw it to stop the script
        console.error('❌ Error purging Pinecone:', error);
        throw error;
      }
    }

    // Step 2: Purge MongoDB
    console.log('\n📍 Step 2: Purging MongoDB systemkbdocuments collection...');
    await connectDB();

    const deleteResult = await SystemKbDocument.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} documents from MongoDB`);

    // Step 3: Purge S3
    console.log('\n📍 Step 3: Purging S3 system-kb/ prefix...');

    // Validate S3 configuration
    const bucketName = process.env.S3_BUCKET_NAME;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error('AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are not set');
    }

    console.log(`Using S3 bucket: ${bucketName}`);

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    const prefix = 'system-kb/';
    let deletedCount = 0;

    // List and delete all objects with system-kb/ prefix
    let continuationToken: string | undefined;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteParams = {
          Bucket: bucketName,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key! })),
          },
        };

        await s3Client.send(new DeleteObjectsCommand(deleteParams));
        deletedCount += listResponse.Contents.length;
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    console.log(`✅ Deleted ${deletedCount} objects from S3`);

    // Verification
    console.log('\n📍 Verification: Checking all services are empty...');

    // Verify MongoDB is empty
    const mongoCount = await SystemKbDocument.countDocuments();
    console.log(`MongoDB systemkbdocuments count: ${mongoCount}`);

    // Verify S3 is empty
    const verifyListCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 1,
    });
    const verifyResponse = await s3Client.send(verifyListCommand);
    const s3Count = verifyResponse.KeyCount || 0;
    console.log(`S3 system-kb/ object count: ${s3Count}`);

    if (mongoCount === 0 && s3Count === 0) {
      console.log('\n✅ SUCCESS: All System KB data has been purged successfully!');
      console.log('📝 The Project Lead can now upload fresh System KB documents.');
    } else {
      console.log('\n⚠️  WARNING: Some data may still remain. Please investigate.');
    }
  } catch (error) {
    console.error('\n❌ Error during purge process:', error);
    throw error;
  } finally {
    await disconnectDB();
  }
}

// Main execution
(async () => {
  const confirmed = await confirmAction();

  if (!confirmed) {
    console.log('\n❌ Operation cancelled by user');
    process.exit(0);
  }

  await purgeSystemKB();
  process.exit(0);
})();
