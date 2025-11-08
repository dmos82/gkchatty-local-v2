import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import User from '../models/UserModel'; // Import User model
import logger from '../utils/logger';

dotenv.config();

const log = logger.child({ module: 'ensure-sales-kb' });

const ensureSalesKb = async () => {
  log.info('Starting script to ensure "sales" KB exists and is active...');

  try {
    await connectDB();
    log.info('Database connected.');

    // Find admin user to associate with the KB
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      throw new Error('No admin user found to create the KB.');
    }

    let salesKb = await TenantKnowledgeBase.findOne({ slug: 'sales' });

    if (salesKb) {
      log.info('"sales" KB already exists.');
      if (!salesKb.isActive) {
        salesKb.isActive = true;
        await salesKb.save();
        log.info('"sales" KB has been activated.');
      }
    } else {
      log.info('"sales" KB not found. Creating it now...');
      salesKb = new TenantKnowledgeBase({
        name: 'Sales KB',
        slug: 'sales',
        description: 'Knowledge base for the sales team.',
        s3Prefix: 'tenant_kb/sales/',
        accessType: 'role-based',
        allowedRoles: ['admin', 'user'],
        isActive: true,
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id,
      });
      await salesKb.save();
      log.info('"sales" KB created and activated successfully.');
    }
  } catch (error) {
    log.error({ error }, 'An error occurred while ensuring the "sales" KB.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

ensureSalesKb();
