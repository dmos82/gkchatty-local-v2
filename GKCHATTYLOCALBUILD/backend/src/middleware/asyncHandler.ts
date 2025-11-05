import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async controller function to catch any errors and pass them to the next middleware
 * This eliminates the need for try-catch blocks in every controller function
 *
 * @param fn Async controller function to wrap
 * @returns Wrapped function with error handling
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
