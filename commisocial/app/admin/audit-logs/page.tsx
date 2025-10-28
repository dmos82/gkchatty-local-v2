import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type AuditLog = {
  id: string
  timestamp: string
  admin_id: string | null
  action: string
  target_user_id: string | null
  old_value: any
  new_value: any
  ip_address: string | null
  user_agent: string | null
  admin?: { username: string }
  target_user?: { username: string }
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; admin?: string; page?: string }>
}) {
  const supabase = await createClient()

  // Parse search params (Next.js 15 async searchParams)
  const params = await searchParams
  const actionFilter = params.action || 'all'
  const adminFilter = params.admin || 'all'
  const page = parseInt(params.page || '1')
  const limit = 50
  const offset = (page - 1) * limit

  // Build query
  let logsQuery = supabase
    .from('audit_logs')
    .select(`
      *,
      admin:profiles!audit_logs_admin_id_fkey(username),
      target_user:profiles!audit_logs_target_user_id_fkey(username)
    `, { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  // Apply filters
  if (actionFilter && actionFilter !== 'all') {
    logsQuery = logsQuery.eq('action', actionFilter)
  }

  if (adminFilter && adminFilter !== 'all') {
    logsQuery = logsQuery.eq('admin_id', adminFilter)
  }

  const { data: logs, error, count } = await logsQuery

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading audit logs: {error.message}</p>
        </div>
      </div>
    )
  }

  const totalPages = count ? Math.ceil(count / limit) : 1

  // Get unique actions for filter
  const actions = [
    'user_created',
    'user_updated',
    'password_reset',
    'role_changed',
    'user_deleted',
    'user_restored',
    'permanent_delete',
    'mfa_enabled',
    'mfa_disabled',
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Track all administrative actions and user changes
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div>
          <label htmlFor="action-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Action Type
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => {
              const url = new URL(window.location.href)
              url.searchParams.set('action', e.target.value)
              url.searchParams.set('page', '1')
              window.location.href = url.toString()
            }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="all">All Actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-700">
          Showing <span className="font-medium">{logs?.length || 0}</span> of{' '}
          <span className="font-medium">{count || 0}</span> audit logs
        </p>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs && logs.length > 0 ? (
              logs.map((log: AuditLog) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.admin?.username || 'System'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.action.includes('delete')
                          ? 'bg-red-100 text-red-800'
                          : log.action.includes('created') || log.action.includes('restored')
                          ? 'bg-green-100 text-green-800'
                          : log.action.includes('role')
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {log.action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.target_user?.username ? (
                      <Link
                        href={`/admin/users/${log.target_user_id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {log.target_user.username}
                      </Link>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {log.action === 'role_changed' && log.old_value && log.new_value && (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs rounded bg-gray-100">
                          {log.old_value.role}
                        </span>
                        <span>→</span>
                        <span className="px-2 py-1 text-xs rounded bg-blue-100">
                          {log.new_value.role}
                        </span>
                      </div>
                    )}
                    {log.action === 'user_updated' && log.old_value && log.new_value && (
                      <div className="text-xs">
                        {Object.keys(log.new_value)
                          .filter(
                            (key) =>
                              log.old_value[key] !== log.new_value[key] &&
                              key !== 'updated_at'
                          )
                          .map((key) => (
                            <div key={key}>
                              <span className="font-medium">{key}:</span> {log.old_value[key]} →{' '}
                              {log.new_value[key]}
                            </div>
                          ))}
                      </div>
                    )}
                    {log.action === 'password_reset' && (
                      <span className="text-xs text-gray-500">Password was reset</span>
                    )}
                    {(log.action === 'user_deleted' || log.action === 'user_restored') && (
                      <span className="text-xs text-gray-500">
                        {log.action === 'user_deleted' ? 'Soft deleted' : 'Restored from deletion'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                  No audit logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <div>
            <p className="text-sm text-gray-700">
              Page <span className="font-medium">{page}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </p>
          </div>
          <div>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
              {page > 1 ? (
                <Link
                  href={`/admin/audit-logs?action=${actionFilter}&admin=${adminFilter}&page=${
                    page - 1
                  }`}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
              ) : (
                <span className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={`/admin/audit-logs?action=${actionFilter}&admin=${adminFilter}&page=${
                    page + 1
                  }`}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
              ) : (
                <span className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
