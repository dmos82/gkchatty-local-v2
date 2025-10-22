// apps/web/src/lib/config.ts

// Client-side URL (from build args via Next.js env var mechanism)
const API_BASE_URL_CLIENT_FROM_ENV =
  process.env.NEXT_PUBLIC_API_BASE_URL_TEMP_DEBUG || process.env.NEXT_PUBLIC_API_BASE_URL;
// Server-side internal URL (from docker-compose environment)
const API_INTERNAL_URL_FROM_ENV = process.env.API_INTERNAL_URL;

// --- Client URL Validation & Resolution ---
// Resolve client URL without mutating process.env (mutation breaks SSR bundle)
let resolvedClientUrl: string | undefined = API_BASE_URL_CLIENT_FROM_ENV;

if (process.env.NODE_ENV === 'production') {
  // In production, env var MUST be provided
  if (!resolvedClientUrl) {
    console.warn(
      'WARNING: NEXT_PUBLIC_API_BASE_URL environment variable is not set in production. Defaulting to /api. This may require Netlify proxy or runtime environment variable.'
    );
    resolvedClientUrl = '/api'; // Return a default value gracefully
  }
} else {
  // ---------- DEVELOPMENT / LOCAL ----------
  // Fallback when env var is missing
  if (!resolvedClientUrl) {
    console.warn(
      'WARNING: NEXT_PUBLIC_API_BASE_URL is not set. Falling back to http://localhost:3001 for local client development.'
    );
    resolvedClientUrl = 'http://localhost:3001';
  }

  // If the URL points to localhost with https, downgrade to http to match local API server
  if (resolvedClientUrl.startsWith('https://localhost')) {
    console.warn(
      `[CONFIG] Detected HTTPS localhost URL (${resolvedClientUrl}). Switching to HTTP to avoid protocol mismatch.`
    );
    resolvedClientUrl = resolvedClientUrl.replace('https://', 'http://');
  }
}

// Ensure no trailing slash for consistency
export const API_BASE_URL_CLIENT = resolvedClientUrl.replace(/\/$/, '');
console.log(`[Config] Client API Base URL (Resolved): ${API_BASE_URL_CLIENT}`);

// --- Server URL Validation & Resolution ---
// Server-side internal URL (from docker-compose environment or Netlify Functions)
let resolvedInternalUrl: string; // Use a non-optional type since it will always resolve

if (typeof window === 'undefined') {
  // Server-side code
  if (process.env.NODE_ENV === 'production') {
    // In production, if API_INTERNAL_URL is not set for server-side (e.g., during build/prerender on Netlify)
    // it should fall back to the client API base URL, which Netlify will proxy.
    resolvedInternalUrl = API_INTERNAL_URL_FROM_ENV || API_BASE_URL_CLIENT;
    if (!API_INTERNAL_URL_FROM_ENV) {
      console.warn(
        'WARNING: API_INTERNAL_URL environment variable is not set for server-side use in production. Defaulting to client API URL, assuming Netlify proxy handles it.'
      );
    }
  } else {
    // Development environment (local dev or CI local testing)
    resolvedInternalUrl = API_INTERNAL_URL_FROM_ENV || 'http://localhost:3001';
    if (!API_INTERNAL_URL_FROM_ENV) {
      console.warn(
        'WARNING: API_INTERNAL_URL is not set. Falling back to http://localhost:3001 for local server development.'
      );
    }
  }
} else {
  // Client-side code (should not use API_INTERNAL_URL)
  resolvedInternalUrl = API_BASE_URL_CLIENT;
}

// Ensure no trailing slash for consistency
export const API_BASE_URL_SERVER = resolvedInternalUrl.replace(/\/$/, '');

console.log(`[Config] Server API Base URL (resolved): ${API_BASE_URL_SERVER}`);

// --- Deprecated Single Export (Keep for backward compatibility temporarily if needed, then remove) ---
// export const API_BASE_URL = API_BASE_URL_CLIENT;
// console.log(`[Config] Using API Base URL (Client): ${API_BASE_URL}`); // Keep original log for now

// Example usage:
// Client: `${API_BASE_URL_CLIENT}/api/users`
// Server: `${API_BASE_URL_SERVER}/api/users`
