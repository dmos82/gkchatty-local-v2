import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { Request, Response } from 'express';
import { getLogger } from '../utils/logger';
import {
  REDIS_MAX_RETRY_ATTEMPTS,
  REDIS_RETRY_BASE_DELAY_MS,
  REDIS_RETRY_MAX_DELAY_MS,
  RATE_LIMIT_STANDARD_WINDOW_MS,
  RATE_LIMIT_STANDARD_MAX_DEV,
  RATE_LIMIT_STANDARD_MAX_PROD,
  RATE_LIMIT_DEFAULT_RETRY_AFTER_SECONDS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX_DEV,
  RATE_LIMIT_AUTH_MAX_PROD,
  RATE_LIMIT_AI_WINDOW_MS,
  RATE_LIMIT_AI_MAX_DEV,
  RATE_LIMIT_AI_MAX_PROD,
  RATE_LIMIT_UPLOAD_WINDOW_MS,
  RATE_LIMIT_UPLOAD_MAX_DEV,
  RATE_LIMIT_UPLOAD_MAX_PROD,
  RATE_LIMIT_UPLOAD_DEFAULT_RETRY_AFTER_SECONDS,
  RATE_LIMIT_ADMIN_WINDOW_MS,
  RATE_LIMIT_ADMIN_MAX_DEV,
  RATE_LIMIT_ADMIN_MAX_PROD,
} from '../config/constants';

const logger = getLogger('rateLimiter');

// Extend Request interface to include rateLimit property
declare module 'express' {
  interface Request {
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime: Date;
    };
  }
}

// Check if we're in development or test mode
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isE2ETesting = process.env.NODE_ENV === 'test' || process.env.E2E_TESTING === 'true';

// Redis client setup for distributed rate limiting - HIGH-008 Security Fix
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD; // Optional Redis authentication
let redisClient: ReturnType<typeof createClient> | null = null;
let redisStore: RedisStore | null = null;

// Initialize Redis client for rate limiting
async function initRedisClient() {
  if (redisClient) return redisClient;

  try {
    const usesTLS = REDIS_URL.startsWith('rediss://'); // Detect TLS from rediss:// protocol

    redisClient = createClient({
      url: REDIS_URL,
      password: REDIS_PASSWORD, // Add authentication support
      socket: usesTLS
        ? {
            // TLS socket configuration
            tls: true,
            rejectUnauthorized: process.env.NODE_ENV === 'production',
            reconnectStrategy: retries => {
              if (retries > REDIS_MAX_RETRY_ATTEMPTS) {
                logger.error(`Redis reconnection failed after ${REDIS_MAX_RETRY_ATTEMPTS} attempts`);
                return new Error('Redis reconnection failed');
              }
              return Math.min(retries * REDIS_RETRY_BASE_DELAY_MS, REDIS_RETRY_MAX_DELAY_MS);
            },
          }
        : {
            // Non-TLS socket configuration
            reconnectStrategy: retries => {
              if (retries > REDIS_MAX_RETRY_ATTEMPTS) {
                logger.error(`Redis reconnection failed after ${REDIS_MAX_RETRY_ATTEMPTS} attempts`);
                return new Error('Redis reconnection failed');
              }
              return Math.min(retries * REDIS_RETRY_BASE_DELAY_MS, REDIS_RETRY_MAX_DELAY_MS);
            },
          },
    });

    if (usesTLS) {
      logger.info('Redis TLS encryption enabled (rediss:// protocol detected)');
    }
    if (REDIS_PASSWORD) {
      logger.info('Redis authentication enabled');
    }

    redisClient.on('error', err => {
      logger.error({ error: err }, 'Redis client error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected for rate limiting');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    await redisClient.connect();

    // Create RedisStore instance with proper v4 client
    redisStore = new RedisStore({
      sendCommand: (...args: any[]) => redisClient.sendCommand(args),
      prefix: 'rl:', // Rate limit prefix
    });

    logger.info('Redis rate limiter initialized successfully');
    return redisClient;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Redis client for rate limiting');
    redisClient = null;
    redisStore = null;
    return null;
  }
}

// Initialize Redis on startup
initRedisClient().catch(err => {
  logger.error({ error: err }, 'Redis initialization failed - falling back to memory store');
});

// Custom key generator that considers user ID if authenticated
const keyGenerator = (req: Request): string => {
  // If user is authenticated, use their ID
  if (req.user && req.user._id) {
    return `user_${req.user._id}`;
  }
  // Otherwise use IP address
  return req.ip || 'unknown';
};

// Standard rate limiter for general API endpoints
export const standardLimiter = rateLimit({
  windowMs: RATE_LIMIT_STANDARD_WINDOW_MS, // 15 minutes
  max: isDevelopment ? RATE_LIMIT_STANDARD_MAX_DEV : RATE_LIMIT_STANDARD_MAX_PROD, // Much higher limit in development
  message: 'Too many requests from this IP/user, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator,
  // Use Redis store if available, otherwise fall back to memory
  store: redisStore || undefined,
  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        userId: req.user?._id,
        path: req.path,
        method: req.method,
        store: redisStore ? 'redis' : 'memory',
      },
      'Rate limit exceeded'
    );

    // Calculate seconds until reset
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      : RATE_LIMIT_DEFAULT_RETRY_AFTER_SECONDS;

    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: retryAfterSeconds,
    });
  },
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS, // 1 minute
  max: isDevelopment ? RATE_LIMIT_AUTH_MAX_DEV : RATE_LIMIT_AUTH_MAX_PROD, // Higher limit in development
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'unknown', // Always use IP for auth
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: () => isE2ETesting, // Disable rate limiting during E2E tests
  store: redisStore || undefined,
  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method,
        store: redisStore ? 'redis' : 'memory',
      },
      'Auth rate limit exceeded'
    );

    // Calculate seconds until reset
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      : RATE_LIMIT_DEFAULT_RETRY_AFTER_SECONDS;

    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please wait before trying again.',
      retryAfter: retryAfterSeconds,
    });
  },
});

// Strict rate limiter for AI/LLM endpoints (expensive operations)
export const aiLimiter = rateLimit({
  windowMs: RATE_LIMIT_AI_WINDOW_MS, // 1 minute
  max: isDevelopment ? RATE_LIMIT_AI_MAX_DEV : RATE_LIMIT_AI_MAX_PROD, // Much higher limit in development
  message: 'AI request limit exceeded. Please wait before making another request.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: redisStore || undefined,
  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        userId: req.user?._id,
        path: req.path,
        method: req.method,
        store: redisStore ? 'redis' : 'memory',
      },
      'AI rate limit exceeded'
    );

    // Calculate seconds until reset
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      : RATE_LIMIT_DEFAULT_RETRY_AFTER_SECONDS;

    res.status(429).json({
      success: false,
      message: 'AI service rate limit reached. Please wait a moment before trying again.',
      retryAfter: retryAfterSeconds,
    });
  },
});

// Upload rate limiter for document uploads
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT_UPLOAD_WINDOW_MS, // 5 minutes
  max: isDevelopment ? RATE_LIMIT_UPLOAD_MAX_DEV : RATE_LIMIT_UPLOAD_MAX_PROD, // Increased by 50% (was 1000/100)
  message: 'Upload limit exceeded. Please wait before uploading more files.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: redisStore || undefined,
  skip: (req: Request) => {
    // Skip rate limiting for presigned URL endpoints
    if (req.path.includes('/get-presigned-url')) {
      logger.info(
        {
          ip: req.ip,
          userId: req.user?._id,
          path: req.path,
        },
        'Skipping rate limit for presigned URL generation'
      );
      return true;
    }
    return false;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        userId: req.user?._id,
        path: req.path,
        method: req.method,
        store: redisStore ? 'redis' : 'memory',
      },
      'Upload rate limit exceeded'
    );

    // Calculate seconds until reset
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      : RATE_LIMIT_UPLOAD_DEFAULT_RETRY_AFTER_SECONDS;

    res.status(429).json({
      success: false,
      message: 'Upload limit reached. Please wait before uploading more files.',
      retryAfter: retryAfterSeconds,
    });
  },
});

// Admin endpoints - more lenient
export const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT_ADMIN_WINDOW_MS, // 15 minutes
  max: isDevelopment ? RATE_LIMIT_ADMIN_MAX_DEV : RATE_LIMIT_ADMIN_MAX_PROD, // Much higher limit in development
  message: 'Admin rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: redisStore || undefined,
});

// Graceful shutdown
export async function closeRateLimiter() {
  if (redisClient) {
    logger.info('Closing Redis rate limiter connection');
    await redisClient.quit();
    redisClient = null;
    redisStore = null;
  }
}
