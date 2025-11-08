'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Info } from 'lucide-react';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface OpenAiApiConfigProps {
  // Add props if needed
}

interface OpenAiConfig {
  apiKeySource: 'database' | 'environment_fallback' | 'not_set';
  isApiKeySetInDB: boolean;
  activeApiKeyMasked: string | null;
  activeOpenAIModelId: string | null;
  activeChatModelId: string;
  allowedModels: string[];
}

const OpenAiApiConfig: React.FC<OpenAiApiConfigProps> = () => {
  // State variables
  const [apiKeyInputValue, setApiKeyInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [currentConfig, setCurrentConfig] = useState<OpenAiConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { toast } = useToast();

  // Helper to check if model is local
  const isLocalModel = (modelId: string): boolean => {
    return modelId.startsWith('local:');
  };

  // List of OpenAI models (will be replaced by API response)
  const defaultModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  // Fetch initial configuration
  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      setMessage(null);
      setApiError(null);

      try {
        console.log(
          '[OpenAiApiConfig] Attempting to fetch config from:',
          `${API_BASE_URL}/api/admin/settings/openai-config`
        );
        const response = await fetch(`${API_BASE_URL}/api/admin/settings/openai-config`, {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        console.log('[OpenAiApiConfig] Fetch response status:', response.status);

        if (!response.ok) {
          let errorData;
          let errorText;
          try {
            errorData = await response.json();
            console.log('[OpenAiApiConfig] Error response data:', errorData);
          } catch (e) {
            try {
              errorText = await response.text();
              console.log('[OpenAiApiConfig] Error response text:', errorText);
            } catch (textError) {
              errorText = 'No response body available';
            }
            errorData = { message: errorText || 'Failed to parse error response' };
          }

          setApiError(`API Error ${response.status}: ${errorData.message || 'Unknown error'}`);
          throw new Error(errorData.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        console.log('[OpenAiApiConfig] API response data:', data);

        if (data.success) {
          setCurrentConfig(data);
          if (data.activeChatModelId) {
            setSelectedModel(data.activeChatModelId);
          }
          console.log('[OpenAiApiConfig] Loaded configuration:', data);

          // If previous message was an error, show success
          if (message && message.type === 'error') {
            setMessage({
              type: 'success',
              text: 'Successfully loaded OpenAI configuration.',
            });
          }
        } else {
          setApiError(`API returned non-success response: ${data.message || 'Unknown error'}`);
          throw new Error(data.message || 'Invalid response format from API');
        }
      } catch (error: unknown) {
        console.error('[OpenAiApiConfig] Failed to fetch OpenAI config:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        // Don't overwrite API error if it's already set
        if (!apiError) {
          setApiError(errorMessage);
        }

        setMessage({
          type: 'error',
          text: `Failed to load OpenAI configuration: ${errorMessage}`,
        });

        // Create a default config with reasonable fallbacks so UI doesn't break
        setCurrentConfig({
          apiKeySource: 'not_set',
          isApiKeySetInDB: false,
          activeApiKeyMasked: null,
          activeOpenAIModelId: null,
          activeChatModelId: 'gpt-4o-mini',
          allowedModels: defaultModels,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Handle Save Configuration
  const handleSaveConfig = async () => {
    if (!selectedModel) {
      toast({
        title: 'Validation Error',
        description: 'Please select a model',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setApiError(null);

    try {
      const payload = {
        modelId: selectedModel,
        apiKey: apiKeyInputValue.trim() || undefined, // Only send if non-empty
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/settings/openai-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json().catch(() => ({}));
        } catch (e) {
          errorData = {};
        }

        setApiError(`API Error ${response.status}: ${errorData.message || 'Unknown error'}`);
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // Clear API key input after successful save
        setApiKeyInputValue('');

        // Show success message
        setMessage({
          type: 'success',
          text: 'OpenAI configuration updated successfully.',
        });

        toast({
          title: 'Success',
          description: 'OpenAI configuration updated successfully.',
        });

        // Refetch the config to show updated settings
        fetchConfig();
      } else {
        setApiError(`API returned non-success response: ${data.message || 'Unknown error'}`);
        throw new Error(data.message || 'Failed to update OpenAI configuration');
      }
    } catch (error: unknown) {
      console.error('[OpenAiApiConfig] Failed to save OpenAI config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Don't overwrite API error if it's already set
      if (!apiError) {
        setApiError(errorMessage);
      }

      setMessage({
        type: 'error',
        text: `Failed to save OpenAI configuration: ${errorMessage}`,
      });

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Revert to System Default
  const handleRevertToDefault = async () => {
    setIsReverting(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/openai-api-key`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Success',
          description: data.message || 'API key reverted to system default.',
        });

        // Clear API key input
        setApiKeyInputValue('');

        // Refetch the config to show updated settings
        fetchConfig();
      } else {
        throw new Error(data.message || 'Failed to revert API key');
      }
    } catch (error: unknown) {
      console.error('[OpenAiApiConfig] Failed to revert API key:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setMessage({
        type: 'error',
        text: `Failed to revert to system default: ${errorMessage}`,
      });
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsReverting(false);
    }
  };

  // Fetch configuration function (for reuse)
  const fetchConfig = async () => {
    setIsLoading(true);
    setApiError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/openai-config`, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json().catch(() => ({}));
        } catch (e) {
          errorData = {};
        }

        setApiError(`API Error ${response.status}: ${errorData.message || 'Unknown error'}`);
        throw new Error(`Failed to fetch config: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setCurrentConfig(data);
        if (data.activeChatModelId) {
          setSelectedModel(data.activeChatModelId);
        }
      } else {
        setApiError(`API returned non-success response: ${data.message || 'Unknown error'}`);
        throw new Error('Invalid response format');
      }
    } catch (error: unknown) {
      console.error('[OpenAiApiConfig] Refetch error:', error);
      // Don't show toast here as this is a refetch

      // Create a default config with reasonable fallbacks
      if (!currentConfig) {
        setCurrentConfig({
          apiKeySource: 'not_set',
          isApiKeySetInDB: false,
          activeApiKeyMasked: null,
          activeOpenAIModelId: null,
          activeChatModelId: 'gpt-4o-mini',
          allowedModels: defaultModels,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card shadow-sm mt-6">
      <h2 className="text-xl font-semibold">OpenAI API Configuration</h2>
      <p className="text-sm text-muted-foreground">
        Manage the OpenAI API key and model settings used for chat interactions. You can use your
        own API key or the system default.
      </p>

      {/* Error Display */}
      {apiError && (
        <Alert variant="destructive" className="mt-2">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs overflow-auto max-h-24">
            <strong>API Error:</strong> {apiError}
          </AlertDescription>
        </Alert>
      )}

      {/* Current Status Display */}
      <div className="space-y-1 mt-4">
        <div className="text-sm font-medium">
          Current API Key Status:{' '}
          {isLoading ? (
            <Skeleton className="inline-block h-4 w-40" />
          ) : !currentConfig ? (
            <span className="text-destructive">Not available</span>
          ) : currentConfig.isApiKeySetInDB ? (
            <span className="text-green-600">
              Custom Key Set{' '}
              {currentConfig.activeApiKeyMasked && `(ends in ${currentConfig.activeApiKeyMasked})`}
            </span>
          ) : currentConfig.apiKeySource === 'environment_fallback' ? (
            <span className="text-amber-600">Using System Default Key (from environment)</span>
          ) : (
            <span className="text-destructive">No API Key Available</span>
          )}
        </div>

        <div className="text-sm font-medium">
          Current Model:{' '}
          {isLoading ? (
            <Skeleton className="inline-block h-4 w-32" />
          ) : !currentConfig ? (
            <span className="text-destructive">Not available</span>
          ) : (
            <span className="text-blue-600">
              {currentConfig.activeChatModelId || 'System Default'}
            </span>
          )}
        </div>
      </div>

      {/* Form Section */}
      <div className="space-y-6 mt-6">
        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor="apiKey">
            Set Custom OpenAI API Key (Optional - leave blank to use system default)
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKeyInputValue}
            onChange={e => setApiKeyInputValue(e.target.value)}
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            disabled={isLoading || isSaving || isReverting}
          />
          <p className="text-xs text-muted-foreground">
            Your API key is stored securely in the database and is never exposed in client-side
            code.
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <Label htmlFor="model">Preferred OpenAI Model</Label>
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={isLoading || isSaving || isReverting}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {(currentConfig?.allowedModels || defaultModels)
                .filter(model => model !== 'gpt-3.5-turbo-0125')
                .map(model => {
                  const isLocal = isLocalModel(model);
                  const displayName = isLocal ? model.replace('local:', '') : model;

                  return (
                    <SelectItem key={model} value={model}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {isLocal ? '🏠' : '☁️'}
                        </span>
                        <span>{displayName}</span>
                        {isLocal && (
                          <span className="text-xs text-green-600 font-medium">
                            FREE
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <Button onClick={handleSaveConfig} disabled={isLoading || isSaving || isReverting}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>

          {currentConfig?.isApiKeySetInDB && (
            <Button
              variant="outline"
              onClick={handleRevertToDefault}
              disabled={isLoading || isSaving || isReverting}
            >
              {isReverting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reverting...
                </>
              ) : (
                'Revert to System Default'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Message Display Area */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mt-4">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default OpenAiApiConfig;
