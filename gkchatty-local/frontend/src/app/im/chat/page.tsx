'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DMProvider } from '@/contexts/DMContext';
import { IMProvider } from '@/contexts/IMContext';
import { useAuth } from '@/hooks/useAuth';
import PopOutChatWindow from '@/components/im/PopOutChatWindow';

function PopOutChatContent() {
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const isAuthenticated = user !== null;

  // Get chat parameters from URL
  const conversationId = searchParams.get('conversationId');
  const recipientId = searchParams.get('recipientId') || '';
  const recipientUsername = searchParams.get('recipientUsername') || 'User';
  const recipientIconUrl = searchParams.get('recipientIconUrl') || null;
  const isGroup = searchParams.get('isGroup') === 'true';
  const groupName = searchParams.get('groupName') || 'Group Chat';
  const participantUsernames = searchParams.get('participants')?.split(',').filter(Boolean) || [];

  // Update page title
  useEffect(() => {
    document.title = isGroup ? `${groupName} - Chat` : `${recipientUsername} - Chat`;
  }, [isGroup, groupName, recipientUsername]);

  // Wait for auth to be ready
  useEffect(() => {
    if (!isLoading) {
      setIsReady(true);
    }
  }, [isLoading]);

  if (!isReady || isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-yellow-500 mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center p-6 bg-white dark:bg-[#2a2a2a] rounded-xl shadow-lg">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Not Authenticated</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Please log in to use this chat window.</p>
        </div>
      </div>
    );
  }

  if (!recipientId && !conversationId) {
    return (
      <div className="h-screen w-screen bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center p-6 bg-white dark:bg-[#2a2a2a] rounded-xl shadow-lg">
          <svg className="w-12 h-12 text-yellow-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">No Chat Selected</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Open a chat from the main window to use this pop-out.</p>
        </div>
      </div>
    );
  }

  return (
    <DMProvider>
      <IMProvider>
        <PopOutChatWindow
          conversationId={conversationId}
          recipientId={recipientId}
          recipientUsername={recipientUsername}
          recipientIconUrl={recipientIconUrl}
          isGroup={isGroup}
          groupName={groupName}
          participantUsernames={participantUsernames}
        />
      </IMProvider>
    </DMProvider>
  );
}

export default function PopOutChatPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-yellow-500 mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <PopOutChatContent />
    </Suspense>
  );
}
