'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useDM, Conversation, Message } from '@/contexts/DMContext';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { PresenceBadge } from './PresenceBadge';

interface ConversationViewProps {
  conversation: Conversation;
  currentUserId: string;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversation,
  currentUserId,
}) => {
  const {
    messages,
    isLoadingMessages,
    hasMoreMessages,
    sendMessage,
    loadMoreMessages,
    typingUsers,
    sendTyping,
  } = useDM();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Infinite scroll for loading more messages
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMessages || !hasMoreMessages) return;

    // Load more when scrolled near the top
    if (container.scrollTop < 100) {
      loadMoreMessages();
    }
  }, [isLoadingMessages, hasMoreMessages, loadMoreMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Group messages by date
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt).toDateString();
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ date: messageDate, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            {conversation.otherParticipant.username.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5">
            <PresenceBadge status={conversation.otherParticipant.status} size="sm" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {conversation.otherParticipant.username}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
            {conversation.otherParticipant.status}
            {conversation.otherParticipant.status === 'offline' &&
              conversation.otherParticipant.lastSeenAt && (
                <span className="ml-1">
                  - Last seen{' '}
                  {new Date(conversation.otherParticipant.lastSeenAt).toLocaleDateString()}
                </span>
              )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Search in conversation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
          <button
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="More options"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Load more trigger */}
        {hasMoreMessages && (
          <div ref={loadMoreTriggerRef} className="text-center py-2">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-sm">Loading messages...</span>
              </div>
            ) : (
              <button
                onClick={loadMoreMessages}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                Load earlier messages
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !isLoadingMessages && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Start a conversation
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Send a message to {conversation.otherParticipant.username}
            </p>
          </div>
        )}

        {/* Message groups */}
        {messageGroups.map((group) => (
          <div key={group.date}>
            {/* Date divider */}
            <div className="flex items-center justify-center my-4">
              <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {formatDateHeader(group.date)}
                </span>
              </div>
            </div>

            {/* Messages for this date */}
            {group.messages.map((message, index) => {
              const isOwn = message.senderId === currentUserId || message.senderId === 'me';
              const prevMessage = index > 0 ? group.messages[index - 1] : null;
              const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

              return (
                <MessageItem
                  key={message._id}
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  senderName={conversation.otherParticipant.username}
                />
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSendMessage={sendMessage}
        onTyping={sendTyping}
        placeholder={`Message ${conversation.otherParticipant.username}...`}
      />
    </div>
  );
};

export default ConversationView;
