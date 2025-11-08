import mongoose from 'mongoose';
import { PersonaModel } from '../models/PersonaModel';
import { getLogger } from '../utils/logger';

const log = getLogger('create-default-persona');

async function createDefaultPersona() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined');
    }

    await mongoose.connect(mongoUri);
    log.info('Connected to MongoDB');

    // Check if a system default persona already exists
    const existingDefault = await PersonaModel.findOne({
      isDefault: true,
    });

    if (existingDefault) {
      log.info('Default persona already exists:', existingDefault.name);
      return;
    }

    // Create a dummy system user ID for the default persona
    // This is a workaround since userId is required in the schema
    const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

    // Create the default persona
    const defaultPersona = new PersonaModel({
      name: 'System Default Assistant',
      prompt:
        'You are a helpful AI assistant for GOAT Insurance. You provide accurate, professional, and friendly assistance with insurance-related questions and procedures.',
      systemPrompt:
        'You are a knowledgeable insurance assistant. Always be professional, accurate, and helpful. Focus on providing clear and concise answers based on the provided context.',
      userId: systemUserId, // Using a dummy system user ID
      isActive: false,
      isDefault: true,
    });

    await defaultPersona.save();
    log.info('Successfully created default system persona');
  } catch (error) {
    log.error('Error creating default persona:', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      log.error('Error stack:', error.stack);
    }
    throw error;
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }
}

// Run the script
createDefaultPersona()
  .then(() => {
    log.info('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    log.error('Script failed:', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
