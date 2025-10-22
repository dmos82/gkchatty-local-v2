import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';

async function debugDbConnection() {
  try {
    console.log('[Debug] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);

    console.log('[Debug] Connected to database:', mongoose.connection.db?.databaseName);
    console.log('[Debug] SystemKbDocument collection name:', SystemKbDocument.collection.name);
    console.log(
      '[Debug] Full collection namespace:',
      `${mongoose.connection.db?.databaseName}.${SystemKbDocument.collection.name}`
    );

    // Count documents
    const count = await SystemKbDocument.countDocuments();
    console.log('[Debug] Total documents in SystemKbDocument collection:', count);

    // Find Epic - Checklist.pdf
    const epicDoc = await SystemKbDocument.findOne({ filename: 'Epic - Checklist.pdf' });
    console.log('[Debug] Epic - Checklist.pdf found:', epicDoc ? 'YES' : 'NO');
    if (epicDoc) {
      console.log('[Debug] Epic - Checklist.pdf ID:', (epicDoc as any)._id.toString());
      console.log('[Debug] Epic - Checklist.pdf s3Key:', epicDoc.s3Key);
    }

    // List first 5 documents
    const docs = await SystemKbDocument.find({}).limit(5).select('_id filename s3Key');
    console.log('[Debug] First 5 documents:');
    docs.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.filename} (ID: ${doc._id})`);
    });

    await mongoose.disconnect();
    console.log('[Debug] Disconnected from MongoDB');
  } catch (error) {
    console.error('[Debug] Error:', error);
    process.exit(1);
  }
}

debugDbConnection();
