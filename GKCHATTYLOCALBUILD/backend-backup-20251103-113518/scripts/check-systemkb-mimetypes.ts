import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';

async function checkMimeTypes() {
  console.log('🔍 Checking System KB Document MIME Types');
  console.log('=========================================\n');

  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB\n');

    const documents = await SystemKbDocument.find({}).select('filename mimeType s3Key');

    console.log(`📄 Total documents: ${documents.length}\n`);

    let missingMimeType = 0;

    documents.forEach((doc, i) => {
      if (!doc.mimeType) {
        missingMimeType++;
        console.log(`${i + 1}. ${doc.filename}`);
        console.log(`   mimeType: ${doc.mimeType || 'MISSING'}`);
        console.log(`   s3Key: ${doc.s3Key}\n`);
      }
    });

    console.log(`\n📊 Summary:`);
    console.log(`  - Total documents: ${documents.length}`);
    console.log(`  - Missing mimeType: ${missingMimeType}`);
    console.log(`  - Have mimeType: ${documents.length - missingMimeType}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkMimeTypes();
