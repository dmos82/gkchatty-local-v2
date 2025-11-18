import React, { useState, useEffect } from 'react';
import { Check, X, Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

interface User {
  _id: string;
  username: string;
  email?: string;
  role: string;
}

interface UserPickerProps {
  selectedUsers: string[];
  onSelectionChange: (userIds: string[]) => void;
  initialUsers?: string[]; // Users who already have permissions (to show as "Current")
}

const UserPicker: React.FC<UserPickerProps> = ({ selectedUsers, onSelectionChange, initialUsers = [] }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log('[UserPicker] Component mounted/rendered');
  console.log('[UserPicker] Initial users with permissions:', initialUsers);

  useEffect(() => {
    console.log('[UserPicker] useEffect triggered, calling fetchUsers');
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[UserPicker] Fetching users...');

      const response = await fetchWithAuth('/api/admin/users', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[UserPicker] Failed to fetch users:', response.status, errorText);
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data = await response.json();
      console.log('[UserPicker] Users fetched:', data.users?.length || 0);
      setUsers(data.users || []);
    } catch (err) {
      console.error('[UserPicker] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(query) ||
      (user.email && user.email.toLowerCase().includes(query))
    );
  });

  const toggleUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onSelectionChange(selectedUsers.filter((id) => id !== userId));
    } else {
      onSelectionChange([...selectedUsers, userId]);
    }
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto"></div>
        <p className="mt-2 text-sm">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
        <p>Error: {error}</p>
        <button
          onClick={fetchUsers}
          className="mt-2 text-red-800 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Search Bar */}
      <div className="p-3 border-b bg-gray-50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {selectedUsers.length > 0 && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedUsers.length} user{selectedUsers.length !== 1 && 's'} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* User List */}
      <div className="max-h-64 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {searchQuery ? 'No users found matching your search' : 'No users available'}
          </div>
        ) : (
          <div className="divide-y">
            {filteredUsers.map((user) => {
              const isSelected = selectedUsers.includes(user._id);
              const hasCurrentPermission = initialUsers.includes(user._id);
              return (
                <label
                  key={user._id}
                  className={`flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleUser(user._id)}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{user.username}</span>
                      {user.role === 'admin' && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                      {hasCurrentPermission && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Has Permission
                        </span>
                      )}
                    </div>
                    {user.email && (
                      <span className="text-sm text-gray-500">{user.email}</span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="h-5 w-5 text-blue-600" />
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserPicker;