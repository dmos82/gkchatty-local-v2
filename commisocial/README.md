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

## Development Status

**Steps Completed: 4/16**

- ✅ Step 1: Next.js initialized
- ✅ Step 2: Dependencies installed
- ✅ Step 3: Supabase configured
- ✅ Step 4: shadcn/ui ready
- ⏳ Step 5-6: Database setup (requires Supabase project)
- ⏳ Step 7-16: Feature implementation pending

## Features (Planned)

- User authentication (email/password)
- Creator profiles with bio and links
- Community hubs (/music, /visualarts, /writing)
- Post creation (text + links)
- Upvoting/downvoting system
- Threaded comments
- Smart link embedding (YouTube, Spotify, SoundCloud)