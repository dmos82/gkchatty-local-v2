'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Use the frontend's expected naming convention that gets mapped to backend values
export type SearchMode = 'hybrid' | 'system-kb' | 'user-docs';

interface SearchModeContextType {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
}

const SearchModeContext = createContext<SearchModeContextType | undefined>(undefined);

interface SearchModeProviderProps {
  children: ReactNode;
}

const SEARCH_MODE_STORAGE_KEY = 'gkchatty-search-mode';

export const SearchModeProvider: React.FC<SearchModeProviderProps> = ({ children }) => {
  const [searchMode, setSearchModeState] = useState<SearchMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SEARCH_MODE_STORAGE_KEY) as SearchMode | null;
      if (saved === 'hybrid' || saved === 'system-kb' || saved === 'user-docs') {
        console.log('[SearchModeContext] Loading search mode from localStorage:', saved);
        return saved;
      }
    }
    console.log('[SearchModeContext] No valid search mode found, defaulting to system-kb');
    return 'system-kb'; // Default to System KB search
  });

  const setSearchMode = (mode: SearchMode) => {
    console.log('[SearchModeContext] Setting search mode:', mode);
    setSearchModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SEARCH_MODE_STORAGE_KEY, mode);
    }
  };

  const value: SearchModeContextType = {
    searchMode,
    setSearchMode,
  };

  return <SearchModeContext.Provider value={value}>{children}</SearchModeContext.Provider>;
};

export const useSearchMode = (): SearchModeContextType => {
  const context = useContext(SearchModeContext);
  if (context === undefined) {
    throw new Error('useSearchMode must be used within a SearchModeProvider');
  }
  return context;
}; 