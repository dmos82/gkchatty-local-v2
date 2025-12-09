const { MongoClient } = require('mongodb');

const URI = 'mongodb+srv://gkchatty_trueprod_app_user:GKChatty2024Secure789@gkchatty-staging-cluste.2l9dc.mongodb.net/?retryWrites=true&w=majority';
const SOURCE_DB = 'GKCHATTY-SANDBOX';
const TARGET_DB = 'GKCHATTY-PRODUCTION';

async function copyDatabase() {
  const client = new MongoClient(URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const sourceDb = client.db(SOURCE_DB);
    const targetDb = client.db(TARGET_DB);

    // Get all collections from source
    const collections = await sourceDb.listCollections().toArray();
    console.log(`Found ${collections.length} collections in ${SOURCE_DB}:`);
    collections.forEach(c => console.log(`  - ${c.name}`));

    // Copy each collection
    for (const collInfo of collections) {
      const collName = collInfo.name;
      console.log(`\nCopying ${collName}...`);

      const sourceColl = sourceDb.collection(collName);
      const targetColl = targetDb.collection(collName);

      // Get all documents
      const docs = await sourceColl.find({}).toArray();
      console.log(`  Found ${docs.length} documents`);

      if (docs.length > 0) {
        // Clear target collection first (in case of re-run)
        await targetColl.deleteMany({});

        // Insert all documents
        const result = await targetColl.insertMany(docs);
        console.log(`  Copied ${result.insertedCount} documents to ${TARGET_DB}.${collName}`);
      } else {
        console.log(`  Skipping (empty collection)`);
      }

      // Copy indexes
      const indexes = await sourceColl.indexes();
      for (const idx of indexes) {
        if (idx.name !== '_id_') { // Skip default _id index
          try {
            const { key, ...options } = idx;
            delete options.v; // Remove version field
            await targetColl.createIndex(key, options);
            console.log(`  Created index: ${idx.name}`);
          } catch (e) {
            if (!e.message.includes('already exists')) {
              console.log(`  Warning: Could not create index ${idx.name}: ${e.message}`);
            }
          }
        }
      }
    }

    console.log('\n✅ Database copy complete!');
    console.log(`\n${SOURCE_DB} → ${TARGET_DB}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

copyDatabase();
