import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import User from '../models/UserModel';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import { UserKBAccess } from '../models/UserKBAccess';
import logger from '../utils/logger';

dotenv.config();

const log = logger.child({ module: 'setup-test-user-kb-access' });

/**
 * This script ensures a test user (dev@example.com) has access to the
 * "gk chatty docuementation" tenant KB for testing the new RAG search logic.
 */
const setupTestUserKBAccess = async () => {
  log.info('Starting test user KB access setup script...');

  try {
    await connectDB();
    log.info('Database connected.');

    // Find the test user (dev@example.com)
    const testUser = await User.findOne({ email: 'dev@example.com' }).select('_id name email');

    if (!testUser) {
      log.error('Test user (dev@example.com) not found! Please create this user first.');
      return;
    }

    log.info({ userId: testUser._id, email: testUser.email }, 'Found test user');

    // Find the "gk chatty docuementation" tenant KB
    const gkChattyKB = await TenantKnowledgeBase.findOne({
      name: { $regex: 'gk chatty docuementation', $options: 'i' },
    }).select('_id name');

    if (!gkChattyKB) {
      log.error('Could not find "gk chatty docuementation" tenant KB!');
      log.info('Available Tenant KBs:');

      const allKBs = await TenantKnowledgeBase.find().select('_id name');
      allKBs.forEach(kb => {
        log.info({ kbId: kb._id, name: kb.name }, 'Available KB');
      });

      return;
    }

    log.info({ kbId: gkChattyKB._id, name: gkChattyKB.name }, 'Found target tenant KB');

    // Check if user already has a UserKBAccess entry
    let userAccess = await UserKBAccess.findOne({ userId: testUser._id });

    if (!userAccess) {
      log.info('Creating new UserKBAccess for test user');
      userAccess = new UserKBAccess({
        userId: testUser._id,
        enabledKnowledgeBases: [gkChattyKB._id],
        lastUpdated: new Date(),
      });
      await userAccess.save();
      log.info('Created new UserKBAccess with the gk chatty docuementation KB enabled');
    } else {
      // Check if the KB is already enabled
      const enabledKBIds = userAccess.enabledKnowledgeBases.map(id => id.toString());
      const targetKBId = gkChattyKB._id.toString();

      if (enabledKBIds.includes(targetKBId)) {
        log.info('The gk chatty docuementation KB is already enabled for this user');
      } else {
        // Add the KB to the user's enabled list
        userAccess.enabledKnowledgeBases.push(gkChattyKB._id);
        userAccess.lastUpdated = new Date();
        await userAccess.save();
        log.info("Added gk chatty docuementation KB to user's enabled list");
      }

      // Show all enabled KBs for this user
      log.info('All enabled KBs for test user:');
      for (const kbId of userAccess.enabledKnowledgeBases) {
        const kb = await TenantKnowledgeBase.findById(kbId).select('name');
        log.info({ kbId, name: kb?.name || 'Unknown KB' }, 'Enabled KB');
      }
    }

    log.info('Test user KB access setup completed successfully');
  } catch (error) {
    log.error({ error }, 'An error occurred during the setup.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

setupTestUserKBAccess();
