'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSearchMode, SearchMode } from '@/contexts/SearchModeContext';
import { Layers, Database, FolderOpen } from 'lucide-react';

const searchModeConfig = {
  hybrid: {
    label: 'Hybrid',
    icon: Layers,
    description: 'Search both Knowledge Base and My Documents',
  },
  'system-kb': {
    label: 'Knowledge Base',
    icon: Database,
    description: 'Search only System Knowledge Base',
  },
  'user-docs': {
    label: 'My Docs',
    icon: FolderOpen,
    description: 'Search only My Documents',
  },
} as const;

export const UnifiedSearchToggle: React.FC = () => {
  const { searchMode, setSearchMode } = useSearchMode();

  const handleModeChange = (mode: SearchMode) => {
    console.log(`[UnifiedSearchToggle] Changing search mode from ${searchMode} to ${mode}`);
    setSearchMode(mode);
  };

  return (
    <div className="flex items-center bg-muted rounded-lg p-1">
      {(Object.keys(searchModeConfig) as SearchMode[]).map(mode => {
        const config = searchModeConfig[mode];
        const Icon = config.icon;
        const isActive = searchMode === mode;

        return (
          <Button
            key={mode}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleModeChange(mode)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
            title={config.description}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{config.label}</span>
          </Button>
        );
      })}
    </div>
  );
}; 