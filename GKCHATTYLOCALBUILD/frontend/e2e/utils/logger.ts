/**
 * Simple logger for E2E tests
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL = (process.env.E2E_LOG_LEVEL || 'info') as LogLevel;

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function getLogger(context: string) {
  const currentLevel = levels[LOG_LEVEL];

  const log = (level: LogLevel, message: string, metadata?: any) => {
    if (levels[level] >= currentLevel) {
      const timestamp = new Date().toISOString();
      const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
      console.log(`[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${metaStr}`);
    }
  };

  return {
    debug: (message: string, metadata?: any) => log('debug', message, metadata),
    info: (message: string, metadata?: any) => log('info', message, metadata),
    warn: (message: string, metadata?: any) => log('warn', message, metadata),
    error: (message: string, metadata?: any) => log('error', message, metadata),
  };
}
