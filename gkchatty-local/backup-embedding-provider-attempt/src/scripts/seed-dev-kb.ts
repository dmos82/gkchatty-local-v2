import mongoose from 'mongoose';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import { UserDocument } from '../models/UserDocument';
import { processAndEmbedDocument } from '../utils/documentProcessor';
import { connectDB } from '../utils/mongoHelper';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

const HARDCODED_USER_ID = '684f4fc6da2a799071bf8210';
const KB_NAME = 'for devs';

async function seedDevKB() {
  console.log('=== SEED DEV KB SCRIPT START ===');

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connection established');

    // Step 1: Create or find the "for devs" KB
    console.log('Creating/finding KB...');
    const kbData = {
      name: KB_NAME,
      description: 'Development team knowledge base for testing and documentation',
      accessType: 'public' as const,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(HARDCODED_USER_ID),
      lastModifiedBy: new mongoose.Types.ObjectId(HARDCODED_USER_ID),
    };

    const tenantKB = await TenantKnowledgeBase.findOneAndUpdate({ name: KB_NAME }, kbData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    console.log(`✅ KB ID: ${tenantKB._id}`);
    console.log(`✅ KB Name: ${tenantKB.name}`);
    console.log(`✅ KB Slug: ${tenantKB.slug}`);
    console.log(`✅ KB S3 Prefix: ${tenantKB.s3Prefix}`);

    // Step 2: Read the source file
    console.log('Reading source file...');
    const sourceFilePath = path.resolve(
      __dirname,
      'seed-data/RAG_Relevance_and_Chunking_Strategies.md'
    );

    if (!fs.existsSync(sourceFilePath)) {
      throw new Error(`Source file not found: ${sourceFilePath}`);
    }

    const fileContent = fs.readFileSync(sourceFilePath, 'utf-8');
    const fileBuffer = Buffer.from(fileContent, 'utf-8');
    const originalFileName = 'RAG_Relevance_and_Chunking_Strategies.md';
    const mimeType = 'text/markdown';
    const fileSize = fileBuffer.length;

    console.log(`✅ File read successfully. Size: ${fileSize} bytes`);
    console.log(`✅ Content preview: ${fileContent.substring(0, 100)}...`);

    // Step 3: Create S3 key and document record
    const s3Bucket = process.env.AWS_BUCKET_NAME || 'gkchatty-uploads';
    const s3Key = `tenant_kb/${tenantKB.slug}/${uuidv4()}.md`;

    console.log(`S3 Bucket: ${s3Bucket}`);
    console.log(`S3 Key: ${s3Key}`);

    // Step 4: Upload to S3 first
    console.log('Uploading file to S3...');
    const { uploadFile } = await import('../utils/s3Helper');
    await uploadFile(fileBuffer, s3Key, mimeType);
    console.log('✅ File uploaded to S3 successfully');

    // Step 5: Create UserDocument record
    console.log('Creating document record in MongoDB...');
    const docData = {
      userId: new mongoose.Types.ObjectId(HARDCODED_USER_ID),
      sourceType: 'tenant' as const,
      tenantKbId: tenantKB._id,
      originalFileName: originalFileName,
      s3Bucket: s3Bucket,
      s3Key: s3Key,
      file_extension: 'md',
      fileSize: fileSize,
      mimeType: mimeType,
      status: 'pending' as const,
      uploadTimestamp: new Date(),
    };

    const userDoc = await UserDocument.create(docData);
    console.log(`✅ Document created with ID: ${userDoc._id}`);

    // Step 6: Process and embed the document
    console.log('Calling processAndEmbedDocument...');
    await processAndEmbedDocument(
      userDoc._id.toString(),
      s3Bucket,
      s3Key,
      'tenant',
      originalFileName,
      mimeType,
      HARDCODED_USER_ID,
      uuidv4(), // correlation ID
      undefined, // no extracted text
      tenantKB._id.toString()
    );

    console.log('✅ Document processing completed');

    // Step 7: Update tenant KB document count
    await TenantKnowledgeBase.findByIdAndUpdate(tenantKB._id, { $inc: { documentCount: 1 } });
    console.log('✅ Tenant KB document count updated');

    console.log('=== INGESTION COMPLETE ===');
    console.log(`Tenant KB "${KB_NAME}" has been successfully created and seeded.`);
    console.log(`Document "${originalFileName}" has been processed and indexed.`);
    console.log(`You can now test the query: "What is the MIN_CONFIDENCE_SCORE?"`);
  } catch (error) {
    console.error('❌ SEEDING FAILED:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close MongoDB connection
    console.log('Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  }
}

// Run the script
seedDevKB().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
