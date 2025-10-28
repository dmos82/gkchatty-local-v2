# Manual Migration Steps - Apply Database Schema

**Status:** Database tables need to be created
**Time required:** 5 minutes

---

## Quick Steps

### 1. Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/editor

### 2. Run Migration Files (in order)

#### File 1: Init Schema
```sql
-- Copy and paste contents of: supabase/migrations/20251027_init_schema.sql
```

[See file content below]

#### File 2: Vote Triggers (if exists)
```sql
-- Copy and paste contents of: supabase/migrations/20251027_vote_triggers.sql
```

#### File 3: Complete Schema (if exists)
```sql
-- Copy and paste contents of: supabase/migrations/20251027_complete_schema.sql
```

### 3. Verify Tables Created

After running the SQL, check in Supabase Dashboard:
- Go to: Table Editor
- Verify these tables exist:
  - `profiles`
  - `posts`
  - `votes`
  - `comments`

---

## Migration File Contents

### 20251027_init_schema.sql

\`\`\`sql
-- CommiSocial Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Votes table
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  post_id UUID REFERENCES posts(id),
  value INTEGER CHECK (value IN (-1, 1)),
  UNIQUE(user_id, post_id)
);

-- Comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id),
  author_id UUID REFERENCES profiles(id),
  parent_id UUID REFERENCES comments(id),
  content TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Posts policies
CREATE POLICY "Public posts" ON posts
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Votes policies
CREATE POLICY "Public votes" ON votes
  FOR SELECT USING (true);
CREATE POLICY "Users can manage own votes" ON votes
  FOR ALL USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Public comments" ON comments
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);
\`\`\`

---

## After Running Migrations

Once you've run the SQL in Supabase dashboard and verified the tables exist, reply **"done"** and I'll re-test the signup form to verify it works!

---

## Alternative: Web-Based Approach

If you prefer not to use the dashboard, you can also:

1. Grant me access to your Supabase project (make me a collaborator)
2. Or provide the database password (found in project settings → Database)

But the dashboard SQL Editor is the fastest method.
