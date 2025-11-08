'use client';

import React from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import UserDocTreeManager from '@/components/UserDocTreeManager';

export default function DocumentsNewPage() {
  return (
    <ProtectedRoute>
      <div className="container mx-auto p-4 md:p-6 space-y-6 bg-background min-h-screen">
        {/* Header with navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link href="/" passHref legacyBehavior>
              <Button variant="outline">Back to Chat</Button>
            </Link>
            <Link href="/documents" passHref legacyBehavior>
              <Button variant="outline">View Old Documents Page</Button>
            </Link>
          </div>
          <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-md border border-amber-200 dark:border-amber-700">
            <span className="font-semibold">NEW UI - Testing Mode</span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold dark:text-neutral-200 mb-2">
            My Documents (New UI)
          </h1>
          <p className="text-muted-foreground dark:text-neutral-400">
            This is the new file tree UI adapted from the admin dashboard.
            Features: multi-select, drag-and-drop to folders/root, tree view, keyboard shortcuts.
          </p>
        </div>

        {/* User Document Tree Manager Component */}
        <UserDocTreeManager />
      </div>
    </ProtectedRoute>
  );
}
