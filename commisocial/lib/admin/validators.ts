import { z } from 'zod'

// ============================================================================
// User Management Schemas
// ============================================================================

export const updateUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(20, 'Username must be at most 20 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  display_name: z.string().max(50, 'Display name must be at most 50 characters').optional().nullable(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional().nullable(),
  avatar_url: z.string().url('Avatar URL must be a valid URL').optional().nullable(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

// ============================================================================
// Password Reset Schemas
// ============================================================================

export const resetPasswordSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const generateTemporaryPasswordSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
})

export type GenerateTemporaryPasswordInput = z.infer<typeof generateTemporaryPasswordSchema>

// ============================================================================
// Role Management Schemas
// ============================================================================

export const changeRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  newRole: z.enum(['user', 'admin', 'super_admin']),
})

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>

// ============================================================================
// User Deletion Schemas
// ============================================================================

export const softDeleteUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500, 'Reason must be at most 500 characters').optional(),
})

export type SoftDeleteUserInput = z.infer<typeof softDeleteUserSchema>

export const restoreUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
})

export type RestoreUserInput = z.infer<typeof restoreUserSchema>

export const permanentDeleteUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  confirmation: z.literal('DELETE'),
})

export type PermanentDeleteUserInput = z.infer<typeof permanentDeleteUserSchema>

// ============================================================================
// User Search/Filter Schemas
// ============================================================================

export const userSearchSchema = z.object({
  query: z.string().max(100, 'Search query must be at most 100 characters').optional(),
  role: z.enum(['user', 'admin', 'super_admin', 'all']).optional().default('all'),
  status: z.enum(['active', 'deleted', 'all']).optional().default('active'),
  sortBy: z.enum(['username', 'created_at', 'last_login']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().min(10).max(100).optional().default(50),
})

export type UserSearchInput = z.infer<typeof userSearchSchema>

// ============================================================================
// Audit Log Schemas
// ============================================================================

export const auditLogFilterSchema = z.object({
  adminId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  action: z.enum([
    'user_created',
    'user_updated',
    'password_reset',
    'role_changed',
    'user_deleted',
    'user_restored',
    'permanent_delete',
    'mfa_enabled',
    'mfa_disabled',
    'all'
  ]).optional().default('all'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().min(10).max(100).optional().default(50),
})

export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>

// ============================================================================
// MFA Schemas
// ============================================================================

export const enforceMfaSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  enforce: z.boolean(),
})

export type EnforceMfaInput = z.infer<typeof enforceMfaSchema>

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate data against a schema and return formatted errors
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // Format Zod errors into key-value pairs
  const errors: Record<string, string> = {}
  result.error.issues.forEach((err: any) => {
    const path = err.path.join('.')
    errors[path] = err.message
  })

  return { success: false, errors }
}
