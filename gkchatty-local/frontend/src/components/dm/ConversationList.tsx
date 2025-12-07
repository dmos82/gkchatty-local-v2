'use client';

import React, { useState } from 'react';
import { useDM, Conversation, UserPresence } from '@/contexts/DMContext';
import { ConversationItem } from './ConversationItem';
import { PresenceBadge } from './PresenceBadge';

interface ConversationListProps {
  onSelectConversation: (conversation: Conversation) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onSelectConversation }) => {
  const {
    conversations,
    selectedConversation,
    isLoadingConversations,
    onlineUsers,
    isLoadingUsers,
    createConversation,
    selectConversation,
    refreshOnlineUsers,
  } = useDM();

  const [showNewConversation, setShowNewConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleStartConversation = async (user: UserPresence) => {
    setIsCreating(true);
    try {
      const conversation = await createConversation(user._id, user.username);
      selectConversation(conversation);
      onSelectConversation(conversation);
      setShowNewConversation(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredUsers = onlineUsers.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredConversations = conversations.filter((conv) =>
    conv.otherParticipant.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Messages</h2>
          <button
            onClick={() => {
              setShowNewConversation(!showNewConversation);
              if (!showNewConversation) {
                refreshOnlineUsers();
              }
            }}
            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="New conversation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder={showNewConversation ? 'Search users...' : 'Search conversations...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showNewConversation ? (
          // User list for starting new conversation
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoadingUsers ? (
              <div className="p-4 text-center text-gray-500">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {searchQuery ? 'No users found' : 'No other users available'}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleStartConversation(user)}
                  disabled={isCreating}
                  className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-semibold">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <PresenceBadge status={user.status} size="sm" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {user.status}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          // Conversation list
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoadingConversations ? (
              <div className="p-4 text-center text-gray-500">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-gray-300"
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
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm mt-1">Click + to start a new conversation</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  isSelected={selectedConversation?._id === conversation._id}
                  onClick={() => {
                    selectConversation(conversation);
                    onSelectConversation(conversation);
                  }}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
