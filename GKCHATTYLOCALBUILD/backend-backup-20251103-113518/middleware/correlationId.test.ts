import { correlationIdMiddleware } from './correlationId';
import { als } from '../utils/asyncStorage';
import { getMockReq, getMockRes } from '@jest-mock/express';
import { v4 as uuidv4 } from 'uuid';

// Mock uuid v4 to control its output for some tests if needed, or spy on it
jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'), // Import and retain default behavior
  v4: jest.fn(), // Mock v4 specifically
}));

describe('correlationIdMiddleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    req = getMockReq();
    res = getMockRes().res;
    next = jest.fn();
    (uuidv4 as jest.Mock).mockClear(); // Clear mock calls before each test
  });

  it('should generate a new correlationId if x-correlation-id header is not present', done => {
    const generatedUuid = 'a-brand-new-uuid';
    (uuidv4 as jest.Mock).mockReturnValue(generatedUuid);

    const customNext = jest.fn(() => {
      // Access the store from within the middleware's ALS context
      const store = als.getStore();
      expect(store?.get('correlationId')).toBe(generatedUuid);
      done();
    });

    correlationIdMiddleware(req, res, customNext);

    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', generatedUuid);
    expect((req as any).correlationId).toBe(generatedUuid);
  });

  it('should use existing correlationId if x-correlation-id header is present', done => {
    const existingCorrelationId = 'existing-uuid-12345';
    req.headers['x-correlation-id'] = existingCorrelationId;

    const customNext = jest.fn(() => {
      // Access the store from within the middleware's ALS context
      const store = als.getStore();
      expect(store?.get('correlationId')).toBe(existingCorrelationId);
      done();
    });

    correlationIdMiddleware(req, res, customNext);

    expect(uuidv4).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', existingCorrelationId);
    expect((req as any).correlationId).toBe(existingCorrelationId);
  });

  it('should call next() to pass control to the next middleware', done => {
    (uuidv4 as jest.Mock).mockReturnValue('some-uuid');

    const customNext = jest.fn(() => {
      expect(next).not.toHaveBeenCalled(); // This custom next should be called instead
      done();
    });

    correlationIdMiddleware(req, res, customNext);
    expect(customNext).toHaveBeenCalledTimes(1);
  });

  it('should make correlationId available via als.getStore() within the als.run callback', done => {
    const testUuid = 'als-test-uuid';
    (uuidv4 as jest.Mock).mockReturnValue(testUuid);

    const customNext = jest.fn(() => {
      const store = als.getStore();
      expect(store?.get('correlationId')).toBe(testUuid);
      done();
    });

    correlationIdMiddleware(req, res, customNext);
  });
});
