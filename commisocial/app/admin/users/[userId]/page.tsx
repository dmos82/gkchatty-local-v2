import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { UserEditForm } from '@/components/admin/UserEditForm'
import { UserActions } from '@/components/admin/UserActions'
import { format } from 'date-fns'
import Link from 'next/link'

export default async function UserDetailPage({
  params,
}: {
  params: { userId: string }
}) {
  const supabase = await createClient()

  // Get current admin user
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) redirect('/login')

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single()

  // Get target user
  const { data: user, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.userId)
    .single()

  if (error || !user) {
    notFound()
  }

  // Get recent audit logs for this user
  const { data: recentLogs } = await supabase
    .from('audit_logs')
    .select(`
      *,
      admin:profiles!admin_id(username)
    `)
    .eq('target_user_id', user.id)
    .order('timestamp', { ascending: false })
    .limit(10)

  const isOwnProfile = currentUser.id === user.id
  const isSuperAdmin = currentProfile?.role === 'super_admin'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{user.username}</h2>
            <p className="mt-1 text-sm text-gray-500">
              User ID: {user.id}
            </p>
          </div>
          {user.deleted_at && (
            <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm font-medium">
              Deleted
            </span>
          )}
          {isOwnProfile && (
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
              Your Account
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h3>
            {isOwnProfile ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  You cannot edit your own profile via the admin panel. Please use your account settings.
                </p>
              </div>
            ) : (
              <UserEditForm user={user} />
            )}
          </div>

          {/* Actions */}
          {!isOwnProfile && (
            <UserActions
              user={user}
              isSuperAdmin={isSuperAdmin}
            />
          )}
        </div>

        {/* Sidebar - User Info & Recent Activity */}
        <div className="space-y-6">
          {/* User Stats */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">User Details</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Role</dt>
                <dd className="mt-1">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      user.role === 'super_admin'
                        ? 'bg-purple-100 text-purple-800'
                        : user.role === 'admin'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {user.role}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {user.deleted_at ? (
                    <span className="text-red-600">Deleted on {format(new Date(user.deleted_at), 'MMM d, yyyy')}</span>
                  ) : (
                    <span className="text-green-600">Active</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">MFA Enabled</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {user.mfa_enabled ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Joined</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {format(new Date(user.created_at), 'MMM d, yyyy')}
                </dd>
              </div>
              {user.last_login && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Login</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {format(new Date(user.last_login), 'MMM d, yyyy HH:mm')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            {recentLogs && recentLogs.length > 0 ? (
              <div className="space-y-3">
                {recentLogs.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-3">
                    <div className="font-medium text-gray-900">{log.action.replace(/_/g, ' ')}</div>
                    <div className="text-gray-500 text-xs">
                      by {log.admin?.username || 'System'} • {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                    </div>
                  </div>
                ))}
                <Link
                  href={`/admin/audit-logs?targetUserId=${user.id}`}
                  className="text-sm text-blue-600 hover:text-blue-700 block mt-3"
                >
                  View all activity →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
