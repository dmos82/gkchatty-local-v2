import { getLogger } from './logger';

/**
 * Redirects global console methods (log, info, warn, error, debug)
 * to the structured pino logger created by getLogger().
 *
 * The correlationIdMiddleware populates AsyncLocalStorage, allowing
 * getLogger() to automatically attach the current correlationId to
 * every log entry—even when existing code still calls console.*.
 *
 * This utility should be initialized once at application startup.
 */
export const patchConsoleWithLogger = (): void => {
  // Ensure we only patch the console once per process.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (global.__consolePatched) return;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  global.__consolePatched = true;

  const logger = getLogger('console');

  type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
  type LoggerLevel = 'info' | 'warn' | 'error' | 'debug';

  const wrap = (method: ConsoleMethod, level: LoggerLevel): void => {
    (console as Record<ConsoleMethod, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ): void => {
      // Combine arguments into a single string message for readability
      const message = args
        .map(arg => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(' ');

      // Forward to structured logger with correlationId (if available)
      (logger as Record<LoggerLevel, (obj: unknown, msg?: string) => void>)[level](
        { originalArgs: args },
        message
      );

      // Optionally keep native console output for local dev by uncommenting:
      // const original = console[method] as (...args: unknown[]) => void;
      // original.apply(console, args);
    };
  };

  wrap('log', 'info');
  wrap('info', 'info');
  wrap('warn', 'warn');
  wrap('error', 'error');
  wrap('debug', 'debug');
};
