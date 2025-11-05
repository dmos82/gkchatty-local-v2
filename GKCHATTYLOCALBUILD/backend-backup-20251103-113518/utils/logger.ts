import pino from 'pino';
import { als } from './asyncStorage';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: null, // Do not include default base fields (pid, hostname)
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
});

export { pinoLogger }; // Export the base pinoLogger instance

/**
 * Returns a logger instance.
 * If called within an AsyncLocalStorage context managed by correlationIdMiddleware,
 * it returns a child logger with the current correlationId.
 * Otherwise, it returns the base logger.
 */
export const getLogger = (serviceContext?: string) => {
  const store = als.getStore();
  const correlationId = store?.get('correlationId') as string | undefined;

  const baseLog = {
    ...(correlationId && { correlationId }),
    ...(serviceContext && { serviceContext }),
  };

  if (Object.keys(baseLog).length > 0) {
    return pinoLogger.child(baseLog);
  }
  return pinoLogger;
};

// Default logger instance
const logger = getLogger();
export default logger;
