import mongoose from 'mongoose';
import { config } from 'dotenv';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import * as path from 'path';

// Load environment variables from the correct path
config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Utility script to list all Tenant Knowledge Bases
 *
 * This script:
 * 1. Connects to MongoDB using environment variables
 * 2. Fetches all Tenant Knowledge Bases from the database
 * 3. Displays them in a clean table format
 * 4. Shows key information needed for operations
 *
 * Usage: ts-node apps/api/src/scripts/list-tenant-kbs.ts
 * Or: pnpm run kbs:list-tenants
 */
async function listTenantKBs(): Promise<void> {
  console.log(`\n=== TENANT KNOWLEDGE BASES LISTING ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? '[CONFIGURED]' : '[MISSING]'}\n`);

  try {
    // Step 1: Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully\n');

    // Step 2: Fetch all Tenant Knowledge Bases
    console.log('📋 Fetching Tenant Knowledge Bases...');
    const tenantKBs = await TenantKnowledgeBase.find({})
      .select(
        '_id name slug description documentCount isActive accessType createdBy createdAt updatedAt'
      )
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Step 3: Display results
    if (tenantKBs.length === 0) {
      console.log('ℹ️  No Tenant Knowledge Bases found in the database.\n');
      console.log('This could mean:');
      console.log('  • The database is empty');
      console.log("  • You're connected to the wrong database");
      console.log('  • The collection name is different\n');
      return;
    }

    console.log(`✅ Found ${tenantKBs.length} Tenant Knowledge Base(s):\n`);

    // Step 4: Format data for console.table
    const tableData = tenantKBs.map((kb: any) => ({
      ID: kb._id.toString(),
      Name: kb.name,
      Slug: kb.slug,
      'Doc Count': kb.documentCount || 0,
      Active: kb.isActive ? '✅' : '❌',
      'Access Type': kb.accessType,
      'Created By': kb.createdBy?.name || kb.createdBy?.email || 'Unknown',
      'Created At': new Date(kb.createdAt).toLocaleDateString(),
      'Updated At': new Date(kb.updatedAt).toLocaleDateString(),
    }));

    // Display the table
    console.table(tableData);

    // Step 5: Additional details
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Tenant KBs: ${tenantKBs.length}`);
    console.log(`   Active KBs: ${tenantKBs.filter((kb: any) => kb.isActive).length}`);
    console.log(`   Inactive KBs: ${tenantKBs.filter((kb: any) => !kb.isActive).length}`);

    const totalDocs = tenantKBs.reduce((sum: number, kb: any) => sum + (kb.documentCount || 0), 0);
    console.log(`   Total Documents: ${totalDocs}`);

    // Step 6: Usage instructions
    console.log('\n🔧 USAGE:');
    console.log('   To reindex a Tenant KB, use the ID from the table above:');
    console.log(
      '   pnpm dlx dotenv-cli -e .env.staging -- pnpm --filter api exec ts-node src/scripts/reindex-tenant-kb.ts <ID>'
    );
    console.log('   Example:');
    if (tenantKBs.length > 0) {
      console.log(
        `   pnpm dlx dotenv-cli -e .env.staging -- pnpm --filter api exec ts-node src/scripts/reindex-tenant-kb.ts ${tenantKBs[0]._id}`
      );
    }
  } catch (error: any) {
    console.error('\n❌ ERROR during Tenant KB listing:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    // Step 7: Cleanup - Close MongoDB connection
    console.log('\n🔌 Closing MongoDB connection...');
    try {
      await mongoose.disconnect();
      console.log('✅ MongoDB connection closed successfully');
    } catch (disconnectError: any) {
      console.error(`❌ Error closing MongoDB connection: ${disconnectError.message}`);
    }

    console.log('\n=== TENANT KNOWLEDGE BASES LISTING END ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);
  }
}

// Execute the script if called directly
if (require.main === module) {
  listTenantKBs().catch(error => {
    console.error('\n💥 UNHANDLED ERROR:', error);
    process.exit(1);
  });
}

export { listTenantKBs };
