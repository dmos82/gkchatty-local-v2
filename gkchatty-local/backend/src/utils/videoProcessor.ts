import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { processAudioFile } from './audioProcessor';
import { getLogger } from './logger';

const log = getLogger('videoProcessor');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Supported video file types
export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4', // .mp4
  'video/mpeg', // .mpeg
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/x-ms-wmv', // .wmv
  'video/x-flv', // .flv
  'video/webm', // .webm
  'video/x-matroska', // .mkv
  'video/x-m4v', // .m4v
];

export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mpeg',
  '.mpg',
  '.mov',
  '.avi',
  '.wmv',
  '.flv',
  '.webm',
  '.mkv',
  '.m4v',
];

/**
 * Check if a file is a supported video type
 */
export const isSupportedVideoType = (mimeType: string, filename?: string): boolean => {
  // Check MIME type first
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType)) {
    return true;
  }

  // Fallback to file extension if MIME type is not recognized
  if (filename) {
    const extension = path.extname(filename).toLowerCase();
    return SUPPORTED_VIDEO_EXTENSIONS.includes(extension);
  }

  return false;
};

/**
 * Extract audio from video file
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalFileName: string
): Promise<{
  audioBuffer: Buffer;
  audioFileName: string;
  duration?: number;
}> {
  log.debug(`[VideoProcessor] Starting audio extraction from: ${originalFileName}`);

  // Create temp files
  const tempVideoPath = path.join(
    '/tmp',
    `temp_video_${uuidv4()}${path.extname(originalFileName)}`
  );
  const tempAudioPath = path.join('/tmp', `temp_audio_${uuidv4()}.wav`);

  try {
    // Write video buffer to temp file
    await fs.writeFile(tempVideoPath, videoBuffer);
    log.debug(`[VideoProcessor] Created temporary video file: ${tempVideoPath}`);

    // Extract audio using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .output(tempAudioPath)
        .audioCodec('pcm_s16le') // Standard WAV format for best compatibility
        .audioChannels(1) // Mono for better transcription
        .audioFrequency(16000) // 16kHz is optimal for speech recognition
        .on('start', (commandLine: string) => {
          log.debug(`[VideoProcessor] FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress: any) => {
          log.debug(`[VideoProcessor] Processing: ${progress.percent?.toFixed(2) || 0}% done`);
        })
        .on('end', () => {
          log.debug(`[VideoProcessor] Audio extraction completed`);
          resolve();
        })
        .on('error', (err: Error) => {
          log.error(`[VideoProcessor] FFmpeg error:`, err);
          reject(err);
        })
        .run();
    });

    // Read extracted audio
    const audioBuffer = await fs.readFile(tempAudioPath);
    const audioFileName = path.parse(originalFileName).name + '_audio.wav';

    log.debug(`[VideoProcessor] Audio extraction successful. Size: ${audioBuffer.length} bytes`);

    return {
      audioBuffer,
      audioFileName,
    };
  } catch (error) {
    log.error(`[VideoProcessor] Error extracting audio:`, error);
    throw new Error(
      `Audio extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    // Cleanup temp files
    try {
      await fs.unlink(tempVideoPath);
      log.debug(`[VideoProcessor] Cleaned up temporary video file`);
    } catch (cleanupError) {
      log.warn(`[VideoProcessor] Failed to clean up video file:`, cleanupError);
    }

    try {
      await fs.unlink(tempAudioPath);
      log.debug(`[VideoProcessor] Cleaned up temporary audio file`);
    } catch (cleanupError) {
      log.warn(`[VideoProcessor] Failed to clean up audio file:`, cleanupError);
    }
  }
}

/**
 * Process video file: extract audio → transcribe → generate DOCX
 */
export async function processVideoFile(
  videoBuffer: Buffer,
  originalFileName: string,
  metadata: {
    uploadDate: Date;
    fileSize: number;
    userId?: string;
    mimeType: string;
  },
  options: {
    language?: string;
    prompt?: string;
    temperature?: number;
  } = {}
): Promise<{
  docxBuffer: Buffer;
  transcriptionText: string;
  metadata: {
    language?: string;
    duration?: number;
    originalFileName: string;
    generatedFileName: string;
    videoInfo: {
      originalFormat: string;
      extractedAudio: string;
    };
  };
}> {
  log.debug(`[VideoProcessor] Processing video file: ${originalFileName}`);

  // Validate video type
  if (!isSupportedVideoType(metadata.mimeType, originalFileName)) {
    throw new Error(`Unsupported video type: ${metadata.mimeType}`);
  }

  // Validate video file size - increased limit (50% increase from 100MB)
  const MAX_VIDEO_SIZE = 150 * 1024 * 1024; // 150MB (50% increase)
  if (videoBuffer.length > MAX_VIDEO_SIZE) {
    const sizeMB = Math.round((videoBuffer.length / 1024 / 1024) * 10) / 10;
    throw new Error(
      `Video file too large: ${sizeMB}MB. Maximum size is 150MB for video transcription.`
    );
  }

  try {
    // Step 1: Extract audio from video
    const { audioBuffer, audioFileName } = await extractAudioFromVideo(
      videoBuffer,
      originalFileName
    );

    // Step 2: Use existing audio processing pipeline
    const audioResult = await processAudioFile(
      audioBuffer,
      audioFileName,
      {
        ...metadata,
        fileSize: audioBuffer.length, // Use audio size for processing
        mimeType: 'audio/wav', // Override with extracted audio type
      },
      options
    );

    // Step 3: Enhance metadata for video
    const baseName = path.parse(originalFileName).name;
    const generatedFileName = `${baseName}_video_transcript.docx`;

    log.debug(`[VideoProcessor] Video processing completed successfully for: ${originalFileName}`);

    return {
      docxBuffer: audioResult.docxBuffer,
      transcriptionText: audioResult.transcriptionText,
      metadata: {
        language: audioResult.metadata.language,
        duration: audioResult.metadata.duration,
        originalFileName,
        generatedFileName,
        videoInfo: {
          originalFormat: path.extname(originalFileName),
          extractedAudio: audioFileName,
        },
      },
    };
  } catch (error) {
    log.error(`[VideoProcessor] Error processing video file:`, error);
    throw error;
  }
}
