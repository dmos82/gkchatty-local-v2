'use client';

import React, { useEffect, useState } from 'react';
import { useDM, PresenceStatus } from '@/contexts/DMContext';
import { useIM } from '@/contexts/IMContext';
import { getApiBaseUrl } from '@/lib/config';

const StatusBadge: React.FC<{ status: PresenceStatus }> = ({ status }) => {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  };
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[status]} ring-2 ring-white dark:ring-[#212121]`} />;
};

const PopOutBuddyList: React.FC = () => {
  const { onlineUsers, isLoadingUsers, refreshOnlineUsers, conversations, refreshConversations, isConnected } = useDM();
  const { openChatWindow, openGroupChatWindow } = useIM();
  const [searchQuery, setSearchQuery] = useState('');
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  // Refresh online users on mount
  useEffect(() => {
    refreshOnlineUsers();
  }, [refreshOnlineUsers]);

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

  const toggleGroupMode = () => {
    if (isGroupMode) {
      setIsGroupMode(false);
      setSelectedUsers(new Set());
      setGroupName('');
      setGroupError('');
    } else {
      setIsGroupMode(true);
    }
  };

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
      const selectedUsernames = onlineUsers
        .filter((u) => selectedUsers.has(u._id))
        .map((u) => u.username);

      // Open chat window for the new group (but in pop-out, we'll open in a new window)
      const params = new URLSearchParams({
        conversationId: data.conversation._id,
        recipientId: '',
        recipientUsername: '',
        isGroup: 'true',
        groupName: groupName.trim(),
        participants: selectedUsernames.join(','),
      });
      window.open(`/im/chat?${params.toString()}`, `chat-${data.conversation._id}`, 'width=400,height=600,menubar=no,toolbar=no,location=no,status=no');

      // Reset state
      setIsGroupMode(false);
      setSelectedUsers(new Set());
      setGroupName('');
      refreshConversations();
    } catch (error: any) {
      setGroupError(error.message || 'Failed to create group');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleUserClick = (user: typeof onlineUsers[0]) => {
    if (isGroupMode) {
      toggleUserSelection(user._id);
    } else {
      // Open chat in new pop-out window
      const params = new URLSearchParams({
        conversationId: '',
        recipientId: user._id,
        recipientUsername: user.username,
        ...(user.iconUrl && { recipientIconUrl: user.iconUrl }),
        isGroup: 'false',
      });
      window.open(`/im/chat?${params.toString()}`, `chat-${user._id}`, 'width=400,height=600,menubar=no,toolbar=no,location=no,status=no');
    }
  };

  const handleGroupClick = (conv: typeof conversations[0]) => {
    const params = new URLSearchParams({
      conversationId: conv._id,
      recipientId: '',
      recipientUsername: '',
      isGroup: 'true',
      groupName: conv.groupName || 'Group Chat',
      participants: (conv.participantUsernames || []).join(','),
    });
    window.open(`/im/chat?${params.toString()}`, `chat-${conv._id}`, 'width=400,height=600,menubar=no,toolbar=no,location=no,status=no');
  };

  const renderUserItem = (user: typeof onlineUsers[0]) => (
    <button
      key={user._id}
      onClick={() => handleUserClick(user)}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors text-left ${
        isGroupMode && selectedUsers.has(user._id) ? 'bg-yellow-50 dark:bg-yellow-900/20 ring-1 ring-yellow-500' : ''
      }`}
    >
      {isGroupMode && (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          selectedUsers.has(user._id) ? 'bg-yellow-500 border-yellow-500' : 'border-slate-400 dark:border-slate-600'
        }`}>
          {selectedUsers.has(user._id) && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      )}
      <div className="relative">
        {user.iconUrl ? (
          <img src={user.iconUrl} alt={user.username} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 font-semibold">
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5">
          <StatusBadge status={user.status} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{user.username}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user.status}</p>
      </div>
    </button>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-white dark:bg-[#212121]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a] dark:bg-[#1e1e1e] border-b border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Buddy List</h1>
            <span className="text-xs text-slate-400">{onlineUsers.filter((u) => u.status === 'online').length} online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#404040]">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-100 dark:bg-[#2a2a2a] border-0 rounded-lg focus:ring-2 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Group Mode Controls */}
      {isGroupMode && (
        <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <input
            type="text"
            placeholder="Group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#404040] rounded-lg focus:ring-2 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400 mb-2"
          />
          {groupError && <p className="text-xs text-red-500 mb-2">{groupError}</p>}
          <div className="flex gap-2">
            <button onClick={toggleGroupMode} className="flex-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#404040] rounded-lg transition-colors">Cancel</button>
            <button onClick={handleCreateGroup} disabled={isCreatingGroup} className="flex-1 px-3 py-2 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
              {isCreatingGroup ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Creating...
                </>
              ) : `Create (${selectedUsers.size})`}
            </button>
          </div>
        </div>
      )}

      {/* User List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingUsers ? (
          <div className="flex items-center justify-center h-32">
            <svg className="animate-spin h-8 w-8 text-yellow-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <>
            {/* Group Chats Section */}
            {groupConversations.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#1a1a1a]">
                  Group Chats ({groupConversations.length})
                </div>
                {groupConversations.map((conv) => (
                  <button
                    key={conv._id}
                    onClick={() => handleGroupClick(conv)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{conv.groupName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{conv.participantUsernames?.length || 0} members</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Online Users */}
            {groupedUsers.online.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#1a1a1a]">Online ({groupedUsers.online.length})</div>
                {groupedUsers.online.map(renderUserItem)}
              </div>
            )}

            {/* Away Users */}
            {groupedUsers.away.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#1a1a1a]">Away ({groupedUsers.away.length})</div>
                {groupedUsers.away.map(renderUserItem)}
              </div>
            )}

            {/* Busy Users */}
            {groupedUsers.busy.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#1a1a1a]">Busy ({groupedUsers.busy.length})</div>
                {groupedUsers.busy.map(renderUserItem)}
              </div>
            )}

            {/* Offline Users */}
            {groupedUsers.offline.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#1a1a1a]">Offline ({groupedUsers.offline.length})</div>
                {groupedUsers.offline.map(renderUserItem)}
              </div>
            )}

            {filteredUsers.length === 0 && groupConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">No users found</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-[#404040] bg-slate-50 dark:bg-[#1a1a1a]">
        <button
          onClick={toggleGroupMode}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            isGroupMode
              ? 'bg-slate-200 dark:bg-[#404040] text-slate-700 dark:text-slate-300'
              : 'bg-yellow-500 hover:bg-yellow-600 text-slate-800'
          }`}
        >
          {isGroupMode ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit Group Mode
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Create Group Chat
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PopOutBuddyList;
