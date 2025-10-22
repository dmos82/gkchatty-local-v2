import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import { UserDocument } from '../models/UserDocument';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Parse command line arguments
const args = process.argv.slice(2);
let mongoUri: string | undefined;
let dbName = 'gkchatty';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mongodb-uri' && i + 1 < args.length) {
    mongoUri = args[i + 1];
  }
  if (args[i] === '--db-name' && i + 1 < args.length) {
    dbName = args[i + 1];
  }
}

// Use environment variables if not provided as arguments
mongoUri = mongoUri || process.env.MONGODB_URI || process.env.MONGO_URI;

/**
 * Connects to MongoDB with the given connection string
 */
async function connectDB(uri: string, database: string) {
  if (!uri) {
    throw new Error(
      'MongoDB URI is required. Please provide it via environment variables or --mongodb-uri argument.'
    );
  }

  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(uri, { dbName: database });
    console.log('✅ MongoDB Connected successfully.');
  } catch (err: any) {
    console.error('❌ MongoDB connection FAILED:');
    console.error('Error message:', err.message);
    throw err;
  }
}

/**
 * Disconnects from MongoDB
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected successfully.');
  } catch (err) {
    console.error('❌ Error disconnecting from MongoDB:', err);
  }
}

/**
 * Audits the systemkbdocuments collection to identify problematic documents
 * where filename is null/empty or s3Key doesn't follow expected path structure
 */
async function auditSystemKbDocuments() {
  try {
    console.log('=== System KB Documents Audit ===');

    if (!mongoUri) {
      console.error(
        '\n⚠️ MongoDB URI not provided. Please set MONGODB_URI or MONGO_URI environment variable,'
      );
      console.error('or provide a connection string using the --mongodb-uri argument.');
      console.error(
        '\nUsage: npx ts-node src/scripts/audit-systemkbdocuments.ts --mongodb-uri "mongodb://username:password@host:port" --db-name "gkchatty"\n'
      );
      process.exit(1);
    }

    await connectDB(mongoUri, dbName);

    // Find System KB Documents with null or empty filename
    console.log('\nQuerying SystemKbDocument collection...');

    // Find documents where:
    // 1. filename is null or empty string
    // 2. s3Key doesn't follow expected path structure
    const problematicDocs = await SystemKbDocument.find({
      $or: [
        { filename: null },
        { filename: '' },
        {
          $and: [
            { s3Key: { $exists: true } },
            {
              s3Key: {
                $not: /^system_docs\//,
                $regex: /^(knowledge_base_docs\/|user_docs\/)/,
              },
            },
          ],
        },
      ],
    }).lean();

    console.log(
      `Found ${problematicDocs.length} problematic documents in SystemKbDocument collection`
    );

    if (problematicDocs.length > 0) {
      console.log('\nProblematic Documents:');
      const formattedResults = problematicDocs.map(doc => ({
        _id: doc._id.toString(),
        filename: doc.filename || null,
        s3Key: doc.s3Key,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt,
      }));

      // Output as formatted JSON
      console.log(JSON.stringify(formattedResults, null, 2));

      // Output as Markdown table format
      console.log('\nMarkdown Table Format:');
      console.log('| _id | filename | s3Key | fileUrl | createdAt |');
      console.log('|-----|----------|-------|---------|-----------|');
      formattedResults.forEach(doc => {
        console.log(
          `| ${doc._id} | ${doc.filename || 'null'} | ${doc.s3Key} | ${doc.fileUrl} | ${doc.createdAt} |`
        );
      });
    }

    // Also check the UserDocument collection with sourceType='system'
    console.log('\nQuerying UserDocument collection with sourceType="system"...');

    const problematicUserDocs = await UserDocument.find({
      sourceType: 'system',
      $or: [
        { originalFileName: null },
        { originalFileName: '' },
        {
          $and: [
            { s3Key: { $exists: true } },
            {
              s3Key: {
                $not: /^system_docs\//,
                $regex: /^(knowledge_base_docs\/|user_docs\/)/,
              },
            },
          ],
        },
      ],
    }).lean();

    console.log(
      `Found ${problematicUserDocs.length} problematic documents in UserDocument collection with sourceType="system"`
    );

    if (problematicUserDocs.length > 0) {
      console.log('\nProblematic User Documents with sourceType="system":');
      const formattedUserResults = problematicUserDocs.map(doc => ({
        _id: doc._id.toString(),
        originalFileName: doc.originalFileName || null,
        s3Key: doc.s3Key,
        s3Bucket: doc.s3Bucket,
        uploadTimestamp: doc.uploadTimestamp,
      }));

      // Output as formatted JSON
      console.log(JSON.stringify(formattedUserResults, null, 2));

      // Output as Markdown table format
      console.log('\nMarkdown Table Format:');
      console.log('| _id | originalFileName | s3Key | s3Bucket | uploadTimestamp |');
      console.log('|-----|------------------|-------|----------|----------------|');
      formattedUserResults.forEach(doc => {
        console.log(
          `| ${doc._id} | ${doc.originalFileName || 'null'} | ${doc.s3Key} | ${doc.s3Bucket} | ${doc.uploadTimestamp} |`
        );
      });
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Run the audit
auditSystemKbDocuments();
