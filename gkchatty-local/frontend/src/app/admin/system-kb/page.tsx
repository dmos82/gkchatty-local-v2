'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import SystemKBUpload from '@/components/admin/SystemKBUpload';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export default function AdminSystemKbPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      console.log('[AdminSystemKbPage] No user found after auth check, redirecting to /auth');
      router.replace('/auth');
    }
    if (!isAuthLoading && user && user.role !== 'admin') {
      console.warn('[AdminSystemKbPage] User is not an admin, redirecting to /');
      router.replace('/');
    }
  }, [user, isAuthLoading, router]);

  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const response = await fetchWithAuth('/api/system-kb/', {
        method: 'GET',
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('[AdminSystemKbPage] Error fetching documents:', error);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchDocuments();
    }
  }, [user]);

  const handleUploadSuccess = () => {
    // Refresh the document list after successful upload
    fetchDocuments();
  };

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div>Loading session...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Admin: Manage System Knowledge Base</h1>

      <div className="mb-6 p-4 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Upload New Documents</h2>
        <SystemKBUpload onUploadSuccess={handleUploadSuccess} />
      </div>

      <div className="p-4 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Existing Documents</h2>
        {isLoadingDocs ? (
          <p className="text-muted-foreground">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc._id} className="p-2 border rounded hover:bg-gray-50">
                <p className="font-medium">{doc.filename}</p>
                <p className="text-xs text-muted-foreground">
                  Status: {doc.status || 'Unknown'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
