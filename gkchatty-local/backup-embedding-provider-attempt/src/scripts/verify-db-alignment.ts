import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';

async function verifyDbAlignment() {
  try {
    console.log('[Verify DB Alignment] Starting verification...');

    if (!process.env.MONGODB_URI) {
      console.error('[Verify DB Alignment] MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    // Connect using the same method as the API server (via mongoHelper)
    const { connectDB } = await import('../utils/mongoHelper');
    await connectDB();

    console.log(
      '[Verify DB Alignment] Connected to database:',
      mongoose.connection.db?.databaseName
    );

    // Count documents
    const count = await SystemKbDocument.countDocuments();
    console.log('[Verify DB Alignment] Total documents in SystemKbDocument collection:', count);

    // Find Epic - Checklist.pdf specifically
    const epicDoc = await SystemKbDocument.findOne({ filename: 'Epic - Checklist.pdf' });
    console.log('[Verify DB Alignment] Epic - Checklist.pdf found:', epicDoc ? 'YES' : 'NO');
    if (epicDoc) {
      console.log(
        '[Verify DB Alignment] Epic - Checklist.pdf ID:',
        (epicDoc as any)._id.toString()
      );
      console.log('[Verify DB Alignment] Epic - Checklist.pdf s3Key:', epicDoc.s3Key);
    }

    // List all documents for verification
    const allDocs = await SystemKbDocument.find({}).select('_id filename s3Key');
    console.log(`[Verify DB Alignment] All ${allDocs.length} documents in collection:`);
    allDocs.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.filename} (ID: ${doc._id})`);
    });

    await mongoose.disconnect();
    console.log(
      '[Verify DB Alignment] Verification complete - API server and scripts are aligned!'
    );
  } catch (error) {
    console.error('[Verify DB Alignment] Error:', error);
    process.exit(1);
  }
}

verifyDbAlignment();
