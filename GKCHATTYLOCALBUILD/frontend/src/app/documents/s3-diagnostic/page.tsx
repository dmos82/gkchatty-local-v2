'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

interface DiagnosticResult {
  test: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export default function S3DiagnosticPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const updateResult = (
    test: string,
    status: DiagnosticResult['status'],
    message: string,
    details?: Record<string, unknown>
  ) => {
    setResults(prev => {
      const existing = prev.find(r => r.test === test);
      if (existing) {
        return prev.map(r => (r.test === test ? { test, status, message, details } : r));
      }
      return [...prev, { test, status, message, details }];
    });
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);

    // Test 1: Basic S3 connectivity
    updateResult('S3 Connectivity', 'pending', 'Testing S3 service availability...');
    try {
      // Test S3 service availability instead of private bucket root
      const testUrl = 'https://s3.us-east-2.amazonaws.com/';
      const response = await fetch(testUrl, {
        method: 'HEAD',
        mode: 'cors',
      });
      updateResult(
        'S3 Connectivity',
        response.ok ? 'success' : 'error',
        `S3 service HEAD request: ${response.status} ${response.statusText}`,
        {
          headers: Object.fromEntries(response.headers.entries()),
          note: 'Testing S3 service availability, not bucket access',
        }
      );
    } catch (error) {
      updateResult(
        'S3 Connectivity',
        'error',
        `Failed to connect to S3 service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }

    // Test 2: OPTIONS preflight
    updateResult('CORS Preflight', 'pending', 'Testing CORS preflight request...');
    try {
      // Create a dummy pre-signed URL structure for testing
      const testUrl =
        'https://gkchatty-staging-docs.s3.us-east-2.amazonaws.com/test-file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256';
      const response = await fetch(testUrl, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
          Origin: window.location.origin,
        },
      });
      updateResult(
        'CORS Preflight',
        response.ok ? 'success' : 'error',
        `OPTIONS request: ${response.status} ${response.statusText}`,
        {
          headers: Object.fromEntries(response.headers.entries()),
          corsHeaders: {
            'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
            'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
            'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
          },
        }
      );
    } catch (error) {
      updateResult(
        'CORS Preflight',
        'error',
        `Preflight failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }

    // Test 3: Small file upload test
    updateResult('Test Upload', 'pending', 'Testing small file upload...');
    try {
      // First get a pre-signed URL from our backend
      const presignedResponse = await fetch(`${API_BASE_URL}/api/documents/get-presigned-url`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'diagnostic-test.txt',
          fileType: 'text/plain',
          fileSize: 100,
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error(`Failed to get pre-signed URL: ${presignedResponse.status}`);
      }

      const { presignedUrl } = await presignedResponse.json();

      // Try to upload a tiny test file
      const testContent = 'S3 diagnostic test file';
      const testFile = new Blob([testContent], { type: 'text/plain' });

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: testFile,
        headers: {
          'Content-Type': 'text/plain',
        },
        mode: 'cors',
        credentials: 'omit',
      });

      updateResult(
        'Test Upload',
        uploadResponse.ok ? 'success' : 'error',
        `PUT request: ${uploadResponse.status} ${uploadResponse.statusText}`,
        {
          headers: Object.fromEntries(uploadResponse.headers.entries()),
          responseText: !uploadResponse.ok ? await uploadResponse.text() : undefined,
        }
      );
    } catch (error) {
      updateResult(
        'Test Upload',
        'error',
        `Upload test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }

    // Test 4: Network information
    updateResult('Network Info', 'pending', 'Gathering network information...');
    try {
      const networkInfo: Record<string, unknown> = {
        online: navigator.onLine,
        userAgent: navigator.userAgent,
      };

      if ('connection' in navigator) {
        const conn = (navigator as Navigator).connection;
        networkInfo.connection = {
          effectiveType: conn?.effectiveType,
          downlink: conn?.downlink,
          rtt: conn?.rtt,
          saveData: conn?.saveData,
        };
      }

      updateResult('Network Info', 'success', 'Network information gathered', networkInfo);
    } catch (error) {
      updateResult(
        'Network Info',
        'error',
        `Failed to gather network info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }

    setIsRunning(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>S3 Upload Diagnostics</CardTitle>
          <CardDescription>Run diagnostics to identify S3 upload issues</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runDiagnostics} disabled={isRunning} className="mb-6">
            {isRunning ? 'Running Diagnostics...' : 'Run Diagnostics'}
          </Button>

          <div className="space-y-4">
            {results.map(result => (
              <Card
                key={result.test}
                className={
                  result.status === 'success'
                    ? 'border-green-500'
                    : result.status === 'error'
                      ? 'border-red-500'
                      : 'border-yellow-500'
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{result.test}</h3>
                    <span
                      className={`text-sm px-2 py-1 rounded ${
                        result.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : result.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {result.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-2">{result.message}</p>
                  {result.details && (
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
