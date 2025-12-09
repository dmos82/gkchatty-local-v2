const { MongoClient } = require('mongodb');

const URI = 'mongodb+srv://gkchatty_trueprod_app_user:GKChatty2024Secure789@gkchatty-staging-cluste.2l9dc.mongodb.net/?retryWrites=true&w=majority';

async function verifyDatabase() {
  const client = new MongoClient(URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas\n');

    const prodDb = client.db('GKCHATTY-PRODUCTION');

    // Check collections
    const collections = await prodDb.listCollections().toArray();
    console.log(`GKCHATTY-PRODUCTION has ${collections.length} collections:\n`);

    for (const coll of collections) {
      const count = await prodDb.collection(coll.name).countDocuments();
      console.log(`  ${coll.name}: ${count} documents`);
    }

    // Check users specifically
    console.log('\n--- Users in PRODUCTION ---');
    const users = await prodDb.collection('users').find({}, { projection: { username: 1, role: 1 } }).toArray();
    users.forEach(u => console.log(`  ${u.username} (${u.role})`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

verifyDatabase();
