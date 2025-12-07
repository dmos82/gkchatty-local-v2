'use client';

import React, { useEffect } from 'react';
import { DMProvider, useDM } from '@/contexts/DMContext';
import { IMProvider, useIM } from '@/contexts/IMContext';
import { IMBuddyList } from './IMBuddyList';
import { IMChatWindow } from './IMChatWindow';
import { IMToggle } from './IMToggle';

const IMContainerInner: React.FC = () => {
  const { isBuddyListOpen, closeBuddyList, chatWindows } = useIM();
  const { setOpenConversationIds, markConversationAsRead } = useDM();

  // Sync open (non-minimized) chat window IDs with DMContext
  // This allows DMContext to suppress notification badges for conversations
  // that the user is actively viewing in IM windows
  useEffect(() => {
    const openIds = chatWindows
      .filter((w) => !w.isMinimized && w.conversationId)
      .map((w) => w.conversationId as string);
    setOpenConversationIds(openIds);

    // Also mark these conversations as read since user is viewing them
    openIds.forEach((id) => {
      markConversationAsRead(id);
    });
  }, [chatWindows, setOpenConversationIds, markConversationAsRead]);

  return (
    <>
      {/* Toggle button - fixed position bottom right */}
      <div className="fixed bottom-4 right-4 z-40">
        <IMToggle />
      </div>

      {/* Buddy list popup */}
      {isBuddyListOpen && <IMBuddyList onClose={closeBuddyList} />}

      {/* Chat windows */}
      {chatWindows.map((window) => (
        <IMChatWindow
          key={window.id}
          windowId={window.id}
          recipientId={window.recipientId}
          recipientUsername={window.recipientUsername}
          recipientIconUrl={window.recipientIconUrl}
          conversationId={window.conversationId}
          isMinimized={window.isMinimized}
          position={window.position}
          zIndex={window.zIndex}
        />
      ))}
    </>
  );
};

export const IMContainer: React.FC = () => {
  return (
    <DMProvider>
      <IMProvider>
        <IMContainerInner />
      </IMProvider>
    </DMProvider>
  );
};

export default IMContainer;
