'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDM, Message, PresenceStatus, Attachment } from '@/contexts/DMContext';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import BrandedPdfViewer from '@/components/BrandedPdfViewer';
import { getApiBaseUrl } from '@/lib/config';

interface PopOutChatWindowProps {
  conversationId: string | null;
  recipientId: string;
  recipientUsername: string;
  recipientIconUrl?: string | null;
  isGroup?: boolean;
  groupName?: string;
  participantUsernames?: string[];
}

const StatusBadge: React.FC<{ status: PresenceStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'sm',
}) => {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  };
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return <span className={`${sizeClasses} rounded-full ${colors[status]}`} />;
};

const PopOutChatWindow: React.FC<PopOutChatWindowProps> = ({
  conversationId,
  recipientId,
  recipientUsername,
  recipientIconUrl,
  isGroup = false,
  groupName = 'Group Chat',
  participantUsernames = [],
}) => {
  const {
    socket,
    isConnected,
    conversations,
    messages: allMessages,
    sendMessage,
    createConversation,
    selectConversation,
    typingUsers,
    sendTyping,
    markConversationAsRead,
    onlineUsers,
  } = useDM();

  const { user } = useAuth();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId);
  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUserIconUrl, setCurrentUserIconUrl] = useState<string | null>(null);
  const [currentUserIconError, setCurrentUserIconError] = useState(false);
  const [recipientIconError, setRecipientIconError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
  const [animatingLikeId, setAnimatingLikeId] = useState<string | null>(null);
  const [pdfViewerState, setPdfViewerState] = useState<{
    isOpen: boolean;
    url: string | null;
    filename: string;
  }>({ isOpen: false, url: null, filename: '' });

  // Emoji categories
  const emojiCategories = [
    { name: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🤩', '🥳'] },
    { name: 'Gestures', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🤝', '👊', '✊', '🫶', '❤️', '🧡', '💛'] },
    { name: 'Reactions', emojis: ['🔥', '💯', '⭐', '✨', '💥', '💫', '🎉', '🎊', '🏆', '🥇', '👑', '💎', '🚀', '💡', '✅', '❌', '❓', '❗', '⚡', '🎯'] },
    { name: 'Faces', emojis: ['😢', '😭', '😤', '😠', '😡', '🤬', '😱', '😨', '😰', '😥', '🤔', '🤨', '🧐', '😐', '😑', '😶', '🙄', '😏', '😒', '🤐'] },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get recipient status
  const conversation = conversations.find((c) => c.otherParticipant._id === recipientId);
  const onlineUser = onlineUsers.find((u) => u._id === recipientId);
  const recipientStatus: PresenceStatus = conversation?.otherParticipant?.status || onlineUser?.status || 'offline';

  // Load messages when conversation is selected
  useEffect(() => {
    if (activeConversationId) {
      const conversationMessages = allMessages.filter((m) => (m as any).conversationId === activeConversationId);
      setLocalMessages(conversationMessages);
      loadMessages();
    }
  }, [activeConversationId]);

  // Sync new messages from DMContext
  useEffect(() => {
    if (!activeConversationId) return;
    const conversationMessages = allMessages.filter((m) => (m as any).conversationId === activeConversationId);
    setLocalMessages((prev) => {
      if (conversationMessages.length === 0) return prev;
      const newMessages = conversationMessages.filter((contextMsg) => !prev.some((localMsg) => localMsg._id === contextMsg._id));
      if (newMessages.length > 0) {
        const merged = [...prev];
        newMessages.forEach((msg) => {
          if (!merged.some((m) => m._id === msg._id)) merged.push(msg);
        });
        return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      return prev;
    });
  }, [allMessages, activeConversationId]);

  const loadMessages = async () => {
    if (!activeConversationId) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setIsLoading(true);
    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${activeConversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setLocalMessages(data.messages || []);
        markConversationAsRead(activeConversationId);
      }
    } catch (error) {
      console.error('[PopOutChatWindow] Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch current user's icon
  useEffect(() => {
    const fetchUserIcon = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      try {
        const API_URL = getApiBaseUrl();
        const response = await fetch(`${API_URL}/api/users/me/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          const iconUrl = data.settings?.iconUrl || data.iconUrl || null;
          setCurrentUserIconUrl(iconUrl);
          setCurrentUserIconError(false);
        }
      } catch (error) {
        console.error('[PopOutChatWindow] Error fetching user settings:', error);
      }
    };
    fetchUserIcon();
  }, []);

  // Listen for new messages
  useEffect(() => {
    if (!socket || !activeConversationId) return;
    const handleNewMessage = (message: Message & { conversationId: string }) => {
      if (message.conversationId === activeConversationId) {
        setLocalMessages((prev) => {
          const exists = prev.some((m) => m._id === message._id);
          if (exists) return prev;
          return [...prev, message];
        });
      }
    };
    socket.on('dm:receive', handleNewMessage);
    socket.emit('conversation:join', activeConversationId);
    return () => { socket.off('dm:receive', handleNewMessage); };
  }, [socket, activeConversationId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle send message
  const handleSend = async () => {
    const hasContent = inputValue.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasContent && !hasAttachments) || !isConnected) return;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const newConv = await createConversation(recipientId, recipientUsername);
        convId = newConv._id;
        setActiveConversationId(newConv._id);
      } catch (error) {
        console.error('[PopOutChatWindow] Error creating conversation:', error);
        return;
      }
    }

    const messageType = hasAttachments && pendingAttachments[0].type === 'image' ? 'image' : 'text';
    const content = hasContent ? inputValue.trim() : (hasAttachments ? `Sent ${pendingAttachments[0].filename}` : '');

    const tempMessage: Message = {
      _id: `temp-${Date.now()}`,
      tempId: `temp-${Date.now()}`,
      senderId: 'me',
      senderUsername: 'me',
      content,
      messageType,
      status: 'sending',
      createdAt: new Date(),
      isDeleted: false,
      attachments: hasAttachments ? [...pendingAttachments] : undefined,
    };

    setLocalMessages((prev) => [...prev, tempMessage]);
    setInputValue('');
    setPendingAttachments([]);

    socket?.emit('dm:send', {
      conversationId: convId,
      recipientId,
      content: tempMessage.content,
      clientMessageId: tempMessage.tempId,
      attachments: hasAttachments ? pendingAttachments : undefined,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    sendTyping();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadFileToConversation = useCallback(async (file: File): Promise<Attachment | null> => {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const newConv = await createConversation(recipientId, recipientUsername);
        convId = newConv._id;
        setActiveConversationId(newConv._id);
      } catch (error) {
        console.error('[PopOutChatWindow] Error creating conversation for upload:', error);
        return null;
      }
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${convId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      const data = await response.json();
      return data.attachment as Attachment;
    } catch (error) {
      console.error('[PopOutChatWindow] Error uploading attachment:', error);
      return null;
    }
  }, [activeConversationId, createConversation, recipientId, recipientUsername]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsUploading(true);
    try {
      const attachment = await uploadFileToConversation(file);
      if (attachment) setPendingAttachments((prev) => [...prev, attachment]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputValue((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleDoubleTapLike = (messageId: string) => {
    setLikedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
        setAnimatingLikeId(messageId);
        setTimeout(() => setAnimatingLikeId(null), 700);
      }
      return newSet;
    });
  };

  const currentUserId = user?._id || null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a] dark:bg-[#1e1e1e] border-b border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="relative">
            {isGroup ? (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            ) : recipientIconUrl && !recipientIconError ? (
              <img src={recipientIconUrl} alt={recipientUsername} className="w-10 h-10 rounded-full object-cover" onError={() => setRecipientIconError(true)} />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 font-bold">
                {recipientUsername.charAt(0).toUpperCase()}
              </div>
            )}
            {!isGroup && (
              <div className="absolute -bottom-0.5 -right-0.5">
                <StatusBadge status={recipientStatus} size="md" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">{isGroup ? groupName : recipientUsername}</h1>
            <span className="text-xs text-slate-400 capitalize">{isGroup ? `${participantUsernames.length} members` : recipientStatus}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <svg className="animate-spin h-8 w-8 text-yellow-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : localMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-[#404040] flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Start a conversation</p>
          </div>
        ) : (
          localMessages.map((message) => {
            const isOwnMessage = message.senderId === currentUserId || message.senderId === 'me';
            return (
              <div key={message._id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[70%]`}>
                  {!isOwnMessage && (
                    <div className="flex-shrink-0">
                      {recipientIconUrl && !recipientIconError ? (
                        <img src={recipientIconUrl} alt={recipientUsername} className="w-8 h-8 rounded-full object-cover" onError={() => setRecipientIconError(true)} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 text-sm font-bold">
                          {recipientUsername.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  {isOwnMessage && (
                    <div className="flex-shrink-0">
                      {currentUserIconUrl && !currentUserIconError ? (
                        <img src={currentUserIconUrl} alt={user?.username || 'Me'} className="w-8 h-8 rounded-full object-cover" onError={() => setCurrentUserIconError(true)} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                          {(user?.username || 'M').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    {!isOwnMessage && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1 mb-0.5 block">
                        {isGroup ? (message.senderUsername || 'Unknown') : recipientUsername}
                      </span>
                    )}
                    {isOwnMessage && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1 mb-0.5 block text-right">
                        {user?.username || 'Me'}
                      </span>
                    )}
                    <div
                      onDoubleClick={() => handleDoubleTapLike(message._id)}
                      className={`px-4 py-2.5 rounded-2xl cursor-pointer select-none relative ${
                        isOwnMessage
                          ? 'bg-yellow-500 text-slate-800'
                          : 'bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 shadow-sm'
                      }`}
                    >
                      {animatingLikeId === message._id && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          <span className="text-4xl animate-ping">❤️</span>
                        </div>
                      )}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 space-y-2">
                          {message.attachments.map((attachment, idx) => (
                            <div key={idx}>
                              {attachment.type === 'image' ? (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                                  <img src={attachment.url} alt={attachment.filename} className="max-w-full max-h-64 rounded-lg object-contain cursor-pointer hover:opacity-90" />
                                </a>
                              ) : (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 p-2 rounded-lg ${isOwnMessage ? 'bg-yellow-600/30 hover:bg-yellow-600/40' : 'bg-slate-100 dark:bg-[#404040] hover:bg-slate-200 dark:hover:bg-[#505050]'}`}>
                                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-xs font-medium truncate">{attachment.filename}</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {message.content && !(message.attachments?.length && message.content.startsWith('Sent ')) && (
                        <p className="text-sm break-words">{message.content}</p>
                      )}
                      <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                        <span className={`text-[10px] ${isOwnMessage ? 'text-slate-600' : 'text-slate-400'}`}>
                          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                        </span>
                        {isOwnMessage && (
                          <span className={`text-[10px] ${message.status === 'sending' ? 'text-slate-500' : 'text-slate-600'}`}>
                            {message.status === 'sending' ? '...' : message.status === 'read' ? '✓✓' : '✓'}
                          </span>
                        )}
                        {likedMessages.has(message._id) && <span className="text-[10px] text-red-500">❤️</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {typingUsers.some((t) => t.userId === recipientId) && (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-slate-500">{recipientUsername} is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-[#212121] border-t border-slate-200 dark:border-[#404040]">
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((attachment, index) => (
              <div key={index} className="relative group bg-slate-100 dark:bg-[#2a2a2a] rounded-lg p-2 flex items-center gap-2">
                {attachment.type === 'image' ? (
                  <img src={attachment.url} alt={attachment.filename} className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-slate-200 dark:bg-[#404040] rounded">
                    <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <span className="text-xs text-slate-600 dark:text-slate-400 max-w-[100px] truncate">{attachment.filename}</span>
                <button onClick={() => removePendingAttachment(index)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" onChange={handleFileSelect} accept="image/*,application/pdf,text/plain,text/markdown,application/zip,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={!isConnected || isUploading} className="p-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors disabled:opacity-50" title="Attach file">
            {isUploading ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            )}
          </button>
          <div className="relative">
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={!isConnected} className="p-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors disabled:opacity-50" title="Add emoji">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl border border-slate-200 dark:border-[#404040] overflow-hidden z-50">
                <div className="max-h-72 overflow-y-auto p-3">
                  {emojiCategories.map((category) => (
                    <div key={category.name} className="mb-3 last:mb-0">
                      <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 px-1">{category.name}</h4>
                      <div className="grid grid-cols-8 gap-1">
                        {category.emojis.map((emoji) => (
                          <button key={emoji} onClick={() => handleEmojiSelect(emoji)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-[#404040] rounded transition-colors">{emoji}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <input ref={inputRef} type="text" value={inputValue} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type a message..." disabled={!isConnected} className="flex-1 px-4 py-2.5 text-sm bg-slate-100 dark:bg-[#2a2a2a] border-0 rounded-xl focus:ring-2 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400 disabled:opacity-50" />
          <button onClick={handleSend} disabled={(!inputValue.trim() && pendingAttachments.length === 0) || !isConnected} className="p-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors">
            <svg className="w-5 h-5 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>

      {showEmojiPicker && <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />}
      {pdfViewerState.isOpen && pdfViewerState.url && <BrandedPdfViewer fileUrl={pdfViewerState.url} title={pdfViewerState.filename} onClose={() => setPdfViewerState({ isOpen: false, url: null, filename: '' })} showDownload={true} />}
    </div>
  );
};

export default PopOutChatWindow;
