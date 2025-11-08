import {
  processVideoFile,
  extractAudioFromVideo,
  isSupportedVideoType,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_VIDEO_TYPES,
} from '../../utils/videoProcessor';
import * as audioProcessor from '../../utils/audioProcessor';
import { promises as fs } from 'fs';
import { getLogger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  })),
}));
jest.mock('../../utils/audioProcessor');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock audio data')),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
  stat: jest.fn((_path, callback) => {
    callback(null, {
      mode: 33261, // rwxr-xr-x
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: 0,
      blksize: 0,
      blocks: 0,
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      birthtimeMs: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    });
  }),
}));
jest.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/mocked/ffmpeg/path',
}));

// Declare mock variables BEFORE jest.mock calls
let mockFfmpegInstance: any;

jest.mock('fluent-ffmpeg', () => {
  // Create mock fluent-ffmpeg constructor
  const mockConstructor = jest.fn().mockImplementation(() => {
    mockFfmpegInstance = {
      _simulateError: false,
      _endCallback: undefined as undefined | (() => void),
      _errorCallback: undefined as undefined | ((err: Error) => void),
      output: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      audioChannels: jest.fn().mockReturnThis(),
      audioFrequency: jest.fn().mockReturnThis(),
      on: jest.fn().mockImplementation(function (
        event: string,
        callback: (...args: any[]) => void
      ) {
        if (event === 'end') {
          mockFfmpegInstance._endCallback = callback as () => void;
        } else if (event === 'error') {
          mockFfmpegInstance._errorCallback = callback as (err: Error) => void;
        }
        return this;
      }),
      run: jest.fn().mockImplementation(function () {
        if (mockFfmpegInstance._simulateError) {
          if (mockFfmpegInstance._errorCallback) {
            mockFfmpegInstance._errorCallback(new Error('FFmpeg processing failed'));
          }
        } else if (mockFfmpegInstance._endCallback) {
          mockFfmpegInstance._endCallback();
        }
      }),
    };
    return mockFfmpegInstance;
  });

  // Add setFfmpegPath method to the constructor
  mockConstructor.setFfmpegPath = jest.fn();

  return mockConstructor;
});

// Get the mocked constructor for tests
import * as fluentFfmpeg from 'fluent-ffmpeg';
const mockFfmpeg = fluentFfmpeg as any;

describe('videoProcessor', () => {
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    (getLogger as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('isSupportedVideoType', () => {
    it('should return true for supported MIME types', () => {
      expect(isSupportedVideoType('video/mp4')).toBe(true);
      expect(isSupportedVideoType(SUPPORTED_VIDEO_TYPES[0])).toBe(true);
    });

    it('should return true for supported file extensions', () => {
      expect(isSupportedVideoType('application/octet-stream', 'test.mov')).toBe(true);
      expect(
        isSupportedVideoType('application/octet-stream', `test${SUPPORTED_VIDEO_EXTENSIONS[0]}`)
      ).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isSupportedVideoType('image/jpeg')).toBe(false);
      expect(isSupportedVideoType('application/octet-stream', 'test.txt')).toBe(false);
    });
  });

  describe('extractAudioFromVideo', () => {
    it('should extract audio from a video buffer', async () => {
      const videoBuffer = Buffer.from('mock video data');
      const originalFileName = 'test.mp4';

      const result = await extractAudioFromVideo(videoBuffer, originalFileName);

      expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), videoBuffer);
      expect(mockFfmpeg).toHaveBeenCalledWith(expect.any(String));
      expect(mockFfmpegInstance.output).toHaveBeenCalledWith(expect.stringContaining('.wav'));
      expect(mockFfmpegInstance.run).toHaveBeenCalled();
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioFileName).toBe('test_audio.wav');
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should throw if ffmpeg fails', async () => {
      const videoBuffer = Buffer.from('mock video data');
      const originalFileName = 'test-fail.mp4';

      // Modify the mock implementation to trigger error on this specific call
      mockFfmpeg.mockImplementationOnce(() => {
        const errorInstance = {
          _simulateError: true,
          _endCallback: undefined as undefined | (() => void),
          _errorCallback: undefined as undefined | ((err: Error) => void),
          output: jest.fn().mockReturnThis(),
          audioCodec: jest.fn().mockReturnThis(),
          audioChannels: jest.fn().mockReturnThis(),
          audioFrequency: jest.fn().mockReturnThis(),
          on: jest.fn().mockImplementation(function (
            event: string,
            callback: (...args: any[]) => void
          ) {
            if (event === 'error') {
              errorInstance._errorCallback = callback as (err: Error) => void;
            }
            return this;
          }),
          run: jest.fn().mockImplementation(function () {
            if (errorInstance._errorCallback) {
              errorInstance._errorCallback(new Error('FFmpeg processing failed'));
            }
          }),
        };
        return errorInstance;
      });

      await expect(extractAudioFromVideo(videoBuffer, originalFileName)).rejects.toThrow(
        'Audio extraction failed: FFmpeg processing failed'
      );
    });
  });

  describe('processVideoFile', () => {
    const videoBuffer = Buffer.from('large mock video data');
    const originalFileName = 'my-awesome-video.mov';
    const metadata = {
      uploadDate: new Date(),
      fileSize: videoBuffer.length,
      mimeType: 'video/quicktime',
    };
    const options = {};

    it('should process a video file successfully', async () => {
      const mockAudioResult = {
        pdfBuffer: Buffer.from('mock pdf'),
        transcriptionText: 'This is a test transcription.',
        metadata: {
          language: 'en',
          duration: 120,
        },
      };

      jest.spyOn(audioProcessor, 'processAudioFile').mockResolvedValue(mockAudioResult as any);

      const result = await processVideoFile(videoBuffer, originalFileName, metadata, options);

      expect(audioProcessor.processAudioFile).toHaveBeenCalled();
      expect(result.pdfBuffer).toBe(mockAudioResult.pdfBuffer);
      expect(result.transcriptionText).toBe(mockAudioResult.transcriptionText);
      expect(result.metadata.originalFileName).toBe(originalFileName);
      expect(result.metadata.generatedFileName).toBe('my-awesome-video_video_transcript.pdf');
    });

    it('should throw an error for unsupported file types', async () => {
      const invalidMetadata = { ...metadata, mimeType: 'video/unsupported' };
      await expect(
        processVideoFile(videoBuffer, 'test.unsupported', invalidMetadata, options)
      ).rejects.toThrow('Unsupported video type');
    });

    it('should throw an error if file is too large', async () => {
      const largeBuffer = Buffer.alloc(151 * 1024 * 1024); // 151MB (exceeds 150MB limit)
      const largeMetadata = { ...metadata, fileSize: largeBuffer.length };
      await expect(
        processVideoFile(largeBuffer, originalFileName, largeMetadata, options)
      ).rejects.toThrow(/Video file too large/);
    });
  });
});
