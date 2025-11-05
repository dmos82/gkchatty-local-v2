#!/usr/bin/env ts-node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import the fix function
import { fixSystemKbMetadata } from './fix-system-kb-metadata';

async function main() {
  console.log('🚀 Starting System KB metadata fix for production...');

  // Check environment
  if (process.env.PINECONE_INDEX_NAME !== 'gkchatty-prod') {
    console.error('❌ This script should only be run in production environment');
    console.error(`Current index: ${process.env.PINECONE_INDEX_NAME}`);
    process.exit(1);
  }

  // Run in dry-run mode first
  console.log('\n📋 Running in DRY-RUN mode first...');
  await fixSystemKbMetadata({ dryRun: true });

  // Ask for confirmation
  console.log('\n⚠️  Ready to apply the fixes. This will update metadata in Pinecone.');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Run the actual fix
  console.log('\n🔧 Applying metadata fixes...');
  await fixSystemKbMetadata({ dryRun: false });

  console.log('\n✅ Metadata fix completed!');
}

main().catch(error => {
  console.error('❌ Error running metadata fix:', error);
  process.exit(1);
});
