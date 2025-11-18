/**
 * Fix Folder Permissions - Migration Script
 *
 * This script ensures all System folders have explicit permissions.
 * Folders without permissions will default to { type: 'admin' }
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gkchatty';

async function fixFolderPermissions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get SystemFolder model
    const SystemFolder = mongoose.model('SystemFolder', new mongoose.Schema({
      name: String,
      parentId: mongoose.Schema.Types.ObjectId,
      path: String,
      permissions: {
        type: {
          type: String,
          enum: ['all', 'admin', 'specific-users']
        },
        allowedUsers: [mongoose.Schema.Types.ObjectId]
      },
      metadata: {
        createdBy: mongoose.Schema.Types.ObjectId,
        createdAt: Date,
        updatedAt: Date
      }
    }));

    // Find folders without permissions
    const foldersWithoutPermissions = await SystemFolder.find({
      $or: [
        { permissions: { $exists: false } },
        { permissions: null }
      ]
    });

    console.log(`Found ${foldersWithoutPermissions.length} folders without explicit permissions\n`);

    if (foldersWithoutPermissions.length === 0) {
      console.log('✓ All folders have explicit permissions. Nothing to fix.');
      await mongoose.disconnect();
      return;
    }

    // Update each folder
    let updated = 0;
    for (const folder of foldersWithoutPermissions) {
      console.log(`Updating folder: ${folder.name} (${folder._id})`);
      console.log(`  Setting permissions to: { type: 'admin' }`);

      folder.permissions = {
        type: 'admin',
        allowedUsers: []
      };

      await folder.save();
      updated++;
    }

    console.log(`\n✓ Updated ${updated} folders with default 'admin' permissions`);

    // Verify
    const remaining = await SystemFolder.countDocuments({
      $or: [
        { permissions: { $exists: false } },
        { permissions: null }
      ]
    });

    console.log(`\n✓ Verification: ${remaining} folders still without permissions (should be 0)`);

    await mongoose.disconnect();
    console.log('\n✓ Migration complete!');
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixFolderPermissions();
