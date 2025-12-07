'use client';

import React from 'react';
import { useIM } from '@/contexts/IMContext';
import { useDM } from '@/contexts/DMContext';

export const IMToggle: React.FC = () => {
  const { toggleBuddyList, isBuddyListOpen } = useIM();
  const { totalUnreadCount, isConnected } = useDM();

  return (
    <button
      onClick={toggleBuddyList}
      className={`relative p-2 rounded-lg transition-all duration-200 ${
        isBuddyListOpen
          ? 'bg-yellow-500 text-slate-800 shadow-lg shadow-yellow-500/25'
          : 'bg-[#2a2a2a] hover:bg-[#404040] text-slate-200'
      }`}
      title={isBuddyListOpen ? 'Close Buddy List' : 'Open Buddy List'}
    >
      {/* Chat icon */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
        />
      </svg>

      {/* Connection status indicator */}
      <span
        className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />

      {/* Unread badge */}
      {totalUnreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full shadow-sm">
          {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
        </span>
      )}
    </button>
  );
};

export default IMToggle;
