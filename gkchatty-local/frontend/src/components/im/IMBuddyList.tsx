'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useDM, UserPresence, PresenceStatus } from '@/contexts/DMContext';
import { useIM } from '@/contexts/IMContext';
import { getApiBaseUrl } from '@/lib/config';

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
  const { onlineUsers, isLoadingUsers, refreshOnlineUsers, conversations, refreshConversations, updatePresence, myDndEnabled, myDndUntil, myDndMessage, setDND } = useDM();
  const { openChatWindow, openGroupChatWindow } = useIM();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // Group creation state
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  // Delete group state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    conversationId: string | null;
    groupName: string;
  }>({ isOpen: false, conversationId: null, groupName: '' });
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Status selector state
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [myStatus, setMyStatus] = useState<PresenceStatus>('online');
  const [myCustomStatus, setMyCustomStatus] = useState('');
  const [customStatusInput, setCustomStatusInput] = useState('');

  // DND menu state
  const [isDndMenuOpen, setIsDndMenuOpen] = useState(false);

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

  // Filter group conversations
  const groupConversations = conversations.filter(
    (c) => c.isGroup && c.groupName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle group mode
  const toggleGroupMode = () => {
    if (isGroupMode) {
      // Exit group mode
      setIsGroupMode(false);
      setSelectedUsers(new Set());
      setGroupName('');
      setGroupError('');
    } else {
      setIsGroupMode(true);
    }
  };

  // Toggle user selection in group mode
  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
    setGroupError('');
  };

  // Create group conversation
  const handleCreateGroup = async () => {
    if (selectedUsers.size < 1) {
      setGroupError('Select at least 1 person');
      return;
    }
    if (!groupName.trim()) {
      setGroupError('Enter a group name');
      return;
    }

    setIsCreatingGroup(true);
    setGroupError('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${getApiBaseUrl()}/api/conversations/group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantIds: Array.from(selectedUsers),
          groupName: groupName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create group');
      }

      const data = await response.json();
      console.log('[Group] Created group:', data.conversation);

      // Refresh conversations list
      await refreshConversations();

      // Get participant usernames from the response
      const participantUsernames = data.conversation.participantUsernames || [];

      // Reset and exit group mode
      setIsGroupMode(false);
      setSelectedUsers(new Set());
      setGroupName('');

      // Open the group chat window inline
      openGroupChatWindow(
        data.conversation._id,
        data.conversation.groupName || 'Group Chat',
        participantUsernames
      );
    } catch (error: any) {
      console.error('[Group] Error creating group:', error);
      setGroupError(error.message || 'Failed to create group');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleUserClick = (user: UserPresence) => {
    // In group mode, toggle selection instead of opening chat
    if (isGroupMode) {
      toggleUserSelection(user._id);
      return;
    }

    // Find existing conversation with this user
    const existingConv = conversations.find(
      (c) => c.otherParticipant._id === user._id
    );

    // Open the inline chat window (draggable within the page)
    openChatWindow(user, existingConv?._id || null);
  };

  // Handle clicking on existing group conversation
  const handleGroupClick = (conv: typeof conversations[0]) => {
    // Open the inline group chat window (draggable within the page)
    openGroupChatWindow(
      conv._id,
      conv.groupName || 'Group Chat',
      conv.participantUsernames || []
    );
  };

  // Handle delete group conversation
  const handleDeleteGroup = async () => {
    if (!deleteConfirm.conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setIsDeletingGroup(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/conversations/${deleteConfirm.conversationId}/group`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        console.log('[Group] Deleted group successfully');
        setDeleteConfirm({ isOpen: false, conversationId: null, groupName: '' });
        await refreshConversations();
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to delete group');
      }
    } catch (error) {
      console.error('[Group] Error deleting group:', error);
      alert('Failed to delete group');
    } finally {
      setIsDeletingGroup(false);
    }
  };

  // Open delete confirmation
  const openDeleteConfirm = (conv: typeof conversations[0], e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({
      isOpen: true,
      conversationId: conv._id,
      groupName: conv.groupName || 'Group Chat',
    });
  };

  // Get unread count for a specific user (only for 1-on-1 DMs, not groups)
  const getUnreadCount = (userId: string): number => {
    const conv = conversations.find((c) => !c.isGroup && c.otherParticipant._id === userId);
    return conv?.unreadCount || 0;
  };

  const UserItem: React.FC<{ user: UserPresence }> = ({ user }) => {
    const unreadCount = getUnreadCount(user._id);
    const isSelected = selectedUsers.has(user._id);

    return (
      <button
        onClick={() => handleUserClick(user)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left group ${
          isSelected
            ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-1 ring-yellow-400'
            : 'hover:bg-slate-100 dark:hover:bg-[#2a2a2a]'
        }`}
      >
        {/* Group mode checkbox */}
        {isGroupMode && (
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-yellow-500 border-yellow-500'
                : 'border-slate-400 dark:border-slate-500'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        )}

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

        {/* Username and custom status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {user.username}
            </span>
            {/* DND badge */}
            {user.dndEnabled && (
              <span
                className="flex-shrink-0"
                title={user.dndMessage || 'Do Not Disturb'}
              >
                <svg className="w-3.5 h-3.5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
          {user.customStatus && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate block" title={user.customStatus}>
              {user.customStatus}
            </span>
          )}
          {/* DND message if present */}
          {user.dndEnabled && user.dndMessage && !user.customStatus && (
            <span className="text-xs text-purple-500 dark:text-purple-400 truncate block" title={user.dndMessage}>
              🌙 {user.dndMessage}
            </span>
          )}
        </div>

        {/* Unread badge (hide in group mode) */}
        {!isGroupMode && unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Chat icon on hover (only show if no unread and not in group mode) */}
        {!isGroupMode && unreadCount === 0 && (
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

  // Group conversation item component
  const GroupItem: React.FC<{ conv: typeof conversations[0] }> = ({ conv }) => {
    return (
      <div className="relative group">
        <button
          onClick={() => handleGroupClick(conv)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
        >
          {/* Purple group icon */}
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
          </div>

          {/* Group name */}
          <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {conv.groupName || 'Group Chat'}
          </span>

          {/* Unread badge */}
          {conv.unreadCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center mr-7">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </button>

        {/* Delete button - always visible on right side */}
        <button
          onClick={(e) => openDeleteConfirm(conv, e)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 opacity-60 hover:opacity-100 transition-all"
          title="Delete group"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    );
  };

  // Groups section component (only show when not in group creation mode)
  const GroupsSection: React.FC = () => {
    if (isGroupMode || groupConversations.length === 0) return null;

    return (
      <div className="mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Groups ({groupConversations.length})
          </span>
        </div>
        <div className="space-y-0.5">
          {groupConversations.map((conv) => (
            <GroupItem key={conv._id} conv={conv} />
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
          {isGroupMode ? (
            <>
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <h3 className="text-sm font-semibold text-white">New Group</h3>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Buddy List</h3>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* New Group button */}
          <button
            onClick={toggleGroupMode}
            className={`p-1.5 rounded-lg transition-colors ${
              isGroupMode
                ? 'bg-yellow-500 text-white'
                : 'hover:bg-[#404040] text-slate-400 hover:text-white'
            }`}
            title={isGroupMode ? 'Cancel group' : 'New group chat'}
          >
            {isGroupMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            )}
          </button>
          {/* Close button */}
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
            {/* Groups section - show existing group conversations first */}
            <GroupsSection />
            <StatusGroup title="Online" users={groupedUsers.online} status="online" />
            <StatusGroup title="Away" users={groupedUsers.away} status="away" />
            <StatusGroup title="Busy" users={groupedUsers.busy} status="busy" />
            <StatusGroup title="Offline" users={groupedUsers.offline} status="offline" />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-[#1a1a1a] border-t border-slate-200 dark:border-[#404040]">
        {isGroupMode ? (
          <div className="space-y-2">
            {/* Selected users count */}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''} selected
            </div>

            {/* Group name input */}
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-[#404040] rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-slate-700 dark:text-slate-200 placeholder-slate-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateGroup();
                }
              }}
            />

            {/* Error message */}
            {groupError && (
              <p className="text-xs text-red-500">{groupError}</p>
            )}

            {/* Create button */}
            <button
              onClick={handleCreateGroup}
              disabled={isCreatingGroup || selectedUsers.size < 1 || !groupName.trim()}
              className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white disabled:text-slate-500 dark:disabled:text-slate-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isCreatingGroup ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                  </svg>
                  Create Group
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* DND Toggle */}
            <div className="relative">
              <button
                onClick={() => setIsDndMenuOpen(!isDndMenuOpen)}
                className={`w-full flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${
                  myDndEnabled
                    ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700'
                    : 'bg-white dark:bg-[#2a2a2a] border-slate-300 dark:border-[#404040] hover:bg-slate-50 dark:hover:bg-[#333]'
                }`}
              >
                <svg className={`w-4 h-4 ${myDndEnabled ? 'text-purple-500' : 'text-slate-400'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
                <span className={`flex-1 text-left text-sm ${myDndEnabled ? 'text-purple-700 dark:text-purple-300 font-medium' : 'text-slate-700 dark:text-slate-200'}`}>
                  {myDndEnabled ? (
                    <>
                      Do Not Disturb
                      {myDndUntil && (
                        <span className="text-xs ml-1 opacity-75">
                          (until {new Date(myDndUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      )}
                    </>
                  ) : (
                    'Do Not Disturb'
                  )}
                </span>
                {myDndEnabled ? (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-500 text-white rounded">ON</span>
                ) : (
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isDndMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* DND dropdown */}
              {isDndMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#404040] rounded-lg shadow-lg overflow-hidden z-10">
                  {/* Disable DND option (only show if DND is enabled) */}
                  {myDndEnabled && (
                    <button
                      onClick={() => {
                        setDND(false);
                        setIsDndMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors text-green-600 dark:text-green-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <span className="text-sm font-medium">Turn Off DND</span>
                    </button>
                  )}

                  {/* DND duration options */}
                  {!myDndEnabled && (
                    <>
                      <button
                        onClick={() => {
                          const until = new Date();
                          until.setHours(until.getHours() + 1);
                          setDND(true, until, 'Back in 1 hour');
                          setIsDndMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-slate-700 dark:text-slate-200">For 1 hour</span>
                      </button>
                      <button
                        onClick={() => {
                          const until = new Date();
                          until.setHours(until.getHours() + 2);
                          setDND(true, until, 'Back in 2 hours');
                          setIsDndMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-slate-700 dark:text-slate-200">For 2 hours</span>
                      </button>
                      <button
                        onClick={() => {
                          const until = new Date();
                          until.setHours(23, 59, 59, 999);
                          setDND(true, until, 'Back tomorrow');
                          setIsDndMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        </svg>
                        <span className="text-sm text-slate-700 dark:text-slate-200">Until tomorrow</span>
                      </button>
                      <button
                        onClick={() => {
                          setDND(true, null, null);
                          setIsDndMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors border-t border-slate-200 dark:border-[#404040]"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <span className="text-sm text-slate-700 dark:text-slate-200">Until I turn it off</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Status selector */}
            <div className="relative">
              <button
                onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-[#404040] rounded-lg hover:bg-slate-50 dark:hover:bg-[#333] transition-colors"
              >
                <StatusBadge status={myStatus} />
                <span className="flex-1 text-left text-sm text-slate-700 dark:text-slate-200">
                  {myStatus.charAt(0).toUpperCase() + myStatus.slice(1)}
                  {myCustomStatus && (
                    <span className="text-slate-500 dark:text-slate-400 ml-1">- {myCustomStatus}</span>
                  )}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isStatusMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Status dropdown */}
              {isStatusMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#404040] rounded-lg shadow-lg overflow-hidden z-10">
                  {/* Status options */}
                  {(['online', 'away', 'busy'] as PresenceStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setMyStatus(status);
                        updatePresence(status, myCustomStatus || undefined);
                        setIsStatusMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors ${
                        myStatus === status ? 'bg-slate-50 dark:bg-[#333]' : ''
                      }`}
                    >
                      <StatusBadge status={status} />
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                      {myStatus === status && (
                        <svg className="w-4 h-4 text-green-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}

                  {/* Custom status input */}
                  <div className="border-t border-slate-200 dark:border-[#404040] p-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customStatusInput}
                        onChange={(e) => setCustomStatusInput(e.target.value.slice(0, 100))}
                        placeholder="What's happening?"
                        className="flex-1 px-2 py-1.5 text-sm bg-slate-100 dark:bg-[#1a1a1a] border-0 rounded focus:ring-1 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            setMyCustomStatus(customStatusInput);
                            updatePresence(myStatus, customStatusInput || undefined);
                            setIsStatusMenuOpen(false);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          setMyCustomStatus(customStatusInput);
                          updatePresence(myStatus, customStatusInput || undefined);
                          setIsStatusMenuOpen(false);
                        }}
                        className="px-2 py-1.5 text-xs font-medium bg-yellow-500 hover:bg-yellow-600 text-white rounded transition-colors"
                      >
                        Set
                      </button>
                    </div>
                    {myCustomStatus && (
                      <button
                        onClick={() => {
                          setMyCustomStatus('');
                          setCustomStatusInput('');
                          updatePresence(myStatus, '');
                          setIsStatusMenuOpen(false);
                        }}
                        className="mt-2 text-xs text-red-500 hover:text-red-600"
                      >
                        Clear custom status
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Refresh button */}
            <button
              onClick={() => refreshOnlineUsers()}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-yellow-600 dark:hover:text-yellow-500 transition-colors"
            >
              Refresh list
            </button>
          </div>
        )}
      </div>

      {/* Delete Group Confirmation Dialog */}
      {deleteConfirm.isOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-xl"
          onClick={() => setDeleteConfirm({ isOpen: false, conversationId: null, groupName: '' })}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl p-4 mx-4 max-w-[250px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Delete Group?</h3>
                <p className="text-xs text-slate-500">This cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Delete &quot;{deleteConfirm.groupName}&quot; and all messages?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, conversationId: null, groupName: '' })}
                className="flex-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#404040] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroup}
                disabled={isDeletingGroup}
                className="flex-1 px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isDeletingGroup ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IMBuddyList;
