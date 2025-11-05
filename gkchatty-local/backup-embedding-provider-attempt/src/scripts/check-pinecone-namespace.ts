#!/usr/bin/env ts-node
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

async function checkPineconeNamespace() {
  console.log('\n🔍 Checking Pinecone Namespace Status...\n');

  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX_NAME!;
    console.log(`Index Name: ${indexName}`);

    const index = pinecone.index(indexName);

    // Get index statistics
    const stats = await index.describeIndexStats();

    console.log('\n📊 Index Statistics:');
    console.log(`Total vectors in index: ${stats.totalRecordCount || 0}`);

    if (stats.namespaces) {
      console.log('\n📁 Namespaces:');
      Object.entries(stats.namespaces).forEach(([namespace, data]) => {
        console.log(`  - ${namespace}: ${data.recordCount} vectors`);
      });

      // Check specifically for system namespace
      if (stats.namespaces['system']) {
        console.log(
          `\n✅ 'system' namespace exists with ${stats.namespaces['system'].recordCount} vectors`
        );
      } else {
        console.log("\n⚠️  'system' namespace does not exist or is empty");
      }
    } else {
      console.log('\n⚠️  No namespaces found in the index');
    }
  } catch (error) {
    console.error('\n❌ Error checking Pinecone:', error);
  }
}

checkPineconeNamespace();
