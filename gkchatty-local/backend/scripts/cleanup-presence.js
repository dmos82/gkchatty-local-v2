// Script to clean up stale presence data
// Sets all users to offline and clears socket IDs

const { MongoClient } = require('mongodb');

async function cleanupPresence() {
  const uri = 'mongodb://localhost:27017/gkchatty';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('gkchatty');
    const collection = db.collection('userpresences');

    // Update all presence records to offline with cleared socket data
    const result = await collection.updateMany(
      {}, // Match all documents
      {
        $set: {
          status: 'offline',
          socketIds: [],
          activeDevices: [],
          lastSeenAt: new Date()
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} presence records to offline`);

    // Show current state
    const presences = await collection.find({}).toArray();
    console.log('\nCurrent presence state:');
    presences.forEach(p => {
      console.log(`  ${p.username}: ${p.status} (socketIds: ${p.socketIds?.length || 0})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

cleanupPresence();
