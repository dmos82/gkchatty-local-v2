'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

interface SearchResult {
  _id: string;
  originalFileName: string;
  uploadTimestamp: string;
  sourceType: 'user' | 'system';
  score?: number; // Optional score from text search
}

const FilenameSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { user, logout, handleApiError } = useAuth();

  const handleSearch = useCallback(async () => {
    if (!user) {
      setError('You must be logged in to search.');
      return;
    }

    if (!searchQuery.trim()) {
      setError('Please enter a search term.');
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const encodedQuery = encodeURIComponent(searchQuery.trim());
      const response = await fetch(`${API_BASE_URL}/api/search/filename?q=${encodedQuery}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 401) {
        setError('Authentication failed. Please log in again.');
        logout();
        return;
      }

      if (!response.ok) {
        let errorMessage = `Search failed with status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // Ignore if response body isn't JSON or is empty
        }
        if (handleApiError) {
          handleApiError(response);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) {
          setError('No documents found matching your query.');
        }
      } else {
        throw new Error(data.message || 'Invalid response format from server.');
      }
    } catch (err) {
      console.error('Filename search error:', err);
      const handled = handleApiError ? handleApiError(err) : false;
      if (!handled) {
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred during search.'
        );
      }
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, user, logout, handleApiError]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    if (error) {
      setError(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSearch();
  };

  const getDocumentUrl = (doc: SearchResult): string => {
    if (doc.sourceType === 'system') {
      return `${API_BASE_URL}/api/system-kb/download/${doc._id}`;
    } else {
      return `${API_BASE_URL}/api/documents/user/${doc._id}`;
    }
  };

  const handleResultClick = (doc: SearchResult) => {
    console.log(`Clicked on result: ${doc.originalFileName} (${doc.sourceType}), would fetch/navigate to docId: ${doc._id}`);
  };

  const getDocumentTypeLabel = (sourceType: 'user' | 'system'): string => {
    return sourceType === 'system' ? 'System KB' : 'My Documents';
  };

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-3 text-gray-900">Search Documents by Filename</h2>
      <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={handleInputChange}
          placeholder="Search filenames..."
          className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          aria-label="Search filenames"
        />
        <button
          type="submit"
          disabled={isLoading || !searchQuery.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="text-red-600 mb-3" role="alert">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-medium mb-2 text-gray-900">Results:</h3>
          <ul className="list-disc pl-5 space-y-2">
            {results.map(doc => (
              <li key={doc._id} className="text-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <a
                      href={getDocumentUrl(doc)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 underline"
                      onClick={() => handleResultClick(doc)}
                    >
                      {doc.originalFileName}
                    </a>
                    <span className={`ml-2 text-xs px-2 py-1 rounded-full font-medium ${
                      doc.sourceType === 'system' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {getDocumentTypeLabel(doc.sourceType)}
                    </span>
                  </div>
                  {doc.score && (
                    <span className="text-xs text-gray-500 ml-2">
                      Score: {doc.score.toFixed(2)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FilenameSearch;
