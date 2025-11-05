'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SystemKbDocument {
  _id: string;
  filename: string;
}

// Define Props including the callback
interface SystemKbListProps {
  onDocumentSelect: (documentId: string, filename: string) => void;
}

// Accept props in the component signature
export function SystemKbList({ onDocumentSelect }: SystemKbListProps) {
  const { user, handleApiError } = useAuth();
  const [documents, setDocuments] = useState<SystemKbDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<SystemKbDocument[]>([]);
  const [filterTerm, setFilterTerm] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/system-kb/documents', {
        method: 'GET',
      });

      if (!res.ok) {
        let errorMsg = `Failed to fetch documents: ${res.status} ${res.statusText}`;
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          /* Ignore if response not JSON */
        }
        handleApiError(res);
        throw new Error(errorMsg);
      }

      const data = await res.json();

      // --- START: Added Logging ---
      console.log(
        '<<< RAW API Response for /api/system-kb/documents: >>>',
        JSON.stringify(data, null, 2)
      );
      // --- END: Added Logging ---

      if (data.success && Array.isArray(data.documents)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const validDocs = data.documents.filter(
          (doc: unknown): doc is SystemKbDocument =>
            typeof (doc as any)?._id === 'string' && typeof (doc as any)?.filename === 'string'
        );
        setDocuments(validDocs);
      } else {
        console.error('Invalid data format received:', data);
        throw new Error('Invalid data format received from server.');
      }
    } catch (err) {
      console.error('Error fetching system KB documents:', err);
      const handled = handleApiError(err);
      if (!handled) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    } else {
      setIsLoading(false);
      setError('Please log in to view system documents.');
      setDocuments([]);
      setFilteredDocuments([]);
    }
  }, [user, fetchDocuments]);

  // Filter documents when filterTerm or documents change
  useEffect(() => {
    if (!filterTerm.trim()) {
      setFilteredDocuments(documents);
    } else {
      const normalizedFilter = filterTerm.toLowerCase().trim();
      const filtered = documents.filter(doc =>
        doc.filename.toLowerCase().includes(normalizedFilter)
      );
      setFilteredDocuments(filtered);
    }
  }, [filterTerm, documents]);

  // Handle filter input change
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterTerm(e.target.value);
  };

  // --- START: Added Logging ---
  console.log('[SystemKbList Render] State before return:', { isLoading, error, documents });
  // --- END: Added Logging ---

  return (
    <div className="p-4 h-full flex flex-col bg-card text-card-foreground rounded-lg border">
      <h3 className="text-lg font-semibold mb-2 text-center flex-shrink-0">Knowledge Base</h3>

      {/* Search input - only show when documents are loaded */}
      {!isLoading && !error && documents.length > 0 && (
        <div className="mb-3 relative">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter documents..."
              value={filterTerm}
              onChange={handleFilterChange}
              className="pl-8"
            />
          </div>
          {filterTerm && (
            <div className="text-xs text-muted-foreground mt-1">
              Showing {filteredDocuments.length} of {documents.length} documents
            </div>
          )}
        </div>
      )}

      <div className="flex-grow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Loading KB...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-600 px-2 text-center">
            <p>Error: {error}</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No system documents available.</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No matching documents found.</p>
          </div>
        ) : (
          <ScrollArea className="h-full border rounded-lg p-2">
            <div className="space-y-1">
              {filteredDocuments.map(doc => (
                <div
                  key={doc._id}
                  className="text-sm p-1 hover:bg-accent rounded-lg cursor-pointer"
                  onClick={() => onDocumentSelect(doc._id, doc.filename)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDocumentSelect(doc._id, doc.filename);
                    }
                  }}
                >
                  {doc.filename}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// Optional default export
// export default SystemKbList;
