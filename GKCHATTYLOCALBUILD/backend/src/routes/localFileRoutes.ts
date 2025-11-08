import express, { Request, Response, NextFunction } from 'express';
import * as asyncHandlerModule from 'express-async-handler';
const asyncHandler = asyncHandlerModule.default || asyncHandlerModule;
import { getFileStream, uploadFile } from '../utils/s3Helper'; // s3Helper will handle local vs S3
import path from 'path';
import mime from 'mime-types'; // For determining content type
import multer from 'multer';
import { protect } from '../middleware/authMiddleware';
import { getLogger } from '../utils/logger';

const router: express.Router = express.Router();
const logger = getLogger('localFileRoutes');

// Configure multer for direct file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// POST route for uploading files to local storage
router.post(
  '/local/upload/:key(*)',
  protect, // Require authentication
  upload.single('file'), // Handle single file upload
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const fileKey = req.params.key;

    if (!fileKey) {
      res.status(400).json({ error: 'File key is required.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    logger.info(
      { fileKey, fileSize: req.file.size, mimeType: req.file.mimetype },
      'Uploading local file (POST)'
    );

    try {
      // Use the s3Helper uploadFile function which handles local storage
      await uploadFile(req.file.buffer, fileKey, req.file.mimetype);

      logger.info({ fileKey }, 'Successfully uploaded local file (POST)');
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        key: fileKey,
      });
    } catch (error) {
      logger.error({ error, fileKey }, 'Error uploading local file (POST)');
      res.status(500).json({
        error: 'Error uploading file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// PUT route for uploading files to local storage (compatibility with S3-style uploads)
router.put(
  '/local/upload/:key(*)',
  protect, // Require authentication
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const fileKey = req.params.key;

    if (!fileKey) {
      res.status(400).json({ error: 'File key is required.' });
      return;
    }

    logger.info(
      {
        fileKey,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
      },
      'Uploading local file (PUT)'
    );

    try {
      // Collect the raw body data
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', async () => {
        const fileBuffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || 'application/octet-stream';

        logger.info({ fileKey, bytesReceived: fileBuffer.length }, 'Received file data (PUT)');

        // Use the s3Helper uploadFile function which handles local storage
        await uploadFile(fileBuffer, fileKey, contentType);

        logger.info({ fileKey }, 'Successfully uploaded local file (PUT)');

        // Return empty response like S3 does
        res.status(200).send('');
      });

      req.on('error', error => {
        logger.error({ error, fileKey }, 'Error reading request body (PUT)');
        res.status(500).json({
          error: 'Error reading file data',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    } catch (error) {
      logger.error({ error, fileKey }, 'Error uploading local file (PUT)');
      res.status(500).json({
        error: 'Error uploading file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Route to serve local files
// The :key(*) allows for file paths that include slashes
router.get(
  '/local/:key(*)',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const fileKey = req.params.key;
    if (!fileKey) {
      res.status(400).send('File key is required.');
      return;
    }

    logger.info({ fileKey }, 'Attempting to serve local file');

    try {
      // s3Helper.getFileStream will correctly fetch from local storage
      // if AWS_BUCKET_NAME is 'local'
      const fileStream = await getFileStream(fileKey);

      // Determine content type based on file extension
      const contentType = mime.lookup(fileKey) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      // Optional: Set Content-Disposition if you want to suggest a filename for download
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(fileKey)}"`);

      logger.info({ fileKey, contentType }, 'Streaming local file');
      fileStream.pipe(res);

      fileStream.on('error', err => {
        logger.error({ error: err, fileKey }, 'Stream error for local file');
        // Check if headers already sent
        if (!res.headersSent) {
          // If an error like ENOENT (file not found) happens in getFileStream,
          // it should throw, and the asyncHandler will catch it.
          // This 'error' event on the stream itself is for issues during streaming.
          res.status(500).send('Error streaming file.');
        } else {
          // If headers are already sent, we can't send a new status code.
          // The connection will likely be abruptly closed by the client.
          // Log the error and end the response if possible.
          res.end();
        }
      });

      fileStream.on('end', () => {
        logger.info({ fileKey }, 'Finished streaming local file');
      });
    } catch (error: any) {
      // Handle errors from getFileStream, e.g., file not found
      logger.error({ error, fileKey }, 'Error serving local file');
      if (
        error.message &&
        (error.message.toLowerCase().includes('file not found') ||
          error.message.toLowerCase().includes('no such file or directory'))
      ) {
        res.status(404).send('File not found.');
        return;
      }
      res.status(500).send('Error retrieving file.');
      return;
    }
  })
);

export default router;
