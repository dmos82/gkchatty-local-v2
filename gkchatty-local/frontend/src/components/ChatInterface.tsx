'use client';

import React, { useState, FormEvent, ChangeEvent, KeyboardEvent, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Message, Source } from '@/types'; // Import types from centralized location
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

// Define props for ChatInterface
interface ChatInterfaceProps {
  chatId: string | null; // ID of the currently active chat, null for a new chat
  messages: Message[]; // Messages for the current chat, passed from parent
  isLoadingMessages: boolean; // Whether messages are being loaded (for history)
  onSourceClick?: (source: Source) => void;
  chatContext: 'system-kb' | 'user-docs'; // Add chatContext prop
  addMessage: (message: Message) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAssistantResponse: (assistantData: any) => void;
}

export default function ChatInterface({
  chatId,
  messages,
  isLoadingMessages,
  onSourceClick,
  chatContext,
  addMessage,
  onAssistantResponse,
}: ChatInterfaceProps) {
  const [query, setQuery] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false); // Local loading state for submit button
  const [error, setError] = useState<string>(''); // Local error state for submission errors
  const [assistantProgressMsg, setAssistantProgressMsg] = useState<Message | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const PROGRESS_MESSAGES = [
    'Working on it...',
    'Still thinking...',
    'Almost there...',
    'Generating response...',
  ];
  const PROGRESS_INTERVAL_MS = 10000; // 10 seconds
  console.log('ChatInterface DEBUG: PROGRESS_INTERVAL_MS =', PROGRESS_INTERVAL_MS);

  const { logout } = useAuth();
  const chatEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // Scroll when messages change

  const handleQueryChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(event.target.value);
    // Basic auto-resize logic (optional, can be refined)
    event.target.style.height = 'inherit';
    event.target.style.height = `${event.target.scrollHeight}px`;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isSending) {
      return;
    }

    setError(''); // Clear previous submission errors
    setQuery('');
    setIsSending(true); // Indicate that a message is being sent

    // Debug log to ensure interval setup code path executes
    console.log(
      'ChatInterface DEBUG: Attempting to set interval. isSending:',
      isSending,
      'PROGRESS_INTERVAL_MS:',
      PROGRESS_INTERVAL_MS
    );

    console.log(
      '[handleSubmit] Sending Query:',
      trimmedQuery,
      'to ChatId:',
      chatId,
      'with Context:',
      chatContext
    );

    // --- MOVED: Add user message immediately ---
    const userMessage: Message = {
      _id: uuidv4(), // Generate a temporary frontend ID
      sender: 'user',
      text: trimmedQuery,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage); // Call prop immediately
    // --- END MOVE ---

    try {
      // Prepare history from props (excluding potential loading messages)
      const historyPayload = messages
        .filter(m => m.sender === 'user' || m.sender === 'assistant') // Basic filter
        .map(m => ({ sender: m.sender, text: m.text })); // Map to { sender, text }

      // chatContext will be sent directly as searchMode to the backend
      // The backend will handle the mapping from searchMode to knowledgeBaseTarget

      const payload = {
        query: trimmedQuery,
        // Send message history excluding the latest (which might be the user's input if added optimistically)
        history: historyPayload,
        searchMode: chatContext, // Send searchMode parameter that matches backend expectation
        chatId: chatId, // Pass the current chatId (null for new chat)
      };

      const response = await fetchWithAuth('/api/chats', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        console.error('[handleSubmit] Authentication failed (401).');
        setError('Session expired. Please log in again.');
        logout();
        setIsSending(false);
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        console.error(`[handleSubmit] HTTP error! Status: ${response.status}`, result);
        const errorMsg = result?.message || `Request failed with status: ${response.status}`;
        // Display error locally, parent doesn't need to know about transient submit errors
        setError(`Error: ${errorMsg}`);
        // Optionally, re-add user query to input if desired on failure
        // setQuery(currentQuery);
        throw new Error(errorMsg); // Throw to prevent success callback
      }

      // Check for persistence errors reported by backend
      if (result.persistenceError) {
        console.warn(
          '[ChatInterface] Backend reported persistence error:',
          result.persistenceError
        );
        // Optionally show a non-blocking warning to the user
        setError(`Warning: ${result.persistenceError}`); // Show as warning, maybe not critical
      }

      console.log('[handleSubmit] Response OK, Data:', result);

      // SUCCESS: stop progress timer and clear placeholder
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setAssistantProgressMsg(null);

      // SUCCESS: Call parent callback with the API response data
      onAssistantResponse(result);

      setQuery(''); // Clear input after successfully passing data up
    } catch (err) {
      console.error('Chat request failed:', err);
      // Error state is already set if it was an HTTP error with message
      if (!error) {
        // Only set if not already set by HTTP error check
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Error: ${errorMessage}`);
      }
      // No need to add error message to chat history here, parent controls messages
    } finally {
      // On any exit, clear timer
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setAssistantProgressMsg(null);
      setIsSending(false);
      console.log('[handleSubmit] Finally block reached, isSending set to false.');
    }
  };

  // Add type for KeyboardEvent on textarea
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // Create a synthetic form event for handleSubmit
      const form = event.currentTarget.closest('form');
      if (form) {
        handleSubmit(
          new Event('submit', {
            cancelable: true,
            bubbles: true,
          }) as unknown as FormEvent<HTMLFormElement>
        );
      }
    }
  };

  // Ensure timer cleared on unmount
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900">
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {[...messages, ...(assistantProgressMsg ? [assistantProgressMsg] : [])].map(
          (msg: Message) => {
            const userBg = 'bg-blue-100';
            const assistantBg = 'bg-slate-100';
            const messageBgClass = msg.sender === 'user' ? userBg : assistantBg;

            const userTextColor = 'text-slate-900';
            const assistantTextColor = 'text-slate-800';
            const textColor = msg.sender === 'user' ? userTextColor : assistantTextColor;

            return (
              <div
                key={msg._id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`relative max-w-[85%] md:max-w-[75%] p-3 shadow rounded-lg ${messageBgClass}`}
                >
                  <div className="w-full h-full">
                    <p className={`text-sm whitespace-pre-wrap ${textColor}`}>{msg.text}</p>

                    {/* Token usage display removed */}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
                        <span className="font-semibold mr-1 text-slate-600">Sources:</span>
                        {msg.sources.map((source: Source, idx: number) => {
                          return (
                            <Button
                              key={`source-${msg._id}-${idx}`}
                              variant="outline"
                              size="sm"
                              className="h-auto px-2 py-1 text-xs border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => {
                                onSourceClick?.(source);
                              }}
                              disabled={!source.documentId}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              {source.fileName || 'Unknown File'}{' '}
                              {source.pageNumbers?.length
                                ? `(p. ${source.pageNumbers.join(', ')})`
                                : ''}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {msg.sender === 'user' && (
                    <div className="absolute w-0 h-0 bottom-[6px] right-[-8px] border-8 border-transparent border-l-blue-100"></div>
                  )}
                  {msg.sender === 'assistant' && (
                    <div className="absolute w-0 h-0 top-[6px] left-[-8px] border-8 border-transparent border-r-slate-100"></div>
                  )}
                </div>
              </div>
            );
          }
        )}
        {isLoadingMessages && (
          <div className="flex justify-start">
            <div className="relative p-3 rounded-2xl rounded-tl-sm bg-gray-100 text-text-secondary-light italic text-sm shadow-md">
              Loading chat history...{' '}
              <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current ml-1"></span>
              <div className="absolute w-0 h-0 top-[6px] left-[-8px] border-8 border-transparent border-r-gray-100"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
      <div className="p-4 bg-slate-50 flex-shrink-0 border-t border-slate-200">
        <form onSubmit={handleSubmit} className="flex items-start space-x-3">
          <textarea
            rows={1}
            value={query}
            onChange={handleQueryChange}
            placeholder="Type your message..."
            className="flex-grow p-3 rounded-lg resize-none overflow-y-hidden max-h-40 bg-white border border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400 focus:outline-none"
            disabled={isSending || isLoadingMessages}
            autoComplete="off"
            onKeyDown={handleKeyDown}
          />
          <Button
            type="submit"
            disabled={!query.trim() || isSending || isLoadingMessages}
            className="self-end h-auto py-3 bg-slate-900 text-slate-50 hover:bg-slate-900/90"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
