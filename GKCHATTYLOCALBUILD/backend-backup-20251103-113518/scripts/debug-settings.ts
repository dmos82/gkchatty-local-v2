import 'dotenv/config';
import mongoose from 'mongoose';
import Setting from '../models/SettingModel';

async function debugSettings() {
  try {
    console.log('[Debug Settings] Starting settings debug...');

    if (!process.env.MONGODB_URI) {
      console.error('[Debug Settings] MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    // Connect using the same method as the API server (via mongoHelper)
    const { connectDB } = await import('../utils/mongoHelper');
    await connectDB();

    console.log('[Debug Settings] Connected to database:', mongoose.connection.db?.databaseName);

    // Count all settings
    const count = await Setting.countDocuments();
    console.log('[Debug Settings] Total settings in collection:', count);

    // Find all settings
    const allSettings = await Setting.find({}).select('key value');
    console.log(`[Debug Settings] All ${allSettings.length} settings in collection:`);
    allSettings.forEach((setting, index) => {
      console.log(
        `  ${index + 1}. ${setting.key}: ${setting.value ? '[HAS VALUE]' : '[NO VALUE]'}`
      );
    });

    // Check specifically for OpenAI settings
    const modelIdSetting = await Setting.findOne({ key: 'activeOpenAIModelId' });
    const apiKeySetting = await Setting.findOne({ key: 'encryptedOpenAIApiKey' });

    console.log('[Debug Settings] OpenAI specific settings:');
    console.log('  activeOpenAIModelId:', modelIdSetting ? modelIdSetting.value : 'NOT FOUND');
    console.log('  encryptedOpenAIApiKey:', apiKeySetting ? '[EXISTS]' : 'NOT FOUND');

    await mongoose.disconnect();
    console.log('[Debug Settings] Settings debug complete!');
  } catch (error) {
    console.error('[Debug Settings] Error:', error);
    process.exit(1);
  }
}

debugSettings();
