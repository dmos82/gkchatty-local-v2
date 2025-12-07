'use client';

import React from 'react';
import { DMProvider } from '@/contexts/DMContext';
import { IMProvider, useIM } from '@/contexts/IMContext';
import { IMBuddyList } from './IMBuddyList';
import { IMChatWindow } from './IMChatWindow';
import { IMToggle } from './IMToggle';

const IMContainerInner: React.FC = () => {
  const { isBuddyListOpen, closeBuddyList, chatWindows } = useIM();

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
