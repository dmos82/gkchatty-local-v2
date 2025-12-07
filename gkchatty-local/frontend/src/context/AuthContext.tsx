'use client'; // Context needs to be client-side

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { getApiBaseUrl } from '@/lib/config'; // Use dynamic URL for mobile support
// No longer need Cookies.get for token, rely on httpOnly and verify endpoint
// import Cookies from 'js-cookie';
import { User, AuthContextType } from '@/types'; // Assuming this type import works after build fix

// Create the context with a default value of undefined.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider Component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // REMOVED: const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading until session checked

  // Function to check session validity with backend
  const checkSession = useCallback(async (): Promise<void> => {
    console.log('[AuthContext] checkSession: Attempting API verification...');
    setIsLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      console.log(`[AuthContext] checkSession: Using API URL: ${apiUrl}`);

      // Build headers with token from localStorage (for mobile compatibility)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[AuthContext] checkSession: Including Authorization header from localStorage');
      }

      const response = await fetch(`${apiUrl}/api/auth/verify`, {
        method: 'GET',
        headers,
        credentials: 'omit', // iOS WebKit requires omit for HTTP cross-origin
        mode: 'cors',
      });

      console.log(`[AuthContext] checkSession: Verify API response status: ${response.status}`);

      if (response.ok || response.status === 204) {
        let userData: User | null = null;
        if (response.status === 200) {
          try {
            const data = await response.json();
            if (data && data.user) {
              userData = data.user;
              console.log(
                `[AuthContext] checkSession: Verification SUCCESS (200 OK). User: ${data.user.username}`
              );
            } else {
              console.error(
                '[AuthContext] checkSession: Verify API 200 OK, but no user data in response.'
              );
            }
          } catch (jsonError) {
            console.error(
              '[AuthContext] checkSession: Error parsing JSON response for 200 OK:',
              jsonError
            );
          }
        } else {
          console.log(
            `[AuthContext] checkSession: Verification SUCCESS (204 No Content). Session cookie is valid.`
          );
        }

        if (userData) {
          setUser(userData);
        }
      } else {
        console.log(
          `[AuthContext] checkSession: Verification FAILED (Status: ${response.status}). Setting user to null.`
        );
        setUser(null);
      }
    } catch (error) {
      console.error('[AuthContext] checkSession: Fetch Error during verification:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('[AuthContext] checkSession: setIsLoading(false) immediately.');
    }
  }, []);

  // Function to handle login - NOW ASYNC and returns boolean for success
  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      // console.log(`[AuthContext] login: Attempting login for ${username}...`); // Original log
      console.log(
        `[AuthContext][login][Diag] Attempting login for ${username}. Current state: user=${JSON.stringify(user)}, isLoading=${isLoading}`
      );

      // Log before setIsLoading (though it's already set by checkSession's finally if this is a re-login)
      // For a fresh login, isLoading might be true from initial page load.
      console.log(`[AuthContext][login][Diag] Setting isLoading to true.`);
      setIsLoading(true); // Indicate loading during login attempt

      try {
        const apiUrl = getApiBaseUrl();
        console.log(
          `[AuthContext][login][Diag] Before fetch to /api/auth/login. Using API URL: ${apiUrl}. Username: ${username}`
        );
        const response = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit', // iOS WebKit requires omit for HTTP cross-origin
          mode: 'cors', // Explicit CORS mode
          body: JSON.stringify({ username, password }),
        });

        // console.log(`[AuthContext] login: API response status: ${response.status}`); // Original log
        // Clone the response to log it and then use it
        const responseCloneForLogging = response.clone();
        console.log(
          `[AuthContext][login][Diag] Raw response object from /api/auth/login (status: ${responseCloneForLogging.status}):`,
          responseCloneForLogging
        );
        // Log headers from the cloned response
        const headersObject: Record<string, string> = {};
        responseCloneForLogging.headers.forEach((value, name) => {
          headersObject[name] = value;
        });
        console.log(
          `[AuthContext][login][Diag] Response headers from /api/auth/login:`,
          headersObject
        );

        if (response.ok) {
          const data = await response.json();
          console.log(
            `[AuthContext][login][Diag] Parsed data from successful /api/auth/login:`,
            data
          );

          if (data.success && data.user) {
            console.log(
              `[AuthContext][login][Diag] Login API success and user data received. User: ${data.user.username}. Current state before setUser: user=${JSON.stringify(user)}, isLoading=${isLoading}`
            );
            setUser(data.user);

            // CRITICAL FIX: Store token in localStorage for console/debug access
            if (data.token) {
              localStorage.setItem('accessToken', data.token);
              console.log('[AuthContext][login] Token stored in localStorage');
            } else {
              console.warn(
                '[AuthContext][login] No token in response body - localStorage not updated'
              );
            }

            // Log user state immediately after setting. Due to async nature of setState, this might show the previous value.
            // A useEffect watching 'user' would be better to see the updated state.
            console.log(
              `[AuthContext][login][Diag] After setUser(data.user). (Note: console.log might show stale 'user' state here due to async setState)`
            );
            // CRITICAL: Set isLoading to false IMMEDIATELY after setUser for successful login
            // This ensures ProtectedRoute sees the updated state synchronously
            setIsLoading(false);
            console.log(
              `[AuthContext][login][Diag] Login successful. User state and isLoading set. isLoading now false.`
            );
          } else {
            console.error(
              '[AuthContext][login][Diag] Login API response.ok, but data.success is false or no data.user. Data:',
              data
            );
            console.log(
              `[AuthContext][login][Diag] Before setUser(null) due to unsuccessful login data. Current user:`,
              JSON.stringify(user)
            );
            setUser(null);
            setIsLoading(false);
            console.log(
              `[AuthContext][login][Diag] After setUser(null) due to unsuccessful login data.`
            );
            throw new Error('Invalid credentials');
          }
        } else {
          // Handle 401 or other login errors
          let errorData;
          try {
            errorData = await response.json();
            console.log(
              `[AuthContext][login][Diag] Parsed error data from failed /api/auth/login:`,
              errorData
            );
          } catch (e) {
            errorData = {
              message: `Login failed with status ${response.status}. Could not parse error response.`,
            };
            console.log(
              `[AuthContext][login][Diag] Failed to parse error JSON from /api/auth/login. Status: ${response.status}`
            );
          }

          console.error(
            `[AuthContext][login][Diag] Login failure detected by frontend (response not ok). Status: ${response.status}, Error message: ${errorData.message}`
          );
          console.log(
            `[AuthContext][login][Diag] Before setUser(null) due to API login failure. Current user:`,
            JSON.stringify(user)
          );
          setUser(null);
          setIsLoading(false);
          // console.log(`[AuthContext][login][Diag] After setUser(null) due to API login failure. Current user:`, JSON.stringify(user)); // This log is not reliable for seeing updated state
          throw new Error(errorData.message || 'Login failed');
        }
      } catch (error) {
        console.error('[AuthContext][login][Diag] Catch block: Fetch Error during login:', error);
        console.log(
          `[AuthContext][login][Diag] Before setUser(null) due to catch block error. Current user:`,
          JSON.stringify(user)
        );
        setUser(null);
        setIsLoading(false);
        // console.log(`[AuthContext][login][Diag] After setUser(null) due to catch block error. Current user:`, JSON.stringify(user)); // Not reliable
        throw error;
      } finally {
        // isLoading is now managed inline for each success/failure path
        // This ensures state updates are batched correctly with setUser
        console.log(
          `[AuthContext][login][Diag] Login function finally block.`
        );
      }
    },
    // setUser and setIsLoading are stable functions from useState.
    // Removed user and isLoading from dependencies as they're only used for logging
    // and including them causes stale closure issues.
    []
  );

  // Function to handle logout
  const logout = useCallback(async () => {
    console.log('[AuthContext] logout: Attempting API logout...');

    // Dispatch logout event BEFORE clearing state so socket can disconnect
    console.log('[AuthContext] logout: Dispatching auth:logout event');
    window.dispatchEvent(new CustomEvent('auth:logout'));

    try {
      const apiUrl = getApiBaseUrl();
      console.log(`[AuthContext] logout: Using API URL: ${apiUrl}`);
      const response = await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'omit', // iOS WebKit requires omit for HTTP cross-origin
        mode: 'cors',
      });
      if (response.ok) {
        console.log('[AuthContext] logout: API logout successful.');
      } else {
        // Log failure but proceed with client-side logout regardless
        console.warn(
          `[AuthContext] logout: API logout failed (Status: ${response.status}). Proceeding with client-side logout anyway.`
        );
      }
    } catch (error) {
      // Log network error but proceed with client-side logout
      console.error('[AuthContext] logout: Fetch Error during logout API call:', error);
    }
    // Always clear client state regardless of API success/failure
    setUser(null);
    localStorage.removeItem('accessToken'); // Clear token from localStorage
    console.log('[AuthContext] logout: Client-side user state and localStorage cleared.');
    setIsLoading(false); // Ensure loading stops after logout attempt
  }, []);

  // Effect to check session on initial load
  useEffect(() => {
    console.log('[AuthContext] Initial load effect: Calling checkSession.');
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // API error handler (remains largely the same, uses logout)
  const handleApiError = useCallback(
    (error: unknown): boolean => {
      console.error('[AuthContext] handleApiError received:', error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err: any = error;
      const status =
        err?.response?.status ||
        err?.status ||
        parseInt(err?.message?.match(/\((\d{3})\)/)?.[1] || '0', 10);

      if (status === 401 || status === 403) {
        console.log(`[AuthContext] handleApiError: Detected ${status} error, calling logout.`);
        logout();
        return true; // Error handled
      }
      console.log('[AuthContext] handleApiError: Error not handled by this auth handler.');
      return false; // Error not handled
    },
    [logout]
  );

  // Provide context value
  const value = {
    user,
    // REMOVED: token,
    loading: isLoading,  // Alias for backwards compatibility
    isLoading,
    login,
    logout,
    checkSession,
    handleApiError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Ensure no other code (like provider logic) is in this file.
