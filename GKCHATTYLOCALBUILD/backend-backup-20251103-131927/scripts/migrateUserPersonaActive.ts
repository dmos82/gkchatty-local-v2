import mongoose from 'mongoose';
import User from '../models/UserModel';
import { config } from 'dotenv';
import * as pathModule from 'path';
import { getLogger } from '../utils/logger';

// Configure environment variables
config({ path: pathModule.resolve(__dirname, '../../../.env') });

const log = getLogger('migrateUserPersonaActive');

const migrationScript = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    log.info('Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    log.info('Connected to MongoDB successfully');

    // Update all users where isPersonaEnabled is not set
    const result = await User.updateMany(
      { isPersonaEnabled: { $exists: false } },
      { $set: { isPersonaEnabled: false } }
    );

    log.info(
      `Migration completed: ${result.matchedCount} users found, ${result.modifiedCount} users updated`
    );

    // Close the MongoDB connection
    await mongoose.connection.close();
    log.info('Disconnected from MongoDB');

    process.exit(0);
  } catch (error) {
    log.error('Error in migration script:', error);
    process.exit(1);
  }
};

// Run the migration script
migrationScript();
