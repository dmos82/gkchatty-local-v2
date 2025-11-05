'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, File, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { extractTextFromImage, isSupportedImageType } from '@/utils/imageProcessor';
import { TOAST_NOTIFICATION_DURATION_MS } from '@/config/constants';
import { getApiBaseUrl } from '@/lib/config';

interface ChatFileUploadProps {
  onUploadComplete?: (uploadedFiles: Array<{ fileName: string; documentId: string }>) => void;
  onUploadStart?: () => void;
  className?: string;
  compact?: boolean; // For smaller chat interface version
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
  documentId?: string;
}

export default function ChatFileUpload({
  onUploadComplete,
  onUploadStart,
  className,
  compact = false,
}: ChatFileUploadProps) {
  const { toast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'application/pdf',
    'text/plain',
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
    '.mp4',
    '.mpeg',
    '.mpg',
    '.mov',
    '.avi',
    '.wmv',
    '.flv',
    '.mkv',
    '.m4v',
  ];

  const validateFiles = useCallback(
    (files: FileList): File[] => {
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

        // Check file type and extension
        if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
          errors.push(
            `${file.name}: Unsupported file type. Only PDF, TXT, Excel, and image files are allowed.`
          );
          continue;
        }

        // Check file size (25MB limit for Excel files, 15MB for images, 10MB for others)
        let maxSize = 10 * 1024 * 1024; // Default 10MB
        if (fileExtension.includes('xls')) {
          maxSize = 25 * 1024 * 1024; // 25MB for Excel
        } else if (file.type.startsWith('image/')) {
          maxSize = 15 * 1024 * 1024; // 15MB for images
        }
        if (file.size > maxSize) {
          const maxSizeMB = maxSize / (1024 * 1024);
          errors.push(`${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`);
          continue;
        }

        validFiles.push(file);
      }

      if (errors.length > 0) {
        toast({
          title: 'File Validation Error',
          description: errors.join('\n'),
          variant: 'destructive',
        });
      }

      return validFiles;
    },
    [toast]
  );

  const updateFileStatus = useCallback((fileName: string, updates: Partial<UploadingFile>) => {
    setUploadingFiles(prev => prev.map(f => (f.file.name === fileName ? { ...f, ...updates } : f)));
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploading(true);
      onUploadStart?.();

      // Initialize uploading files state
      const initialFiles = files.map(file => ({
        file,
        progress: 0,
        status: 'uploading' as const,
      }));
      setUploadingFiles(initialFiles);

      const successfulUploads: Array<{ fileName: string; documentId: string }> = [];

      for (const file of files) {
        try {
          // Step 1: Get pre-signed URL
          updateFileStatus(file.name, { status: 'uploading', progress: 10 });

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

          const { presignedUrl, s3Key } = await presignedResponse.json();
          updateFileStatus(file.name, { progress: 30 });

          // Step 2: Upload to S3 or local storage
          // Handle relative URLs for local storage mode
          let uploadUrl = presignedUrl;
          if (presignedUrl.startsWith('/')) {
            // It's a relative URL, prepend the API base URL
            const apiBaseUrl = getApiBaseUrl();
            uploadUrl = `${apiBaseUrl}${presignedUrl}`;
            console.log(`[ChatFileUpload] Converting relative URL to absolute: ${uploadUrl}`);
          }

          const s3Response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
            mode: 'cors',
            credentials: uploadUrl.includes('localhost') || uploadUrl.includes('/api/files/local/') ? 'include' : 'omit',
          });

          if (!s3Response.ok) {
            throw new Error(`S3 upload failed: ${s3Response.status} ${s3Response.statusText}`);
          }

          updateFileStatus(file.name, { progress: 60 });

          // Step 2.5: For images, perform OCR before notifying backend
          let extractedText = '';
          if (isSupportedImageType(file)) {
            updateFileStatus(file.name, {
              status: 'processing',
              progress: 65,
              message: 'Extracting text from image...',
            });
            try {
              const ocrResult = await extractTextFromImage(file, progress => {
                updateFileStatus(file.name, { progress: 65 + Math.round(progress * 5) }); // 65-70%
              });
              extractedText = ocrResult.text;
              console.log(
                `[ChatFileUpload] OCR complete for ${file.name}. Confidence: ${ocrResult.confidence}%, Text length: ${extractedText.length}`
              );
            } catch (ocrError) {
              console.error(`[ChatFileUpload] OCR failed for ${file.name}:`, ocrError);
              // Continue with upload even if OCR fails
            }
          }

          // Step 3: Notify backend for processing
          updateFileStatus(file.name, { status: 'processing', progress: 70 });

          const processResponse = await fetchWithAuth(
            '/api/documents/process-uploaded-file',
            {
              method: 'POST',
              body: JSON.stringify({
                s3Key,
                originalFileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                extractedText: extractedText, // Include OCR text if available
              }),
            }
          );

          if (!processResponse.ok) {
            const errorData = await processResponse
              .json()
              .catch(() => ({ message: 'Processing failed' }));
            throw new Error(errorData.message || `Processing failed: ${processResponse.status}`);
          }

          const result = await processResponse.json();
          updateFileStatus(file.name, {
            status: 'success',
            progress: 100,
            message: 'Upload successful',
            documentId: result.documentId,
          });

          successfulUploads.push({
            fileName: file.name,
            documentId: result.documentId,
          });
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          updateFileStatus(file.name, {
            status: 'error',
            progress: 0,
            message: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      }

      setIsUploading(false);

      if (successfulUploads.length > 0) {
        onUploadComplete?.(successfulUploads);
        toast({
          title: 'Upload Successful',
          description: `${successfulUploads.length} file(s) uploaded and processing started.`,
        });

        // Clear successful uploads after a delay
        setTimeout(() => {
          setUploadingFiles(prev => prev.filter(f => f.status === 'error'));
        }, TOAST_NOTIFICATION_DURATION_MS);
      }
    },
    [updateFileStatus, onUploadStart, onUploadComplete, toast]
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
          uploadFiles(validFiles);
        }
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [validateFiles, uploadFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
          uploadFiles(validFiles);
        }
      }
    },
    [validateFiles, uploadFiles]
  );

  const removeFile = useCallback((fileName: string) => {
    setUploadingFiles(prev => prev.filter(f => f.file.name !== fileName));
  }, []);

  const getStatusIcon = (status: UploadingFile['status']) => {
    switch (status) {
      case 'success':
        return (
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
        );
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <File className="w-4 h-4 text-blue-500" />;
    }
  };

  if (compact) {
    return (
      <div className={cn('relative', className)}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedExtensions.join(',')}
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="h-8 px-2"
        >
          <Upload className="w-4 h-4" />
        </Button>

        {/* Upload status popup for compact mode */}
        {uploadingFiles.length > 0 && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50">
            <div className="space-y-2">
              {uploadingFiles.map(({ file, progress, status, message }) => (
                <div key={file.name} className="flex items-center gap-2 text-sm">
                  {getStatusIcon(status)}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{file.name}</div>
                    {status === 'uploading' || status === 'processing' ? (
                      <Progress value={progress} className="h-1 mt-1" />
                    ) : status === 'error' && message ? (
                      <div className="text-red-500 text-xs">{message}</div>
                    ) : null}
                  </div>
                  {status === 'error' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.name)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 cursor-pointer',
          'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500',
          isDragging && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
          isUploading && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedExtensions.join(',')}
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />

        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isDragging ? 'Drop files here...' : 'Click to upload or drag & drop'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          PDF, TXT, Excel, and image files • Max 25MB for Excel, 15MB for images, 10MB for others
        </p>
      </div>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map(({ file, progress, status, message }) => (
            <div
              key={file.name}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              {getStatusIcon(status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  {status === 'error' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.name)}
                      className="h-6 w-6 p-0 ml-2"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                {status === 'uploading' || status === 'processing' ? (
                  <Progress value={progress} className="h-2 mt-1" />
                ) : status === 'error' && message ? (
                  <div className="text-red-500 text-xs mt-1">{message}</div>
                ) : status === 'success' ? (
                  <div className="text-green-600 text-xs mt-1">
                    Upload complete • Processing started
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
