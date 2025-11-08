import { Request, Response } from 'express';
import Feedback from '../models/Feedback.model';
import mongoose from 'mongoose';
import { createErrorResponse } from '../utils/errorResponse';
import { getLogger } from '../utils/logger';

const log = getLogger('feedbackController');

/**
 * @desc    Submit new feedback
 * @route   POST /api/feedback
 * @access  Private (User)
 */
export const submitFeedback = async (req: Request, res: Response): Promise<void> => {
  const { feedbackText, chatId } = req.body;

  // Access user details directly from req.user (assuming protect middleware succeeded)
  // Middleware should guarantee req.user exists and has these fields if it calls next()
  const userId = req.user?._id;
  const username = req.user?.username;

  // Re-check, although middleware should handle this
  if (!userId || !username) {
    log.error(
      '[Feedback Controller] User details missing from req.user despite passing middleware.'
    );
    res
      .status(401)
      .json(createErrorResponse('User details missing after authentication.', 'UNAUTHORIZED_USER'));
    return;
  }

  if (!feedbackText || typeof feedbackText !== 'string' || feedbackText.trim().length === 0) {
    res
      .status(400)
      .json(createErrorResponse('Feedback text is required.', 'MISSING_FEEDBACK_TEXT'));
    return;
  }

  // Optional: Validate chatId if provided
  if (chatId && !mongoose.Types.ObjectId.isValid(chatId)) {
    res.status(400).json(createErrorResponse('Invalid chatId format.', 'INVALID_CHAT_ID'));
    return;
  }

  try {
    const newFeedback = new Feedback({
      feedbackText: feedbackText.trim(),
      userId,
      username,
      chatId: chatId || undefined, // Add chatId only if it exists
    });

    await newFeedback.save();

    log.debug(`[Feedback] Submitted by user: ${username} (ID: ${userId})`);
    res
      .status(201)
      .json({ success: true, message: 'Feedback submitted successfully.', feedback: newFeedback });
  } catch (error: any) {
    log.error('[Feedback] Error submitting feedback:', error);
    if (error.name === 'ValidationError') {
      res
        .status(400)
        .json(createErrorResponse('Validation Error', 'VALIDATION_ERROR', error.errors));
    } else {
      res
        .status(500)
        .json(
          createErrorResponse(
            'Server error while submitting feedback.',
            'FEEDBACK_SUBMISSION_FAILED'
          )
        );
    }
  }
};
