require('dotenv').config();
const mongoose = require('mongoose');

async function deleteLoadTestUsers() {
  const MONGODB_URI = process.env.MONGODB_URI;

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  // Delete users matching loadtest_user_* pattern
  const result = await mongoose.connection.db.collection('users').deleteMany({
    username: { $regex: /^loadtest_user_/ }
  });

  console.log(`Deleted ${result.deletedCount} load test users`);

  // Also clean up any chat history from these users
  const chatsResult = await mongoose.connection.db.collection('chats').deleteMany({
    'user.username': { $regex: /^loadtest_user_/ }
  });
  console.log(`Deleted ${chatsResult.deletedCount} chat records`);

  await mongoose.disconnect();
  console.log('Done!');
}

deleteLoadTestUsers().catch(console.error);
