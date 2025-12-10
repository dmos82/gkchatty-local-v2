import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import { getOpenAIConfig } from '../services/settingsService';
import { getLogger } from './logger';

const log = getLogger('audioProcessor');

// Supported audio file types
export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg', // .mp3
  'audio/wav', // .wav
  'audio/mp4', // .m4a (standard)
  'audio/x-m4a', // .m4a (Apple/macOS variant)
  'audio/m4a', // .m4a (alternative)
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

    // Type assertion for verbose_json response format which includes language and duration
    const verboseTranscription = transcription as typeof transcription & {
      language?: string;
      duration?: number;
    };

    return {
      text: verboseTranscription.text,
      language: verboseTranscription.language,
      duration: verboseTranscription.duration,
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
 * Generate DOCX from transcribed text
 */
export async function generateDOCXFromTranscription(
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
  log.debug(`[AudioProcessor] Generating DOCX for transcription of: ${originalFileName}`);

  try {
    // Build metadata info lines
    const metadataLines: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({ text: 'Original File: ', bold: true }),
          new TextRun({ text: originalFileName }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Upload Date: ', bold: true }),
          new TextRun({ text: metadata.uploadDate.toLocaleString() }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'File Size: ', bold: true }),
          new TextRun({ text: formatFileSize(metadata.fileSize) }),
        ],
      }),
    ];

    if (transcriptionData.language) {
      metadataLines.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Detected Language: ', bold: true }),
            new TextRun({ text: transcriptionData.language.toUpperCase() }),
          ],
        })
      );
    }

    if (transcriptionData.duration) {
      metadataLines.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Duration: ', bold: true }),
            new TextRun({ text: formatDuration(transcriptionData.duration) }),
          ],
        })
      );
    }

    // Split transcription into paragraphs
    const paragraphs = transcriptionData.text.split(/\n\s*\n/);
    const transcriptionParagraphs: Paragraph[] = paragraphs
      .filter((p) => p.trim())
      .map(
        (paragraph) =>
          new Paragraph({
            children: [new TextRun({ text: paragraph.trim() })],
            spacing: { after: 200 },
          })
      );

    // Create the document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Title
            new Paragraph({
              text: 'Audio Transcription',
              heading: HeadingLevel.TITLE,
              spacing: { after: 400 },
            }),
            // Document Information heading
            new Paragraph({
              text: 'Document Information',
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 200 },
            }),
            // Metadata
            ...metadataLines,
            // Spacer
            new Paragraph({ text: '', spacing: { after: 400 } }),
            // Transcription heading
            new Paragraph({
              text: 'Transcription',
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 200 },
            }),
            // Transcription content
            ...transcriptionParagraphs,
            // Footer
            new Paragraph({ text: '', spacing: { after: 400 } }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Generated by GKCHATTY Audio Transcription Service on ${new Date().toLocaleString()}`,
                  size: 16,
                  italics: true,
                }),
              ],
            }),
          ],
        },
      ],
    });

    // Generate the DOCX buffer
    const docxBuffer = await Packer.toBuffer(doc);
    log.debug(`[AudioProcessor] DOCX generated successfully. Size: ${docxBuffer.length} bytes`);

    return Buffer.from(docxBuffer);
  } catch (error) {
    log.error(`[AudioProcessor] Error generating DOCX:`, error);
    throw new Error(
      `DOCX generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process audio file: transcribe and generate DOCX
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
  docxBuffer: Buffer;
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

    // Step 2: Generate DOCX from transcription
    const docxBuffer = await generateDOCXFromTranscription(
      transcriptionData,
      originalFileName,
      metadata
    );

    // Generate DOCX filename
    const baseName = path.parse(originalFileName).name;
    const generatedFileName = `${baseName}_transcription.docx`;

    log.debug(`[AudioProcessor] Audio processing completed successfully for: ${originalFileName}`);

    return {
      docxBuffer,
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
