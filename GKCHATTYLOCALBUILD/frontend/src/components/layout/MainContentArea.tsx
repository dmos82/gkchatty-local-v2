'use client';

import React from 'react';
import ChatHeader from '@/components/layout/ChatHeader';
import MessageListArea from '@/components/layout/MessageListArea';
import ChatInputArea from '@/components/layout/ChatInputArea';

export default function MainContentArea() {
  // TODO: Make title dynamic later based on selected chat/view
  const currentTitle = 'GKCHATTY Chat';

  return (
    <div className="flex flex-1 flex-col overflow-hidden ml-[240px]">
      <ChatHeader title={currentTitle} />
      <MessageListArea />
      <ChatInputArea />
    </div>
  );
}
