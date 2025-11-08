// Utility functions for API calls
import { Document, ChatSummary, ChatDetail } from '@/types'; // Import necessary types
import { ApiErrorResponse, StandardApiResponse } from '@/types'; // Import necessary types
import { fetchWithAuth } from './fetchWithAuth';

/**
 * Process API error responses and extract user-friendly error messages
 * @param response - The fetch Response object
 * @returns A standardized ApiErrorResponse object
 */
export async function handleApiError(response: Response): Promise<ApiErrorResponse> {
  try {
    const data = await response.json();
    if (data && !data.success && data.message) {
      return {
        success: false,
        status: response.status,
        errorCode: data.errorCode || null,
        message: data.message,
        data: data,
      };
    }
    return {
      success: false,
      status: response.status,
      message: response.statusText || `Error ${response.status}`,
    };
  } catch (jsonError) {
    return {
      success: false,
      status: response.status,
      message: `Request failed with status ${response.status} and could not parse error response.`,
    };
  }
}

// --- Existing Document Fetch Function (Example) ---
export async function fetchDocuments(token: string): Promise<StandardApiResponse<Document[]>> {
  const response = await fetchWithAuth('/api/documents', {
    method: 'GET',
  });
  if (!response.ok) {
    throw await handleApiError(response);
  }
  const data: StandardApiResponse<Document[]> = await response.json();
  if (!data.success || !Array.isArray(data.data)) {
    throw new Error('Invalid data format or missing documents array in response.');
  }
  return data;
}

// --- New Chat List Fetch Function ---
export async function fetchChatList(): Promise<StandardApiResponse<ChatSummary[]>> {
  const response = await fetchWithAuth('/api/chats', {
    method: 'GET',
  });
  if (!response.ok) {
    throw await handleApiError(response);
  }
  const data: StandardApiResponse<ChatSummary[]> = await response.json();
  if (!data.success || !Array.isArray(data.data)) {
    throw new Error('Invalid chat list data format or missing chats array in response.');
  }
  return data;
}

// --- New Chat Details Fetch Function ---
export async function fetchChatDetails(
  chatId: string,
  token: string
): Promise<StandardApiResponse<ChatDetail>> {
  const response = await fetchWithAuth(`/api/chats/${chatId}`, {
    method: 'GET',
  });
  if (!response.ok) {
    throw await handleApiError(response);
  }
  const data: StandardApiResponse<ChatDetail> = await response.json();
  if (!data.success || !data.data) {
    throw new Error('Invalid chat detail data format or missing chat object in response.');
  }
  return data;
}

// --- Add other API utility functions as needed ---
