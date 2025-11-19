#!/usr/bin/env node

/**
 * Create Load Test Users for GKChatty
 * This script creates test users that will be visible in the admin dashboard
 *
 * Usage: node scripts/create-load-test-users.js [number_of_users]
 * Example: node scripts/create-load-test-users.js 10
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Number of users to create (default: 10, max: 50)
const NUM_USERS = Math.min(parseInt(process.argv[2]) || 10, 50);
const TEST_PASSWORD = 'LoadTest123!';
const SALT_ROUNDS = 10;

async function createTestUsers() {
  console.log(`\n🚀 Creating ${NUM_USERS} load test users...`);
  console.log(`These users WILL appear in your admin dashboard.\n`);

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Import User model
    const User = mongoose.model('User', new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      isActive: { type: Boolean, default: true },
      role: { type: String, default: 'user' }
    }));

    // Hash password once (all test users use same password)
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);

    const createdUsers = [];
    const failedUsers = [];

    // Create users
    for (let i = 1; i <= NUM_USERS; i++) {
      const username = `loadtest_user_${i}`;
      const email = `loadtest${i}@test.com`;

      try {
        // Check if user already exists
        const existingUser = await User.findOne({
          $or: [{ username }, { email }]
        });

        if (existingUser) {
          console.log(`⚠️  User ${username} already exists, skipping...`);
          createdUsers.push({ username, status: 'exists' });
        } else {
          // Create new user
          const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            role: 'user',
            isActive: true
          });

          console.log(`✅ Created user: ${username} (${email})`);
          createdUsers.push({ username, status: 'created' });
        }
      } catch (error) {
        console.error(`❌ Failed to create ${username}: ${error.message}`);
        failedUsers.push({ username, error: error.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));

    const created = createdUsers.filter(u => u.status === 'created').length;
    const existing = createdUsers.filter(u => u.status === 'exists').length;

    console.log(`✅ Successfully created: ${created} users`);
    console.log(`⚠️  Already existed: ${existing} users`);
    console.log(`❌ Failed: ${failedUsers.length} users`);

    console.log('\n📝 Test User Credentials:');
    console.log(`   Username pattern: loadtest_user_[1-${NUM_USERS}]`);
    console.log(`   Password (all users): ${TEST_PASSWORD}`);
    console.log('\n✨ Users are now visible in your admin dashboard!');

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
createTestUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });