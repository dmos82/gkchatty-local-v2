-- Vote Count Triggers for Automatic Updates
-- Run this in your Supabase SQL Editor after the initial schema

-- Function to update post vote count
CREATE OR REPLACE FUNCTION update_post_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate vote count for the affected post
  UPDATE posts
  SET vote_count = (
    SELECT COALESCE(SUM(value), 0)
    FROM votes
    WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)
  )
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT
CREATE TRIGGER update_post_vote_count_on_insert
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION update_post_vote_count();

-- Trigger for UPDATE
CREATE TRIGGER update_post_vote_count_on_update
AFTER UPDATE ON votes
FOR EACH ROW
EXECUTE FUNCTION update_post_vote_count();

-- Trigger for DELETE
CREATE TRIGGER update_post_vote_count_on_delete
AFTER DELETE ON votes
FOR EACH ROW
EXECUTE FUNCTION update_post_vote_count();

-- Function to update comment vote count (for future comment voting)
CREATE OR REPLACE FUNCTION update_comment_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be used when comment voting is implemented
  -- For now, it's a placeholder
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Add index on votes for performance
CREATE INDEX IF NOT EXISTS idx_votes_post_id ON votes(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_post ON votes(user_id, post_id);

-- Add check constraint to ensure vote values are only -1 or 1
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_value_check;
ALTER TABLE votes ADD CONSTRAINT votes_value_check CHECK (value IN (-1, 1));
