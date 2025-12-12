import mongoose from 'mongoose';
import { config } from 'dotenv';
import * as pathModule from 'path';
import { getLogger } from '../utils/logger';
import User, { IUser } from '../models/UserModel';
import UserSettings, { IUserSettings } from '../models/UserSettings';
import PersonaModel from '../models/PersonaModel';
import { escapeRegExp } from '../utils/regexEscape';

// Configure environment variables
config({ path: pathModule.resolve(__dirname, '../../../../.env') });

const log = getLogger('migrateUserCustomPrompts');

// Migration constants
const DEFAULT_PERSONA_NAME = 'My Custom Prompt';

// Command line argument parsing
const isDryRun = process.argv.includes('--dry-run');

interface MigrationStats {
  totalUsersFound: number;
  eligibleForMigration: number;
  successfullyMigrated: number;
  skippedEmpty: number;
  skippedAlreadyMigrated: number;
  skippedDuplicateName: number;
  errors: number;
  errorDetails: Array<{ userId: string; error: string }>;
}

/**
 * Check if user already has a persona with the default migration name
 */
const hasExistingPersonaWithName = async (
  userId: mongoose.Types.ObjectId,
  name: string
): Promise<boolean> => {
  // SEC-011 FIX: Escape user input to prevent regex injection / ReDoS
  const existingPersona = await PersonaModel.findOne({
    userId,
    name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') }, // Case-insensitive match
  });
  return !!existingPersona;
};

/**
 * Migrate a single user's custom prompt to a persona
 */
const migrateUserPrompt = async (
  user: IUser,
  userSettings: IUserSettings,
  stats: MigrationStats
): Promise<void> => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const userId = user._id as mongoose.Types.ObjectId;
      const customPrompt = userSettings.customPrompt!.trim();

      log.info(`Processing user ${user.username} (${userId})`);

      // Check for existing persona with the same name
      if (await hasExistingPersonaWithName(userId, DEFAULT_PERSONA_NAME)) {
        log.warn(
          `User ${user.username} already has a persona named "${DEFAULT_PERSONA_NAME}". Skipping creation but marking as migrated.`
        );
        stats.skippedDuplicateName++;

        // Still mark as migrated to prevent re-processing
        if (!isDryRun) {
          await UserSettings.findOneAndUpdate(
            { userId },
            { customPromptMigratedToPersona: true },
            { session }
          );
        }
        return;
      }

      // Determine if the persona should be active
      const shouldActivate = user.isPersonaEnabled === true;

      if (!isDryRun) {
        // Create the new persona
        const newPersona = new PersonaModel({
          name: DEFAULT_PERSONA_NAME,
          prompt: customPrompt,
          userId: userId,
          isActive: shouldActivate,
        });

        const savedPersona = await newPersona.save({ session });
        log.info(`Created persona "${DEFAULT_PERSONA_NAME}" for user ${user.username}`);

        // Update user's activePersonaId if this persona should be active
        if (shouldActivate) {
          await User.findByIdAndUpdate(userId, { activePersonaId: savedPersona._id }, { session });
          log.info(`Set persona "${DEFAULT_PERSONA_NAME}" as active for user ${user.username}`);
        }

        // Mark the migration as complete
        await UserSettings.findOneAndUpdate(
          { userId },
          { customPromptMigratedToPersona: true },
          { session }
        );

        log.info(`Successfully migrated custom prompt for user ${user.username}`);
      } else {
        log.info(
          `[DRY RUN] Would create persona "${DEFAULT_PERSONA_NAME}" for user ${user.username} (active: ${shouldActivate})`
        );
      }

      stats.successfullyMigrated++;
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error migrating user ${user.username} (${user._id}):`, error);
    stats.errors++;
    stats.errorDetails.push({
      userId: (user._id as mongoose.Types.ObjectId).toString(),
      error: errorMessage,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Main migration function
 */
const runMigration = async (): Promise<void> => {
  const stats: MigrationStats = {
    totalUsersFound: 0,
    eligibleForMigration: 0,
    successfullyMigrated: 0,
    skippedEmpty: 0,
    skippedAlreadyMigrated: 0,
    skippedDuplicateName: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    log.info('Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    log.info('Connected to MongoDB successfully');

    if (isDryRun) {
      log.info('🔍 RUNNING IN DRY RUN MODE - No changes will be made to the database');
    } else {
      log.info('🚀 RUNNING MIGRATION - Changes will be made to the database');
    }

    // Find all users
    const allUsers = await User.find({});
    stats.totalUsersFound = allUsers.length;
    log.info(`Found ${stats.totalUsersFound} total users`);

    // Process each user
    for (const user of allUsers) {
      try {
        // Get user settings
        const userSettings = await UserSettings.findOne({ userId: user._id });

        // Check if migration is needed
        if (!userSettings) {
          log.debug(`User ${user.username} has no settings document. Skipping.`);
          continue;
        }

        if (userSettings.customPromptMigratedToPersona) {
          log.debug(`User ${user.username} already migrated. Skipping.`);
          stats.skippedAlreadyMigrated++;
          continue;
        }

        if (!userSettings.customPrompt || userSettings.customPrompt.trim().length === 0) {
          log.debug(`User ${user.username} has empty custom prompt. Marking as migrated.`);
          stats.skippedEmpty++;

          // Mark as migrated even though we're skipping
          if (!isDryRun) {
            await UserSettings.findOneAndUpdate(
              { userId: user._id },
              { customPromptMigratedToPersona: true }
            );
          }
          continue;
        }

        // User is eligible for migration
        stats.eligibleForMigration++;
        log.info(
          `User ${user.username} eligible for migration (prompt length: ${userSettings.customPrompt.trim().length})`
        );

        // Migrate the user
        await migrateUserPrompt(user, userSettings, stats);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Error processing user ${user.username}:`, error);
        stats.errors++;
        stats.errorDetails.push({
          userId: (user._id as mongoose.Types.ObjectId).toString(),
          error: errorMessage,
        });
      }
    }

    // Print final statistics
    log.info('\n📊 MIGRATION SUMMARY:');
    log.info(`Total users found: ${stats.totalUsersFound}`);
    log.info(`Eligible for migration: ${stats.eligibleForMigration}`);
    log.info(`Successfully migrated: ${stats.successfullyMigrated}`);
    log.info(`Skipped (empty prompt): ${stats.skippedEmpty}`);
    log.info(`Skipped (already migrated): ${stats.skippedAlreadyMigrated}`);
    log.info(`Skipped (duplicate name): ${stats.skippedDuplicateName}`);
    log.info(`Errors encountered: ${stats.errors}`);

    if (stats.errorDetails.length > 0) {
      log.error('\n❌ ERROR DETAILS:');
      stats.errorDetails.forEach(({ userId, error }) => {
        log.error(`User ${userId}: ${error}`);
      });
    }

    if (isDryRun) {
      log.info('\n🔍 DRY RUN COMPLETE - No changes were made to the database');
    } else {
      log.info('\n✅ MIGRATION COMPLETE');
    }
  } catch (error) {
    console.error('Fatal error in migration script:', error);
    log.error('Fatal error in migration script:', error);
    throw error;
  } finally {
    // Close the MongoDB connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      log.info('Disconnected from MongoDB');
    }
  }
};

/**
 * Script entry point
 */
const migrationScript = async (): Promise<void> => {
  try {
    await runMigration();
    process.exit(0);
  } catch (error) {
    log.error('Migration script failed:', error);
    process.exit(1);
  }
};

// Run the migration script
if (require.main === module) {
  migrationScript();
}

export { runMigration, migrationScript };
