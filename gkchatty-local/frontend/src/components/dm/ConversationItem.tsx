'use client';

import React from 'react';
import { Conversation } from '@/contexts/DMContext';
import { PresenceBadge } from './PresenceBadge';
import { formatDistanceToNow } from 'date-fns';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isSelected,
  onClick,
}) => {
  const { otherParticipant, lastMessage, unreadCount, updatedAt } = conversation;

  const formatTime = (date: Date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const truncateMessage = (content: string, maxLength = 40) => {
    if (!content) return 'No messages yet';
    return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
  };

  return (
    <button
      onClick={onClick}
      className={`w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500' : ''
      }`}
    >
      {/* Avatar with presence */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
          {otherParticipant.username.charAt(0).toUpperCase()}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5">
          <PresenceBadge status={otherParticipant.status} size="md" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <h3 className="font-medium text-gray-900 dark:text-white truncate">
            {otherParticipant.username}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
            {formatTime(updatedAt)}
          </span>
        </div>

        <div className="flex justify-between items-center mt-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {lastMessage
              ? `${lastMessage.senderUsername === otherParticipant.username ? '' : 'You: '}${truncateMessage(lastMessage.content)}`
              : 'Start a conversation'}
          </p>

          {unreadCount > 0 && (
            <span className="ml-2 flex-shrink-0 bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default ConversationItem;
