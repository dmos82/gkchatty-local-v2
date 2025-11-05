#!/usr/bin/env node
const mongoose = require('mongoose');

async function migrateSystemDocs() {
  try {
    await mongoose.connect('mongodb://localhost:27017/gkchatty');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Get all system KB documents
    const systemDocs = await db.collection('systemkbdocuments').find({}).toArray();
    console.log(`Found ${systemDocs.length} system KB documents`);
    
    // Check existing system user documents
    const existingSystemUserDocs = await db.collection('userdocuments')
      .find({ sourceType: 'system' })
      .toArray();
    console.log(`Found ${existingSystemUserDocs.length} existing system user documents`);
    
    // Create a map of existing s3Keys to avoid duplicates
    const existingKeys = new Set(existingSystemUserDocs.map(d => d.s3Key));
    
    let created = 0;
    let skipped = 0;
    
    for (const systemDoc of systemDocs) {
      if (existingKeys.has(systemDoc.s3Key)) {
        console.log(`Skipping duplicate: ${systemDoc.filename}`);
        skipped++;
        continue;
      }
      
      // Create corresponding UserDocument
      const userDoc = {
        originalFileName: systemDoc.filename,
        s3Bucket: 'local', // or from env
        s3Key: systemDoc.s3Key,
        file_extension: systemDoc.filename.split('.').pop() || '',
        fileSize: systemDoc.fileSize,
        mimeType: 'application/pdf', // Default, adjust as needed
        sourceType: 'system',
        status: systemDoc.status || 'completed',
        uploadTimestamp: systemDoc.createdAt || new Date(),
        folderId: null
      };
      
      await db.collection('userdocuments').insertOne(userDoc);
      console.log(`Created UserDocument for: ${systemDoc.filename}`);
      created++;
    }
    
    console.log(`\nMigration complete:`);
    console.log(`  Created: ${created} new UserDocument records`);
    console.log(`  Skipped: ${skipped} existing records`);
    
    // Verify the migration
    const finalCount = await db.collection('userdocuments')
      .countDocuments({ sourceType: 'system' });
    console.log(`\nTotal system documents in UserDocuments: ${finalCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateSystemDocs();