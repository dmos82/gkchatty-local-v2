'use client';
import React, { useState, useEffect } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from 'react-toastify';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const UserDocsSettings = () => {
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const { settings, isLoading, error, updateSettings } = useUserSettings();
  const [isPersonaEnabled, setIsPersonaEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoading && settings) {
      setCustomPrompt(settings.customPrompt || '');
      setIsPersonaEnabled(settings.isPersonaEnabled || false);
      console.log('User Settings Loaded:', {
        customPrompt: settings.customPrompt,
        isPersonaEnabled: settings.isPersonaEnabled,
      });
    }
  }, [isLoading, settings]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateSettings({ customPrompt, isPersonaEnabled });
      toast.success('Persona settings saved successfully!');
      console.log('Settings saved:', { customPrompt, isPersonaEnabled });
    } catch (err: unknown) {
      toast.error(
        'Failed to save persona settings: ' + (err instanceof Error ? err.message : 'Unknown error')
      );
      console.error('Error saving persona settings:', err);
    }
  };

  const resetToDefault = (event: React.MouseEvent) => {
    event.preventDefault();
    setCustomPrompt('');
    setIsPersonaEnabled(false);
    toast.info('Persona settings reset in UI. Click Save to apply.');
  };

  if (isLoading) {
    return <p>Loading persona settings...</p>;
  }

  if (error) {
    return <p className="text-red-500">Error loading settings: {error.message}</p>;
  }

  return (
    <form onSubmit={saveSettings}>
      <h2>My Documents Persona</h2>

      <div className="flex items-center space-x-2 mb-4">
        <Switch
          id="persona-toggle"
          checked={isPersonaEnabled}
          onCheckedChange={setIsPersonaEnabled}
        />
        <Label htmlFor="persona-toggle">Enable My Custom Persona (Applies to all chat modes)</Label>
      </div>

      <div className="mb-4">
        <label
          htmlFor="custom-prompt"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Custom Prompt
        </label>
        <textarea
          id="custom-prompt"
          rows={4}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          placeholder="Enter a custom prompt for the AI when responding to questions about your documents..."
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          disabled={!isPersonaEnabled}
        ></textarea>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          If left empty, the system will use the default prompt.
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Custom Icon
        </label>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          [Your existing icon upload/display components go here]
        </p>
        <button type="button" disabled={!isPersonaEnabled}>
          Choose Icon
        </button>
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">No custom icon set.</span>
      </div>

      <div className="flex justify-start space-x-4">
        <button
          type="submit"
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Save Settings
        </button>
        <button
          type="button"
          className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          onClick={resetToDefault}
        >
          Reset to Default
        </button>
      </div>
    </form>
  );
};

export default UserDocsSettings;
