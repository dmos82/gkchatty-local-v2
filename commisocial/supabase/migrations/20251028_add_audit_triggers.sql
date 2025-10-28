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
