import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { pinoLogger } from '../utils/logger';

// Create reusable transporter using SMTP configuration
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  };

  // Log configuration (without sensitive data)
  pinoLogger.info(
    {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.auth.user ? 'configured' : 'missing',
    },
    '[EmailService] Transporter configuration'
  );

  return nodemailer.createTransport(config);
};

// Email templates
export const emailTemplates = {
  welcome: (username: string, tempPassword: string) => ({
    subject: 'Welcome to GKCHATTY - Account Created',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to GKCHATTY</h2>
        <p>Hello ${username},</p>
        <p>An administrator has created an account for you on GKCHATTY.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0;">Login Details:</h3>
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Temporary Password:</strong> <code style="background-color: #e0e0e0; padding: 2px 5px; border-radius: 3px;">${tempPassword}</code></p>
          <p><strong>Login URL:</strong> <a href="https://apps.gkchatty.com/auth">https://apps.gkchatty.com/auth</a></p>
        </div>
        
        <p style="color: #d32f2f; font-weight: bold;">Important: You will be required to change your password upon first login.</p>
        
        <p>If you have any questions or did not expect this account creation, please contact your administrator immediately.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from GKCHATTY. Please do not reply to this email.</p>
      </div>
    `,
    text: `
Welcome to GKCHATTY

Hello ${username},

An administrator has created an account for you on GKCHATTY.

Login Details:
- Username: ${username}
- Temporary Password: ${tempPassword}
- Login URL: https://apps.gkchatty.com/auth

Important: You will be required to change your password upon first login.

If you have any questions or did not expect this account creation, please contact your administrator immediately.

Best regards,
GKCHATTY Team
    `.trim(),
  }),
};

// Send email function
export async function sendEmail(options: Mail.Options): Promise<boolean> {
  try {
    // Check if email configuration is available
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      pinoLogger.error('[EmailService] Email configuration missing. Check environment variables.');
      return false;
    }

    const transporter = createTransporter();

    // Set default from address if not provided
    if (!options.from) {
      options.from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    }

    pinoLogger.info(
      {
        to: options.to,
        subject: options.subject,
        from: options.from,
      },
      '[EmailService] Sending email'
    );

    const info = await transporter.sendMail(options);

    pinoLogger.info(
      {
        messageId: info.messageId,
        response: info.response,
      },
      '[EmailService] Email sent successfully'
    );

    return true;
  } catch (error) {
    pinoLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        to: options.to,
        subject: options.subject,
      },
      '[EmailService] Failed to send email'
    );
    return false;
  }
}

// Send welcome email with temporary password
export async function sendWelcomeEmail(
  email: string,
  username: string,
  tempPassword: string
): Promise<boolean> {
  const template = emailTemplates.welcome(username, tempPassword);

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
