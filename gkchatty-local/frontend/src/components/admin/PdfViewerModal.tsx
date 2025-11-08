'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Loader2, AlertCircle } from 'lucide-react';

// Configure worker source based on copy-pdf-worker script - OLD
// try {
//   if (typeof window !== 'undefined') { // Ensure this runs only on client
//     pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
//     console.log('[PdfViewerModal] PDF worker source set to:', pdfjs.GlobalWorkerOptions.workerSrc);
//   } else {
//     console.log('[PdfViewerModal] Skipping PDF worker setup on server-side.');
//   }
// } catch (error) {
//   console.error('[PdfViewerModal] Error setting PDF worker source:', error);
// }

// --- START: Use CDN for Worker --- --- REMOVED ---
// try { ... CDN logic ... } catch(error) { ... }
// --- END: Use CDN for Worker --- --- REMOVED ---

// --- START: Configure Worker for Local Copy ---
try {
  if (typeof window !== 'undefined') {
    // Ensure this runs only on client
    // Point to the file copied to the public directory by Webpack
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    console.log(
      `[PdfViewerModal] PDF worker source set to local path: ${pdfjs.GlobalWorkerOptions.workerSrc}`
    );
  }
} catch (error) {
  console.error('[PdfViewerModal] Error setting PDF worker source to local path:', error);
}
// --- END: Configure Worker for Local Copy ---

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string | null;
  title?: string;
}

const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  title = 'PDF Viewer',
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<Error | null>(null);

  function onDocumentLoadSuccess({ numPages: nextNumPages }: { numPages: number }): void {
    console.log(`[PdfViewerModal] Document loaded successfully: ${nextNumPages} pages.`);
    setNumPages(nextNumPages);
    setPageNumber(1); // Reset to first page on new document load
    setLoadError(null); // Clear previous errors
  }

  function onDocumentLoadError(error: Error): void {
    console.error('[PdfViewerModal] Error loading PDF document:', error);
    setLoadError(error);
    setNumPages(null); // Clear pages on error
  }

  // Reset state when modal is closed or fileUrl changes
  React.useEffect(() => {
    if (!isOpen) {
      setNumPages(null);
      setPageNumber(1);
      setLoadError(null);
    }
  }, [isOpen]);

  // // Optional: Reset when fileUrl changes while modal is open (might cause flicker)
  // React.useEffect(() => {
  //   setNumPages(null);
  //   setPageNumber(1);
  //   setLoadError(null);
  // }, [fileUrl]);

  const goToPrevPage = () => setPageNumber(prevPageNumber => Math.max(prevPageNumber - 1, 1));
  const goToNextPage = () =>
    setPageNumber(prevPageNumber => Math.min(prevPageNumber + 1, numPages || 1));

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto py-4">
          {fileUrl ? (
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="mt-2 text-muted-foreground">Loading PDF...</p>
                </div>
              }
              error={
                <div className="flex flex-col items-center justify-center h-full text-destructive">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <p className="font-semibold">Error loading PDF</p>
                  <p className="text-xs mt-1">
                    {loadError?.message || 'An unknown error occurred.'}
                  </p>
                </div>
              }
            >
              {/* Only render Page if document loaded successfully */}
              {numPages !== null && !loadError && (
                <Page pageNumber={pageNumber} renderTextLayer={true} renderAnnotationLayer={true} />
              )}
            </Document>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No PDF file specified.
            </div>
          )}
        </div>
        {/* Add Pagination Controls if document loaded successfully */}
        {numPages !== null && !loadError && (
          <DialogFooter className="pt-4 border-t justify-between">
            <p className="text-sm text-muted-foreground">
              Page {pageNumber} of {numPages}
            </p>
            <div className="flex space-x-2">
              <Button onClick={goToPrevPage} disabled={pageNumber <= 1} variant="outline">
                Previous
              </Button>
              <Button onClick={goToNextPage} disabled={pageNumber >= numPages} variant="outline">
                Next
              </Button>
            </div>
          </DialogFooter>
        )}
        {/* Always show close button */}
        {!numPages && (
          <DialogFooter className="pt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PdfViewerModal;
