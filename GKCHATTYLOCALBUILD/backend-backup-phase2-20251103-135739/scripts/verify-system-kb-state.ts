#!/usr/bin/env ts-node
/**
 * Verification Script: Check System KB State
 *
 * This script checks the current state of System KB data across all services
 * without making any changes. Safe to run in any environment.
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../utils/mongoHelper';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { Pinecone } from '@pinecone-database/pinecone';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function verifySystemKBState() {
  console.log('\n🔍 Checking System KB State Across All Services...\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`MongoDB URI: ${process.env.MONGO_URI?.substring(0, 30)}...`);
  console.log(`Pinecone Index: ${process.env.PINECONE_INDEX_NAME}`);
  console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}\n`);

  try {
    // Check MongoDB
    console.log('📍 Checking MongoDB systemkbdocuments collection...');
    await connectDB();

    const mongoCount = await SystemKbDocument.countDocuments();
    const sampleDocs = await SystemKbDocument.find().limit(3).select('_id filename createdAt');

    console.log(`Total documents in MongoDB: ${mongoCount}`);
    if (sampleDocs.length > 0) {
      console.log('Sample documents:');
      sampleDocs.forEach(doc => {
        console.log(`  - ID: ${doc._id}, Filename: ${doc.filename}, Created: ${doc.createdAt}`);
      });
    }

    // Check Pinecone
    console.log('\n📍 Checking Pinecone system namespace...');
    try {
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
      });

      const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
      const stats = await index.describeIndexStats();

      const systemNamespaceStats = stats.namespaces?.system;
      if (systemNamespaceStats) {
        console.log(`Vectors in system namespace: ${systemNamespaceStats.vectorCount}`);
      } else {
        console.log('System namespace not found or empty');
      }
    } catch (error) {
      console.error('Error checking Pinecone:', error);
    }

    // Check S3
    console.log('\n📍 Checking S3 system-kb/ prefix...');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const bucketName = process.env.S3_BUCKET_NAME!;
    const prefix = 'system-kb/';

    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 10,
    });

    const listResponse = await s3Client.send(listCommand);
    const objectCount = listResponse.KeyCount || 0;

    console.log(`Objects in S3 system-kb/: ${objectCount}`);
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      console.log('Sample objects:');
      listResponse.Contents.slice(0, 3).forEach(obj => {
        console.log(`  - ${obj.Key} (Size: ${obj.Size} bytes)`);
      });
    }

    console.log('\n✅ Verification complete!');
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    throw error;
  } finally {
    await disconnectDB();
  }
}

// Main execution
(async () => {
  await verifySystemKBState();
  process.exit(0);
})();
