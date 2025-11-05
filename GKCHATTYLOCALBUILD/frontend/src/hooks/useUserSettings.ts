import { useState, useCallback, useEffect } from 'react';
import {
  UserSettings,
  getUserSettings,
  updateUserSettings,
  uploadUserIcon,
} from '@/lib/api/userSettings';

interface UseUserSettingsReturn {
  settings: UserSettings | null;
  isLoading: boolean;
  error: Error | null;
  updateSettings: (newSettings: {
    customPrompt?: string | null;
    isPersonaEnabled?: boolean;
  }) => Promise<void>;
  uploadIcon: (file: File) => Promise<void>;
  resetPrompt: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

/**
 * Custom hook for fetching, updating, and managing user settings
 * @returns Object containing user settings state and management functions
 */
export function useUserSettings(): UseUserSettingsReturn {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch user settings
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userSettings = await getUserSettings();
      setSettings(userSettings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch user settings'));
      console.error('Error fetching user settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update user settings
  const updateSettings = useCallback(
    async (newSettings: { customPrompt?: string | null; isPersonaEnabled?: boolean }) => {
      setIsLoading(true);
      setError(null);
      try {
        const updatedSettings = await updateUserSettings(newSettings);
        setSettings(updatedSettings);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update user settings'));
        console.error('Error updating user settings:', err);
        throw err; // Rethrow to allow handling in UI components
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Upload user icon
  const uploadIcon = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSettings = await uploadUserIcon(file);
      setSettings(updatedSettings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to upload icon'));
      console.error('Error uploading user icon:', err);
      throw err; // Rethrow to allow handling in UI components
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset prompt to default (null)
  const resetPrompt = useCallback(async () => {
    await updateSettings({ customPrompt: null });
  }, [updateSettings]);

  // Initial fetch on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    uploadIcon,
    resetPrompt,
    refreshSettings: fetchSettings,
  };
}
