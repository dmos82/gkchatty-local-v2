'use client';

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

interface MobileNavProps {
  user: any;
  activeView: 'chat' | 'docs';
  setActiveView: (view: 'chat' | 'docs') => void;
  chats: any[];
  selectedChatId: string | null;
  isLoadingChats: boolean;
  handleNewChat: () => void;
  handleSelectChat: (chatId: string) => void;
  handleConfirmDelete: (chatId: string) => void;
  onDeleteAllChats: () => void;
  isAlertAllOpen: boolean;
  setIsAlertAllOpen: (open: boolean) => void;
  handleLogout: () => void;
  onUpdateChatName: (chatId: string, newName: string) => Promise<void>;
}

export function MobileNav(props: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleSelectChatAndClose = (chatId: string) => {
    props.handleSelectChat(chatId);
    setOpen(false);
  };

  const handleNewChatAndClose = () => {
    props.handleNewChat();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-11 w-11"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <Sidebar
          {...props}
          handleSelectChat={handleSelectChatAndClose}
          handleNewChat={handleNewChatAndClose}
        />
      </SheetContent>
    </Sheet>
  );
}
