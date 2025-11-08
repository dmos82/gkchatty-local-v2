import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import UserSubmission from '../models/UserSubmission';
import { protect, isAdmin } from '../middleware/authMiddleware';
import { getLogger } from '../utils/logger';

const router: Router = express.Router();
const logger = getLogger('submissions');

// --- Disk Storage Configuration ---
const UPLOAD_DIR_BASE = process.env.RENDER_DISK_MOUNT_PATH || '/mnt/data'; // Use Render env var or default
// const SUBMISSIONS_DIR = path.join(UPLOAD_DIR_BASE, 'submissions'); // OLD: Tried to use subdirectory
const SUBMISSIONS_DIR = UPLOAD_DIR_BASE; // UPDATED: Use the base mount path directly

// Ensure the target directory exists *before* configuring Multer storage - REMOVED BLOCK
// Use recursive: true to create parent directories if needed
// try {
//     if (!fs.existsSync(SUBMISSIONS_DIR)) {
//         fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
//         console.log(`INFO: Created submissions directory at ${SUBMISSIONS_DIR}`);
//     }
// } catch (err) {
//     console.error(`FATAL: Could not create submissions directory at ${SUBMISSIONS_DIR}`, err);
//     // Optionally, prevent server startup if directory is essential and cannot be created
//     // process.exit(1);
// }

logger.info({ storageDir: SUBMISSIONS_DIR }, 'Using submission storage directory');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // // --- START: Re-added Check with Writability ---  - REMOVED BLOCK
    // // Ensure the /mnt/data directory exists and IS WRITABLE right before use
    // try {
    //     // Check existence (should always exist as it's the mount point)
    //     if (!fs.existsSync(SUBMISSIONS_DIR)) {
    //          // This should ideally not happen, log if it does
    //          console.error(`FATAL: Destination directory ${SUBMISSIONS_DIR} does not exist!`);
    //          // Attempt to create defensively? Or just error out? Let's error out for now.
    //          throw new Error(`Submission destination directory ${SUBMISSIONS_DIR} not found.`);
    //     }
    //     // Check writability (crucial step)
    //     console.log(`[Multer Destination] Checking write access for: ${SUBMISSIONS_DIR}`); // Add log
    //     fs.accessSync(SUBMISSIONS_DIR, fs.constants.W_OK); // Throws error if not writable
    //     console.log(`[Multer Destination] Write access confirmed for: ${SUBMISSIONS_DIR}`); // Add log
    //     cb(null, SUBMISSIONS_DIR); // Pass the confirmed writable path
    // } catch (error) {
    //     console.error(`Error ensuring destination directory ${SUBMISSIONS_DIR} exists and is writable:`, error);
    //     const ensureDirError = error instanceof Error ? error : new Error(String(error));
    //     // Add more context to the error passed back
    //     ensureDirError.message = `Failed to access storage destination ${SUBMISSIONS_DIR}: ${ensureDirError.message}`;
    //     cb(ensureDirError, ''); // Pass error back to Multer
    // }
    // // --- END: Re-added Check with Writability ---

    // --- SIMPLIFIED (v2) ---
    // Trust that SUBMISSIONS_DIR (/mnt/data) exists and is writable
    // No fs checks here for this test.
    cb(null, SUBMISSIONS_DIR);
  },
  filename: function (req, file, cb) {
    // Keep existing filename logic
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Use path.extname to safely get the extension
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Define file filter if needed (example: allow only PDFs)
// const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
//   if (file.mimetype === 'application/pdf') {
//     cb(null, true);
//   } else {
//     cb(null, false); // Reject file
//     // Optionally pass an error: cb(new Error('Only PDF files are allowed!'));
//   }
// };

const upload = multer({
  storage: storage,
  // fileFilter: fileFilter, // Uncomment to enable file filter
  limits: { fileSize: 10 * 1024 * 1024 }, // Example: 10MB limit
});

// --- API Routes ---

/**
 * @route POST /api/submissions
 * @description Uploads a single document for admin review.
 * Requires authentication. Stores file on persistent disk and saves metadata.
 * @access Private (User)
 */
// Refactored POST handler with Multer error callback
router.post('/', protect, (req, res, _next) => {
  // Use upload.single with its own error handling callback
  upload.single('file')(req, res, async (err: any) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading (e.g., file size limit).
      logger.error({ error: err }, 'Multer error during file upload');
      return res.status(400).json({ message: `File upload error: ${err.message}` });
    } else if (err) {
      // An unknown error occurred when uploading (e.g., disk storage destination error from cb).
      logger.error({ error: err }, 'Unknown error during file upload step');
      return res.status(500).json({ message: 'Server error during file upload processing.' });
    }

    // Check if a file was actually uploaded after middleware execution
    if (!req.file) {
      logger.warn('No file found in request after Multer processing');
      return res.status(400).json({ message: 'No file uploaded or file type rejected.' });
    }
    const currentFile = req.file;

    // --- START: Added Defensive Check for req.user ---
    if (!(req as any).user?._id) {
      logger.error('FATAL: req.user not found or missing _id after protect middleware');
      if (currentFile?.path) {
        fs.unlink(currentFile.path, unlinkErr => {
          if (unlinkErr)
            logger.error(
              { error: unlinkErr, filePath: currentFile.path },
              'Error deleting orphaned upload due to missing user context'
            );
          else
            logger.info(
              { filePath: currentFile.path },
              'Deleted orphaned upload due to missing user context'
            );
        });
      }
      return res.status(500).json({ message: 'Internal server error: User context lost.' });
    }
    // --- END: Added Defensive Check ---

    // If the check passes, we can safely access req.user._id
    const userId = (req as any).user._id;

    // --- START: Add Check for Username ---
    // Ensure req.user and username are available (add extra check if needed)
    if (!(req as any).user?.username) {
      logger.error('FATAL: req.user.username not found after protect middleware');
      // Clean up uploaded file if user context is lost
      if (currentFile?.path) {
        fs.unlink(currentFile.path, unlinkErr => {
          if (unlinkErr)
            logger.error(
              { error: unlinkErr, filePath: currentFile.path },
              'Error deleting orphaned upload due to missing username'
            );
          else
            logger.info(
              { filePath: currentFile.path },
              'Deleted orphaned upload due to missing username'
            );
        });
      }
      // Return 500 because this signifies an internal state inconsistency
      return res.status(500).json({ message: 'Internal server error: User context incomplete.' });
    }
    // --- END: Add Check for Username ---

    // File seems uploaded successfully by Multer, proceed with saving metadata
    const { originalname, mimetype, filename, size, path: filePath } = currentFile;

    // Proceed with saving metadata to the database
    try {
      // --- START: Corrected Field Names & Added Username ---
      const submissionData = {
        submittedByUserId: userId,
        submitterUsername: (req as any).user.username, // ADDED from req.user
        originalFilename: originalname,
        storageIdentifier: filename, // CORRECTED from storageFilename
        filePath: filePath,
        mimeType: mimetype, // CORRECTED from fileType
        fileSizeBytes: size, // CORRECTED from fileSize
        status: 'pending', // Default status
      };
      logger.debug({ submissionData }, 'Data being passed to new UserSubmission');

      const submission = new UserSubmission(submissionData);

      logger.debug({ document: submission.toObject() }, 'Mongoose document before save');
      // --- END: Corrected Field Names & Added Username ---

      const savedSubmission = await submission.save();

      logger.info({ userId, filename }, 'Submission saved successfully');

      const responseData = {
        id: savedSubmission._id,
        originalFilename: savedSubmission.originalFilename,
        status: (savedSubmission as any).status || 'unknown',
        submittedAt: (savedSubmission as any).createdAt || new Date(),
      };

      res.status(201).json({
        message: 'Submission successful',
        submission: responseData,
      });
    } catch (dbError) {
      // Log the full database error object for details
      logger.error({ error: dbError }, 'ERROR during submission.save()');

      // Critical: Attempt to delete the orphaned uploaded file if DB save fails
      if (currentFile?.path) {
        fs.unlink(currentFile.path, unlinkErr => {
          if (unlinkErr)
            logger.error(
              { error: unlinkErr, filePath: currentFile.path },
              'Error deleting orphaned upload after DB error'
            );
          else
            logger.info(
              { filePath: currentFile.path },
              'Deleted orphaned upload file after DB error'
            );
        });
      }
      // Send the specific error response
      res.status(500).json({ message: 'Error saving submission details to database.' });
    }
  }); // End of multer middleware callback
}); // End of router.post

// GET /api/admin/submissions - Admin lists all submissions
router.get('/admin/submissions', protect, isAdmin, async (req: Request, res: Response) => {
  try {
    const submissions = await UserSubmission.find()
      .sort({ submittedAt: -1 }) // Newest first
      .select(
        '_id submitterUsername originalFilename mimeType fileSizeBytes submittedAt submittedByUserId'
      )
      .lean(); // Use lean for performance if not modifying docs

    logger.info({ count: submissions.length }, 'Admin list submissions - found submissions');
    res.status(200).json({ submissions });
  } catch (error) {
    logger.error({ error }, 'Error fetching submissions for admin');
    res.status(500).json({ message: 'Failed to fetch submissions.' });
  }
});

/**
 * @route GET /api/submissions/file/:submissionId
 * @description Serves a specific submitted file for download/viewing.
 * @access Private (Admin only)
 */
router.get('/file/:submissionId', protect, isAdmin, async (req: Request, res: Response) => {
  const { submissionId } = req.params;
  logger.info({ submissionId }, 'Download submission request received');

  try {
    const submission = await UserSubmission.findById(submissionId);

    if (!submission) {
      logger.warn({ submissionId }, 'Submission not found');
      return res.status(404).json({ message: 'Submission not found.' });
    }

    // Use the storageIdentifier field from the DB record
    if (!submission.storageIdentifier) {
      logger.error({ submissionId }, 'Missing storageIdentifier for submission');
      return res.status(500).json({ message: 'File record incomplete, cannot locate file.' });
    }

    // Construct the full path using the base directory and the stored filename
    const filePath = path.join(SUBMISSIONS_DIR, submission.storageIdentifier);
    logger.info({ filePath, submissionId }, 'Attempting to access file');

    // Verify file existence and readability before streaming
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      logger.debug({ filePath }, 'File exists and is readable');
    } catch (accessError) {
      logger.error({ error: accessError, filePath }, 'File access error');
      // Distinguish between file not found and other permission errors if needed
      return res.status(404).json({ message: 'File not found or inaccessible on server.' });
    }

    // Set headers for download/viewing
    res.setHeader('Content-Type', submission.mimeType || 'application/octet-stream');
    // Ensure filename is safe for header. Using JSON.stringify adds quotes and escapes internal quotes.
    const safeFilename = JSON.stringify(submission.originalFilename || 'download');
    res.setHeader('Content-Disposition', `inline; filename=${safeFilename}`); // Use inline for viewing, browser may still download
    // Use `attachment; filename=...` to force download explicitly

    // Stream the file
    const stream = fs.createReadStream(filePath);

    // Handle stream errors (e.g., file deleted after check but before stream starts)
    stream.on('error', streamError => {
      logger.error({ error: streamError, filePath }, 'Stream error reading file');
      // Important: Check if headers were already sent
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error reading file.' });
      }
      // If headers are sent, we can only try to end the response abruptly
      res.end();
    });

    logger.info({ filePath, submissionId }, 'Streaming file for submission');
    stream.pipe(res);
  } catch (error) {
    logger.error({ error, submissionId }, 'Unexpected error processing file request');
    // Avoid sending error response if headers already sent by stream error handler
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error while processing file request.' });
    }
  }
});

/**
 * @route DELETE /api/submissions/:submissionId
 * @description Deletes a specific user submission (file and DB record).
 * @access Private (Admin only)
 */
router.delete('/:submissionId', protect, isAdmin, async (req: Request, res: Response) => {
  const { submissionId } = req.params;
  logger.info({ submissionId }, 'Delete submission request received');

  try {
    // 1. Find the submission record
    const submission = await UserSubmission.findById(submissionId);

    if (!submission) {
      logger.warn({ submissionId }, 'Submission not found - cannot delete');
      // Return 404 if the record doesn't exist
      return res.status(404).json({ success: false, message: 'Submission record not found.' });
    }

    // 2. Attempt to delete the file from disk
    if (submission.storageIdentifier) {
      const filePath = path.join(SUBMISSIONS_DIR, submission.storageIdentifier);
      logger.info({ filePath }, 'Attempting to delete file');
      try {
        await fs.promises.unlink(filePath);
        logger.info({ filePath }, 'Successfully deleted file');
      } catch (fileError: any) {
        // Log an error if file deletion fails, but continue to delete DB record
        if (fileError.code === 'ENOENT') {
          logger.warn({ filePath }, 'File not found on disk (already deleted?)');
        } else {
          logger.error({ error: fileError, filePath }, 'Error deleting file');
        }
        // Do not return here, proceed to delete DB record
      }
    } else {
      logger.warn(
        { submissionId },
        'No storageIdentifier found - cannot delete file, proceeding with DB deletion'
      );
    }

    // 3. Delete the database record
    const deleteResult = await UserSubmission.findByIdAndDelete(submissionId);

    if (!deleteResult) {
      // This case might occur if the document was deleted between the findById and findByIdAndDelete calls, though unlikely.
      logger.info(
        { submissionId },
        'Submission record not found during deletion (might have been deleted already)'
      );
      // Still return success as the objective (record is gone) is achieved.
      return res.status(200).json({
        success: true,
        message: 'Submission already deleted or not found during final delete step.',
      });
    }

    logger.info({ submissionId }, 'Successfully deleted DB record for submission');
    // Return success
    res.status(200).json({ success: true, message: 'Submission deleted successfully.' });
  } catch (error) {
    logger.error({ error, submissionId }, 'Unexpected error deleting submission');
    res
      .status(500)
      .json({ success: false, message: 'Internal server error while deleting submission.' });
  }
});

export default router;
