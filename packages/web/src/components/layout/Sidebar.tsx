'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  User as UserIcon,
  Trash2,
  ShieldCheck,
  LogOut,
  Pencil,
  MessageSquareWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import UserStatus from './UserStatus';
import { ChatSummary } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import FeedbackModal from '@/components/common/FeedbackModal';

interface SidebarProps {
  user: ReturnType<typeof import('@/hooks/useAuth').useAuth>['user'];
  activeView: 'chat' | 'docs';
  setActiveView: (view: 'chat' | 'docs') => void;
  chats: ChatSummary[];
  selectedChatId: string | null;
  isLoadingChats: boolean;
  handleNewChat: () => void;
  handleSelectChat: (chatId: string) => void;
  handleConfirmDelete: (chatId: string) => void;
  onDeleteAllChats: () => void;
  isAlertAllOpen: boolean;
  setIsAlertAllOpen: (isOpen: boolean) => void;
  handleLogout: () => void;
  onUpdateChatName: (chatId: string, newName: string) => Promise<void>;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeView,
  setActiveView,
  chats,
  selectedChatId,
  isLoadingChats,
  handleNewChat,
  handleSelectChat,
  handleConfirmDelete,
  onDeleteAllChats,
  isAlertAllOpen,
  setIsAlertAllOpen,
  handleLogout,
  onUpdateChatName,
}) => {
  const router = useRouter();

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const { toast } = useToast();
  const {} = useAuth();

  const onLogoutClick = () => {
    console.log('[Sidebar] Logout button clicked. Calling handleLogout prop...');
    handleLogout();
    router.push('/auth');
  };

  const handleStartEdit = (chat: ChatSummary) => {
    setEditingChatId(chat._id);
    setEditedName(chat.chatName);
  };

  const handleCancelEdit = () => {
    setEditingChatId(null);
    setEditedName('');
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditedName(event.target.value);
  };

  const handleSaveEdit = async () => {
    if (!editingChatId || !editedName.trim()) {
      handleCancelEdit();
      return;
    }
    try {
      console.log(`[Sidebar] Saving new name "${editedName.trim()}" for chat ${editingChatId}`);
      await onUpdateChatName(editingChatId, editedName.trim());
    } catch (error) {
      console.error('[Sidebar] Error saving chat name:', error);
    } finally {
      handleCancelEdit();
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSaveEdit();
    } else if (event.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <nav className="w-[280px] h-full bg-background p-3 flex flex-col flex-shrink-0 rounded-lg">
      <div className="mb-4 flex w-full justify-center">
        <a
          href="https://www.goldkeyinsurance.ca/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Gold Key Insurance Homepage"
        >
          <Image
            src="/gk_logo_new.png"
            alt="Gold Key Insurance Logo"
            width={216}
            height={60}
            priority
            unoptimized
          />
        </a>
      </div>

      <Button
        onClick={handleNewChat}
        variant="secondary"
        className="w-full mb-1 transition-all duration-200 ease-in-out hover:bg-secondary/90 hover:scale-[1.02] active:scale-[0.98]"
      >
        New Chat
      </Button>

      {/* Document Manager Link - Always show for logged-in users */}
      <Link href="/documents" passHref legacyBehavior>
        <Button
          variant="secondary"
          className="w-full mb-1 transition-all duration-200 ease-in-out hover:bg-secondary/90 hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* <Icon className="mr-2 h-4 w-4" /> // Optional Icon */}
          Document Manager
        </Button>
      </Link>

      {!isLoadingChats && user?.role === 'admin' && (
        <Link href="/admin" passHref>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start mb-2 text-left text-foreground',
              'transition-all duration-200 ease-in-out hover:bg-muted/10 hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Admin Dashboard
          </Button>
        </Link>
      )}

      {/* Feedback Button - Added here, after Admin Dashboard */}
      <Button
        variant="ghost"
        className={cn(
          'w-full justify-start mb-2 text-left text-foreground',
          'transition-all duration-200 ease-in-out hover:bg-muted/10 hover:scale-[1.02] active:scale-[0.98]'
        )}
        onClick={() => setIsFeedbackModalOpen(true)}
      >
        <MessageSquareWarning className="mr-2 h-4 w-4" />
        Submit Feedback
      </Button>

      <Link href="/usage" passHref>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start mb-2 text-left text-sm text-muted-foreground',
            'transition-all duration-200 ease-in-out hover:bg-muted/10 hover:scale-[1.02] active:scale-[0.98]'
          )}
        >
          Usage
        </Button>
      </Link>

      <Label className="px-3 py-1 mb-2 text-sm font-medium text-foreground">Chats</Label>

      <ScrollArea className="flex-1 pr-1 mt-1">
        <div className="space-y-1">
          {isLoadingChats ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`chat-skeleton-${index}`}
                className="flex items-center p-2 rounded-md mb-1 bg-background/50"
              >
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            ))
          ) : chats.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2 text-center">No chats yet.</p>
          ) : (
            chats.map(chat => (
              <div
                key={chat._id}
                className={cn(
                  'flex items-center group p-2 rounded-md mb-1 shadow-sm transition-colors duration-150 ease-in-out relative',
                  selectedChatId === chat._id
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {/* --- Icon Group (Absolute Position Left, Visible on Hover) --- */}
                {/* Icons container: Initially hidden, appears on hover */}
                <div
                  className={cn(
                    'absolute left-1 top-1/2 -translate-y-1/2 flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10',
                    // Hide if editing this specific chat
                    editingChatId === chat._id && 'opacity-0 pointer-events-none'
                  )}
                >
                  {/* Edit Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-transparent',
                      selectedChatId === chat._id
                        ? 'text-primary-foreground/70 hover:text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={e => {
                      e.stopPropagation();
                      handleStartEdit(chat);
                    }}
                    title={`Edit name for: ${chat.chatName}`}
                  >
                    <Pencil size={13} />
                  </Button>
                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-transparent',
                      selectedChatId === chat._id
                        ? 'text-primary-foreground/70 hover:text-destructive-foreground'
                        : 'text-muted-foreground hover:text-destructive'
                    )}
                    onClick={e => {
                      e.stopPropagation();
                      handleConfirmDelete(chat._id);
                    }}
                    title={`Delete chat: ${chat.chatName}`}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                {/* --- End Icon Group --- */}

                {editingChatId === chat._id ? (
                  // --- EDITING VIEW ---
                  <Input
                    type="text"
                    value={editedName}
                    onChange={handleNameChange}
                    onKeyDown={handleInputKeyDown}
                    onBlur={handleSaveEdit}
                    autoFocus
                    className="h-7 flex-1 text-sm px-2 bg-background focus-visible:ring-primary focus-visible:ring-1"
                  />
                ) : (
                  // --- DISPLAY VIEW ---
                  <Button
                    variant="ghost"
                    className={cn(
                      // Use padding for text, adjust padding left on hover
                      'w-full justify-start text-left h-auto py-0 px-2 overflow-hidden focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-transparent transition-all duration-200 ease-in-out',
                      'group-hover:pl-10', // Add left padding on hover to make space for icons
                      selectedChatId === chat._id ? 'font-semibold' : 'font-normal'
                    )}
                    onClick={() => handleSelectChat(chat._id)}
                  >
                    <span
                      className={cn(
                        'text-sm block truncate whitespace-nowrap',
                        selectedChatId === chat._id ? 'text-primary-foreground' : 'text-foreground'
                      )}
                      title={chat.chatName}
                    >
                      {chat.chatName}
                    </span>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="mt-auto pt-3 border-t border-border space-y-2 relative">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive transition-all duration-200 ease-in-out active:scale-[0.98]"
                onClick={onDeleteAllChats}
                disabled={isLoadingChats || chats.length === 0}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete All Chats
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center">
              <p>Permanently delete all your chat history.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button variant="outline" size="sm" onClick={onLogoutClick} className="w-full">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>

        <UserStatus user={user} />
      </div>

      {/* Add FeedbackModal component at the end of the component */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onOpenChange={setIsFeedbackModalOpen}
        currentChatId={selectedChatId}
      />
    </nav>
  );
};

export default Sidebar;
