'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/config';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export default function DebugMobilePage() {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [testResults, setTestResults] = useState<any>(null);

  useEffect(() => {
    // Collect diagnostic information
    const token = localStorage.getItem('accessToken');
    const apiUrl = getApiBaseUrl();

    setDiagnostics({
      hasToken: !!token,
      tokenPrefix: token ? token.substring(0, 20) + '...' : 'NONE',
      apiUrl,
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
    });
  }, []);

  const testAuth = async () => {
    try {
      console.log('[DebugMobile] Testing auth with /api/users/me/settings');
      const response = await fetchWithAuth('/api/users/me/settings', {
        method: 'GET',
      });

      const result = {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      };

      if (response.ok) {
        const data = await response.json();
        setTestResults({ ...result, data, error: null });
      } else {
        const errorText = await response.text();
        setTestResults({ ...result, data: null, error: errorText });
      }
    } catch (error: any) {
      setTestResults({
        status: 'ERROR',
        error: error.message,
        stack: error.stack,
      });
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Mobile Auth Diagnostic</h1>

      <div className="space-y-4">
        <div className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Environment</h2>
          {diagnostics && (
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>

        <button
          onClick={testAuth}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Test Auth API Call
        </button>

        {testResults && (
          <div className="border p-4 rounded">
            <h2 className="font-semibold mb-2">Test Results</h2>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(testResults, null, 2)}
            </pre>
          </div>
        )}

        <div className="border p-4 rounded bg-yellow-50">
          <h2 className="font-semibold mb-2">Instructions</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Check if "hasToken" is true</li>
            <li>If false, go to /auth and log in</li>
            <li>Come back here and click "Test Auth API Call"</li>
            <li>Check if status is 200</li>
            <li>If 401, check browser console for [fetchWithAuth] logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
