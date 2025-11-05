// Script to remove UserDocument records that have sourceType: 'system'
// These should only exist in SystemKbDocument collection

const mongoose = require('mongoose');
require('dotenv').config();

const UserDocumentSchema = new mongoose.Schema({}, { strict: false, collection: 'userdocuments' });
const UserDocument = mongoose.model('UserDocument', UserDocumentSchema);

async function cleanup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully.');

    // Find all UserDocuments with sourceType: 'system'
    const systemUserDocs = await UserDocument.find({ sourceType: 'system' });
    console.log(`Found ${systemUserDocs.length} UserDocument records with sourceType: 'system'`);

    if (systemUserDocs.length > 0) {
      console.log('\nDocuments to be deleted:');
      systemUserDocs.forEach((doc, i) => {
        console.log(`${i + 1}. ${doc.originalFileName} (ID: ${doc._id})`);
      });

      // Delete them
      const result = await UserDocument.deleteMany({ sourceType: 'system' });
      console.log(`\nDeleted ${result.deletedCount} UserDocument records with sourceType: 'system'`);
    } else {
      console.log('\nNo UserDocument records with sourceType: "system" found. Database is clean!');
    }

    await mongoose.connection.close();
    console.log('\nCleanup complete. MongoDB connection closed.');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
