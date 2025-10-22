import { createWorker, Worker } from 'tesseract.js';

// Cache worker instance for reuse
let workerInstance: Worker | null = null;

/**
 * Initialize Tesseract worker with progress callback
 */
async function initializeWorker(onProgress?: (progress: number) => void): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  console.log('[ImageProcessor] Initializing Tesseract.js worker...');

  const worker = await createWorker('eng', 1, {
    logger: m => {
      // Log progress updates
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
      console.log(`[Tesseract] ${m.status}: ${Math.round(m.progress * 100)}%`);
    },
  });

  workerInstance = worker;
  return worker;
}

/**
 * Extract text from image using Tesseract.js OCR
 * @param imageFile - The image file to process
 * @param onProgress - Optional progress callback (0-1)
 * @returns Promise resolving to extracted text
 */
export async function extractTextFromImage(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<{ text: string; confidence: number }> {
  console.log(`[ImageProcessor] Starting OCR for image: ${imageFile.name}`);

  try {
    // Initialize worker
    const worker = await initializeWorker(onProgress);

    // Convert File to data URL for Tesseract
    const imageDataUrl = await fileToDataUrl(imageFile);

    // Perform OCR
    console.log('[ImageProcessor] Running OCR...');
    const { data } = await worker.recognize(imageDataUrl);

    const extractedText = data.text.trim();
    const confidence = data.confidence;

    console.log(
      `[ImageProcessor] OCR complete. Confidence: ${confidence}%, Text length: ${extractedText.length}`
    );

    // Don't terminate worker - keep it for reuse
    // await worker.terminate();

    return {
      text: extractedText,
      confidence,
    };
  } catch (error) {
    console.error('[ImageProcessor] OCR error:', error);
    throw new Error(
      `Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert File to data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      if (e.target?.result && typeof e.target.result === 'string') {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Preprocess image for better OCR results (optional enhancement)
 * This is a placeholder for future image preprocessing
 */
export async function preprocessImage(imageFile: File): Promise<File> {
  // Future enhancement: Add image preprocessing
  // - Convert to grayscale
  // - Adjust contrast
  // - Remove noise
  // - Deskew
  return imageFile;
}

/**
 * Clean up Tesseract worker
 */
export async function cleanupImageProcessor(): Promise<void> {
  if (workerInstance) {
    console.log('[ImageProcessor] Terminating Tesseract worker...');
    await workerInstance.terminate();
    workerInstance = null;
  }
}

/**
 * Check if file is a supported image type
 */
export function isSupportedImageType(file: File): boolean {
  const supportedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
  ];

  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

  return supportedTypes.includes(file.type) || supportedExtensions.includes(fileExtension);
}
