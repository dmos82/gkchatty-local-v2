#!/usr/bin/env node

/**
 * GKChatty User Creator Utility
 *
 * Creates project-specific admin users for GKChatty knowledge base isolation.
 * Each project gets its own user with separate document storage.
 *
 * Usage: node gkchatty-user-creator.js <username> [password]
 *
 * @date 2025-10-27
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configuration - these should match your GKChatty backend
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty';
const SALT_ROUNDS = 12;

// User schema definition (matching the backend)
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  email: {
    type: String,
    required: false,
    sparse: true,
    lowercase: true,
    trim: true,
    default: null,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'admin'],
    default: 'admin', // Default to admin for project users
  },
  activeSessionIds: {
    type: [String],
    required: false,
    default: [],
  },
  forcePasswordChange: {
    type: Boolean,
    required: false,
    default: false,
  },
  isPersonaEnabled: {
    type: Boolean,
    default: false,
  },
  canCustomizePersona: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Create User model
const User = mongoose.model('User', UserSchema);

/**
 * Generate a secure random password
 */
function generateSecurePassword() {
  // Generate a password with uppercase, lowercase, numbers, and special characters
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Ensure at least one of each type
  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  // Fill the rest randomly
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 0; i < 12; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Create a new GKChatty user
 */
async function createUser(username, password) {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log(`❌ User '${username}' already exists!`);
      console.log(`   ID: ${existingUser._id}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Created: ${existingUser.createdAt}`);
      return null;
    }

    // Generate password if not provided
    if (!password) {
      password = generateSecurePassword();
      console.log(`🔑 Generated secure password: ${password}`);
    }

    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create the user
    console.log(`👤 Creating admin user '${username}'...`);
    const userData = {
      username: username.toLowerCase().replace(/[^a-z0-9]/g, ''), // Sanitize username
      email: `${username}@gkchatty.local`, // Optional email for identification
      password: hashedPassword,
      role: 'admin', // Admin role for project users
      forcePasswordChange: false,
      isPersonaEnabled: true,
      canCustomizePersona: true,
    };

    const user = await User.create(userData);
    console.log(`✅ User created successfully!`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password: ${password}`);
    console.log(`   Email: ${user.email}`);

    return {
      username: user.username,
      password: password,
      userId: user._id,
      role: user.role,
    };

  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    if (error.code === 11000) {
      console.error('   Username already exists in database');
    }
    throw error;
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
GKChatty User Creator

Usage:
  node gkchatty-user-creator.js <username> [password]

Examples:
  node gkchatty-user-creator.js commisocial           # Generates secure password
  node gkchatty-user-creator.js commisocial MyPass123! # Uses provided password

Environment Variables:
  MONGODB_URI - MongoDB connection string (default: mongodb://localhost:27017/gkchatty)

Notes:
  - Creates an admin user for project-specific knowledge base
  - Username will be sanitized (lowercase, alphanumeric only)
  - If no password provided, generates a secure 16-character password
  - Each project should have its own user for document isolation
    `);
    process.exit(0);
  }

  const username = args[0];
  const password = args[1];

  try {
    const result = await createUser(username, password);

    if (result) {
      console.log('\n📋 Summary:');
      console.log('─'.repeat(40));
      console.log(`Username: ${result.username}`);
      console.log(`Password: ${result.password}`);
      console.log(`Role: ${result.role}`);
      console.log('─'.repeat(40));
      console.log('\n💡 Next steps:');
      console.log(`1. Use MCP to switch to this user:`);
      console.log(`   mcp__gkchatty_kb__switch_user("${result.username}", "${result.password}")`);
      console.log(`2. Upload documents to this user's knowledge base`);
      console.log(`3. Query documents using this user's context`);
    }
  } catch (error) {
    process.exit(1);
  }
}

// Export for use as module
module.exports = { createUser, generateSecurePassword };

// Run if executed directly
if (require.main === module) {
  main();
}