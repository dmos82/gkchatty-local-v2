-- Migration: Add Admin Columns to Profiles Table
-- Task: TASK-002
-- Date: 2025-10-28
-- Purpose: Add role-based access control, soft delete, MFA, and last login tracking

-- Add role column with constraint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'super_admin'));

-- Add soft delete column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add MFA columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enforced_at TIMESTAMPTZ;

-- Add last login tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles
  USING gin(to_tsvector('english', username || ' ' || COALESCE(display_name, '') || ' ' || email));

-- Add helpful comments
COMMENT ON COLUMN profiles.role IS 'User role: user (default), admin (user management), super_admin (role management)';
COMMENT ON COLUMN profiles.deleted_at IS 'Soft delete timestamp. NULL = active, NOT NULL = deleted';
COMMENT ON COLUMN profiles.mfa_enabled IS 'Whether user has enabled two-factor authentication';
COMMENT ON COLUMN profiles.mfa_enforced_at IS 'When MFA was made required for this user (7-day grace period)';
COMMENT ON COLUMN profiles.last_login IS 'Last successful login timestamp';
-- Migration: Create Audit Logs Table
-- Task: TASK-003
-- Date: 2025-10-28
-- Purpose: Immutable logging of all admin actions for compliance and security

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
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_timestamp ON audit_logs(admin_id, timestamp DESC);

-- Documentation
COMMENT ON TABLE audit_logs IS 'Immutable audit log of all admin actions. Retained for 2 years for compliance.';
COMMENT ON COLUMN audit_logs.old_value IS 'Previous state before change (JSONB for flexibility)';
COMMENT ON COLUMN audit_logs.new_value IS 'New state after change (JSONB for flexibility)';
COMMENT ON COLUMN audit_logs.action IS 'Type of admin action performed';
COMMENT ON COLUMN audit_logs.admin_id IS 'Admin who performed the action (NULL if admin deleted)';
COMMENT ON COLUMN audit_logs.target_user_id IS 'User affected by the action (NULL if user deleted)';
-- Migration: Create MFA Recovery Codes Table
-- Task: TASK-004
-- Date: 2025-10-28
-- Purpose: Store hashed recovery codes for MFA (10 single-use codes per user)

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id ON mfa_recovery_codes(user_id);

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

CREATE TRIGGER IF NOT EXISTS enforce_recovery_code_limit
BEFORE INSERT ON mfa_recovery_codes
FOR EACH ROW
EXECUTE FUNCTION check_recovery_code_limit();

-- Documentation
COMMENT ON TABLE mfa_recovery_codes IS 'MFA recovery codes (bcrypt hashed). Each user has 10 single-use codes.';
COMMENT ON COLUMN mfa_recovery_codes.code_hash IS 'bcrypt hash of recovery code (never store plain text)';
COMMENT ON COLUMN mfa_recovery_codes.used_at IS 'Timestamp when code was used (NULL = unused)';
-- Migration: Add RLS Policies for Admin Access
-- Task: TASK-005
-- Date: 2025-10-28
-- Purpose: Enforce role-based access control with Row-Level Security

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES TABLE RLS POLICIES
-- ============================================================================

-- Policy 1: Users can view own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can update own profile (non-admin fields only)
CREATE POLICY IF NOT EXISTS "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND OLD.role = NEW.role -- Cannot change own role
  );

-- Policy 3: Admins can view all users
CREATE POLICY IF NOT EXISTS "Admins can view all users" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Policy 4: Admins can update users (except own record)
CREATE POLICY IF NOT EXISTS "Admins can update users" ON profiles
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
CREATE POLICY IF NOT EXISTS "Only super_admin can change roles" ON profiles
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

-- Policy 6: Admins can soft delete users
CREATE POLICY IF NOT EXISTS "Admins can soft delete users" ON profiles
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
CREATE POLICY IF NOT EXISTS "Only active users can authenticate" ON profiles
  FOR SELECT
  USING (deleted_at IS NULL OR id = auth.uid());

-- ============================================================================
-- AUDIT LOGS TABLE RLS POLICIES
-- ============================================================================

-- Policy 1: Admins can view all audit logs
CREATE POLICY IF NOT EXISTS "Admins can view audit logs" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Policy 2: Admins can insert audit logs (application-level logging)
CREATE POLICY IF NOT EXISTS "Admins can insert audit logs" ON audit_logs
  FOR INSERT
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- NO UPDATE OR DELETE POLICIES FOR AUDIT LOGS (immutable)

-- ============================================================================
-- MFA RECOVERY CODES TABLE RLS POLICIES
-- ============================================================================

-- Policy 1: Users can view own recovery codes
CREATE POLICY IF NOT EXISTS "Users can view own recovery codes" ON mfa_recovery_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can insert own recovery codes (during MFA setup)
CREATE POLICY IF NOT EXISTS "Users can insert own recovery codes" ON mfa_recovery_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update own recovery codes (mark as used)
CREATE POLICY IF NOT EXISTS "Users can update own recovery codes" ON mfa_recovery_codes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND used_at IS NOT NULL);

-- Policy 4: Users can delete own recovery codes (regenerate)
CREATE POLICY IF NOT EXISTS "Users can delete own recovery codes" ON mfa_recovery_codes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS FOR ADDITIONAL CONSTRAINTS
-- ============================================================================

-- Trigger: Prevent demotion of last super_admin
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

CREATE TRIGGER IF NOT EXISTS ensure_super_admin_exists
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION check_last_super_admin();
-- Migration: Add Audit Triggers
-- Task: TASK-006
-- Date: 2025-10-28
-- Purpose: Automatic audit logging for all admin actions (cannot be bypassed)

-- ============================================================================
-- TRIGGER FUNCTION: Log User Updates
-- ============================================================================

CREATE OR REPLACE FUNCTION log_user_update()
RETURNS TRIGGER AS $$
DECLARE
  old_data JSONB;
  new_data JSONB;
  action_type TEXT;
BEGIN
  -- Determine action type
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    action_type := 'user_deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    action_type := 'user_restored';
  ELSIF OLD.role IS DISTINCT FROM NEW.role THEN
    action_type := 'role_changed';
  ELSE
    action_type := 'user_updated';
  END IF;

  -- Build old/new value JSONB
  old_data := jsonb_build_object(
    'username', OLD.username,
    'email', OLD.email,
    'role', OLD.role,
    'mfa_enabled', OLD.mfa_enabled,
    'deleted_at', OLD.deleted_at
  );

  new_data := jsonb_build_object(
    'username', NEW.username,
    'email', NEW.email,
    'role', NEW.role,
    'mfa_enabled', NEW.mfa_enabled,
    'deleted_at', NEW.deleted_at
  );

  -- Insert audit log
  INSERT INTO audit_logs (admin_id, action, target_user_id, old_value, new_value)
  VALUES (auth.uid(), action_type, NEW.id, old_data, new_data);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Audit User Updates
-- ============================================================================

DROP TRIGGER IF EXISTS audit_user_updates ON profiles;
CREATE TRIGGER audit_user_updates
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (
  OLD.username IS DISTINCT FROM NEW.username
  OR OLD.email IS DISTINCT FROM NEW.email
  OR OLD.role IS DISTINCT FROM NEW.role
  OR OLD.mfa_enabled IS DISTINCT FROM NEW.mfa_enabled
  OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
)
EXECUTE FUNCTION log_user_update();

-- ============================================================================
-- TRIGGER FUNCTION: Log MFA Changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_mfa_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when MFA is enabled
  IF OLD.mfa_enabled = false AND NEW.mfa_enabled = true THEN
    INSERT INTO audit_logs (admin_id, action, target_user_id, old_value, new_value)
    VALUES (
      auth.uid(),
      'mfa_enabled',
      NEW.id,
      jsonb_build_object('mfa_enabled', false),
      jsonb_build_object('mfa_enabled', true)
    );
  END IF;

  -- Log when MFA is disabled
  IF OLD.mfa_enabled = true AND NEW.mfa_enabled = false THEN
    INSERT INTO audit_logs (admin_id, action, target_user_id, old_value, new_value)
    VALUES (
      auth.uid(),
      'mfa_disabled',
      NEW.id,
      jsonb_build_object('mfa_enabled', true),
      jsonb_build_object('mfa_enabled', false)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Audit MFA Changes
-- ============================================================================

DROP TRIGGER IF EXISTS audit_mfa_changes ON profiles;
CREATE TRIGGER audit_mfa_changes
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.mfa_enabled IS DISTINCT FROM NEW.mfa_enabled)
EXECUTE FUNCTION log_mfa_change();

-- ============================================================================
-- TRIGGER FUNCTION: Log Profile Deletion (Permanent)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_profile_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (admin_id, action, target_user_id, old_value, new_value)
  VALUES (
    auth.uid(),
    'permanent_delete',
    OLD.id,
    jsonb_build_object('username', OLD.username, 'email', OLD.email, 'role', OLD.role),
    NULL
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Audit Profile Deletions (Permanent)
-- ============================================================================

DROP TRIGGER IF EXISTS audit_profile_deletions ON profiles;
CREATE TRIGGER audit_profile_deletions
BEFORE DELETE ON profiles
FOR EACH ROW
EXECUTE FUNCTION log_profile_deletion();

-- ============================================================================
-- HELPER FUNCTION: Get Current User Role (for use in application)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Documentation
COMMENT ON FUNCTION log_user_update() IS 'Automatically logs all profile updates to audit_logs table';
COMMENT ON FUNCTION log_mfa_change() IS 'Logs MFA enable/disable events';
COMMENT ON FUNCTION log_profile_deletion() IS 'Logs permanent profile deletions';
COMMENT ON FUNCTION get_current_user_role() IS 'Helper function to get authenticated user role (used in RLS policies)';
