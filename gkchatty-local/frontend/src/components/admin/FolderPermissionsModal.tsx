import React, { useState, useEffect } from 'react';
import { X, Users, ShieldCheck, UserCheck } from 'lucide-react';
import UserPicker from './UserPicker';

interface FolderPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
  isSystemFolder?: boolean;
  currentPermissions?: {
    type: 'all' | 'admin' | 'specific-users';
    allowedUsers?: string[];
  };
  onSave: (folderId: string, permissionType: string, allowedUsers?: string[]) => Promise<void>;
}

const FolderPermissionsModal: React.FC<FolderPermissionsModalProps> = ({
  isOpen,
  onClose,
  folderId,
  folderName,
  isSystemFolder = false,
  currentPermissions = { type: 'all' },
  onSave,
}) => {
  const [permissionType, setPermissionType] = useState<'all' | 'admin' | 'specific-users'>(
    currentPermissions.type
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    currentPermissions.allowedUsers || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only sync state when modal opens (reset form for each folder)
    if (isOpen) {
      console.log('[FolderPermissionsModal] Modal opened with currentPermissions:', currentPermissions);
      console.log('[FolderPermissionsModal] allowedUsers:', currentPermissions.allowedUsers);
      setPermissionType(currentPermissions.type);
      setSelectedUsers(currentPermissions.allowedUsers || []);
    }
  }, [isOpen, folderId]);

  useEffect(() => {
    console.log('[FolderPermissionsModal] Permission type changed:', permissionType);
    console.log('[FolderPermissionsModal] Should show UserPicker:', permissionType === 'specific-users');
  }, [permissionType]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (permissionType === 'specific-users' && selectedUsers.length === 0) {
      setError('Please select at least one user');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(
        folderId,
        permissionType,
        permissionType === 'specific-users' ? selectedUsers : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-25" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Folder Permissions</h3>
              <p className="text-sm text-gray-500 mt-1">
                {isSystemFolder ? 'System Folder: ' : 'Folder: '}
                {folderName}
              </p>
              {currentPermissions.type === 'admin' && (
                <p className="text-xs text-blue-600 mt-1">
                  Current: Admin access only
                </p>
              )}
              {currentPermissions.type === 'all' && (
                <p className="text-xs text-green-600 mt-1">
                  Current: All users have access
                </p>
              )}
              {currentPermissions.type === 'specific-users' && (
                <p className="text-xs text-amber-600 mt-1">
                  Current: {currentPermissions.allowedUsers?.length || 0} user(s) have access
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Info Box */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>How it works:</strong> All users can see all folders and files.
              Permissions control who can <strong>open/download</strong> documents.
            </p>
          </div>

          {/* Permission Types */}
          <div className="space-y-3 mb-6">
            {/* All Users Option */}
            <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="permission"
                value="all"
                checked={permissionType === 'all'}
                onChange={() => setPermissionType('all')}
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-gray-600" />
                  <span className="font-medium text-gray-900">All Users</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Everyone can access this folder and its contents
                </p>
              </div>
            </label>

            {/* Admin Only Option */}
            <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="permission"
                value="admin"
                checked={permissionType === 'admin'}
                onChange={() => setPermissionType('admin')}
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Admin Only</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Only administrators can access this folder
                </p>
              </div>
            </label>

            {/* Specific Users Option */}
            <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="permission"
                value="specific-users"
                checked={permissionType === 'specific-users'}
                onChange={() => setPermissionType('specific-users')}
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Specific Users</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Only selected users can access this folder
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Note: Users with "Has Permission" badge already have access
                </p>
              </div>
            </label>
          </div>

          {/* User Picker (shown when specific-users is selected) */}
          {permissionType === 'specific-users' && (
            <div className="mb-6">
              <UserPicker
                selectedUsers={selectedUsers}
                onSelectionChange={setSelectedUsers}
                initialUsers={currentPermissions.allowedUsers || []}
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderPermissionsModal;