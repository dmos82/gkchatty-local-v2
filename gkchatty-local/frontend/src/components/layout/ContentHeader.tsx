'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChatSummary } from '@/types';
// import { ModeToggle } from "@/components/ui/mode-toggle"; // Removed ModeToggle import

// Define the props required by the ContentHeader
interface ContentHeaderProps {
  activeView: 'chat' | 'docs';
  selectedChatId: string | null;
  chats: ChatSummary[];
  chatContext: 'system-kb' | 'user-docs';
  setChatContext: (context: 'system-kb' | 'user-docs') => void;
}

const ContentHeader: React.FC<ContentHeaderProps> = ({
  activeView,
  selectedChatId,
  chats,
  chatContext,
  setChatContext,
}) => {
  // Determine the title based on the active view and selected chat
  const title =
    activeView === 'chat'
      ? selectedChatId
        ? chats.find(c => c._id === selectedChatId)?.chatName || 'Chat'
        : 'New Chat'
      : 'Document Manager';

  return (
    <header className="bg-white px-4 py-3 border-b border-slate-200 rounded-lg flex items-center justify-between gap-4 flex-shrink-0 z-10">
      {/* Left: Title */}
      <div>
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
      </div>

      {/* Center: Chat Context Toggle (only in chat view) */}
      <div className="flex-1 flex justify-center">
        {activeView === 'chat' && (
          <div className="flex items-center space-x-2 bg-muted p-2 rounded-md">
            {/* Inactive State Text */}
            <span
              className={cn(
                'text-sm px-2 py-1 rounded',
                chatContext === 'system-kb'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              Knowledge Base
            </span>
            <Switch
              id="context-switch"
              checked={chatContext === 'user-docs'}
              onCheckedChange={checked => setChatContext(checked ? 'user-docs' : 'system-kb')}
              aria-label="Switch between Knowledge Base and My Docs context"
            />
            {/* Active State Text */}
            <span
              className={cn(
                'text-sm px-2 py-1 rounded',
                chatContext === 'user-docs'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              My Docs
            </span>
          </div>
        )}
      </div>

      {/* Right: Mode Toggle - Removed */}
      {/* 
      <div className="flex items-center justify-end">
        <ModeToggle />
      </div>
      */}
    </header>
  );
};

export default ContentHeader;
