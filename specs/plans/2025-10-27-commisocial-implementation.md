# CommiSocial Implementation Plan

**Date:** 2025-10-27
**Feature:** CommiSocial MVP - Reddit-style community platform
**Status:** Ready for Implementation
**Estimated Time:** 4-6 hours

## Overview

Step-by-step implementation plan for CommiSocial MVP with RAG pattern optimization.

## Step 1: Initialize Next.js Project

**Objective:** Create Next.js 14 app with TypeScript
**Commands:**
```bash
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem
npx create-next-app@latest commisocial --typescript --tailwind --app --no-src-dir
cd commisocial
```
**Files Created:** package.json, tsconfig.json, app/layout.tsx, app/page.tsx
**Validation:** npm run dev starts on localhost:3000

## Step 2: Install Core Dependencies

**Objective:** Add Supabase, shadcn/ui dependencies
**Commands:**
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install @radix-ui/react-avatar @radix-ui/react-dialog @radix-ui/react-dropdown-menu
```
**Validation:** npm list shows all packages installed

## Step 3: Configure Supabase

**Objective:** Set up Supabase client utilities
**Files to Create:**
- `lib/supabase/client.ts` - Browser client
- `lib/supabase/server.ts` - Server client
- `.env.local` - Environment variables
**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```
**Validation:** TypeScript compilation succeeds

## Step 4: Initialize shadcn/ui

**Objective:** Set up component library
**Commands:**
```bash
npx shadcn-ui@latest init
# Select: Default style, Slate color, CSS variables
npx shadcn-ui@latest add button card input textarea avatar
```
**Files Created:** components.json, lib/utils.ts, components/ui/*
**Validation:** Components import without errors

## Step 5: Create Database Schema

**Objective:** Set up PostgreSQL tables in Supabase
**SQL to Execute:**
```sql
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
```
**Validation:** Tables visible in Supabase dashboard

## Step 6: Enable Row Level Security

**Objective:** Secure database with RLS policies
**SQL to Execute:**
```sql
-- Enable RLS
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
```
**Validation:** RLS enabled in Supabase dashboard

## Step 7: Create Authentication Components

**Objective:** Build login and signup forms
**Files to Create:**
- `components/auth/LoginForm.tsx`
- `components/auth/SignupForm.tsx`
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
**Key Features:**
- Email/password authentication
- Username validation
- Error handling
- Loading states
**Validation:** Forms render and handle auth flow

## Step 8: Create Feed Components

**Objective:** Build main feed interface
**Files to Create:**
- `app/feed/page.tsx`
- `components/feed/FeedList.tsx`
- `components/feed/PostCard.tsx`
- `components/feed/VoteButtons.tsx`
**Key Features:**
- Post list display
- Vote functionality
- Real-time updates
- Pagination ready
**Validation:** Feed displays posts with voting

## Step 9: Implement Voting System

**Objective:** Add upvote/downvote functionality
**Key Implementation:**
- Optimistic UI updates
- Vote state management
- Database triggers for counts
- Conflict resolution
**Files to Update:**
- `components/feed/VoteButtons.tsx`
- Database triggers for vote counting
**Validation:** Votes update in real-time

## Step 10: Create Post Creation

**Objective:** Allow users to create posts
**Files to Create:**
- `app/post/create/page.tsx`
- `components/post/CreatePostForm.tsx`
**Features:**
- Title and content fields
- Validation
- Rich text support (markdown)
- Submit to database
**Validation:** Posts appear in feed after creation

## Step 11: Add Comment System

**Objective:** Implement threaded comments
**Files to Create:**
- `components/comments/CommentList.tsx`
- `components/comments/CommentForm.tsx`
- `components/comments/CommentThread.tsx`
**Features:**
- Nested comment display
- Reply functionality
- Vote on comments
- Real-time updates
**Validation:** Comments display and nest properly

## Step 12: Create User Profiles

**Objective:** User profile pages
**Files to Create:**
- `app/profile/[username]/page.tsx`
- `components/profile/ProfileHeader.tsx`
- `components/profile/UserPosts.tsx`
**Features:**
- Display user info
- List user's posts
- Edit own profile
- Avatar upload
**Validation:** Profiles accessible via URL

## Step 13: Add Navigation

**Objective:** Site-wide navigation
**Files to Create:**
- `components/nav/Header.tsx`
- `components/nav/UserMenu.tsx`
**Features:**
- Logo/home link
- User menu dropdown
- Login/logout
- Create post button
**Validation:** Navigation works across pages

## Step 14: Implement Search

**Objective:** Basic search functionality
**Files to Create:**
- `components/search/SearchBar.tsx`
- `app/search/page.tsx`
**Features:**
- Search posts by title/content
- Search users
- Full-text search in Supabase
**Validation:** Search returns relevant results

## Step 15: Add Loading States

**Objective:** Improve UX with loading indicators
**Implementation:**
- Skeleton screens
- Loading spinners
- Suspense boundaries
- Error boundaries
**Validation:** No jarring transitions

## Step 16: Deploy to Vercel

**Objective:** Deploy MVP to production
**Commands:**
```bash
git init
git add .
git commit -m "Initial CommiSocial MVP"
vercel
```
**Configuration:**
- Set environment variables in Vercel
- Configure build settings
- Set up domain (optional)
**Validation:** Site accessible on Vercel URL

## Success Criteria

- [ ] Users can sign up and log in
- [ ] Users can create posts
- [ ] Users can vote on posts
- [ ] Users can comment on posts
- [ ] Real-time updates work
- [ ] Mobile responsive
- [ ] No console errors
- [ ] Deployed to Vercel

## Time Estimates

- Setup & Configuration: 30 minutes
- Authentication: 45 minutes
- Feed & Posts: 60 minutes
- Voting System: 30 minutes
- Comments: 45 minutes
- Profiles: 30 minutes
- Polish & Deploy: 30 minutes
- **Total: ~4.5 hours**

## Risk Mitigation

1. **Supabase Connection Issues**
   - Solution: Verify credentials, check RLS policies

2. **Real-time Not Working**
   - Solution: Check WebSocket connection, Supabase subscription

3. **TypeScript Errors**
   - Solution: Generate types from Supabase schema

4. **Performance Issues**
   - Solution: Add pagination, optimize queries

## Notes for Builder

- Start with core features (auth, posts, votes)
- Add comments and profiles after core works
- Test each feature before moving on
- Use Supabase dashboard to verify data
- Keep components simple and focused

---

This plan is optimized for RAG retrieval with clear, discrete steps that can be queried individually.