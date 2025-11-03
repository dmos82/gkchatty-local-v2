import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../utils/mongoHelper';
import { TenantKnowledgeBase } from '../models/TenantKnowledgeBase';
import logger from '../utils/logger';

dotenv.config();

const log = logger.child({ module: 'activate-sales-kb' });

const activateSalesKb = async () => {
  log.info('Starting script to activate "sales" KB...');

  try {
    await connectDB();
    log.info('Database connected.');

    const salesKb = await TenantKnowledgeBase.findOne({ slug: 'sales' });

    if (!salesKb) {
      log.warn('"sales" KB not found. No action taken.');
      return;
    }

    if (salesKb.isActive) {
      log.info('"sales" KB is already active. No changes needed.');
    } else {
      salesKb.isActive = true;
      await salesKb.save();
      log.info('"sales" KB has been successfully activated.');
    }
  } catch (error) {
    log.error({ error }, 'An error occurred while activating the "sales" KB.');
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed.');
  }
};

activateSalesKb();
