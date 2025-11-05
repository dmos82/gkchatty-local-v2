import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';
import { SUPPORTED_IMAGE_TYPES } from '@/config/constants';

export interface UserSettings {
  userId?: string;
  customPrompt?: string | null;
  iconUrl?: string | null;
  isPersonaEnabled?: boolean;
  canCustomizePersona?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fetches the current user's settings
 * @returns Promise resolving to user settings
 */
export async function getUserSettings(): Promise<UserSettings> {
  const response = await fetch(`${API_BASE_URL}/api/users/me/settings`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user settings: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to fetch settings');
  }

  return data.settings;
}

/**
 * Updates the current user's settings
 * @param settings Object containing settings to update
 * @returns Promise resolving to updated user settings
 */
export async function updateUserSettings(settings: {
  customPrompt?: string | null;
  isPersonaEnabled?: boolean;
}): Promise<UserSettings> {
  const response = await fetch(`${API_BASE_URL}/api/users/me/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`Failed to update user settings: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to update settings');
  }

  return data.settings;
}

/**
 * Uploads a custom icon for the current user
 * @param file Image file to upload (JPG, PNG, GIF, WebP)
 * @returns Promise resolving to updated user settings with new icon URL
 */
export async function uploadUserIcon(file: File): Promise<UserSettings> {
  // Validate file type
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as typeof SUPPORTED_IMAGE_TYPES[number])) {
    throw new Error('Unsupported file type. Please upload a JPG, PNG, GIF, or WebP image.');
  }

  // Validate file size
  const MAX_ICON_SIZE = 2 * 1024 * 1024; // 2MB
  if (file.size > MAX_ICON_SIZE) {
    throw new Error('File too large. Maximum size is 2MB.');
  }

  const formData = new FormData();
  formData.append('icon', file);

  const response = await fetch(`${API_BASE_URL}/api/users/me/icon`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload icon: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to upload icon');
  }

  return data.settings;
}
