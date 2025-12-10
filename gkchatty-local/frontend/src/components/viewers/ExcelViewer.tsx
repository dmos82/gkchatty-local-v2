'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Table,
  AlertCircle,
} from 'lucide-react';

interface ExcelViewerProps {
  url: string;
  fileName: string;
  documentId: string;
  onClose: () => void;
}

interface SheetData {
  name: string;
  data: (string | number | boolean | null)[][];
  headers: string[];
}

export function ExcelViewer({ url, fileName, documentId, onClose }: ExcelViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch and parse Excel file
  useEffect(() => {
    const fetchExcel = async () => {
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
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const parsedSheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
            worksheet,
            { header: 1, defval: null }
          );

          // First row as headers
          const headers = (jsonData[0] || []).map((cell, idx) =>
            cell !== null ? String(cell) : `Column ${idx + 1}`
          );

          // Rest as data
          const data = jsonData.slice(1);

          return {
            name: sheetName,
            headers,
            data,
          };
        });

        setSheets(parsedSheets);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        setError(err instanceof Error ? err.message : 'Failed to parse Excel file');
      } finally {
        setIsLoading(false);
      }
    };

    fetchExcel();
  }, [url]);

  // Download
  const handleDownload = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    window.open(`${apiUrl}/api/documents/download/${documentId}`, '_blank');
  }, [documentId]);

  // Sort handler
  const handleSort = useCallback(
    (columnIndex: number) => {
      if (sortColumn === columnIndex) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(columnIndex);
        setSortDirection('asc');
      }
    },
    [sortColumn]
  );

  // Get sorted data
  const getSortedData = useCallback(
    (data: (string | number | boolean | null)[][]) => {
      if (sortColumn === null) return data;

      return [...data].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle null values
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal === null) return sortDirection === 'asc' ? -1 : 1;

        // Compare based on type
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    },
    [sortColumn, sortDirection]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'ArrowLeft' && activeSheet > 0) {
        setActiveSheet((prev) => prev - 1);
      }
      if (e.key === 'ArrowRight' && activeSheet < sheets.length - 1) {
        setActiveSheet((prev) => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, activeSheet, sheets.length]);

  const currentSheet = sheets[activeSheet];
  const sortedData = currentSheet ? getSortedData(currentSheet.data) : [];

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Table className="w-5 h-5 text-emerald-500" />
          <h2 className="text-white font-medium truncate max-w-md">{fileName}</h2>
          {currentSheet && (
            <span className="text-gray-500 text-sm">
              {currentSheet.data.length} rows × {currentSheet.headers.length} columns
            </span>
          )}
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

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 overflow-x-auto">
          <button
            onClick={() => setActiveSheet((prev) => Math.max(0, prev - 1))}
            disabled={activeSheet === 0}
            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>

          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(index)}
              className={`px-3 py-1 rounded text-sm whitespace-nowrap transition ${
                index === activeSheet
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              {sheet.name}
            </button>
          ))}

          <button
            onClick={() => setActiveSheet((prev) => Math.min(sheets.length - 1, prev + 1))}
            disabled={activeSheet === sheets.length - 1}
            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-950">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Download Instead
            </button>
          </div>
        )}

        {!isLoading && !error && currentSheet && (
          <div className="p-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 bg-gray-900">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 border-b border-gray-700 w-12">
                    #
                  </th>
                  {currentSheet.headers.map((header, idx) => (
                    <th
                      key={idx}
                      onClick={() => handleSort(idx)}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-300 border-b border-gray-700 cursor-pointer hover:bg-gray-800 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        {header}
                        {sortColumn === idx && (
                          <span className="text-emerald-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-gray-900/50">
                    <td className="px-2 py-2 text-xs text-gray-600 border-b border-gray-800">
                      {rowIdx + 1}
                    </td>
                    {currentSheet.headers.map((_, colIdx) => (
                      <td
                        key={colIdx}
                        className="px-4 py-2 text-sm text-gray-300 border-b border-gray-800 whitespace-nowrap"
                      >
                        {row[colIdx] !== null && row[colIdx] !== undefined
                          ? String(row[colIdx])
                          : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedData.length === 0 && (
              <div className="text-center py-8 text-gray-500">This sheet is empty</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-6 p-3 bg-gray-900 border-t border-gray-700 text-gray-500 text-xs">
        <span>Click column headers to sort</span>
        <span>Use arrow keys to switch sheets</span>
        <span>Press Esc to close</span>
      </div>
    </div>
  );
}

export default ExcelViewer;
