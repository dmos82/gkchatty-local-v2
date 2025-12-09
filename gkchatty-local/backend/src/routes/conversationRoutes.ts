import { Router, Request, Response } from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import {
  getConversations,
  createConversation,
  createGroupConversation,
  getConversation,
  deleteConversation,
  getMessages,
  searchMessages,
  markConversationRead,
  getOnlineUsers,
  addGroupMembers,
  leaveGroup,
  deleteGroupConversation,
} from '../controllers/conversationController';
import { dmAttachmentUpload, dmVoiceUpload } from '../config/multerConfig';
import { uploadFile, getPresignedUrlForView, getFileStream } from '../utils/s3Helper';
import { getLogger } from '../utils/logger';
import { UserDocument } from '../models/UserDocument';
import { processUserDocument } from '../services/userDocumentProcessor';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const log = getLogger('conversationRoutes');

// All routes require authentication
router.use(protect);
router.use(checkSession);

/**
 * @route   GET /api/conversations/users/online
 * @desc    Get list of users (with online status) for starting conversations
 * @access  Private
 */
router.get('/users/online', getOnlineUsers);

/**
 * @route   GET /api/conversations
 * @desc    Get all conversations for the authenticated user
 * @access  Private
 */
router.get('/', getConversations);

/**
 * @route   POST /api/conversations
 * @desc    Create or get existing conversation with another user
 * @access  Private
 * @body    { recipientId: string, recipientUsername?: string }
 */
router.post('/', createConversation);

/**
 * @route   POST /api/conversations/group
 * @desc    Create a new group conversation
 * @access  Private
 * @body    { participantIds: string[], groupName: string }
 */
router.post('/group', createGroupConversation);

/**
 * @route   GET /api/conversations/:id
 * @desc    Get a specific conversation
 * @access  Private
 */
router.get('/:id', getConversation);

/**
 * @route   DELETE /api/conversations/:id
 * @desc    Soft delete a conversation (only for current user)
 * @access  Private
 */
router.delete('/:id', deleteConversation);

/**
 * @route   GET /api/conversations/:id/messages/search
 * @desc    Search messages in a conversation
 * @access  Private
 * @query   { q: string, limit?: number }
 */
router.get('/:id/messages/search', searchMessages);

/**
 * @route   GET /api/conversations/:id/messages
 * @desc    Get messages for a conversation with pagination
 * @access  Private
 * @query   { limit?: number, before?: string, after?: string }
 */
router.get('/:id/messages', getMessages);

/**
 * @route   POST /api/conversations/:id/read
 * @desc    Mark all messages in a conversation as read
 * @access  Private
 */
router.post('/:id/read', markConversationRead);

/**
 * @route   POST /api/conversations/:id/members
 * @desc    Add members to a group conversation
 * @access  Private
 * @body    { memberIds: string[] }
 */
router.post('/:id/members', addGroupMembers);

/**
 * @route   POST /api/conversations/:id/leave
 * @desc    Leave a group conversation (remove self)
 * @access  Private
 */
router.post('/:id/leave', leaveGroup);

/**
 * @route   DELETE /api/conversations/:id/group
 * @desc    Delete a group conversation (only creator can delete)
 * @access  Private
 */
router.delete('/:id/group', deleteGroupConversation);

/**
 * @route   POST /api/conversations/:id/attachments
 * @desc    Upload a file attachment for a DM conversation
 * @access  Private
 * @returns { attachment: { type, url, filename, size, mimeType } }
 */
router.post(
  '/:id/attachments',
  dmAttachmentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const conversationId = req.params.id;
      const userId = req.user?._id?.toString();
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      log.debug(`[DM Attachment] Uploading file for conversation ${conversationId}: ${file.originalname}`);

      // Read the file from disk
      const fileBuffer = await fs.readFile(file.path);

      // Determine if image or file
      const isImage = file.mimetype.startsWith('image/');
      const attachmentType = isImage ? 'image' : 'file';

      // Generate unique S3 key: dm_attachments/{conversationId}/{timestamp}_{filename}
      const timestamp = Date.now();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `dm_attachments/${conversationId}/${timestamp}_${safeFilename}`;

      // Upload to S3/local storage
      await uploadFile(fileBuffer, s3Key, file.mimetype);

      // Get URL for the file
      const fileUrl = await getPresignedUrlForView(s3Key, 3600 * 24 * 7); // 7 days

      // Clean up temp file
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        log.warn(`[DM Attachment] Failed to clean up temp file: ${file.path}`);
      }

      const attachment = {
        type: attachmentType,
        url: fileUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        s3Key: s3Key, // Include s3Key for copy-to-docs functionality
      };

      log.debug(`[DM Attachment] Successfully uploaded: ${s3Key}`);

      return res.status(200).json({ attachment });
    } catch (error) {
      log.error('[DM Attachment] Upload error:', error);
      return res.status(500).json({
        error: 'Failed to upload attachment',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * @route   POST /api/conversations/:id/attachments/view
 * @desc    Get a fresh presigned URL for viewing a DM attachment
 * @access  Private
 * @body    { s3Key: string }
 * @returns { success: boolean, url: string, fileName: string }
 */
router.post('/:id/attachments/view', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { s3Key, filename } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!s3Key) {
      return res.status(400).json({ error: 'Missing required field: s3Key' });
    }

    // Verify the s3Key is a valid DM attachment path
    if (!s3Key.startsWith('dm_attachments/')) {
      return res.status(400).json({ error: 'Invalid attachment path' });
    }

    log.debug(`[DM View] Generating fresh presigned URL for ${s3Key}`);

    // Generate a fresh presigned URL (1 hour validity)
    const presignedUrl = await getPresignedUrlForView(s3Key, 3600);

    return res.status(200).json({
      success: true,
      url: presignedUrl,
      fileName: filename || s3Key.split('/').pop() || 'attachment',
    });
  } catch (error) {
    log.error('[DM View] Error generating presigned URL:', error);
    return res.status(500).json({
      error: 'Failed to generate view URL',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route   POST /api/conversations/:id/attachments/stream
 * @desc    Stream a DM attachment through the backend (bypasses S3 CORS)
 * @access  Private
 * @body    { s3Key: string, filename?: string, mimeType?: string }
 * @returns Streamed file content
 */
router.post('/:id/attachments/stream', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { s3Key, filename, mimeType } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!s3Key) {
      return res.status(400).json({ error: 'Missing required field: s3Key' });
    }

    // Verify the s3Key is a valid DM attachment path
    if (!s3Key.startsWith('dm_attachments/')) {
      return res.status(400).json({ error: 'Invalid attachment path' });
    }

    log.debug(`[DM Stream] Streaming file ${s3Key} for user ${userId}`);

    // Get the file stream from S3
    const fileStream = await getFileStream(s3Key);

    // Determine content type
    const contentType = mimeType || 'application/octet-stream';
    const safeFilename = filename || s3Key.split('/').pop() || 'attachment';

    // Set headers for inline viewing
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Pipe the stream to response
    fileStream.pipe(res);

    fileStream.on('error', (error: Error) => {
      log.error(`[DM Stream] Stream error for ${s3Key}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
  } catch (error) {
    log.error('[DM Stream] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Failed to stream file',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});

/**
 * @route   POST /api/conversations/:id/attachments/copy-to-docs
 * @desc    Copy a DM attachment to user's My Documents
 * @access  Private
 * @body    { s3Key: string, filename: string, size: number, mimeType: string }
 * @returns { success: boolean, documentId: string }
 */
router.post('/:id/attachments/copy-to-docs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { s3Key, filename, size, mimeType } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!s3Key || !filename || !size || !mimeType) {
      return res.status(400).json({ error: 'Missing required fields: s3Key, filename, size, mimeType' });
    }

    log.debug(`[Copy to MyDocs] User ${userId} copying ${filename} from DM`);

    // Get the file stream from the DM attachment location
    const fileStream = await getFileStream(s3Key);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);

    // Generate new S3 key for user documents: user_docs/{userId}/{uuid}.{ext}
    const fileExtension = path.extname(filename).slice(1) || 'bin';
    const newS3Key = `user_docs/${userId}/${uuidv4()}.${fileExtension}`;

    // Upload to user's documents location
    await uploadFile(fileBuffer, newS3Key, mimeType);

    // Get bucket name from environment
    const s3Bucket = process.env.AWS_BUCKET_NAME || 'local';

    // Create UserDocument record with 'processing' status
    // Document needs to be indexed into Pinecone for RAG queries
    const userDocument = new UserDocument({
      userId: userId,
      sourceType: 'user',
      originalFileName: filename,
      s3Bucket: s3Bucket,
      s3Key: newS3Key,
      file_extension: fileExtension,
      fileSize: size,
      mimeType: mimeType,
      uploadTimestamp: new Date(),
      status: 'processing', // Will be updated to 'completed' after indexing
    });

    await userDocument.save();

    log.debug(`[Copy to MyDocs] Successfully copied ${filename} to MyDocs as document ${userDocument._id}`);

    // Trigger document processing (text extraction, chunking, embedding, Pinecone indexing)
    // Run in background - don't await so response returns immediately
    processUserDocument(
      userDocument._id.toString(),
      s3Bucket,
      newS3Key,
      userId.toString()
    ).then(() => {
      log.debug(`[Copy to MyDocs] Document ${userDocument._id} indexed successfully`);
    }).catch((processingError) => {
      log.error(`[Copy to MyDocs] Failed to index document ${userDocument._id}:`, processingError);
    });

    return res.status(200).json({
      success: true,
      documentId: userDocument._id.toString(),
      filename: filename,
    });
  } catch (error) {
    log.error('[Copy to MyDocs] Error:', error);
    return res.status(500).json({
      error: 'Failed to save to My Documents',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route   POST /api/conversations/:id/voice
 * @desc    Upload a voice message for a DM conversation
 * @access  Private
 * @body    { duration: number } (in form data)
 * @returns { attachment: { type, url, filename, size, mimeType, duration } }
 */
router.post(
  '/:id/voice',
  dmVoiceUpload.single('voice'),
  async (req: Request, res: Response) => {
    try {
      const conversationId = req.params.id;
      const userId = req.user?._id?.toString();
      const file = req.file;
      const duration = parseFloat(req.body.duration) || 0;

      if (!file) {
        return res.status(400).json({ error: 'No voice file uploaded' });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate duration (max 2 minutes = 120 seconds)
      if (duration > 120) {
        return res.status(400).json({ error: 'Voice message exceeds 2 minute limit' });
      }

      log.debug(`[Voice Message] Uploading for conversation ${conversationId}: ${file.originalname}, duration: ${duration}s`);

      // Read the file from disk
      const fileBuffer = await fs.readFile(file.path);

      // Generate unique S3 key: dm_voice/{conversationId}/{timestamp}.webm
      const timestamp = Date.now();
      const extension = file.originalname.split('.').pop() || 'webm';
      const s3Key = `dm_voice/${conversationId}/${timestamp}.${extension}`;

      // Upload to S3
      await uploadFile(fileBuffer, s3Key, file.mimetype);

      // Get URL for the file
      const fileUrl = await getPresignedUrlForView(s3Key, 3600 * 24 * 7); // 7 days

      // Clean up temp file
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        log.warn(`[Voice Message] Failed to clean up temp file: ${file.path}`);
      }

      const attachment = {
        type: 'voice' as const,
        url: fileUrl,
        filename: `voice_${timestamp}.${extension}`,
        size: file.size,
        mimeType: file.mimetype,
        s3Key: s3Key,
        duration: duration,
      };

      log.debug(`[Voice Message] Successfully uploaded: ${s3Key}`);

      return res.status(200).json({ attachment });
    } catch (error) {
      log.error('[Voice Message] Upload error:', error);
      return res.status(500).json({
        error: 'Failed to upload voice message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
