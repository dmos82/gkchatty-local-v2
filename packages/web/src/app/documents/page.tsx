'use client';

import React from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserDocTreeManager from '@/components/UserDocTreeManager';
import UserDocsSettings from '@/components/settings/UserDocsSettings';
import PersonaList from '@/components/admin/PersonaList';

export default function DocumentManagerPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-4 md:p-6 space-y-6 bg-background min-h-screen">
        <div className="mb-4">
          <Link href="/" passHref legacyBehavior>
            <Button variant="outline">Back to Chat</Button>
          </Link>
        </div>

        <Tabs defaultValue="documents" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            {user &&
              (user.role === 'admin' ||
                Boolean(
                  (user as unknown as { canCustomizePersona?: boolean })?.canCustomizePersona
                )) && <TabsTrigger value="settings">Persona Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="documents">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold dark:text-neutral-200">My Documents</h1>
            </div>
            <p className="text-muted-foreground mb-6 dark:text-neutral-400">
              Manage your uploaded documents here. Upload PDF, TXT, Excel, image, or audio files
              (MP3, WAV, etc.). Audio files are automatically transcribed to searchable PDFs.
            </p>

            {/* User Document Tree Manager Component */}
            <UserDocTreeManager />
          </TabsContent>

          {user &&
            (user.role === 'admin' ||
              Boolean(
                (user as unknown as { canCustomizePersona?: boolean })?.canCustomizePersona
              )) && (
              <TabsContent value="settings">
                <div className="card border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 shadow-md p-6">
                  {
                    user?.role === 'admin' ? (
                      <PersonaList /> // Admin sees the global persona management UI
                    ) : user?.canCustomizePersona ? (
                      <UserDocsSettings /> // Non-admin with permission sees their own settings
                    ) : null /* Should not happen if TabTrigger has same condition, but as a fallback */
                  }
                </div>
              </TabsContent>
            )}
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
