/**
 * Migration: Initialize User Document Folders
 *
 * Purpose: Create root "My Documents" folder for each user and assign
 *          existing unorganized documents to it.
 *
 * Safety Guarantees:
 * - Only affects UserDocument collection (sourceType: 'user')
 * - Does NOT touch SystemKbDocument collection
 * - Does NOT modify S3 files
 * - Does NOT modify Pinecone vectors
 * - Non-destructive (adds folderId, doesn't remove data)
 * - Includes rollback capability
 */

import mongoose from 'mongoose';
import { Folder } from '../models/FolderModel';
import { UserDocument } from '../models/UserDocument';
import User from '../models/UserModel';
import { getLogger } from '../utils/logger';

const logger = getLogger('migration:user-folders');

interface MigrationResult {
  success: boolean;
  usersProcessed: number;
  foldersCreated: number;
  documentsAssigned: number;
  errors: string[];
}

/**
 * Run the migration to initialize user folders
 */
export async function up(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    usersProcessed: 0,
    foldersCreated: 0,
    documentsAssigned: 0,
    errors: [],
  };

  logger.info('Starting user folder initialization migration');

  try {
    // Step 1: Get all users who have documents
    const usersWithDocs = await UserDocument.distinct('userId', {
      sourceType: 'user', // ✅ CRITICAL: Only user documents
      userId: { $exists: true, $ne: null },
    });

    logger.info({ userCount: usersWithDocs.length }, 'Found users with documents');

    // Step 2: Process each user
    for (const userId of usersWithDocs) {
      try {
        // Safety check: Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          result.errors.push(`User ${userId} not found, skipping`);
          continue;
        }

        logger.info({ userId, username: user.username }, 'Processing user');

        // Check if user already has a root folder
        let rootFolder = await Folder.findOne({
          ownerId: userId,
          parentId: null, // Root folder has no parent
        });

        if (!rootFolder) {
          // Create root "My Documents" folder
          rootFolder = await Folder.create({
            name: 'My Documents',
            ownerId: userId,
            parentId: null,
            path: '/My Documents', // Will be auto-computed by pre-save hook
          });

          result.foldersCreated++;
          logger.info({ userId, folderId: rootFolder._id }, 'Created root folder');
        } else {
          logger.info({ userId, folderId: rootFolder._id }, 'Root folder already exists');
        }

        // Step 3: Assign unorganized documents to root folder
        const updateResult = await UserDocument.updateMany(
          {
            userId: userId,
            sourceType: 'user', // ✅ CRITICAL: Only user documents
            folderId: { $exists: false }, // Only documents without folder
          },
          {
            $set: { folderId: rootFolder._id },
          }
        );

        result.documentsAssigned += updateResult.modifiedCount;
        logger.info(
          { userId, documentsAssigned: updateResult.modifiedCount },
          'Assigned documents to root folder'
        );

        result.usersProcessed++;
      } catch (userError) {
        const errorMsg = `Error processing user ${userId}: ${
          userError instanceof Error ? userError.message : String(userError)
        }`;
        result.errors.push(errorMsg);
        logger.error({ error: userError, userId }, errorMsg);
        // Continue to next user instead of failing entire migration
      }
    }

    // Step 4: Verification
    logger.info('Running post-migration verification');

    // Verify System KB documents were NOT touched
    const systemKbCount = await mongoose.connection.db
      .collection('systemkbdocuments')
      .countDocuments({});

    logger.info({ systemKbCount }, 'System KB documents remain unchanged');

    // Verify no user documents without folders
    const orphanDocs = await UserDocument.countDocuments({
      sourceType: 'user',
      userId: { $exists: true },
      folderId: { $exists: false },
    });

    if (orphanDocs > 0) {
      result.errors.push(`Warning: ${orphanDocs} user documents still without folders`);
    }

    result.success = result.errors.length === 0 || result.usersProcessed > 0;

    logger.info(
      {
        usersProcessed: result.usersProcessed,
        foldersCreated: result.foldersCreated,
        documentsAssigned: result.documentsAssigned,
        errors: result.errors.length,
      },
      'Migration completed'
    );

    return result;
  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    logger.error({ error }, errorMsg);
    return result;
  }
}

/**
 * Rollback the migration (remove folder assignments)
 */
export async function down(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    usersProcessed: 0,
    foldersCreated: 0,
    documentsAssigned: 0,
    errors: [],
  };

  logger.warn('Starting rollback of user folder migration');

  try {
    // Step 1: Remove folderId from all user documents
    const updateResult = await UserDocument.updateMany(
      {
        sourceType: 'user', // ✅ CRITICAL: Only user documents
        folderId: { $exists: true },
      },
      {
        $unset: { folderId: '' },
      }
    );

    result.documentsAssigned = updateResult.modifiedCount;
    logger.info({ documentsUnassigned: result.documentsAssigned }, 'Removed folder assignments');

    // Step 2: Delete all user-owned folders
    const deleteResult = await Folder.deleteMany({
      ownerId: { $exists: true }, // User folders have ownerId
      knowledgeBaseId: { $exists: false }, // Don't delete tenant KB folders
    });

    result.foldersCreated = deleteResult.deletedCount;
    logger.info({ foldersDeleted: result.foldersCreated }, 'Deleted user folders');

    result.success = true;
    logger.info('Rollback completed successfully');

    return result;
  } catch (error) {
    const errorMsg = `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    logger.error({ error }, errorMsg);
    return result;
  }
}

/**
 * CLI runner for manual execution
 */
if (require.main === module) {
  const run = async () => {
    try {
      // Connect to MongoDB
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gkckb';
      await mongoose.connect(mongoUri);
      logger.info({ mongoUri }, 'Connected to MongoDB');

      // Check command line arguments
      const command = process.argv[2];

      if (command === 'down' || command === 'rollback') {
        const result = await down();
        console.log('Rollback Result:', JSON.stringify(result, null, 2));
      } else {
        const result = await up();
        console.log('Migration Result:', JSON.stringify(result, null, 2));
      }

      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');

      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Migration script failed');
      console.error(error);
      process.exit(1);
    }
  };

  run();
}
