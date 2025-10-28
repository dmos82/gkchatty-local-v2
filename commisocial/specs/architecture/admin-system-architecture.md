# CommiSocial Admin User Management System - System Architecture

**Project:** CommiSocial Admin System
**Phase:** Architecture Design (Phase 1 - BMAD-Pro-Build)
**Date:** 2025-10-27
**Status:** Architecture Complete
**Architect:** BMAD Architect Agent

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Architecture Decisions](#architecture-decisions)
5. [Database Architecture](#database-architecture)
6. [API Architecture](#api-architecture)
7. [Security Architecture](#security-architecture)
8. [Frontend Architecture](#frontend-architecture)
9. [Performance Architecture](#performance-architecture)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Architecture](#deployment-architecture)
12. [Monitoring & Observability](#monitoring--observability)

---

## Executive Summary

This document defines the complete system architecture for an enterprise-grade Admin User Management System for CommiSocial. The system implements Role-Based Access Control (RBAC), comprehensive audit logging, MFA enforcement, and GDPR compliance.

**Architecture Principles:**
- Security-first design (defense in depth)
- Serverless architecture (Next.js App Router + Supabase)
- Database-driven authorization (RLS policies)
- Immutable audit logging
- Progressive enhancement (Server Components first)
- Performance at scale (10,000+ users)

**Key Technical Decisions:**
- Next.js 15 App Router (Server Components + Server Actions)
- Supabase (PostgreSQL + Auth + RLS)
- TypeScript (type safety for admin operations)
- Tailwind CSS + shadcn/ui (consistent UI)
- Playwright (E2E testing for admin workflows)

---

## System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Admin Dashboard (Next.js 15 App Router)                      │  │
│  │  - Server Components (default)                                │  │
│  │  - Client Components (interactive forms, search)              │  │
│  │  - Server Actions (form mutations)                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                      MIDDLEWARE LAYER                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Next.js Middleware (middleware.ts)                           │  │
│  │  1. Authentication Check (Supabase session)                   │  │
│  │  2. RBAC Check (admin/super_admin role)                       │  │
│  │  3. MFA Enforcement (7-day grace period)                      │  │
│  │  4. Rate Limiting (per-endpoint limits)                       │  │
│  │  5. Audit Context (capture IP, User-Agent)                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                              │
│  ┌────────────────────┐  ┌────────────────────┐                    │
│  │  Server Actions    │  │  API Routes        │                    │
│  │  (Form mutations)  │  │  (Read operations) │                    │
│  │  - User Update     │  │  - GET /users      │                    │
│  │  - Role Change     │  │  - GET /audit-logs │                    │
│  │  - Password Reset  │  │  - Export CSV      │                    │
│  │  - Soft Delete     │  │                    │                    │
│  └────────────────────┘  └────────────────────┘                    │
│              ↓                      ↓                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Business Logic Layer                                         │  │
│  │  - Authorization Guards (role checks)                         │  │
│  │  - Validation (Zod schemas)                                   │  │
│  │  - Audit Logging (log all admin actions)                      │  │
│  │  - Error Handling (typed errors)                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Supabase PostgreSQL Database                                 │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐ │  │
│  │  │ profiles       │  │ audit_logs     │  │ mfa_recovery_   │ │  │
│  │  │ - id           │  │ - id           │  │   codes         │ │  │
│  │  │ - username     │  │ - timestamp    │  │ - user_id       │ │  │
│  │  │ - email        │  │ - admin_id     │  │ - code_hash     │ │  │
│  │  │ - role         │  │ - action       │  │ - used_at       │ │  │
│  │  │ - deleted_at   │  │ - target_user  │  └─────────────────┘ │  │
│  │  │ - mfa_enabled  │  │ - old_value    │                      │  │
│  │  │ - last_login   │  │ - new_value    │                      │  │
│  │  └────────────────┘  └────────────────┘                      │  │
│  │                                                                │  │
│  │  RLS Policies:                                                 │  │
│  │  - Admin read access to all users                             │  │
│  │  - Admin update access (except own record)                    │  │
│  │  - Audit logs: read-only, no updates/deletes                  │  │
│  │  - Deleted users: filtered from auth                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Supabase Auth                                                 │  │
│  │  - JWT-based authentication                                    │  │
│  │  - MFA (TOTP via authenticator apps)                          │  │
│  │  - Admin API (password reset, user deletion)                  │  │
│  │  - Session management (admin session: 8 hours)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: User Update Operation

```
1. Admin clicks "Edit User" button
   ↓
2. Client Component renders edit form (pre-filled with user data)
   ↓
3. Admin submits form
   ↓
4. Server Action: updateUser(formData)
   ↓
5. Middleware: Check auth, role, MFA, rate limit
   ↓
6. Business Logic:
   a. Validate input (Zod schema)
   b. Check authorization (cannot edit own username/email)
   c. Fetch old user data (for audit log)
   d. Update profiles table
   e. Create audit_logs entry (via database trigger)
   ↓
7. Database: Execute UPDATE with RLS policy check
   ↓
8. Database Trigger: Insert into audit_logs
   ↓
9. Response: Return updated user data
   ↓
10. UI: Show success message, revalidate user list
```

### Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  Public Zone (No Auth)                                          │
│  - Login page                                                   │
│  - Signup page                                                  │
│  - Public feed                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Authenticated Zone (JWT Required)                              │
│  - User profile                                                 │
│  - User posts                                                   │
│  - User comments                                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Admin Zone (role: admin OR super_admin, MFA enforced)          │
│  - User management (list, search, edit, delete)                │
│  - Audit logs (view, export)                                   │
│  - Password reset                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Super Admin Zone (role: super_admin, MFA enforced)             │
│  - Role management (promote/demote admins)                      │
│  - Permanent delete                                             │
│  - MFA bypass (emergency access)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Next.js 15.0+** - App Router, Server Components, Server Actions
- **React 19** - Latest features (Server Components, transitions)
- **TypeScript 5.3+** - Type safety for admin operations
- **Tailwind CSS 3.4+** - Utility-first styling
- **shadcn/ui** - Pre-built accessible components
- **React Hook Form** - Form state management
- **Zod** - Schema validation (client + server)

### Backend
- **Next.js API Routes** - Read operations (GET /api/admin/users)
- **Next.js Server Actions** - Mutations (update, delete, password reset)
- **Supabase Client** - Database queries
- **Supabase Admin API** - Auth operations (password reset, user deletion)

### Database
- **Supabase PostgreSQL** - Primary database
- **Row-Level Security (RLS)** - Database-level authorization
- **Database Triggers** - Audit logging automation

### Authentication
- **Supabase Auth** - JWT-based authentication
- **Supabase MFA** - TOTP (Time-based One-Time Password)
- **NextAuth.js Middleware** - Route protection

### DevOps
- **Vercel** - Hosting (recommended for Next.js)
- **GitHub Actions** - CI/CD
- **Playwright** - E2E testing
- **Vitest** - Unit/integration testing

### Monitoring
- **Vercel Analytics** - Performance monitoring
- **Supabase Dashboard** - Database monitoring
- **Sentry** - Error tracking (optional)

---

## Architecture Decisions

### ADR-001: Use Next.js Server Components as Default

**Decision:** Use Server Components for all admin pages by default, only using Client Components for interactive elements (forms, search, modals).

**Rationale:**
- **Security:** Admin data never leaves the server unless explicitly sent to client
- **Performance:** Smaller JavaScript bundle (no React on client for static content)
- **SEO:** Server-rendered content (not relevant for admin panel, but good practice)
- **Data Fetching:** Direct database access from components (no API route needed)

**Implementation:**
```tsx
// app/admin/users/page.tsx (Server Component)
export default async function UsersPage({ searchParams }) {
  // Direct database query (secure, only runs on server)
  const users = await getUsers(searchParams)

  return <UserList users={users} /> // Server Component
}

// components/UserList.tsx (Server Component)
export function UserList({ users }) {
  return (
    <>
      <UserSearch /> {/* Client Component for interactivity */}
      <table>
        {users.map(user => <UserRow key={user.id} user={user} />)}
      </table>
    </>
  )
}
```

**Trade-offs:**
- ✅ Better security (no data leakage to client)
- ✅ Better performance (smaller bundles)
- ❌ Learning curve (new mental model for React developers)

---

### ADR-002: Use Server Actions for Mutations Instead of API Routes

**Decision:** Use Next.js Server Actions for all mutations (update, delete, password reset) instead of traditional API routes.

**Rationale:**
- **Type Safety:** End-to-end type safety (client → server)
- **Simplicity:** No need to manually define API routes, handle CORS, parse JSON
- **Security:** Built-in CSRF protection
- **Performance:** Optimistic updates easier to implement

**Implementation:**
```tsx
// actions/admin-actions.ts
'use server'

export async function updateUser(userId: string, formData: FormData) {
  // 1. Check authorization
  const session = await getSession()
  if (!session || !['admin', 'super_admin'].includes(session.user.role)) {
    throw new Error('Unauthorized')
  }

  // 2. Validate input
  const data = updateUserSchema.parse({
    username: formData.get('username'),
    email: formData.get('email'),
  })

  // 3. Business logic
  const oldUser = await db.from('profiles').select().eq('id', userId).single()
  await db.from('profiles').update(data).eq('id', userId)

  // 4. Audit log (via database trigger)

  // 5. Revalidate
  revalidatePath('/admin/users')

  return { success: true }
}
```

```tsx
// components/UserEditForm.tsx (Client Component)
'use client'

export function UserEditForm({ user }) {
  const handleSubmit = async (formData: FormData) => {
    const result = await updateUser(user.id, formData)
    if (result.success) {
      toast.success('User updated')
    }
  }

  return (
    <form action={handleSubmit}>
      <input name="username" defaultValue={user.username} />
      <button type="submit">Save</button>
    </form>
  )
}
```

**Trade-offs:**
- ✅ Simpler code (no API route boilerplate)
- ✅ Type safety (TypeScript infers types)
- ✅ Better DX (collocated with components)
- ❌ Requires JavaScript (progressive enhancement harder)

---

### ADR-003: Use Database Triggers for Audit Logging

**Decision:** Use PostgreSQL triggers to automatically insert audit logs instead of application-level logging.

**Rationale:**
- **Reliability:** Cannot be bypassed (even if developer forgets to log)
- **Atomicity:** Audit log inserted in same transaction as data change
- **Consistency:** All admin actions logged the same way
- **Performance:** Single database round-trip

**Implementation:**
```sql
-- Trigger function
CREATE OR REPLACE FUNCTION log_user_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    admin_id,
    action,
    target_user_id,
    old_value,
    new_value,
    ip_address,
    user_agent
  ) VALUES (
    auth.uid(),
    'user_updated',
    NEW.id,
    jsonb_build_object(
      'username', OLD.username,
      'email', OLD.email,
      'display_name', OLD.display_name
    ),
    jsonb_build_object(
      'username', NEW.username,
      'email', NEW.email,
      'display_name', NEW.display_name
    ),
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    current_setting('request.headers', true)::json->>'user-agent'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER audit_user_updates
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.username IS DISTINCT FROM NEW.username
   OR OLD.email IS DISTINCT FROM NEW.email
   OR OLD.display_name IS DISTINCT FROM NEW.display_name
   OR OLD.role IS DISTINCT FROM NEW.role
   OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
EXECUTE FUNCTION log_user_update();
```

**Trade-offs:**
- ✅ Impossible to bypass (security)
- ✅ Automatic (no developer action needed)
- ❌ Harder to test (database triggers not in application code)
- ❌ Requires database access to pass request context (IP, User-Agent)

---

### ADR-004: Use Cursor-Based Pagination for User List

**Decision:** Use cursor-based pagination instead of offset-based pagination for the user list.

**Rationale:**
- **Performance:** O(log n) complexity vs O(n) for offset-based
- **Consistency:** No skipped/duplicate rows when data changes during pagination
- **Scalability:** Works well with 10,000+ users

**Implementation:**
```typescript
// Cursor-based pagination (using created_at + id as cursor)
const users = await db
  .from('profiles')
  .select('*')
  .gt('created_at', cursor.timestamp)
  .order('created_at', { ascending: false })
  .limit(50)

// Next cursor
const nextCursor = users.length > 0
  ? users[users.length - 1].created_at
  : null
```

**Trade-offs:**
- ✅ Better performance at scale
- ✅ Consistent results
- ❌ Cannot jump to arbitrary page (no "Go to page 5")
- ❌ Slightly more complex implementation

**NOTE:** For MVP, we'll use offset-based pagination for simplicity (requirements specify page numbers). Cursor-based pagination is a future optimization.

---

### ADR-005: Use shadcn/ui for Admin UI Components

**Decision:** Use shadcn/ui for all admin panel UI components (tables, forms, modals, buttons).

**Rationale:**
- **Accessibility:** WCAG 2.1 AA compliant out of the box
- **Customization:** Copy-paste components (not npm package) - full control
- **TypeScript:** Fully typed components
- **Design System:** Consistent design language
- **Tailwind CSS:** Integrates perfectly with Tailwind

**Components Used:**
- Table (user list)
- Form (user edit, role change)
- Dialog (confirmation modals)
- Button (actions)
- Input (search, filters)
- Select (role dropdown, filter dropdowns)
- Badge (role badges, status badges)
- Alert (error messages, success messages)

**Trade-offs:**
- ✅ Accessible by default
- ✅ Beautiful design
- ✅ Full customization
- ❌ Manual installation (copy-paste each component)

---

### ADR-006: Use Zod for Schema Validation (Client + Server)

**Decision:** Use Zod for all input validation on both client and server.

**Rationale:**
- **Type Safety:** Zod schemas generate TypeScript types
- **Reusability:** Same schema used for client validation and server validation
- **Security:** Server-side validation prevents bypassing client validation
- **Error Messages:** Detailed error messages for debugging

**Implementation:**
```typescript
// schemas/admin.ts
import { z } from 'zod'

export const updateUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  display_name: z.string().min(1).max(50).optional(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>
```

```tsx
// Client validation (React Hook Form + Zod)
const form = useForm<UpdateUserInput>({
  resolver: zodResolver(updateUserSchema),
})
```

```typescript
// Server validation (Server Action)
export async function updateUser(userId: string, data: unknown) {
  const validated = updateUserSchema.parse(data) // Throws if invalid
  // ... rest of logic
}
```

**Trade-offs:**
- ✅ Type safety
- ✅ DRY (don't repeat yourself)
- ✅ Better error messages
- ❌ Additional dependency

---

### ADR-007: Use Playwright for E2E Testing Admin Workflows

**Decision:** Use Playwright for end-to-end testing of all admin workflows.

**Rationale:**
- **Real Browser:** Tests run in real browser (Chromium, Firefox, Safari)
- **Full Workflows:** Test complete user journeys (login → edit user → verify audit log)
- **Visual Regression:** Screenshot comparison (catch UI bugs)
- **CI/CD:** Integrates with GitHub Actions

**Test Coverage:**
- Admin login with MFA
- User list: search, filter, sort, pagination
- User edit: update username, email, display_name
- Role change: promote user to admin
- Password reset: generate temporary password
- Soft delete: delete user, verify cannot login
- Permanent delete: delete user permanently
- Audit log: view all actions, filter by admin, export CSV

**Trade-offs:**
- ✅ High confidence (tests real browser)
- ✅ Catches integration bugs
- ❌ Slower than unit tests
- ❌ Requires database seeding

---

## Database Architecture

### Database Schema

#### 1. Profiles Table (Updated)

```sql
-- Existing profiles table with new columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'super_admin'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enforced_at TIMESTAMPTZ;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);

-- Full-text search index for search functionality
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles
  USING gin(to_tsvector('english', username || ' ' || COALESCE(display_name, '') || ' ' || email));

-- Constraint: Ensure at least one super_admin exists
CREATE OR REPLACE FUNCTION check_last_super_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'super_admin' AND NEW.role != 'super_admin' THEN
    IF (SELECT COUNT(*) FROM profiles WHERE role = 'super_admin' AND id != NEW.id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last super_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_super_admin_exists
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION check_last_super_admin();
```

#### 2. Audit Logs Table (New)

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'user_created',
    'user_updated',
    'password_reset',
    'role_changed',
    'user_deleted',
    'user_restored',
    'permanent_delete',
    'mfa_enabled',
    'mfa_disabled'
  )),
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target_user_id ON audit_logs(target_user_id);

-- Composite index for common queries (filter by admin + date range)
CREATE INDEX idx_audit_logs_admin_timestamp ON audit_logs(admin_id, timestamp DESC);

-- Comment for documentation
COMMENT ON TABLE audit_logs IS 'Immutable audit log of all admin actions. Retained for 2 years for compliance.';
COMMENT ON COLUMN audit_logs.old_value IS 'Previous state before change (JSONB for flexibility)';
COMMENT ON COLUMN audit_logs.new_value IS 'New state after change (JSONB for flexibility)';
```

#### 3. MFA Recovery Codes Table (New)

```sql
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_recovery_codes_user_id ON mfa_recovery_codes(user_id);

-- Constraint: Each user has exactly 10 recovery codes
CREATE OR REPLACE FUNCTION check_recovery_code_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM mfa_recovery_codes WHERE user_id = NEW.user_id AND used_at IS NULL) >= 10 THEN
    RAISE EXCEPTION 'User already has 10 unused recovery codes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_recovery_code_limit
BEFORE INSERT ON mfa_recovery_codes
FOR EACH ROW
EXECUTE FUNCTION check_recovery_code_limit();
```

### Row-Level Security (RLS) Policies

#### Profiles Table RLS

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can view own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can update own profile (non-admin fields only)
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND OLD.role = NEW.role -- Cannot change own role
  );

-- Policy 3: Admins can view all users
CREATE POLICY "Admins can view all users" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Policy 4: Admins can update users (except own critical fields)
CREATE POLICY "Admins can update users" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
    AND id != auth.uid() -- Cannot update own record via admin panel
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
    AND id != auth.uid()
  );

-- Policy 5: Only super_admin can change roles
CREATE POLICY "Only super_admin can change roles" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
    AND OLD.role IS DISTINCT FROM NEW.role
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- Policy 6: Admins can delete users (soft delete)
CREATE POLICY "Admins can soft delete users" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
    AND id != auth.uid() -- Cannot delete own account
    AND OLD.deleted_at IS NULL
    AND NEW.deleted_at IS NOT NULL
  );

-- Policy 7: Only active users (not deleted) can authenticate
CREATE POLICY "Only active users can authenticate" ON profiles
  FOR SELECT
  USING (deleted_at IS NULL OR id = auth.uid());
```

#### Audit Logs Table RLS

```sql
-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins can view all audit logs
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Policy 2: Admins can insert audit logs (application-level logging)
CREATE POLICY "Admins can insert audit logs" ON audit_logs
  FOR INSERT
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- NO UPDATE OR DELETE POLICIES (audit logs are immutable)
```

#### MFA Recovery Codes Table RLS

```sql
-- Enable RLS
ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can view own recovery codes
CREATE POLICY "Users can view own recovery codes" ON mfa_recovery_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can insert own recovery codes (during MFA setup)
CREATE POLICY "Users can insert own recovery codes" ON mfa_recovery_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update own recovery codes (mark as used)
CREATE POLICY "Users can update own recovery codes" ON mfa_recovery_codes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND used_at IS NOT NULL);

-- Policy 4: Users can delete own recovery codes (regenerate)
CREATE POLICY "Users can delete own recovery codes" ON mfa_recovery_codes
  FOR DELETE
  USING (auth.uid() = user_id);
```

### Database Triggers for Audit Logging

#### Trigger 1: User Update

```sql
-- Function to log user updates
CREATE OR REPLACE FUNCTION log_user_update()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Get current user (admin performing action)
  v_admin_id := auth.uid();

  -- Only log if changes were made by an admin
  IF v_admin_id IS NOT NULL AND v_admin_id != NEW.id THEN
    INSERT INTO audit_logs (
      admin_id,
      action,
      target_user_id,
      old_value,
      new_value,
      ip_address,
      user_agent
    ) VALUES (
      v_admin_id,
      'user_updated',
      NEW.id,
      jsonb_build_object(
        'username', OLD.username,
        'email', OLD.email,
        'display_name', OLD.display_name
      ),
      jsonb_build_object(
        'username', NEW.username,
        'email', NEW.email,
        'display_name', NEW.display_name
      ),
      inet_client_addr(),
      current_setting('request.headers', true)::json->>'user-agent'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER audit_user_updates
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (
  OLD.username IS DISTINCT FROM NEW.username
  OR OLD.email IS DISTINCT FROM NEW.email
  OR OLD.display_name IS DISTINCT FROM NEW.display_name
)
EXECUTE FUNCTION log_user_update();
```

#### Trigger 2: Role Change

```sql
-- Function to log role changes
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NOT NULL AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs (
      admin_id,
      action,
      target_user_id,
      old_value,
      new_value,
      ip_address
    ) VALUES (
      v_admin_id,
      'role_changed',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      inet_client_addr()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER audit_role_changes
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION log_role_change();
```

#### Trigger 3: User Deletion (Soft Delete)

```sql
-- Function to log user deletions
CREATE OR REPLACE FUNCTION log_user_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (
      admin_id,
      action,
      target_user_id,
      old_value,
      new_value,
      ip_address
    ) VALUES (
      v_admin_id,
      'user_deleted',
      NEW.id,
      jsonb_build_object('active', true),
      jsonb_build_object('deleted_at', NEW.deleted_at),
      inet_client_addr()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER audit_user_deletions
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION log_user_deletion();
```

#### Trigger 4: MFA Status Change

```sql
-- Function to log MFA status changes
CREATE OR REPLACE FUNCTION log_mfa_change()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
  v_action TEXT;
BEGIN
  v_admin_id := auth.uid();

  IF OLD.mfa_enabled IS DISTINCT FROM NEW.mfa_enabled THEN
    v_action := CASE WHEN NEW.mfa_enabled THEN 'mfa_enabled' ELSE 'mfa_disabled' END;

    INSERT INTO audit_logs (
      admin_id,
      action,
      target_user_id,
      old_value,
      new_value,
      ip_address
    ) VALUES (
      v_admin_id,
      v_action,
      NEW.id,
      jsonb_build_object('mfa_enabled', OLD.mfa_enabled),
      jsonb_build_object('mfa_enabled', NEW.mfa_enabled),
      inet_client_addr()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER audit_mfa_changes
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.mfa_enabled IS DISTINCT FROM NEW.mfa_enabled)
EXECUTE FUNCTION log_mfa_change();
```

### Database Functions for Complex Queries

#### Function 1: Search Users

```sql
-- Function for full-text search
CREATE OR REPLACE FUNCTION search_users(
  search_query TEXT,
  role_filter TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT 'active',
  sort_by TEXT DEFAULT 'created_at',
  sort_order TEXT DEFAULT 'desc',
  page_num INT DEFAULT 1,
  page_size INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  email TEXT,
  display_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_users AS (
    SELECT
      p.id,
      p.username,
      p.email,
      p.display_name,
      p.role,
      p.created_at,
      p.last_login,
      p.deleted_at,
      p.mfa_enabled,
      COUNT(*) OVER() AS total_count
    FROM profiles p
    WHERE
      (search_query IS NULL OR search_query = '' OR
       to_tsvector('english', p.username || ' ' || COALESCE(p.display_name, '') || ' ' || p.email)
       @@ plainto_tsquery('english', search_query))
      AND (role_filter IS NULL OR p.role = role_filter)
      AND (
        (status_filter = 'active' AND p.deleted_at IS NULL) OR
        (status_filter = 'deleted' AND p.deleted_at IS NOT NULL) OR
        (status_filter = 'all')
      )
  )
  SELECT * FROM filtered_users
  ORDER BY
    CASE WHEN sort_by = 'username' AND sort_order = 'asc' THEN username END ASC,
    CASE WHEN sort_by = 'username' AND sort_order = 'desc' THEN username END DESC,
    CASE WHEN sort_by = 'email' AND sort_order = 'asc' THEN email END ASC,
    CASE WHEN sort_by = 'email' AND sort_order = 'desc' THEN email END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'asc' THEN created_at END ASC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'desc' THEN created_at END DESC,
    CASE WHEN sort_by = 'last_login' AND sort_order = 'asc' THEN last_login END ASC,
    CASE WHEN sort_by = 'last_login' AND sort_order = 'desc' THEN last_login END DESC
  LIMIT page_size
  OFFSET (page_num - 1) * page_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## API Architecture

### API Design Principles

1. **RESTful:** Standard HTTP methods (GET, POST, PATCH, DELETE)
2. **Idempotent:** Same request produces same result
3. **Type-Safe:** TypeScript for all request/response schemas
4. **Validated:** Zod schemas for all inputs
5. **Rate-Limited:** Per-endpoint rate limits
6. **Audited:** All mutations logged to audit_logs

### API Endpoints

#### 1. GET /api/admin/users

**Purpose:** List all users with search, filter, sort, pagination

**Auth:** Admin or Super Admin

**Query Parameters:**
```typescript
interface UsersQueryParams {
  page?: number // Default: 1
  limit?: number // Default: 50, Max: 100
  search?: string // Search username, email, display_name
  role?: 'user' | 'admin' | 'super_admin'
  status?: 'active' | 'deleted' | 'all' // Default: 'active'
  sort?: 'username' | 'email' | 'created_at' | 'last_login' // Default: 'created_at'
  order?: 'asc' | 'desc' // Default: 'desc'
}
```

**Response:**
```typescript
interface UsersResponse {
  users: Array<{
    id: string
    username: string
    email: string
    display_name: string | null
    role: 'user' | 'admin' | 'super_admin'
    created_at: string // ISO 8601
    last_login: string | null // ISO 8601
    deleted_at: string | null // ISO 8601
    mfa_enabled: boolean
  }>
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}
```

**Rate Limit:** 60 requests per minute per admin

**Implementation:**
```typescript
// app/api/admin/users/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  role: z.enum(['user', 'admin', 'super_admin']).optional(),
  status: z.enum(['active', 'deleted', 'all']).default('active'),
  sort: z.enum(['username', 'email', 'created_at', 'last_login']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1. Authenticate
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Authorize (check role)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Validate query params
  const { searchParams } = new URL(request.url)
  const params = querySchema.parse(Object.fromEntries(searchParams))

  // 4. Query database using search_users function
  const { data: users, error } = await supabase.rpc('search_users', {
    search_query: params.search || null,
    role_filter: params.role || null,
    status_filter: params.status,
    sort_by: params.sort,
    sort_order: params.order,
    page_num: params.page,
    page_size: params.limit,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 5. Format response
  const total = users.length > 0 ? users[0].total_count : 0
  const total_pages = Math.ceil(total / params.limit)

  return NextResponse.json({
    users: users.map(({ total_count, ...user }) => user),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      total_pages,
    },
  })
}
```

---

#### 2. PATCH /api/admin/users/[userId] (Server Action)

**Purpose:** Update user profile (username, email, display_name)

**Auth:** Admin or Super Admin

**Request Body:**
```typescript
interface UpdateUserRequest {
  username?: string // 3-20 chars, alphanumeric + underscore
  email?: string // Valid email
  display_name?: string // 1-50 chars
}
```

**Response:**
```typescript
interface UpdateUserResponse {
  success: true
  user: {
    id: string
    username: string
    email: string
    display_name: string | null
  }
  audit_log_id: string
}
```

**Rate Limit:** 100 requests per hour per admin

**Implementation:**
```typescript
// actions/admin-actions.ts
'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const updateUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().email().optional(),
  display_name: z.string().min(1).max(50).optional(),
})

export async function updateUser(userId: string, data: unknown) {
  const supabase = createServerActionClient({ cookies })

  // 1. Authenticate
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }

  // 2. Authorize
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Forbidden: Admin role required')
  }

  // 3. Prevent editing own account
  if (userId === session.user.id) {
    throw new Error('Cannot edit own account via admin panel')
  }

  // 4. Validate input
  const validated = updateUserSchema.parse(data)

  // 5. Get old user data (for audit log)
  const { data: oldUser } = await supabase
    .from('profiles')
    .select('username, email, display_name')
    .eq('id', userId)
    .single()

  if (!oldUser) {
    throw new Error('User not found')
  }

  // 6. Update user
  const { data: updatedUser, error } = await supabase
    .from('profiles')
    .update(validated)
    .eq('id', userId)
    .select('id, username, email, display_name')
    .single()

  if (error) {
    throw new Error(`Update failed: ${error.message}`)
  }

  // 7. Create audit log (manual, in addition to trigger)
  const { data: auditLog } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: session.user.id,
      action: 'user_updated',
      target_user_id: userId,
      old_value: oldUser,
      new_value: validated,
    })
    .select('id')
    .single()

  // 8. Revalidate user list page
  revalidatePath('/admin/users')

  return {
    success: true,
    user: updatedUser,
    audit_log_id: auditLog.id,
  }
}
```

---

#### 3. POST /api/admin/users/[userId]/reset-password (Server Action)

**Purpose:** Reset user password (temporary or custom)

**Auth:** Admin or Super Admin

**Request Body:**
```typescript
interface ResetPasswordRequest {
  type: 'temporary' | 'custom'
  password?: string // Required if type='custom'
}
```

**Response:**
```typescript
interface ResetPasswordResponse {
  success: true
  temporary_password?: string // Only if type='temporary'
  expires_at?: string // ISO 8601, 24 hours from now
  audit_log_id: string
}
```

**Rate Limit:** 20 requests per hour per admin

**Implementation:**
```typescript
// actions/admin-actions.ts
'use server'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const resetPasswordSchema = z.object({
  type: z.enum(['temporary', 'custom']),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).optional(),
}).refine(
  (data) => data.type === 'temporary' || (data.type === 'custom' && data.password),
  { message: 'Password required for custom type' }
)

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

export async function resetUserPassword(userId: string, data: unknown) {
  const supabase = createServerActionClient({ cookies })

  // 1. Authenticate and authorize
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Forbidden')
  }

  // 2. Validate input
  const validated = resetPasswordSchema.parse(data)

  // 3. Check target user role (cannot reset super_admin unless you are super_admin)
  const { data: targetUser } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
    .single()

  if (!targetUser) throw new Error('User not found')

  if (targetUser.role === 'super_admin' && profile.role !== 'super_admin') {
    throw new Error('Only super_admin can reset super_admin password')
  }

  // 4. Generate password
  const password = validated.type === 'temporary'
    ? generateTemporaryPassword()
    : validated.password!

  // 5. Update password using Supabase Admin API
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-side only
  )

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
    ...(validated.type === 'temporary' && {
      user_metadata: {
        password_reset_required: true,
        password_reset_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    }),
  })

  if (error) throw new Error(`Password reset failed: ${error.message}`)

  // 6. Send email notification
  // (Supabase handles this automatically if email template configured)

  // 7. Create audit log
  const { data: auditLog } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: session.user.id,
      action: 'password_reset',
      target_user_id: userId,
      new_value: { type: validated.type },
    })
    .select('id')
    .single()

  return {
    success: true,
    ...(validated.type === 'temporary' && {
      temporary_password: password,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
    audit_log_id: auditLog.id,
  }
}
```

---

#### 4. DELETE /api/admin/users/[userId] (Server Action - Soft Delete)

**Purpose:** Soft delete user account

**Auth:** Admin or Super Admin

**Request Body:**
```typescript
interface SoftDeleteRequest {
  reason?: string // Optional reason for deletion
}
```

**Response:**
```typescript
interface SoftDeleteResponse {
  success: true
  deleted_at: string // ISO 8601
  audit_log_id: string
  message: string
}
```

**Rate Limit:** 50 requests per hour per admin

**Implementation:**
```typescript
// actions/admin-actions.ts
'use server'

export async function softDeleteUser(userId: string, reason?: string) {
  const supabase = createServerActionClient({ cookies })

  // 1. Authenticate and authorize
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Forbidden')
  }

  // 2. Prevent deleting own account
  if (userId === session.user.id) {
    throw new Error('Cannot delete own account')
  }

  // 3. Check target user role
  const { data: targetUser } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (!targetUser) throw new Error('User not found')

  if (targetUser.role === 'super_admin' && profile.role !== 'super_admin') {
    throw new Error('Only super_admin can delete super_admin')
  }

  // 4. Soft delete (set deleted_at)
  const deletedAt = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({ deleted_at: deletedAt })
    .eq('id', userId)

  if (error) throw new Error(`Soft delete failed: ${error.message}`)

  // 5. Create audit log
  const { data: auditLog } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: session.user.id,
      action: 'user_deleted',
      target_user_id: userId,
      old_value: { active: true },
      new_value: { deleted_at: deletedAt, reason },
    })
    .select('id')
    .single()

  // 6. Revalidate
  revalidatePath('/admin/users')

  return {
    success: true,
    deleted_at: deletedAt,
    audit_log_id: auditLog.id,
    message: 'User soft deleted. Can be restored within 30 days.',
  }
}
```

---

#### 5. DELETE /api/admin/users/[userId]/permanent (Server Action)

**Purpose:** Permanently delete user account (GDPR compliance)

**Auth:** Super Admin only

**Query Params:**
```typescript
interface PermanentDeleteQuery {
  confirm: 'DELETE' // Required confirmation
}
```

**Response:**
```typescript
interface PermanentDeleteResponse {
  success: true
  user_id: string
  audit_log_id: string
  message: string
}
```

**Rate Limit:** 10 requests per hour per admin

**Implementation:**
```typescript
// actions/admin-actions.ts
'use server'

export async function permanentDeleteUser(userId: string, confirmation: string) {
  const supabase = createServerActionClient({ cookies })

  // 1. Authenticate and authorize (super_admin only)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    throw new Error('Forbidden: Only super_admin can permanently delete users')
  }

  // 2. Validate confirmation
  if (confirmation !== 'DELETE') {
    throw new Error('Invalid confirmation. Type DELETE to confirm.')
  }

  // 3. Check user was soft deleted > 30 days ago
  const { data: targetUser } = await supabase
    .from('profiles')
    .select('deleted_at, username, email')
    .eq('id', userId)
    .single()

  if (!targetUser) throw new Error('User not found')

  if (!targetUser.deleted_at) {
    throw new Error('User must be soft deleted first')
  }

  const deletedDate = new Date(targetUser.deleted_at)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  if (deletedDate > thirtyDaysAgo) {
    throw new Error('User must be soft deleted for at least 30 days before permanent deletion')
  }

  // 4. Create audit log BEFORE deletion (important for compliance)
  const { data: auditLog } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: session.user.id,
      action: 'permanent_delete',
      target_user_id: userId,
      old_value: {
        user_id: userId,
        username: targetUser.username,
        email: targetUser.email,
      },
    })
    .select('id')
    .single()

  // 5. Delete from auth.users (Supabase Admin API)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (authError) throw new Error(`Auth deletion failed: ${authError.message}`)

  // 6. Delete from profiles (CASCADE will delete user's posts, comments, votes)
  const { error: dbError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (dbError) throw new Error(`Database deletion failed: ${dbError.message}`)

  // 7. Revalidate
  revalidatePath('/admin/users')

  return {
    success: true,
    user_id: userId,
    audit_log_id: auditLog.id,
    message: `User permanently deleted. User ID: ${userId} (save for records)`,
  }
}
```

---

#### 6. PATCH /api/admin/users/[userId]/role (Server Action)

**Purpose:** Change user role (promote/demote admin)

**Auth:** Super Admin only

**Request Body:**
```typescript
interface ChangeRoleRequest {
  role: 'user' | 'admin' // super_admin excluded (database only)
}
```

**Response:**
```typescript
interface ChangeRoleResponse {
  success: true
  old_role: string
  new_role: string
  audit_log_id: string
}
```

**Rate Limit:** 30 requests per hour per admin

**Implementation:**
```typescript
// actions/admin-actions.ts
'use server'

export async function changeUserRole(userId: string, newRole: 'user' | 'admin') {
  const supabase = createServerActionClient({ cookies })

  // 1. Authenticate and authorize (super_admin only)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    throw new Error('Forbidden: Only super_admin can change roles')
  }

  // 2. Prevent changing own role
  if (userId === session.user.id) {
    throw new Error('Cannot change own role')
  }

  // 3. Get target user
  const { data: targetUser } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
    .single()

  if (!targetUser) throw new Error('User not found')

  // 4. Check last super_admin constraint
  if (targetUser.role === 'super_admin') {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'super_admin')

    if (count === 1) {
      throw new Error('Cannot demote the last super_admin')
    }
  }

  // 5. Update role
  const { error } = await supabase
    .from('profiles')
    .update({
      role: newRole,
      ...(newRole === 'admin' && { mfa_enforced_at: new Date().toISOString() }),
    })
    .eq('id', userId)

  if (error) throw new Error(`Role change failed: ${error.message}`)

  // 6. Invalidate user session (force re-login to get new role in JWT)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  await supabaseAdmin.auth.admin.signOut(userId)

  // 7. Send email notification
  // TODO: Implement email notification

  // 8. Create audit log
  const { data: auditLog } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: session.user.id,
      action: 'role_changed',
      target_user_id: userId,
      old_value: { role: targetUser.role },
      new_value: { role: newRole },
    })
    .select('id')
    .single()

  // 9. Revalidate
  revalidatePath('/admin/users')

  return {
    success: true,
    old_role: targetUser.role,
    new_role: newRole,
    audit_log_id: auditLog.id,
  }
}
```

---

#### 7. GET /api/admin/audit-logs

**Purpose:** View audit log with filtering

**Auth:** Admin or Super Admin

**Query Parameters:**
```typescript
interface AuditLogsQueryParams {
  page?: number // Default: 1
  limit?: number // Default: 100, Max: 500
  action?: string // Filter by action type
  admin?: string // Filter by admin ID
  target?: string // Filter by target user ID
  from?: string // ISO 8601 timestamp
  to?: string // ISO 8601 timestamp
}
```

**Response:**
```typescript
interface AuditLogsResponse {
  logs: Array<{
    id: string
    timestamp: string // ISO 8601
    admin: {
      id: string
      username: string
    } | null
    action: string
    target_user: {
      id: string
      username: string
    } | null
    old_value: Record<string, any> | null
    new_value: Record<string, any> | null
    ip_address: string | null
    user_agent: string | null
  }>
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}
```

**Rate Limit:** 100 requests per minute per admin

**Implementation:**
```typescript
// app/api/admin/audit-logs/route.ts
export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1. Authenticate and authorize
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse query params
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const action = searchParams.get('action')
  const admin = searchParams.get('admin')
  const target = searchParams.get('target')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // 3. Build query
  let query = supabase
    .from('audit_logs')
    .select(`
      id,
      timestamp,
      admin:admin_id(id, username),
      action,
      target_user:target_user_id(id, username),
      old_value,
      new_value,
      ip_address,
      user_agent
    `, { count: 'exact' })

  if (action) query = query.eq('action', action)
  if (admin) query = query.eq('admin_id', admin)
  if (target) query = query.eq('target_user_id', target)
  if (from) query = query.gte('timestamp', from)
  if (to) query = query.lte('timestamp', to)

  const { data: logs, error, count } = await query
    .order('timestamp', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  })
}
```

---

#### 8. GET /api/admin/audit-logs/export

**Purpose:** Export audit logs to CSV

**Auth:** Admin or Super Admin

**Query Parameters:** Same as GET /api/admin/audit-logs

**Response:** CSV file download

**Rate Limit:** 10 requests per hour per admin

**Implementation:**
```typescript
// app/api/admin/audit-logs/export/route.ts
export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1. Authenticate and authorize (same as GET /api/admin/audit-logs)
  // ... (omitted for brevity)

  // 2. Query all matching logs (no pagination for export)
  const { data: logs } = await supabase
    .from('audit_logs')
    .select(`
      timestamp,
      admin:admin_id(username),
      action,
      target_user:target_user_id(username),
      old_value,
      new_value,
      ip_address
    `)
    .order('timestamp', { ascending: false })
    .limit(10000) // Max 10k rows per export

  // 3. Convert to CSV
  const csvRows = [
    // Header
    'Timestamp,Admin,Action,Target User,Old Value,New Value,IP Address',
    // Data rows
    ...logs.map(log => [
      log.timestamp,
      log.admin?.username || 'N/A',
      log.action,
      log.target_user?.username || 'N/A',
      JSON.stringify(log.old_value || {}),
      JSON.stringify(log.new_value || {}),
      log.ip_address || 'N/A',
    ].map(field => `"${field}"`).join(',')),
  ].join('\n')

  // 4. Return CSV file
  return new Response(csvRows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString()}.csv"`,
    },
  })
}
```

---

### Middleware Stack

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // 1. Authentication Check
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (session) {
    // 2. RBAC Check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, deleted_at, mfa_enabled, mfa_enforced_at')
      .eq('id', session.user.id)
      .single()

    // Check if user is deleted
    if (profile?.deleted_at) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=account_deleted', req.url))
    }

    // Check if admin/super_admin trying to access admin panel
    if (req.nextUrl.pathname.startsWith('/admin')) {
      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return NextResponse.redirect(new URL('/403', req.url))
      }

      // 3. MFA Enforcement
      const mfaEnforcedAt = profile.mfa_enforced_at ? new Date(profile.mfa_enforced_at) : null
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      if (!profile.mfa_enabled && mfaEnforcedAt && mfaEnforcedAt < sevenDaysAgo) {
        // Grace period expired, block access
        return NextResponse.redirect(new URL('/admin/setup-mfa?required=true', req.url))
      }
    }

    // 4. Update last_login
    if (req.nextUrl.pathname === '/login') {
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', session.user.id)
    }
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/login', '/api/admin/:path*'],
}
```

---

### Error Handling Strategy

```typescript
// lib/errors.ts
export class AdminError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message)
    this.name = 'AdminError'
  }
}

export const AdminErrors = {
  Unauthorized: () => new AdminError('Unauthorized', 'UNAUTHORIZED', 401),
  Forbidden: (msg = 'Forbidden') => new AdminError(msg, 'FORBIDDEN', 403),
  NotFound: (resource: string) => new AdminError(`${resource} not found`, 'NOT_FOUND', 404),
  ValidationError: (msg: string) => new AdminError(msg, 'VALIDATION_ERROR', 400),
  RateLimitExceeded: () => new AdminError('Rate limit exceeded', 'RATE_LIMIT', 429),
  InternalError: (msg: string) => new AdminError(msg, 'INTERNAL_ERROR', 500),
}

// Usage in Server Actions
export async function updateUser(userId: string, data: unknown) {
  try {
    const validated = updateUserSchema.parse(data)
    // ... rest of logic
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw AdminErrors.ValidationError(error.errors[0].message)
    }
    if (error instanceof AdminError) {
      throw error
    }
    throw AdminErrors.InternalError((error as Error).message)
  }
}
```

---

## Security Architecture

### 1. Authentication Flow

```
1. User enters credentials
   ↓
2. Supabase Auth validates credentials
   ↓
3. If valid, Supabase returns JWT (access_token + refresh_token)
   ↓
4. JWT contains user claims: { sub: user_id, email, role }
   ↓
5. Client stores tokens in httpOnly cookies (secure)
   ↓
6. Every request includes JWT in Authorization header
   ↓
7. Middleware validates JWT signature
   ↓
8. Middleware checks role claim (admin or super_admin)
   ↓
9. Middleware checks MFA status (if admin)
   ↓
10. If all checks pass, request proceeds
```

### 2. Authorization Model (RBAC)

```
Role Hierarchy:
  super_admin (highest privilege)
    ├── Can do everything admin can do
    ├── Can change user roles (promote/demote admins)
    ├── Can permanently delete users
    └── Can disable MFA for other admins (emergency access)

  admin (medium privilege)
    ├── Can view all users
    ├── Can edit user profiles (except own critical fields)
    ├── Can reset passwords
    ├── Can soft delete users
    ├── Can view audit logs
    └── Cannot change roles, cannot permanent delete

  user (default, low privilege)
    ├── Can view own profile
    ├── Can edit own profile
    ├── Can create posts/comments
    └── Cannot access admin panel
```

### 3. Multi-Factor Authentication (MFA)

**Implementation Strategy:**
- Use Supabase MFA API (TOTP via authenticator apps)
- QR code generation for easy setup
- 10 recovery codes per user (bcrypt hashed)
- 7-day grace period for new admins
- Automatic enforcement after grace period expires

**MFA Flow:**
```
1. Admin promoted to admin/super_admin
   ↓
2. mfa_enforced_at = NOW() (start 7-day grace period)
   ↓
3. Admin sees banner: "MFA Required - Enable within 7 days"
   ↓
4. Admin clicks "Setup MFA"
   ↓
5. Server generates TOTP secret (Supabase MFA API)
   ↓
6. Server generates QR code (otpauth:// URI)
   ↓
7. Admin scans QR code with authenticator app (Google Authenticator, Authy, etc.)
   ↓
8. Admin enters 6-digit code to verify
   ↓
9. Server validates code (Supabase MFA API)
   ↓
10. If valid:
    - mfa_enabled = true
    - Generate 10 recovery codes (bcrypt hashed)
    - Display recovery codes ONCE (must save)
   ↓
11. Future logins require:
    - Username + password (first factor)
    - 6-digit TOTP code (second factor)
```

**Database Schema:**
```sql
-- Supabase handles TOTP secrets internally
-- We only track MFA status in profiles table

-- Recovery codes table
CREATE TABLE mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  code_hash TEXT NOT NULL, -- bcrypt($2a$10$...)
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Implementation:**
```typescript
// actions/mfa-actions.ts
'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import bcrypt from 'bcryptjs'

export async function enrollMFA() {
  const supabase = createServerActionClient({ cookies })

  // 1. Check authentication
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  // 2. Enroll MFA (Supabase generates TOTP secret)
  const { data: { id: factorId, totp: { qr_code, secret } }, error } =
    await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    })

  if (error) throw error

  // 3. Return QR code and secret (for manual entry)
  return { factorId, qr_code, secret }
}

export async function verifyMFAEnrollment(factorId: string, code: string) {
  const supabase = createServerActionClient({ cookies })

  // 1. Verify TOTP code
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  })

  if (error) throw new Error('Invalid code')

  // 2. Generate recovery codes
  const recoveryCodes = Array.from({ length: 10 }, () =>
    Math.random().toString(36).slice(2, 10).toUpperCase()
  )

  // 3. Hash and store recovery codes
  for (const code of recoveryCodes) {
    const hash = await bcrypt.hash(code, 10)
    await supabase.from('mfa_recovery_codes').insert({
      user_id: session.user.id,
      code_hash: hash,
    })
  }

  // 4. Update profile
  await supabase
    .from('profiles')
    .update({ mfa_enabled: true })
    .eq('id', session.user.id)

  // 5. Return recovery codes (ONLY shown once)
  return { success: true, recoveryCodes }
}
```

### 4. Audit Logging Mechanism

**Strategy:** Database triggers + Application-level logging (hybrid approach)

**Database Triggers:**
- Automatically log all UPDATE operations on profiles table
- Cannot be bypassed (even if developer forgets)
- Captures old_value and new_value automatically

**Application-Level Logging:**
- For actions not captured by triggers (e.g., password reset via Admin API)
- Provides additional context (IP address, User-Agent from request headers)

**Audit Log Data Model:**
```typescript
interface AuditLog {
  id: string
  timestamp: string // ISO 8601
  admin_id: string // Who performed the action
  action: 'user_updated' | 'password_reset' | 'role_changed' | 'user_deleted' | 'permanent_delete' | 'mfa_enabled' | 'mfa_disabled'
  target_user_id: string // Who was affected
  old_value: Record<string, any> | null // Previous state
  new_value: Record<string, any> | null // New state
  ip_address: string | null // IPv4/IPv6
  user_agent: string | null // Browser info
}
```

**Immutability:**
- No UPDATE or DELETE RLS policies on audit_logs table
- Only INSERT and SELECT allowed
- Retention: 2 years (automated cleanup job)

### 5. Session Management

**Admin Session Configuration:**
- Session duration: 8 hours (shorter than regular users)
- Refresh token rotation: Enabled (new refresh token on every refresh)
- Concurrent sessions: Allowed (same admin can be logged in on multiple devices)
- Session invalidation: On role change (force re-login to get new JWT with updated role)

**Implementation:**
```typescript
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce', // Use PKCE flow for security
    },
  }
)

// Admin session duration (set in Supabase dashboard)
// JWT expiry: 8 hours
// Refresh token expiry: 30 days
```

---

## Frontend Architecture

### Page Structure

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx              # Login page
│   └── signup/
│       └── page.tsx              # Signup page
├── (admin)/
│   └── admin/
│       ├── layout.tsx            # Admin layout (sidebar, header)
│       ├── page.tsx              # Admin dashboard (redirect to /admin/users)
│       ├── users/
│       │   ├── page.tsx          # User list (Server Component)
│       │   ├── [userId]/
│       │   │   ├── page.tsx      # User detail page
│       │   │   └── edit/
│       │   │       └── page.tsx  # User edit form
│       │   └── components/
│       │       ├── UserList.tsx  # Server Component
│       │       ├── UserSearch.tsx # Client Component
│       │       ├── UserFilters.tsx # Client Component
│       │       ├── UserRow.tsx   # Server Component
│       │       └── UserActions.tsx # Client Component
│       ├── audit-logs/
│       │   ├── page.tsx          # Audit log list (Server Component)
│       │   └── components/
│       │       ├── AuditLogList.tsx
│       │       ├── AuditLogFilters.tsx
│       │       └── ExportButton.tsx
│       └── setup-mfa/
│           └── page.tsx          # MFA setup page
└── api/
    └── admin/
        ├── users/
        │   └── route.ts          # GET /api/admin/users
        ├── audit-logs/
        │   ├── route.ts          # GET /api/admin/audit-logs
        │   └── export/
        │       └── route.ts      # GET /api/admin/audit-logs/export
        └── health/
            └── route.ts          # Health check
```

### Component Hierarchy

```
AdminLayout (Server Component)
├── Sidebar (Server Component)
│   ├── Logo
│   ├── Navigation Links
│   │   ├── Users
│   │   ├── Audit Logs
│   │   └── Settings
│   └── User Menu
│       ├── Profile
│       ├── MFA Status
│       └── Logout
└── Main Content
    └── {children}

UsersPage (Server Component)
├── PageHeader
│   ├── Title: "User Management"
│   ├── UserSearch (Client Component)
│   └── UserFilters (Client Component)
├── UserList (Server Component)
│   └── For each user:
│       └── UserRow (Server Component)
│           ├── User Info (username, email, role, status)
│           └── UserActions (Client Component)
│               ├── Edit Button
│               ├── Reset Password Button
│               ├── Change Role Button (super_admin only)
│               └── Delete Button
└── Pagination (Client Component)

UserEditPage (Server Component)
├── PageHeader
│   ├── Back Button
│   └── Title: "Edit User: @username"
├── UserEditForm (Client Component)
│   ├── Username Input (validated)
│   ├── Email Input (validated)
│   ├── Display Name Input (validated)
│   ├── Cancel Button
│   └── Save Button (calls Server Action)
└── DangerZone (Client Component)
    ├── Reset Password (Dialog)
    ├── Change Role (Dialog, super_admin only)
    └── Delete Account (Dialog)

AuditLogsPage (Server Component)
├── PageHeader
│   ├── Title: "Audit Logs"
│   ├── AuditLogFilters (Client Component)
│   └── ExportButton (Client Component)
├── AuditLogList (Server Component)
│   └── For each log:
│       └── AuditLogRow (Server Component)
│           ├── Timestamp
│           ├── Admin (username)
│           ├── Action (badge)
│           ├── Target User (username)
│           └── Details (expandable)
└── Pagination (Client Component)
```

### State Management

**Server Components (Default):**
- No client-side state
- Data fetched directly from database
- Passed as props to client components

**Client Components (Interactive):**
- React Hook Form for form state
- Zustand for UI state (search filters, pagination)
- TanStack Query for optimistic updates (optional)

**Example: User Search State**
```typescript
// stores/admin-store.ts
import { create } from 'zustand'

interface AdminStore {
  search: string
  roleFilter: string | null
  statusFilter: 'active' | 'deleted' | 'all'
  setSearch: (search: string) => void
  setRoleFilter: (role: string | null) => void
  setStatusFilter: (status: 'active' | 'deleted' | 'all') => void
}

export const useAdminStore = create<AdminStore>((set) => ({
  search: '',
  roleFilter: null,
  statusFilter: 'active',
  setSearch: (search) => set({ search }),
  setRoleFilter: (roleFilter) => set({ roleFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}))
```

```tsx
// components/UserSearch.tsx (Client Component)
'use client'

import { useAdminStore } from '@/stores/admin-store'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDebouncedCallback } from 'use-debounce'

export function UserSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { search, setSearch } = useAdminStore()

  const handleSearch = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('search', value)
    } else {
      params.delete('search')
    }
    params.set('page', '1') // Reset to page 1
    router.push(`/admin/users?${params.toString()}`)
  }, 300)

  return (
    <input
      type="search"
      placeholder="Search users..."
      value={search}
      onChange={(e) => {
        setSearch(e.target.value)
        handleSearch(e.target.value)
      }}
      className="..."
    />
  )
}
```

### Form Validation Strategy

**Client-Side Validation:**
- React Hook Form + Zod resolver
- Real-time validation (on blur)
- Inline error messages

**Server-Side Validation:**
- Zod schema validation in Server Actions
- Database constraints (unique username, unique email)
- Business logic validation (cannot edit own account, cannot delete last super_admin)

**Example: User Edit Form**
```tsx
// components/UserEditForm.tsx (Client Component)
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateUserSchema, type UpdateUserInput } from '@/schemas/admin'
import { updateUser } from '@/actions/admin-actions'
import { toast } from 'sonner'

interface UserEditFormProps {
  user: {
    id: string
    username: string
    email: string
    display_name: string | null
  }
}

export function UserEditForm({ user }: UserEditFormProps) {
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      username: user.username,
      email: user.email,
      display_name: user.display_name || '',
    },
  })

  const onSubmit = async (data: UpdateUserInput) => {
    try {
      const result = await updateUser(user.id, data)
      toast.success('User updated successfully')
      // Optionally redirect to user list
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          {...form.register('username')}
          className="..."
        />
        {form.formState.errors.username && (
          <p className="text-red-500">{form.formState.errors.username.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...form.register('email')}
          className="..."
        />
        {form.formState.errors.email && (
          <p className="text-red-500">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="display_name">Display Name</label>
        <input
          id="display_name"
          {...form.register('display_name')}
          className="..."
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  )
}
```

### Error Handling and User Feedback

**Toast Notifications:**
- Success: Green toast (user updated, role changed, password reset)
- Error: Red toast (validation error, permission denied, server error)
- Info: Blue toast (MFA setup instructions, grace period reminder)

**Inline Errors:**
- Form validation errors below input fields
- API errors in modal dialogs

**Confirmation Dialogs:**
- Soft delete: "Are you sure you want to delete @username?"
- Permanent delete: "PERMANENT DELETE - Type 'DELETE' to confirm"
- Role change: "Promote @username to admin?"

**Implementation:**
```tsx
// components/DeleteUserDialog.tsx (Client Component)
'use client'

import { useState } from 'react'
import { softDeleteUser } from '@/actions/admin-actions'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteUserDialogProps {
  user: { id: string; username: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteUserDialog({ user, open, onOpenChange }: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await softDeleteUser(user.id)
      toast.success(`User @${user.username} deleted successfully`)
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete @{user.username}? This action can be reversed within 30 days.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## Performance Architecture

### 1. Pagination Strategy

**Offset-Based Pagination (MVP):**
- Simple to implement
- Supports "Go to page N"
- Works well for < 10,000 users

```sql
SELECT * FROM profiles
ORDER BY created_at DESC
LIMIT 50 OFFSET 0; -- Page 1

SELECT * FROM profiles
ORDER BY created_at DESC
LIMIT 50 OFFSET 50; -- Page 2
```

**Cursor-Based Pagination (Future Optimization):**
- O(log n) performance (uses index)
- No skipped/duplicate rows
- Better for > 10,000 users

```sql
SELECT * FROM profiles
WHERE created_at < '2023-01-01T00:00:00Z'
ORDER BY created_at DESC
LIMIT 50;
```

### 2. Database Query Optimization

**Indexes:**
```sql
-- User list page
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);

-- Search
CREATE INDEX idx_profiles_search ON profiles
  USING gin(to_tsvector('english', username || ' ' || COALESCE(display_name, '') || ' ' || email));

-- Audit logs
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

**Query Optimization:**
- Use database function for complex queries (search_users)
- Avoid N+1 queries (JOIN admin and target_user in audit logs)
- Use COUNT(*) OVER() for total count (single query instead of two)

### 3. Caching Strategy

**Static Pages (Server Components):**
- Cached by Next.js automatically
- Revalidated on mutation (revalidatePath)

**API Routes:**
- No caching (admin data changes frequently)
- Consider Redis cache for audit logs export (large dataset)

**Client-Side Caching:**
- React Query (optional) for optimistic updates
- Stale-while-revalidate pattern

### 4. Rate Limiting

**Implementation:**
```typescript
// lib/rate-limit.ts
import { LRUCache } from 'lru-cache'

type RateLimitConfig = {
  interval: number // milliseconds
  uniqueTokenPerInterval: number
}

export function rateLimit(config: RateLimitConfig) {
  const tokenCache = new LRUCache({
    max: config.uniqueTokenPerInterval || 500,
    ttl: config.interval || 60000,
  })

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = (tokenCache.get(token) as number[]) || [0]
        if (tokenCount[0] === 0) {
          tokenCache.set(token, [1])
        }
        tokenCount[0] += 1

        const currentUsage = tokenCount[0]
        const isRateLimited = currentUsage >= limit

        return isRateLimited ? reject() : resolve()
      }),
  }
}

// Usage in API route
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
})

export async function GET(request: Request) {
  try {
    await limiter.check(60, request.headers.get('x-forwarded-for') || 'anonymous')
  } catch {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // ... rest of handler
}
```

**Rate Limits Per Endpoint:**
- GET /api/admin/users: 60 req/min
- GET /api/admin/audit-logs: 100 req/min
- PATCH /api/admin/users/:id: 100 req/hour
- POST /api/admin/users/:id/reset-password: 20 req/hour
- DELETE /api/admin/users/:id: 50 req/hour
- DELETE /api/admin/users/:id/permanent: 10 req/hour
- PATCH /api/admin/users/:id/role: 30 req/hour
- GET /api/admin/audit-logs/export: 10 req/hour

---

## Testing Strategy

### 1. Unit Tests (Vitest)

**What to Test:**
- Schema validation (Zod schemas)
- Business logic functions (role checks, authorization guards)
- Utility functions (pagination, CSV export)

**Example:**
```typescript
// __tests__/schemas/admin.test.ts
import { describe, it, expect } from 'vitest'
import { updateUserSchema } from '@/schemas/admin'

describe('updateUserSchema', () => {
  it('should validate valid username', () => {
    const result = updateUserSchema.parse({ username: 'valid_user123' })
    expect(result.username).toBe('valid_user123')
  })

  it('should reject username with special chars', () => {
    expect(() => updateUserSchema.parse({ username: 'invalid-user!' }))
      .toThrow()
  })

  it('should reject username < 3 chars', () => {
    expect(() => updateUserSchema.parse({ username: 'ab' }))
      .toThrow()
  })
})
```

### 2. Integration Tests (Vitest + Supabase)

**What to Test:**
- Database queries
- RLS policies
- Database triggers
- Server Actions

**Example:**
```typescript
// __tests__/actions/admin-actions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { updateUser } from '@/actions/admin-actions'
import { createTestUser, createTestAdmin, cleanupTestData } from '@/test-utils'

describe('updateUser', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  it('should allow admin to update user', async () => {
    const admin = await createTestAdmin({ role: 'admin' })
    const user = await createTestUser()

    const result = await updateUser(user.id, {
      username: 'new_username',
    })

    expect(result.success).toBe(true)
    expect(result.user.username).toBe('new_username')
  })

  it('should prevent admin from editing own account', async () => {
    const admin = await createTestAdmin({ role: 'admin' })

    await expect(updateUser(admin.id, { username: 'new' }))
      .rejects.toThrow('Cannot edit own account')
  })

  it('should create audit log entry', async () => {
    const admin = await createTestAdmin({ role: 'admin' })
    const user = await createTestUser()

    const result = await updateUser(user.id, { username: 'new_username' })

    const auditLog = await supabase
      .from('audit_logs')
      .select()
      .eq('id', result.audit_log_id)
      .single()

    expect(auditLog.data).toMatchObject({
      action: 'user_updated',
      admin_id: admin.id,
      target_user_id: user.id,
    })
  })
})
```

### 3. End-to-End Tests (Playwright)

**What to Test:**
- Complete user workflows
- Admin login with MFA
- User CRUD operations
- Role management
- Audit log viewing
- UI interactions

**Test Coverage:**
```typescript
// e2e/admin-user-management.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Admin User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.fill('[name="email"]', 'admin@test.com')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')

    // MFA code
    await page.fill('[name="mfa_code"]', '123456') // Use test code
    await page.click('button[type="submit"]')

    // Navigate to admin panel
    await page.goto('/admin/users')
  })

  test('should display user list', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('User Management')
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('tbody tr')).not.toHaveCount(0)
  })

  test('should search users', async ({ page }) => {
    await page.fill('[placeholder="Search users..."]', 'testuser')
    await page.waitForTimeout(500) // Debounce

    const rows = page.locator('tbody tr')
    await expect(rows).toContainText('testuser')
  })

  test('should edit user profile', async ({ page }) => {
    // Click first user's edit button
    await page.locator('tbody tr').first().locator('button:has-text("Edit")').click()

    // Update username
    await page.fill('[name="username"]', 'updated_username')
    await page.click('button[type="submit"]')

    // Verify success toast
    await expect(page.locator('.toast')).toContainText('User updated successfully')

    // Verify audit log
    await page.goto('/admin/audit-logs')
    await expect(page.locator('tbody tr').first()).toContainText('user_updated')
  })

  test('should reset user password', async ({ page }) => {
    await page.locator('tbody tr').first().locator('button:has-text("Reset Password")').click()

    // Select temporary password option
    await page.click('label:has-text("Generate temporary password")')
    await page.click('button:has-text("Reset Password")')

    // Verify temporary password displayed
    await expect(page.locator('.temporary-password')).toBeVisible()

    // Verify audit log
    await page.goto('/admin/audit-logs')
    await expect(page.locator('tbody tr').first()).toContainText('password_reset')
  })

  test('should change user role (super_admin only)', async ({ page }) => {
    // Login as super_admin
    await page.goto('/login')
    await page.fill('[name="email"]', 'superadmin@test.com')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')

    await page.goto('/admin/users')

    // Click first user's change role button
    await page.locator('tbody tr').first().locator('button:has-text("Change Role")').click()

    // Select admin role
    await page.selectOption('select[name="role"]', 'admin')
    await page.click('button:has-text("Confirm")')

    // Verify success
    await expect(page.locator('.toast')).toContainText('Role changed successfully')

    // Verify badge updated
    await expect(page.locator('tbody tr').first()).toContainText('admin')
  })

  test('should soft delete user', async ({ page }) => {
    await page.locator('tbody tr').first().locator('button:has-text("Delete")').click()

    // Confirm deletion
    await page.click('button:has-text("Delete")')

    // Verify success
    await expect(page.locator('.toast')).toContainText('User deleted successfully')

    // Verify user removed from list
    const firstUsername = await page.locator('tbody tr').first().textContent()
    await page.reload()
    await expect(page.locator('tbody tr').first()).not.toContainText(firstUsername!)
  })
})
```

### 4. Security Tests

**What to Test:**
- Unauthorized access (403 Forbidden)
- Privilege escalation (cannot promote self to super_admin)
- MFA enforcement (blocked after grace period)
- Rate limiting (429 Too Many Requests)

**Example:**
```typescript
// e2e/security.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Security', () => {
  test('should block regular user from accessing admin panel', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'user@test.com')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')

    // Try to access admin panel
    await page.goto('/admin/users')

    // Should be redirected to 403 page
    await expect(page.url()).toContain('/403')
  })

  test('should enforce MFA after grace period', async ({ page }) => {
    // Login as admin without MFA (grace period expired)
    await page.goto('/login')
    await page.fill('[name="email"]', 'admin-no-mfa@test.com')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')

    // Try to access admin panel
    await page.goto('/admin/users')

    // Should be redirected to MFA setup
    await expect(page.url()).toContain('/admin/setup-mfa')
    await expect(page.locator('.banner')).toContainText('MFA Required')
  })

  test('should prevent admin from editing own username', async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.fill('[name="email"]', 'admin@test.com')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')

    // Navigate to own profile
    await page.goto('/admin/users/own-user-id/edit')

    // Try to update username
    await page.fill('[name="username"]', 'new_username')
    await page.click('button[type="submit"]')

    // Should show error
    await expect(page.locator('.toast')).toContainText('Cannot edit own account')
  })
})
```

---

## Deployment Architecture

### Production Environment

```
┌────────────────────────────────────────────────────────────┐
│  CDN (Vercel Edge Network)                                 │
│  - Static assets (JS, CSS, images)                         │
│  - Edge caching                                             │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Vercel (Serverless Functions)                             │
│  - Next.js App Router                                       │
│  - Server Components (streaming SSR)                        │
│  - API Routes (serverless functions)                        │
│  - Server Actions (serverless functions)                    │
│  - Middleware (authentication, RBAC, MFA)                   │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Supabase (Database + Auth)                                │
│  - PostgreSQL (RLS enabled)                                │
│  - Auth (JWT, MFA)                                          │
│  - Storage (if needed for attachments)                      │
└────────────────────────────────────────────────────────────┘
```

### Environment Variables

```bash
# .env.local (development)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # SERVER ONLY

# Production (Vercel Environment Variables)
# Same variables, but with production values
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## Monitoring & Observability

### 1. Performance Monitoring

**Vercel Analytics:**
- Page load times
- API route latency
- Core Web Vitals

**Custom Metrics:**
```typescript
// lib/metrics.ts
export async function trackAdminAction(action: string, duration: number) {
  await fetch('/api/metrics', {
    method: 'POST',
    body: JSON.stringify({ action, duration, timestamp: Date.now() }),
  })
}

// Usage in Server Action
export async function updateUser(userId: string, data: unknown) {
  const startTime = Date.now()

  try {
    // ... update logic
    await trackAdminAction('user_update', Date.now() - startTime)
  } catch (error) {
    await trackAdminAction('user_update_error', Date.now() - startTime)
    throw error
  }
}
```

### 2. Error Tracking

**Sentry (optional):**
```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
})

// Usage
try {
  await updateUser(userId, data)
} catch (error) {
  Sentry.captureException(error, {
    tags: { action: 'user_update', user_id: userId },
  })
  throw error
}
```

### 3. Audit Log Monitoring

**Alert on Suspicious Activity:**
- Multiple failed login attempts from same IP
- Bulk deletions (> 10 users in 1 hour)
- Role changes outside business hours
- MFA disabled for admin accounts

**Implementation:**
```typescript
// lib/alerts.ts
export async function checkSuspiciousActivity() {
  // Run hourly via cron job

  // Check 1: Failed login attempts
  const failedLogins = await supabase
    .from('audit_logs')
    .select('ip_address, count(*)')
    .eq('action', 'login_failed')
    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .groupBy('ip_address')
    .having('count(*) > 5')

  if (failedLogins.data.length > 0) {
    await sendAlert('Multiple failed logins detected', failedLogins.data)
  }

  // Check 2: Bulk deletions
  const deletions = await supabase
    .from('audit_logs')
    .select('admin_id, count(*)')
    .eq('action', 'user_deleted')
    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .groupBy('admin_id')
    .having('count(*) > 10')

  if (deletions.data.length > 0) {
    await sendAlert('Bulk deletions detected', deletions.data)
  }
}
```

---

## Summary

This architecture document provides:

1. **Comprehensive System Design:**
   - Layered architecture (Client → Middleware → Application → Database)
   - Security boundaries (Public → Authenticated → Admin → Super Admin)
   - Data flow diagrams

2. **Technology Decisions:**
   - Next.js 15 App Router (Server Components + Server Actions)
   - Supabase (PostgreSQL + RLS + Auth + MFA)
   - TypeScript (type safety)
   - shadcn/ui (accessible UI components)

3. **Database Architecture:**
   - Complete SQL migrations (profiles, audit_logs, mfa_recovery_codes)
   - RLS policies (security at database level)
   - Database triggers (automatic audit logging)
   - Indexes (performance optimization)

4. **API Architecture:**
   - 8 endpoints (REST + Server Actions)
   - Request/response schemas
   - Rate limiting
   - Error handling

5. **Security Architecture:**
   - RBAC (3 roles: user, admin, super_admin)
   - MFA enforcement (TOTP + recovery codes)
   - Audit logging (immutable, 2-year retention)
   - Session management

6. **Frontend Architecture:**
   - Server Components (default)
   - Client Components (interactive forms, search)
   - State management (Zustand for UI state)
   - Form validation (React Hook Form + Zod)

7. **Performance Architecture:**
   - Pagination (offset-based for MVP, cursor-based for scale)
   - Database optimization (indexes, query functions)
   - Rate limiting (per-endpoint limits)

8. **Testing Strategy:**
   - Unit tests (Vitest)
   - Integration tests (Vitest + Supabase)
   - E2E tests (Playwright)
   - Security tests (unauthorized access, privilege escalation)

This architecture is ready for implementation in Phase 4 (Building).

---

**Next Phase:** Discovery (Phase 2) - Scout existing codebase for integration points

**Approval Required:** Architect sign-off before proceeding to discovery

---

*Generated by BMAD Architect Agent | Phase 1: Architecture Design | 2025-10-27*
