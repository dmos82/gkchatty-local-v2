'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import BrandedPdfViewer from '@/components/BrandedPdfViewer';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Loader2 } from 'lucide-react';

interface PdfViewerProps {
  documentId: string;
  filename: string;
  type: 'user' | 'system';
  onClose: () => void;
}

export function PdfViewer({ documentId, filename, type, onClose }: PdfViewerProps) {
  const { user, handleApiError } = useAuth();
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string>(filename);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pdfError, setPdfError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setPdfError(null);
    setPdfFileUrl(null); // Reset fileUrl when new doc is selected
    setNumPages(null);

    const fetchPdf = async () => {
      if (!user) {
        if (isMounted) {
          setPdfError(new Error('User not authenticated.'));
          setIsLoading(false);
        }
        return;
      }

      if (!documentId) {
        if (isMounted) {
          setPdfError(new Error('Document ID is missing.'));
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
        if (process.env.NODE_ENV === 'development') {
          console.error('[PdfViewer] Unknown document type:', type);
        }
        if (isMounted) {
          setPdfError(new Error(`Unknown document type: ${type}`));
          setIsLoading(false);
        }
        return;
      }

      try {
        console.log('[PdfViewer] Fetching document metadata from:', endpoint);
        const response = await fetchWithAuth(endpoint, { method: 'GET' });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[PdfViewer] Fetch failed:', response.status, errorText.substring(0, 150));

          // Handle 403 Forbidden specially - user doesn't have permission
          if (response.status === 403) {
            throw new Error('Access Denied: You do not have permission to view this document.');
          }

          throw new Error(`Failed to fetch PDF (${response.status}): ${errorText}`);
        }

        // Parse JSON response expecting presigned URL
        const responseData = await response.json();
        console.log('[PdfViewer] Received response:', responseData);

        if (!responseData.success || !responseData.url) {
          throw new Error('Backend did not return a valid presigned URL');
        }

        const presignedUrl = responseData.url;
        const actualFileName = responseData.fileName || filename;

        if (isMounted) {
          setPdfFileUrl(presignedUrl);
          setDisplayFileName(actualFileName);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[PdfViewer] Error fetching PDF:', err);
        if (isMounted) {
          setPdfError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchPdf();

    return () => {
      isMounted = false;
      // No need to revoke presigned URLs
    };
  }, [documentId, type, user, filename, handleApiError]);

  useEffect(() => {}, [numPages]);

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

  if (pdfError) {
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
          <h3 className="text-xl font-semibold text-center mb-2">Error Loading PDF</h3>
          <p className="text-gray-700 text-center mb-4">{pdfError.message}</p>
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

  if (!pdfFileUrl) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <p className="text-center text-gray-700">No PDF to display.</p>
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

  return (
    <BrandedPdfViewer
      fileUrl={pdfFileUrl}
      title={displayFileName}
      onClose={onClose}
      initialPageNumber={1}
      showDownload={true}
      onLoadSuccess={(pdf: { numPages: number }) => {
        setNumPages(pdf.numPages);
      }}
      onLoadError={(error: Error) => {
        console.error('[PdfViewer] PDF load error:', error.message);
        setPdfError(error);
      }}
    />
  );
}
