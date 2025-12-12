'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useHelp } from '@/contexts/HelpContext';

interface HeaderProps {
  // No children needed for this static header
}

export const Header: React.FC<HeaderProps> = () => {
  const { isHelpModeEnabled, toggleHelpMode } = useHelp();

  return (
    <header className="h-[48px] bg-background-light border-b border-border-light flex items-center justify-between px-4 flex-shrink-0 shadow-sm z-10">
      {/* Logo / Brand */}
      <span className="font-semibold text-lg text-text-primary-light">GK CHATTY</span>

      {/* Right side controls */}
      <div className="flex items-center gap-2">
        {/* Help Mode Toggle Button */}
        <button
          onClick={toggleHelpMode}
          data-help-id="header-help-mode"
          className={`
            p-2 rounded-lg transition-all duration-200
            ${isHelpModeEnabled
              ? 'bg-yellow-500 text-yellow-900 shadow-md'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
            }
          `}
          aria-label={isHelpModeEnabled ? 'Disable help mode' : 'Enable help mode'}
          title="Toggle Help Mode (press ? key)"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};

export default Header;
