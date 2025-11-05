import React, { createContext, useContext, useState, ReactNode } from 'react';

export type SearchMode = 'hybrid' | 'system' | 'user';

interface SharedStateContextType {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
}

const SharedStateContext = createContext<SharedStateContextType | undefined>(undefined);

interface SharedStateProviderProps {
  children: ReactNode;
}

const SEARCH_MODE_STORAGE_KEY = 'gkchatty-search-mode';

export const SharedStateProvider: React.FC<SharedStateProviderProps> = ({ children }) => {
  const [searchMode, setSearchModeState] = useState<SearchMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SEARCH_MODE_STORAGE_KEY) as SearchMode | null;
      if (saved === 'hybrid' || saved === 'system' || saved === 'user') {
        console.log('[SharedStateContext] Loading search mode from localStorage:', saved);
        return saved;
      }
    }
    console.log('[SharedStateContext] No valid search mode found, defaulting to hybrid');
    return 'hybrid';
  });

  const setSearchMode = (mode: SearchMode) => {
    console.log('[SharedStateContext] Setting search mode:', mode);
    setSearchModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SEARCH_MODE_STORAGE_KEY, mode);
    }
  };

  const value: SharedStateContextType = {
    searchMode,
    setSearchMode,
  };

  return <SharedStateContext.Provider value={value}>{children}</SharedStateContext.Provider>;
};

export const useSharedState = (): SharedStateContextType => {
  const context = useContext(SharedStateContext);
  if (context === undefined) {
    throw new Error('useSharedState must be used within a SharedStateProvider');
  }
  return context;
};
