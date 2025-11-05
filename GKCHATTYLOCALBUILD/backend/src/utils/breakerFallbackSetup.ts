import { chatCompletionBreaker } from './openaiHelper';
import { ServiceUnavailableError } from '../errors/serviceUnavailableError';

// Attach production-only circuit breaker fallback
if (process.env.NODE_ENV !== 'test') {
  chatCompletionBreaker.fallback(() => {
    throw new ServiceUnavailableError(
      'AI service is currently unavailable. Please try again later.'
    );
  });
}
