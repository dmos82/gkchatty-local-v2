'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  generateTemporaryPassword,
  changeUserRole,
  softDeleteUser,
  restoreUser,
} from '@/app/admin/actions'

type User = {
  id: string
  username: string
  role: string
  deleted_at: string | null
}

export function UserActions({
  user,
  isSuperAdmin,
}: {
  user: User
  isSuperAdmin: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.role)

  const handleGeneratePassword = () => {
    startTransition(async () => {
      setError(null)
      const result = await generateTemporaryPassword(user.id)
      if (result.success && result.temporaryPassword) {
        setTempPassword(result.temporaryPassword)
      } else {
        setError(result.error || 'Failed to generate password')
      }
    })
  }

  const handleChangeRole = () => {
    startTransition(async () => {
      setError(null)
      const result = await changeUserRole({
        userId: user.id,
        newRole: selectedRole as 'user' | 'admin' | 'super_admin',
      })
      if (result.success) {
        setShowRoleDialog(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to change role')
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      setError(null)
      const result = await softDeleteUser({ userId: user.id })
      if (result.success) {
        setShowDeleteDialog(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to delete user')
      }
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      setError(null)
      const result = await restoreUser({ userId: user.id })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || 'Failed to restore user')
      }
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <h3 className="text-lg font-medium text-gray-900">Admin Actions</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Password Reset */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Reset Password</h4>
        <button
          onClick={handleGeneratePassword}
          disabled={isPending}
          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
        >
          {isPending ? 'Generating...' : 'Generate Temporary Password'}
        </button>
        {tempPassword && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900">Temporary Password:</p>
            <code className="block mt-1 text-sm bg-white p-2 rounded border border-yellow-300 font-mono">
              {tempPassword}
            </code>
            <p className="text-xs text-yellow-700 mt-2">
              Share this with the user securely. They should change it on next login.
            </p>
          </div>
        )}
      </div>

      {/* Change Role (Super Admin Only) */}
      {isSuperAdmin && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Change Role</h4>
          <button
            onClick={() => setShowRoleDialog(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Change Role
          </button>

          {showRoleDialog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h3 className="text-lg font-medium mb-4">Change User Role</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="user"
                      checked={selectedRole === 'user'}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="mr-2"
                    />
                    User (standard access)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="admin"
                      checked={selectedRole === 'admin'}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="mr-2"
                    />
                    Admin (user management)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="super_admin"
                      checked={selectedRole === 'super_admin'}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="mr-2"
                    />
                    Super Admin (full access)
                  </label>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleChangeRole}
                    disabled={isPending || selectedRole === user.role}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isPending ? 'Changing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => {
                      setShowRoleDialog(false)
                      setSelectedRole(user.role)
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete/Restore User */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">User Status</h4>
        {user.deleted_at ? (
          <button
            onClick={handleRestore}
            disabled={isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? 'Restoring...' : 'Restore User'}
          </button>
        ) : (
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Delete User
          </button>
        )}

        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-medium mb-4">Delete User</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete <strong>{user.username}</strong>? This is a soft delete and can be reversed within 30 days.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
