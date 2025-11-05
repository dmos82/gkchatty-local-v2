'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { useAuth } from '@/hooks/useAuth';
import OpenAiApiConfig from './OpenAiApiConfig';
import ServerInfo from './ServerInfo';

const SettingsManager: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemPrompt = useCallback(async () => {
    if (!user || user.role !== 'admin') return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/settings/system-prompt', {
        method: 'GET',
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const data = await response.json();
      if (data.success && typeof data.prompt === 'string') {
        setSystemPrompt(data.prompt);
      } else {
        throw new Error(data.message || 'Invalid data structure for system prompt.');
      }
    } catch (error: any) {
      console.error('[SettingsManager] Failed to fetch system prompt:', error);
      setError(error.message);
      toast({
        title: 'Error Fetching System Prompt',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchSystemPrompt();
  }, [fetchSystemPrompt]);

  const handleSaveSystemPrompt = async () => {
    if (!systemPrompt.trim()) {
      toast({
        title: 'Validation Error',
        description: 'System prompt cannot be empty.',
        variant: 'destructive',
      });
      return;
    }
    if (!user || user.role !== 'admin') {
      toast({ title: 'Error', description: 'Unauthorized.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth('/api/settings/system-prompt', {
        method: 'PUT',
        body: JSON.stringify({ prompt: systemPrompt }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({ title: 'Success', description: 'System prompt updated successfully.' });
        if (result.prompt) setSystemPrompt(result.prompt);
      } else {
        throw new Error(
          result.message || `Failed to save system prompt (Status: ${response.status})`
        );
      }
    } catch (error: any) {
      console.error('[SettingsManager] Error saving system prompt:', error);
      toast({ title: 'Error Saving Prompt', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold mb-4">Settings</h2>
        
        {/* System Prompt Section */}
        <div className="space-y-4 mb-8">
          <div>
            <Label htmlFor="system-prompt" className="text-lg font-semibold">
              System Prompt
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              This prompt is used to guide the AI's responses. It sets the context and behavior for all chat interactions.
            </p>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-destructive">
              <p>{error}</p>
              <Button variant="outline" className="mt-2" onClick={fetchSystemPrompt}>
                Try Again
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Enter the system prompt..."
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveSystemPrompt}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save System Prompt'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* OpenAI API Configuration */}
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold mb-4">OpenAI API Configuration</h3>
          <OpenAiApiConfig />
        </div>

        {/* Server Information */}
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold mb-4">Server Information</h3>
          <ServerInfo />
        </div>
      </div>
    </div>
  );
};

export default SettingsManager;