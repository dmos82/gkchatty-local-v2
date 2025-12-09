/**
 * Check MongoDB for "kei meetings" document
 */
import { config } from 'dotenv';
config();

import mongoose from 'mongoose';

async function checkMongoDB() {
  const userId = '681d84a29fa9ba28b25d2f6e';

  console.log('=== MONGODB DOCUMENT CHECK ===\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty');
  console.log('Connected to MongoDB');

  // Check UserDocument collection
  const UserDocument = mongoose.model('UserDocument', new mongoose.Schema({}, { strict: false }), 'userdocuments');

  // Find all documents for this user
  console.log('\n--- All documents for user ---');
  const allDocs = await UserDocument.find({ userId }).select('originalFileName status createdAt').lean();
  console.log(`Total documents: ${allDocs.length}\n`);

  // Search for "kei" in filename
  const keiDocs = allDocs.filter((doc: any) =>
    doc.originalFileName?.toLowerCase().includes('kei')
  );
  console.log(`Documents with "kei" in name: ${keiDocs.length}`);
  keiDocs.forEach((doc: any) => {
    console.log(`  - ${doc.originalFileName} (status: ${doc.status})`);
  });

  // Search for "meeting" in filename
  const meetingDocs = allDocs.filter((doc: any) =>
    doc.originalFileName?.toLowerCase().includes('meeting')
  );
  console.log(`\nDocuments with "meeting" in name: ${meetingDocs.length}`);
  meetingDocs.forEach((doc: any) => {
    console.log(`  - ${doc.originalFileName} (status: ${doc.status})`);
  });

  // List some recent documents
  console.log('\n--- Recent documents (last 20) ---');
  const recentDocs = await UserDocument.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('originalFileName status createdAt')
    .lean();

  recentDocs.forEach((doc: any) => {
    console.log(`  ${doc.originalFileName} (${doc.status}) - ${doc.createdAt}`);
  });

  await mongoose.disconnect();
}

checkMongoDB().catch(console.error);
