const mongoose = require('mongoose');

async function fixFilenames() {
  try {
    await mongoose.connect(
      'mongodb+srv://davidmorinmusic:woolaway@cluster0gkchatty-dev-cl.fehrzkw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0gkchatty-dev-cluster'
    );

    const SystemKbDoc = mongoose.model(
      'SystemKbDocument',
      new mongoose.Schema({}, { strict: false }),
      'systemkbdocuments'
    );

    // Find documents with undefined filenames
    const docs = await SystemKbDoc.find({
      $or: [{ filename: { $exists: false } }, { filename: null }, { filename: undefined }],
    });

    console.log('=== FIXING UNDEFINED FILENAMES ===');
    console.log('Found', docs.length, 'documents with undefined filename');

    for (const doc of docs) {
      if (doc.s3Key) {
        // Extract filename from s3Key: remove "system_docs/" prefix and timestamp prefix
        const filename = doc.s3Key.replace('system_docs/', '').replace(/^\d+-/, '');
        console.log('Updating', doc._id, ':', filename);
        await SystemKbDoc.updateOne({ _id: doc._id }, { $set: { filename: filename } });
      }
    }

    console.log('Filename fixes completed');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixFilenames();
