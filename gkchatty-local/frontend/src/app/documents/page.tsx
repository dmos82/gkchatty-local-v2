// Force Netlify redeploy (v2)
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
// import { useRouter } from 'next/navigation'; // Removing unused import
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, Upload } from 'lucide-react';
// --- START NEW IMPORT ---
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
// --- END NEW IMPORT ---
import { cn } from '@/lib/utils'; // Import cn utility for conditional classes
import { extractTextFromImage, isSupportedImageType } from '@/utils/imageProcessor';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'; // Use ESM import path
import 'react-pdf/dist/esm/Page/TextLayer.css'; // Use ESM import path
// --- START: Added Loader2 Import ---
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic'; // <-- ADD DYNAMIC IMPORT
// --- END: Added Loader2 Import ---
import { getApiBaseUrl } from '@/lib/config'; // <-- Import dynamic API URL function
import { fetchWithAuth } from '@/lib/fetchWithAuth'; // <-- Import fetchWithAuth
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserDocsSettings from '@/components/settings/UserDocsSettings';
import PersonaList from '@/components/admin/PersonaList'; // Import the new PersonaList component
import FileTreeManager from '@/components/admin/FileTreeManager'; // Import FileTreeManager

// Type declaration for navigator.connection
interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
  }
}

// --- START: Add console logging prefix ---
const logPrefix = '[DocumentManagerPage]';
// --- END: Add console logging prefix ---

// --- START: DYNAMICALLY IMPORT BRANDED PDF VIEWER ---
const BrandedPdfViewer = dynamic(
  () => import('@/components/BrandedPdfViewer').then(mod => mod.default),
  {
    loading: () => (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-4 text-neutral-600">Loading PDF viewer...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
);
// --- END: DYNAMICALLY IMPORT BRANDED PDF VIEWER ---

// Define type for user documents (adjust based on actual API response)
interface UserDocument {
  _id: string;
  originalFileName: string;
  status: string;
  createdAt: string;
  uploadTimestamp?: string; // Optional, based on API response
  mimeType?: string; // Added for PDF viewer check
  fileName?: string; // Added for potential use
  sourceType?: 'user' | 'system'; // Added to distinguish between user and system documents
  fileSize?: number; // Optional size
}

export default function DocumentManagerPage() {
  // --- START: Add log on mount ---
  console.log(`${logPrefix} Component Mounted`);
  // --- END: Add log on mount ---
  const { user, isLoading: isAuthLoading, handleApiError } = useAuth();
  // const router = useRouter(); // Removing unused variable
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- NEW --- Upload State
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // For potential progress tracking
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

  // --- START NEW STATE ---
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  // --- END NEW STATE ---

  // --- START NEW STATE for Drag & Drop ---
  const [isDragging, setIsDragging] = useState(false);
  // --- END NEW STATE for Drag & Drop ---

  // --- START: PDF Viewer State (MODIFIED FOR DYNAMIC IMPORT) --- <--- MODIFIED
  const [isPdfViewerModalOpen, setIsPdfViewerModalOpen] = useState<boolean>(false); // Added state for modal visibility
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // State for the object URL
  // const [viewingDocId, setViewingDocId] = useState<string | null>(null); // No longer needed, using pdfUrl
  const [viewingDocName, setViewingDocName] = useState<string>(''); // State for modal title
  // Removing unused variables to fix linter errors
  // const [pdfLoadLoading, setPdfLoadLoading] = useState<boolean>(false); // Track loading state for the specific fetch
  // const [pdfLoadError, setPdfLoadError] = useState<string | null>(null); // Track loading error
  // numPages is managed within PdfViewerModal
  // --- END: PDF Viewer State ---

  // --- START: Image Viewer State ---
  const [isImageViewerModalOpen, setIsImageViewerModalOpen] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');
  // --- END: Image Viewer State ---

  // No longer needed - direct check is used in the TabsTrigger

  // PersonaList component has built-in create and edit functionality
  // No custom handlers needed - let PersonaList handle its own UI

  // --- NEW --- Function to fetch documents (memoized)
  const fetchDocuments = useCallback(async () => {
    // --- START: Add fetch initiation log ---
    console.log(`${logPrefix} fetchDocuments called. User available: ${!!user}`);
    // --- END: Add fetch initiation log ---
    if (!user) return;

    setLoadingDocs(true);
    // --- START: Log state update ---
    console.log(`${logPrefix} Set loadingDocs = true`);
    // --- END: Log state update ---
    setError(null);
    // --- START: Log state update ---
    console.log(`${logPrefix} Set error = null`);
    // --- END: Log state update ---
    console.log(`${logPrefix} Fetching user documents from /api/documents`);

    try {
      const response = await fetchWithAuth('/api/documents', {
        method: 'GET',
      });
      // --- START: Log response status ---
      console.log(`${logPrefix} API response status: ${response.status}`);
      // --- END: Log response status ---

      if (!response.ok) {
        let errorMsg = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
          // --- START: Log API error data ---
          console.error(`${logPrefix} API error response data:`, errorData);
          // --- END: Log API error data ---
        } catch {
          /* Ignore if response body is not JSON */
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      // --- START: Log raw API data ---
      console.log(`${logPrefix} Raw API response data:`, data);
      // --- END: Log raw API data ---
      if (data.success && Array.isArray(data.documents)) {
        console.log(`${logPrefix} Fetched ${data.documents.length} documents successfully.`);
        setDocuments(data.documents);
        // --- START: Log state update ---
        console.log(`${logPrefix} Set documents state with ${data.documents.length} items.`);
        // --- END: Log state update ---
      } else {
        console.error(`${logPrefix} Invalid data format received:`, data);
        setError('Failed to load documents (Invalid format).');
        // --- START: Log state update ---
        console.log(`${logPrefix} Set error state: Invalid format.`);
        // --- END: Log state update ---
        setDocuments([]);
        // --- START: Log state update ---
        console.log(`${logPrefix} Set documents state to empty array.`);
        // --- END: Log state update ---
      }
    } catch (err) {
      console.error(`${logPrefix} Fetch Error caught:`, err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      // --- START: Log state update ---
      console.log(
        `${logPrefix} Set error state: ${err instanceof Error ? err.message : 'An unknown error occurred.'}`
      );
      // --- END: Log state update ---
      setDocuments([]);
      // --- START: Log state update ---
      console.log(`${logPrefix} Set documents state to empty array (in catch block).`);
      // --- END: Log state update ---
    } finally {
      setLoadingDocs(false);
      // --- START: Log state update ---
      console.log(`${logPrefix} Set loadingDocs = false (in finally block).`);
      // --- END: Log state update ---
    }
  }, [user, handleApiError]);

  // Fetch User Documents Effect (using useCallback version)
  useEffect(() => {
    // --- START: Log useEffect trigger ---
    console.log(
      `${logPrefix} useEffect for fetching documents triggered. User available: ${!!user}, Auth Loading: ${isAuthLoading}`
    );
    // --- END: Log useEffect trigger ---
    if (user && !isAuthLoading) {
      // Ensure auth is not loading AND user exists
      console.log(`${logPrefix} Calling fetchDocuments from useEffect.`);
      fetchDocuments();
    } else {
      console.log(
        `${logPrefix} Skipping fetchDocuments call (User: ${!!user}, Auth Loading: ${isAuthLoading}).`
      );
    }
    // Ensure dependencies are correct: fetchDocuments is memoized, user and isAuthLoading control the trigger
  }, [user, isAuthLoading, fetchDocuments]);

  // --- Modified File Validation Logic (can be reused) ---
  const validateFiles = (files: FileList): boolean => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      // Image types
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/tiff',
      // Audio types
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      'audio/webm',
      // Video types
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/x-flv',
      'video/webm',
      'video/x-matroska',
      'video/x-m4v',
    ];

    const allowedExtensions = [
      '.pdf',
      '.txt',
      '.xlsx',
      '.xls',
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.tiff',
      '.tif',
      '.mp3',
      '.wav',
      '.m4a',
      '.aac',
      '.ogg',
      '.flac',
      '.webm',
    ];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fileExtension = '.' + f.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(f.type) && !allowedExtensions.includes(fileExtension)) {
        setUploadError(
          `Invalid file type: ${f.name}. PDF, TXT, Excel, image, and audio files (MP3, WAV, M4A, etc.) are allowed.`
        );
        setSelectedFiles(null);
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        return false;
      }

      // Different size limits based on file type
      let maxSize = 10 * 1024 * 1024; // Default 10MB
      if (fileExtension.includes('xls')) {
        maxSize = 25 * 1024 * 1024; // 25MB for Excel
      } else if (f.type.startsWith('image/')) {
        maxSize = 15 * 1024 * 1024; // 15MB for images
      } else if (f.type.startsWith('audio/')) {
        maxSize = 25 * 1024 * 1024; // 25MB for audio files (OpenAI Whisper limit)
      }

      if (f.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        setUploadError(`File too large: ${f.name}. Max size is ${maxSizeMB}MB.`);
        setSelectedFiles(null);
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        return false;
      }
    }
    setUploadError(null); // Clear previous errors if validation passes
    return true;
  };

  // --- File selection handler (from input) ---
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      if (validateFiles(files)) {
        setSelectedFiles(files);
        // Automatically trigger upload after valid file selection
        setTimeout(() => {
          const validFiles = event.target.files;
          if (validFiles && validFiles.length > 0) {
            // Create a copy of the FileList to use in upload
            const filesToUpload = validFiles;
            setSelectedFiles(filesToUpload);
            // Call upload function automatically
            uploadFiles(filesToUpload);
          }
        }, 0);
      }
    } else {
      setSelectedFiles(null); // Clear selection if no files chosen
    }
  };

  // --- START: Drag & Drop Handlers ---
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if the dragged items are files
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Necessary to allow drop
    // You could add more visual feedback here if needed
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      console.log(`[handleDrop] ${files.length} file(s) dropped.`);
      if (validateFiles(files)) {
        setSelectedFiles(files);
        // Automatically trigger upload after valid file drop
        uploadFiles(files);
      }
      // Clear the dataTransfer buffer
      if (e.dataTransfer.items) {
        e.dataTransfer.items.clear();
      } else {
        e.dataTransfer.clearData();
      }
    }
  };
  // --- END: Drag & Drop Handlers ---

  // --- Helper function to handle upload ---
  const uploadFiles = async (files: FileList) => {
    // Add version string at the beginning
    console.log(
      `[GKCHATTY-PAGE-UPLOAD] Version: dd55c40-CONSOLE-PRESERVED-ENHANCED-DIAGNOSTICS - Initializing upload for ${files.length} files.`
    );

    if (!files || files.length === 0) {
      setUploadError('Please select one or more files to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0); // Reset progress
    setUploadError(null);

    // Pre-upload logging
    console.log(`[GKCHATTY-PAGE-UPLOAD] Starting direct-to-S3 upload flow`);
    console.log(`[GKCHATTY-PAGE-UPLOAD] Number of files: ${files.length}`);

    const processedFilesInfo = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileInfo = {
          name: file.name,
          type: file.type,
          size: file.size,
        };

        console.log(`[GKCHATTY-PAGE-UPLOAD] Processing file ${i + 1}/${files.length}:`, fileInfo);

        try {
          // Step 1: Request pre-signed URL from backend
          console.log(`[GKCHATTY-PAGE-UPLOAD] Step 1: Requesting pre-signed URL for ${file.name}`);
          const presignedResponse = await fetchWithAuth('/api/documents/get-presigned-url', {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }),
          });

          if (!presignedResponse.ok) {
            const errorData = await presignedResponse
              .json()
              .catch(() => ({ message: 'Failed to get upload URL' }));
            throw new Error(
              errorData.message || `Failed to get upload URL: ${presignedResponse.status}`
            );
          }

          const { presignedUrl, s3Key, expiresIn } = await presignedResponse.json();
          console.log(
            `[GKCHATTY-PAGE-UPLOAD] Received pre-signed URL for S3 key: ${s3Key}, expires in ${expiresIn}s`
          );

          // === ENHANCED DEBUG LOGGING ===
          console.log(`[Frontend S3 PUT DEBUG] === S3 UPLOAD DIAGNOSTICS START ===`);
          console.log(`[Frontend S3 PUT DEBUG] File details:`, {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            isFile: file instanceof File,
            isBlob: file instanceof Blob,
          });

          // Handle relative URLs for local storage mode
          let uploadUrl = presignedUrl;
          if (presignedUrl.startsWith('/')) {
            // It's a relative URL, prepend the API base URL
            const apiBaseUrl = getApiBaseUrl();
            uploadUrl = `${apiBaseUrl}${presignedUrl}`;
            console.log(`[Frontend S3 PUT DEBUG] Converting relative URL to absolute: ${uploadUrl}`);
          }

          // Parse and analyze the pre-signed URL
          try {
            const urlObj = new URL(uploadUrl);
            console.log(`[Frontend S3 PUT DEBUG] Pre-signed URL analysis:`, {
              protocol: urlObj.protocol,
              hostname: urlObj.hostname,
              pathname: urlObj.pathname,
              queryParams: {
                hasSignature: urlObj.searchParams.has('X-Amz-Signature'),
                hasCredential: urlObj.searchParams.has('X-Amz-Credential'),
                hasAlgorithm: urlObj.searchParams.has('X-Amz-Algorithm'),
                hasDate: urlObj.searchParams.has('X-Amz-Date'),
                hasExpires: urlObj.searchParams.has('X-Amz-Expires'),
                hasSignedHeaders: urlObj.searchParams.has('X-Amz-SignedHeaders'),
                signedHeaders: urlObj.searchParams.get('X-Amz-SignedHeaders'),
                algorithm: urlObj.searchParams.get('X-Amz-Algorithm'),
                expires: urlObj.searchParams.get('X-Amz-Expires'),
              },
            });

            // Validate pre-signed URL structure (only for S3 URLs, not local storage)
            if (!uploadUrl.includes('/api/files/local/')) {
              if (!urlObj.searchParams.has('X-Amz-Signature')) {
                throw new Error('Pre-signed URL missing X-Amz-Signature');
              }
              if (!urlObj.searchParams.has('X-Amz-Algorithm')) {
                throw new Error('Pre-signed URL missing X-Amz-Algorithm');
              }
            }
          } catch (urlError) {
            console.error(`[Frontend S3 PUT DEBUG] Invalid pre-signed URL format:`, urlError);
            throw new Error(
              `Invalid pre-signed URL: ${urlError instanceof Error ? urlError.message : 'Unknown error'}`
            );
          }

          // Validate file before upload
          if (!file || file.size === 0) {
            throw new Error('File is empty or invalid');
          }

          // Check for reasonable file size (100MB limit as additional safety)
          if (file.size > 100 * 1024 * 1024) {
            throw new Error(`File too large: ${file.size} bytes (max 100MB)`);
          }

          // Define headers explicitly for debugging
          const contentType = file.type || 'application/octet-stream';
          const putHeaders: Record<string, string> = {
            'Content-Type': contentType,
          };

          console.log(`[Frontend S3 PUT DEBUG] Fetch PUT request config:`, {
            method: 'PUT',
            headers: putHeaders,
            bodyType: file.constructor.name,
            bodySize: file.size,
            contentType,
            mode: 'cors',
            credentials: 'omit',
          });

          // Check network status before attempting upload
          if ('navigator' in window && 'onLine' in navigator) {
            console.log(
              `[Frontend S3 PUT DEBUG] Network status: ${navigator.onLine ? 'Online' : 'Offline'}`
            );
            if (!navigator.onLine) {
              throw new Error('Network is offline');
            }
          }

          // Step 2: Upload file directly to S3 using the pre-signed URL
          console.log(`[GKCHATTY-PAGE-UPLOAD] Step 2: Uploading ${file.name} directly to S3`);

          let s3UploadResponse: Response;
          try {
            // === SIMPLIFIED S3 PUT REQUEST ===
            console.log(`[SIMPLIFIED_S3_PUT] Attempting minimal S3 PUT with strict parameters`);

            s3UploadResponse = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': contentType,
                // Explicitly only include Content-Type - no other headers
              },
              body: file,
              // Use minimal fetch options
              mode: 'cors',
              credentials: uploadUrl.includes('localhost') || uploadUrl.includes('/api/files/local/') ? 'include' : 'omit',
              // Add explicit fetch options that might help with reliability
              cache: 'no-cache',
              redirect: 'manual', // Don't follow redirects automatically
            });

            console.log(`[SIMPLIFIED_S3_PUT] Response received:`, {
              status: s3UploadResponse.status,
              statusText: s3UploadResponse.statusText,
              ok: s3UploadResponse.ok,
              type: s3UploadResponse.type,
              url: s3UploadResponse.url,
            });
          } catch (fetchError) {
            // Network-level error occurred
            console.error(`[Frontend S3 PUT DEBUG] Fetch failed with network error:`, fetchError);

            if (fetchError instanceof TypeError) {
              console.error(`[Frontend S3 PUT DEBUG] TypeError details:`, {
                message: fetchError.message,
                stack: fetchError.stack,
                name: fetchError.name,
              });
            }

            // Try to get more network information
            if ('navigator' in window && 'connection' in navigator) {
              const conn = (navigator as Navigator).connection;
              console.log(`[Frontend S3 PUT DEBUG] Network connection info:`, {
                effectiveType: conn?.effectiveType,
                downlink: conn?.downlink,
                rtt: conn?.rtt,
                saveData: conn?.saveData,
              });
            }

            // Try a simplified test to see if basic fetch works
            try {
              console.log(`[Frontend S3 PUT DEBUG] Testing basic connectivity to S3 hostname...`);
              const urlObj = new URL(uploadUrl);
              const testResponse = await fetch(`${urlObj.protocol}//${urlObj.hostname}/`, {
                method: 'HEAD',
                mode: 'cors',
                credentials: 'omit',
              });
              console.log(`[Frontend S3 PUT DEBUG] Basic S3 HEAD test:`, {
                status: testResponse.status,
                ok: testResponse.ok,
              });
            } catch (testError) {
              console.error(
                `[Frontend S3 PUT DEBUG] Basic S3 connectivity test also failed:`,
                testError
              );
            }

            console.log(`[Frontend S3 PUT DEBUG] === S3 UPLOAD DIAGNOSTICS END (FAILED) ===`);
            throw new Error(
              `Network error during S3 upload: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
            );
          }

          console.log(
            `[GKCHATTY-PAGE-UPLOAD] S3 upload response status: ${s3UploadResponse.status}`
          );
          console.log(
            `[Frontend S3 PUT DEBUG] S3 response headers:`,
            Object.fromEntries(s3UploadResponse.headers.entries())
          );

          // Enhanced response debugging
          console.log(`[Frontend S3 PUT DEBUG] Full S3 response details:`, {
            status: s3UploadResponse.status,
            statusText: s3UploadResponse.statusText,
            ok: s3UploadResponse.ok,
            type: s3UploadResponse.type,
            url: s3UploadResponse.url,
            redirected: s3UploadResponse.redirected,
            headers: Object.fromEntries(s3UploadResponse.headers.entries()),
          });

          if (!s3UploadResponse.ok) {
            // S3 errors might return XML, so try to get text response
            let errorText = 'No error text available';
            try {
              errorText = await s3UploadResponse.text();
              console.error(`[GKCHATTY-PAGE-UPLOAD] S3 error response body:`, errorText);
            } catch (textError) {
              console.error(`[GKCHATTY-PAGE-UPLOAD] Could not read S3 error response:`, textError);
            }

            console.log(`[Frontend S3 PUT DEBUG] === S3 UPLOAD DIAGNOSTICS END (HTTP ERROR) ===`);
            throw new Error(
              `S3 upload failed: ${s3UploadResponse.status} ${s3UploadResponse.statusText} - ${errorText}`
            );
          }

          console.log(`[GKCHATTY-PAGE-UPLOAD] Successfully uploaded ${file.name} to S3`);
          console.log(`[Frontend S3 PUT DEBUG] === S3 UPLOAD DIAGNOSTICS END (SUCCESS) ===`);

          // Step 2.5: For images, perform OCR before notifying backend
          let extractedText = '';
          if (isSupportedImageType(file)) {
            console.log(`[GKCHATTY-PAGE-UPLOAD] Image detected, performing OCR for ${file.name}`);
            try {
              const ocrResult = await extractTextFromImage(file, progress => {
                console.log(`[OCR Progress] ${file.name}: ${Math.round(progress * 100)}%`);
              });
              extractedText = ocrResult.text;
              console.log(
                `[GKCHATTY-PAGE-UPLOAD] OCR complete. Confidence: ${ocrResult.confidence}%, Text length: ${extractedText.length}`
              );

              if (extractedText.length === 0) {
                console.warn(`[GKCHATTY-PAGE-UPLOAD] No text extracted from image ${file.name}`);
              }
            } catch (ocrError) {
              console.error(`[GKCHATTY-PAGE-UPLOAD] OCR failed for ${file.name}:`, ocrError);
              // Continue with upload even if OCR fails
            }
          }

          // Step 3: Notify backend for post-processing
          console.log(`[GKCHATTY-PAGE-UPLOAD] Step 3: Notifying backend for post-processing`);
          const processResponse = await fetchWithAuth('/api/documents/process-uploaded-file', {
            method: 'POST',
            body: JSON.stringify({
              s3Key,
              originalFileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              extractedText: extractedText, // Include OCR text if available
            }),
          });

          if (!processResponse.ok) {
            const errorData = await processResponse
              .json()
              .catch(() => ({ message: 'Failed to process uploaded file' }));
            throw new Error(
              errorData.message || `Failed to process uploaded file: ${processResponse.status}`
            );
          }

          const processResult = await processResponse.json();
          console.log(`[GKCHATTY-PAGE-UPLOAD] Backend processing initiated:`, processResult);

          successCount++;
          processedFilesInfo.push({
            fileName: file.name,
            status: 'success',
            message: processResult.message || 'Processing started',
          });
        } catch (fileError) {
          console.error(`[GKCHATTY-PAGE-UPLOAD] Error uploading ${file.name}:`, fileError);
          errorCount++;
          processedFilesInfo.push({
            fileName: file.name,
            status: 'error',
            message: fileError instanceof Error ? fileError.message : 'Upload failed',
          });
        }

        // Update progress (rough approximation)
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      // Display results
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: 'Upload Successful',
          description: `${successCount} file(s) uploaded successfully.`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: 'Partial Success',
          description: `${successCount} file(s) uploaded, ${errorCount} failed.`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Upload Failed',
          description: 'All files failed to upload.',
          variant: 'destructive',
        });
      }

      if (successCount > 0) {
        setSelectedFiles(null); // Clear selection
        if (fileInputRef.current) fileInputRef.current.value = ''; // Clear file input
        fetchDocuments(); // Refresh the document list
      }
    } catch (err) {
      console.error(`[GKCHATTY-PAGE-UPLOAD] Unexpected error during upload:`, err);
      const errorMsg = err instanceof Error ? err.message : 'An unknown upload error occurred.';
      setUploadError(errorMsg);
      toast({ title: 'Upload Failed', description: errorMsg, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      console.log(
        `[GKCHATTY-PAGE-UPLOAD] Upload process completed. Success: ${successCount}, Errors: ${errorCount}`
      );
    }
  };

  // Remove unused handleUpload function
  // const handleUpload = async () => {
  //   if (selectedFiles) {
  //     await uploadFiles(selectedFiles);
  //   }
  // };

  // --- NEW --- Delete handler
  const handleDeleteDocument = async (docId: string) => {
    if (!user || !window.confirm('Delete this document?')) return;
    console.log('[handleDeleteDocument] Attempting to delete document', docId);
    try {
      const response = await fetchWithAuth(`/api/documents/${docId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to delete document.');
      }
      toast({ title: 'Deleted', description: 'Document deleted successfully.' });
      fetchDocuments();
    } catch (err) {
      console.error('[handleDeleteDocument] Error:', err);
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // --- START NEW FUNCTION ---
  const handleDeleteAllDocuments = async () => {
    setIsDeletingAll(true);
    console.log('[handleDeleteAllDocuments] Attempting to delete all user documents...');
    try {
      console.log(`[handleDeleteAllDocuments] Calling DELETE /api/documents/all`);
      const response = await fetchWithAuth('/api/documents/all', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Server error during deletion.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      console.log('[handleDeleteAllDocuments] Success:', result);
      toast({ title: 'Success', description: 'All your documents have been deleted.' });
      fetchDocuments(); // Refresh the list
    } catch (error) {
      console.error('[handleDeleteAllDocuments] Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsDeletingAll(false);
    }
  };
  // --- END NEW FUNCTION ---

  // --- START: Document Download Handler ---
  const downloadDocument = async (doc: UserDocument) => {
    console.log(`[DocDownload] Starting download for: ${doc.originalFileName} (ID: ${doc._id})`);

    try {
      // Get presigned URL from backend
      const endpoint =
        doc.sourceType === 'system'
          ? `/api/system-kb/download/${doc._id}`
          : `/api/documents/view/${doc._id}`;

      console.log(`[DocDownload] Fetching presigned URL from: ${endpoint}`);

      const response = await fetchWithAuth(endpoint, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to get download URL' }));
        throw new Error(errorData.message || `Failed to get download URL: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`[DocDownload] Backend response:`, responseData);

      if (!responseData.success || !responseData.url) {
        throw new Error('Backend did not return a valid download URL');
      }

      // Use the presigned URL to download the file
      const downloadUrl = responseData.url;
      const filename = responseData.fileName || doc.originalFileName;

      console.log(`[DocDownload] Initiating download from S3 URL for file: ${filename}`);

      // Create a temporary link element and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename; // This suggests the filename for download
      link.target = '_blank'; // Open in new tab as fallback

      // Add link to DOM, click it, then remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`[DocDownload] Download initiated for: ${filename}`);

      toast({
        title: 'Download Started',
        description: `Downloading ${filename}...`,
      });
    } catch (error) {
      console.error('[DocDownload] Error downloading document:', error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';

      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: message,
      });
    }
  };
  // --- END: Document Download Handler ---

  // --- START: Image Viewer Handler ---
  const handleViewImage = async (doc: UserDocument) => {
    console.log(`[ImageView] Starting image view for: ${doc.originalFileName} (ID: ${doc._id})`);

    try {
      // Get presigned URL from backend
      const endpoint =
        doc.sourceType === 'system'
          ? `/api/system-kb/download/${doc._id}`
          : `/api/documents/view/${doc._id}`;

      console.log(`[ImageView] Fetching presigned URL from: ${endpoint}`);

      const response = await fetchWithAuth(endpoint, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to get image URL' }));
        throw new Error(errorData.message || `Failed to get image URL: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`[ImageView] Backend response:`, responseData);

      if (!responseData.success || !responseData.url) {
        throw new Error('Backend did not return a valid image URL');
      }

      // Set image data and open modal
      setImageUrl(responseData.url);
      setViewingImageName(responseData.fileName || doc.originalFileName);
      setIsImageViewerModalOpen(true);

      console.log(`[ImageView] Image viewer opened for: ${doc.originalFileName}`);
    } catch (error) {
      console.error('[ImageView] Error loading image:', error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';

      toast({
        variant: 'destructive',
        title: 'Image Load Failed',
        description: message,
      });
    }
  };
  // --- END: Image Viewer Handler ---

  // --- START: Document Viewer Handler (ENHANCED FOR MULTIPLE FILE TYPES) ---
  const handleViewDocument = async (doc: UserDocument) => {
    // Log the document object to inspect its structure
    console.log('[DocView][Diag] Document data for view attempt:', JSON.stringify(doc, null, 2));
    console.log(
      `[DocView][Diag] Requesting docId: ${doc._id}, originalFileName: ${doc.originalFileName}, sourceType: ${doc.sourceType || 'user'}`
    );

    // Determine file type
    const fileName = doc.originalFileName.toLowerCase();
    const isAudio =
      doc.mimeType?.startsWith('audio/') ||
      fileName.endsWith('.mp3') ||
      fileName.endsWith('.wav') ||
      fileName.endsWith('.m4a') ||
      fileName.endsWith('.aac') ||
      fileName.endsWith('.ogg') ||
      fileName.endsWith('.flac') ||
      fileName.endsWith('.webm');

    // Audio files are converted to PDFs on the backend, so check for PDF MIME type OR audio filename
    const isPdf = doc.mimeType === 'application/pdf' || fileName.endsWith('.pdf') || isAudio;
    const isExcel =
      doc.mimeType?.includes('spreadsheet') ||
      doc.mimeType?.includes('excel') ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsm');
    const isText =
      doc.mimeType === 'text/plain' || fileName.endsWith('.txt') || fileName.endsWith('.md');
    const isImage =
      doc.mimeType?.startsWith('image/') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      fileName.endsWith('.gif') ||
      fileName.endsWith('.bmp') ||
      fileName.endsWith('.webp') ||
      fileName.endsWith('.tiff') ||
      fileName.endsWith('.tif');

    // Handle different file types
    if (isExcel) {
      // For Excel files, download directly
      console.log(`[DocView] Excel file detected: ${doc.originalFileName} - initiating download`);
      await downloadDocument(doc);
      return;
    } else if (isText) {
      // For text files, we could download or preview - let's download for now
      console.log(`[DocView] Text file detected: ${doc.originalFileName} - initiating download`);
      await downloadDocument(doc);
      return;
    } else if (isImage) {
      // For images, show in a modal viewer
      console.log(`[DocView] Image file detected: ${doc.originalFileName} - opening image viewer`);
      await handleViewImage(doc);
      return;
    } else if (!isPdf) {
      toast({
        variant: 'destructive',
        title: 'Cannot View',
        description:
          'This file type is not supported for preview. Only PDF and image files can be previewed in the browser.',
      });
      return;
    }

    console.log(
      `[DocumentsPage] Attempting to view document: ${doc.originalFileName} (ID: ${doc._id})`
    );
    // setPdfLoadLoading(true); // Removed due to variable being removed
    setPdfUrl(null); // Clear previous URL
    // setPdfLoadError(null); // Removed due to variable being removed
    setViewingDocName(doc.originalFileName); // Set name early
    setIsPdfViewerModalOpen(true); // Open modal immediately to show loading state

    // Revoke previous URL if exists
    if (pdfUrl) {
      console.log('[DocumentsPage] Revoking previous Object URL');
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }

    try {
      // Use token from useAuth hook
      // if (!token) {
      //   throw new Error('Authentication token not found. Please log in again.');
      // }
      // Consider adding if (!user) throw new Error('User not authenticated'); here

      // Check sourceType to determine the correct endpoint
      const endpoint =
        doc.sourceType === 'system'
          ? `/api/system-kb/download/${doc._id}`
          : `/api/documents/view/${doc._id}`;

      console.log(`[DocumentsPage] Using endpoint: ${endpoint} for docId: ${doc._id}`);

      const response = await fetchWithAuth(endpoint, {
        method: 'GET',
      });

      console.log(
        `[PDFView][Diag] Backend response status for /api/documents/view: ${response.status}`
      );
      // console.log(`[DocumentsPage] Fetch response status: ${response.status}`); // Original log

      if (!response.ok) {
        let errorMsg = `Failed to fetch PDF metadata/URL from backend (${response.status})`;
        let errorDataFromServer = null;
        try {
          errorDataFromServer = await response.json();
          errorMsg = `${errorMsg}: ${errorDataFromServer.message || 'Server error'}`;
          console.log(
            `[PDFView][Diag] Backend error response data:`,
            JSON.stringify(errorDataFromServer, null, 2)
          );
        } catch (jsonErr) {
          // If parsing error JSON fails, use status text
          const textError = await response
            .text()
            .catch(() => 'Could not read error response text.');
          errorMsg = `${errorMsg}: ${response.statusText || 'Server error'}. Response text: ${textError}`;
          console.log(
            `[PDFView][Diag] Backend error response (not JSON): Status ${response.status}, Text: ${textError}`
          );
        }
        console.error(`[PDFView][Diag] Fetch error from backend: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Assuming the backend now returns a presigned URL in a specific format
      // For example: { success: true, url: "presigned_s3_url", fileName: "actual_filename.pdf" }
      const responseData = await response.json();
      console.log(
        `[PDFView][Diag] Backend success response data (expecting presigned URL):`,
        JSON.stringify(responseData, null, 2)
      );

      if (!responseData.success || !responseData.url) {
        const errMsg = `Backend did not return a valid presigned URL. Response: ${JSON.stringify(responseData)}`;
        console.error(`[PDFView][Diag] ${errMsg}`);
        throw new Error(errMsg);
      }

      const presignedS3Url = responseData.url;
      console.log(`[PDFView][Diag] Received presigned S3 URL: ${presignedS3Url}`);
      setViewingDocName(responseData.fileName || doc.originalFileName); // Use filename from response if available

      // Now, the BrandedPdfViewer component will attempt to load this presignedS3Url.
      // We are no longer fetching the blob directly here and creating an object URL.
      // The BrandedPdfViewer will handle the direct S3 fetch.
      // Errors from S3 will appear in the browser's network tab for the S3 request.
      setPdfUrl(presignedS3Url); // Set the presigned URL for the viewer

      // --- Process Response into Object URL --- (This part is removed as we expect a presigned URL)
      // const blob = await response.blob();
      // console.log(`[DocumentsPage] Received blob. Type: ${blob.type}, Size: ${blob.size}`);

      // Check content type but be more lenient - some servers might not set the correct MIME type
      // if (blob.type !== 'application/pdf' && blob.type !== '') { // Removed
      //   console.warn( // Removed
      //     `[DocumentsPage] Expected PDF but received content type: ${blob.type} from ${fetchUrl}` // Removed
      //   ); // Removed
      //   // We'll continue anyway since the file might still be a PDF // Removed
      // } // Removed

      // const objectUrl = URL.createObjectURL(blob); // Removed
      // console.log(`[DocumentsPage] Created Object URL: ${objectUrl.substring(0, 60)}...`); // Removed
      // setPdfUrl(objectUrl); // Set URL to trigger rendering in the modal // Handled by presigned URL now
      // --- End Process Response ---
    } catch (error) {
      // console.error('[DocumentsPage] Error fetching/loading PDF:', error); // Original log
      console.error('[PDFView][Diag] Error in handleViewDocument:', error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setPdfUrl(null); // Ensure URL is null on error

      toast({
        variant: 'destructive',
        title: 'Error Preparing PDF View', // Updated title
        description: message,
      });
    }
    // finally block removed as setPdfLoadLoading was removed
  };
  // --- END: Document Viewer Handler ---

  // Main component render
  // --- START: Log state before render ---
  console.log(`${logPrefix} Rendering component. State:`, {
    loadingDocs,
    error,
    documentsLength: documents.length,
  });
  // --- END: Log state before render ---
  return (
    <ProtectedRoute>
      <div className="container mx-auto p-4 md:p-6 space-y-6 bg-background min-h-screen">
        <div className="mb-4">
          <Link href="/" passHref legacyBehavior>
            <Button variant="outline">Back to Chat</Button>
          </Link>
        </div>

        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            {user &&
              (user.role === 'admin' ||
                Boolean(
                  (user as unknown as { canCustomizePersona?: boolean })?.canCustomizePersona
                )) && <TabsTrigger value="settings">Persona Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="documents">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold dark:text-neutral-200">My Documents</h1>
            </div>
            <p className="text-muted-foreground mb-6 dark:text-neutral-400">
              Manage your uploaded documents here. Upload PDF, TXT, Excel, image, or audio files
              (MP3, WAV, etc.). Organize with folders and drag-and-drop.
            </p>

            {/* File Tree Manager - Same UI as System KB but for user documents */}
            <div className="card border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 shadow-md overflow-hidden" style={{ height: '600px' }}>
              <FileTreeManager mode="user" />
            </div>
          </TabsContent>

          {user &&
            (user.role === 'admin' ||
              Boolean(
                (user as unknown as { canCustomizePersona?: boolean })?.canCustomizePersona
              )) && (
              <TabsContent value="settings">
                <div className="card border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 shadow-md p-6">
                  {
                    user?.role === 'admin' ? (
                      <PersonaList /> // Admin sees the global persona management UI
                    ) : user?.canCustomizePersona ? (
                      <UserDocsSettings /> // Non-admin with permission sees their own settings
                    ) : null /* Should not happen if TabTrigger has same condition, but as a fallback */
                  }
                </div>
              </TabsContent>
            )}
        </Tabs>

        {/* Update PDF Viewer rendering */}
        {isPdfViewerModalOpen && pdfUrl && (
          <BrandedPdfViewer
            fileUrl={pdfUrl}
            title={viewingDocName}
            onClose={() => {
              setIsPdfViewerModalOpen(false);
              // For presigned URLs, no client-side object URL to revoke.
              // If pdfUrl was an object URL, it would be revoked here.
              // if (pdfUrl && pdfUrl.startsWith('blob:')) {
              //   URL.revokeObjectURL(pdfUrl);
              // }
              setPdfUrl(null); // Clear the URL regardless
            }}
            initialPageNumber={1}
            showDownload={true}
          />
        )}

        {/* Image Viewer Modal */}
        {isImageViewerModalOpen && imageUrl && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] w-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {viewingImageName}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Download the image
                      const link = document.createElement('a');
                      link.href = imageUrl;
                      link.download = viewingImageName;
                      link.target = '_blank';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsImageViewerModalOpen(false);
                      setImageUrl(null);
                      setViewingImageName('');
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>

              {/* Image Content */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt={viewingImageName}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  onError={e => {
                    console.error('Image failed to load:', e);
                    toast({
                      variant: 'destructive',
                      title: 'Image Load Error',
                      description:
                        'Failed to load the image. It may be corrupted or the link has expired.',
                    });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
