import { getLogger } from './logger';

const log = getLogger('imageProcessor');

/**
 * Backend image processor for handling images with pre-extracted OCR text
 * The actual OCR is done on the frontend using Tesseract.js
 */

/**
 * Process image document with pre-extracted text
 * @param buffer - The image file buffer
 * @param extractedText - Text already extracted via OCR on frontend
 * @param mimeType - The MIME type of the image
 * @returns Promise resolving to the text content
 */
export const processImageWithText = async (
  buffer: Buffer,
  extractedText: string,
  mimeType: string
): Promise<string> => {
  log.debug('[ImageProcessor] Processing image with pre-extracted text');
  log.debug(`[ImageProcessor] Image type: ${mimeType}, Buffer size: ${buffer.length}`);
  log.debug(`[ImageProcessor] Extracted text length: ${extractedText?.length || 0}`);

  // If we have extracted text from frontend OCR, use it
  if (extractedText && extractedText.trim().length > 0) {
    log.debug('[ImageProcessor] Using pre-extracted OCR text from frontend');
    return extractedText.trim();
  }

  // If no text was extracted (OCR failed or no text in image)
  log.debug('[ImageProcessor] No text extracted from image');
  return '';
};

/**
 * Check if a MIME type is a supported image format
 */
export const isSupportedImageType = (mimeType: string): boolean => {
  const supportedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
  ];

  return supportedTypes.includes(mimeType);
};
