const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend/.env' });

const SystemKbDocumentSchema = new mongoose.Schema({
  filename: String,
  s3Key: String,
  fileUrl: String,
  folderId: String,
  status: String,
  createdAt: Date,
});

const SystemKbDocument = mongoose.model('SystemKbDocument', SystemKbDocumentSchema);

async function checkDuplicateFiles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // Get the filenames the user tried to upload
    const searchFilenames = [
      'Gold_Key_LT_Harper_Grey_LLP_re_Hirajee_and_Sanfhu_17Dec242283600.pdf',
      'Gold_Key_LT_Harper_Grey_LLP_re_K_Sandhu_12Dec242283630_1.pdf',
      'Gold_Key_LT_Harper_Grey_LLP_re_P_Hirajee_12Dec242283629_1.pdf'
    ];

    console.log('🔍 Searching for files that were skipped as duplicates:\n');

    for (const filename of searchFilenames) {
      const doc = await SystemKbDocument.findOne({ filename });

      if (doc) {
        console.log(`✅ FOUND: ${filename}`);
        console.log(`   ID: ${doc._id}`);
        console.log(`   Folder ID: ${doc.folderId || '(root - no folder)'}`);
        console.log(`   Status: ${doc.status}`);
        console.log(`   Created: ${doc.createdAt}`);
        console.log(`   S3 Key: ${doc.s3Key}\n`);
      } else {
        console.log(`❌ NOT FOUND: ${filename}\n`);
      }
    }

    // Check total documents in system
    const totalDocs = await SystemKbDocument.countDocuments();
    console.log(`\n📊 Total SystemKbDocuments in database: ${totalDocs}`);

    // Check if any have null/undefined folderId (orphaned at root)
    const orphanedDocs = await SystemKbDocument.find({ $or: [{ folderId: null }, { folderId: { $exists: false } }] });
    console.log(`📊 Orphaned documents (no folder): ${orphanedDocs.length}`);

    if (orphanedDocs.length > 0 && orphanedDocs.length <= 10) {
      console.log('\nOrphaned files:');
      orphanedDocs.forEach(doc => {
        console.log(`  - ${doc.filename} (${doc._id})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  }
}

checkDuplicateFiles();
