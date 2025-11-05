'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

export function CookieTest() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const testCookie = async () => {
    setLoading(true);
    setResult('');

    try {
      const apiUrl = `${API_BASE_URL}/api/auth/ping`;
      console.log(`[CookieTest] Testing cookie with: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include', // Important for cookies
      });

      const data = await response.json();
      console.log('[CookieTest] Response:', data);
      console.log('[CookieTest] Response headers:', [...response.headers.entries()]);
      console.log('[CookieTest] Document cookies:', document.cookie);

      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CookieTest] Error:', error);
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Cookie Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={testCookie} disabled={loading} className="w-full">
          {loading ? 'Testing...' : 'Test Cookie'}
        </Button>

        {result && (
          <div className="mt-4 p-4 bg-muted rounded-md">
            <pre className="whitespace-pre-wrap text-sm">{result}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CookieTest;
