/**
 * Application-wide constants for the GKCHATTY Web Application
 * All magic numbers should be defined here with meaningful names
 */

// ============================================================================
// UI/UX TIMING
// ============================================================================

/** Delay before showing upload success message (milliseconds) */
export const UPLOAD_SUCCESS_DELAY_MS = 1000;

/** Duration to show toast notifications (milliseconds) */
export const TOAST_NOTIFICATION_DURATION_MS = 3000;

// ============================================================================
// IMAGE VALIDATION
// ============================================================================

/** Supported image MIME types for user settings */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
