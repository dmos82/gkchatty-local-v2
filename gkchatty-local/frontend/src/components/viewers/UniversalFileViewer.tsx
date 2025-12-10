'use client';

import React, { lazy, Suspense } from 'react';
import { X, Download, FileQuestion, Loader2 } from 'lucide-react';
import BrandedPdfViewer from '@/components/BrandedPdfViewer';

// Lazy load heavy viewers to improve initial bundle size
// Note: MediaPlayer removed - video/audio are auto-transcribed to DOCX
const ImageViewer = lazy(() => import('./ImageViewer'));
const TextViewer = lazy(() => import('./TextViewer'));
const ExcelViewer = lazy(() => import('./ExcelViewer'));
const WordViewer = lazy(() => import('./WordViewer'));

export type FileType = 'pdf' | 'video' | 'audio' | 'image' | 'text' | 'excel' | 'word' | 'unknown';

interface UniversalFileViewerProps {
  documentId: string;
  fileName: string;
  mimeType?: string;
  isOpen: boolean;
  onClose: () => void;
}

// File type detection
export function getFileType(fileName: string, mimeType?: string): FileType {
  // 1. Check MIME type first (most reliable)
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/')) return 'text';
    if (
      mimeType.includes('spreadsheet') ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return 'excel';
    }
    if (
      mimeType.includes('wordprocessing') ||
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'word';
    }
  }

  // 2. Fallback to extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    // PDF
    case 'pdf':
      return 'pdf';

    // Video
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv':
    case 'webm':
    case 'm4v':
    case 'flv':
    case 'wmv':
    case 'mpeg':
    case 'mpg':
      return 'video';

    // Audio
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'aac':
    case 'ogg':
    case 'flac':
      return 'audio';

    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'webp':
    case 'tiff':
    case 'tif':
      return 'image';

    // Text/Markdown
    case 'txt':
    case 'md':
    case 'markdown':
      return 'text';

    // Excel
    case 'xlsx':
    case 'xls':
      return 'excel';

    // Word
    case 'docx':
    case 'doc':
      return 'word';

    default:
      return 'unknown';
  }
}

// Get file type icon color
export function getFileTypeColor(fileType: FileType): string {
  switch (fileType) {
    case 'pdf':
      return 'text-red-500';
    case 'video':
      return 'text-purple-500';
    case 'audio':
      return 'text-green-500';
    case 'image':
      return 'text-blue-500';
    case 'text':
      return 'text-gray-400';
    case 'excel':
      return 'text-emerald-500';
    case 'word':
      return 'text-blue-600';
    default:
      return 'text-gray-500';
  }
}

// Loading fallback
function ViewerLoading() {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading viewer...</p>
      </div>
    </div>
  );
}

// Download prompt for unknown file types
function DownloadPrompt({
  fileName,
  documentId,
  onClose,
}: {
  fileName: string;
  documentId: string;
  onClose: () => void;
}) {
  const handleDownload = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    window.open(`${apiUrl}/api/documents/download/${documentId}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-8 max-w-md text-center border border-gray-700">
        <FileQuestion className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Cannot Preview File</h2>
        <p className="text-gray-400 mb-2 break-all">{fileName}</p>
        <p className="text-gray-500 text-sm mb-6">
          This file type cannot be previewed in the browser. Please download the file to view it.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={handleDownload}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function UniversalFileViewer({
  documentId,
  fileName,
  mimeType,
  isOpen,
  onClose,
}: UniversalFileViewerProps) {
  if (!isOpen) return null;

  const fileType = getFileType(fileName, mimeType);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
  const streamUrl = `${apiUrl}/api/documents/stream/${documentId}`;

  // Route to appropriate viewer
  switch (fileType) {
    case 'pdf':
      return <BrandedPdfViewer fileUrl={streamUrl} title={fileName} onClose={onClose} />;

    case 'video':
    case 'audio':
      // Videos and audio are auto-transcribed to DOCX - show download prompt
      // The original file is replaced with a DOCX transcript in the backend
      return <DownloadPrompt fileName={fileName} documentId={documentId} onClose={onClose} />;

    case 'image':
      return (
        <Suspense fallback={<ViewerLoading />}>
          <ImageViewer url={streamUrl} fileName={fileName} onClose={onClose} />
        </Suspense>
      );

    case 'text':
      return (
        <Suspense fallback={<ViewerLoading />}>
          <TextViewer url={streamUrl} fileName={fileName} onClose={onClose} />
        </Suspense>
      );

    case 'excel':
      return (
        <Suspense fallback={<ViewerLoading />}>
          <ExcelViewer url={streamUrl} fileName={fileName} documentId={documentId} onClose={onClose} />
        </Suspense>
      );

    case 'word':
      return (
        <Suspense fallback={<ViewerLoading />}>
          <WordViewer url={streamUrl} fileName={fileName} documentId={documentId} onClose={onClose} />
        </Suspense>
      );

    default:
      return <DownloadPrompt fileName={fileName} documentId={documentId} onClose={onClose} />;
  }
}

export default UniversalFileViewer;
