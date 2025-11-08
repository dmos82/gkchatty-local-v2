import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/UserModel';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

async function createTestAdmin() {
  try {
    console.log('[Create Test Admin] Starting...');

    // Connect using the same method as the API server
    const { connectDB } = await import('../utils/mongoHelper');
    await connectDB();

    console.log('[Create Test Admin] Connected to database:', mongoose.connection.db?.databaseName);

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'testadmin' });
    if (existingAdmin) {
      console.log('[Create Test Admin] Test admin already exists');
      await mongoose.disconnect();
      return;
    }

    // Create test admin user
    const hashedPassword = await bcrypt.hash('testpassword', BCRYPT_SALT_ROUNDS);
    const adminUser = await User.create({
      username: 'testadmin',
      email: 'testadmin@example.com',
      password: hashedPassword,
      role: 'admin',
    });

    console.log('[Create Test Admin] Created test admin user:', {
      id: adminUser._id,
      username: adminUser.username,
      role: adminUser.role,
    });

    await mongoose.disconnect();
    console.log('[Create Test Admin] Complete!');
  } catch (error) {
    console.error('[Create Test Admin] Error:', error);
    process.exit(1);
  }
}

createTestAdmin();
