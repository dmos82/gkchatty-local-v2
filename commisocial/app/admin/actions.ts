'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  updateUserSchema,
  resetPasswordSchema,
  changeRoleSchema,
  softDeleteUserSchema,
  restoreUserSchema,
  permanentDeleteUserSchema,
  validateData,
  type UpdateUserInput,
  type ResetPasswordInput,
  type ChangeRoleInput,
  type SoftDeleteUserInput,
  type RestoreUserInput,
  type PermanentDeleteUserInput,
} from '@/lib/admin/validators'

// ============================================================================
// Helper: Check Admin Authorization
// ============================================================================

async function checkAdminAuthorization(requiredRole: 'admin' | 'super_admin' = 'admin') {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { authorized: false, error: 'Not authenticated', user: null, profile: null }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, deleted_at')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.deleted_at) {
    return { authorized: false, error: 'Profile not found or deleted', user, profile: null }
  }

  if (requiredRole === 'super_admin' && profile.role !== 'super_admin') {
    return { authorized: false, error: 'Requires super_admin role', user, profile }
  }

  if (!['admin', 'super_admin'].includes(profile.role)) {
    return { authorized: false, error: 'Requires admin role', user, profile }
  }

  return { authorized: true, error: null, user, profile }
}

// ============================================================================
// User Management Actions
// ============================================================================

export async function updateUser(userId: string, input: UpdateUserInput) {
  // 1. Validate input
  const validation = validateData(updateUserSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Prevent editing own profile via admin panel
  if (auth.user!.id === userId) {
    return { success: false, error: 'Cannot edit your own profile via admin panel' }
  }

  // 4. Update user
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(validation.data)
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // 5. Revalidate
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}`)

  return { success: true, data }
}

// ============================================================================
// Password Reset Actions
// ============================================================================

export async function resetUserPassword(input: ResetPasswordInput) {
  // 1. Validate input
  const validation = validateData(resetPasswordSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Reset password via Supabase Admin API
  const supabase = await createClient()
  const { data, error } = await supabase.auth.admin.updateUserById(
    validation.data.userId,
    { password: validation.data.password }
  )

  if (error) {
    return { success: false, error: error.message }
  }

  // 4. Create audit log
  await supabase.from('audit_logs').insert({
    admin_id: auth.user!.id,
    action: 'password_reset',
    target_user_id: validation.data.userId,
    old_value: null,
    new_value: { custom_password: true },
  })

  return { success: true, message: 'Password reset successfully' }
}

export async function generateTemporaryPassword(userId: string) {
  // 1. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 2. Generate random password (8 chars, alphanumeric + special)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  // 3. Set password
  const supabase = await createClient()
  const { error } = await supabase.auth.admin.updateUserById(
    userId,
    { password: tempPassword }
  )

  if (error) {
    return { success: false, error: error.message }
  }

  // 4. Create audit log
  await supabase.from('audit_logs').insert({
    admin_id: auth.user!.id,
    action: 'password_reset',
    target_user_id: userId,
    old_value: null,
    new_value: { temporary_password: true },
  })

  return { success: true, temporaryPassword: tempPassword }
}

// ============================================================================
// Role Management Actions
// ============================================================================

export async function changeUserRole(input: ChangeRoleInput) {
  // 1. Validate input
  const validation = validateData(changeRoleSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization (requires super_admin)
  const auth = await checkAdminAuthorization('super_admin')
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Prevent changing own role
  if (auth.user!.id === validation.data.userId) {
    return { success: false, error: 'Cannot change your own role' }
  }

  // 4. Get current role
  const supabase = await createClient()
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', validation.data.userId)
    .single()

  if (!currentProfile) {
    return { success: false, error: 'User not found' }
  }

  // 5. Update role
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: validation.data.newRole })
    .eq('id', validation.data.userId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // 6. Audit log (created automatically by trigger)

  // 7. Revalidate
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${validation.data.userId}`)

  return { success: true, data, oldRole: currentProfile.role, newRole: validation.data.newRole }
}

// ============================================================================
// User Deletion Actions
// ============================================================================

export async function softDeleteUser(input: SoftDeleteUserInput) {
  // 1. Validate input
  const validation = validateData(softDeleteUserSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Prevent deleting own account
  if (auth.user!.id === validation.data.userId) {
    return { success: false, error: 'Cannot delete your own account' }
  }

  // 4. Soft delete
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', validation.data.userId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // 5. Revalidate
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${validation.data.userId}`)

  return { success: true, message: 'User soft deleted successfully', data }
}

export async function restoreUser(input: RestoreUserInput) {
  // 1. Validate input
  const validation = validateData(restoreUserSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Restore user
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ deleted_at: null })
    .eq('id', validation.data.userId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // 4. Revalidate
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${validation.data.userId}`)

  return { success: true, message: 'User restored successfully', data }
}

export async function permanentDeleteUser(input: PermanentDeleteUserInput) {
  // 1. Validate input
  const validation = validateData(permanentDeleteUserSchema, input)
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.errors }
  }

  // 2. Check authorization (requires super_admin)
  const auth = await checkAdminAuthorization('super_admin')
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 3. Prevent deleting own account
  if (auth.user!.id === validation.data.userId) {
    return { success: false, error: 'Cannot delete your own account' }
  }

  // 4. Check user is soft-deleted first
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('deleted_at')
    .eq('id', validation.data.userId)
    .single()

  if (!profile || !profile.deleted_at) {
    return { success: false, error: 'User must be soft-deleted before permanent deletion' }
  }

  // 5. Delete permanently
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', validation.data.userId)

  if (error) {
    return { success: false, error: error.message }
  }

  // 6. Revalidate
  revalidatePath('/admin/users')

  return { success: true, message: 'User permanently deleted' }
}

// ============================================================================
// Audit Log Actions
// ============================================================================

export async function getAuditLogs(filters?: {
  adminId?: string
  targetUserId?: string
  action?: string
  limit?: number
  offset?: number
}) {
  // 1. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 2. Build query
  const supabase = await createClient()
  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      admin:profiles!admin_id(username, display_name),
      target_user:profiles!target_user_id(username, display_name)
    `, { count: 'exact' })
    .order('timestamp', { ascending: false })

  if (filters?.adminId) {
    query = query.eq('admin_id', filters.adminId)
  }

  if (filters?.targetUserId) {
    query = query.eq('target_user_id', filters.targetUserId)
  }

  if (filters?.action && filters.action !== 'all') {
    query = query.eq('action', filters.action)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data, count }
}

export async function exportAuditLogsToCSV(filters?: {
  adminId?: string
  targetUserId?: string
  action?: string
  startDate?: string
  endDate?: string
}) {
  // 1. Check authorization
  const auth = await checkAdminAuthorization()
  if (!auth.authorized) {
    return { success: false, error: auth.error }
  }

  // 2. Get audit logs (all matching, no pagination)
  const result = await getAuditLogs({ ...filters, limit: 10000 })

  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Failed to fetch audit logs' }
  }

  // 3. Convert to CSV (simple implementation - you can enhance with csv-stringify)
  const headers = ['Timestamp', 'Admin', 'Action', 'Target User', 'Old Value', 'New Value']
  const rows = result.data.map((log: any) => [
    new Date(log.timestamp).toISOString(),
    log.admin?.username || 'Unknown',
    log.action,
    log.target_user?.username || 'Unknown',
    JSON.stringify(log.old_value || {}),
    JSON.stringify(log.new_value || {}),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row: string[]) => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  return { success: true, csv: csvContent, filename: `audit-logs-${new Date().toISOString().split('T')[0]}.csv` }
}
