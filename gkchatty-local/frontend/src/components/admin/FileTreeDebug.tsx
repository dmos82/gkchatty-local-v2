import React, { useEffect, useState } from 'react';
import useFileTreeStore from '@/stores/fileTreeStore';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export default function FileTreeDebug() {
  const { fileTree } = useFileTreeStore();
  const [rawApiData, setRawApiData] = useState<any>(null);
  
  useEffect(() => {
    // Make a direct API call to compare
    const fetchDirect = async () => {
      try {
        const response = await fetchWithAuth('/api/folders/tree', {
          method: 'GET'
        });
        const data = await response.json();
        setRawApiData(data);
        console.log('[FileTreeDebug] Direct API data:', data);
      } catch (error) {
        console.error('[FileTreeDebug] Error:', error);
      }
    };
    fetchDirect();
  }, []);
  
  return (
    <div className="p-4 bg-yellow-50 border-2 border-yellow-500 rounded">
      <h3 className="font-bold mb-2 text-red-600">Critical Debug Info</h3>
      
      <div className="mb-4">
        <strong>Zustand Store fileTree:</strong>
        <div className="bg-white p-2 rounded mt-1">
          <div>Length: {fileTree.length}</div>
          <div>Type: {typeof fileTree}</div>
          <div>Is Array: {String(Array.isArray(fileTree))}</div>
          {fileTree.length > 0 && (
            <div>
              First Item: {fileTree[0]?.name} ({fileTree[0]?.type})
              {fileTree[0]?.children && ` - ${fileTree[0].children.length} children`}
            </div>
          )}
        </div>
      </div>
      
      {rawApiData && (
        <div className="mb-4">
          <strong>Direct API Response:</strong>
          <div className="bg-white p-2 rounded mt-1">
            <div>Success: {String(rawApiData.success)}</div>
            <div>Tree Length: {rawApiData.tree?.length || 0}</div>
            <div>Tree Type: {typeof rawApiData.tree}</div>
            <div>Tree Is Array: {String(Array.isArray(rawApiData.tree))}</div>
            {rawApiData.tree?.length > 0 && (
              <div>
                API First Item: {rawApiData.tree[0]?.name} ({rawApiData.tree[0]?.type})
                {rawApiData.tree[0]?.children && ` - ${rawApiData.tree[0].children.length} children`}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="text-red-600 font-bold">
        MISMATCH: Store has {fileTree.length} items, API returned {rawApiData?.tree?.length || '?'} items
      </div>
      
      <details className="mt-4">
        <summary className="cursor-pointer text-sm">Full Store Data</summary>
        <pre className="text-xs overflow-auto bg-white p-2 mt-2">
          {JSON.stringify(fileTree, null, 2)}
        </pre>
      </details>
      
      <details className="mt-2">
        <summary className="cursor-pointer text-sm">Full API Data</summary>
        <pre className="text-xs overflow-auto bg-white p-2 mt-2">
          {JSON.stringify(rawApiData, null, 2)}
        </pre>
      </details>
    </div>
  );
}