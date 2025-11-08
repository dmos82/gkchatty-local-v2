import crypto from 'crypto';
import { getLogger } from './logger';

const log = getLogger('cryptoUtils');

const ALGORITHM = 'aes-256-cbc';
// Ensure ENCRYPTION_KEY is set in your .env file and is a 32-byte string
const BASE_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'; // Fallback for local dev, **REPLACE IN PROD**
const IV_LENGTH = 16; // For AES, this is always 16

// Validate encryption key on module load
function validateEncryptionKey(): void {
  const keyFromEnv = process.env.ENCRYPTION_KEY || BASE_ENCRYPTION_KEY;

  if (!keyFromEnv || keyFromEnv.length !== 64) {
    const errorMsg =
      `[CryptoUtils] CRITICAL ERROR: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) for AES-256. ` +
      `Current length: ${keyFromEnv ? keyFromEnv.length : 0}. ` +
      `Please set a valid ENCRYPTION_KEY environment variable. ` +
      `Generate one with: openssl rand -hex 32`;

    log.error(errorMsg);

    // In production, log error but don't crash the application
    // Allow it to use the fallback key with warnings
    if (process.env.NODE_ENV === 'production') {
      log.error(
        '[CryptoUtils] WARNING: Using fallback encryption key in production. This is not secure!'
      );
      log.error('[CryptoUtils] Application will continue but encryption may be compromised.');
    } else {
      // Only throw in non-production environments
      throw new Error(errorMsg);
    }
  }

  // Check if it's a valid hex string
  if (keyFromEnv && !/^[0-9a-fA-F]{64}$/.test(keyFromEnv)) {
    const errorMsg =
      `[CryptoUtils] CRITICAL ERROR: ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f, A-F). ` +
      `Please set a valid hex string.`;

    log.error(errorMsg);

    if (process.env.NODE_ENV === 'production') {
      log.error(
        '[CryptoUtils] WARNING: Invalid encryption key format in production. Using fallback.'
      );
    } else {
      throw new Error(errorMsg);
    }
  }
}

// Validate on module load
validateEncryptionKey();

if (process.env.NODE_ENV !== 'test' && BASE_ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef') {
  log.warn(
    'WARNING: Using default fallback ENCRYPTION_KEY. This is not secure for production. Please set a strong ENCRYPTION_KEY in your environment variables.'
  );
}

export function encrypt(text: string): string {
  const keyFromEnv = process.env.ENCRYPTION_KEY || BASE_ENCRYPTION_KEY; // Use BASE_ENCRYPTION_KEY if process.env.ENCRYPTION_KEY is undefined
  log.debug(`[CryptoUtils Encrypt] Raw ENCRYPTION_KEY from ENV (or fallback): "${keyFromEnv}"`);
  if (!keyFromEnv || keyFromEnv.length !== 64) {
    log.error(
      '[CryptoUtils Encrypt] CRITICAL: Effective ENCRYPTION_KEY is missing or not 64 hex characters long!'
    );
    throw new Error(
      'Invalid encryption key configuration. Please check ENCRYPTION_KEY environment variable.'
    );
  }
  const keyBuffer = Buffer.from(keyFromEnv, 'hex');
  log.debug(`[CryptoUtils Encrypt] ENCRYPTION_KEY Buffer length: ${keyBuffer.length} bytes`);

  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const keyFromEnv = process.env.ENCRYPTION_KEY || BASE_ENCRYPTION_KEY;
  // log.debug(`[CryptoUtils Decrypt] Raw ENCRYPTION_KEY from ENV (or fallback): "${keyFromEnv}"`); // Optional: less verbose for decrypt
  if (!keyFromEnv || keyFromEnv.length !== 64) {
    log.error(
      '[CryptoUtils Decrypt] CRITICAL: Effective ENCRYPTION_KEY is missing or not 64 hex characters long for decryption!'
    );
    throw new Error(
      'Invalid encryption key configuration. Please check ENCRYPTION_KEY environment variable.'
    );
  }
  const keyBuffer = Buffer.from(keyFromEnv, 'hex');
  // log.debug(`[CryptoUtils Decrypt] ENCRYPTION_KEY Buffer length: ${keyBuffer.length} bytes`);

  if (!text) return '';
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) throw new Error('Invalid encrypted text format');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    log.error('[CryptoUtils] Decryption failed:', error);
    // Return an empty string or a specific error indicator if decryption fails,
    // instead of throwing, to prevent app crashes if a key is tampered with or corrupt.
    // The calling function should handle an empty string as a failure to decrypt.
    return '';
  }
}
