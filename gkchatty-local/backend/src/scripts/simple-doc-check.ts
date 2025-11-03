import 'dotenv/config';
import mongoose from 'mongoose';

// The document ID to check from the logs: 6831f00e17870675709e25b3
const documentIdToCheck = process.argv[2] || '6831f00e17870675709e25b3';

async function simpleDocCheck() {
  try {
    console.log(`[Check] Looking for document ID: ${documentIdToCheck}`);

    // Connect to MongoDB
    console.log('[Check] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'gkchatty' });
    const dbName = mongoose.connection.db?.databaseName;
    console.log('[Check] Connected to database:', dbName);

    // Get direct DB collections rather than using models
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }

    // Check SystemKbDocument collection
    console.log('\n--- Checking SystemKbDocument collection ---');
    const systemKbCollection = db.collection('systemkbdocuments');
    const systemKbDoc = await systemKbCollection.findOne({
      _id: new mongoose.Types.ObjectId(documentIdToCheck),
    });

    console.log(
      '[Check] Document found in SystemKbDocument collection:',
      systemKbDoc ? 'YES' : 'NO'
    );

    if (systemKbDoc) {
      console.log('[Check] Document details:');
      console.log(JSON.stringify(systemKbDoc, null, 2));
    }

    // Check UserDocument collection with sourceType: 'system'
    console.log('\n--- Checking UserDocument collection ---');
    const userDocCollection = db.collection('userdocuments');
    const userDoc = await userDocCollection.findOne({
      _id: new mongoose.Types.ObjectId(documentIdToCheck),
      sourceType: 'system',
    });

    console.log(
      '[Check] Document found in UserDocument collection with sourceType "system":',
      userDoc ? 'YES' : 'NO'
    );

    if (userDoc) {
      console.log('[Check] Document details:');
      console.log(JSON.stringify(userDoc, null, 2));
    }

    // Check other collections where this ID might appear
    console.log('\n--- Checking for document references ---');

    // List all collections
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      const collName = collection.name;
      if (collName === 'systemkbdocuments' || collName === 'userdocuments') continue;

      // Look for the ID in other collections
      const coll = db.collection(collName);
      const result = await coll.findOne({
        $or: [
          { _id: new mongoose.Types.ObjectId(documentIdToCheck) },
          { documentId: documentIdToCheck },
          { 'sources.documentId': documentIdToCheck },
        ],
      });

      if (result) {
        console.log(`[Check] Document ID referenced in collection: ${collName}`);
        console.log('Reference details:');
        console.log(JSON.stringify(result, null, 2));
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

simpleDocCheck();
