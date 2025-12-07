'use client';

import React, { useState, useEffect } from 'react';
import { DMProvider, useDM, Conversation } from '@/contexts/DMContext';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';

interface DMContainerInnerProps {
  userId: string;
}

const DMContainerInner: React.FC<DMContainerInnerProps> = ({ userId }) => {
  const { selectedConversation, selectConversation, isConnected, connectionError } = useDM();
  const [isMobileViewingConversation, setIsMobileViewingConversation] = useState(false);

  // Handle responsive view
  const handleSelectConversation = (conversation: Conversation) => {
    selectConversation(conversation);
    setIsMobileViewingConversation(true);
  };

  const handleBackToList = () => {
    setIsMobileViewingConversation(false);
    selectConversation(null);
  };

  // Connection status indicator
  const ConnectionStatus = () => {
    if (connectionError) {
      return (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-center py-1 text-sm z-50">
          Connection error: {connectionError}
        </div>
      );
    }
    if (!isConnected) {
      return (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white text-center py-1 text-sm z-50">
          Connecting...
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex h-full bg-gray-50 dark:bg-gray-900">
      <ConnectionStatus />

      {/* Desktop layout */}
      <div className="hidden md:flex w-full">
        {/* Conversation list - fixed width */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
          <ConversationList onSelectConversation={handleSelectConversation} />
        </div>

        {/* Conversation view - flexible width */}
        <div className="flex-1">
          {selectedConversation ? (
            <ConversationView conversation={selectedConversation} currentUserId={userId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-6">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Your Messages
              </h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                Select a conversation from the list or start a new one by clicking the + button.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden w-full">
        {!isMobileViewingConversation ? (
          <div className="w-full">
            <ConversationList onSelectConversation={handleSelectConversation} />
          </div>
        ) : selectedConversation ? (
          <div className="w-full relative">
            {/* Back button */}
            <button
              onClick={handleBackToList}
              className="absolute top-4 left-4 z-10 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <ConversationView conversation={selectedConversation} currentUserId={userId} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

interface DMContainerProps {
  userId: string;
}

export const DMContainer: React.FC<DMContainerProps> = ({ userId }) => {
  return (
    <DMProvider>
      <DMContainerInner userId={userId} />
    </DMProvider>
  );
};

export default DMContainer;
