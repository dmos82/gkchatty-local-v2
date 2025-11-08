import { Request, Response, RequestHandler } from 'express';
import { SettingModel as Setting } from '../utils/modelFactory'; // SQLite-compatible Setting model
import * as asyncHandlerModule from 'express-async-handler';
const asyncHandler = asyncHandlerModule.default || asyncHandlerModule;

const SYSTEM_PROMPT_KEY = 'systemPrompt';

/**
 * @desc    Get the current system prompt
 * @route   GET /api/settings/system-prompt
 * @access  Private (Authenticated users)
 */
const getSystemPrompt: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const setting = await Setting.findOne({ key: SYSTEM_PROMPT_KEY });

  if (!setting) {
    // This shouldn't happen due to startup seeding, but handle defensively
    res.status(404);
    throw new Error('System prompt setting not found.');
  }

  // Match expected frontend response structure
  res.status(200).json({
    success: true,
    prompt: setting.value,
  });
});

/**
 * @desc    Update the system prompt
 * @route   PUT /api/settings/system-prompt
 * @access  Private (Admin only)
 */
const updateSystemPrompt: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    res.status(400);
    throw new Error('Invalid prompt value provided.');
  }

  const updatedSetting = await Setting.findOneAndUpdate(
    { key: SYSTEM_PROMPT_KEY },
    { value: prompt.trim() },
    {
      new: true, // Return the updated document
      upsert: true, // Create if it doesn't exist (defensive, seed should handle)
      runValidators: true, // Ensure schema validation runs on update
    }
  );

  if (!updatedSetting) {
    // Should be impossible with upsert: true, but needed for type safety
    res.status(500);
    throw new Error('Failed to update system prompt setting.');
  }

  // Match expected frontend response structure
  res.status(200).json({
    success: true,
    message: 'System prompt updated successfully.',
    prompt: updatedSetting.value,
  });
});

export { getSystemPrompt, updateSystemPrompt };
