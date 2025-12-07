'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDM, Message, PresenceStatus, Attachment } from '@/contexts/DMContext';
import { useIM } from '@/contexts/IMContext';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import BrandedPdfViewer from '@/components/BrandedPdfViewer';
import { getApiBaseUrl } from '@/lib/config';

interface IMChatWindowProps {
  windowId: string;
  recipientId: string;
  recipientUsername: string;
  recipientIconUrl?: string | null;
  conversationId: string | null;
  isMinimized: boolean;
  position: { x: number; y: number };
  zIndex: number;
  // Group chat props
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

export const IMChatWindow: React.FC<IMChatWindowProps> = ({
  windowId,
  recipientId,
  recipientUsername,
  recipientIconUrl,
  conversationId,
  isMinimized,
  position,
  zIndex,
  isGroup = false,
  groupName,
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

  const {
    closeChatWindow,
    minimizeChatWindow,
    restoreChatWindow,
    bringToFront,
    updateWindowPosition,
    setConversationId,
  } = useIM();

  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentUserIconUrl, setCurrentUserIconUrl] = useState<string | null>(null);
  const [currentUserIconError, setCurrentUserIconError] = useState(false);
  const [recipientIconError, setRecipientIconError] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isClosingAnimation, setIsClosingAnimation] = useState(false);
  const [isMinimizingAnimation, setIsMinimizingAnimation] = useState(false);
  const [isRestoringAnimation, setIsRestoringAnimation] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [attachmentActionDialog, setAttachmentActionDialog] = useState<{
    isOpen: boolean;
    attachment: Attachment | null;
  }>({ isOpen: false, attachment: null });
  const [isSavingToMyDocs, setIsSavingToMyDocs] = useState(false);
  const [pdfViewerState, setPdfViewerState] = useState<{
    isOpen: boolean;
    url: string | null;
    filename: string;
  }>({ isOpen: false, url: null, filename: '' });
  const [isLoadingPdfUrl, setIsLoadingPdfUrl] = useState(false);

  // Group management state
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<Set<string>>(new Set());
  const [availableUsers, setAvailableUsers] = useState<Array<{ _id: string; username: string; iconUrl?: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get recipient's presence status - check conversations first, then fall back to onlineUsers
  const conversation = conversations.find((c) => c.otherParticipant._id === recipientId);
  const onlineUser = onlineUsers.find((u) => u._id === recipientId);
  const recipientStatus: PresenceStatus =
    conversation?.otherParticipant?.status ||
    onlineUser?.status ||
    'offline';

  // Reset recipient icon error when recipient changes
  useEffect(() => {
    setRecipientIconError(false);
  }, [recipientId, recipientIconUrl]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (conversationId) {
      console.log('[IMChatWindow] === CONVERSATION OPENED ===');
      console.log('[IMChatWindow] conversationId:', conversationId);
      console.log('[IMChatWindow] recipientUsername:', recipientUsername);
      // Get messages from context for this conversation
      const conversationMessages = allMessages.filter(
        (m) => (m as any).conversationId === conversationId
      );
      console.log('[IMChatWindow] Context messages for this conversation:', conversationMessages.length);
      setLocalMessages(conversationMessages);

      // Also fetch from server
      loadMessages();
    }
  }, [conversationId]);

  // Sync new messages from DMContext when they arrive
  // This handles messages received via socket that update allMessages
  useEffect(() => {
    if (!conversationId) return;

    const conversationMessages = allMessages.filter(
      (m) => (m as any).conversationId === conversationId
    );

    // Only update if there are new messages (compare by length and last message ID)
    setLocalMessages((prev) => {
      if (conversationMessages.length === 0) return prev;

      // Check if there are new messages from context that aren't in localMessages
      const newMessages = conversationMessages.filter(
        (contextMsg) => !prev.some((localMsg) => localMsg._id === contextMsg._id)
      );

      if (newMessages.length > 0) {
        console.log('[IMChatWindow] Syncing', newMessages.length, 'new messages from DMContext');
        // Merge: keep local messages and add any new ones from context
        const merged = [...prev];
        newMessages.forEach((msg) => {
          if (!merged.some((m) => m._id === msg._id)) {
            merged.push(msg);
          }
        });
        // Sort by creation date
        return merged.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      return prev;
    });
  }, [allMessages, conversationId]);

  const loadMessages = async () => {
    if (!conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setIsLoading(true);
    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[IMChatWindow] API Response - messages count:', data.messages?.length || 0);

        // Debug attachments with full details
        const messagesWithAttachments = data.messages?.filter((msg: any) => msg.attachments && msg.attachments.length > 0) || [];
        console.log('[IMChatWindow] Messages with attachments:', messagesWithAttachments.length);
        messagesWithAttachments.forEach((msg: any) => {
          console.log(`[IMChatWindow] Message ${msg._id}:`, {
            content: msg.content?.substring(0, 30),
            attachmentCount: msg.attachments.length,
            attachments: msg.attachments.map((a: any) => ({ type: a.type, filename: a.filename }))
          });
        });

        setLocalMessages(data.messages || []);
        console.log('[IMChatWindow] localMessages set with', data.messages?.length || 0, 'messages');

        // Mark conversation as read after loading messages
        markConversationAsRead(conversationId);
      }
    } catch (error) {
      console.error('[IMChatWindow] Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch current user's icon URL from settings
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
          // Settings endpoint returns { settings: { iconUrl, ... } } or { iconUrl, ... }
          const iconUrl = data.settings?.iconUrl || data.iconUrl || null;
          setCurrentUserIconUrl(iconUrl);
          setCurrentUserIconError(false); // Reset error state when new URL is fetched
        }
      } catch (error) {
        console.error('[IMChatWindow] Error fetching user settings:', error);
      }
    };

    fetchUserIcon();
  }, []);

  // Listen for new messages via socket
  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewMessage = (message: Message & { conversationId: string }) => {
      if (message.conversationId === conversationId) {
        setLocalMessages((prev) => {
          const exists = prev.some((m) => m._id === message._id);
          if (exists) return prev;
          return [...prev, message];
        });
      }
    };

    socket.on('dm:receive', handleNewMessage);

    // Join conversation room (backend expects 'conversation:join' with just the ID string)
    socket.emit('conversation:join', conversationId);

    return () => {
      socket.off('dm:receive', handleNewMessage);
    };
  }, [socket, conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  // Focus input when window is opened
  useEffect(() => {
    if (!isMinimized) {
      inputRef.current?.focus();
    }
  }, [isMinimized]);

  // Handle send message
  const handleSend = async () => {
    const hasContent = inputValue.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;

    if ((!hasContent && !hasAttachments) || !isConnected) return;

    let activeConversationId = conversationId;

    // Create conversation if needed
    if (!activeConversationId) {
      try {
        const newConv = await createConversation(recipientId, recipientUsername);
        activeConversationId = newConv._id;
        setConversationId(windowId, newConv._id);
      } catch (error) {
        console.error('[IMChatWindow] Error creating conversation:', error);
        return;
      }
    }

    // Determine message type
    const messageType = hasAttachments && pendingAttachments[0].type === 'image' ? 'image' : 'text';
    const content = hasContent ? inputValue.trim() : (hasAttachments ? `Sent ${pendingAttachments[0].filename}` : '');

    // Add optimistic message
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

    // Send via socket
    socket?.emit('dm:send', {
      conversationId: activeConversationId,
      recipientId,
      content: tempMessage.content,
      clientMessageId: tempMessage.tempId,
      attachments: hasAttachments ? pendingAttachments : undefined,
    });
  };

  // Handle typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    sendTyping();
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Local upload function that uses conversationId prop directly
  const uploadFileToConversation = useCallback(
    async (file: File): Promise<Attachment | null> => {
      const token = localStorage.getItem('accessToken');
      if (!token || !conversationId) {
        console.error('[IMChatWindow] Cannot upload: no token or conversationId');
        return null;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        console.log('[IMChatWindow] Uploading attachment:', file.name, 'to conversation:', conversationId);
        const API_URL = getApiBaseUrl();
        const response = await fetch(
          `${API_URL}/api/conversations/${conversationId}/attachments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        console.log('[IMChatWindow] Attachment uploaded:', data.attachment);
        return data.attachment as Attachment;
      } catch (error) {
        console.error('[IMChatWindow] Error uploading attachment:', error);
        return null;
      }
    },
    [conversationId]
  );

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);

    try {
      const attachment = await uploadFileToConversation(file);
      if (attachment) {
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (error) {
      console.error('[IMChatWindow] Error uploading file:', error);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove pending attachment
  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Attachment action dialog handlers
  const handleAttachmentClick = (attachment: Attachment, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentActionDialog({ isOpen: true, attachment });
  };

  const handleCloseAttachmentDialog = () => {
    setAttachmentActionDialog({ isOpen: false, attachment: null });
  };

  const handleDownloadAttachment = () => {
    if (!attachmentActionDialog.attachment) return;

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = attachmentActionDialog.attachment.url;
    link.download = attachmentActionDialog.attachment.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    handleCloseAttachmentDialog();
  };

  const handleViewPdf = async () => {
    if (!attachmentActionDialog.attachment || !conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('[IMChatWindow] No auth token for viewing PDF');
      return;
    }

    const { s3Key, filename, mimeType } = attachmentActionDialog.attachment;

    if (!s3Key) {
      // Fall back to using the stored URL (might be expired but try anyway)
      setPdfViewerState({
        isOpen: true,
        url: attachmentActionDialog.attachment.url,
        filename: filename || 'document.pdf',
      });
      handleCloseAttachmentDialog();
      return;
    }

    setIsLoadingPdfUrl(true);

    try {
      // Use streaming endpoint to bypass S3 CORS issues
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${conversationId}/attachments/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ s3Key, filename, mimeType }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to stream PDF';
        try {
          const error = await response.json();
          errorMsg = error.error || errorMsg;
        } catch {
          // Response might not be JSON
        }
        throw new Error(errorMsg);
      }

      // Stream returns the file directly as blob - create object URL for pdf.js
      const blob = await response.blob();
      console.log(`[IMChatWindow] Received PDF blob. Type: ${blob.type}, Size: ${blob.size}`);

      if (blob.size === 0) {
        throw new Error('Received empty PDF file from server');
      }

      const objectUrl = URL.createObjectURL(blob);

      setPdfViewerState({
        isOpen: true,
        url: objectUrl,
        filename: filename || 'document.pdf',
      });
      handleCloseAttachmentDialog();
    } catch (error) {
      console.error('[IMChatWindow] Error streaming PDF:', error);
      alert('Failed to open PDF. Please try downloading instead.');
    } finally {
      setIsLoadingPdfUrl(false);
    }
  };

  const handleClosePdfViewer = () => {
    // Revoke the blob URL to free memory
    if (pdfViewerState.url && pdfViewerState.url.startsWith('blob:')) {
      URL.revokeObjectURL(pdfViewerState.url);
    }
    setPdfViewerState({ isOpen: false, url: null, filename: '' });
  };

  const handleSaveToMyDocs = async () => {
    if (!attachmentActionDialog.attachment || !conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('[IMChatWindow] No auth token for saving to My Docs');
      return;
    }

    setIsSavingToMyDocs(true);

    try {
      const { s3Key, filename, size, mimeType } = attachmentActionDialog.attachment;

      if (!s3Key) {
        throw new Error('Attachment missing s3Key - cannot copy to My Docs');
      }

      // Call backend endpoint to copy file server-side (avoids CORS issues)
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${conversationId}/attachments/copy-to-docs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          s3Key,
          filename,
          size,
          mimeType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save to My Docs');
      }

      const result = await response.json();
      console.log('[IMChatWindow] File saved to My Docs:', result.filename, 'Document ID:', result.documentId);
      handleCloseAttachmentDialog();

      // Show success feedback
      alert('File saved to My Documents!');
    } catch (error) {
      console.error('[IMChatWindow] Error saving to My Docs:', error);
      alert('Failed to save file. Please try again.');
    } finally {
      setIsSavingToMyDocs(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsFileDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container (not entering a child)
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsFileDragOver(false);
      }
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Upload first file (can be extended to support multiple)
    const file = files[0];
    setIsUploading(true);

    try {
      const attachment = await uploadFileToConversation(file);
      if (attachment) {
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (error) {
      console.error('[IMChatWindow] Error uploading dropped file:', error);
    } finally {
      setIsUploading(false);
    }
  }, [uploadFileToConversation]);

  // Animated close handler
  const handleAnimatedClose = () => {
    setIsClosingAnimation(true);
    setTimeout(() => {
      closeChatWindow(windowId);
    }, 200);
  };

  // Animated minimize handler
  const handleAnimatedMinimize = () => {
    setIsMinimizingAnimation(true);
    setTimeout(() => {
      minimizeChatWindow(windowId);
      setIsMinimizingAnimation(false);
    }, 200);
  };

  // Animated restore handler
  const handleAnimatedRestore = () => {
    setIsRestoringAnimation(true);
    restoreChatWindow(windowId);
    setTimeout(() => {
      setIsRestoringAnimation(false);
    }, 250);
  };

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    bringToFront(windowId);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 320));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50));
      updateWindowPosition(windowId, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, windowId, updateWindowPosition]);

  // Get current user ID from useAuth context (not localStorage, which doesn't store userId)
  const currentUserId = user?._id || null;

  // Group management handlers
  const fetchAvailableUsers = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/users/online`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        // Filter out users already in the group
        const filteredUsers = data.users?.filter(
          (u: any) => !participantUsernames.includes(u.username)
        ) || [];
        setAvailableUsers(filteredUsers);
      }
    } catch (error) {
      console.error('[IMChatWindow] Error fetching users:', error);
    }
  }, [participantUsernames]);

  const handleOpenAddMembers = useCallback(() => {
    setShowGroupMenu(false);
    setShowAddMembersModal(true);
    setSelectedUsersToAdd(new Set());
    fetchAvailableUsers();
  }, [fetchAvailableUsers]);

  const handleAddMembers = async () => {
    if (selectedUsersToAdd.size === 0 || !conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setIsAddingMembers(true);
    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${conversationId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ memberIds: Array.from(selectedUsersToAdd) }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[IMChatWindow] Members added:', data);
        setShowAddMembersModal(false);
        setSelectedUsersToAdd(new Set());
        // Refresh to update participant list - would need to update IMContext
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to add members');
      }
    } catch (error) {
      console.error('[IMChatWindow] Error adding members:', error);
      alert('Failed to add members');
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!conversationId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setIsLeavingGroup(true);
    try {
      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/conversations/${conversationId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        console.log('[IMChatWindow] Left group successfully');
        setShowLeaveConfirm(false);
        closeChatWindow(windowId);
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to leave group');
      }
    } catch (error) {
      console.error('[IMChatWindow] Error leaving group:', error);
      alert('Failed to leave group');
    } finally {
      setIsLeavingGroup(false);
    }
  };

  const toggleUserToAdd = (userId: string) => {
    setSelectedUsersToAdd((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Render minimized state
  if (isMinimized) {
    return (
      <button
        onClick={handleAnimatedRestore}
        className={`fixed bottom-4 bg-[#1e1e1e] text-white px-4 py-2 rounded-lg shadow-lg hover:bg-[#2a2a2a] transition-all duration-200 flex items-center gap-2 hover:scale-105 ${isRestoringAnimation ? 'animate-scaleOut' : 'animate-scaleIn'}`}
        style={{ right: `${(parseInt(windowId.split('-').pop() || '0') % 5) * 160 + 90}px`, zIndex }}
      >
        <div className="relative">
          {isGroup ? (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          ) : recipientIconUrl ? (
            <img
              src={recipientIconUrl}
              alt={recipientUsername}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 text-xs font-bold">
              {recipientUsername.charAt(0).toUpperCase()}
            </div>
          )}
          {!isGroup && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <StatusBadge status={recipientStatus} />
            </div>
          )}
        </div>
        <span className="text-sm font-medium">{isGroup ? groupName : recipientUsername}</span>
      </button>
    );
  }

  // Determine animation class
  const getWindowAnimationClass = () => {
    if (isClosingAnimation) return 'animate-scaleOut';
    if (isMinimizingAnimation) return 'animate-minimizeToButton';
    return 'animate-slideInFromBottom';
  };

  return (
    <div
      ref={containerRef}
      className={`fixed bg-white dark:bg-[#212121] rounded-xl shadow-2xl border border-slate-200 dark:border-[#404040] overflow-hidden flex flex-col ${getWindowAnimationClass()} ${isFileDragOver ? 'ring-2 ring-yellow-500' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: 320,
        height: 420,
        zIndex,
      }}
      onClick={() => bringToFront(windowId)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop Zone Overlay */}
      {isFileDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 rounded-xl">
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm font-medium">Drop file to upload</p>
            <p className="text-xs text-slate-400">Images, PDFs, text files</p>
          </div>
        </div>
      )}

      {/* Header - Draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[#2a2a2a] dark:bg-[#1e1e1e] cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            {isGroup ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            ) : recipientIconUrl ? (
              <img
                src={recipientIconUrl}
                alt={recipientUsername}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 text-sm font-bold">
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
            <h4 className="text-sm font-semibold text-white leading-tight">
              {isGroup ? groupName : recipientUsername}
            </h4>
            <span className="text-xs text-slate-400 capitalize">
              {isGroup ? `${participantUsernames.length} members` : recipientStatus}
            </span>
          </div>
        </div>

        {/* Window controls */}
        <div className="window-controls flex items-center gap-1">
          {/* Group settings button (only for group chats) */}
          {isGroup && (
            <div className="relative">
              <button
                onClick={() => setShowGroupMenu(!showGroupMenu)}
                className="p-1.5 rounded hover:bg-[#404040] transition-colors"
                title="Group settings"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v.01M12 12v.01M12 18v.01" />
                </svg>
              </button>
              {/* Dropdown menu */}
              {showGroupMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-slate-200 dark:border-[#404040] py-1 z-50">
                  <button
                    onClick={handleOpenAddMembers}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#404040] transition-colors"
                  >
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Add Members
                  </button>
                  <button
                    onClick={() => {
                      setShowGroupMenu(false);
                      setShowLeaveConfirm(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-slate-100 dark:hover:bg-[#404040] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Leave Group
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleAnimatedMinimize}
            className="p-1.5 rounded hover:bg-[#404040] transition-colors"
            title="Minimize"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={handleAnimatedClose}
            className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-[#1a1a1a]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <svg className="animate-spin h-6 w-6 text-yellow-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : localMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-[#404040] flex items-center justify-center mb-2">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Start a conversation with {recipientUsername}
            </p>
          </div>
        ) : (
          localMessages.map((message) => {
            const isOwnMessage = message.senderId === currentUserId || message.senderId === 'me';
            return (
              <div
                key={message._id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[85%]`}>
                  {/* Avatar for received messages */}
                  {!isOwnMessage && (
                    <div className="flex-shrink-0">
                      {recipientIconUrl && !recipientIconError ? (
                        <img
                          src={recipientIconUrl}
                          alt={recipientUsername}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={() => setRecipientIconError(true)}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 text-xs font-bold">
                          {recipientUsername.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Avatar for own messages */}
                  {isOwnMessage && (
                    <div className="flex-shrink-0">
                      {currentUserIconUrl && !currentUserIconError ? (
                        <img
                          src={currentUserIconUrl}
                          alt={user?.username || 'Me'}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={() => setCurrentUserIconError(true)}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                          {(user?.username || 'M').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    {/* Sender name for received messages */}
                    {!isOwnMessage && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1 mb-0.5 block">
                        {isGroup ? (message.senderUsername || 'Unknown') : recipientUsername}
                      </span>
                    )}
                    {/* Sender name for own messages */}
                    {isOwnMessage && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-1 mb-0.5 block text-right">
                        {user?.username || 'Me'}
                      </span>
                    )}
                    <div
                      className={`px-3 py-2 rounded-xl ${
                        isOwnMessage
                          ? 'bg-yellow-500 text-slate-800'
                          : 'bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 shadow-sm'
                      }`}
                    >
                      {/* Attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 space-y-2">
                          {message.attachments.map((attachment, idx) => (
                            <div key={idx}>
                              {attachment.type === 'image' ? (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={attachment.url}
                                    alt={attachment.filename}
                                    className="max-w-full max-h-48 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <button
                                  onClick={(e) => handleAttachmentClick(attachment, e)}
                                  className={`flex items-center gap-2 p-2 rounded-lg w-full text-left ${
                                    isOwnMessage
                                      ? 'bg-yellow-600/30 hover:bg-yellow-600/40'
                                      : 'bg-slate-100 dark:bg-[#404040] hover:bg-slate-200 dark:hover:bg-[#505050]'
                                  } transition-colors cursor-pointer`}
                                >
                                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{attachment.filename}</p>
                                    <p className="text-[10px] opacity-70">
                                      {(attachment.size / 1024).toFixed(1)} KB
                                    </p>
                                  </div>
                                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Text content - only show if not just a "Sent filename" placeholder */}
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
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
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
      <div className="p-2 bg-white dark:bg-[#212121] border-t border-slate-200 dark:border-[#404040]">
        {/* Pending Attachments Preview */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((attachment, index) => (
              <div
                key={index}
                className="relative group bg-slate-100 dark:bg-[#2a2a2a] rounded-lg p-2 flex items-center gap-2"
              >
                {attachment.type === 'image' ? (
                  <img src={attachment.url} alt={attachment.filename} className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-slate-200 dark:bg-[#404040] rounded">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <span className="text-xs text-slate-600 dark:text-slate-400 max-w-[80px] truncate">
                  {attachment.filename}
                </span>
                <button
                  onClick={() => removePendingAttachment(index)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept="image/*,application/pdf,text/plain,text/markdown,application/zip"
            className="hidden"
          />

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || isUploading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Attach file"
          >
            {isUploading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={!isConnected}
            className="flex-1 px-3 py-2 text-sm bg-slate-100 dark:bg-[#2a2a2a] border-0 rounded-lg focus:ring-2 focus:ring-yellow-500 text-slate-700 dark:text-slate-200 placeholder-slate-400 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={(!inputValue.trim() && pendingAttachments.length === 0) || !isConnected}
            className="p-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Attachment Action Dialog */}
      {attachmentActionDialog.isOpen && attachmentActionDialog.attachment && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-xl"
          onClick={handleCloseAttachmentDialog}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl p-4 mx-4 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* File preview */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-slate-100 dark:bg-[#1a1a1a] rounded-lg">
              <div className="w-12 h-12 flex items-center justify-center bg-slate-200 dark:bg-[#404040] rounded-lg">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                  {attachmentActionDialog.attachment.filename}
                </p>
                <p className="text-xs text-slate-500">
                  {(attachmentActionDialog.attachment.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {/* View button - only for PDFs */}
              {attachmentActionDialog.attachment.filename?.toLowerCase().endsWith('.pdf') && (
                <button
                  onClick={handleViewPdf}
                  disabled={isLoadingPdfUrl}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingPdfUrl ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View PDF
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleDownloadAttachment}
                className="w-full flex items-center gap-3 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-800 font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>

              <button
                onClick={handleSaveToMyDocs}
                disabled={isSavingToMyDocs}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-100 dark:bg-[#404040] hover:bg-slate-200 dark:hover:bg-[#505050] text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingToMyDocs ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                    Save to My Docs
                  </>
                )}
              </button>
            </div>

            {/* Cancel */}
            <button
              onClick={handleCloseAttachmentDialog}
              className="w-full mt-3 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      {pdfViewerState.isOpen && pdfViewerState.url && (
        <BrandedPdfViewer
          fileUrl={pdfViewerState.url}
          title={pdfViewerState.filename}
          onClose={handleClosePdfViewer}
          showDownload={true}
        />
      )}

      {/* Add Members Modal */}
      {showAddMembersModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-xl"
          onClick={() => setShowAddMembersModal(false)}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl p-4 mx-2 max-w-[280px] w-full max-h-[350px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Members
            </h3>

            {/* User list */}
            <div className="flex-1 overflow-y-auto space-y-1 mb-3">
              {availableUsers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No users available to add</p>
              ) : (
                availableUsers.map((u) => (
                  <button
                    key={u._id}
                    onClick={() => toggleUserToAdd(u._id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      selectedUsersToAdd.has(u._id)
                        ? 'bg-green-100 dark:bg-green-900/30 ring-1 ring-green-400'
                        : 'hover:bg-slate-100 dark:hover:bg-[#404040]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        selectedUsersToAdd.has(u._id)
                          ? 'bg-green-500 border-green-500'
                          : 'border-slate-400'
                      }`}
                    >
                      {selectedUsersToAdd.has(u._id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {u.iconUrl ? (
                      <img src={u.iconUrl} alt={u.username} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-800 text-xs font-bold">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{u.username}</span>
                  </button>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddMembersModal(false)}
                className="flex-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#404040] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMembers}
                disabled={selectedUsersToAdd.size === 0 || isAddingMembers}
                className="flex-1 px-3 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {isAddingMembers ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Adding...
                  </>
                ) : (
                  `Add (${selectedUsersToAdd.size})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Group Confirmation */}
      {showLeaveConfirm && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-xl"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl p-4 mx-4 max-w-[260px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Leave Group?</h3>
                <p className="text-xs text-slate-500">You won&apos;t receive messages</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Are you sure you want to leave &quot;{groupName}&quot;?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#404040] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGroup}
                disabled={isLeavingGroup}
                className="flex-1 px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isLeavingGroup ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Leaving...
                  </>
                ) : (
                  'Leave'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close group menu */}
      {showGroupMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowGroupMenu(false)}
        />
      )}
    </div>
  );
};

export default IMChatWindow;
