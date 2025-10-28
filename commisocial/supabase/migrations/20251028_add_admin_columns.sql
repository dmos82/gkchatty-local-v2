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
