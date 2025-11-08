'use client';

import React from 'react';
// import { ModeToggle } from "@/components/ui/mode-toggle"; // Removed ModeToggle import

interface ChatHeaderProps {
  title: string;
}

// Use default export for consistency with other layout components
export default function ChatHeader({ title }: ChatHeaderProps) {
  return (
    <header className="p-4 border-b border-border bg-background text-foreground flex items-center justify-between flex-shrink-0">
      {/* Left: Title */}
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* <ModeToggle /> // Removed ModeToggle usage */}
        {/* Placeholder for future UserMenu or other actions */}
      </div>
    </header>
  );
}
