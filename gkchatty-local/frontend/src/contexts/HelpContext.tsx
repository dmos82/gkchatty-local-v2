'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { helpContent, HelpItem } from '@/utils/helpContent';

interface HelpContextType {
  isHelpModeEnabled: boolean;
  toggleHelpMode: () => void;
  activeHelpId: string | null;
  setActiveHelpId: (id: string | null) => void;
  getHelpContent: (id: string) => HelpItem | null;
  clearHelp: () => void;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

interface HelpProviderProps {
  children: ReactNode;
}

const HELP_MODE_STORAGE_KEY = 'gkchatty-help-mode-enabled';
const HIDE_DELAY_MS = 150; // Delay before hiding tooltip to prevent flicker

export const HelpProvider: React.FC<HelpProviderProps> = ({ children }) => {
  const [isHelpModeEnabled, setIsHelpModeEnabled] = useState<boolean>(false);
  const [activeHelpId, setActiveHelpIdState] = useState<string | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  // Load state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HELP_MODE_STORAGE_KEY);
      if (saved === 'true') {
        setIsHelpModeEnabled(true);
      }
    }
  }, []);

  // Clear activeHelpId when route changes
  useEffect(() => {
    setActiveHelpIdState(null);
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, [pathname]);

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
        setActiveHelpIdState(null);
        if (typeof window !== 'undefined') {
          localStorage.setItem(HELP_MODE_STORAGE_KEY, 'false');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpModeEnabled]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const toggleHelpMode = useCallback(() => {
    setIsHelpModeEnabled(prev => {
      const newValue = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem(HELP_MODE_STORAGE_KEY, String(newValue));
      }
      // Clear active help when disabling
      if (!newValue) {
        setActiveHelpIdState(null);
      }
      return newValue;
    });
  }, []);

  // Debounced setActiveHelpId to prevent flickering
  const setActiveHelpId = useCallback((id: string | null) => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (id !== null) {
      // Show immediately when hovering a new element
      setActiveHelpIdState(id);
    } else {
      // Delay hiding to prevent flicker when moving between elements
      hideTimeoutRef.current = setTimeout(() => {
        setActiveHelpIdState(null);
      }, HIDE_DELAY_MS);
    }
  }, []);

  // Immediate clear function (for route changes)
  const clearHelp = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setActiveHelpIdState(null);
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
    clearHelp,
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
