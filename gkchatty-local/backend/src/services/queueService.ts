/**
 * Simple Request Queue Service for GKChatty
 * Handles AI request queuing to prevent rate limit rejections
 * Supports 50+ concurrent users by queuing excess requests
 */

import Bull from 'bull';
import { getLogger } from '../utils/logger';
import { getChatCompletion, getChatCompletionStream } from '../utils/openaiHelper';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const logger = getLogger('queueService');

// Queue configuration
const QUEUE_REDIS_URL = process.env.BULL_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '10', 10);
const MAX_JOBS = parseInt(process.env.QUEUE_MAX_JOBS || '1000', 10);

// Types
interface ChatJobData {
  userId: string;
  messages: ChatCompletionMessageParam[];
  requestId: string;
  streaming: boolean;
  timestamp: number;
}

interface ChatJobResult {
  requestId: string;
  response: any;
  processingTime: number;
}

// Create the chat queue
export const chatQueue = new Bull<ChatJobData>('chat-queue', QUEUE_REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
  },
});

// Process chat jobs
chatQueue.process(MAX_CONCURRENCY, async (job) => {
  const startTime = Date.now();
  const { userId, messages, requestId, streaming } = job.data;

  logger.info({
    requestId,
    userId,
    jobId: job.id,
    attempt: job.attemptsMade,
  }, 'Processing chat job from queue');

  try {
    let response;

    if (streaming) {
      // For streaming, we need a different approach
      // This would need WebSocket or SSE support
      logger.warn({ requestId }, 'Streaming not supported in queue mode, using regular completion');
      response = await getChatCompletion(messages);
    } else {
      response = await getChatCompletion(messages);
    }

    const processingTime = Date.now() - startTime;

    logger.info({
      requestId,
      userId,
      processingTime,
      jobId: job.id,
    }, 'Chat job completed successfully');

    return {
      requestId,
      response,
      processingTime,
    } as ChatJobResult;

  } catch (error) {
    logger.error({
      requestId,
      userId,
      error,
      jobId: job.id,
      attempt: job.attemptsMade,
    }, 'Chat job failed');

    throw error; // Bull will handle retries
  }
});

// Queue event handlers
chatQueue.on('completed', (job, result: ChatJobResult) => {
  logger.info({
    jobId: job.id,
    requestId: result.requestId,
    processingTime: result.processingTime,
  }, 'Job completed');
});

chatQueue.on('failed', (job, err) => {
  logger.error({
    jobId: job.id,
    requestId: job.data.requestId,
    userId: job.data.userId,
    error: err.message,
    attempts: job.attemptsMade,
  }, 'Job failed after all retries');
});

chatQueue.on('stalled', (job) => {
  logger.warn({
    jobId: job.id,
    requestId: job.data.requestId,
  }, 'Job stalled and will be retried');
});

// Queue management functions

/**
 * Add a chat request to the queue
 */
export async function queueChatRequest(
  userId: string,
  messages: ChatCompletionMessageParam[],
  streaming = false
): Promise<Bull.Job<ChatJobData>> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const job = await chatQueue.add({
    userId,
    messages,
    requestId,
    streaming,
    timestamp: Date.now(),
  }, {
    priority: streaming ? 1 : 0, // Higher priority for streaming requests
  });

  logger.info({
    requestId,
    userId,
    jobId: job.id,
  }, 'Chat request added to queue');

  return job;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    chatQueue.getWaitingCount(),
    chatQueue.getActiveCount(),
    chatQueue.getCompletedCount(),
    chatQueue.getFailedCount(),
    chatQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
    isPaused: await chatQueue.isPaused(),
  };
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Bull.Job<ChatJobData> | null> {
  return chatQueue.getJob(jobId);
}

/**
 * Clean old jobs
 */
export async function cleanQueue() {
  const cleaned = await chatQueue.clean(
    24 * 60 * 60 * 1000, // 24 hours
    'completed'
  );

  logger.info({ cleanedJobs: cleaned.length }, 'Cleaned old completed jobs');
  return cleaned;
}

/**
 * Pause/resume queue processing
 */
export async function pauseQueue() {
  await chatQueue.pause();
  logger.info('Chat queue paused');
}

export async function resumeQueue() {
  await chatQueue.resume();
  logger.info('Chat queue resumed');
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  logger.info('Closing chat queue...');
  await chatQueue.close();
  logger.info('Chat queue closed');
}

// Export queue health check
export async function isQueueHealthy(): Promise<boolean> {
  try {
    const stats = await getQueueStats();

    // Check if queue is overwhelmed
    if (stats.waiting > MAX_JOBS) {
      logger.warn({ stats }, 'Queue is overwhelmed');
      return false;
    }

    // Check if too many failures
    if (stats.failed > stats.completed * 0.1) { // More than 10% failure rate
      logger.warn({ stats }, 'High failure rate in queue');
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error }, 'Queue health check failed');
    return false;
  }
}

// Middleware to check if request should be queued
export function shouldQueueRequest(req: any): boolean {
  // Queue if rate limit is approaching
  const remaining = req.rateLimit?.remaining || Infinity;
  const limit = req.rateLimit?.limit || Infinity;

  // Queue if less than 20% of rate limit remaining
  if (remaining < limit * 0.2) {
    logger.info({
      remaining,
      limit,
      userId: req.user?._id,
    }, 'Queuing request due to rate limit approaching');
    return true;
  }

  return false;
}

export default {
  queueChatRequest,
  getQueueStats,
  getJob,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closeQueue,
  isQueueHealthy,
  shouldQueueRequest,
  chatQueue,
};