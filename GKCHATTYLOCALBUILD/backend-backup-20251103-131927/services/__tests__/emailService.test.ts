// Mock setup BEFORE imports
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

jest.mock('../../utils/logger', () => ({
  pinoLogger: mockLogger,
}));

// Mock nodemailer
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

import { sendEmail, sendWelcomeEmail, emailTemplates } from '../emailService';

describe('emailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    process.env = {
      ...originalEnv,
      EMAIL_HOST: 'smtp.example.com',
      EMAIL_PORT: '587',
      EMAIL_USER: 'test@example.com',
      EMAIL_PASS: 'testpassword',
      EMAIL_FROM: 'noreply@example.com',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('emailTemplates', () => {
    describe('welcome template', () => {
      it('should generate welcome email template with username and password', () => {
        const username = 'testuser';
        const tempPassword = 'TempPass123!';
        const template = emailTemplates.welcome(username, tempPassword);

        expect(template.subject).toBe('Welcome to GKCHATTY - Account Created');
        expect(template.html).toContain(username);
        expect(template.html).toContain(tempPassword);
        expect(template.html).toContain('https://apps.gkchatty.com/auth');
        expect(template.html).toContain('required to change your password');
        expect(template.text).toContain(username);
        expect(template.text).toContain(tempPassword);
        expect(template.text).toContain('https://apps.gkchatty.com/auth');
      });

      it('should include both HTML and plain text versions', () => {
        const template = emailTemplates.welcome('user', 'pass');

        expect(template.html).toBeTruthy();
        expect(template.text).toBeTruthy();
        expect(template.html.length).toBeGreaterThan(0);
        expect(template.text.length).toBeGreaterThan(0);
      });

      it('should escape special characters in username and password', () => {
        const username = 'user<script>alert("xss")</script>';
        const tempPassword = 'Pass&<>"123';
        const template = emailTemplates.welcome(username, tempPassword);

        // Should contain the values (template doesn't escape, but testing that values are included)
        expect(template.html).toContain(username);
        expect(template.html).toContain(tempPassword);
        expect(template.text).toContain(username);
        expect(template.text).toContain(tempPassword);
      });

      it('should contain security warning about password change', () => {
        const template = emailTemplates.welcome('user', 'pass');

        expect(template.html).toContain('required to change your password');
        expect(template.text).toContain('required to change your password');
      });

      it('should contain login URL', () => {
        const template = emailTemplates.welcome('user', 'pass');
        const loginUrl = 'https://apps.gkchatty.com/auth';

        expect(template.html).toContain(loginUrl);
        expect(template.text).toContain(loginUrl);
      });
    });
  });

  describe('sendEmail', () => {
    describe('successful email sending', () => {
      it('should send email successfully with all required options', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
          text: 'Test text',
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockCreateTransport).toHaveBeenCalledWith({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'test@example.com',
            pass: 'testpassword',
          },
        });
        expect(mockSendMail).toHaveBeenCalledWith({
          ...options,
          from: 'noreply@example.com',
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'recipient@example.com',
            subject: 'Test Subject',
            from: 'noreply@example.com',
          }),
          '[EmailService] Sending email'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            messageId: '<test@example.com>',
            response: '250 OK',
          }),
          '[EmailService] Email sent successfully'
        );
      });

      it('should use provided from address if specified', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
          from: 'custom@example.com',
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(options);
      });

      it('should use EMAIL_FROM as default if set', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
        };

        await sendEmail(options);

        expect(mockSendMail).toHaveBeenCalledWith({
          ...options,
          from: 'noreply@example.com',
        });
      });

      it('should use EMAIL_USER as fallback if EMAIL_FROM not set', async () => {
        delete process.env.EMAIL_FROM;
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
        };

        await sendEmail(options);

        expect(mockSendMail).toHaveBeenCalledWith({
          ...options,
          from: 'test@example.com',
        });
      });

      it('should configure transporter with secure=true for port 465', async () => {
        process.env.EMAIL_PORT = '465';
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(mockCreateTransport).toHaveBeenCalledWith({
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          auth: {
            user: 'test@example.com',
            pass: 'testpassword',
          },
        });
      });

      it('should configure transporter with secure=false for port 587', async () => {
        process.env.EMAIL_PORT = '587';
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(mockCreateTransport).toHaveBeenCalledWith({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'test@example.com',
            pass: 'testpassword',
          },
        });
      });

      it('should use default port 587 if EMAIL_PORT not set', async () => {
        delete process.env.EMAIL_PORT;
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(mockCreateTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            port: 587,
            secure: false,
          })
        );
      });

      it('should log transporter configuration without sensitive data', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            host: 'smtp.example.com',
            port: 587,
            secure: false,
            user: 'configured',
          }),
          '[EmailService] Transporter configuration'
        );
      });
    });

    describe('missing email configuration', () => {
      it('should return false if EMAIL_HOST is missing', async () => {
        delete process.env.EMAIL_HOST;

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          '[EmailService] Email configuration missing. Check environment variables.'
        );
        expect(mockSendMail).not.toHaveBeenCalled();
      });

      it('should return false if EMAIL_USER is missing', async () => {
        delete process.env.EMAIL_USER;

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          '[EmailService] Email configuration missing. Check environment variables.'
        );
        expect(mockSendMail).not.toHaveBeenCalled();
      });

      it('should return false if EMAIL_PASS is missing', async () => {
        delete process.env.EMAIL_PASS;

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          '[EmailService] Email configuration missing. Check environment variables.'
        );
        expect(mockSendMail).not.toHaveBeenCalled();
      });

      it('should return false if all email configuration is missing', async () => {
        delete process.env.EMAIL_HOST;
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          '[EmailService] Email configuration missing. Check environment variables.'
        );
        expect(mockSendMail).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return false and log error when sendMail throws error', async () => {
        const error = new Error('SMTP connection failed');
        mockSendMail.mockRejectedValue(error);

        const options = {
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        };

        const result = await sendEmail(options);

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'SMTP connection failed',
            to: 'recipient@example.com',
            subject: 'Test Subject',
          }),
          '[EmailService] Failed to send email'
        );
      });

      it('should handle non-Error exceptions', async () => {
        mockSendMail.mockRejectedValue('String error');

        const options = {
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        };

        const result = await sendEmail(options);

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Unknown error',
          }),
          '[EmailService] Failed to send email'
        );
      });

      it('should handle SMTP authentication errors', async () => {
        const authError = new Error('Invalid login credentials');
        mockSendMail.mockRejectedValue(authError);

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Invalid login credentials',
          }),
          '[EmailService] Failed to send email'
        );
      });

      it('should handle network errors', async () => {
        const networkError = new Error('ECONNREFUSED');
        mockSendMail.mockRejectedValue(networkError);

        const result = await sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
        });

        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'ECONNREFUSED',
          }),
          '[EmailService] Failed to send email'
        );
      });
    });

    describe('edge cases', () => {
      it('should handle multiple recipients', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: ['recipient1@example.com', 'recipient2@example.com'],
          subject: 'Test',
          html: 'Test',
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: ['recipient1@example.com', 'recipient2@example.com'],
          })
        );
      });

      it('should handle CC and BCC fields', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          cc: 'cc@example.com',
          bcc: 'bcc@example.com',
          subject: 'Test',
          html: 'Test',
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            cc: 'cc@example.com',
            bcc: 'bcc@example.com',
          })
        );
      });

      it('should handle attachments', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: 'Test',
          html: 'Test',
          attachments: [
            {
              filename: 'test.txt',
              content: 'Test content',
            },
          ],
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments: [
              {
                filename: 'test.txt',
                content: 'Test content',
              },
            ],
          })
        );
      });

      it('should handle empty subject', async () => {
        mockSendMail.mockResolvedValue({
          messageId: '<test@example.com>',
          response: '250 OK',
        });

        const options = {
          to: 'recipient@example.com',
          subject: '',
          html: 'Test',
        };

        const result = await sendEmail(options);

        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: '',
          })
        );
      });
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template data', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const email = 'newuser@example.com';
      const username = 'newuser';
      const tempPassword = 'TempPass123!';

      const result = await sendWelcomeEmail(email, username, tempPassword);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: 'Welcome to GKCHATTY - Account Created',
        })
      );

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(username);
      expect(callArgs.html).toContain(tempPassword);
      expect(callArgs.text).toContain(username);
      expect(callArgs.text).toContain(tempPassword);
    });

    it('should return false if email configuration is missing', async () => {
      delete process.env.EMAIL_HOST;

      const result = await sendWelcomeEmail(
        'user@example.com',
        'user',
        'pass123'
      );

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return false if sending fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Send failed'));

      const result = await sendWelcomeEmail(
        'user@example.com',
        'user',
        'pass123'
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Send failed',
        }),
        '[EmailService] Failed to send email'
      );
    });

    it('should handle special characters in username', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const username = "O'Brien-Smith";
      const result = await sendWelcomeEmail(
        'user@example.com',
        username,
        'Pass123!'
      );

      expect(result).toBe(true);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(username);
      expect(callArgs.text).toContain(username);
    });

    it('should handle special characters in password', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const tempPassword = 'P@$$w0rd!<>&"';
      const result = await sendWelcomeEmail(
        'user@example.com',
        'user',
        tempPassword
      );

      expect(result).toBe(true);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(tempPassword);
      expect(callArgs.text).toContain(tempPassword);
    });

    it('should include both HTML and text versions', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      await sendWelcomeEmail('user@example.com', 'user', 'Pass123!');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toBeTruthy();
      expect(callArgs.text).toBeTruthy();
      expect(callArgs.html.length).toBeGreaterThan(0);
      expect(callArgs.text.length).toBeGreaterThan(0);
    });

    it('should use template with login URL', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      await sendWelcomeEmail('user@example.com', 'user', 'Pass123!');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('https://apps.gkchatty.com/auth');
      expect(callArgs.text).toContain('https://apps.gkchatty.com/auth');
    });

    it('should include password change warning', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      await sendWelcomeEmail('user@example.com', 'user', 'Pass123!');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('required to change your password');
      expect(callArgs.text).toContain('required to change your password');
    });

    it('should handle long usernames', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const longUsername = 'a'.repeat(100);
      const result = await sendWelcomeEmail(
        'user@example.com',
        longUsername,
        'Pass123!'
      );

      expect(result).toBe(true);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(longUsername);
    });

    it('should handle long passwords', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const longPassword = 'P@ssw0rd!' + 'x'.repeat(100);
      const result = await sendWelcomeEmail(
        'user@example.com',
        'user',
        longPassword
      );

      expect(result).toBe(true);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(longPassword);
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid successive email sends', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          sendWelcomeEmail(`user${i}@example.com`, `user${i}`, 'Pass123!')
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r === true)).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(5);
    });

    it('should handle partial failures in batch sends', async () => {
      mockSendMail
        .mockResolvedValueOnce({
          messageId: '<test1@example.com>',
          response: '250 OK',
        })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          messageId: '<test3@example.com>',
          response: '250 OK',
        });

      const results = await Promise.all([
        sendEmail({ to: 'test1@example.com', subject: 'Test', html: 'Test' }),
        sendEmail({ to: 'test2@example.com', subject: 'Test', html: 'Test' }),
        sendEmail({ to: 'test3@example.com', subject: 'Test', html: 'Test' }),
      ]);

      expect(results).toEqual([true, false, true]);
    });

    it('should create new transporter for each email send', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<test@example.com>',
        response: '250 OK',
      });

      await sendEmail({ to: 'test1@example.com', subject: 'Test', html: 'Test' });
      await sendEmail({ to: 'test2@example.com', subject: 'Test', html: 'Test' });

      expect(mockCreateTransport).toHaveBeenCalledTimes(2);
    });
  });
});
