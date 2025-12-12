'use client';

import React, { useState, useEffect, useCallback } from 'react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import {
  X,
  Download,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface WordViewerProps {
  url: string;
  fileName: string;
  documentId: string;
  onClose: () => void;
}

export function WordViewer({ url, fileName, documentId, onClose }: WordViewerProps) {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Check if this is a .doc file (not supported by mammoth)
  const extension = fileName.split('.').pop()?.toLowerCase();
  const isLegacyDoc = extension === 'doc';

  // Fetch and parse Word document
  useEffect(() => {
    if (isLegacyDoc) {
      setIsLoading(false);
      setError('Legacy .doc format cannot be previewed. Please download the file.');
      return;
    }

    const fetchWord = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = localStorage.getItem('accessToken');
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Convert DOCX to HTML using mammoth
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
              "b => strong",
              "i => em",
              "u => u",
            ],
          }
        );

        setHtmlContent(result.value);

        // Collect any warnings
        if (result.messages.length > 0) {
          setWarnings(result.messages.map((m) => m.message));
        }
      } catch (err) {
        console.error('Error parsing Word file:', err);
        setError(err instanceof Error ? err.message : 'Failed to parse Word document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWord();
  }, [url, isLegacyDoc]);

  // Download
  const handleDownload = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    window.open(`${apiUrl}/api/documents/download/${documentId}`, '_blank');
  }, [documentId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-500" />
          <h2 className="text-white font-medium truncate max-w-md">{fileName}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-gray-700 rounded-lg transition text-gray-400"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 ml-2"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Warnings banner */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-yellow-900/50 border-b border-yellow-700 text-yellow-200 text-sm">
          <span className="font-medium">Note:</span> Some formatting may not display correctly.
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading && (
          <div className="flex items-center justify-center h-full bg-gray-950">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-950">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Download to View
            </button>
          </div>
        )}

        {!isLoading && !error && htmlContent && (
          <div className="max-w-4xl mx-auto p-8">
            <article
              className="word-document prose prose-sm sm:prose max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-6 p-3 bg-gray-900 border-t border-gray-700 text-gray-500 text-xs">
        <span>Word Document Preview</span>
        <span>Press Esc to close</span>
      </div>

      {/* Custom styles for Word document rendering */}
      <style jsx global>{`
        .word-document {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
        }
        .word-document h1 {
          font-size: 2em;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: #1a1a1a;
        }
        .word-document h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: #1a1a1a;
        }
        .word-document h3 {
          font-size: 1.17em;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: #1a1a1a;
        }
        .word-document p {
          margin-bottom: 1em;
        }
        .word-document ul, .word-document ol {
          margin-left: 1.5em;
          margin-bottom: 1em;
        }
        .word-document li {
          margin-bottom: 0.25em;
        }
        .word-document table {
          border-collapse: collapse;
          margin-bottom: 1em;
          width: 100%;
        }
        .word-document th, .word-document td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        .word-document th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .word-document img {
          max-width: 100%;
          height: auto;
        }
        .word-document a {
          color: #0066cc;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

export default WordViewer;
