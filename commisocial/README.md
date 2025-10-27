# CommiSocial - Creator Communities Platform

Reddit-style social platform with Linktree features for creators.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Supabase Project

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Update `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Run Database Migrations

In your Supabase SQL Editor, execute:
```bash
supabase/migrations/20251027_init_schema.sql
```

This creates:
- `profiles` table
- `posts` table
- `votes` table
- `comments` table
- Row Level Security policies

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Deployment:** Vercel

## Project Structure

```
commisocial/
├── app/              # Next.js app router pages
├── components/       # React components
│   └── ui/          # shadcn/ui components
├── lib/             # Utilities and helpers
│   ├── supabase/    # Supabase clients
│   └── utils.ts     # Utility functions
├── supabase/        # Database migrations
└── public/          # Static assets
```

### 5. Run Vote Triggers Migration

After running the initial schema, also execute:
```bash
supabase/migrations/20251027_vote_triggers.sql
```

This adds automatic vote counting triggers.

## Features

### ✅ Implemented (MVP Complete)

- **Authentication**: Email/password signup and login with Supabase Auth
- **User Profiles**: Profile pages with bio, join date, and user posts
- **Post Creation**: Rich text posts with title and content
- **Feed**: Main feed displaying all posts sorted by recency
- **Voting System**: Upvote/downvote on posts with automatic counts via database triggers
- **Threaded Comments**: Nested comments up to 5 levels deep with voting
- **Navigation**: Sticky header with user menu and logout
- **Search**: Full-text search for posts and users
- **Loading States**: Skeleton loaders throughout the app

### 🚧 Future Enhancements

- Community hubs (/music, /visualarts, /writing)
- Smart link embedding (YouTube, Spotify, SoundCloud)
- Avatar upload functionality
- Profile editing
- Real-time updates via Supabase Realtime
- Pagination for feed and comments
- Markdown rendering for post content
- Notification system

## Deployment

### Deploy to Vercel

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Add environment variables:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Click Deploy

3. **Run Migrations**:
   - In Supabase SQL Editor, execute both migration files
   - Verify tables and triggers are created

4. **Test Production**:
   - Visit your Vercel deployment URL
   - Create an account and test all features

## Development Progress

**Status**: ✅ MVP Complete (16/16 steps)

- ✅ Step 1-4: Project setup
- ✅ Step 5-6: Database schema & RLS
- ✅ Step 7: Authentication components
- ✅ Step 8: Feed components
- ✅ Step 9: Voting system with triggers
- ✅ Step 10: Post creation
- ✅ Step 11: Threaded comment system
- ✅ Step 12: User profiles
- ✅ Step 13: Navigation
- ✅ Step 14: Search functionality
- ✅ Step 15: Loading states
- ✅ Step 16: Deployment ready