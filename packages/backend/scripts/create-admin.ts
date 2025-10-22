#!/usr/bin/env ts-node
/**
 * Admin User Creation CLI Script
 *
 * Usage: pnpm exec ts-node scripts/create-admin.ts
 *
 * This script creates a new admin user with interactive prompts.
 * NO passwords are logged to console for security.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';
import { promisify } from 'util';

// Import User model
import User from '../src/models/UserModel';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = promisify(rl.question).bind(rl);

/**
 * Validate password strength
 */
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Prompt for password (hidden input)
 */
async function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (char: string) => {
      char = char.toString();

      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // Backspace
          password = password.slice(0, -1);
          stdout.clearLine(0);
          stdout.cursorTo(0);
          stdout.write(prompt + '*'.repeat(password.length));
          break;
        default:
          password += char;
          stdout.write('*');
          break;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('\n=== Admin User Creation ===\n');

  // Connect to database
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI or MONGO_URI not configured in environment');
    process.exit(1);
  }

  try {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }

  try {
    // Prompt for username
    const username = await question('Username: ') as string;

    if (!username || username.trim().length === 0) {
      console.error('❌ Username cannot be empty');
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      console.error(`❌ User "${username}" already exists`);
      process.exit(1);
    }

    // Prompt for email (optional)
    const email = await question('Email (optional): ') as string;

    // Prompt for password
    let password = '';
    let passwordValid = false;

    while (!passwordValid) {
      password = await promptPassword('Password: ');

      const validation = validatePassword(password);
      if (!validation.valid) {
        console.log('\n❌ Password requirements not met:');
        validation.errors.forEach(err => console.log(`   - ${err}`));
        console.log('');
        continue;
      }

      const confirmPassword = await promptPassword('Confirm password: ');

      if (password !== confirmPassword) {
        console.log('\n❌ Passwords do not match. Please try again.\n');
        continue;
      }

      passwordValid = true;
    }

    // Hash password
    console.log('\nCreating admin user...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
      username: username.trim(),
      email: email.trim() || undefined,
      password: hashedPassword,
      role: 'admin'
    });

    console.log(`✅ Admin user created successfully`);
    console.log(`   Username: ${newUser.username}`);
    console.log(`   Email: ${newUser.email || 'N/A'}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`   User ID: ${newUser._id}\n`);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run main function
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
