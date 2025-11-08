#!/usr/bin/env ts-node
/**
 * Create Test Users for Rate Limit Testing
 * Creates 50 test users to simulate insurance company deployment
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty';

// User schema (simplified)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

async function createTestUsers(count: number = 50) {
  try {
    console.log(`\n🔗 Connecting to MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check existing test users
    const existingCount = await User.countDocuments({
      username: /^testuser\d+$/,
    });

    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing test users`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      await new Promise<void>((resolve) => {
        readline.question('Delete existing test users? (yes/no): ', async (answer: string) => {
          if (answer.toLowerCase() === 'yes') {
            await User.deleteMany({ username: /^testuser\d+$/ });
            console.log(`🗑️  Deleted ${existingCount} test users\n`);
          }
          readline.close();
          resolve();
        });
      });
    }

    console.log(`👥 Creating ${count} test users...`);

    const password = 'test123'; // Simple password for testing
    const hashedPassword = await bcrypt.hash(password, 10);

    const users = [];
    for (let i = 1; i <= count; i++) {
      users.push({
        username: `testuser${i}`,
        email: `testuser${i}@insurance.com`,
        password: hashedPassword,
        role: 'user',
      });

      if (i % 10 === 0) {
        process.stdout.write(`  Created ${i}/${count}\n`);
      }
    }

    await User.insertMany(users);

    console.log(`\n✅ Successfully created ${count} test users`);
    console.log('\nCredentials:');
    console.log('  Username: testuser1 to testuser50');
    console.log('  Password: test123');
    console.log('  Email: testuser1@insurance.com to testuser50@insurance.com\n');

  } catch (error) {
    console.error('❌ Error creating test users:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

// Run if called directly
const args = process.argv.slice(2);
const count = args[0] ? parseInt(args[0]) : 50;

createTestUsers(count);
