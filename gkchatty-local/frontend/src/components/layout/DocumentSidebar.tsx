'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
// import { useAuth } from '@/hooks/useAuth'; // Removed if not needed
// import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config'; // Removed if fetch is removed

// Define type for documents displayed in this sidebar
interface SidebarDocument {
  _id: string;
  originalFileName: string;
  // Add other fields if needed from the prop
}

// Update props interface to accept documents, loading, error states
interface DocumentSidebarProps {
  documents: SidebarDocument[];
  isLoading: boolean;
  error: string | null;
  // Note: Click handler expects 'system' type based on prior usage, adjust if this component
  // should now handle 'user' type clicks differently or if the adapter in page.tsx is sufficient.
  onDocumentClick: (docId: string, sourceType: 'system', originalFileName: string) => void;
}

// Destructure props directly in the function signature
const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  documents,
  isLoading,
  error,
  onDocumentClick,
}) => {
  // Add state for filtering
  const [filterTerm, setFilterTerm] = useState('');
  const [filteredDocuments, setFilteredDocuments] = useState<SidebarDocument[]>([]);

  // Update filtered documents when source documents or filter term changes
  useEffect(() => {
    if (!filterTerm.trim()) {
      setFilteredDocuments(documents);
    } else {
      const normalizedFilter = filterTerm.toLowerCase().trim();
      const filtered = documents.filter(doc =>
        doc.originalFileName.toLowerCase().includes(normalizedFilter)
      );
      setFilteredDocuments(filtered);
    }
  }, [filterTerm, documents]);

  // Handle filter input change
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterTerm(e.target.value);
  };

  return (
    <div className="p-4 h-full flex flex-col bg-card text-card-foreground rounded-lg border">
      <h3 className="text-lg font-semibold mb-2 text-center flex-shrink-0">My Documents</h3>

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
        {isLoading && (
          <div className="flex justify-center items-center h-20 p-2 text-muted-foreground">
            Loading...
          </div>
        )}
        {error && <p className="text-red-600 text-sm px-2">Error: {error}</p>}
        {!isLoading && !error && documents.length === 0 && (
          <p className="text-muted-foreground text-sm px-2">No documents uploaded yet.</p>
        )}
        {!isLoading && !error && documents.length > 0 && filteredDocuments.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No matching documents found.</p>
          </div>
        )}
        {!isLoading && !error && filteredDocuments.length > 0 && (
          <ScrollArea className="h-full">
            <ul className="space-y-0.5">
              {filteredDocuments.map(doc => (
                <li key={doc._id}>
                  <button
                    // Pass 'system' for now, adapter in page.tsx handles conversion to 'user'
                    onClick={() => onDocumentClick(doc._id, 'system', doc.originalFileName)}
                    className="w-full text-left text-sm text-foreground hover:bg-muted px-2 py-1.5 rounded flex items-center space-x-2 focus:outline-none focus:ring-1 focus:ring-primary"
                    title={doc.originalFileName}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate flex-grow">{doc.originalFileName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default DocumentSidebar;
