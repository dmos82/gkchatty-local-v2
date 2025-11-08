'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/config';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export default function MobileTestPage() {
  const [env, setEnv] = useState<any>(null);
  const [connectivityTest, setConnectivityTest] = useState<any>(null);
  const [authTest, setAuthTest] = useState<any>(null);
  const [loadingConnectivity, setLoadingConnectivity] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);

  useEffect(() => {
    // Collect environment information
    const token = localStorage.getItem('accessToken');
    const apiUrl = getApiBaseUrl();

    setEnv({
      hasToken: !!token,
      tokenPrefix: token ? token.substring(0, 30) + '...' : 'NONE',
      tokenLength: token ? token.length : 0,
      apiUrl,
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      currentUrl: window.location.href,
    });
  }, []);

  const testConnectivity = async () => {
    setLoadingConnectivity(true);
    setConnectivityTest(null);

    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/api/mobile-test`;

      console.log('[MobileTest] Testing connectivity to:', url);

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      console.log('[MobileTest] Response status:', response.status);

      const result = {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      };

      if (response.ok) {
        const data = await response.json();
        console.log('[MobileTest] Response data:', data);
        setConnectivityTest({
          ...result,
          data,
          error: null,
          success: true
        });
      } else {
        const errorText = await response.text();
        console.log('[MobileTest] Error response:', errorText);
        setConnectivityTest({
          ...result,
          data: null,
          error: errorText,
          success: false
        });
      }
    } catch (error: any) {
      console.error('[MobileTest] Connectivity test failed:', error);
      setConnectivityTest({
        status: 'ERROR',
        error: error.message,
        stack: error.stack,
        success: false,
      });
    } finally {
      setLoadingConnectivity(false);
    }
  };

  const testAuth = async () => {
    setLoadingAuth(true);
    setAuthTest(null);

    try {
      console.log('[MobileTest] Testing authenticated endpoint with fetchWithAuth');

      const response = await fetchWithAuth('/api/users/me/settings', {
        method: 'GET',
      });

      console.log('[MobileTest] Auth response status:', response.status);

      const result = {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      };

      if (response.ok) {
        const data = await response.json();
        console.log('[MobileTest] Auth response data:', data);
        setAuthTest({
          ...result,
          data,
          error: null,
          success: true
        });
      } else {
        const errorText = await response.text();
        console.log('[MobileTest] Auth error response:', errorText);
        setAuthTest({
          ...result,
          data: null,
          error: errorText,
          success: false
        });
      }
    } catch (error: any) {
      console.error('[MobileTest] Auth test failed:', error);
      setAuthTest({
        status: 'ERROR',
        error: error.message,
        stack: error.stack,
        success: false,
      });
    } finally {
      setLoadingAuth(false);
    }
  };

  const clearToken = () => {
    localStorage.removeItem('accessToken');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold mb-2">Mobile Connectivity Test</h1>
          <p className="text-gray-600 mb-4">
            This page helps diagnose mobile authentication and connectivity issues.
          </p>
        </div>

        {/* Environment Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Environment Info</h2>
          {env && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-medium">Current URL:</div>
                <div className="font-mono text-xs break-all">{env.currentUrl}</div>

                <div className="font-medium">API URL:</div>
                <div className="font-mono text-xs break-all">{env.apiUrl}</div>

                <div className="font-medium">Hostname:</div>
                <div className="font-mono text-xs">{env.hostname}</div>

                <div className="font-medium">Has Token:</div>
                <div className={env.hasToken ? 'text-green-600' : 'text-red-600'}>
                  {env.hasToken ? '✅ YES' : '❌ NO'}
                </div>

                {env.hasToken && (
                  <>
                    <div className="font-medium">Token Preview:</div>
                    <div className="font-mono text-xs break-all">{env.tokenPrefix}</div>

                    <div className="font-medium">Token Length:</div>
                    <div className="font-mono text-xs">{env.tokenLength} chars</div>
                  </>
                )}

                <div className="font-medium">Platform:</div>
                <div className="font-mono text-xs">{env.platform}</div>

                <div className="font-medium">User Agent:</div>
                <div className="font-mono text-xs break-all">{env.userAgent}</div>
              </div>

              {env.hasToken && (
                <button
                  onClick={clearToken}
                  className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 text-sm"
                >
                  Clear Token & Reload
                </button>
              )}
            </div>
          )}
        </div>

        {/* Test 1: Connectivity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test 1: Backend Connectivity (No Auth)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Tests if your device can reach the backend server at all.
          </p>

          <button
            onClick={testConnectivity}
            disabled={loadingConnectivity}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loadingConnectivity ? 'Testing...' : 'Run Connectivity Test'}
          </button>

          {connectivityTest && (
            <div className="mt-4">
              <div className={`p-4 rounded ${connectivityTest.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <h3 className="font-semibold mb-2">
                  {connectivityTest.success ? '✅ SUCCESS - Backend is reachable!' : '❌ FAILED - Cannot reach backend'}
                </h3>
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
{JSON.stringify(connectivityTest, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Test 2: Authentication */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test 2: Authenticated Request</h2>
          <p className="text-sm text-gray-600 mb-4">
            Tests if authentication headers are being sent correctly. Requires you to be logged in.
          </p>

          <button
            onClick={testAuth}
            disabled={loadingAuth || !env?.hasToken}
            className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loadingAuth ? 'Testing...' : 'Run Auth Test'}
          </button>

          {!env?.hasToken && (
            <p className="mt-2 text-sm text-amber-600">
              ⚠️ No token found. Please log in first at <a href="/auth" className="underline">/auth</a>
            </p>
          )}

          {authTest && (
            <div className="mt-4">
              <div className={`p-4 rounded ${authTest.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <h3 className="font-semibold mb-2">
                  {authTest.success ? '✅ SUCCESS - Authentication works!' : '❌ FAILED - Authentication failed'}
                </h3>
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
{JSON.stringify(authTest, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Testing Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li><strong>First</strong>: Run "Test 1: Backend Connectivity"
              <ul className="list-disc list-inside ml-6 mt-1 text-gray-600">
                <li>If this FAILS → Your device cannot reach the backend (network issue)</li>
                <li>If this SUCCEEDS → Backend is reachable, proceed to Test 2</li>
              </ul>
            </li>
            <li><strong>Second</strong>: Make sure you're logged in
              <ul className="list-disc list-inside ml-6 mt-1 text-gray-600">
                <li>Check "Has Token" is ✅ YES above</li>
                <li>If NO → Go to <a href="/auth" className="underline text-blue-600">/auth</a> and log in</li>
              </ul>
            </li>
            <li><strong>Third</strong>: Run "Test 2: Authenticated Request"
              <ul className="list-disc list-inside ml-6 mt-1 text-gray-600">
                <li>If this FAILS → Authentication headers are not working</li>
                <li>If this SUCCEEDS → Everything is working correctly</li>
              </ul>
            </li>
            <li><strong>Check browser console</strong> for detailed logs with [MobileTest] and [fetchWithAuth] tags</li>
          </ol>
        </div>

        {/* Expected Results */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Expected Results</h2>
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-semibold mb-1">Test 1 Success Response:</h3>
              <pre className="text-xs bg-white p-2 rounded border">
{`{
  "success": true,
  "origin": "http://192.168.x.x:4003",
  "ip": "::ffff:192.168.x.x",
  "message": "Mobile connectivity test successful"
}`}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-1">Test 2 Success Response:</h3>
              <pre className="text-xs bg-white p-2 rounded border">
{`{
  "status": 200,
  "ok": true,
  "data": {
    "enableDarkMode": false,
    "defaultKnowledgeBaseId": null,
    ...
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
