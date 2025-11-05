// Quick test script to verify UserModel.findOne works
const path = require('path');

// Set environment variable
process.env.USE_SQLITE = 'true';
process.env.SQLITE_DB_PATH = '/Users/davidjmorin/.gkchatty/data/gkchatty.db';

console.log('=== Testing UserModel with SQLite ===');
console.log('USE_SQLITE:', process.env.USE_SQLITE);
console.log('SQLITE_DB_PATH:', process.env.SQLITE_DB_PATH);
console.log('');

async function test() {
  try {
    // Import the model factory
    const modelFactoryPath = path.join(__dirname, 'backend/src/utils/modelFactory.ts');
    console.log('Importing from:', modelFactoryPath);

    // Use ts-node to load TypeScript
    require('ts-node').register({
      project: path.join(__dirname, 'backend/tsconfig.json'),
      transpileOnly: true
    });

    const { UserModel } = require('./backend/src/utils/modelFactory');

    console.log('UserModel loaded:', typeof UserModel);
    console.log('UserModel.findOne:', typeof UserModel.findOne);
    console.log('');

    // Test findOne
    console.log('Testing User.findOne({ username: "admin" })...');
    const user = UserModel.findOne({ username: 'admin' });

    console.log('Result:', user ? 'User found!' : 'User not found');
    if (user) {
      console.log('User details:', {
        id: user.id,
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        hasPassword: !!user.password,
        passwordLength: user.password ? user.password.length : 0
      });
    }

    console.log('');
    console.log('✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error('Error:', error);
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();
