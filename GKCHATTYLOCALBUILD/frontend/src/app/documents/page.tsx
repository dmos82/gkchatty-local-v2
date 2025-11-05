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
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config'; // <-- Import centralized config
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserDocsSettings from '@/components/settings/UserDocsSettings';
import PersonaList from '@/components/admin/PersonaList'; // Import the new PersonaList component

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
    const apiUrl = `${API_BASE_URL}/api/documents`;
    // --- START: Log API URL ---
    console.log(`${logPrefix} Fetching user documents from: ${apiUrl}`);
    // --- END: Log API URL ---

    try {
      const response = await fetch(apiUrl, {
        credentials: 'include', // Use HttpOnly cookies instead of Authorization header
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
          // Step 1: Perform OCR if image (before upload)
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
            }
          }

          // Step 2: Direct multipart upload to backend
          console.log(`[GKCHATTY-PAGE-UPLOAD] Uploading ${file.name} directly to backend`);
          const formData = new FormData();
          formData.append('file', file);
          formData.append('sourceType', 'user');
          if (extractedText) {
            formData.append('extractedText', extractedText);
          }

          const uploadResponse = await fetch(`${API_BASE_URL}/api/upload/document`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
            // Don't set Content-Type - browser will set it with boundary
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse
              .json()
              .catch(() => ({ message: 'Upload failed' }));
            throw new Error(
              errorData.message || `Upload failed: ${uploadResponse.status}`
            );
          }

          const uploadResult = await uploadResponse.json();
          console.log(
            `[GKCHATTY-PAGE-UPLOAD] Upload successful for ${file.name}. Document ID: ${uploadResult.documentId}`
          );
          console.log(`[GKCHATTY-PAGE-UPLOAD] Backend processing status: ${uploadResult.status}`);

          successCount++;
          processedFilesInfo.push({
            fileName: file.name,
            status: 'success',
            message: uploadResult.message || 'Upload successful',
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
    const deleteUrl = `${API_BASE_URL}/api/documents/${docId}`;
    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        credentials: 'include', // ADDED: Send cookies
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
      // const token = localStorage.getItem('token');
      // if (!token) throw new Error('Authentication token not found');
      // Consider adding if (!user) throw new Error('User not authenticated'); here
      // --- FIX: Ensure API_BASE_URL is used for the fetch URL ---
      const deleteAllUrl = `${API_BASE_URL}/api/documents/all`;
      console.log(`[handleDeleteAllDocuments] Calling URL: ${deleteAllUrl}`);
      const response = await fetch(deleteAllUrl, {
        method: 'DELETE',
        credentials: 'include', // ADDED: Send cookies
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
      // Get file directly from backend (streams file buffer)
      const apiUrlBase = API_BASE_URL;
      const fetchUrl =
        doc.sourceType === 'system'
          ? `${apiUrlBase}/api/system-kb/download/${doc._id}`
          : `${apiUrlBase}/api/documents/view/${doc._id}`;

      console.log(`[DocDownload] Fetching file from: ${fetchUrl}`);

      const response = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to download file' }));
        throw new Error(errorData.message || `Failed to download file: ${response.status}`);
      }

      // Get file as blob
      const blob = await response.blob();
      console.log(`[DocDownload] File retrieved, size: ${blob.size} bytes`);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.originalFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(`[DocDownload] Download initiated for: ${doc.originalFileName}`);
      toast({ title: 'Success', description: `Downloading ${doc.originalFileName}` });
    } catch (error) {
      console.error(`[DocDownload] Error:`, error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };
  // --- END: Document Download Handler (refactored for direct streaming) ---

  // --- START: Image View Handler ---
  const viewImage = async (doc: UserDocument) => {
    console.log(`[ImageView] Starting image view for: ${doc.originalFileName} (ID: ${doc._id})`);

    try {
      const apiUrlBase = API_BASE_URL;
      const fetchUrl = `${apiUrlBase}/api/documents/view/${doc._id}`;

      console.log(`[ImageView] Fetching image from: ${fetchUrl}`);

      const response = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to load image' }));
        throw new Error(errorData.message || `Failed to load image: ${response.status}`);
      }

      console.log(`[ImageView] Response received, converting to blob`);

      // Get image as blob
      const blob = await response.blob();
      const imageUrl = window.URL.createObjectURL(blob);

      console.log(`[ImageView] Image blob URL created, opening viewer`);

      // Set image state for viewer
      setViewingImage({ doc, imageUrl });
      setIsImageModalOpen(true);

      toast({
        title: 'Image Loaded',
        description: `Viewing ${doc.originalFileName}`,
      });
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
  // --- END: Document Download Handler ---

  // --- START: Image Viewer Handler ---
  const handleViewImage = async (doc: UserDocument) => {
    console.log(`[ImageView] Starting image view for: ${doc.originalFileName} (ID: ${doc._id})`);

    try {
      // Get presigned URL from backend
      const apiUrlBase = API_BASE_URL;
      const fetchUrl =
        doc.sourceType === 'system'
          ? `${apiUrlBase}/api/system-kb/download/${doc._id}`
          : `${apiUrlBase}/api/documents/view/${doc._id}`;

      console.log(`[ImageView] Fetching presigned URL from: ${fetchUrl}`);

      const response = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
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

      // --- START MODIFIED --- Prepend API Base URL
      const apiUrlBase = API_BASE_URL;
      let fetchUrl = '';
      // --- END MODIFIED ---

      // Check sourceType to determine the correct endpoint
      if (doc.sourceType === 'system') {
        // For system documents, use the ID-based download endpoint
        fetchUrl = `${apiUrlBase}/api/system-kb/download/${doc._id}`; // Use full URL
        console.log(`[DocumentsPage] Using system KB download endpoint with ID: ${doc._id}`);
      } else {
        // Default to user documents endpoint if sourceType is undefined or 'user'
        fetchUrl = `${apiUrlBase}/api/documents/view/${doc._id}`; // Use full URL
        console.log(`[DocumentsPage] Using user documents view endpoint with ID: ${doc._id}`);
      }

      // --- MODIFIED --- Log the full fetchUrl
      console.log(`[DocumentsPage] Determined API URL for fetch: ${fetchUrl}`);
      // --- End Determine Endpoint is now part of the if/else

      console.log(`[DocumentsPage] Fetching PDF from URL: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
      });

      console.log(`[PDFView] Backend response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to load PDF' }));
        const errorMsg = errorData.message || `Failed to fetch PDF (${response.status})`;
        console.error(`[PDFView] Fetch error from backend: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[PDFView] Response received, converting to blob`);

      // Get PDF as blob
      const blob = await response.blob();
      console.log(`[PDFView] Received blob. Type: ${blob.type}, Size: ${blob.size}`);

      // Create object URL for PDF viewer
      const objectUrl = URL.createObjectURL(blob);
      console.log(`[PDFView] Created Object URL for PDF viewer`);

      setPdfUrl(objectUrl); // Set object URL for the viewer
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
              (MP3, WAV, etc.). Audio files are automatically transcribed to searchable PDFs.
            </p>

            {/* Upload Section with Drop Zone - Now in a card */}
            <div className="card border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 shadow-md p-6">
              <Label className="text-lg font-semibold mb-4 block dark:text-neutral-300">
                Upload New Document(s)
              </Label>
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ease-in-out',
                  'border-muted bg-neutral-50 dark:bg-neutral-900 hover:border-muted-foreground/50',
                  isDragging && 'border-primary bg-primary/10', // Dragging state
                  isUploading && 'opacity-50 cursor-not-allowed' // Uploading state
                )}
              >
                <Input
                  id="file-upload" // Keep ID for the label
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="hidden" // Hide the default input visually
                />
                <Label
                  htmlFor="file-upload" // Associate label with hidden input
                  className={cn(
                    'flex flex-col items-center justify-center space-y-2 cursor-pointer',
                    isUploading && 'cursor-not-allowed'
                  )}
                >
                  <Upload className="h-8 w-8 text-muted-foreground dark:text-neutral-400" />
                  <span className="font-medium dark:text-neutral-300">
                    {isDragging
                      ? 'Drop files here...'
                      : selectedFiles && selectedFiles.length > 0
                        ? `${selectedFiles.length} file(s) selected: ${Array.from(selectedFiles)
                            .map(f => f.name)
                            .join(', ')}`
                        : "Drag 'n' drop files here, or click to select"}
                  </span>
                  {!selectedFiles && (
                    <span className="text-xs text-muted-foreground dark:text-neutral-500">
                      PDF, TXT, Excel, image, or audio files • Max 25MB for audio/Excel, 15MB for
                      images, 10MB for others
                    </span>
                  )}
                </Label>

                {/* Error Message Display */}
                {uploadError && (
                  <p className="mt-3 text-sm text-red-500 dark:text-red-400">{uploadError}</p>
                )}

                {/* Progress Bar - Make it more visible during upload */}
                {isUploading && (
                  <div className="mt-4">
                    <Progress value={uploadProgress} className="w-full h-2" />
                    <p className="text-sm text-center font-medium mt-2 dark:text-neutral-400">
                      Uploading {selectedFiles?.length} file(s)...
                    </p>
                  </div>
                )}
              </div>

              {/* Create Small Test File Button */}
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const testContent = 'This is a small test file for upload diagnostics.';
                    const testFile = new File([testContent], 'test_diagnostic_file.txt', {
                      type: 'text/plain',
                    });
                    console.log('[GKCHATTY-PAGE-UPLOAD] Prepared small test file for upload.');

                    // Create a FileList-like array
                    const dt = new DataTransfer();
                    dt.items.add(testFile);
                    const fileList = dt.files;

                    // Set selected files
                    setSelectedFiles(fileList);

                    // Automatically trigger upload
                    uploadFiles(fileList);
                  }}
                  disabled={isUploading}
                  className="px-4 py-2"
                >
                  Create Small Test File
                </Button>
              </div>
            </div>

            {/* Document List Section - Now in a card */}
            <div className="card border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 dark:text-neutral-300">
                Uploaded Documents
              </h2>
              {loadingDocs && <p className="dark:text-neutral-400">Loading documents...</p>}
              {error && (
                <p className="text-red-500 dark:text-red-400">Error loading documents: {error}</p>
              )}
              {!loadingDocs && !error && documents.length === 0 && (
                <p className="text-muted-foreground dark:text-neutral-500">
                  No documents uploaded yet.
                </p>
              )}
              {!loadingDocs && !error && documents.length > 0 && (
                <div className="space-y-2 overflow-y-auto max-h-[50vh]">
                  {documents.map(doc => {
                    const isFailed = doc.status === 'failed';
                    const isProcessing = doc.status === 'processing' || doc.status === 'pending';

                    return (
                      <div
                        key={doc._id}
                        className={cn(
                          'flex justify-between items-center p-3 border rounded-lg transition-colors',
                          isFailed
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:border-neutral-700'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          {isFailed ? (
                            <span className="text-sm font-medium truncate text-red-600 dark:text-red-400">
                              {doc.originalFileName} (Failed)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleViewDocument(doc)}
                              disabled={isProcessing}
                              className={cn(
                                'text-sm font-medium truncate text-left',
                                isProcessing
                                  ? 'text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                  : 'hover:text-primary hover:underline dark:text-neutral-300'
                              )}
                              title={`${doc.originalFileName} - ${
                                isProcessing
                                  ? 'Processing...'
                                  : `Click to ${
                                      doc.mimeType === 'application/pdf' ||
                                      doc.originalFileName.toLowerCase().endsWith('.pdf') ||
                                      doc.originalFileName
                                        .toLowerCase()
                                        .match(/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/)
                                        ? 'preview'
                                        : doc.mimeType?.startsWith('image/') ||
                                            doc.originalFileName
                                              .toLowerCase()
                                              .match(/\.(jpg|jpeg|png|gif|bmp|webp|tiff|tif)$/)
                                          ? 'view image'
                                          : 'download'
                                    }`
                              }`}
                            >
                              {doc.originalFileName}
                            </button>
                          )}
                          <p className="text-xs text-muted-foreground dark:text-neutral-500">
                            Uploaded:{' '}
                            {doc.uploadTimestamp
                              ? new Date(doc.uploadTimestamp).toLocaleString()
                              : new Date(doc.createdAt).toLocaleDateString()}{' '}
                            | Status:{' '}
                            <span
                              className={cn(
                                isFailed && 'text-red-600 dark:text-red-400',
                                isProcessing && 'text-yellow-600 dark:text-yellow-400'
                              )}
                            >
                              {doc.status}
                            </span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(doc._id)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Danger Zone Section - Now in a card with subtle grayscale styling */}
            <div className="card border border-red-200 dark:border-neutral-700 dark:border-opacity-80 rounded-lg bg-white dark:bg-neutral-800 shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 dark:text-neutral-300">Danger Zone</h2>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeletingAll || documents.length === 0}>
                    {isDeletingAll ? 'Deleting...' : 'Delete All My Documents'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="dark:text-neutral-200">
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="dark:text-neutral-400">
                      This action cannot be undone. This will permanently delete all your uploaded
                      documents ({documents?.length || 0} documents) and their associated data from
                      the system.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAllDocuments}
                      disabled={isDeletingAll}
                      className="dark:hover:bg-red-600"
                    >
                      Confirm Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-sm text-muted-foreground mt-2 dark:text-neutral-500">
                Permanently remove all documents you have uploaded. This cannot be reversed.
              </p>
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
              // Revoke object URL to free memory
              if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
              }
              setPdfUrl(null);
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
