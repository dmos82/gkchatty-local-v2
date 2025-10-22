'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

export default function AdminSystemKbPage() {
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    console.log(
      '[AdminSystemKbPage] Auth Check Effect. isAuthLoading:',
      isAuthLoading,
      'user:',
      !!user
    );
    if (!isAuthLoading && !user) {
      console.log('[AdminSystemKbPage] No user found after auth check, redirecting to /auth');
      router.replace('/auth');
    }
    if (!isAuthLoading && user && user.role !== 'admin') {
      console.warn('[AdminSystemKbPage] User is not an admin, redirecting to /');
      router.replace('/');
    }
  }, [user, isAuthLoading, router]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      console.log('[AdminSystemKbPage] File selected:', file.name);
      setTimeout(() => {
        handleUpload(file);
      }, 0);
    } else {
      setSelectedFile(null);
      console.log('[AdminSystemKbPage] File selection cancelled.');
    }
  };

  const handleUpload = async (fileToUpload?: File) => {
    setUploadError(null);

    // Use provided file or fall back to selectedFile state
    const fileToProcess = fileToUpload || selectedFile;

    if (!fileToProcess) {
      console.warn('[AdminSystemKbPage] No file selected for upload.');
      toast({
        title: 'Upload Failed',
        description: 'Please select a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    console.log('[AdminSystemKbPage] Starting upload for:', fileToProcess.name);

    const formData = new FormData();
    formData.append('file', fileToProcess);

    const apiUrl = `${API_BASE_URL}/api/admin/system-kb`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[AdminSystemKbPage] Upload successful:', result);
        toast({
          title: 'Upload Successful',
          description: `${fileToProcess.name} uploaded successfully.`,
          variant: 'default',
        });
        setSelectedFile(null);
        const fileInput = document.getElementById('document-upload') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      } else {
        const errorText = await response.text();
        console.error('[AdminSystemKbPage] Upload failed:', response.status, errorText);
        setUploadError(`Upload failed: ${response.status} - ${errorText}`);
        toast({
          title: 'Upload Failed',
          description: `Error: ${response.status} ${response.statusText || ''}. ${errorText}`,
          variant: 'destructive',
        });
        if (response.status === 401 || response.status === 403) {
          console.warn('[AdminSystemKbPage] Received 401/403 Unauthorized/Forbidden. Logging out.');
          logout();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AdminSystemKbPage] Fetch error during upload:', error);
      setUploadError(`Upload failed: ${errorMessage}`);
      toast({
        title: 'Upload Failed',
        description: `Network Error: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (isAuthLoading) {
    console.log('[AdminSystemKbPage] Rendering: Loading...');
    return (
      <div className="flex justify-center items-center h-screen">
        <div>Loading session...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    console.log('[AdminSystemKbPage] Rendering: Null (User not authenticated or not admin)');
    return null;
  }

  console.log('[AdminSystemKbPage] Rendering: Page Content (User is Admin)');
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Admin: Manage System Knowledge Base</h1>

      <div className="mb-6 p-4 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Upload New Document</h2>
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="document-upload">Document (PDF, DOCX, TXT)</Label>
          <Input
            id="document-upload"
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </div>
        {selectedFile && (
          <p className="text-sm text-muted-foreground mt-2">Selected: {selectedFile.name}</p>
        )}
        {uploadError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}
        {isUploading && (
          <div className="mt-4 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
            <p className="text-sm font-medium">Uploading {selectedFile?.name}...</p>
          </div>
        )}
      </div>

      <div className="p-4 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Existing Documents</h2>
        <p className="text-muted-foreground">
          List and management features for existing documents go here.
        </p>
      </div>
    </div>
  );
}
