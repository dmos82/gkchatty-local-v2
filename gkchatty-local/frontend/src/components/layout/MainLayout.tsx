'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Library } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import FilenameSearch from '@/components/FilenameSearch';
import UserStatus from './UserStatus';
import { ChatSummary } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import ErrorBoundary from '@/components/ErrorBoundary';

import Sidebar from './Sidebar';
import ContentHeader from './ContentHeader';

interface Document {
  _id: string;
  originalFileName: string;
}

interface MainLayoutProps {
  children: ReactNode;
  activeView: 'chat' | 'docs';
  setActiveView: (view: 'chat' | 'docs') => void;
  isKbOverlayVisible: boolean;
  setIsKbOverlayVisible: (visible: boolean) => void;
  handleKbFileClick: (docId: string, sourceType: 'system', originalFileName: string) => void;
  chatContext: 'system-kb' | 'user-docs';
  setChatContext: (context: 'system-kb' | 'user-docs') => void;
  chats: ChatSummary[];
  selectedChatId: string | null;
  isLoadingChats: boolean;
  handleNewChat: () => void;
  handleSelectChat: (chatId: string) => void;
  handleConfirmDelete: (chatId: string) => void;
  onDeleteAllChats: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeView,
  setActiveView,
  isKbOverlayVisible,
  setIsKbOverlayVisible,
  handleKbFileClick,
  chatContext,
  setChatContext,
  chats,
  selectedChatId,
  isLoadingChats,
  handleNewChat,
  handleSelectChat,
  handleConfirmDelete,
  onDeleteAllChats,
}) => {
  const { user, logout, handleApiError } = useAuth();

  const [kbDocuments, setKbDocuments] = useState<Document[]>([]);
  const [kbLoading, setKbLoading] = useState<boolean>(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbSearchTerm, setKbSearchTerm] = useState('');

  const [isAlertAllOpen, setIsAlertAllOpen] = useState(false);

  useEffect(() => {
    if (isKbOverlayVisible && user && kbDocuments.length === 0) {
      const fetchSystemDocuments = async () => {
        try {
          const response = await fetchWithAuth('/api/system-kb/', {
            method: 'GET',
          });
          if (!response.ok) {
            handleApiError(response);
            if (response.status === 401) throw new Error('Unauthorized');
            throw new Error(`Failed to fetch KB (${response.status})`);
          }
          const data = await response.json();
          if (data.success && Array.isArray(data.documents)) {
            setKbDocuments(data.documents);
          } else {
            throw new Error('Invalid KB data format');
          }
        } catch (err: any) {
          console.error('Error fetching KB docs:', err);
          const handled = handleApiError(err);
          if (!handled) {
            setKbError(err.message || 'Failed to load System KB');
          }
        } finally {
          setKbLoading(false);
        }
      };
      fetchSystemDocuments();
    } else if (!isKbOverlayVisible || !user) {
      setKbDocuments([]);
      setKbError(null);
    }
  }, [isKbOverlayVisible, user, handleApiError, kbDocuments.length]);

  const handleKbSearch = (query: string) => {
    console.log('KB Search Query:', query);
    setKbSearchTerm(query.toLowerCase());
  };

  console.log('Current kbSearchTerm:', kbSearchTerm);

  const filteredKbDocuments = React.useMemo(() => {
    console.log(
      '[Filtering] Running filter. Term:',
      kbSearchTerm,
      'Input Docs:',
      kbDocuments.length
    );
    if (!kbSearchTerm) {
      return kbDocuments;
    }
    const searchTermLower = kbSearchTerm.toLowerCase();
    const result = kbDocuments.filter(doc =>
      doc.originalFileName.toLowerCase().includes(searchTermLower)
    );
    console.log('[Filtering] Filtered Docs Count:', result.length);
    return result;
  }, [kbDocuments, kbSearchTerm]);

  // --- ADDED: Dummy handler for Sidebar prop ---
  const handleUpdateChatNameDummy = async (chatId: string, newName: string) => {
    console.warn('[MainLayout] handleUpdateChatName called, but not implemented in this layout.');
    // In a real scenario, decide if this layout SHOULD handle updates or if Sidebar
    // should be conditionally rendered without editing features here.
    return Promise.resolve(); // Fulfill the Promise requirement
  };
  // --- END ADDITION ---

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar
          user={user}
          activeView={activeView}
          setActiveView={setActiveView}
          chats={chats}
          selectedChatId={selectedChatId}
          isLoadingChats={isLoadingChats}
          handleNewChat={handleNewChat}
          handleSelectChat={handleSelectChat}
          handleConfirmDelete={handleConfirmDelete}
          onDeleteAllChats={onDeleteAllChats}
          isAlertAllOpen={isAlertAllOpen}
          setIsAlertAllOpen={setIsAlertAllOpen}
          handleLogout={logout}
          onUpdateChatName={handleUpdateChatNameDummy}
        />

        <div className="flex-1 flex flex-col overflow-hidden ml-[240px]">
          <ContentHeader
            activeView={activeView}
            selectedChatId={selectedChatId}
            chats={chats}
            chatContext={chatContext}
            setChatContext={setChatContext}
          />

          <div className="absolute top-0 right-0 h-[60px] flex items-center px-4 space-x-4 z-20">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsKbOverlayVisible(!isKbOverlayVisible)}
              aria-label="Toggle Knowledge Base Search"
              className="relative"
            >
              <Library className="h-5 w-5" />
              {isKbOverlayVisible && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
              )}
            </Button>
            <UserStatus user={user} />
          </div>

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex justify-end items-center mb-4">
              <UserStatus user={user} />
            </div>
            {children}
          </main>
        </div>

        {isKbOverlayVisible && (
          <div className="fixed inset-0 bg-black/60 z-30 flex items-start justify-center backdrop-blur-sm pt-16">
            <div className="bg-card dark:bg-card rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden border border-border">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="text-lg font-semibold">System Knowledge Base</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsKbOverlayVisible(false)}
                  className="h-7 w-7 transition-all duration-150 ease-in-out hover:bg-muted/80 hover:scale-[1.05] active:scale-[0.95]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Button>
              </div>
              <div className="p-3 border-b border-border">
                <FilenameSearch placeholder="Search System KB..." onSearch={handleKbSearch} />
              </div>

              <div className="flex-1 overflow-y-auto p-1">
                {kbLoading && (
                  <p className="p-4 text-center text-muted-foreground">Loading KB...</p>
                )}
                {kbError && <p className="p-4 text-center text-red-500">Error: {kbError}</p>}
                {!kbLoading && !kbError && (
                  <div className="space-y-1">
                    {filteredKbDocuments.length > 0 ? (
                      filteredKbDocuments.map(doc => (
                        <div
                          key={doc._id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer transition-all duration-150 ease-in-out text-sm hover:scale-[1.01]"
                          onClick={() => handleKbFileClick(doc._id, 'system', doc.originalFileName)}
                        >
                          <span className="truncate" title={doc.originalFileName}>
                            {doc.originalFileName}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm p-4 text-center">
                        {kbSearchTerm ? 'No matching documents found.' : 'No documents loaded yet.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <AlertDialog open={isAlertAllOpen} onOpenChange={setIsAlertAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Chat History?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all of your chat
                conversations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDeleteAllChats}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ErrorBoundary>
  );
};
