import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { UserSearch } from '@/components/admin/UserSearch'
import { UserTable } from '@/components/admin/UserTable'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; role?: string; status?: string; page?: string }>
}) {
  const supabase = await createClient()

  // Parse search params (Next.js 15 async searchParams)
  const params = await searchParams
  const query = params.query || ''
  const roleFilter = params.role || 'all'
  const statusFilter = params.status || 'active'
  const page = parseInt(params.page || '1')
  const limit = 50
  const offset = (page - 1) * limit

  // Build query
  let usersQuery = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Apply filters
  if (query) {
    usersQuery = usersQuery.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
  }

  if (roleFilter && roleFilter !== 'all') {
    usersQuery = usersQuery.eq('role', roleFilter)
  }

  if (statusFilter === 'active') {
    usersQuery = usersQuery.is('deleted_at', null)
  } else if (statusFilter === 'deleted') {
    usersQuery = usersQuery.not('deleted_at', 'is', null)
  }

  const { data: users, error, count } = await usersQuery

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading users: {error.message}</p>
        </div>
      </div>
    )
  }

  const totalPages = count ? Math.ceil(count / limit) : 1

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage user accounts, roles, and permissions
        </p>
      </div>

      {/* Search and Filters */}
      <UserSearch
        defaultQuery={query}
        defaultRole={roleFilter}
        defaultStatus={statusFilter}
      />

      {/* Results Summary */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-700">
          Showing <span className="font-medium">{users?.length || 0}</span> of{' '}
          <span className="font-medium">{count || 0}</span> users
        </p>
      </div>

      {/* User Table */}
      <UserTable users={users || []} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex flex-1 justify-between sm:hidden">
            {page > 1 ? (
              <Link
                href={`/admin/users?query=${query}&role=${roleFilter}&status=${statusFilter}&page=${page - 1}`}
                className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Previous
              </Link>
            ) : (
              <span className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-400 bg-white border border-gray-300 rounded-md cursor-not-allowed">
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={`/admin/users?query=${query}&role=${roleFilter}&status=${statusFilter}&page=${page + 1}`}
                className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Next
              </Link>
            ) : (
              <span className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-400 bg-white border border-gray-300 rounded-md cursor-not-allowed">
                Next
              </span>
            )}
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Page <span className="font-medium">{page}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {page > 1 ? (
                  <Link
                    href={`/admin/users?query=${query}&role=${roleFilter}&status=${statusFilter}&page=${page - 1}`}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </Link>
                ) : (
                  <span className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/admin/users?query=${query}&role=${roleFilter}&status=${statusFilter}&page=${page + 1}`}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </Link>
                ) : (
                  <span className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
