import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { getOpenAIConfig } from '../services/settingsService';
import { getLogger } from './logger';

const log = getLogger('audioProcessor');

// Supported audio file types
export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg', // .mp3
  'audio/wav', // .wav
  'audio/mp4', // .m4a
  'audio/aac', // .aac
  'audio/ogg', // .ogg
  'audio/flac', // .flac
  'audio/webm', // .webm
];

export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.webm',
];

/**
 * Check if a file is a supported audio type
 */
export const isSupportedAudioType = (mimeType: string, filename?: string): boolean => {
  // Check MIME type first
  if (SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
    return true;
  }

  // Fallback to file extension if MIME type is not recognized
  if (filename) {
    const extension = path.extname(filename).toLowerCase();
    return SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
  }

  return false;
};

/**
 * Get OpenAI client for audio transcription
 */
async function getOpenAIClient(): Promise<OpenAI> {
  const config = await getOpenAIConfig();
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not found in database or environment variables');
  }

  return new OpenAI({ apiKey });
}

/**
 * Transcribe audio file using OpenAI Whisper API
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  originalFileName: string,
  options: {
    language?: string;
    prompt?: string;
    temperature?: number;
  } = {}
): Promise<{
  text: string;
  language?: string;
  duration?: number;
}> {
  log.debug(`[AudioProcessor] Starting transcription for: ${originalFileName}`);

  // Create temporary file for OpenAI API (Whisper requires file input)
  const tempFileName = `temp_audio_${uuidv4()}${path.extname(originalFileName)}`;
  const tempFilePath = path.join('/tmp', tempFileName);

  try {
    // Write buffer to temporary file
    await writeFile(tempFilePath, audioBuffer);
    log.debug(`[AudioProcessor] Created temporary file: ${tempFilePath}`);

    // Get OpenAI client
    const openai = await getOpenAIClient();

    // Transcribe using Whisper API
    log.debug(`[AudioProcessor] Sending to OpenAI Whisper API...`);
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-1',
      language: options.language, // Optional: specify language (e.g., 'en', 'es', 'fr')
      prompt: options.prompt, // Optional: context to improve accuracy
      temperature: options.temperature || 0, // Lower temperature for more consistent results
      response_format: 'verbose_json', // Get detailed response with metadata
    });

    log.debug(
      `[AudioProcessor] Transcription completed. Text length: ${transcription.text.length}`
    );

    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
    };
  } catch (error) {
    log.error(`[AudioProcessor] Error transcribing audio:`, error);
    throw new Error(
      `Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    // Clean up temporary file
    try {
      await unlink(tempFilePath);
      log.debug(`[AudioProcessor] Cleaned up temporary file: ${tempFilePath}`);
    } catch (cleanupError) {
      log.warn(`[AudioProcessor] Failed to clean up temporary file: ${cleanupError}`);
    }
  }
}

/**
 * Generate PDF from transcribed text
 */
export async function generatePDFFromTranscription(
  transcriptionData: {
    text: string;
    language?: string;
    duration?: number;
  },
  originalFileName: string,
  metadata: {
    uploadDate: Date;
    fileSize: number;
    userId?: string;
  }
): Promise<Buffer> {
  log.debug(`[AudioProcessor] Generating PDF for transcription of: ${originalFileName}`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
      });

      const chunks: Buffer[] = [];

      // Collect PDF data
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        log.debug(`[AudioProcessor] PDF generated successfully. Size: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Add title
      doc.fontSize(20).font('Helvetica-Bold').text('Audio Transcription', { align: 'center' });

      doc.moveDown(1);

      // Add metadata section
      doc.fontSize(12).font('Helvetica-Bold').text('Document Information', { underline: true });

      doc.moveDown(0.5);

      doc
        .font('Helvetica')
        .text(`Original File: ${originalFileName}`)
        .text(`Upload Date: ${metadata.uploadDate.toLocaleString()}`)
        .text(`File Size: ${formatFileSize(metadata.fileSize)}`);

      if (transcriptionData.language) {
        doc.text(`Detected Language: ${transcriptionData.language.toUpperCase()}`);
      }

      if (transcriptionData.duration) {
        doc.text(`Duration: ${formatDuration(transcriptionData.duration)}`);
      }

      doc.moveDown(1);

      // Add transcription section
      doc.fontSize(12).font('Helvetica-Bold').text('Transcription', { underline: true });

      doc.moveDown(0.5);

      // Add transcribed text with proper formatting
      doc.font('Helvetica').fontSize(11);

      // Split text into paragraphs and add them
      const paragraphs = transcriptionData.text.split(/\n\s*\n/);

      paragraphs.forEach((paragraph, index) => {
        if (paragraph.trim()) {
          doc.text(paragraph.trim(), {
            align: 'justify',
            lineGap: 2,
          });

          if (index < paragraphs.length - 1) {
            doc.moveDown(0.5);
          }
        }
      });

      // Add footer
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(
          `Generated by GKCHATTY Audio Transcription Service on ${new Date().toLocaleString()}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );

      // Finalize the PDF
      doc.end();
    } catch (error) {
      log.error(`[AudioProcessor] Error generating PDF:`, error);
      reject(
        new Error(
          `PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  });
}

/**
 * Process audio file: transcribe and generate PDF
 */
export async function processAudioFile(
  audioBuffer: Buffer,
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
  pdfBuffer: Buffer;
  transcriptionText: string;
  metadata: {
    language?: string;
    duration?: number;
    originalFileName: string;
    generatedFileName: string;
  };
}> {
  log.debug(`[AudioProcessor] Processing audio file: ${originalFileName}`);

  // Validate audio type
  if (!isSupportedAudioType(metadata.mimeType, originalFileName)) {
    throw new Error(`Unsupported audio type: ${metadata.mimeType}`);
  }

  // Validate file size - Increased limit (50% increase from 25MB)
  const MAX_AUDIO_SIZE = 37.5 * 1024 * 1024; // 37.5MB (50% increase)
  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    const sizeMB = Math.round((audioBuffer.length / 1024 / 1024) * 10) / 10;
    throw new Error(
      `Audio file too large: ${sizeMB}MB. Maximum size is 37.5MB for audio transcription.`
    );
  }

  try {
    // Step 1: Transcribe audio
    const transcriptionData = await transcribeAudio(audioBuffer, originalFileName, options);

    // Step 2: Generate PDF from transcription
    const pdfBuffer = await generatePDFFromTranscription(
      transcriptionData,
      originalFileName,
      metadata
    );

    // Generate PDF filename
    const baseName = path.parse(originalFileName).name;
    const generatedFileName = `${baseName}_transcription.pdf`;

    log.debug(`[AudioProcessor] Audio processing completed successfully for: ${originalFileName}`);

    return {
      pdfBuffer,
      transcriptionText: transcriptionData.text,
      metadata: {
        language: transcriptionData.language,
        duration: transcriptionData.duration,
        originalFileName,
        generatedFileName,
      },
    };
  } catch (error) {
    log.error(`[AudioProcessor] Error processing audio file:`, error);
    throw error;
  }
}

/**
 * Helper function to format file size
 */
function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Helper function to format duration in seconds
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

export class AudioProcessor {
  processAudioFile = processAudioFile;
}
