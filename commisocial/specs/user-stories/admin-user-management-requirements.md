# Admin User Management System - Requirements Document

**Project:** CommiSocial Admin System
**Phase:** Requirements Engineering (Phase 0 - BMAD-Pro-Build)
**Date:** 2025-10-27
**Status:** ✅ Requirements Complete

---

## Executive Summary

This document specifies requirements for an enterprise-grade Admin User Management System for CommiSocial, following 2024 security best practices including Role-Based Access Control (RBAC), comprehensive audit logging, and GDPR compliance.

**Scope:** MVP - Core admin functionality for user management
**Security Model:** RBAC with 3 roles (user, admin, super_admin)
**Compliance:** GDPR, SOC 2, enterprise security standards

---

## User Stories

### US-001: View All Users with Search and Filter

**As a** system administrator
**I want** to view a paginated list of all registered users with search and filter capabilities
**So that** I can efficiently locate and manage user accounts

**Acceptance Criteria:**
- [ ] Admin dashboard displays paginated user list (50 users per page)
- [ ] Search by username, email, or display name (real-time)
- [ ] Filter by role (user, admin, super_admin)
- [ ] Filter by account status (active, suspended, deleted)
- [ ] Filter by registration date range
- [ ] Sort by username, email, created_at, last_login (ascending/descending)
- [ ] Display: username, email, display_name, role, created_at, last_login, status
- [ ] Click user row to view detailed profile
- [ ] Only accessible to users with admin or super_admin role
- [ ] Unauthorized access returns 403 Forbidden

**Technical Requirements:**
- Endpoint: `GET /api/admin/users?page=1&limit=50&search=&role=&status=&sort=`
- Response time: < 500ms for 10,000 users
- RLS policy: `role IN ('admin', 'super_admin')`

---

### US-002: Edit User Profile Information

**As a** system administrator
**I want** to edit user profile information (username, display_name, email)
**So that** I can correct errors or update user information upon request

**Acceptance Criteria:**
- [ ] Admin can click "Edit" button on user profile
- [ ] Edit form validates username (3-20 chars, alphanumeric + underscore)
- [ ] Edit form validates email (valid email format)
- [ ] Display name can be 1-50 characters
- [ ] Username uniqueness enforced (cannot duplicate existing username)
- [ ] Email uniqueness enforced (cannot duplicate existing email)
- [ ] Changes logged to audit_logs table with admin_id, old_value, new_value
- [ ] Success message: "User profile updated successfully"
- [ ] Error handling: display validation errors, database errors
- [ ] Only accessible to admin or super_admin
- [ ] Cannot edit own username or email (prevents lockout)

**Technical Requirements:**
- Endpoint: `PATCH /api/admin/users/:userId`
- Body: `{username?, display_name?, email?}`
- Audit log entry created with trigger
- RLS policy: admin can update any user except own critical fields

---

### US-003: Change User Password

**As a** system administrator
**I want** to reset or change a user's password
**So that** I can help users regain access to locked accounts

**Acceptance Criteria:**
- [ ] Admin can click "Reset Password" button on user profile
- [ ] Two options: (A) Generate temporary password, (B) Set custom password
- [ ] Password must meet requirements: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- [ ] Temporary password expires in 24 hours
- [ ] Temporary password forces password change on next login
- [ ] Password change logged to audit_logs (password hash NOT logged)
- [ ] User receives email notification: "Your password was reset by an administrator"
- [ ] Success message: "Password reset successfully. Temporary password: [shown once]"
- [ ] Only accessible to admin or super_admin
- [ ] Cannot reset super_admin password (unless you are super_admin)

**Technical Requirements:**
- Endpoint: `POST /api/admin/users/:userId/reset-password`
- Body: `{type: 'temporary' | 'custom', password?: string}`
- Uses Supabase Admin API: `supabase.auth.admin.updateUserById()`
- Email sent via Supabase Auth (template: password_reset_admin)
- Audit log: `{action: 'password_reset', admin_id, user_id, timestamp}`

---

### US-004: Delete User Account (Soft Delete)

**As a** system administrator
**I want** to soft delete user accounts
**So that** I can deactivate accounts while preserving data for compliance/audit purposes

**Acceptance Criteria:**
- [ ] Admin can click "Delete Account" button on user profile
- [ ] Confirmation modal: "Are you sure you want to delete @username? This action can be reversed within 30 days."
- [ ] Soft delete sets `deleted_at = NOW()` in profiles table
- [ ] Soft deleted users cannot log in (auth check in middleware)
- [ ] Soft deleted users hidden from main user list (filter: `deleted_at IS NULL`)
- [ ] Admin can view deleted users via "Show Deleted" toggle
- [ ] Deleted users' posts/comments remain visible (attributed to "Deleted User")
- [ ] Deletion logged to audit_logs
- [ ] Only accessible to admin or super_admin
- [ ] Cannot delete own account (prevents lockout)
- [ ] Cannot delete super_admin accounts (unless you are super_admin)

**Technical Requirements:**
- Endpoint: `DELETE /api/admin/users/:userId` (soft delete)
- Updates: `profiles.deleted_at = NOW()`
- Auth disabled: Supabase RLS policy `deleted_at IS NULL`
- Audit log: `{action: 'user_deleted', admin_id, user_id, timestamp, reason?}`

---

### US-005: Permanently Delete User Account

**As a** super administrator
**I want** to permanently delete user accounts after 30-day soft delete period
**So that** I can comply with GDPR "right to be forgotten" requests

**Acceptance Criteria:**
- [ ] Only super_admin can permanently delete
- [ ] Only users soft-deleted for > 30 days can be permanently deleted
- [ ] Confirmation modal: "PERMANENT DELETE - This cannot be undone. Type 'DELETE' to confirm."
- [ ] Permanently deletes:
  - User profile record
  - Auth user record (via Supabase Admin API)
  - User's posts (cascade delete OR anonymize - configurable)
  - User's comments (cascade delete OR anonymize - configurable)
  - User's votes
- [ ] Retains audit logs (compliance requirement)
- [ ] Success message: "User permanently deleted. User ID: [uuid] (save for records)"
- [ ] Action logged to audit_logs with `action: 'permanent_delete'`
- [ ] Rate limited: max 10 permanent deletes per hour per admin

**Technical Requirements:**
- Endpoint: `DELETE /api/admin/users/:userId/permanent`
- Query param: `?confirm=DELETE`
- Checks: `role = 'super_admin' AND target.deleted_at < NOW() - INTERVAL '30 days'`
- Cascade: `ON DELETE CASCADE` for owned data
- Supabase Admin: `supabase.auth.admin.deleteUser(userId)`
- Audit log: Permanent record of deletion

---

### US-006: Assign and Revoke Admin Roles

**As a** super administrator
**I want** to promote users to admin or demote admins to regular users
**So that** I can delegate administrative responsibilities

**Acceptance Criteria:**
- [ ] Only super_admin can change roles
- [ ] Super_admin can assign roles: user → admin, admin → user
- [ ] Super_admin role can only be assigned via database migration (not via UI)
- [ ] Role change confirmation modal: "Promote @username to admin? They will gain access to all admin features."
- [ ] Role change logged to audit_logs with old_role and new_role
- [ ] User receives email notification: "Your role has been changed to [role]"
- [ ] Role change takes effect immediately (cached session invalidated)
- [ ] Cannot change own role (prevents accidental demotion)
- [ ] Cannot demote the last super_admin (system must have ≥ 1 super_admin)

**Technical Requirements:**
- Endpoint: `PATCH /api/admin/users/:userId/role`
- Body: `{role: 'user' | 'admin'}`  (super_admin excluded from API)
- RLS policy: `auth.jwt() ->> 'role' = 'super_admin'`
- Validation: Check last super_admin count before demotion
- Audit log: `{action: 'role_changed', admin_id, user_id, old_role, new_role, timestamp}`
- Session invalidation: Supabase `auth.admin.signOut(userId)`

---

### US-007: View Audit Log of Admin Actions

**As a** system administrator
**I want** to view a comprehensive audit log of all admin actions
**So that** I can maintain accountability and investigate security incidents

**Acceptance Criteria:**
- [ ] Audit log page displays all admin actions in reverse chronological order
- [ ] Paginated (100 entries per page)
- [ ] Filter by action type (user_created, user_updated, password_reset, role_changed, user_deleted, permanent_delete)
- [ ] Filter by admin (who performed the action)
- [ ] Filter by target user (who was affected)
- [ ] Filter by date range
- [ ] Display: timestamp, admin, action, target_user, old_value, new_value, ip_address
- [ ] Audit logs are immutable (cannot be edited or deleted via UI)
- [ ] Audit logs retained for 2 years (compliance requirement)
- [ ] Export to CSV functionality (for compliance audits)
- [ ] Only accessible to admin or super_admin

**Technical Requirements:**
- Table: `audit_logs` (id, timestamp, admin_id, action, target_user_id, old_value, new_value, ip_address, user_agent)
- Endpoint: `GET /api/admin/audit-logs?page=1&action=&admin=&target=&from=&to=`
- Immutable: No UPDATE or DELETE RLS policies
- Retention: Automated cleanup job (delete logs > 2 years old)
- Export: `GET /api/admin/audit-logs/export?format=csv`

---

### US-008: Multi-Factor Authentication (MFA) Enforcement

**As a** super administrator
**I want** to enforce MFA for all admin accounts
**So that** I can protect against credential compromise

**Acceptance Criteria:**
- [ ] All users with admin or super_admin role MUST enable MFA
- [ ] Admin dashboard shows MFA status (enabled/disabled) for each user
- [ ] Super_admin can send "Enable MFA" reminder email to admins without MFA
- [ ] Admins without MFA see persistent banner: "MFA Required - Enable within 7 days"
- [ ] After 7 days, admins without MFA cannot access admin features (403 Forbidden)
- [ ] MFA setup uses TOTP (Time-based One-Time Password) via authenticator app
- [ ] Recovery codes generated during setup (10 single-use codes)
- [ ] MFA status logged to audit_logs when enabled/disabled
- [ ] Only super_admin can disable MFA for another admin (emergency access)

**Technical Requirements:**
- Supabase MFA: `supabase.auth.mfa.enroll()` and `supabase.auth.mfa.verify()`
- Middleware check: `if (role IN ('admin', 'super_admin') AND mfa_enabled = false) THEN block_access`
- Grace period: 7 days from role assignment
- Audit log: `{action: 'mfa_enabled', user_id, timestamp}`
- Recovery codes stored hashed in `mfa_recovery_codes` table

---

## Technical Specifications

### Database Schema Updates

#### New Table: `audit_logs`
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL, -- 'user_updated', 'password_reset', 'role_changed', 'user_deleted', etc.
  target_user_id UUID REFERENCES profiles(id),
  old_value JSONB, -- Store old state for comparison
  new_value JSONB, -- Store new state
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target_user_id ON audit_logs(target_user_id);

-- RLS Policies (audit logs are read-only for admins)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- NO UPDATE OR DELETE POLICIES (immutable logs)
```

#### Update `profiles` Table
```sql
-- Add role column
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin'));

-- Add deleted_at for soft delete
ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;

-- Add MFA columns
ALTER TABLE profiles ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN mfa_enforced_at TIMESTAMPTZ; -- When MFA became required for this user

-- Add last_login tracking
ALTER TABLE profiles ADD COLUMN last_login TIMESTAMPTZ;

-- Index for admin queries
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;
```

#### New Table: `mfa_recovery_codes`
```sql
CREATE TABLE mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  code_hash TEXT NOT NULL, -- bcrypt hash of recovery code
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_recovery_codes_user_id ON mfa_recovery_codes(user_id);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recovery codes" ON mfa_recovery_codes
  FOR SELECT USING (auth.uid() = user_id);
```

---

### API Endpoints

#### 1. GET /api/admin/users
**Auth:** Admin or Super Admin
**Query Params:**
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 100)
- `search` (string, optional) - Search username, email, display_name
- `role` (string, optional) - Filter by role
- `status` (string, optional) - 'active' | 'deleted'
- `sort` (string, optional) - 'username' | 'email' | 'created_at' | 'last_login'
- `order` (string, optional) - 'asc' | 'desc'

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "display_name": "string",
      "role": "user | admin | super_admin",
      "created_at": "timestamp",
      "last_login": "timestamp",
      "deleted_at": "timestamp | null",
      "mfa_enabled": "boolean"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "total_pages": 25
  }
}
```

---

#### 2. PATCH /api/admin/users/:userId
**Auth:** Admin or Super Admin
**Body:**
```json
{
  "username": "string (optional)",
  "display_name": "string (optional)",
  "email": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "new_username",
    "display_name": "New Display Name",
    "email": "new@email.com"
  },
  "audit_log_id": "uuid"
}
```

---

#### 3. POST /api/admin/users/:userId/reset-password
**Auth:** Admin or Super Admin
**Body:**
```json
{
  "type": "temporary | custom",
  "password": "string (required if type=custom)"
}
```

**Response:**
```json
{
  "success": true,
  "temporary_password": "Abc123!@#Xyz (only shown if type=temporary)",
  "expires_at": "timestamp (24 hours from now)",
  "audit_log_id": "uuid"
}
```

---

#### 4. DELETE /api/admin/users/:userId (Soft Delete)
**Auth:** Admin or Super Admin
**Body:**
```json
{
  "reason": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "deleted_at": "timestamp",
  "audit_log_id": "uuid",
  "message": "User soft deleted. Can be restored within 30 days."
}
```

---

#### 5. DELETE /api/admin/users/:userId/permanent
**Auth:** Super Admin only
**Query Params:**
- `confirm=DELETE` (required)

**Response:**
```json
{
  "success": true,
  "user_id": "uuid",
  "audit_log_id": "uuid",
  "message": "User permanently deleted. This action cannot be undone."
}
```

---

#### 6. PATCH /api/admin/users/:userId/role
**Auth:** Super Admin only
**Body:**
```json
{
  "role": "user | admin"
}
```

**Response:**
```json
{
  "success": true,
  "old_role": "user",
  "new_role": "admin",
  "audit_log_id": "uuid"
}
```

---

#### 7. GET /api/admin/audit-logs
**Auth:** Admin or Super Admin
**Query Params:**
- `page` (number, default: 1)
- `limit` (number, default: 100, max: 500)
- `action` (string, optional)
- `admin` (uuid, optional)
- `target` (uuid, optional)
- `from` (timestamp, optional)
- `to` (timestamp, optional)

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "timestamp": "timestamp",
      "admin": {
        "id": "uuid",
        "username": "admin_user"
      },
      "action": "user_updated",
      "target_user": {
        "id": "uuid",
        "username": "target_user"
      },
      "old_value": {"email": "old@email.com"},
      "new_value": {"email": "new@email.com"},
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 5420
  }
}
```

---

#### 8. GET /api/admin/audit-logs/export
**Auth:** Admin or Super Admin
**Query Params:** Same as GET /api/admin/audit-logs
**Response:** CSV file download

---

### Row-Level Security (RLS) Policies

#### Profiles Table
```sql
-- Existing policies remain...

-- New: Admins can view all users
CREATE POLICY "Admins can view all users" ON profiles
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- New: Admins can update users (except own critical fields)
CREATE POLICY "Admins can update users" ON profiles
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    AND id != auth.uid() -- Cannot update own record via admin panel
  );

-- New: Only active users can authenticate
CREATE POLICY "Only active users can authenticate" ON profiles
  FOR SELECT USING (deleted_at IS NULL);
```

---

## Security Requirements

### 1. **Least Privilege Principle**
- Users have minimal permissions by default
- Admin role grants user management capabilities
- Super Admin role required for role changes and permanent deletions

### 2. **Separation of Duties**
- Admins cannot modify own username, email, or role (prevents privilege escalation)
- Super Admin role can only be assigned via database migration (not via API)
- System must have ≥ 1 Super Admin at all times (enforced via database constraint)

### 3. **Audit Logging**
- All admin actions logged to immutable audit_logs table
- Logs include: who, what, when, old value, new value, IP, user agent
- Logs retained for 2 years (compliance requirement)
- Export functionality for compliance audits

### 4. **Multi-Factor Authentication (MFA)**
- TOTP-based MFA required for all admin/super_admin accounts
- 7-day grace period for new admins
- Recovery codes for account recovery
- Only Super Admin can disable MFA (emergency access)

### 5. **Password Security**
- Passwords must meet complexity requirements (8+ chars, upper, lower, number, special)
- Temporary passwords expire in 24 hours
- Temporary passwords force password change on next login
- Password hashes never logged (audit logs record action only)

### 6. **Rate Limiting**
- Permanent delete: Max 10 per hour per admin
- Password reset: Max 20 per hour per admin
- Login attempts: Max 5 per 15 minutes per IP

### 7. **GDPR Compliance**
- Soft delete (30-day grace period for recovery)
- Permanent delete (right to be forgotten)
- Audit logs retained even after permanent deletion
- Data export functionality (user data portability)

---

## Success Metrics

1. **Security Metrics:**
   - 100% of admin accounts have MFA enabled within 7 days
   - 0 unauthorized access attempts succeed
   - 100% of admin actions logged to audit trail

2. **Performance Metrics:**
   - User list loads in < 500ms for 10,000 users
   - Search responds in < 200ms
   - API response time p95 < 1 second

3. **Compliance Metrics:**
   - 100% GDPR compliance (soft delete, permanent delete, data export)
   - Audit logs retained for 2 years
   - All admin actions auditable

4. **Usability Metrics:**
   - Admins can find any user in < 10 seconds (search + filter)
   - Password reset takes < 30 seconds
   - Role assignment takes < 15 seconds

---

## Constraints

1. **MVP Scope:**
   - No bulk operations (bulk delete, bulk role change) - single user actions only
   - No user suspension/ban (use soft delete instead)
   - No custom roles (only 3 roles: user, admin, super_admin)
   - No activity monitoring (login history, session management) - future enhancement

2. **Technical Constraints:**
   - Must use existing Supabase Auth (no custom auth system)
   - Must use existing PostgreSQL database
   - Must use Next.js 15 App Router
   - Must maintain existing RLS policies for user-facing features

3. **Timeline:**
   - MVP delivery: 2-3 days
   - MFA enforcement: Gradual rollout (7-day grace period)

---

## Non-Functional Requirements

### 1. **Accessibility:**
- Admin dashboard WCAG 2.1 AA compliant
- Keyboard navigation supported
- Screen reader compatible

### 2. **Localization:**
- English only for MVP
- Audit log export supports UTF-8 (international usernames)

### 3. **Browser Support:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 4. **Mobile Responsiveness:**
- Admin dashboard optimized for desktop (1920x1080)
- Mobile view: Read-only audit logs, user search
- Mobile view: No edit/delete actions (desktop only)

---

## Future Enhancements (Post-MVP)

1. **Bulk Operations:**
   - Bulk delete users (with CSV upload)
   - Bulk role assignment

2. **Advanced User Monitoring:**
   - Login history (last 30 logins)
   - Active sessions management (force logout)
   - Suspicious activity detection (impossible travel, brute force)

3. **Custom Roles:**
   - Role builder (assign granular permissions)
   - Support roles (can view users, cannot edit)

4. **User Suspension:**
   - Temporary suspension (cannot login, but account not deleted)
   - Auto-suspension triggers (e.g., 5 failed login attempts)

5. **Enhanced Audit Logs:**
   - Diff viewer (visual comparison of old vs new values)
   - Audit log search (full-text search)
   - Real-time audit log streaming (WebSocket)

6. **Data Analytics:**
   - User growth metrics (signups per day)
   - Role distribution pie chart
   - Admin activity heatmap

---

## Appendix: Action Types for Audit Logs

| Action | Description | Old Value | New Value |
|--------|-------------|-----------|-----------|
| `user_created` | Admin manually created user | null | `{username, email, role}` |
| `user_updated` | Admin edited user profile | `{old username, old email}` | `{new username, new email}` |
| `password_reset` | Admin reset user password | null | `{type: 'temporary' or 'custom'}` |
| `role_changed` | Admin changed user role | `{old_role}` | `{new_role}` |
| `user_deleted` | Admin soft deleted user | `{active: true}` | `{deleted_at: timestamp}` |
| `user_restored` | Admin restored soft deleted user | `{deleted_at: timestamp}` | `{deleted_at: null}` |
| `permanent_delete` | Super admin permanently deleted user | `{user_id, username, email}` | null |
| `mfa_enabled` | User enabled MFA | `{mfa_enabled: false}` | `{mfa_enabled: true}` |
| `mfa_disabled` | Admin disabled MFA for user | `{mfa_enabled: true}` | `{mfa_enabled: false}` |

---

**Document Status:** ✅ Requirements Complete
**Next Phase:** Architecture Design (Phase 1)
**Approval Required:** Product Owner sign-off before proceeding to architecture

---

*Generated by BMAD-Pro-Build v2.0 | Phase 0: Requirements Engineering | 2025-10-27*
