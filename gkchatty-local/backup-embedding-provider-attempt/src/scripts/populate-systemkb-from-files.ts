import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument } from '../models/SystemKbDocument';
import fs from 'fs';
import path from 'path';

async function populateSystemKbFromFiles() {
  try {
    console.log(
      '[Populate SystemKB] Starting population of SystemKbDocument collection from files...'
    );

    if (!process.env.MONGODB_URI) {
      console.error('[Populate SystemKB] MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Populate SystemKB] Connected to MongoDB');
    console.log('[Populate SystemKB] Database name:', mongoose.connection.db?.databaseName);

    // Get all files from the system_docs directory
    const systemDocsDir = path.join(process.cwd(), '.local_uploads', 'system_docs');
    console.log(`[Populate SystemKB] Scanning directory: ${systemDocsDir}`);

    if (!fs.existsSync(systemDocsDir)) {
      console.error(`[Populate SystemKB] Directory does not exist: ${systemDocsDir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(systemDocsDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    console.log(`[Populate SystemKB] Found ${pdfFiles.length} PDF files to process`);

    let successful = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of pdfFiles) {
      try {
        const filePath = path.join(systemDocsDir, file);
        const stats = fs.statSync(filePath);

        // Extract the original filename (remove timestamp prefix if present)
        const originalFilename = file.replace(/^\d+-/, '');

        console.log(`[Populate SystemKB] Processing: ${file} -> ${originalFilename}`);

        // Check if document already exists
        const existingDoc = await SystemKbDocument.findOne({ filename: originalFilename });
        console.log(
          `[Populate SystemKB] Existing doc check for ${originalFilename}:`,
          existingDoc ? 'FOUND' : 'NOT FOUND'
        );
        if (existingDoc) {
          console.log(
            `[Populate SystemKB] ⏭️  Skipping existing document: ${originalFilename} (ID: ${existingDoc._id})`
          );
          skipped++;
          continue;
        }

        // Create the document record
        const s3Key = `system_docs/${file}`;
        const fileUrl = `file://${filePath}`;

        const documentRecord = await SystemKbDocument.create({
          filename: originalFilename,
          s3Key: s3Key,
          fileUrl: fileUrl,
          fileSize: stats.size,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const documentId = (documentRecord as any)._id.toString();
        console.log(
          `[Populate SystemKB] ✅ Created MongoDB record for: ${originalFilename} (ID: ${documentId})`
        );
        successful++;
      } catch (error) {
        console.error(`[Populate SystemKB] ❌ Failed to process ${file}:`, error);
        failed++;
      }
    }

    console.log('[Populate SystemKB] Population complete!');
    console.log(
      `[Populate SystemKB] Results: ${successful} successful, ${skipped} skipped, ${failed} failed`
    );

    await mongoose.disconnect();
    console.log('[Populate SystemKB] Disconnected from MongoDB');
  } catch (error) {
    console.error('[Populate SystemKB] Error during population:', error);
    process.exit(1);
  }
}

// Run the script
populateSystemKbFromFiles();
