import React, { useEffect, useState } from 'react';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

export default function DebugFileTree() {
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('[DebugFileTree] Fetching from:', `${API_BASE_URL}/api/folders/tree`);
        
        const response = await fetch(`${API_BASE_URL}/api/folders/tree`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get raw text first
        const rawText = await response.text();
        console.log('[DebugFileTree] Raw response length:', rawText.length, 'bytes');
        
        // Parse JSON
        const data = JSON.parse(rawText);
        console.log('[DebugFileTree] Parsed data:', data);
        console.log('[DebugFileTree] data.tree is array?:', Array.isArray(data.tree));
        console.log('[DebugFileTree] data.tree length:', data.tree?.length);
        
        if (data.tree) {
          console.log('[DebugFileTree] First 5 items:', data.tree.slice(0, 5));
          console.log('[DebugFileTree] All item names:', data.tree.map((item: any) => item.name));
        }
        
        setApiResponse(data);
      } catch (err: any) {
        console.error('[DebugFileTree] Error:', err);
        setError(err.message);
      }
    };
    
    fetchData();
  }, []);
  
  return (
    <div className="p-4 bg-gray-100 rounded">
      <h3 className="font-bold mb-2">Debug File Tree API Response</h3>
      {error && <div className="text-red-500 mb-2">Error: {error}</div>}
      {apiResponse && (
        <div>
          <div className="mb-2">
            <strong>Success:</strong> {String(apiResponse.success)}
          </div>
          <div className="mb-2">
            <strong>Tree Length:</strong> {apiResponse.tree?.length || 0}
          </div>
          <div className="mb-2">
            <strong>Items:</strong>
            <ul className="list-disc ml-4">
              {apiResponse.tree?.map((item: any, i: number) => (
                <li key={i}>
                  {item.name} ({item.type})
                  {item.children && item.children.length > 0 && ` - ${item.children.length} children`}
                </li>
              ))}
            </ul>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer">Full JSON</summary>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}