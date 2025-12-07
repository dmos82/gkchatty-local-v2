'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useDM, UserPresence, PresenceStatus } from '@/contexts/DMContext';
import { useIM } from '@/contexts/IMContext';

interface IMBuddyListProps {
  onClose: () => void;
}

const StatusBadge: React.FC<{ status: PresenceStatus }> = ({ status }) => {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  };

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${colors[status]} ring-2 ring-white dark:ring-[#212121]`}
    />
  );
};

export const IMBuddyList: React.FC<IMBuddyListProps> = ({ onClose }) => {
  const { onlineUsers, isLoadingUsers, refreshOnlineUsers, conversations } = useDM();
  const { openChatWindow } = useIM();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // Animated close handler
  const handleAnimatedClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  // Refresh online users on mount
  useEffect(() => {
    refreshOnlineUsers();
  }, [refreshOnlineUsers]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleAnimatedClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Filter users by search query
  const filteredUsers = onlineUsers.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group users by status
  const groupedUsers = {
    online: filteredUsers.filter((u) => u.status === 'online'),
    away: filteredUsers.filter((u) => u.status === 'away'),
    busy: filteredUsers.filter((u) => u.status === 'busy'),
    offline: filteredUsers.filter((u) => u.status === 'offline'),
  };

  const handleUserClick = (user: UserPresence) => {
    // Find existing conversation with this user
    const existingConv = conversations.find(
      (c) => c.otherParticipant._id === user._id
    );
    openChatWindow(user, existingConv?._id || null);
  };

  // Get unread count for a specific user
  const getUnreadCount = (userId: string): number => {
    const conv = conversations.find((c) => c.otherParticipant._id === userId);
    return conv?.unreadCount || 0;
  };

  const UserItem: React.FC<{ user: UserPresence }> = ({ user }) => {
    const unreadCount = getUnreadCount(user._id);

    return (
      <button
        onClick={() => handleUserClick(user)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors text-left group"
      >
        {/* Avatar */}
        <div className="relative">
          {user.iconUrl ? (
            <img
              src={user.iconUrl}
              alt={user.username}
              className="w-9 h-9 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 font-semibold text-sm shadow-sm">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5">
            <StatusBadge status={user.status} />
          </div>
        </div>

        {/* Username */}
        <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
          {user.username}
        </span>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Chat icon on hover (only show if no unread) */}
        {unreadCount === 0 && (
          <svg
            className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>
    );
  };

  const StatusGroup: React.FC<{ title: string; users: UserPresence[]; status: PresenceStatus }> = ({
    title,
    users,
    status,
  }) => {
    if (users.length === 0) return null;

    return (
      <div className="mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <StatusBadge status={status} />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {title} ({users.length})
          </span>
        </div>
        <div className="space-y-0.5">
          {users.map((user) => (
            <UserItem key={user._id} user={user} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-16 right-4 w-72 bg-white dark:bg-[#212121] rounded-xl shadow-2xl border border-slate-200 dark:border-[#404040] overflow-hidden z-50 ${
        isClosing
          ? 'animate-scaleOut'
          : 'animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200'
      }`}
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a] dark:bg-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-white">Buddy List</h3>
        </div>
        <button
          onClick={handleAnimatedClose}
          className="p-1 rounded-lg hover:bg-[#404040] transition-colors"
        >
          <svg
            className="w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-[#404040]">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
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
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-[#2a2a2a] border-0 rounded-lg focus:ring-2 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400"
          />
        </div>
      </div>

      {/* User list */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: '350px' }}>
        {isLoadingUsers ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-6 w-6 text-yellow-500"
              viewBox="0 0 24 24"
            >
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
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchQuery ? 'No users found' : 'No users online'}
            </p>
          </div>
        ) : (
          <>
            <StatusGroup title="Online" users={groupedUsers.online} status="online" />
            <StatusGroup title="Away" users={groupedUsers.away} status="away" />
            <StatusGroup title="Busy" users={groupedUsers.busy} status="busy" />
            <StatusGroup title="Offline" users={groupedUsers.offline} status="offline" />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-[#1a1a1a] border-t border-slate-200 dark:border-[#404040]">
        <button
          onClick={() => refreshOnlineUsers()}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-yellow-600 dark:hover:text-yellow-500 transition-colors"
        >
          Refresh list
        </button>
      </div>
    </div>
  );
};

export default IMBuddyList;
