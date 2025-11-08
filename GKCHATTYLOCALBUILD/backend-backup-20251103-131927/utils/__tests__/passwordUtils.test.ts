import { generateSecurePassword, validatePasswordStrength } from '../passwordUtils';

describe('passwordUtils', () => {
  describe('generateSecurePassword', () => {
    it('should generate a password with default length of 12 characters', () => {
      const password = generateSecurePassword();
      expect(password).toHaveLength(12);
    });

    it('should generate a password with custom length', () => {
      const lengths = [8, 16, 20, 32];
      lengths.forEach(length => {
        const password = generateSecurePassword(length);
        expect(password).toHaveLength(length);
      });
    });

    it('should generate a password with minimum required length (4 characters for mandatory sets)', () => {
      // Since we enforce 1 uppercase + 1 lowercase + 1 number + 1 symbol
      const password = generateSecurePassword(4);
      expect(password).toHaveLength(4);
    });

    it('should include at least one uppercase letter', () => {
      const password = generateSecurePassword();
      expect(password).toMatch(/[A-Z]/);
    });

    it('should include at least one lowercase letter', () => {
      const password = generateSecurePassword();
      expect(password).toMatch(/[a-z]/);
    });

    it('should include at least one number', () => {
      const password = generateSecurePassword();
      expect(password).toMatch(/[0-9]/);
    });

    it('should include at least one special character', () => {
      const password = generateSecurePassword();
      expect(password).toMatch(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/);
    });

    it('should meet all password strength requirements when validated', () => {
      const password = generateSecurePassword();
      const validation = validatePasswordStrength(password);
      expect(validation.isValid).toBe(true);
      expect(validation.message).toBeUndefined();
    });

    it('should generate unique passwords on each invocation', () => {
      const passwords = new Set();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        passwords.add(generateSecurePassword());
      }

      // All 100 passwords should be unique
      expect(passwords.size).toBe(iterations);
    });

    it('should generate passwords with only valid characters', () => {
      const password = generateSecurePassword(50);
      const validCharsRegex = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/;
      expect(password).toMatch(validCharsRegex);
    });

    it('should handle very long password lengths', () => {
      const longPassword = generateSecurePassword(128);
      expect(longPassword).toHaveLength(128);
      expect(validatePasswordStrength(longPassword).isValid).toBe(true);
    });
  });

  describe('validatePasswordStrength', () => {
    describe('length validation', () => {
      it('should reject passwords shorter than 6 characters', () => {
        const shortPasswords = ['', 'a', 'ab', 'abc', 'abcd', 'abcde'];

        shortPasswords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.message).toBe('Password must be at least 6 characters long');
        });
      });

      it('should accept passwords with exactly 6 characters if they meet other requirements', () => {
        const password = 'Abc12!'; // 6 chars: uppercase, lowercase, number, symbol
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
        expect(result.message).toBeUndefined();
      });

      it('should accept long passwords that meet requirements', () => {
        const password = 'ThisIsAVeryLongPasswordWithNumbers123AndSymbols!@#';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });

    describe('uppercase letter validation', () => {
      it('should reject passwords without uppercase letters', () => {
        const passwords = [
          'alllowercase123!',
          'nouppercasehere1!',
          'test123!@#',
        ];

        passwords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.message).toBe('Password must contain at least one uppercase letter');
        });
      });

      it('should accept passwords with one uppercase letter', () => {
        const password = 'Aestpass123!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });

      it('should accept passwords with multiple uppercase letters', () => {
        const password = 'TestPASS123!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });

    describe('lowercase letter validation', () => {
      it('should reject passwords without lowercase letters', () => {
        const passwords = [
          'ALLUPPERCASE123!',
          'NOLOWERCASEHERE1!',
          'TEST123!@#',
        ];

        passwords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.message).toBe('Password must contain at least one lowercase letter');
        });
      });

      it('should accept passwords with one lowercase letter', () => {
        const password = 'TESTpASS123!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });

      it('should accept passwords with multiple lowercase letters', () => {
        const password = 'TestPassword123!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });

    describe('number validation', () => {
      it('should reject passwords without numbers', () => {
        const passwords = [
          'TestPassword!',
          'NoNumbersHere!@#',
          'JustLettersAndSymbols!',
        ];

        passwords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.message).toBe('Password must contain at least one number');
        });
      });

      it('should accept passwords with one number', () => {
        const password = 'TestPassword1!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });

      it('should accept passwords with multiple numbers', () => {
        const password = 'TestPassword12345!';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });

    describe('special character validation', () => {
      it('should reject passwords without special characters', () => {
        const passwords = [
          'TestPassword123',
          'NoSpecialChars456',
          'JustLettersAndNumbers789',
        ];

        passwords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.message).toBe('Password must contain at least one special character');
        });
      });

      it('should accept passwords with various special characters', () => {
        const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?'.split('');

        specialChars.forEach(char => {
          const password = `TestPassword123${char}`;
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(true);
          expect(result.message).toBeUndefined();
        });
      });

      it('should accept passwords with multiple special characters', () => {
        const password = 'TestPassword123!@#$%';
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });

    describe('comprehensive validation', () => {
      it('should validate a strong password meeting all requirements', () => {
        const strongPasswords = [
          'StrongPass123!',
          'MySecure@Pass456',
          'Complex#Password789',
          'Secure$Phrase2024',
        ];

        strongPasswords.forEach(password => {
          const result = validatePasswordStrength(password);
          expect(result.isValid).toBe(true);
          expect(result.message).toBeUndefined();
        });
      });

      it('should return first validation failure in order of checks', () => {
        // Test that validation checks happen in order: length, uppercase, lowercase, number, symbol

        // 1. Length check fails first
        const tooShort = 'Ab1!';
        const shortResult = validatePasswordStrength(tooShort);
        expect(shortResult.isValid).toBe(false);
        expect(shortResult.message).toContain('at least 6 characters');

        // 2. With length OK, uppercase fails next
        const noUpper = 'testpass123!';
        const noUpperResult = validatePasswordStrength(noUpper);
        expect(noUpperResult.isValid).toBe(false);
        expect(noUpperResult.message).toContain('uppercase letter');

        // 3. With length + uppercase, lowercase fails next
        const noLower = 'TESTPASS123!';
        const noLowerResult = validatePasswordStrength(noLower);
        expect(noLowerResult.isValid).toBe(false);
        expect(noLowerResult.message).toContain('lowercase letter');

        // 4. With length + uppercase + lowercase, number fails next
        const noNumber = 'TestPassword!';
        const noNumberResult = validatePasswordStrength(noNumber);
        expect(noNumberResult.isValid).toBe(false);
        expect(noNumberResult.message).toContain('number');

        // 5. With length + uppercase + lowercase + number, symbol fails last
        const noSymbol = 'TestPassword123';
        const noSymbolResult = validatePasswordStrength(noSymbol);
        expect(noSymbolResult.isValid).toBe(false);
        expect(noSymbolResult.message).toContain('special character');
      });

      it('should validate edge case passwords', () => {
        // Minimum valid password
        const minValid = 'Abc12!';
        expect(validatePasswordStrength(minValid).isValid).toBe(true);

        // Password with Unicode characters (should fail - only ASCII special chars allowed)
        const unicode = 'TestPassword123é';
        const unicodeResult = validatePasswordStrength(unicode);
        expect(unicodeResult.isValid).toBe(false);
        expect(unicodeResult.message).toContain('special character');

        // Password with spaces is valid as long as it has a special character
        const withSpaces = 'Test Pass123!';
        const spacesResult = validatePasswordStrength(withSpaces);
        expect(spacesResult.isValid).toBe(true); // Valid because it has !

        // Password with spaces but no special character should fail
        const spacesNoSpecial = 'Test Pass123';
        const spacesNoSpecialResult = validatePasswordStrength(spacesNoSpecial);
        expect(spacesNoSpecialResult.isValid).toBe(false);
        expect(spacesNoSpecialResult.message).toContain('special character');
      });

      it('should handle empty string', () => {
        const result = validatePasswordStrength('');
        expect(result.isValid).toBe(false);
        expect(result.message).toBe('Password must be at least 6 characters long');
      });

      it('should validate generated passwords consistently', () => {
        // Generate 20 passwords and validate them all
        for (let i = 0; i < 20; i++) {
          const generated = generateSecurePassword();
          const result = validatePasswordStrength(generated);
          expect(result.isValid).toBe(true);
          expect(result.message).toBeUndefined();
        }
      });
    });
  });

  describe('integration: generateSecurePassword + validatePasswordStrength', () => {
    it('should generate passwords that always pass validation', () => {
      const lengths = [6, 8, 10, 12, 16, 20, 32, 64];

      lengths.forEach(length => {
        const password = generateSecurePassword(length);
        const validation = validatePasswordStrength(password);

        expect(validation.isValid).toBe(true);
        expect(validation.message).toBeUndefined();
        expect(password).toHaveLength(length);
      });
    });

    it('should generate 1000 valid passwords without failure', () => {
      // Stress test: generate many passwords and ensure all are valid
      const iterations = 1000;
      let allValid = true;
      const failedPasswords: string[] = [];

      for (let i = 0; i < iterations; i++) {
        const password = generateSecurePassword();
        const result = validatePasswordStrength(password);

        if (!result.isValid) {
          allValid = false;
          failedPasswords.push(password);
        }
      }

      expect(allValid).toBe(true);
      expect(failedPasswords).toHaveLength(0);
    });
  });
});
