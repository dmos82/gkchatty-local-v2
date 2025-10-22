'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/layout/Sidebar';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelRightClose, Moon, Sun, Send } from 'lucide-react';
import { UnifiedSearchToggle } from '@/components/ui/UnifiedSearchToggle';
import { useSearchMode } from '@/contexts/SearchModeContext';
import { useTheme } from 'next-themes';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { usePersona } from '@/contexts/PersonaContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { DocumentViewer } from '@/components/common/DocumentViewer';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config'; // Correct alias
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { ChatSummary } from '@/types'; // Ensure ChatSummary is imported
import debounce from 'lodash.debounce'; // <-- ADD: Import debounce
import ChatInterface from '@/components/ChatInterface';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FileTreeView from '@/components/layout/FileTreeView';
import DocumentSidebar from '@/components/layout/DocumentSidebar';
import ChatNotesPanel from '@/components/layout/ChatNotesPanel';

// Define SourceDocument type
interface SourceDocument {
  documentId?: string;
  fileName?: string;
  type?: 'user' | 'system'; // Ensure type is defined here
  score?: number; // Score might still be present in older data
  keywordMatch?: boolean;
}

// Define Message interface
interface Message {
  _id: string; // Use _id to match MongoDB convention
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceDocument[]; // Ensure this uses SourceDocument with type
  metadata?: {
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost: number;
  };
}

// --- ADDED: Define Chat interface for frontend state ---
interface Chat {
  _id: string;
  userId: string; // Or Types.ObjectId if needed on frontend
  chatName: string;
  createdAt: string; // Use string for simplicity, format as needed
  updatedAt: string;
  messages: Message[];
  notes?: string | null; // Added optional notes field
}
// --- END ADDITION ---

// Define UserDocument type for this page (might differ from backend model slightly)
interface UserDocumentDisplay {
  _id: string;
  originalFileName: string;
  // Add other fields if needed for display, like status or date
}

// Progressive assistant status messages
const PROGRESS_MESSAGES = [
  'Working on it...',
  'Still thinking...',
  'Almost there...',
  'Generating response...',
];
const PROGRESS_INTERVAL_MS = 10000; // 10s

export default function Home() {
  const { user, isLoading: loading, logout } = useAuth();
  const { theme, systemTheme } = useTheme();
  const { activePersona } = usePersona();
  const { settings, refreshSettings } = useUserSettings();
  const { toast } = useToast(); // Initialize toast
  const { searchMode } = useSearchMode(); // Use the new unified search mode

  // State for UI elements
  const [chats, setChats] = React.useState<ChatSummary[]>([]); // <-- SPECIFY TYPE HERE
  const [selectedChatIdFromSidebar, setSelectedChatIdFromSidebar] = React.useState<string | null>(
    null
  ); // Chat selected in sidebar
  const [isLoadingChats, setIsLoadingChats] = React.useState(false); // Loading indicator for sidebar chats
  const [activeView, setActiveView] = React.useState<'chat' | 'docs'>('chat'); // Sidebar view toggle
  const [isAlertAllOpen, setIsAlertAllOpen] = React.useState(false); // Delete all chats confirmation

  // State for main chat interface
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const { theme: themeFromContext, setTheme } = useTheme();
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  // State for chat persistence
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true); // Track initial history load

  // --- ADDED: State to hold full data of the selected chat ---
  const [selectedChatData, setSelectedChatData] = useState<Chat | null>(null);
  // --- END ADDITION ---

  // State for document viewer
  const [selectedDocument, setSelectedDocument] = useState<{
    id: string;
    filename: string;
    type: 'user' | 'system';
  } | null>(null);

  // Use the unified search mode (no local state needed)
  const isUserDocsSelected = searchMode === 'user-docs';

  // --- ADDED: State for notes saving loading indicator ---
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  // --- END ADDITION ---

  // --- ADDED: State for new chat notes (before chat is created) ---
  const [newChatNotes, setNewChatNotes] = useState<string>('');
  // --- END ADDITION ---

  // --- ADDED: State for User Documents ---
  const [userDocuments, setUserDocuments] = useState<UserDocumentDisplay[]>([]);
  const [isLoadingUserDocs, setIsLoadingUserDocs] = useState(false);
  const [userDocsError, setUserDocsError] = useState<string | null>(null);
  // --- END ADDITION ---

  // --- ADDED: State to track if initial user document fetch has been attempted ---
  const [hasAttemptedUserDocsFetch, setHasAttemptedUserDocsFetch] = useState(false);
  // --- END ADDITION ---

  // --- ADDED: State to track selected tab in right sidebar ---
  const [selectedTab, setSelectedTab] = useState<string>('notes');
  // --- END ADDITION ---

  // --- ADDED: State for assistant progress message ---
  const [assistantProgressMsg, setAssistantProgressMsg] = useState<Message | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // --- END ADDITION ---

  // Load user settings on component mount
  useEffect(() => {
    if (user && !loading) {
      console.log('[ChatPage] User authenticated, loading user settings');
      refreshSettings().catch(err => {
        console.error('[ChatPage] Failed to load user settings:', err);
      });
    }
  }, [user, loading, refreshSettings]);

  // Debug log active persona state
  useEffect(() => {
    console.log('[ChatPage] Active persona state:', activePersona);
  }, [activePersona]);

  // --- Effects ---

  // Load Latest Chat Effect
  useEffect(() => {
    const loadLatestChat = async () => {
      if (!user) {
        console.log('[ChatPage Load] No user object available, cannot load history.');
        setIsLoadingHistory(false);
        return;
      }

      setIsLoadingHistory(true);
      console.log('[ChatPage Load] Attempting to load latest chat...');
      const apiUrl = `${API_BASE_URL}/api/chats/latest`;

      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          credentials: 'include', // Use HttpOnly cookies instead of Authorization header
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.chat) {
            console.log(
              `[ChatPage Load] Loaded latest chat: ${data.chat._id}, Messages: ${data.chat.messages?.length || 0}`
            );
            const loadedMessages = (data.chat.messages || []).map((msg: any, index: number) => ({
              _id: msg._id,
              role: msg.role,
              content: msg.content,
              sources: msg.sources,
              metadata: msg.metadata,
            }));
            setMessages(loadedMessages);
            setCurrentChatId(data.chat._id);
            setSelectedChatData(data.chat); // <-- ADDED: Store full chat data
            setSelectedChatIdFromSidebar(data.chat._id); // <-- ADDED: Sync sidebar selection
          } else {
            console.log('[ChatPage Load] No previous chat session found.');
            setMessages([]);
            setCurrentChatId(null);
            setSelectedChatData(null); // Clear chat data if none found
          }
        } else if (response.status === 401) {
          console.warn('[ChatPage Load] Received 401 Unauthorized. Logging out.');
          await logout();
        } else {
          console.error('[ChatPage Load] API Error:', response.status, response.statusText);
          setMessages([]);
          setCurrentChatId(null);
          setSelectedChatData(null); // Clear chat data on error
        }
      } catch (error) {
        console.error('[ChatPage Load] Fetch Error:', error);
        setMessages([]);
        setCurrentChatId(null);
        setSelectedChatData(null); // Clear chat data on error
      } finally {
        setIsLoadingHistory(false);
      }
    };

    if (!loading && user) {
      loadLatestChat();
    } else if (!loading && !user) {
      // Handle case where auth is resolved but there's no user
      setIsLoadingHistory(false);
      setMessages([]);
      setCurrentChatId(null);
      setSelectedChatData(null); // Clear chat data if no user
    }
  }, [user, loading, logout]);

  // --- ADDED: Function to fetch chat list ---
  const fetchChatList = useCallback(async () => {
    if (!user) {
      console.log('[fetchChatList] No user available');
      setIsLoadingChats(false);
      setChats([]);
      return;
    }

    setIsLoadingChats(true);
    console.log('[fetchChatList] Fetching chat list...');
    const apiUrl = `${API_BASE_URL}/api/chats`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.chats) {
          console.log(`[fetchChatList] Loaded chats: ${data.chats.length}`);
          setChats(data.chats);
        } else {
          console.log('[fetchChatList] No chats found.');
          setChats([]);
        }
      } else if (response.status === 401) {
        console.warn('[fetchChatList] Received 401 Unauthorized. Logging out.');
        await logout();
      } else {
        console.error('[fetchChatList] API Error:', response.status, response.statusText);
        setChats([]);
      }
    } catch (error) {
      console.error('[fetchChatList] Fetch Error:', error);
      setChats([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, [user, logout]);

  // --- START ADDITION: Fetch Chat List Effect ---
  useEffect(() => {
    console.log('[ChatPage List Effect Hook RUNS]', { user: !!user, loading });

    if (!loading && user) {
      console.log('[ChatPage List Effect] Condition MET, calling fetchChatList...');
      fetchChatList();
    } else {
      console.log('[ChatPage List Effect] Condition NOT MET.', { loading, user: !!user });
      setIsLoadingChats(false);
      setChats([]);
    }
  }, [user, loading, fetchChatList, currentChatId]);
  // --- END ADDITION: Fetch Chat List Effect ---

  // Auto-scroll Effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Note: Search mode persistence is now handled by SearchModeContext

  // --- ADDED: Function to fetch user documents ---
  const fetchUserDocuments = useCallback(async () => {
    if (!user) return; // Need user authentication

    console.log('[fetchUserDocuments] Fetching user documents...');
    setIsLoadingUserDocs(true);
    setUserDocsError(null);
    // No need to setHasAttemptedUserDocsFetch(false) here, only on explicit refresh action

    const apiUrl = `${API_BASE_URL}/api/documents`;

    try {
      const response = await fetch(apiUrl, { credentials: 'include' });

      if (!response.ok) {
        let errorMsg = `API Error: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          /* Ignore parsing error */
        }
        if (response.status === 401) await logout(); // Logout on auth error
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.documents)) {
        console.log(`[fetchUserDocuments] Fetched ${data.documents.length} user documents.`);
        setUserDocuments(data.documents);
      } else {
        console.error('[fetchUserDocuments] Invalid data format:', data);
        throw new Error('Failed to load documents (Invalid format).');
      }
    } catch (err: any) {
      console.error('[fetchUserDocuments] Fetch Error:', err);
      setUserDocsError(err.message || 'An unknown error occurred.');
      setUserDocuments([]); // Clear documents on error
      // Optionally show toast
      toast({ title: 'Error Loading My Docs', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingUserDocs(false);
      setHasAttemptedUserDocsFetch(true); // Mark that an attempt has been made
    }
  }, [user, logout, toast]); // Removed setIsLoadingUserDocs, setUserDocsError, setUserDocuments from deps as they are setters
  // --- END ADDITION ---

  // --- ADDED: Effect to fetch user documents when user is available ---
  useEffect(() => {
    // Fetch user docs when user is available and hasn't been attempted yet
    if (user && !hasAttemptedUserDocsFetch && !isLoadingUserDocs) {
      fetchUserDocuments();
    }
  }, [user, hasAttemptedUserDocsFetch, isLoadingUserDocs, fetchUserDocuments]);
  // --- END ADDITION ---

  // --- Handlers ---

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setSelectedChatData(null);
    setSelectedChatIdFromSidebar(null);
    setInputValue('');
    setNewChatNotes(''); // Clear new chat notes
    console.log('[ChatPage] New Chat started');
  };

  // --- START MODIFICATION: Replace handleSelectChat with implementation + logging ---
  const handleSelectChat = useCallback(
    async (id: string) => {
      console.log(`[handleSelectChat] Clicked. Attempting to load chat ID: ${id}`);

      if (!user || !id || id === currentChatId) {
        console.log(`[handleSelectChat] Skipping load. Reason:`, {
          hasUser: !!user,
          idExists: !!id,
          isAlreadyCurrent: id === currentChatId,
        });
        return;
      }

      setIsLoadingHistory(true); // Indicate loading
      setMessages([]); // Clear previous messages immediately

      console.log(`[handleSelectChat] Fetching URL: /api/chats/${id}`);
      const apiUrl = `${API_BASE_URL}/api/chats/${id}`;

      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          credentials: 'include', // Use HttpOnly cookies instead of Authorization header
        });

        console.log(`[handleSelectChat] API Response Status for chat ${id}: ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          console.log(
            `[handleSelectChat] API Response Data for chat ${id}:`,
            JSON.stringify(data, null, 2)
          );

          if (data.success && data.chat) {
            const messagesFromServer = data.chat.messages || [];
            const loadedMessages = messagesFromServer.map((msg: any, index: number) => ({
              _id: msg._id,
              role: msg.role,
              content: msg.content,
              sources: msg.sources,
              metadata: msg.metadata,
            }));
            console.log(
              `[handleSelectChat] Setting messages (count: ${loadedMessages.length}) and currentChatId to ${data.chat._id}`
            );
            setMessages(loadedMessages);
            setCurrentChatId(data.chat._id); // Set the selected chat as current
            setInputValue(''); // Clear input when loading a chat
            setSelectedChatData(data.chat); // <-- ADDED: Store full chat data
            setSelectedChatIdFromSidebar(data.chat._id); // Update sidebar selection state
          } else {
            console.error(`[handleSelectChat] Failed to load chat ${id} or invalid data:`, data);
            handleNewChat(); // Reset to new chat state on failure
          }
        } else {
          const errorText = await response.text(); // Read error text
          console.error(
            `[handleSelectChat] API Error Status: ${response.status}, Text: ${errorText}`
          );
          if (response.status === 401) {
            console.warn('[handleSelectChat] Received 401 Unauthorized. Logging out.');
            await logout();
          } else if (response.status === 404) {
            console.warn(`[handleSelectChat] Chat ${id} not found (404). Starting new chat.`);
          } else {
            console.error(`[handleSelectChat] Unhandled API Error Status: ${response.status}`);
          }
          handleNewChat(); // Reset to new chat state on error
        }
      } catch (error) {
        console.error(`[handleSelectChat] Fetch Exception loading chat ${id}:`, error);
        handleNewChat(); // Reset to new chat state on error
      } finally {
        console.log(
          `[handleSelectChat] Finished loading attempt for chat ${id}. Setting isLoadingHistory to false.`
        );
        setIsLoadingHistory(false); // Reset loading state
      }
    },
    [
      user,
      currentChatId,
      logout,
      setIsLoadingHistory,
      setMessages,
      setCurrentChatId,
      setInputValue,
      setSelectedChatIdFromSidebar,
      handleNewChat,
    ]
  );
  // --- END MODIFICATION: Replace handleSelectChat ---

  // --- START MODIFICATION: Implement handleConfirmDelete ---
  const handleConfirmDelete = useCallback(
    async (id: string) => {
      if (!user || !id) {
        console.error('[handleConfirmDelete] Missing user or chat ID.');
        return;
      }

      // Use window.confirm for simplicity
      if (!window.confirm(`Are you sure you want to delete this chat? This cannot be undone.`)) {
        console.log('[handleConfirmDelete] User cancelled delete for chat:', id);
        return;
      }

      console.log(`[handleConfirmDelete] Attempting to delete chat: ${id}`);
      const apiUrl = `${API_BASE_URL}/api/chats/${id}`;
      let apiSucceeded = false; // Flag to track API success

      try {
        console.log(`[handleConfirmDelete] Sending DELETE request to: ${apiUrl}`); // Log URL
        const response = await fetch(apiUrl, {
          method: 'DELETE',
          credentials: 'include',
        });

        console.log(`[handleConfirmDelete] API Response Status: ${response.status}`); // Log Status

        if (response.ok) {
          apiSucceeded = true; // Mark as success
          console.log(`[handleConfirmDelete] Successfully deleted chat on backend: ${id}`);
          // Update frontend state
          setChats(prevChats => {
            console.log(
              '[handleConfirmDelete] Updating chats state. Previous length:',
              prevChats.length
            );
            const newChats = prevChats.filter(chat => chat._id !== id);
            console.log('[handleConfirmDelete] New chats state length:', newChats.length);
            return newChats;
          });

          // If the deleted chat was the currently active one, reset view
          if (currentChatId === id) {
            console.log(
              '[handleConfirmDelete] Deleted the active chat, resetting to new chat view.'
            );
            handleNewChat();
          } else {
            setSelectedChatIdFromSidebar(null);
          }
          toast({ title: 'Success', description: 'Chat deleted successfully.' }); // Added success toast
        } else {
          const errorText = await response.text();
          console.error(
            `[handleConfirmDelete] API Error deleting chat ${id}: ${response.status}`,
            errorText
          );
          toast({
            title: 'Error',
            description: `Failed to delete chat (${response.status})`,
            variant: 'destructive',
          }); // Added error toast
          if (response.status === 401) {
            await logout();
          }
        }
      } catch (error) {
        console.error(`[handleConfirmDelete] Fetch error deleting chat ${id}:`, error);
        toast({
          title: 'Error',
          description: 'Network error during deletion.',
          variant: 'destructive',
        }); // Added fetch error toast
      } finally {
        console.log(
          `[handleConfirmDelete] Finished delete attempt for ${id}. API Success: ${apiSucceeded}`
        );
        // Optional: Add loading state management here if needed
      }
    },
    [user, setChats, currentChatId, handleNewChat, logout, setSelectedChatIdFromSidebar, toast]
  ); // Added toast
  // --- END MODIFICATION: Implement handleConfirmDelete ---

  // --- START MODIFICATION: Implement handleDeleteAllChats ---
  const handleDeleteAllChats = useCallback(async () => {
    if (!user) {
      console.error('No authenticated user available to delete chats.');
      // Optionally show an error to the user
      return;
    }

    // Confirmation Dialog
    if (
      !window.confirm(
        'Are you sure you want to delete ALL your chat history? This cannot be undone.'
      )
    ) {
      console.log('User cancelled delete all chats.');
      return;
    }

    console.log('[handleDeleteAllChats] Attempting to delete all chats...');
    setIsLoadingChats(true); // Indicate loading state (optional but good UX)

    const apiUrl = `${API_BASE_URL}/api/chats`;

    try {
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        credentials: 'include', // Use HttpOnly cookies instead of Authorization header
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[handleDeleteAllChats] Successfully deleted all chats.', data);
        // Reset frontend state to reflect deletion
        setMessages([]);
        setCurrentChatId(null);
        setChats([]); // Clear the sidebar list state as well
        // Optionally show success notification
      } else {
        const errorText = await response.text();
        console.error(
          `[handleDeleteAllChats] API Error: ${response.status} ${response.statusText}`,
          errorText
        );
        // Optionally show error notification
      }
    } catch (error) {
      console.error('[handleDeleteAllChats] Fetch Error:', error);
      // Optionally show error notification
    } finally {
      setIsLoadingChats(false); // Reset loading state
    }
    // Add relevant dependencies
  }, [user, setMessages, setCurrentChatId, setChats, setIsLoadingChats]); // Added setIsLoadingChats
  // --- END MODIFICATION: Implement handleDeleteAllChats ---

  // Update function signature and state setting
  const handleDocumentSelect = (documentId: string, filename: string, type: 'user' | 'system') => {
    console.log(
      '[ChatPage] Selected document for viewing (from chat source):',
      documentId,
      filename,
      type
    ); // Log type
    setSelectedDocument({ id: documentId, filename: filename, type: type }); // Store type
  };

  // Create a separate handler for clicks from the SystemKbList which only provides id and filename
  const handleSystemKbSelect = (documentId: string, filename: string) => {
    console.log(
      '[ChatPage] Selected document for viewing (from System KB list):',
      documentId,
      filename
    );
    // Removed debug logs for System KB document selection

    // Assume documents selected from this list are always 'system' type
    setSelectedDocument({ id: documentId, filename: filename, type: 'system' });

    // Removed setTimeout debug log for state update
  };

  const handleCloseViewer = () => {
    console.log('[ChatPage] Closing PDF viewer');
    setSelectedDocument(null);
  };

  // --- ADDED: Function to create chat from notes ---
  const createChatFromNotes = useCallback(
    async (notes: string) => {
      console.log('[createChatFromNotes] Creating new chat with initial notes...');
      setIsSavingNotes(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            isNotesInitiated: true,
            initialChatName: 'New Chat with Notes',
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || `Failed to create chat (HTTP ${response.status})`);
        }

        console.log(`[createChatFromNotes] Chat created successfully: ${result.chatId}`);

        // Set the newly created chat as current
        const newChat: Chat = {
          _id: result.chatId,
          userId: user!._id,
          chatName: result.chatName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          notes: '',
        };

        setCurrentChatId(result.chatId);
        setSelectedChatData(newChat);
        setSelectedChatIdFromSidebar(result.chatId);

        // Refresh chat list to include new chat
        fetchChatList();

        // Now save the notes to the newly created chat
        return result.chatId;
      } catch (error: any) {
        console.error('[createChatFromNotes] Error creating chat:', error);
        toast({
          variant: 'destructive',
          title: 'Error Creating Chat',
          description: error.message,
        });
        return null;
      } finally {
        setIsSavingNotes(false);
      }
    },
    [user, fetchChatList, toast]
  );

  // --- ADDED: Handler to save notes via API ---
  const handleSaveNotes = useCallback(
    async (chatId: string | null, notes: string) => {
      // Handle new chat notes (when chatId is null)
      if (!chatId) {
        console.log('[handleSaveNotes] No chatId, storing notes locally for new chat...');
        setNewChatNotes(notes);

        // If notes are not empty, create a chat automatically
        if (notes.trim()) {
          const newChatId = await createChatFromNotes(notes);
          if (newChatId) {
            // Continue with saving notes to the newly created chat
            return handleSaveNotes(newChatId, notes);
          }
        }
        return;
      }

      console.log(`[handleSaveNotes] Saving notes for chat ${chatId}...`);
      setIsSavingNotes(true);
      const apiUrl = `${API_BASE_URL}/api/chats/${chatId}/notes`;

      try {
        const response = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ notes }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || `Failed to save notes (HTTP ${response.status})`);
        }

        console.log(`[handleSaveNotes] Notes saved successfully for chat ${chatId}.`);

        // Update selectedChatData state locally
        setSelectedChatData(prev => (prev ? { ...prev, notes } : null));
      } catch (error: any) {
        console.error(`[handleSaveNotes] Error saving notes for chat ${chatId}:`, error);
        toast({ variant: 'destructive', title: 'Error Saving Notes', description: error.message });
      } finally {
        setIsSavingNotes(false);
      }
    },
    [createChatFromNotes, toast]
  );

  // --- ADD: Debounced Save Notes Function ---
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSaveNotes = useCallback(
    debounce((chatId: string | null, notes: string) => {
      handleSaveNotes(chatId, notes);
    }, 1500), // 1500ms delay
    [handleSaveNotes] // Dependency array includes the memoized save function
  );
  // --- END ADD ---

  const handleSendMessage = useCallback(
    async (input: string) => {
      if (!input.trim() || isSending || !user) return;

      setIsSending(true);

      // Log user settings before sending
      console.log('[ChatPage] Sending message with user settings:', {
        isPersonaEnabled: settings?.isPersonaEnabled,
        hasCustomPrompt: !!settings?.customPrompt,
      });

      // ----- Progressive status placeholder -----
      const placeholderId = `progress-${Date.now()}`;
      let progressIndex = 0;
      const placeholder: Message = {
        _id: placeholderId,
        role: 'assistant',
        content: PROGRESS_MESSAGES[progressIndex],
      } as Message;
      setAssistantProgressMsg(placeholder);

      // cycle messages every interval
      progressTimerRef.current = setInterval(() => {
        progressIndex = (progressIndex + 1) % PROGRESS_MESSAGES.length;
        setAssistantProgressMsg(prev =>
          prev ? { ...prev, content: PROGRESS_MESSAGES[progressIndex] } : prev
        );
      }, PROGRESS_INTERVAL_MS);

      const tempUserMessageId = `user-${Date.now()}`; // Temporary ID for optimistic update
      const userMessage: Message = {
        _id: tempUserMessageId,
        role: 'user',
        content: input.trim(),
      };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputValue('');

      console.log(
        '[ChatPage Send] Sending message. User:',
        user?.username,
        'ChatID:',
        currentChatId
      );
      const apiUrl = `${API_BASE_URL}/api/chats`;

      // --- SIMPLIFIED: Use unified search mode directly (no mapping needed) ---
      console.log(`[Chat] Current search mode state: ${searchMode}`);
      console.log(`[Chat] Sending query with searchMode: ${searchMode}`);

      const requestBody: Record<string, any> = {
        query: input.trim(),
        history: messages.map(m => ({ role: m.role, content: m.content })),
        searchMode: searchMode, // Send as searchMode, not knowledgeBaseTarget
        // The backend will map this to knowledgeBaseTarget internally
        activePersonaId: activePersona?._id || null,
        chatId: currentChatId || null, // Include chatId for chat persistence
      };


      console.log(
        '[ChatPage] Final requestBody BEFORE sending to API:',
        JSON.stringify(requestBody, null, 2)
      );
      // --- END MODIFICATION ---

      // --- START: Log request payload before fetch ---
      console.log(
        `[ChatPage Send] Sending request to ${apiUrl}. Body:`,
        JSON.stringify(requestBody, null, 2)
      ); // Use literal prefix
      // --- END: Log request payload before fetch ---

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Use HttpOnly cookies instead of Authorization header
          body: JSON.stringify(requestBody),
        });

        let assistantMessage: Message; // Define here to ensure assignment

        if (response.ok) {
          const data = await response.json();
          // --- START DEBUG LOGS ---
          console.log('<<< RAW POST /api/chats Response Data: >>>', JSON.stringify(data, null, 2)); // Log formatted JSON
          // --- END DEBUG LOGS ---

          // Backend returns { success: boolean, answer: string, sources: Array, chatId: string }

          // Debug logging for sources
          console.log('[DEBUG Sources] Sources from API:', JSON.stringify(data.sources, null, 2));

          // Construct assistant message from response data
          assistantMessage = {
            _id: `assistant-${Date.now()}`, // Generate temporary ID for UI
            role: 'assistant',
            content: data.answer || 'Error: Could not parse response content.',
            sources: data.sources || [],
          };

          // Update chatId if returned by backend (for persistence)
          if (data.chatId && !currentChatId) {
            console.log('[ChatPage] Received new chatId from backend:', data.chatId);
            setCurrentChatId(data.chatId);
          }

          // Refresh chat list to show new/updated chat in sidebar
          fetchChatList();
        } else {
          // Handle non-OK responses (including 401)
          let errorContent = `Error: ${response.status} ${response.statusText || 'Failed to fetch response'}.`;
          try {
            const errorData = await response.text(); // Get error body
            errorContent += ` ${errorData}`;
          } catch (e) {
            /* Ignore if error body cannot be read */
          }

          console.error('[ChatPage Send] API Error:', errorContent);

          if (response.status === 401) {
            console.warn('[ChatPage Send] Received 401 Unauthorized. Logging out.');
            await logout(); // Force logout on 401
            errorContent = 'Error: Your session may have expired. Please log in again.';
          }

          assistantMessage = {
            _id: `error-${Date.now()}`, // Unique ID for error message
            role: 'assistant',
            content: errorContent,
          };
        }
        // Clear progress indicator on success
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setAssistantProgressMsg(null);

        // Update messages state with the assistant's response (or error message)
        setMessages(prevMessages => [...prevMessages, assistantMessage]);
      } catch (error) {
        // Handle network/fetch errors
        console.error('[ChatPage Send] Fetch Error:', error);
        // Clear progress on fetch error
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setAssistantProgressMsg(null);
        const fetchErrorAssistantMessage: Message = {
          _id: `fetch-error-${Date.now()}`,
          role: 'assistant',
          content: `Network Error: ${error instanceof Error ? error.message : 'Failed to fetch response'}`,
        };
        // Update messages state with the fetch error message
        setMessages(prevMessages => [...prevMessages, fetchErrorAssistantMessage]);
      } finally {
        // Ensure progress timer cleared
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setAssistantProgressMsg(null);
        setIsSending(false); // Ensure loading state is always reset
      }

      // Ensure ALL dependencies used within the callback are listed here
    },
    [
      user,
      isSending,
      logout,
      messages,
      currentChatId,
      setCurrentChatId,
      setMessages,
      setIsSending,
      setInputValue,
      searchMode,
      settings,
      activePersona,
      newChatNotes,
      handleSaveNotes,
      fetchChatList,
    ]
  ); // Added missing dependencies

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSending) {
      e.preventDefault();
      handleSendMessage(inputValue); // Pass current inputValue
    }
  };

  // --- START ADDITION: Theme Toggle Logic ---
  const isDarkMode = theme === 'dark';

  const handleThemeChange = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };
  // --- END ADDITION: Theme Toggle Logic ---

  useEffect(() => {
    console.log(
      '[Toggle State] isUserDocsSelected changed to:',
      isUserDocsSelected ? 'user' : 'system'
    );
  }, [isUserDocsSelected]);

  // --- ADDED: Adapter function for DocumentSidebar click ---
  const handleUserDocumentSelect = (
    docId: string,
    sourceType: 'system',
    originalFileName: string
  ) => {
    // Override sourceType to 'user' for documents from My Docs
    handleDocumentSelect(docId, originalFileName, 'user');
  };
  // --- END ADDITION ---

  // --- ADDED: Handler to update chat name via API ---
  const handleUpdateChatName = async (chatId: string, newName: string) => {
    if (!chatId || !newName.trim()) {
      console.error('[handleUpdateChatName] Invalid input:', { chatId, newName });
      toast({ title: 'Error', description: 'Invalid chat ID or name.', variant: 'destructive' });
      return; // Prevent API call with invalid data
    }

    console.log(`[handleUpdateChatName] Updating chat ${chatId} name to "${newName}"...`);
    const apiUrl = `${API_BASE_URL}/api/chats/${chatId}/name`;

    // Optimistic UI Update (Should work now with correct type)
    const originalChats = [...chats];
    setChats(prevChats =>
      prevChats.map(chat => (chat._id === chatId ? { ...chat, chatName: newName } : chat))
    );

    try {
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ chatName: newName }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('[handleUpdateChatName] Name updated successfully.');
        toast({ title: 'Success', description: 'Chat name updated.' });
        // State already updated optimistically
        // If backend returns updated chat object, you could update state here instead
        // e.g., setChats(prev => prev.map(c => c._id === chatId ? { ...c, ...result.chat } : c));
      } else {
        console.error(`[handleUpdateChatName] Failed to update name: ${response.status}`, result);
        // Rollback optimistic update on failure
        setChats(originalChats);
        throw new Error(result.message || `Failed to update name (Status: ${response.status})`);
      }
    } catch (error: any) {
      console.error('[handleUpdateChatName] Error updating name:', error);
      // Rollback optimistic update on error
      setChats(originalChats);
      toast({ title: 'Error Updating Name', description: error.message, variant: 'destructive' });
      // Re-throw or handle as needed
    }
    // No finally block needed for loading state as it's handled in Sidebar
  };
  // --- END ADDITION ---

  // --- Render Logic ---

  // Combine normal messages with progress placeholder for rendering
  const displayMessages = assistantProgressMsg ? [...messages, assistantProgressMsg] : messages;

  // Wrap the main content with ProtectedRoute
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-background text-foreground p-4 relative">
        {/* 1. Left Sidebar */}
        <Sidebar
          user={user}
          activeView={activeView}
          setActiveView={setActiveView}
          chats={chats}
          selectedChatId={selectedChatIdFromSidebar}
          isLoadingChats={isLoadingChats}
          handleNewChat={handleNewChat}
          handleSelectChat={handleSelectChat}
          handleConfirmDelete={handleConfirmDelete}
          onDeleteAllChats={() => setIsAlertAllOpen(true)}
          isAlertAllOpen={isAlertAllOpen}
          setIsAlertAllOpen={setIsAlertAllOpen}
          handleLogout={logout}
          onUpdateChatName={handleUpdateChatName}
        />

        {/* 2. Center Main Content Area */}
        <div
          className={`flex flex-1 flex-col h-full transition-all duration-300 ease-in-out bg-background`}
        >
          {/* Header */}
          <header className="p-4 bg-background flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold">
                <span className="text-yellow-500">GK</span>CHATTY
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {/* Unified Search Toggle */}
              <UnifiedSearchToggle />
              {/* Theme Toggle Switch */}
              <div className="flex items-center space-x-2">
                <Sun className="h-5 w-5 text-yellow-500" />
                <Switch
                  id="theme-switch"
                  checked={theme === 'dark'}
                  onCheckedChange={handleThemeChange}
                  className="dark:data-[state=unchecked]:bg-slate-700 dark:data-[state=checked]:bg-yellow-500 dark:[&_[data-radix-switch-thumb]]:bg-slate-100"
                />
                <Moon className="h-5 w-5 text-gray-500" />
              </div>
              {/* Right Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                title={isRightSidebarOpen ? 'Hide Panel' : 'Show Panel'}
              >
                {isRightSidebarOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </div>
          </header>

          {/* Message List */}
          <main className="flex-1 overflow-y-auto p-4 space-y-4 rounded-lg mx-4 mb-4 bg-muted dark:bg-zinc-800">
            {isLoadingHistory ? (
              <div className="flex justify-center items-center h-full text-muted-foreground">
                Loading history...
              </div>
            ) : displayMessages.length === 0 ? (
              <div className="flex justify-center items-center h-full text-muted-foreground">
                Start a new conversation.
              </div>
            ) : (
              displayMessages.map(msg => (
                <div
                  key={msg._id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 shadow-sm border ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground'}`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {/* Sources */}
                    {msg.role === 'assistant' &&
                      msg.sources &&
                      msg.sources.length > 0 &&
                      (() => {
                        // Log sources outside of JSX return
                        console.log(
                          '[DEBUG ChatUI Sources] msg.sources content:',
                          JSON.stringify(msg.sources, null, 2)
                        );
                        return (
                          <div className="mt-2 border-t pt-2 border-muted">
                            <h4 className="text-xs font-semibold mb-1">Sources:</h4>
                            <ul className="list-none pl-0 space-y-1">
                              {msg.sources.map((source, index) => (
                                <li key={source.documentId || `source-${index}`}>
                                  {source.documentId && source.fileName && source.type ? (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs text-muted-foreground hover:text-primary font-normal text-left whitespace-normal"
                                      onClick={() =>
                                        handleDocumentSelect(
                                          source.documentId!,
                                          source.fileName!,
                                          source.type!
                                        )
                                      }
                                      title={`View ${source.fileName}`}
                                    >
                                      {source.fileName}
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {source.fileName || source.documentId || 'Unknown Source'}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} /> {/* Scroll target */}
          </main>

          {/* Input Area */}
          <footer className="p-4 bg-background flex-shrink-0 w-full">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="Type your message here... (Shift+Enter for newline)"
                className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent p-2"
                rows={1}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isSending}
                onClick={() => handleSendMessage(inputValue)}
              >
                {isSending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </footer>
        </div>

        {/* 3. Right Sidebar */}
        {isRightSidebarOpen && (
          <div className="w-1/4 border-l border-border flex flex-col h-full min-w-[300px]">
            {selectedDocument ? (
              // If a document is selected, show the document viewer
              <DocumentViewer
                documentId={selectedDocument.id}
                filename={selectedDocument.filename}
                type={selectedDocument.type}
                onClose={handleCloseViewer}
              />
            ) : (
              // Show tabs when no document is selected
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex flex-col h-full">
                <TabsList className="grid w-full grid-cols-3 p-1 m-2">
                  <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                  <TabsTrigger value="system-kb" className="text-xs">System KB</TabsTrigger>
                  <TabsTrigger value="my-docs" className="text-xs">My Docs</TabsTrigger>
                </TabsList>
                
                <TabsContent value="notes" className="flex-1 m-0 overflow-hidden">
                  <ChatNotesPanel
                    chatId={currentChatId}
                    initialNotes={currentChatId ? selectedChatData?.notes : newChatNotes}
                    onSaveNotes={handleSaveNotes}
                    isLoading={isSavingNotes}
                  />
                </TabsContent>
                
                <TabsContent value="system-kb" className="flex-1 m-0 overflow-hidden">
                  <FileTreeView onDocumentSelect={handleSystemKbSelect} />
                </TabsContent>
                
                <TabsContent value="my-docs" className="flex-1 m-0 overflow-hidden">
                  <DocumentSidebar
                    documents={userDocuments}
                    isLoading={isLoadingUserDocs}
                    error={userDocsError}
                    onDocumentClick={handleUserDocumentSelect}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}

        {/* --- START ADDITION: Delete All Chats Confirmation Dialog --- */}
        <AlertDialog open={isAlertAllOpen} onOpenChange={setIsAlertAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Chat History?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all of your chat
                sessions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllChats}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All Chats
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* --- END ADDITION --- */}
      </div>
    </ProtectedRoute>
  );
}
