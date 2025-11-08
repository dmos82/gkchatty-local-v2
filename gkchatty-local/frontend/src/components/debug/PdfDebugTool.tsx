'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';
import { UPLOAD_SUCCESS_DELAY_MS } from '@/config/constants';

interface TestResult {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  blobSize: number;
  blobType: string;
  error?: string;
  timestamp: string;
}

export function PdfDebugTool() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customDocId, setCustomDocId] = useState('68245f29d6ccfb7c5dfc09e6');

  const testEndpoint = async (documentId: string, endpoint: 'system' | 'user') => {
    setIsLoading(true);

    let url;
    if (endpoint === 'system') {
      url = `${API_BASE_URL}/api/system-kb/download/${documentId}`;
    } else {
      url = `${API_BASE_URL}/api/documents/view/${documentId}`;
    }

    console.log(`[PDF Debug] Testing URL: ${url}`);

    try {
      const response = await fetch(url, {
        credentials: 'include',
        method: 'GET',
        headers: {
          Accept: 'application/pdf,*/*',
        },
      });

      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let blobSize = 0;
      let blobType = '';
      let error = '';

      if (response.ok) {
        try {
          const blob = await response.blob();
          blobSize = blob.size;
          blobType = blob.type;
        } catch (blobError) {
          error = `Blob creation failed: ${blobError}`;
        }
      } else {
        const errorText = await response.text();
        error = errorText;
      }

      const result: TestResult = {
        url,
        status: response.status,
        ok: response.ok,
        headers,
        blobSize,
        blobType,
        error: response.ok ? error : `HTTP ${response.status}: ${error}`,
        timestamp: new Date().toISOString(),
      };

      setTestResults(prev => [result, ...prev]);
      console.log('[PDF Debug] Test result:', result);
    } catch (fetchError) {
      const result: TestResult = {
        url,
        status: 0,
        ok: false,
        headers: {},
        blobSize: 0,
        blobType: '',
        error: `Fetch failed: ${fetchError}`,
        timestamp: new Date().toISOString(),
      };

      setTestResults(prev => [result, ...prev]);
      console.error('[PDF Debug] Fetch error:', fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const testKnownDocuments = async () => {
    // Test the failing documents from the conversation summary
    const testCases = [
      { id: '68245f29d6ccfb7c5dfc09e6', name: 'ICBC - Renewal Checklist.pdf' },
      { id: '68245f2ad6ccfb7c5dfc0a0a', name: 'EPIC - Checklist.pdf' },
      { id: '68245f27d6ccfb7c5dfc09d8', name: 'GK - Personal Lines EPIC Workflow.pdf (working)' },
    ];

    for (const testCase of testCases) {
      console.log(`[PDF Debug] Testing ${testCase.name} (${testCase.id})`);
      await testEndpoint(testCase.id, 'system');
      // Add delay between tests
      await new Promise(resolve => setTimeout(resolve, UPLOAD_SUCCESS_DELAY_MS));
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>PDF API Debug Tool</CardTitle>
          <CardDescription>
            Test PDF API endpoints to diagnose frontend fetch issues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Document ID</label>
              <Input
                value={customDocId}
                onChange={e => setCustomDocId(e.target.value)}
                placeholder="Enter document ID to test"
              />
            </div>
            <Button
              onClick={() => testEndpoint(customDocId, 'system')}
              disabled={isLoading || !customDocId}
            >
              Test System KB
            </Button>
            <Button
              onClick={() => testEndpoint(customDocId, 'user')}
              disabled={isLoading || !customDocId}
              variant="outline"
            >
              Test User Docs
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={testKnownDocuments} disabled={isLoading} variant="default">
              Test Known Documents
            </Button>
            <Button
              onClick={clearResults}
              variant="destructive"
              disabled={testResults.length === 0}
            >
              Clear Results
            </Button>
          </div>

          {isLoading && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Testing endpoint...
              </div>
            </div>
          )}

          <div className="space-y-3">
            {testResults.map((result, index) => (
              <Card key={index} className={result.ok ? 'border-green-200' : 'border-red-200'}>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>URL:</strong> {result.url}
                    </div>
                    <div>
                      <strong>Status:</strong>
                      <span className={result.ok ? 'text-green-600' : 'text-red-600 font-semibold'}>
                        {result.status} {result.ok ? 'OK' : 'FAILED'}
                      </span>
                    </div>
                    <div>
                      <strong>Content-Type:</strong> {result.headers['content-type'] || 'N/A'}
                    </div>
                    <div>
                      <strong>Content-Length:</strong> {result.headers['content-length'] || 'N/A'}
                    </div>
                    <div>
                      <strong>Blob Size:</strong> {result.blobSize} bytes
                    </div>
                    <div>
                      <strong>Blob Type:</strong> {result.blobType || 'N/A'}
                    </div>
                    <div className="md:col-span-2">
                      <strong>Timestamp:</strong> {new Date(result.timestamp).toLocaleString()}
                    </div>
                    {result.error && (
                      <div className="md:col-span-2">
                        <strong>Error:</strong>
                        <pre className="text-red-600 text-xs mt-1 whitespace-pre-wrap bg-red-50 p-2 rounded">
                          {result.error}
                        </pre>
                      </div>
                    )}
                    {Object.keys(result.headers).length > 0 && (
                      <div className="md:col-span-2">
                        <strong>All Headers:</strong>
                        <pre className="text-xs mt-1 bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.headers, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {testResults.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No test results yet. Run a test to see results here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
