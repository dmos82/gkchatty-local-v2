import mongoose from 'mongoose';
import { config } from 'dotenv';
import { UserDocument } from '../models/UserDocument';
import * as path from 'path';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

async function checkTenantDocs() {
  const tenantKbId = '6841d3e39dfec2f57c3c8421';

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✓ Connected to MongoDB\n');

    console.log(`Checking for documents with tenantKbId: ${tenantKbId}...\n`);

    const docs = await UserDocument.find({
      tenantKbId: tenantKbId,
      sourceType: 'tenant',
    }).select('_id originalFileName status uploadTimestamp');

    if (docs.length === 0) {
      console.log('No documents found with this tenantKbId.');

      // Let's check if there are any tenant documents at all
      const allTenantDocs = await UserDocument.find({
        sourceType: 'tenant',
      }).select('_id originalFileName tenantKbId');

      console.log(`\nTotal tenant documents in database: ${allTenantDocs.length}`);

      if (allTenantDocs.length > 0) {
        console.log('\nUnique tenantKbIds found:');
        const uniqueKbIds = [
          ...new Set(allTenantDocs.map(d => d.tenantKbId?.toString()).filter(Boolean)),
        ];
        uniqueKbIds.forEach(id => {
          const count = allTenantDocs.filter(d => d.tenantKbId?.toString() === id).length;
          console.log(`  ${id}: ${count} documents`);
        });
      }
    } else {
      console.log(`Found ${docs.length} documents for this tenant KB:\n`);
      docs.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.originalFileName}`);
        console.log(`   ID: ${doc._id}`);
        console.log(`   Status: ${doc.status}`);
        console.log(`   Uploaded: ${doc.uploadTimestamp}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

checkTenantDocs();
