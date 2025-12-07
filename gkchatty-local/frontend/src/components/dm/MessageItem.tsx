'use client';

import React from 'react';
import { Message } from '@/contexts/DMContext';
import { format } from 'date-fns';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  senderName?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  showAvatar = true,
  senderName,
}) => {
  const formatTime = (date: Date) => {
    try {
      return format(new Date(date), 'h:mm a');
    } catch {
      return '';
    }
  };

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return (
          <svg className="w-3 h-3 text-gray-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" />
          </svg>
        );
      case 'sent':
        return (
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'read':
        return (
          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        {showAvatar && !isOwn && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {(senderName || message.senderUsername).charAt(0).toUpperCase()}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`group relative px-4 py-2.5 rounded-2xl ${
            isOwn
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
          }`}
        >
          {/* Reply indicator */}
          {message.replyTo && (
            <div
              className={`mb-2 pb-2 border-b text-sm opacity-75 ${
                isOwn ? 'border-blue-400' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <p className="font-medium text-xs">{message.replyTo.senderUsername}</p>
              <p className="truncate">{message.replyTo.content}</p>
            </div>
          )}

          {/* Message content */}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment, index) => (
                <a
                  key={index}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2 rounded ${
                    isOwn ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                  <span className="text-sm truncate">{attachment.name}</span>
                </a>
              ))}
            </div>
          )}

          {/* Time and status */}
          <div
            className={`flex items-center gap-1 mt-1 text-xs ${
              isOwn ? 'text-blue-100 justify-end' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <span>{formatTime(message.createdAt)}</span>
            {message.editedAt && <span>(edited)</span>}
            {isOwn && <span className="ml-1">{getStatusIcon()}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
