import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import User from '../models/UserModel';
import * as path from 'path';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

// Load environment variables from the correct path
config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Script to create or update an administrative user
 *
 * This script:
 * 1. Accepts --email and --password command line arguments
 * 2. Connects to MongoDB using environment variables
 * 3. Checks if a user with the provided email already exists
 * 4. If user exists: updates password with new hash
 * 5. If user doesn't exist: creates new admin user with required fields
 * 6. Uses bcrypt for secure password hashing (matching app standards)
 *
 * Usage:
 * ts-node apps/api/src/scripts/create-admin-user.ts --email admin@example.com --password MySecurePassword123
 *
 * Or with pnpm:
 * pnpm run user:create-admin --email admin@example.com --password MySecurePassword123
 */

interface ParsedArgs {
  email?: string;
  password?: string;
}

/**
 * Parse command line arguments for --email and --password
 */
function parseArguments(): ParsedArgs {
  const args: ParsedArgs = {};

  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--email' && i + 1 < process.argv.length) {
      args.email = process.argv[i + 1];
    }
    if (process.argv[i] === '--password' && i + 1 < process.argv.length) {
      args.password = process.argv[i + 1];
    }
  }

  return args;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate username from email (part before @)
 */
function generateUsername(email: string): string {
  return email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Main function to create or update admin user
 */
async function createAdminUser(): Promise<void> {
  console.log(`\n=== ADMIN USER CREATION UTILITY ===`);
  console.log(`🔧 Starting admin user provisioning process...`);

  // Parse command line arguments
  const args = parseArguments();

  // Validate required arguments
  if (!args.email || !args.password) {
    console.error(`❌ Error: Both --email and --password arguments are required`);
    console.error(
      `Usage: ts-node apps/api/src/scripts/create-admin-user.ts --email <email> --password <password>`
    );
    console.error(
      `Example: ts-node apps/api/src/scripts/create-admin-user.ts --email admin@company.com --password SecurePass123!`
    );
    process.exit(1);
  }

  // Validate email format
  if (!isValidEmail(args.email)) {
    console.error(`❌ Error: Invalid email format: ${args.email}`);
    console.error(`Please provide a valid email address (e.g., admin@company.com)`);
    process.exit(1);
  }

  // Validate password strength
  if (args.password.length < 6) {
    console.error(`❌ Error: Password must be at least 6 characters long`);
    console.error(`Current password length: ${args.password.length} characters`);
    process.exit(1);
  }

  console.log(`📧 Email: ${args.email}`);
  console.log(`🔐 Password: ${args.password.replace(/./g, '*')} (${args.password.length} chars)`);

  try {
    // Step 1: Connect to MongoDB
    console.log(`\n🔌 Step 1: Connecting to MongoDB...`);
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ Connected to MongoDB successfully`);
    console.log(`   Database: ${mongoose.connection.db.databaseName}`);
    console.log(`   Collection: ${User.collection.name}\n`);

    // Step 2: Check if user already exists
    console.log(`🔍 Step 2: Checking for existing user...`);
    const existingUser = await User.findOne({ email: args.email });

    if (existingUser) {
      console.log(`✅ Found existing user:`);
      console.log(`   - ID: ${existingUser._id}`);
      console.log(`   - Username: ${existingUser.username}`);
      console.log(`   - Email: ${existingUser.email}`);
      console.log(`   - Current Role: ${existingUser.role}`);
      console.log(`   - Created: ${existingUser.createdAt}\n`);

      // Step 3a: Update existing user's password
      console.log(`🔄 Step 3: Updating existing user's password...`);
      const hashedPassword = await bcrypt.hash(args.password, BCRYPT_SALT_ROUNDS);

      existingUser.password = hashedPassword;
      existingUser.role = 'admin'; // Ensure admin role
      existingUser.forcePasswordChange = false; // Clear any forced password change
      await existingUser.save();

      console.log(`✅ Successfully updated password for admin user: ${args.email}`);
      console.log(`   - Role set to: admin`);
      console.log(`   - Force password change: false`);
    } else {
      console.log(`ℹ️  No existing user found with email: ${args.email}`);

      // Step 3b: Create new admin user
      console.log(`\n👤 Step 3: Creating new admin user...`);

      // Generate username from email
      const username = generateUsername(args.email);
      console.log(`   - Generated username: ${username}`);

      // Check if username already exists
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        console.error(`❌ Error: Username '${username}' already exists in the database`);
        console.error(`Please use a different email address or manually specify a unique username`);
        process.exit(1);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(args.password, BCRYPT_SALT_ROUNDS);
      console.log(`   - Password hashed successfully (bcrypt, ${BCRYPT_SALT_ROUNDS} rounds)`);

      // Create new user document
      const newUser = new User({
        username: username,
        email: args.email,
        password: hashedPassword,
        role: 'admin',
        forcePasswordChange: false,
        // Persona settings
        isPersonaEnabled: false,
        canCustomizePersona: true, // Admins can customize personas
        // Usage tracking defaults
        usageMonthMarker: undefined,
        currentMonthPromptTokens: 0,
        currentMonthCompletionTokens: 0,
        currentMonthCost: 0,
      });

      await newUser.save();

      console.log(`✅ Successfully created new admin user: ${args.email}`);
      console.log(`   - User ID: ${newUser._id}`);
      console.log(`   - Username: ${newUser.username}`);
      console.log(`   - Email: ${newUser.email}`);
      console.log(`   - Role: ${newUser.role}`);
      console.log(`   - Created: ${newUser.createdAt}`);
      console.log(`   - Can Customize Persona: ${newUser.canCustomizePersona}`);
    }

    // Step 4: Verify creation/update
    console.log(`\n✅ Step 4: Verifying admin user...`);
    const verifyUser = await User.findOne({ email: args.email }).select('+password');

    if (!verifyUser) {
      throw new Error('Failed to verify user creation/update');
    }

    // Test password hash
    const passwordValid = await bcrypt.compare(args.password, verifyUser.password!);

    console.log(`✅ Admin user verification successful:`);
    console.log(`   - User exists: ✓`);
    console.log(`   - Password hash valid: ${passwordValid ? '✓' : '❌'}`);
    console.log(`   - Role is admin: ${verifyUser.role === 'admin' ? '✓' : '❌'}`);

    if (!passwordValid) {
      throw new Error('Password verification failed');
    }

    console.log(`\n🎉 SUCCESS: Admin user is ready for login!`);
    console.log(`\n=== LOGIN CREDENTIALS ===`);
    console.log(`Email: ${args.email}`);
    console.log(`Password: ${args.password}`);
    console.log(`Role: admin`);
    console.log(`=========================\n`);
  } catch (error) {
    console.error(`\n❌ FATAL ERROR during admin user creation:`, error);

    if (error instanceof Error) {
      console.error(`Error Type: ${error.constructor.name}`);
      console.error(`Error Message: ${error.message}`);

      if (error.message.includes('E11000') || error.message.includes('duplicate key')) {
        console.error(`\n💡 This appears to be a duplicate key error.`);
        console.error(`Try using a different email address or check if the user already exists.`);
      }
    }

    process.exit(1);
  } finally {
    try {
      await mongoose.connection.close();
      console.log(`🔌 MongoDB connection closed`);
    } catch (closeError) {
      console.error(`Warning: Error closing MongoDB connection:`, closeError);
    }
  }
}

// Execute the script
if (require.main === module) {
  createAdminUser()
    .then(() => {
      console.log(`\n=== ADMIN USER CREATION COMPLETED ===`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n💥 Unhandled error in admin user creation:`, error);
      process.exit(1);
    });
}

export default createAdminUser;
