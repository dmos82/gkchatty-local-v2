'use client';

import React, { useState } from 'react';
import FileTreeManager from './FileTreeManager';
import DebugFileTree from './DebugFileTree';
import FileTreeDebug from './FileTreeDebug';
import { Button } from '@/components/ui/button';

const SystemKBManager: React.FC = () => {
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Content Management</h2>
        <Button 
          onClick={() => setShowDebug(!showDebug)} 
          variant="outline" 
          size="sm"
        >
          {showDebug ? 'Hide' : 'Show'} Debug Info
        </Button>
      </div>
      {showDebug && (
        <div className="mb-4 space-y-4">
          <DebugFileTree />
          <FileTreeDebug />
        </div>
      )}
      <FileTreeManager />
    </div>
  );
};

export default SystemKBManager;