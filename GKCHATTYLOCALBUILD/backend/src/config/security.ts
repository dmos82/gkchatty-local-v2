/**
 * Security Configuration
 * HIGH-004: Centralized bcrypt work factor configuration
 */

// Bcrypt work factor (cost factor)
// - Factor 10: ~100ms per hash (2010 standard)
// - Factor 12: ~400ms per hash (2025 standard) ← RECOMMENDED
// - Factor 14: ~1600ms per hash (future-proof but slow)
export const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// Validate bcrypt rounds are within reasonable range
if (BCRYPT_ROUNDS < 10 || BCRYPT_ROUNDS > 15) {
  console.warn(`[Security Config] BCRYPT_ROUNDS=${BCRYPT_ROUNDS} is outside recommended range (10-15). Using default: 12`);
  // Override with safe default
  Object.defineProperty(exports, 'BCRYPT_ROUNDS', { value: 12 });
}

// Log the configuration (without exposing sensitive data)
console.log(`[Security Config] Bcrypt work factor: ${BCRYPT_ROUNDS} (${Math.pow(2, BCRYPT_ROUNDS)} iterations)`);