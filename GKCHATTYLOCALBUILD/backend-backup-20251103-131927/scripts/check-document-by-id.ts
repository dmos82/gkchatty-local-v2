import 'dotenv/config';
import mongoose from 'mongoose';
import { SystemKbDocument, ISystemKbDocument } from '../models/SystemKbDocument';
import { UserDocument, IUserDocument } from '../models/UserDocument';

// The document ID to check from the logs: 6831f00e17870675709e25b3
const documentIdToCheck = process.argv[2] || '6831f00e17870675709e25b3';

async function checkDocumentById() {
  try {
    console.log(`[Check] Looking for document ID: ${documentIdToCheck}`);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(documentIdToCheck)) {
      console.error(`[Check] Invalid ObjectId format: ${documentIdToCheck}`);
      process.exit(1);
    }

    // Connect to MongoDB
    console.log('[Check] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('[Check] Connected to database:', mongoose.connection.db?.databaseName);

    // Check SystemKbDocument collection
    console.log('\n--- Checking SystemKbDocument collection ---');
    const systemKbDoc =
      await SystemKbDocument.findById(documentIdToCheck).lean<ISystemKbDocument>();
    console.log('[Check] Document found in SystemKbDocument:', systemKbDoc ? 'YES' : 'NO');

    if (systemKbDoc) {
      console.log('[Check] Document details:');
      console.log('  - ID:', systemKbDoc._id.toString());
      console.log('  - Filename:', systemKbDoc.filename);
      console.log('  - S3 Key:', systemKbDoc.s3Key);
      console.log('  - Status:', systemKbDoc.status);

      // Check if the file exists in local storage
      if (process.env.AWS_BUCKET_NAME === 'local') {
        // Use dynamic import for fs and path
        const fs = await import('fs');
        const path = await import('path');
        const localStoragePath = process.env.LOCAL_FILE_STORAGE_DIR || '';
        const localFilePath = path.join(localStoragePath, systemKbDoc.s3Key);

        console.log('\n--- Checking file in local storage ---');
        console.log('[Check] Expected local file path:', localFilePath);

        if (fs.existsSync(localFilePath)) {
          const stats = fs.statSync(localFilePath);
          console.log('[Check] File exists on disk:', 'YES');
          console.log('[Check] File size:', stats.size, 'bytes');
        } else {
          console.log('[Check] File exists on disk:', 'NO');

          // Try with system_docs/ prefix
          const alternativePath = path.join(localStoragePath, `system_docs/${systemKbDoc.s3Key}`);
          console.log('[Check] Checking alternative path:', alternativePath);

          if (fs.existsSync(alternativePath)) {
            const stats = fs.statSync(alternativePath);
            console.log('[Check] File exists at alternative path:', 'YES');
            console.log('[Check] File size:', stats.size, 'bytes');
          } else {
            console.log('[Check] File exists at alternative path:', 'NO');
          }
        }
      }
    }

    // Check UserDocument collection with sourceType: 'system'
    console.log('\n--- Checking UserDocument collection ---');
    const userDoc = await UserDocument.findOne({
      _id: new mongoose.Types.ObjectId(documentIdToCheck),
      sourceType: 'system',
    }).lean<IUserDocument>();

    console.log(
      '[Check] Document found in UserDocument with sourceType "system":',
      userDoc ? 'YES' : 'NO'
    );

    if (userDoc) {
      console.log('[Check] UserDocument details:');
      console.log('  - ID:', userDoc._id.toString());
      console.log('  - Original Filename:', userDoc.originalFileName);
      console.log('  - S3 Key:', userDoc.s3Key);
      console.log('  - S3 Bucket:', userDoc.s3Bucket);

      // Check if the file exists in local storage
      if (process.env.AWS_BUCKET_NAME === 'local') {
        // Use dynamic import for fs and path
        const fs = await import('fs');
        const path = await import('path');
        const localStoragePath = process.env.LOCAL_FILE_STORAGE_DIR || '';
        const localFilePath = path.join(localStoragePath, userDoc.s3Key);

        console.log('\n--- Checking UserDocument file in local storage ---');
        console.log('[Check] Expected local file path:', localFilePath);

        if (fs.existsSync(localFilePath)) {
          const stats = fs.statSync(localFilePath);
          console.log('[Check] File exists on disk:', 'YES');
          console.log('[Check] File size:', stats.size, 'bytes');
        } else {
          console.log('[Check] File exists on disk:', 'NO');

          // Try with system_docs/ prefix
          const alternativePath = path.join(localStoragePath, `system_docs/${userDoc.s3Key}`);
          console.log('[Check] Checking alternative path:', alternativePath);

          if (fs.existsSync(alternativePath)) {
            const stats = fs.statSync(alternativePath);
            console.log('[Check] File exists at alternative path:', 'YES');
            console.log('[Check] File size:', stats.size, 'bytes');
          } else {
            console.log('[Check] File exists at alternative path:', 'NO');
          }
        }
      }
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n[Check] Disconnected from MongoDB');
  } catch (error) {
    console.error('[Check] Error:', error);
    process.exit(1);
  }
}

checkDocumentById();
