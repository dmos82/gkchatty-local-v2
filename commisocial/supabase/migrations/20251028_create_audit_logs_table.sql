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
