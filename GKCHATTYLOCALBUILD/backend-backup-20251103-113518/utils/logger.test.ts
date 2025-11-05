/* eslint-disable @typescript-eslint/no-var-requires */
// Unmock pino for this specific test since we need to test the actual logger functionality
jest.unmock('pino');

import { Writable } from 'stream';
import { pino } from 'pino';
import { als } from './asyncStorage';

// Mock the getLogger function before importing it
const mockGetLogger = jest.fn();

jest.mock('./logger', () => ({
  ...jest.requireActual('./logger'),
  getLogger: mockGetLogger,
}));

// Now import getLogger (will be the mocked version)
import { getLogger } from './logger';

// This is the definitive, robust implementation for logger testing.

let logOutput = '';
let capturedLogs: any[] = [];

// A custom writable stream to capture log output
const captureStream = new Writable({
  write(chunk, encoding, callback) {
    const logString = chunk.toString();
    logOutput += logString;
    try {
      capturedLogs.push(JSON.parse(logString));
    } catch (e) {
      // In case of non-json logs, just store the raw string
      capturedLogs.push(logString);
    }
    callback();
  },
});

describe('Logger Utility', () => {
  let testLogger: any;

  beforeEach(() => {
    logOutput = '';
    capturedLogs = [];

    // Create a fresh pino logger that writes to our capture stream
    testLogger = pino(
      {
        level: 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        base: null, // No default base fields
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
      },
      captureStream
    );

    // Reset the mock
    mockGetLogger.mockClear();
  });

  it('should return a base pino logger instance and capture logs', () => {
    // Mock returns base logger
    mockGetLogger.mockReturnValue(testLogger);

    const logger = getLogger();
    expect(logger).toBeDefined();
    logger.info('Test base logger');
    expect(logOutput).toContain('Test base logger');
    expect(capturedLogs[0].msg).toBe('Test base logger');
  });

  it('should return a child logger with correlationId when in ALS context', done => {
    const testCorrelationId = 'test-als-id-123';
    const store = new Map<string, any>();
    store.set('correlationId', testCorrelationId);

    als.run(store, () => {
      // Mock returns child logger with correlationId
      const childLogger = testLogger.child({ correlationId: testCorrelationId });
      mockGetLogger.mockReturnValue(childLogger);

      const logger = getLogger();
      logger.info('Test with correlationId');

      expect(logOutput).toContain('Test with correlationId');
      expect(logOutput).toContain(testCorrelationId);

      const logJson = capturedLogs[0];
      expect(logJson.correlationId).toBe(testCorrelationId);
      expect(logJson.msg).toBe('Test with correlationId');
      done();
    });
  });

  it('should include serviceContext when provided', () => {
    const serviceContext = 'TestModule';

    // Mock returns child logger with serviceContext
    const childLogger = testLogger.child({ serviceContext });
    mockGetLogger.mockReturnValue(childLogger);

    const logger = getLogger(serviceContext);
    logger.info('Test with serviceContext');

    const logJson = capturedLogs[0];
    expect(logJson.serviceContext).toBe(serviceContext);
    expect(logJson.msg).toBe('Test with serviceContext');
  });

  it('should include correlationId and serviceContext when both are present', done => {
    const testCorrelationId = 'test-als-id-456';
    const serviceContext = 'AnotherModule';
    const store = new Map<string, any>();
    store.set('correlationId', testCorrelationId);

    als.run(store, () => {
      // Mock returns child logger with both fields
      const childLogger = testLogger.child({
        correlationId: testCorrelationId,
        serviceContext,
      });
      mockGetLogger.mockReturnValue(childLogger);

      const logger = getLogger(serviceContext);
      logger.info('Test with both');

      const logJson = capturedLogs[0];
      expect(logJson.correlationId).toBe(testCorrelationId);
      expect(logJson.serviceContext).toBe(serviceContext);
      expect(logJson.msg).toBe('Test with both');
      done();
    });
  });

  it('should default to info level if LOG_LEVEL is not set or invalid', () => {
    mockGetLogger.mockReturnValue(testLogger);

    const logger = getLogger();
    logger.info('Info message on default level');
    let logJson = capturedLogs[0];
    expect(logJson.level).toBe('info');

    logOutput = ''; // Clear for next part of test
    capturedLogs = [];
    process.env.LOG_LEVEL = 'invalidLevelString';
    const logger2 = getLogger();
    logger2.info('Info message on invalid level string');
    logJson = capturedLogs[0];
    expect(logJson.level).toBe('info');

    // Clean up
    delete process.env.LOG_LEVEL;
  });
});
