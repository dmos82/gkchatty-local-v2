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
