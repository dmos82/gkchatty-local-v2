import mongoose from 'mongoose';
import Setting from '../models/SettingModel';
import { getLogger } from '../utils/logger';

const log = getLogger('seedSystemSettings');

// Default System KB prompt
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant for Gold Key Insurance. Your ONLY task is to answer the user's question based STRICTLY and SOLELY on the provided context snippets below. Do NOT use any external knowledge or make assumptions. If the answer is explicitly found in the context, provide it concisely. If the answer is NOT explicitly found within the provided snippets, you MUST respond with the exact phrase: 'The provided documents do not contain specific information to answer that question.' Do not add any pleasantries or extra information to this specific phrase.`;

// Default User Docs prompt
const DEFAULT_USER_DOCS_PROMPT = `You are an AI assistant specializing in MY uploaded documents. 
Your task is to answer questions based ONLY on the content in these personal documents. 
If the information is not present in my uploaded documents, state this clearly.
Do not use any external knowledge. Focus solely on my personal document collection.`;

async function seedSystemSettings() {
  try {
    log.info('Starting system settings seed script');

    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gold-key-chat';
    await mongoose.connect(MONGODB_URI);
    log.info('Connected to MongoDB');

    // Seed system prompt if it doesn't exist
    const systemPrompt = await Setting.findOne({ key: 'systemPrompt' });
    if (!systemPrompt) {
      log.info('System prompt not found, creating default');
      await Setting.create({
        key: 'systemPrompt',
        value: DEFAULT_SYSTEM_PROMPT,
      });
      log.info('Default system prompt created');
    } else {
      log.info('System prompt already exists, skipping');
    }

    // Seed user docs prompt if it doesn't exist
    const userDocsPrompt = await Setting.findOne({ key: 'userDocsPrompt' });
    if (!userDocsPrompt) {
      log.info('User docs prompt not found, creating default');
      await Setting.create({
        key: 'userDocsPrompt',
        value: DEFAULT_USER_DOCS_PROMPT,
      });
      log.info('Default user docs prompt created');
    } else {
      log.info('User docs prompt already exists, skipping');
    }

    log.info('System settings seed completed successfully');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');

    process.exit(0);
  } catch (error) {
    log.error('Error in system settings seed script:', error);
    process.exit(1);
  }
}

// Run the seed function if this script is executed directly
if (require.main === module) {
  seedSystemSettings();
}

export { seedSystemSettings };
