#!/usr/bin/env node

/**
 * Check Specific Documents Script
 * Verifies the specific documents mentioned in the analysis
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { UserDocument } = require('../src/models/UserDocument');

const SPECIFIC_DOCS = [
  {
    name: 'Internal User Guide',
    docId: '6837a2706b4f3d3f4513d35d',
    userId: '6806b1db7bee4c554fa6328b',
    expectedS3Key: '7c5aa085-32a9-489b-84d1-0dcdce7c6465',
  },
  {
    name: 'Appearance Agreement',
    docId: '66730eb4614c5098a7857599',
    userId: '66730cf275880a72391c975c',
    expectedS3Key: 'user_docs/66730cf275880a72391c975c/45f701a0-c4e5-4c6e-8d03-71020e6820c3',
  },
];

async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

async function checkSpecificDocuments() {
  console.log('\n=== Checking Specific Documents ===\n');

  try {
    // First, get a count of all documents
    const totalDocs = await UserDocument.countDocuments();
    const userDocs = await UserDocument.countDocuments({ sourceType: 'user' });
    const systemDocs = await UserDocument.countDocuments({ sourceType: 'system' });

    console.log(`📊 Database Overview:`);
    console.log(`   Total Documents: ${totalDocs}`);
    console.log(`   User Documents: ${userDocs}`);
    console.log(`   System Documents: ${systemDocs}\n`);

    // Check each specific document
    for (const docInfo of SPECIFIC_DOCS) {
      console.log(`🔍 Checking: ${docInfo.name}`);
      console.log(`   Expected Doc ID: ${docInfo.docId}`);

      try {
        const doc = await UserDocument.findById(docInfo.docId);

        if (doc) {
          console.log(`   ✅ Document found in database`);
          console.log(`   📄 Details:`);
          console.log(`      Original File Name: ${doc.originalFileName}`);
          console.log(`      User ID: ${doc.userId}`);
          console.log(`      S3 Bucket: ${doc.s3Bucket}`);
          console.log(`      S3 Key: ${doc.s3Key}`);
          console.log(`      File Extension: ${doc.file_extension}`);
          console.log(`      Status: ${doc.status}`);
          console.log(`      Created: ${doc.createdAt}`);

          // Check if it matches expected values
          if (doc.userId.toString() === docInfo.userId) {
            console.log(`   ✅ User ID matches expected`);
          } else {
            console.log(`   ❌ User ID mismatch. Expected: ${docInfo.userId}, Got: ${doc.userId}`);
          }

          if (doc.s3Key === docInfo.expectedS3Key || doc.s3Key.includes(docInfo.expectedS3Key)) {
            console.log(`   ✅ S3 Key matches or contains expected value`);
          } else {
            console.log(
              `   ⚠️  S3 Key different. Expected: ${docInfo.expectedS3Key}, Got: ${doc.s3Key}`
            );
          }
        } else {
          console.log(`   ❌ Document NOT found in database`);

          // Try to find by user ID and partial filename
          console.log(`   🔍 Searching by user ID and filename pattern...`);
          const similarDocs = await UserDocument.find({
            userId: docInfo.userId,
            originalFileName: { $regex: docInfo.name.split(' ')[0], $options: 'i' },
          });

          if (similarDocs.length > 0) {
            console.log(`   📋 Found ${similarDocs.length} similar document(s):`);
            similarDocs.forEach((similarDoc, index) => {
              console.log(
                `      ${index + 1}. ID: ${similarDoc._id}, Name: ${similarDoc.originalFileName}`
              );
            });
          } else {
            console.log(`   ❌ No similar documents found`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error checking document: ${error.message}`);
      }

      console.log(''); // Empty line for readability
    }

    // Also check for any documents by the specific user IDs
    console.log('=== Documents by User IDs ===\n');

    for (const docInfo of SPECIFIC_DOCS) {
      console.log(`👤 User ${docInfo.userId} documents:`);
      try {
        const userDocs = await UserDocument.find({ userId: docInfo.userId })
          .select('_id originalFileName s3Bucket s3Key status createdAt')
          .sort({ createdAt: -1 });

        if (userDocs.length > 0) {
          userDocs.forEach((doc, index) => {
            console.log(`   ${index + 1}. ${doc.originalFileName} (${doc._id}) - ${doc.status}`);
          });
        } else {
          console.log(`   No documents found for this user`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    process.exit(1);
  }
}

async function main() {
  await connectToDatabase();
  await checkSpecificDocuments();
  await mongoose.disconnect();
  console.log('✅ Check completed');
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}
