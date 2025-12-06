import { getApiBaseUrl } from './config';

/**
 * Fetch wrapper that automatically includes Authorization header from localStorage
 * Use this for all authenticated API calls to support both desktop (cookies) and mobile (localStorage)
 */
export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;

  // Build headers - don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add Authorization header from localStorage if available (for mobile compatibility)
  const token = localStorage.getItem('accessToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge options
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Always include cookies (for desktop)
  };
  return fetch(url, fetchOptions);
}
