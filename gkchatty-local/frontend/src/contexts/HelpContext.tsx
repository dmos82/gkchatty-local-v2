'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { helpContent, HelpItem } from '@/utils/helpContent';

interface HelpContextType {
  isHelpModeEnabled: boolean;
  toggleHelpMode: () => void;
  activeHelpId: string | null;
  setActiveHelpId: (id: string | null) => void;
  getHelpContent: (id: string) => HelpItem | null;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

interface HelpProviderProps {
  children: ReactNode;
}

const HELP_MODE_STORAGE_KEY = 'gkchatty-help-mode-enabled';

export const HelpProvider: React.FC<HelpProviderProps> = ({ children }) => {
  const [isHelpModeEnabled, setIsHelpModeEnabled] = useState<boolean>(false);
  const [activeHelpId, setActiveHelpId] = useState<string | null>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HELP_MODE_STORAGE_KEY);
      if (saved === 'true') {
        setIsHelpModeEnabled(true);
      }
    }
  }, []);

  // Keyboard shortcut: Press '?' to toggle help mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Toggle help mode on '?' key
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleHelpMode();
      }

      // Close help mode on Escape
      if (e.key === 'Escape' && isHelpModeEnabled) {
        setIsHelpModeEnabled(false);
        setActiveHelpId(null);
        if (typeof window !== 'undefined') {
          localStorage.setItem(HELP_MODE_STORAGE_KEY, 'false');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpModeEnabled]);

  const toggleHelpMode = useCallback(() => {
    setIsHelpModeEnabled(prev => {
      const newValue = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem(HELP_MODE_STORAGE_KEY, String(newValue));
      }
      // Clear active help when disabling
      if (!newValue) {
        setActiveHelpId(null);
      }
      return newValue;
    });
  }, []);

  const getHelpContent = useCallback((id: string): HelpItem | null => {
    return helpContent[id] || null;
  }, []);

  const value: HelpContextType = {
    isHelpModeEnabled,
    toggleHelpMode,
    activeHelpId,
    setActiveHelpId,
    getHelpContent,
  };

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
};

export const useHelp = (): HelpContextType => {
  const context = useContext(HelpContext);
  if (context === undefined) {
    throw new Error('useHelp must be used within a HelpProvider');
  }
  return context;
};
