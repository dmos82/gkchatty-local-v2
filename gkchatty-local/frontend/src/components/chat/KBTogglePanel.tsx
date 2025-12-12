'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Database, FolderOpen } from 'lucide-react';
import { useSearchMode } from '@/contexts/SearchModeContext';
import { cn } from '@/lib/utils';

interface KBTogglePanelProps {
  onKBsChange?: (enabledKBs: string[]) => void;
}

export default function KBTogglePanel({ onKBsChange }: KBTogglePanelProps) {
  const { searchMode, setSearchMode } = useSearchMode();

  const handleSystemKBToggle = (checked: boolean) => {
    if (checked) {
      setSearchMode('system-kb');
    } else if (searchMode === 'system-kb') {
      // If unchecking system KB while it's active, switch to user docs
      setSearchMode('user-docs');
    }
    
    // Notify parent if needed
    if (onKBsChange) {
      onKBsChange(checked ? ['system'] : []);
    }
  };

  const handleMyDocsToggle = (checked: boolean) => {
    if (checked) {
      setSearchMode('user-docs');
    } else if (searchMode === 'user-docs') {
      // If unchecking user docs while it's active, switch to system KB
      setSearchMode('system-kb');
    }
    
    // Notify parent if needed
    if (onKBsChange) {
      onKBsChange(checked ? ['user'] : []);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-4 pt-4">
        <h3 className="text-sm font-semibold">Knowledge Sources</h3>
      </div>

      <div className="space-y-2 px-4 pb-4">
        {/* System KB Toggle */}
        <div
          data-help-id="chat-system-kb"
          className={cn(
            "flex items-center justify-between py-2 px-3 rounded-lg transition-colors",
            searchMode === 'system-kb' ? 'bg-primary/10' : 'bg-muted/50'
          )}>
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor="system-kb" className="text-sm font-medium cursor-pointer">
                System Knowledge Base
              </Label>
              <p className="text-xs text-muted-foreground">Core company knowledge</p>
            </div>
          </div>
          <Switch
            id="system-kb"
            checked={searchMode === 'system-kb'}
            onCheckedChange={handleSystemKBToggle}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* My Docs Toggle */}
        <div
          data-help-id="chat-my-docs"
          className={cn(
            "flex items-center justify-between py-2 px-3 rounded-lg transition-colors",
            searchMode === 'user-docs' ? 'bg-primary/10' : 'bg-muted/50'
          )}>
          <div className="flex items-center gap-3">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor="user-docs" className="text-sm font-medium cursor-pointer">
                My Documents
              </Label>
              <p className="text-xs text-muted-foreground">Your personal uploaded files</p>
            </div>
          </div>
          <Switch
            id="user-docs"
            checked={searchMode === 'user-docs'}
            onCheckedChange={handleMyDocsToggle}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>
    </div>
  );
}