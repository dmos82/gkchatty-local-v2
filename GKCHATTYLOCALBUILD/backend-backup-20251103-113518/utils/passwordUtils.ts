import { randomBytes } from 'crypto';

/**
 * Generate a secure random password
 * @param length - Length of the password (default: 12)
 * @returns A secure random password string
 */
export function generateSecurePassword(length: number = 12): string {
  // Character sets for password generation
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Combine all character sets
  const allChars = uppercase + lowercase + numbers + symbols;

  // Ensure at least one character from each set
  let password = '';
  password += uppercase[randomBytes(1)[0] % uppercase.length];
  password += lowercase[randomBytes(1)[0] % lowercase.length];
  password += numbers[randomBytes(1)[0] % numbers.length];
  password += symbols[randomBytes(1)[0] % symbols.length];

  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    const randomIndex = randomBytes(1)[0] % allChars.length;
    password += allChars[randomIndex];
  }

  // Shuffle the password to avoid predictable patterns
  return password
    .split('')
    .sort(() => (randomBytes(1)[0] % 3) - 1)
    .join('');
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Object with validation result and message
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  message?: string;
} {
  if (password.length < 6) {
    return {
      isValid: false,
      message: 'Password must be at least 6 characters long',
    };
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one uppercase letter',
    };
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one lowercase letter',
    };
  }

  // Check for at least one number
  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one number',
    };
  }

  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one special character',
    };
  }

  return {
    isValid: true,
  };
}
