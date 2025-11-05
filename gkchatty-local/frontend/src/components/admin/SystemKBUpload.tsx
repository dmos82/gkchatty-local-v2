'use client';

import React, { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/config';

interface SystemKBUploadProps {
  onUploadSuccess?: () => void;
}

export default function SystemKBUpload({ onUploadSuccess }: SystemKBUploadProps = {}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateFiles = (files: FileList): boolean => {
    const allowedTypes = ['.pdf', '.txt'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(fileExtension)) {
        setUploadError(`Invalid file type: ${file.name}. Only PDF and TXT files are allowed.`);
        return false;
      }

      if (file.size > maxSize) {
        setUploadError(`File too large: ${file.name}. Maximum size is 10MB.`);
        return false;
      }
    }

    setUploadError(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (validateFiles(files)) {
        setSelectedFiles(files);
        uploadFiles(files);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (validateFiles(files)) {
        setSelectedFiles(files);
        uploadFiles(files);
      }
    }
  };

  const uploadFiles = async (files: FileList) => {
    setIsUploading(true);
    setUploadProgress('Uploading...');
    setUploadError(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      // FormData special handling: Cannot use fetchWithAuth because it sets Content-Type header
      // which breaks multipart/form-data. Instead, manually add Authorization header.
      const apiUrl = getApiBaseUrl();
      const token = localStorage.getItem('accessToken');

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiUrl}/api/admin/system-kb/upload`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();

      toast({
        title: 'Upload Successful',
        description: `Successfully uploaded ${result.uploadedCount || files.length} file(s) to System KB.`,
      });

      // Reset form
      setSelectedFiles(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Call the callback if provided
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload files',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200',
          'hover:border-primary/50 cursor-pointer',
          isDragging && 'border-primary bg-primary/5',
          isUploading && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <Input
          ref={fileInputRef}
          id="system-file-upload"
          type="file"
          multiple
          onChange={handleFileChange}
          accept=".pdf,.txt"
          disabled={isUploading}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {isDragging
                ? 'Drop files here...'
                : selectedFiles && selectedFiles.length > 0
                  ? `${selectedFiles.length} file(s) selected`
                  : 'Drag & drop System KB files here, or click to browse'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF or TXT files only (max 10MB each)
            </p>
          </div>
        </div>

        {uploadError && <p className="mt-3 text-sm text-destructive">{uploadError}</p>}

        {isUploading && uploadProgress && (
          <div className="mt-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{uploadProgress}</span>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <p>• System KB documents are available to all users</p>
        <p>• Documents will be processed and embedded for semantic search</p>
        <p>• Duplicate files will be automatically detected and skipped</p>
      </div>
    </div>
  );
}
