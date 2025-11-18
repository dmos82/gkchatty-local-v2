/**
 * Cleanup Orphaned Vectors Script
 *
 * This script identifies and removes vectors in Pinecone that don't have
 * corresponding documents in MongoDB (ghost documents).
 *
 * Usage:
 *   npx ts-node src/scripts/cleanup-orphaned-vectors.ts [--dry-run] [--namespace <name>]
 *
 * Options:
 *   --dry-run    Only report orphans, don't delete (default)
 *   --delete     Actually delete orphaned vectors
 *   --namespace  Target a specific namespace (default: all)
 *
 * Environment:
 *   Set GKCHATTY_ENV to target specific environment's vectors
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { UserDocument } from '../models/UserDocument';

interface OrphanedVector {
  id: string;
  namespace: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--delete');
  const targetNamespace = args.includes('--namespace')
    ? args[args.indexOf('--namespace') + 1]
    : null;

  console.log('🔍 Orphaned Vector Cleanup Script');
  console.log('==================================\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no deletions)' : '🗑️  DELETE MODE'}`);
  console.log(`Environment: ${process.env.GKCHATTY_ENV || process.env.NODE_ENV || 'local'}`);
  console.log(`Index: ${process.env.PINECONE_INDEX_NAME}`);
  if (targetNamespace) {
    console.log(`Target Namespace: ${targetNamespace}`);
  }
  console.log('');

  // Connect to MongoDB
  console.log('📦 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty');
  console.log('✅ MongoDB connected\n');

  // Initialize Pinecone
  console.log('🌲 Connecting to Pinecone...');
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);
  console.log('✅ Pinecone connected\n');

  // Get index stats to find all namespaces
  console.log('📊 Fetching index statistics...');
  const stats = await index.describeIndexStats();
  console.log(`Total vectors in index: ${stats.totalRecordCount}`);

  const namespaces = stats.namespaces || {};
  console.log(`\nNamespaces found: ${Object.keys(namespaces).length}`);
  Object.entries(namespaces).forEach(([ns, data]) => {
    console.log(`  - ${ns || '(default)'}: ${data.recordCount} vectors`);
  });
  console.log('');

  // Determine which namespaces to check
  const namespacesToCheck = targetNamespace
    ? [targetNamespace]
    : Object.keys(namespaces);

  const allOrphans: OrphanedVector[] = [];

  // Check each namespace
  for (const namespace of namespacesToCheck) {
    console.log(`\n🔍 Checking namespace: "${namespace || '(default)'}"`);

    // Query vectors with a dummy vector to get IDs
    // We need to fetch vectors to check their documentId metadata
    const queryResponse = await index.namespace(namespace).query({
      vector: new Array(1536).fill(0), // dummy vector for OpenAI embeddings dimension
      topK: 10000,
      includeMetadata: true,
    });

    const vectors = queryResponse.matches || [];
    console.log(`  Found ${vectors.length} vectors to check`);

    if (vectors.length === 0) continue;

    // Extract unique document IDs from vectors
    const vectorDocIds = new Map<string, string[]>();
    vectors.forEach((v) => {
      const docId = v.metadata?.documentId as string;
      if (docId) {
        if (!vectorDocIds.has(docId)) {
          vectorDocIds.set(docId, []);
        }
        vectorDocIds.get(docId)!.push(v.id);
      }
    });

    console.log(`  Unique document IDs referenced: ${vectorDocIds.size}`);

    // Check MongoDB for each document ID
    const docIds = Array.from(vectorDocIds.keys());

    // Filter to only valid ObjectIds (24 hex chars)
    const validObjectIds = docIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
    const invalidIds = docIds.filter((id) => !/^[0-9a-fA-F]{24}$/.test(id));

    if (invalidIds.length > 0) {
      console.log(`  ⚠️  Found ${invalidIds.length} non-ObjectId document IDs (likely orphans)`);
    }

    // Check SystemKbDocument collection (only with valid ObjectIds)
    const systemDocs = validObjectIds.length > 0
      ? await SystemKbDocument.find({ _id: { $in: validObjectIds } }).select('_id')
      : [];
    const systemDocIds = new Set(systemDocs.map((d) => d._id.toString()));

    // Check UserDocument collection (user docs)
    const userDocs = validObjectIds.length > 0
      ? await UserDocument.find({ _id: { $in: validObjectIds } }).select('_id')
      : [];
    const userDocIds = new Set(userDocs.map((d) => d._id.toString()));

    // Find orphans
    const orphanedDocIds = docIds.filter(
      (id) => !systemDocIds.has(id) && !userDocIds.has(id)
    );

    console.log(`  Orphaned document IDs: ${orphanedDocIds.length}`);

    // Collect orphaned vector IDs
    orphanedDocIds.forEach((docId) => {
      const vectorIds = vectorDocIds.get(docId) || [];
      vectorIds.forEach((vectorId) => {
        allOrphans.push({
          id: vectorId,
          namespace,
          documentId: docId,
        });
      });
    });
  }

  // Report results
  console.log('\n📋 ORPHANED VECTORS REPORT');
  console.log('===========================\n');
  console.log(`Total orphaned vectors found: ${allOrphans.length}`);

  if (allOrphans.length === 0) {
    console.log('\n✅ No orphaned vectors found! Your index is clean.');
    await mongoose.disconnect();
    return;
  }

  // Group by namespace for reporting
  const byNamespace = new Map<string, OrphanedVector[]>();
  allOrphans.forEach((orphan) => {
    const ns = orphan.namespace || '(default)';
    if (!byNamespace.has(ns)) {
      byNamespace.set(ns, []);
    }
    byNamespace.get(ns)!.push(orphan);
  });

  console.log('\nOrphans by namespace:');
  byNamespace.forEach((orphans, ns) => {
    console.log(`  - ${ns}: ${orphans.length} vectors`);
    // Show first few orphan IDs
    orphans.slice(0, 3).forEach((o) => {
      console.log(`      • ${o.id} (doc: ${o.documentId})`);
    });
    if (orphans.length > 3) {
      console.log(`      ... and ${orphans.length - 3} more`);
    }
  });

  // Delete if not dry run
  if (!dryRun) {
    console.log('\n🗑️  DELETING ORPHANED VECTORS...\n');

    for (const [namespace, orphans] of byNamespace) {
      const vectorIds = orphans.map((o) => o.id);
      console.log(`  Deleting ${vectorIds.length} vectors from "${namespace}"...`);

      try {
        // Delete in batches of 100
        for (let i = 0; i < vectorIds.length; i += 100) {
          const batch = vectorIds.slice(i, i + 100);
          await index.namespace(namespace === '(default)' ? '' : namespace).deleteMany(batch);
          console.log(`    ✅ Deleted batch ${Math.floor(i / 100) + 1}`);
        }
        console.log(`  ✅ Completed deletion for namespace "${namespace}"`);
      } catch (error) {
        console.error(`  ❌ Error deleting from "${namespace}":`, error);
      }
    }

    console.log('\n✅ Cleanup complete!');
  } else {
    console.log('\n⚠️  DRY RUN - No vectors were deleted.');
    console.log('   Run with --delete flag to actually remove orphaned vectors.');
  }

  // Disconnect
  await mongoose.disconnect();
  console.log('\n👋 Done!');
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
