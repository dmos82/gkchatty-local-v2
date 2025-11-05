import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import User from '../models/UserModel';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import { UserKBAccess } from '../models/UserKBAccess';
import logger from '../utils/logger';

dotenv.config();

const log = logger.child({ module: 'migrate-kb-access' });

const migrateKbAccess = async () => {
  log.info('Starting KB access migration script...');

  try {
    await connectDB();
    log.info('Database connected.');

    const users = await User.find({}).select('_id role');
    const allKBs = await TenantKnowledgeBase.find({ isActive: true }).select(
      '_id accessType allowedRoles'
    );

    log.info(`Found ${users.length} users and ${allKBs.length} active knowledge bases.`);

    let usersUpdated = 0;
    let newAccessDocsCreated = 0;
    let kbsGranted = 0;

    for (const user of users) {
      let userAccess = await UserKBAccess.findOne({ userId: user._id });

      if (!userAccess) {
        userAccess = new UserKBAccess({
          userId: user._id,
          enabledKnowledgeBases: [],
        });
        newAccessDocsCreated++;
        log.info({ userId: user._id }, 'No UserKBAccess found, creating new one.');
      }

      const currentEnabledSet = new Set(userAccess.enabledKnowledgeBases.map(id => id.toString()));

      for (const kb of allKBs) {
        const kbIdStr = kb._id.toString();
        let hasAccess = false;

        if (kb.accessType === 'public') {
          hasAccess = true;
        } else if (
          kb.accessType === 'role-based' &&
          user.role &&
          kb.allowedRoles?.includes(user.role)
        ) {
          hasAccess = true;
        }

        if (hasAccess && !currentEnabledSet.has(kbIdStr)) {
          userAccess.enabledKnowledgeBases.push(kb._id);
          currentEnabledSet.add(kbIdStr);
          kbsGranted++;
          log.info(
            { userId: user._id, kbId: kb._id, accessType: kb.accessType },
            'Granting access to KB.'
          );
        }
      }

      if (userAccess.isModified()) {
        await userAccess.save();
        usersUpdated++;
        log.info(
          { userId: user._id, totalEnabled: userAccess.enabledKnowledgeBases.length },
          'UserKBAccess updated.'
        );
      }
    }

    log.info('--- Migration Summary ---');
    log.info(`Users processed: ${users.length}`);
    log.info(`UserKBAccess documents created: ${newAccessDocsCreated}`);
    log.info(`UserKBAccess documents updated: ${usersUpdated}`);
    log.info(`Total KB access grants applied: ${kbsGranted}`);
    log.info('Migration script finished successfully.');
  } catch (error) {
    log.error({ error }, 'An error occurred during the migration.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

migrateKbAccess();
