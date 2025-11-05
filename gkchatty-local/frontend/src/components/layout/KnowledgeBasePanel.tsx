'use client';
import React from 'react';

export function KnowledgeBasePanel() {
  return (
    // Outer container: Set to bg-background, flex column, full height
    <div className="h-full bg-background flex flex-col">
      {/* Header: Add padding */}
      <h3 className="text-md font-semibold px-4 pt-4 pb-2 text-foreground">Knowledge Base</h3>
      {/* Inner content container: Add bg-muted, rounding, padding, margin, flex-1 */}
      <div className="space-y-2 text-sm flex-1 bg-muted rounded-lg p-4 m-4">
        {/* Ensure text color is appropriate */}
        <p className="text-muted-foreground">Full Knowledge Base content will appear here.</p>
        <p className="text-muted-foreground">KB Item 1</p>
        <p className="text-muted-foreground">KB Item 2</p>
      </div>
    </div>
  );
}
