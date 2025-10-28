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
