import {
  isSupportedAudioType,
  transcribeAudio,
  generatePDFFromTranscription,
  processAudioFile,
  SUPPORTED_AUDIO_TYPES,
  SUPPORTED_AUDIO_EXTENSIONS,
} from '../audioProcessor';
import * as settingsService from '../../services/settingsService';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';

// Mock dependencies
jest.mock('../logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  })),
}));

jest.mock('fs/promises');
jest.mock('fs');
jest.mock('../../services/settingsService');

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  }));
});

// Mock PDFKit
const mockPDFDoc = {
  on: jest.fn(),
  fontSize: jest.fn(),
  font: jest.fn(),
  text: jest.fn(),
  moveDown: jest.fn(),
  end: jest.fn(),
  page: { height: 842 }, // A4 page height
};

// Chain all methods to return the mock doc
mockPDFDoc.fontSize.mockReturnValue(mockPDFDoc);
mockPDFDoc.font.mockReturnValue(mockPDFDoc);
mockPDFDoc.text.mockReturnValue(mockPDFDoc);
mockPDFDoc.moveDown.mockReturnValue(mockPDFDoc);

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => mockPDFDoc);
});

describe('audioProcessor', () => {
  describe('isSupportedAudioType', () => {
    describe('MIME type validation', () => {
      it('should accept all supported audio MIME types', () => {
        const supportedTypes = [
          'audio/mpeg', // .mp3
          'audio/wav', // .wav
          'audio/mp4', // .m4a
          'audio/aac', // .aac
          'audio/ogg', // .ogg
          'audio/flac', // .flac
          'audio/webm', // .webm
        ];

        supportedTypes.forEach(mimeType => {
          expect(isSupportedAudioType(mimeType)).toBe(true);
        });
      });

      it('should reject unsupported MIME types', () => {
        const unsupportedTypes = [
          'video/mp4',
          'application/pdf',
          'image/jpeg',
          'text/plain',
          'audio/midi',
          'audio/x-ms-wma',
        ];

        unsupportedTypes.forEach(mimeType => {
          expect(isSupportedAudioType(mimeType)).toBe(false);
        });
      });
    });

    describe('filename extension fallback', () => {
      it('should accept files with supported extensions when MIME type is unknown', () => {
        const unknownMimeType = 'application/octet-stream';

        const supportedFiles = [
          'audio.mp3',
          'recording.wav',
          'song.m4a',
          'podcast.aac',
          'voice.ogg',
          'music.flac',
          'recording.webm',
        ];

        supportedFiles.forEach(filename => {
          expect(isSupportedAudioType(unknownMimeType, filename)).toBe(true);
        });
      });

      it('should reject files with unsupported extensions', () => {
        const unknownMimeType = 'application/octet-stream';

        const unsupportedFiles = [
          'video.mp4',
          'document.pdf',
          'image.jpg',
          'text.txt',
          'music.wma',
        ];

        unsupportedFiles.forEach(filename => {
          expect(isSupportedAudioType(unknownMimeType, filename)).toBe(false);
        });
      });

      it('should be case-insensitive for file extensions', () => {
        const unknownMimeType = 'application/octet-stream';

        expect(isSupportedAudioType(unknownMimeType, 'audio.MP3')).toBe(true);
        expect(isSupportedAudioType(unknownMimeType, 'audio.WAV')).toBe(true);
        expect(isSupportedAudioType(unknownMimeType, 'audio.M4A')).toBe(true);
      });

      it('should handle files without extensions', () => {
        const unknownMimeType = 'application/octet-stream';

        expect(isSupportedAudioType(unknownMimeType, 'audiofile')).toBe(false);
      });

      it('should accept valid MIME type regardless of extension', () => {
        // Valid MIME type should pass even with wrong extension
        expect(isSupportedAudioType('audio/mpeg', 'file.txt')).toBe(true);
      });

      it('should use extension as fallback when MIME type is invalid', () => {
        // Invalid MIME type but valid extension - should pass
        expect(isSupportedAudioType('application/octet-stream', 'audio.mp3')).toBe(true);

        // Invalid MIME type but audio-like type - should use extension fallback
        expect(isSupportedAudioType('video/mp4', 'audio.mp3')).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty filename', () => {
        expect(isSupportedAudioType('application/octet-stream', '')).toBe(false);
      });

      it('should handle undefined filename', () => {
        expect(isSupportedAudioType('application/octet-stream')).toBe(false);
        expect(isSupportedAudioType('audio/mpeg')).toBe(true);
      });

      it('should handle filenames with multiple dots', () => {
        expect(isSupportedAudioType('application/octet-stream', 'my.audio.file.mp3')).toBe(true);
      });

      it('should handle hidden files (starting with dot)', () => {
        // Hidden files with just extension (no name) return empty extension from path.extname()
        expect(isSupportedAudioType('application/octet-stream', '.mp3')).toBe(false);

        // Hidden files with proper name and extension should work
        expect(isSupportedAudioType('application/octet-stream', '.hidden.mp3')).toBe(true);
      });
    });
  });

  describe('transcribeAudio', () => {
    const mockAudioBuffer = Buffer.from('fake audio data');
    const mockFilename = 'test-audio.mp3';

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock settingsService
      (settingsService.getOpenAIConfig as jest.Mock).mockResolvedValue({
        apiKey: 'test-api-key',
      });

      // Mock fs operations
      (writeFile as jest.Mock).mockResolvedValue(undefined);
      (unlink as jest.Mock).mockResolvedValue(undefined);
      (createReadStream as jest.Mock).mockReturnValue({} as any);

      // Mock OpenAI response
      mockCreate.mockResolvedValue({
        text: 'This is a test transcription.',
        language: 'en',
        duration: 120.5,
      });
    });

    it('should transcribe audio and return text, language, and duration', async () => {
      const result = await transcribeAudio(mockAudioBuffer, mockFilename);

      expect(result).toEqual({
        text: 'This is a test transcription.',
        language: 'en',
        duration: 120.5,
      });
    });

    it('should create temporary file with audio buffer', async () => {
      await transcribeAudio(mockAudioBuffer, mockFilename);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/temp_audio_'),
        mockAudioBuffer
      );
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('.mp3'), mockAudioBuffer);
    });

    it('should call OpenAI API with correct parameters', async () => {
      await transcribeAudio(mockAudioBuffer, mockFilename, {
        language: 'es',
        prompt: 'Technical discussion',
        temperature: 0.2,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        file: expect.anything(),
        model: 'whisper-1',
        language: 'es',
        prompt: 'Technical discussion',
        temperature: 0.2,
        response_format: 'verbose_json',
      });
    });

    it('should use default temperature of 0 when not provided', async () => {
      await transcribeAudio(mockAudioBuffer, mockFilename);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        })
      );
    });

    it('should clean up temporary file after successful transcription', async () => {
      await transcribeAudio(mockAudioBuffer, mockFilename);

      expect(unlink).toHaveBeenCalledWith(expect.stringContaining('/tmp/temp_audio_'));
    });

    it('should clean up temporary file even if transcription fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API error'));

      await expect(transcribeAudio(mockAudioBuffer, mockFilename)).rejects.toThrow();

      expect(unlink).toHaveBeenCalledWith(expect.stringContaining('/tmp/temp_audio_'));
    });

    it('should throw error with descriptive message when OpenAI API fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      await expect(transcribeAudio(mockAudioBuffer, mockFilename)).rejects.toThrow(
        'Audio transcription failed: Invalid API key'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockCreate.mockRejectedValueOnce('String error');

      await expect(transcribeAudio(mockAudioBuffer, mockFilename)).rejects.toThrow(
        'Audio transcription failed: Unknown error'
      );
    });

    it('should preserve original file extension in temporary file', async () => {
      await transcribeAudio(mockAudioBuffer, 'recording.wav');

      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('.wav'), mockAudioBuffer);
    });

    it('should handle files without extension', async () => {
      await transcribeAudio(mockAudioBuffer, 'audiofile');

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/temp_audio_[a-f0-9-]+$/),
        mockAudioBuffer
      );
    });

    it('should get OpenAI API key from environment when not in database', async () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      (settingsService.getOpenAIConfig as jest.Mock).mockResolvedValue({
        apiKey: null,
      });

      await transcribeAudio(mockAudioBuffer, mockFilename);

      // Should still succeed with env key
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should throw error when no API key is available', async () => {
      delete process.env.OPENAI_API_KEY;
      (settingsService.getOpenAIConfig as jest.Mock).mockResolvedValue({
        apiKey: null,
      });

      await expect(transcribeAudio(mockAudioBuffer, mockFilename)).rejects.toThrow(
        'OpenAI API key not found in database or environment variables'
      );
    });

    it('should log warning if cleanup fails but not throw error', async () => {
      // Make unlink fail
      (unlink as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

      // Transcription should still succeed even if cleanup fails
      const result = await transcribeAudio(mockAudioBuffer, mockFilename);

      expect(result.text).toBe('This is a test transcription.');
      // Cleanup was attempted
      expect(unlink).toHaveBeenCalled();
    });
  });

  describe('generatePDFFromTranscription', () => {
    const mockTranscriptionData = {
      text: 'This is a test transcription.\n\nWith multiple paragraphs.',
      language: 'en',
      duration: 125.5,
    };

    const mockMetadata = {
      uploadDate: new Date('2024-01-15T10:30:00Z'),
      fileSize: 1024 * 1024, // 1MB
      userId: 'user123',
    };

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock PDF document event handlers
      mockPDFDoc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          // Simulate PDF data chunks
          setTimeout(() => callback(Buffer.from('PDF content chunk 1')), 0);
          setTimeout(() => callback(Buffer.from('PDF content chunk 2')), 0);
        } else if (event === 'end') {
          // Simulate PDF generation completion
          setTimeout(() => callback(), 0);
        } else if (event === 'error') {
          // Store error handler for potential use
        }
        return mockPDFDoc;
      });
    });

    it('should generate a PDF buffer', async () => {
      const result = await generatePDFFromTranscription(
        mockTranscriptionData,
        'test-audio.mp3',
        mockMetadata
      );

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should call PDF document methods with filename', async () => {
      await generatePDFFromTranscription(
        mockTranscriptionData,
        'my-recording.mp3',
        mockMetadata
      );

      // Verify filename was passed to PDF text() method
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('my-recording.mp3')
      );
    });

    it('should call PDF document methods to add metadata section', async () => {
      await generatePDFFromTranscription(
        mockTranscriptionData,
        'test.mp3',
        mockMetadata
      );

      // Verify metadata section was created
      expect(mockPDFDoc.text).toHaveBeenCalledWith('Document Information', expect.anything());
    });

    it('should add language to PDF when provided', async () => {
      await generatePDFFromTranscription(
        { ...mockTranscriptionData, language: 'es' },
        'test.mp3',
        mockMetadata
      );

      // Verify language was added (uppercase)
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('ES')
      );
    });

    it('should add formatted duration to PDF when provided (MM:SS format)', async () => {
      await generatePDFFromTranscription(
        { ...mockTranscriptionData, duration: 125 },
        'test.mp3',
        mockMetadata
      );

      // Verify duration was added in MM:SS format
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('2:05')
      );
    });

    it('should format duration with hours when duration >= 1 hour', async () => {
      await generatePDFFromTranscription(
        { ...mockTranscriptionData, duration: 3725 }, // 1:02:05
        'test.mp3',
        mockMetadata
      );

      // Verify duration was added in HH:MM:SS format
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('1:02:05')
      );
    });

    it('should add transcription text to PDF', async () => {
      await generatePDFFromTranscription(
        mockTranscriptionData,
        'test.mp3',
        mockMetadata
      );

      // Verify transcription section was created
      expect(mockPDFDoc.text).toHaveBeenCalledWith('Transcription', expect.anything());
    });

    it('should handle transcription without language metadata', async () => {
      const dataWithoutLanguage = {
        text: 'Transcription text',
        language: undefined,
        duration: 60,
      };

      const result = await generatePDFFromTranscription(dataWithoutLanguage, 'test.mp3', mockMetadata);

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should handle transcription without duration metadata', async () => {
      const dataWithoutDuration = {
        text: 'Transcription text',
        language: 'en',
        duration: undefined,
      };

      const result = await generatePDFFromTranscription(dataWithoutDuration, 'test.mp3', mockMetadata);

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should format file size correctly', async () => {
      const metadata1MB = { ...mockMetadata, fileSize: 1024 * 1024 };
      await generatePDFFromTranscription(
        mockTranscriptionData,
        'test.mp3',
        metadata1MB
      );

      // Verify file size was formatted and added to PDF
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('MB')
      );
    });

    it('should handle long transcription text', async () => {
      const longText = 'A'.repeat(10000);
      const dataWithLongText = { ...mockTranscriptionData, text: longText };

      const result = await generatePDFFromTranscription(dataWithLongText, 'test.mp3', mockMetadata);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should split text into paragraphs correctly', async () => {
      const multiParagraphText =
        'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const dataWithParagraphs = { ...mockTranscriptionData, text: multiParagraphText };

      const result = await generatePDFFromTranscription(dataWithParagraphs, 'test.mp3', mockMetadata);

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('processAudioFile', () => {
    const mockAudioBuffer = Buffer.from('fake audio data');
    const mockMetadata = {
      uploadDate: new Date('2024-01-15'),
      fileSize: 1024 * 1024,
      userId: 'user123',
      mimeType: 'audio/mpeg',
    };

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock dependencies
      (settingsService.getOpenAIConfig as jest.Mock).mockResolvedValue({
        apiKey: 'test-api-key',
      });
      (writeFile as jest.Mock).mockResolvedValue(undefined);
      (unlink as jest.Mock).mockResolvedValue(undefined);
      (createReadStream as jest.Mock).mockReturnValue({} as any);

      mockCreate.mockResolvedValue({
        text: 'Test transcription',
        language: 'en',
        duration: 60,
      });

      // Mock PDF document event handlers
      mockPDFDoc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          // Simulate PDF data chunks
          setTimeout(() => callback(Buffer.from('PDF content chunk 1')), 0);
          setTimeout(() => callback(Buffer.from('PDF content chunk 2')), 0);
        } else if (event === 'end') {
          // Simulate PDF generation completion
          setTimeout(() => callback(), 0);
        } else if (event === 'error') {
          // Store error handler for potential use
        }
        return mockPDFDoc;
      });
    });

    it('should process audio file and return PDF buffer and metadata', async () => {
      const result = await processAudioFile(mockAudioBuffer, 'test.mp3', mockMetadata);

      expect(result).toEqual({
        pdfBuffer: expect.any(Buffer),
        transcriptionText: 'Test transcription',
        metadata: {
          language: 'en',
          duration: 60,
          originalFileName: 'test.mp3',
          generatedFileName: 'test_transcription.pdf',
        },
      });
    });

    it('should generate PDF filename from original filename', async () => {
      const result = await processAudioFile(mockAudioBuffer, 'my-recording.mp3', mockMetadata);

      expect(result.metadata.generatedFileName).toBe('my-recording_transcription.pdf');
    });

    it('should validate audio type and reject unsupported types', async () => {
      const invalidMetadata = { ...mockMetadata, mimeType: 'video/mp4' };

      await expect(processAudioFile(mockAudioBuffer, 'video.mp4', invalidMetadata)).rejects.toThrow(
        'Unsupported audio type: video/mp4'
      );
    });

    it('should reject audio files larger than 37.5MB', async () => {
      const largeBuffer = Buffer.alloc(40 * 1024 * 1024); // 40MB

      await expect(processAudioFile(largeBuffer, 'large.mp3', mockMetadata)).rejects.toThrow(
        'Audio file too large'
      );
      await expect(processAudioFile(largeBuffer, 'large.mp3', mockMetadata)).rejects.toThrow(
        '37.5MB'
      );
    });

    it('should accept audio files at exactly 37.5MB', async () => {
      const maxBuffer = Buffer.alloc(37.5 * 1024 * 1024); // Exactly 37.5MB

      const result = await processAudioFile(maxBuffer, 'max-size.mp3', mockMetadata);

      expect(result.pdfBuffer).toBeDefined();
    });

    it('should accept audio files smaller than 37.5MB', async () => {
      const smallBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB

      const result = await processAudioFile(smallBuffer, 'small.mp3', mockMetadata);

      expect(result.pdfBuffer).toBeDefined();
    });

    it('should pass transcription options to transcribeAudio', async () => {
      const options = {
        language: 'fr',
        prompt: 'Medical discussion',
        temperature: 0.3,
      };

      await processAudioFile(mockAudioBuffer, 'test.mp3', mockMetadata, options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'fr',
          prompt: 'Medical discussion',
          temperature: 0.3,
        })
      );
    });

    it('should handle errors from transcription', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Transcription failed'));

      await expect(processAudioFile(mockAudioBuffer, 'test.mp3', mockMetadata)).rejects.toThrow(
        'Transcription failed'
      );
    });

    it('should handle all supported audio types', async () => {
      const supportedTypes = [
        { mimeType: 'audio/mpeg', filename: 'test.mp3' },
        { mimeType: 'audio/wav', filename: 'test.wav' },
        { mimeType: 'audio/mp4', filename: 'test.m4a' },
        { mimeType: 'audio/aac', filename: 'test.aac' },
        { mimeType: 'audio/ogg', filename: 'test.ogg' },
        { mimeType: 'audio/flac', filename: 'test.flac' },
        { mimeType: 'audio/webm', filename: 'test.webm' },
      ];

      for (const { mimeType, filename } of supportedTypes) {
        const metadata = { ...mockMetadata, mimeType };
        const result = await processAudioFile(mockAudioBuffer, filename, metadata);
        expect(result.pdfBuffer).toBeDefined();
      }
    });
  });

  describe('constants', () => {
    it('should export SUPPORTED_AUDIO_TYPES array', () => {
      expect(Array.isArray(SUPPORTED_AUDIO_TYPES)).toBe(true);
      expect(SUPPORTED_AUDIO_TYPES.length).toBe(7);
    });

    it('should export SUPPORTED_AUDIO_EXTENSIONS array', () => {
      expect(Array.isArray(SUPPORTED_AUDIO_EXTENSIONS)).toBe(true);
      expect(SUPPORTED_AUDIO_EXTENSIONS.length).toBe(7);
    });

    it('should have matching number of types and extensions', () => {
      expect(SUPPORTED_AUDIO_TYPES.length).toBe(SUPPORTED_AUDIO_EXTENSIONS.length);
    });
  });
});
