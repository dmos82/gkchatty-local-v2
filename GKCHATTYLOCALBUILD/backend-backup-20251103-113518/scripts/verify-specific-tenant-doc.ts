import { connectDB } from '../utils/mongoHelper';
import { getPineconeIndex } from '../utils/pineconeService';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import { UserDocument } from '../models/UserDocument';

const verifyDocument = async () => {
  await connectDB();

  // First, let's see what tenant KBs exist
  console.log('=== DISCOVERING TENANT KNOWLEDGE BASES ===');
  const allTenantKBs = await TenantKnowledgeBase.find({})
    .select('_id name documentCount isActive')
    .lean();

  console.log(`Found ${allTenantKBs.length} Tenant Knowledge Bases:`);
  allTenantKBs.forEach((kb, index) => {
    console.log(
      `  ${index + 1}. "${kb.name}" (ID: ${kb._id}, docs: ${kb.documentCount}, active: ${kb.isActive})`
    );
  });

  if (allTenantKBs.length === 0) {
    console.error('❌ No Tenant Knowledge Bases found in the database.');
    process.exit(1);
  }

  // Use the first tenant KB that has documents
  let selectedKB = allTenantKBs.find(kb => kb.documentCount > 0);
  if (!selectedKB) {
    selectedKB = allTenantKBs[0]; // Fallback to first KB even if no documents
  }

  console.log(`\n=== USING TENANT KB: "${selectedKB.name}" ===`);
  console.log(`KB ID: ${selectedKB._id}`);

  // Find documents in this tenant KB
  console.log(`\nSearching for documents in TenantKB "${selectedKB.name}"...`);
  const allDocs = await UserDocument.find({
    tenantKbId: selectedKB._id,
    sourceType: 'tenant',
  })
    .select('_id originalFileName status s3Key tenantKbId')
    .lean();

  console.log(`Found ${allDocs.length} documents in this Tenant KB:`);
  allDocs.forEach((doc, index) => {
    console.log(`  ${index + 1}. ${doc.originalFileName} (status: ${doc.status}, ID: ${doc._id})`);
  });

  if (allDocs.length === 0) {
    console.error(`❌ No documents found in TenantKB "${selectedKB.name}".`);
    process.exit(1);
  }

  // Use the first document for verification
  const docToVerify = allDocs[0];
  console.log(`\n=== VERIFYING DOCUMENT: "${docToVerify.originalFileName}" ===`);
  console.log(`Document ID: ${docToVerify._id}`);
  console.log(`Status: ${docToVerify.status}`);
  console.log(`S3 Key: ${docToVerify.s3Key}`);
  console.log(`Tenant KB ID: ${docToVerify.tenantKbId}`);

  await verifyPineconeVector(docToVerify);

  process.exit(0);
};

const verifyPineconeVector = async (docRecord: any) => {
  console.log(`\n=== PINECONE VERIFICATION ===`);
  console.log(`Searching for vectors in Pinecone for document ID: ${docRecord._id}...`);

  // Since tenant KB documents should be stored in system-kb namespace according to the documentProcessor,
  // let's check both system-kb namespace and default namespace
  const pineconeIndex = await getPineconeIndex();

  // Try to find vectors by searching with a filter for this document ID
  // We'll use a dummy vector for the search since we just want to find vectors with matching metadata
  const dummyVector = Array(1536).fill(0);

  const namespaces = ['system-kb', undefined]; // system-kb and default namespace

  for (const namespace of namespaces) {
    const nsName = namespace || 'default';
    console.log(`\n--- Checking namespace: ${nsName} ---`);

    try {
      // Query with filter to find vectors for this document
      const queryRequest = {
        vector: dummyVector,
        topK: 100, // Get up to 100 chunks for this document
        includeMetadata: true,
        includeValues: false,
        filter: { documentId: docRecord._id.toString() },
      };

      const results = await pineconeIndex.namespace(namespace || '').query(queryRequest);

      console.log(`Found ${results?.matches?.length || 0} vectors in ${nsName} namespace`);

      if (results?.matches && results.matches.length > 0) {
        console.log(`\n--- Sample Vector Metadata from ${nsName} ---`);
        const firstMatch = results.matches[0];
        console.log(`Vector ID: ${firstMatch.id}`);
        console.log(`Score: ${firstMatch.score}`);
        console.log(`Metadata:`);
        console.log(JSON.stringify(firstMatch.metadata, null, 2));

        // Check if metadata has the required fields for tenant KB documents
        const metadata = firstMatch.metadata;
        console.log(`\n--- Metadata Analysis ---`);
        console.log(`Has documentId: ${!!metadata?.documentId}`);
        console.log(`Has sourceType: ${!!metadata?.sourceType} (value: "${metadata?.sourceType}")`);
        console.log(`Has tenantKbId: ${!!metadata?.tenantKbId} (value: "${metadata?.tenantKbId}")`);
        console.log(
          `Has originalFileName: ${!!metadata?.originalFileName} (value: "${metadata?.originalFileName}")`
        );
        console.log(`Has text: ${!!metadata?.text}`);
        console.log(`Has chunkIndex: ${!!metadata?.chunkIndex} (value: ${metadata?.chunkIndex})`);

        if (metadata?.sourceType === 'tenant' && metadata?.tenantKbId) {
          console.log(`✅ Vector has correct tenant KB metadata format`);
          console.log(
            `   Tenant KB ID matches: ${metadata.tenantKbId === docRecord.tenantKbId.toString()}`
          );
        } else {
          console.log(`❌ Vector is missing required tenant KB metadata`);
          console.log(`   Expected sourceType: 'tenant', got: '${metadata?.sourceType}'`);
          console.log(
            `   Expected tenantKbId: '${docRecord.tenantKbId}', got: '${metadata?.tenantKbId}'`
          );
        }

        // Show all vectors found for this document
        console.log(`\n--- All Vectors Found ---`);
        console.log(`Total vectors for this document: ${results.matches.length}`);
        results.matches.forEach((match: any, index: number) => {
          console.log(`  ${index + 1}. ${match.id} (score: ${match.score})`);
        });

        return; // Found vectors, we can stop here
      }
    } catch (error: any) {
      console.error(`Error querying ${nsName} namespace:`, error.message);
    }
  }

  console.log(
    `\n❌ NO VECTORS FOUND in any namespace for document "${docRecord.originalFileName}"`
  );
  console.log(`This document needs to be re-indexed in Pinecone.`);

  // Let's also try to fetch by potential vector IDs (document chunks)
  console.log(`\nTrying to fetch vectors by potential chunk IDs...`);
  const potentialVectorIds = [];
  for (let i = 0; i < 10; i++) {
    // Try first 10 potential chunks
    potentialVectorIds.push(`${docRecord._id}_chunk_${i}`);
  }

  for (const namespace of namespaces) {
    const nsName = namespace || 'default';
    try {
      const fetchResult = await pineconeIndex.namespace(namespace || '').fetch(potentialVectorIds);

      if (fetchResult.records && Object.keys(fetchResult.records).length > 0) {
        console.log(`\n--- Found vectors by direct fetch in ${nsName} namespace ---`);
        console.log(`Number of vectors found: ${Object.keys(fetchResult.records).length}`);

        const firstVectorId = Object.keys(fetchResult.records)[0];
        const firstVector = fetchResult.records[firstVectorId];
        console.log(`Sample vector ID: ${firstVectorId}`);
        console.log(`Sample vector metadata:`);
        console.log(JSON.stringify(firstVector.metadata, null, 2));
        return;
      }
    } catch (error: any) {
      console.log(`No vectors found by direct fetch in ${nsName} namespace`);
    }
  }

  console.log(`\n=== FINAL DIAGNOSIS ===`);
  console.log(`❌ No vectors found by any method for document "${docRecord.originalFileName}"`);
  console.log(`📋 Document Details:`);
  console.log(`   - MongoDB Document ID: ${docRecord._id}`);
  console.log(`   - Filename: ${docRecord.originalFileName}`);
  console.log(`   - Status: ${docRecord.status}`);
  console.log(`   - Source Type: tenant`);
  console.log(`   - Tenant KB ID: ${docRecord.tenantKbId}`);
  console.log(`\n🔧 RECOMMENDATION: This document needs to be re-indexed in Pinecone.`);
  console.log(`   The vectors are either missing or stored with incorrect metadata.`);
};

verifyDocument().catch(console.error);
