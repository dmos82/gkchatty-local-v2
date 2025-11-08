'use client';

// Import polyfill BEFORE react-pdf to support Node.js v20
import '@/lib/polyfills';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import Image from 'next/image';
import { X, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, DownloadIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Use locally-copied worker to avoid CDN latency/CORS in dev & prod
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface BrandedPdfViewerProps {
  fileUrl: string;
  title?: string;
  onClose: () => void;
  initialPageNumber?: number;
  showDownload?: boolean;
  onLoadSuccess?: (pdf: { numPages: number }) => void;
  onLoadError?: (error: Error) => void;
}

const BrandedPdfViewer: React.FC<BrandedPdfViewerProps> = ({
  fileUrl,
  title = 'Document',
  onClose,
  initialPageNumber = 1,
  showDownload = true,
  onLoadSuccess,
  onLoadError,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPageNumber);
  const [scale, setScale] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [logoLoaded, setLogoLoaded] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Track fileUrl stability
  const initialFileUrl = useRef(fileUrl);
  useEffect(() => {
    if (initialFileUrl.current !== fileUrl) {
      console.warn('[BrandedPdfViewer] fileUrl prop changed:', fileUrl);
      initialFileUrl.current = fileUrl;
    }
  }, [fileUrl]);

  useEffect(() => {
    // Reset page number when fileUrl changes
    setCurrentPage(initialPageNumber > 0 ? initialPageNumber : 1);
    setScale(1); // Reset zoom level
    setLoading(true);
    setError(null);
  }, [fileUrl, initialPageNumber]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePreviousPage();
      } else if (e.key === 'Home') {
        setCurrentPage(1);
      } else if (e.key === 'End' && numPages) {
        setCurrentPage(numPages);
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages, onClose]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoading(false);
      setError(null);
      if (onLoadSuccess) {
        onLoadSuccess({ numPages });
      }
    },
    [onLoadSuccess]
  );

  const onDocumentLoadError = useCallback(
    (error: Error) => {
      console.error('[BrandedPdfViewer] PDF load error:', error.message);
      setError(error);
      setLoading(false);
      setNumPages(null);
      if (onLoadError) {
        onLoadError(error);
      }
    },
    [onLoadError]
  );

  const onDocumentSourceError = useCallback((error: Error) => {
    console.error('[BrandedPdfViewer] PDF source error:', error.message);
    setError(new Error(`Failed to load PDF source: ${error.message}`));
    setLoading(false);
    setNumPages(null);
  }, []);

  const handlePreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prevPage => prevPage - 1);
    }
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    if (numPages && currentPage < numPages) {
      setCurrentPage(prevPage => prevPage + 1);
    }
  }, [currentPage, numPages]);

  const handleZoomIn = useCallback(() => {
    setScale(prevScale => Math.min(prevScale + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prevScale => Math.max(prevScale - 0.2, 0.5));
  }, []);

  // Handle download with proper blob creation for S3 URLs
  const handleDownload = useCallback(async () => {
    if (!fileUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch the PDF from the URL
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      // Create a blob from the response
      const blob = await response.blob();

      // Create a temporary URL for the blob
      const blobUrl = URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = title || 'document.pdf';
      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('[BrandedPdfViewer] Download error:', error);
      // Fallback to direct link if fetch fails
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = title || 'document.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsDownloading(false);
    }
  }, [fileUrl, title, isDownloading]);

  // Log when component mounts and unmounts
  useEffect(() => {
    return () => {
      // Component unmount cleanup (if any)
    };
  }, []);

  // Memoised options object so <Document> doesn\'t re-initialise on every render
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
      disableAutoFetch: true,
    }),
    []
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Branded Toolbar */}
        <div className="bg-gray-50 border-b border-gray-200 p-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Gold Key Logo */}
            <div className="h-6 flex items-center">
              <Image
                src="/gk_logo_new.png"
                alt="Gold Key Logo"
                width={24}
                height={24}
                className={cn('h-6 w-auto', !logoLoaded && 'hidden')}
                onLoad={() => setLogoLoaded(true)}
                onError={() => setLogoLoaded(false)}
              />
              {!logoLoaded && (
                <span className="text-amber-500 font-semibold text-sm">Gold Key</span>
              )}
            </div>

            {/* Document Title */}
            <span className="text-sm font-medium truncate max-w-[200px] md:max-w-md" title={title}>
              {title}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-2">
            {/* Zoom Controls */}
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Zoom Out</span>
            </button>

            <span className="text-xs text-gray-500 hidden sm:inline">
              {Math.round(scale * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Zoom In</span>
            </button>

            {/* Page Navigation */}
            {numPages && numPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage <= 1}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>

                <span className="text-xs text-gray-500">
                  {currentPage} / {numPages}
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={!numPages || currentPage >= numPages}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Download Button (Optional) */}
            {showDownload && fileUrl && (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download PDF"
              >
                {isDownloading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <DownloadIcon className="h-3 w-3 mr-1" />
                )}
                <span className="hidden sm:inline">
                  {isDownloading ? 'Downloading...' : 'Download'}
                </span>
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="bg-white text-gray-500 border border-gray-200 hover:bg-gray-100 px-1.5 py-0.5 rounded text-xs flex items-center"
              aria-label="Close viewer"
            >
              <X className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* PDF Viewer Area */}
        <div className="flex-1 bg-gray-100 overflow-y-auto">
          {/* Show main loading overlay only when loading and no error exists */}
          {loading && !error && (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <p className="mt-4 text-gray-500 text-sm">Loading document...</p>
            </div>
          )}

          {/* Show main error overlay if an error occurred */}
          {error && (
            <div className="h-full flex flex-col items-center justify-center p-4">
              <div className="bg-red-50 text-red-600 p-4 rounded-lg max-w-md text-center">
                <p className="font-medium">Failed to load PDF</p>
                <p className="text-sm mt-2">{error.message}</p>
              </div>
            </div>
          )}

          {/* Render Document container unless a fatal error has occurred */}
          {!error && (
            <div className="flex justify-center">
              {/* REMOVE Log state before rendering */}
              {/* {(() => {
                console.log('[BrandedPdfViewer] State *just before* <Document> render:', { 
                  fileUrl,
                  loading, // Parent loading state
                  error: error ? (error as Error).message : null,
                  numPages, 
                  workerSrc: workerUrl // Log the explicit workerUrl
                });
                return null;
              })()} */}

              {/* REMOVE Wrap Document in Error Boundary */}
              {/* <PdfDocumentErrorBoundary fallback={ ... } > */}
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                onSourceError={onDocumentSourceError}
                loading={
                  // Minimal internal loading indicator for Document
                  <div className="flex justify-center items-center p-8">
                    <p className="text-sm text-gray-400">Initializing PDF viewer...</p>
                  </div>
                }
                error={
                  // Internal error display for Document loading issues
                  <div className="p-4 bg-red-50 text-red-600 rounded-lg max-w-md text-center">
                    <p>Internal error preparing PDF. Please try again.</p>
                  </div>
                }
                className="max-w-full"
                options={pdfOptions}
              >
                {/* Only render Page if numPages is set (onLoadSuccess) */}
                {numPages && (
                  <Page
                    key={`page-${currentPage}-${scale}`}
                    pageNumber={currentPage}
                    scale={scale}
                    className="shadow-md my-4"
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    error={
                      <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Recovering…
                      </div>
                    }
                  />
                )}
              </Document>
              {/* </PdfDocumentErrorBoundary> */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrandedPdfViewer;
