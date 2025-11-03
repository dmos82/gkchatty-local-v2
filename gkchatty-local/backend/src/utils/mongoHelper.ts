import 'dotenv/config'; // Ensure env variables are loaded before we read them
import mongoose from 'mongoose';
import { getLogger } from './logger';

const log = getLogger('mongoHelper');

// Check for both MONGODB_URI and MONGO_URI environment variables
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Debug log to track the value of MONGODB_URI at module load time
log.debug(`[mongoHelper TOP LEVEL] MONGODB_URI from process.env: "${MONGODB_URI}"`);

if (!MONGODB_URI) {
  log.error('FATAL ERROR: MONGODB_URI or MONGO_URI is not defined in environment variables.');
  process.exit(1); // Exit if DB connection string is missing
}

/**
 * Connects to the MongoDB database.
 */
export const connectDB = async () => {
  try {
    // Remove hardcoded database name logic - let Mongoose use the database from the URI
    const nodeEnv = process.env.NODE_ENV;

    // Explicitly log the full connection string (mask credentials if needed)
    const mongoUriForConnection = MONGODB_URI;

    log.debug(
      `[DB Connect] Attempting to connect to MongoDB with URI: "${mongoUriForConnection}" for NODE_ENV: "${nodeEnv}"`
    );

    // Validate the URI format before attempting connection
    if (
      !mongoUriForConnection ||
      (!mongoUriForConnection.startsWith('mongodb://') &&
        !mongoUriForConnection.startsWith('mongodb+srv://'))
    ) {
      log.error(
        `[DB Connect CRITICAL ERROR] MONGODB_URI is invalid or missing. Value: "${mongoUriForConnection}". Check apps/api/.env and mongoHelper.ts.`
      );
      throw new Error('MongoDB connection URI is invalid. Server cannot start.');
    }

    // Connect without specifying dbName - use the database from the URI
    await mongoose.connect(mongoUriForConnection);

    // Get the actual database name being used
    const connectedDbName = mongoose.connection.db?.databaseName || 'unknown';
    log.debug(`✅ MongoDB Connected successfully to database: ${connectedDbName}.`);

    mongoose.connection.on('error', err => {
      log.error('MongoDB connection error after initial connection:', err);
    });
    mongoose.connection.on('disconnected', () => {
      log.debug('MongoDB disconnected.');
    });
  } catch (err: any) {
    log.error('❌❌❌ MongoDB initial connection FAILED. Full error:');
    log.error('Error name:', err.name);
    log.error('Error message:', err.message);
    log.error('Error code:', err.code);

    try {
      log.error('Full error object:', JSON.stringify(err, null, 2));
    } catch (jsonErr) {
      log.error('Error could not be stringified:', err);
    }

    log.error('Error stack:', err.stack);

    // process.exit(1); // <-- COMMENT OUT or REMOVE this line
    throw err; // Re-throw the error so the calling code (IIFE in index.ts) can potentially see it
  }
};

/**
 * Disconnects from the MongoDB database.
 */
export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    log.debug('🔌 MongoDB disconnected successfully.');
  } catch (err) {
    log.error('❌ Error disconnecting from MongoDB:', err);
    // Decide if we should throw, exit, or just log
    // throw err; // Optional: re-throw if disconnection failure is critical
  }
};

// Define Schemas (We will add these in the next step)
// Placeholder for SystemDocument schema
// Placeholder for UserDocument schema

// Export models (We will add these later)
// export const SystemDocument = mongoose.model('SystemDocument', systemDocumentSchema);
// export const UserDocument = mongoose.model('UserDocument', userDocumentSchema);

// Optional: Export helper functions for CRUD operations later
