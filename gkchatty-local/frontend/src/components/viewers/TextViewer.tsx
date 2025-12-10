'use client';

import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  Download,
  Copy,
  Check,
  FileText,
  Hash,
} from 'lucide-react';

// Markdown component renderers with proper types
const markdownComponents: Components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-3xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-2xl font-semibold text-white mt-6 mb-3">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-xl font-medium text-white mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline"
    >
      {children}
    </a>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-gray-800 text-pink-400 px-1.5 py-0.5 rounded text-sm">
        {children}
      </code>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto text-sm">
      {children}
    </pre>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside mb-4 text-gray-300">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside mb-4 text-gray-300">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="mb-1">{children}</li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400 my-4">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-gray-700">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-gray-700 px-4 py-2 bg-gray-800 text-white text-left">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-gray-700 px-4 py-2 text-gray-300">{children}</td>
  ),
  hr: () => <hr className="border-gray-700 my-6" />,
};

interface TextViewerProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

export function TextViewer({ url, fileName, onClose }: TextViewerProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Determine if markdown
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const isMarkdown = ['md', 'markdown'].includes(extension);

  // Fetch content
  useEffect(() => {
    const fetchContent = async () => {
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

        const text = await response.text();
        setContent(text);
      } catch (err) {
        console.error('Error fetching text file:', err);
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [url]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  // Download
  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  }, [url, fileName]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
        // Copy all if nothing selected
        handleCopy();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleCopy]);

  // Line count
  const lines = content.split('\n');
  const lineCount = lines.length;

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-medium truncate max-w-md">{fileName}</h2>
          {!isLoading && !error && (
            <span className="text-gray-500 text-sm">
              {lineCount} lines • {(content.length / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle line numbers (text only) */}
          {!isMarkdown && (
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`p-2 rounded-lg transition ${
                showLineNumbers ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Toggle line numbers"
            >
              <Hash className="w-5 h-5" />
            </button>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            disabled={isLoading || !!error}
            className="p-2 hover:bg-gray-700 rounded-lg transition text-gray-400 disabled:opacity-50"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
          </button>

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

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-950">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Download Instead
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {isMarkdown ? (
              // Markdown rendering
              <div className="p-6 max-w-4xl mx-auto">
                <article className="prose prose-invert prose-sm sm:prose-base max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {content}
                  </ReactMarkdown>
                </article>
              </div>
            ) : (
              // Plain text with optional line numbers
              <div className="p-4 font-mono text-sm">
                <table className="w-full">
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index} className="hover:bg-gray-900/50">
                        {showLineNumbers && (
                          <td className="select-none text-right pr-4 text-gray-600 w-12 align-top">
                            {index + 1}
                          </td>
                        )}
                        <td className="text-gray-300 whitespace-pre-wrap break-all">
                          {line || '\u00A0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-6 p-3 bg-gray-900 border-t border-gray-700 text-gray-500 text-xs">
        <span>{isMarkdown ? 'Markdown' : 'Plain Text'}</span>
        <span>Press Esc to close</span>
      </div>
    </div>
  );
}

export default TextViewer;
