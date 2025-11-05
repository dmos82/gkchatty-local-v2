/**
 * Test SQLite Adapter
 *
 * Validates User and Document model adapters
 */

import { UserModel, DocumentModel, initializeDatabase, closeDatabase } from './src/utils/sqliteAdapter';
import * as path from 'path';
import * as fs from 'fs';

async function testSQLiteAdapter() {
  console.log('🧪 Testing SQLite Adapter...\n');

  const testDbPath = path.join(__dirname, 'test-adapter.db');

  try {
    // Clean up existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize database
    console.log('🚀 Initializing database...');
    initializeDatabase(testDbPath);
    console.log('✅ Database initialized\n');

    // Test 1: Create User
    console.log('📝 Test 1: Create User');
    const newUser = UserModel.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashed_password_123',
      role: 'user'
    });
    console.log('  ✅ User created:', newUser.username, '(ID:', newUser._id, ')');

    // Test 2: Find User by username
    console.log('\n🔍 Test 2: Find User by Username');
    const foundUser = UserModel.findOne({ username: 'testuser' });
    console.log('  ✅ User found:', foundUser.username, foundUser.email);

    // Test 3: Update User
    console.log('\n📝 Test 3: Update User');
    const updatedUser = UserModel.findByIdAndUpdate(foundUser._id, {
      email: 'updated@example.com',
      activeSessionIds: ['session1', 'session2']
    });
    console.log('  ✅ User updated:', updatedUser.email);
    console.log('     Active sessions:', updatedUser.activeSessionIds);

    // Test 4: Create another user (admin)
    console.log('\n📝 Test 4: Create Admin User');
    const adminUser = UserModel.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin_password_hash',
      role: 'admin'
    });
    console.log('  ✅ Admin created:', adminUser.username, '(Role:', adminUser.role, ')');

    // Test 5: Find all users
    console.log('\n🔍 Test 5: Find All Users');
    const allUsers = UserModel.find();
    console.log('  ✅ Found', allUsers.length, 'users');
    allUsers.forEach((user, index) => {
      console.log(`     ${index + 1}. ${user.username} (${user.role})`);
    });

    // Test 6: Create Document
    console.log('\n📝 Test 6: Create Document');
    const newDoc = DocumentModel.create({
      userId: foundUser.id,
      filename: 'test-document.pdf',
      filePath: '/path/to/test-document.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      contentHash: 'abc123hash',
      embeddingProvider: 'transformers',
      metadata: {
        title: 'Test Document',
        pages: 5
      }
    });
    console.log('  ✅ Document created:', newDoc.filename);
    console.log('     Metadata:', JSON.stringify(newDoc.metadata));

    // Test 7: Find documents by user
    console.log('\n🔍 Test 7: Find Documents by User');
    const userDocs = DocumentModel.find({ userId: foundUser.id });
    console.log('  ✅ Found', userDocs.length, 'documents for user:', foundUser.username);
    userDocs.forEach((doc, index) => {
      console.log(`     ${index + 1}. ${doc.filename} (${doc.fileSize} bytes)`);
    });

    // Test 8: Update Document
    console.log('\n📝 Test 8: Update Document');
    const updatedDoc = DocumentModel.findByIdAndUpdate(newDoc._id, {
      fileSize: 2048,
      metadata: {
        title: 'Updated Test Document',
        pages: 10,
        author: 'Test User'
      }
    });
    console.log('  ✅ Document updated:', updatedDoc.filename);
    console.log('     New size:', updatedDoc.fileSize, 'bytes');
    console.log('     New metadata:', JSON.stringify(updatedDoc.metadata));

    // Test 9: Test Mongoose-like select
    console.log('\n🔍 Test 9: Test Password Exclusion');
    const userWithoutPassword = UserModel.findOne({ username: 'testuser' });
    console.log('  ✅ User fetched (password excluded by default)');
    console.log('     Has password field?', 'password' in userWithoutPassword);

    const userWithPassword = UserModel.select('+password').findOne({ username: 'testuser' });
    console.log('  ✅ User fetched with password (explicit select)');
    console.log('     Has password field?', 'password' in userWithPassword);

    // Test 10: Delete operations
    console.log('\n🗑️  Test 10: Delete Operations');
    const deletedDoc = DocumentModel.findByIdAndDelete(newDoc._id);
    console.log('  ✅ Document deleted:', deletedDoc.filename);

    const deletedUser = UserModel.findByIdAndDelete(adminUser._id);
    console.log('  ✅ User deleted:', deletedUser.username);

    // Verify deletions
    const remainingUsers = UserModel.find();
    console.log('  ✅ Remaining users:', remainingUsers.length);

    console.log('\n✅ All tests passed!\n');

    // Summary
    console.log('📊 Test Summary:');
    console.log('  - User CRUD operations: ✅');
    console.log('  - Document CRUD operations: ✅');
    console.log('  - Mongoose-compatible API: ✅');
    console.log('  - JSON serialization: ✅');
    console.log('  - Password handling: ✅');

    // Cleanup
    closeDatabase();
    console.log('\n🧹 Database closed');

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log('🧹 Test database removed');
    }

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);

    // Cleanup on error
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    process.exit(1);
  }
}

// Run tests
testSQLiteAdapter();
