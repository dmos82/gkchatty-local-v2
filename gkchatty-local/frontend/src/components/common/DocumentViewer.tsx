'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import BrandedPdfViewer from '@/components/BrandedPdfViewer';
import { getApiBaseUrl } from '@/lib/config';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface DocumentViewerProps {
  documentId: string;
  filename: string;
  type: 'user' | 'system';
  onClose: () => void;
}

export function DocumentViewer({ documentId, filename, type, onClose }: DocumentViewerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string>(filename);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'other'>('pdf');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setFileUrl(null);

    const fetchDocument = async () => {
      if (!user) {
        if (isMounted) {
          setError(new Error('User not authenticated.'));
          setIsLoading(false);
        }
        return;
      }

      if (!documentId) {
        if (isMounted) {
          setError(new Error('Document ID is missing.'));
          setIsLoading(false);
        }
        return;
      }

      // Determine file type from filename
      const fileName = filename.toLowerCase();
      const isPdf = fileName.endsWith('.pdf');
      const isImage =
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.jpeg') ||
        fileName.endsWith('.png') ||
        fileName.endsWith('.gif') ||
        fileName.endsWith('.bmp') ||
        fileName.endsWith('.webp') ||
        fileName.endsWith('.tiff') ||
        fileName.endsWith('.tif');
      const isExcel =
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.xlsm');
      const isText = fileName.endsWith('.txt') || fileName.endsWith('.md');

      if (isExcel || isText) {
        // For Excel and text files, we'll show a download option instead of trying to view
        if (isMounted) {
          setFileType('other');
          setIsLoading(false);
        }
        return;
      }

      let endpoint;
      if (type === 'system') {
        endpoint = `/api/system-kb/download/${documentId}`;
      } else if (type === 'user') {
        endpoint = `/api/documents/view/${documentId}`;
      } else {
        if (isMounted) {
          setError(new Error(`Unknown document type: ${type}`));
          setIsLoading(false);
        }
        return;
      }

      try {
        console.log('[DocumentViewer] Fetching document metadata from:', endpoint);
        const response = await fetchWithAuth(endpoint, { method: 'GET' });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            '[DocumentViewer] Fetch failed:',
            response.status,
            errorText.substring(0, 150)
          );
          throw new Error(`Failed to fetch document (${response.status}): ${errorText}`);
        }

        const responseData = await response.json();
        console.log('[DocumentViewer] Received response:', responseData);

        if (!responseData.success || !responseData.url) {
          throw new Error('Backend did not return a valid presigned URL');
        }

        const presignedUrl = responseData.url;
        const actualFileName = responseData.fileName || filename;

        // If the URL is relative (starts with /), prepend the API base URL
        const fullUrl = presignedUrl.startsWith('/')
          ? `${getApiBaseUrl()}${presignedUrl}`
          : presignedUrl;

        if (isMounted) {
          setFileUrl(fullUrl);
          setDisplayFileName(actualFileName);
          setFileType(isPdf ? 'pdf' : isImage ? 'image' : 'other');
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[DocumentViewer] Error fetching document:', err);
        if (isMounted) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchDocument();

    return () => {
      isMounted = false;
    };
  }, [documentId, type, user, filename]);

  const handleDownload = async () => {
    if (!fileUrl) {
      // For files that don't have a URL yet, fetch it
      let endpoint;
      if (type === 'system') {
        endpoint = `/api/system-kb/download/${documentId}`;
      } else {
        endpoint = `/api/documents/view/${documentId}`;
      }

      try {
        const response = await fetchWithAuth(endpoint, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Failed to get download URL: ${response.status}`);
        }
        const responseData = await response.json();
        if (!responseData.success || !responseData.url) {
          throw new Error('Backend did not return a valid download URL');
        }

        // Create download link
        const link = document.createElement('a');
        // If the URL is relative (starts with /), prepend the API base URL
        const downloadUrl = responseData.url.startsWith('/')
          ? `${getApiBaseUrl()}${responseData.url}`
          : responseData.url;
        link.href = downloadUrl;
        link.download = responseData.fileName || filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: 'Download Started',
          description: `Downloading ${responseData.fileName || filename}...`,
        });
      } catch (error) {
        console.error('[DocumentViewer] Download error:', error);
        toast({
          variant: 'destructive',
          title: 'Download Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred',
        });
      }
    } else {
      // Use existing URL for download
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = displayFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Download Started',
        description: `Downloading ${displayFileName}...`,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
          <p className="mt-4 text-center text-gray-700">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-lg">
          <div className="text-red-600 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-center mb-2">Error Loading Document</h3>
          <p className="text-gray-700 text-center mb-4">{error.message}</p>
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle different file types
  if (fileType === 'other') {
    // For Excel, text files, etc. - show download option
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-lg">
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-4">Document Preview</h3>
            <p className="text-gray-700 mb-4">This file type cannot be previewed in the browser.</p>
            <p className="text-sm text-gray-600 mb-6">
              <strong>File:</strong> {displayFileName}
            </p>
            <div className="flex justify-center space-x-4">
              <Button onClick={handleDownload} className="flex items-center">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fileType === 'image' && fileUrl) {
    // Image viewer
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] w-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {displayFileName}
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                ✕
              </Button>
            </div>
          </div>

          {/* Image Content */}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            <img
              src={fileUrl}
              alt={displayFileName}
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
    );
  }

  if (fileType === 'pdf' && fileUrl) {
    // PDF viewer
    return (
      <BrandedPdfViewer
        fileUrl={fileUrl}
        title={displayFileName}
        onClose={onClose}
        initialPageNumber={1}
        showDownload={true}
        onLoadError={(error: Error) => {
          console.error('[DocumentViewer] PDF load error:', error.message);
          setError(error);
        }}
      />
    );
  }

  // Fallback
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8">
        <p className="text-center text-gray-700">No document to display.</p>
        <div className="flex justify-center mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
