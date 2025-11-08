'use client';

import React from 'react';
import UserDocTreeManager from '@/components/UserDocTreeManager';

// Define type for documents displayed in this sidebar
interface SidebarDocument {
  _id: string;
  originalFileName: string;
}

// Update props interface to accept documents, loading, error states
interface DocumentSidebarProps {
  documents: SidebarDocument[];
  isLoading: boolean;
  error: string | null;
  onDocumentClick: (docId: string, sourceType: 'system', originalFileName: string) => void;
}

/**
 * DocumentSidebar component - Shows user documents in the chat page sidebar
 *
 * NOTE: The props (documents, isLoading, error, onDocumentClick) are no longer used
 * because UserDocTreeManager is self-contained with its own Zustand store.
 * These props are kept for backwards compatibility to avoid breaking the parent component.
 *
 * The UserDocTreeManager component handles its own:
 * - Data fetching via useUserDocTreeStore
 * - Loading states
 * - Error handling
 * - File tree rendering
 */
const DocumentSidebar: React.FC<DocumentSidebarProps> = () => {
  return (
    <div className="h-full flex flex-col bg-card text-card-foreground rounded-lg border">
      {/* UserDocTreeManager is self-contained with its own store */}
      <UserDocTreeManager />
    </div>
  );
};

export default DocumentSidebar;
