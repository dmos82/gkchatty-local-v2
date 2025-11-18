const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/backend/.env' });

const SystemKbDocumentSchema = new mongoose.Schema({
  filename: String,
  s3Key: String,
  folderId: String,
  status: String,
});

const SystemFolderSchema = new mongoose.Schema({
  name: String,
});

const SystemKbDocument = mongoose.model('SystemKbDocument', SystemKbDocumentSchema);
const SystemFolder = mongoose.model('SystemFolder', SystemFolderSchema);

async function fixOrphanedFiles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // Find all documents
    const allDocs = await SystemKbDocument.find({});
    console.log(`📊 Total documents: ${allDocs.length}\n`);

    // Check each document's folder
    const orphanedDocs = [];

    for (const doc of allDocs) {
      if (doc.folderId) {
        const folder = await SystemFolder.findById(doc.folderId);
        if (!folder) {
          orphanedDocs.push(doc);
        }
      }
    }

    console.log(`🔍 Found ${orphanedDocs.length} orphaned documents:\n`);

    orphanedDocs.forEach(doc => {
      console.log(`   - ${doc.filename} (ID: ${doc._id}, Folder: ${doc.folderId})`);
    });

    if (orphanedDocs.length > 0) {
      console.log('\n❓ Move these files to root? (Setting folderId to null)');
      console.log('   This will make them visible in the admin dashboard.\n');

      // Update all orphaned documents
      const result = await SystemKbDocument.updateMany(
        { _id: { $in: orphanedDocs.map(d => d._id) } },
        { $set: { folderId: null } }
      );

      console.log(`✅ Updated ${result.modifiedCount} documents to root level`);
      console.log('\n👉 Refresh your admin page - files should now be visible!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  }
}

fixOrphanedFiles();
