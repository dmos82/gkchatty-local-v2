# CommiSocial MVP - User Stories & Requirements

**Date:** October 27, 2025
**Version:** 1.0
**Status:** Ready for Architecture
**Product Owner:** BMAD Product Owner
**Related Documents:**
- Product Brief: `/specs/product-briefs/2025-10-27-commisocial/product-brief.md`

---

## Epic Overview

### Epic Statement
**As a** content creator sharing work across multiple platforms,
**I want** a centralized hub to aggregate my links, share my work, and engage with a dedicated community,
**So that** I can build a following, foster meaningful discussions, and drive traffic to my content without managing multiple social media profiles.

### Business Value
CommiSocial bridges the gap between link aggregation (Linktree) and community engagement (Reddit), creating a unique value proposition for creators who want both discoverability and discussion around their work.

**Target Users:**
- Musicians sharing Spotify/SoundCloud links
- Visual artists showcasing portfolios
- Writers promoting blogs and publications
- Content creators building personal brands

**Market Differentiation:**
1. **vs Linktree:** Adds community discussion and content discovery
2. **vs Reddit:** Focuses on creator profiles and external content aggregation
3. **vs Discord:** Public-facing, SEO-friendly, asynchronous discussion

---

## MVP User Stories

### 1. User Authentication & Account Management

#### Story 1.1: User Registration
**As a** new user,
**I want to** create an account with email and password,
**So that** I can start building my creator profile and participate in communities.

**Acceptance Criteria:**
- [ ] User can access signup page at `/signup`
- [ ] Form includes fields: email, username, password, confirm password
- [ ] Username validation:
  - 3-30 characters
  - Alphanumeric + underscores only
  - Case-insensitive uniqueness check
  - Real-time availability indicator
- [ ] Password requirements:
  - Minimum 8 characters
  - At least one uppercase, lowercase, number
  - Visual strength indicator
- [ ] Email validation with format check
- [ ] Supabase auth creates user in `auth.users`
- [ ] Profile record created in `profiles` table
- [ ] Verification email sent with confirmation link
- [ ] User redirected to `/h/music` (default hub) after signup
- [ ] Error handling for:
  - Duplicate username
  - Duplicate email
  - Network failures
  - Invalid email format

**Edge Cases:**
- Username already taken (show error immediately)
- Email already registered (generic error for security)
- Email verification link expires after 24 hours
- User closes tab before verification (resend option)

**Technical Notes:**
- Use Supabase Auth with email provider
- Store username in `profiles.username`
- Trigger profile creation via database trigger or API route
- Rate limit: 5 signup attempts per IP per hour

---

#### Story 1.2: User Login
**As a** registered user,
**I want to** log in with my credentials,
**So that** I can access my personalized feed and create content.

**Acceptance Criteria:**
- [ ] User can access login page at `/login`
- [ ] Form includes: email/username, password
- [ ] "Remember me" checkbox (extends session to 30 days)
- [ ] "Forgot password?" link visible
- [ ] Successful login redirects to main feed `/`
- [ ] JWT token stored in httpOnly cookie
- [ ] Refresh token stored securely
- [ ] Error messages for:
  - Invalid credentials (generic message)
  - Email not verified
  - Account locked/suspended
- [ ] Login state persists across tabs
- [ ] Auto-redirect to previous page after login (if accessed via protected route)

**Edge Cases:**
- User enters username instead of email (support both)
- Session expires during active use (auto-refresh)
- Multiple devices logged in (allow, but track sessions)

**Technical Notes:**
- Use Supabase `signInWithPassword`
- Store session in Next.js middleware
- Protected routes check via middleware
- Rate limit: 10 login attempts per IP per 15 minutes

---

#### Story 1.3: Password Reset
**As a** user who forgot my password,
**I want to** reset it via email,
**So that** I can regain access to my account.

**Acceptance Criteria:**
- [ ] User can access password reset at `/forgot-password`
- [ ] Form includes email field only
- [ ] Generic success message (don't reveal if email exists)
- [ ] Reset email sent with time-limited token (1 hour)
- [ ] Reset link directs to `/reset-password?token=xxx`
- [ ] Reset form shows: new password, confirm password
- [ ] Password requirements enforced (same as signup)
- [ ] Success message with redirect to login
- [ ] Token invalidated after use
- [ ] Old sessions terminated after password change

**Edge Cases:**
- Multiple reset requests (invalidate previous tokens)
- Token expired (clear error message)
- User changes password on another device (invalidate all sessions)

---

### 2. Creator Profiles

#### Story 2.1: View Creator Profile
**As a** visitor or logged-in user,
**I want to** view a creator's profile,
**So that** I can learn about them and access their external links.

**Acceptance Criteria:**
- [ ] Profile accessible at `/u/[username]`
- [ ] Profile displays:
  - Avatar (default if not set)
  - Display name (or username if not set)
  - Username (@username)
  - Bio (supports Markdown formatting)
  - Join date ("Member since Month YYYY")
  - Karma score
  - Follow/Unfollow button (if viewing another user)
- [ ] External links section:
  - Displayed as vertical list of cards
  - Shows link title, domain, and icon
  - Click opens in new tab
  - Tracks click count (for profile owner only)
- [ ] Recent posts feed below profile info
- [ ] Posts show: title, hub, score, comment count, timestamp
- [ ] Sorting options: New, Top, Controversial
- [ ] Infinite scroll for posts
- [ ] 404 page if username doesn't exist
- [ ] Responsive design (mobile-first)

**Edge Cases:**
- Profile with no links (show "Add your first link" if owner)
- Profile with no posts (show empty state)
- Deleted/suspended user (show appropriate message)
- Very long bio (truncate with "Show more")

---

#### Story 2.2: Edit Own Profile
**As a** logged-in user viewing my own profile,
**I want to** edit my profile information,
**So that** I can keep my creator page up-to-date.

**Acceptance Criteria:**
- [ ] "Edit Profile" button visible only on own profile
- [ ] Edit form includes:
  - Avatar upload (max 2MB, jpg/png/gif)
  - Display name (max 100 chars)
  - Bio (Markdown editor with preview, max 2000 chars)
- [ ] Avatar upload:
  - Image preview before save
  - Crop/resize tool
  - Stored in Supabase Storage
  - Public URL saved to `profiles.avatar_url`
- [ ] Bio editor:
  - Live Markdown preview
  - Support for: bold, italic, links, lists
  - Character counter
- [ ] Save button (disabled until changes made)
- [ ] Cancel button (reverts changes)
- [ ] Success toast notification
- [ ] Optimistic UI update
- [ ] Error handling for upload failures

**Edge Cases:**
- Image upload fails (retry mechanism)
- File too large (clear error message)
- Unsupported file type (validation)
- Network interruption during save (retry)

---

#### Story 2.3: Manage External Links
**As a** creator,
**I want to** add, edit, reorder, and delete external links on my profile,
**So that** I can direct visitors to my content across platforms.

**Acceptance Criteria:**
- [ ] "Manage Links" button on own profile
- [ ] Links management modal/page shows:
  - List of current links (max 10 for MVP)
  - Add link button
  - Drag handles for reordering
- [ ] Add/Edit link form:
  - Title (required, max 100 chars)
  - URL (required, validated)
  - Icon (auto-detected from domain or custom upload)
  - Preview of link card
- [ ] Auto-detect platform icons:
  - YouTube, Spotify, SoundCloud, Instagram, Twitter, etc.
  - Fallback to generic link icon
- [ ] Reordering:
  - Drag and drop interface
  - Position saved to `external_links.position`
  - Instant visual feedback
- [ ] Delete confirmation dialog
- [ ] Click tracking:
  - Increment on link click
  - Only tracked for external clicks (not preview)
  - Displayed to profile owner only
- [ ] Validation:
  - URL format check
  - Warning for suspicious domains
  - No duplicate URLs

**Edge Cases:**
- Maximum links reached (disable add button)
- Invalid URL format (show error)
- Link to internal CommiSocial page (warning)
- Platform icon not found (use fallback)

---

### 3. Hubs (Communities)

#### Story 3.1: Browse Hub Feed
**As a** user,
**I want to** browse posts in a specific hub,
**So that** I can discover content in my area of interest.

**Acceptance Criteria:**
- [ ] Hub accessible at `/h/[hubName]`
- [ ] Initial hubs: `music`, `visualarts`, `writing`
- [ ] Hub header displays:
  - Hub icon/banner
  - Hub name (h/music)
  - Description
  - Member count
  - Subscribe/Unsubscribe button (if logged in)
  - "Create Post" button (if logged in)
- [ ] Feed sorting options:
  - Hot (default): Score + recency algorithm
  - New: Chronological
  - Top: By time period (Today, Week, Month, All Time)
- [ ] Post cards show:
  - Vote buttons and score
  - Post title
  - Hub name (h/music)
  - Author (u/username)
  - Timestamp
  - Comment count
  - Link preview or text excerpt
- [ ] Infinite scroll (load 25 posts per page)
- [ ] Sidebar shows:
  - Hub rules
  - Hub description
  - Member count
  - Top contributors this week
- [ ] 404 page for non-existent hubs
- [ ] Responsive design

**Edge Cases:**
- Hub with no posts (empty state with "Be the first to post")
- Very long post titles (truncate with ellipsis)
- Deleted posts (show [deleted] placeholder)
- Banned users (hide from feed)

---

#### Story 3.2: Subscribe to Hubs
**As a** logged-in user,
**I want to** subscribe to hubs,
**So that** posts from those hubs appear in my main feed.

**Acceptance Criteria:**
- [ ] Subscribe button on hub page (when not subscribed)
- [ ] Unsubscribe button when already subscribed
- [ ] Button shows loading state during request
- [ ] Optimistic UI update (instant visual feedback)
- [ ] Subscription saved to `subscriptions` table
- [ ] Member count increments/decrements
- [ ] Subscribed hubs shown in sidebar navigation
- [ ] Default subscription to all 3 hubs on signup
- [ ] Maximum 20 hub subscriptions per user (MVP)

**Edge Cases:**
- Rapid clicking (debounce)
- Network failure during subscribe (retry)
- Unsubscribe from last hub (warning message)
- Already subscribed on another device (handle gracefully)

---

### 4. Post System

#### Story 4.1: Create Link Post
**As a** logged-in creator,
**I want to** create a link post,
**So that** I can share my work hosted on external platforms.

**Acceptance Criteria:**
- [ ] Post creation at `/submit` or hub-specific `/h/music/submit`
- [ ] Post type selection: Link or Text
- [ ] Link post form includes:
  - Hub selection dropdown (subscribed hubs only)
  - Title field (required, max 300 chars)
  - URL field (required, validated)
  - Optional text field for context
- [ ] URL validation:
  - Valid format check
  - Warning for suspicious domains
  - Check for duplicate posts in same hub (warn, don't block)
- [ ] Link preview generation:
  - Fetch Open Graph metadata
  - Show title, description, image
  - Editable title if OG data exists
- [ ] Smart embed detection:
  - YouTube: Extract video ID, show preview
  - Spotify: Extract track/album/playlist ID
  - SoundCloud: Fetch oEmbed data
  - Instagram: Show post preview
- [ ] Draft auto-save (localStorage)
- [ ] Submit button creates post
- [ ] Redirect to post detail page after creation
- [ ] Post appears immediately in hub feed (optimistic update)

**Edge Cases:**
- URL without OG metadata (use page title or allow manual entry)
- Invalid/broken URL (show error)
- URL to another CommiSocial post (allow but warn)
- Extremely long URL (truncate display)
- Network timeout during preview fetch (fallback to simple link)

**Technical Notes:**
- Use `unfurl` or similar for OG metadata
- Store original URL and preview data separately
- Rate limit: 5 posts per user per hour

---

#### Story 4.2: Create Text Post
**As a** logged-in user,
**I want to** create a text post,
**So that** I can start discussions or share thoughts.

**Acceptance Criteria:**
- [ ] Text post form includes:
  - Hub selection dropdown
  - Title field (required, max 300 chars)
  - Body field (Markdown editor, max 10,000 chars)
- [ ] Markdown editor features:
  - Toolbar: Bold, Italic, Link, List, Code
  - Live preview toggle
  - Character counter
  - Syntax highlighting for code blocks
- [ ] Preview shows rendered Markdown
- [ ] Support for:
  - Headers (H1-H6)
  - Bold/italic
  - Links
  - Ordered/unordered lists
  - Code blocks with syntax highlighting
  - Blockquotes
- [ ] Draft auto-save every 30 seconds
- [ ] Submit creates post in `posts` table
- [ ] Redirect to post detail page
- [ ] Post appears in feed immediately

**Edge Cases:**
- Empty body with only title (allow, like Reddit)
- Markdown rendering errors (sanitize and show as plain text)
- Very long posts (consider pagination on detail page)
- Paste from Word (strip formatting)

---

#### Story 4.3: View Post Detail
**As a** user,
**I want to** view a post and its comments,
**So that** I can engage with the content and discussion.

**Acceptance Criteria:**
- [ ] Post detail at `/h/[hubName]/[postId]`
- [ ] Page displays:
  - Full post content (no truncation)
  - Vote buttons and score
  - Hub and author info
  - Timestamp
  - Edit/Delete buttons (if owner)
  - Share button
- [ ] Link posts:
  - Full embed displayed (YouTube player, Spotify player, etc.)
  - Click-through link to original
  - Domain shown
- [ ] Text posts:
  - Full Markdown-rendered content
  - Responsive images
- [ ] Comment section below post:
  - Comment count
  - Sort options: Best, Top, New, Old, Controversial
  - Comment form (if logged in)
  - Threaded comments
- [ ] SEO optimization:
  - Dynamic meta tags
  - Open Graph data
  - Twitter Card support
- [ ] Share functionality:
  - Copy link to clipboard
  - Social media share buttons (optional)

**Edge Cases:**
- Deleted post (show [deleted] with comments intact)
- Post with no comments (show "Be the first to comment")
- Very long post (consider smooth scrolling to comments)
- Embed fails to load (show fallback link)

---

#### Story 4.4: Edit/Delete Own Post
**As a** post author,
**I want to** edit or delete my post,
**So that** I can correct mistakes or remove content.

**Acceptance Criteria:**
- [ ] Edit/Delete buttons visible only to post author
- [ ] Edit mode:
  - Same form as post creation
  - Pre-populated with existing content
  - Can't change post type or hub
  - Can edit title and content/URL
  - Shows "Edited" indicator with timestamp
- [ ] Delete:
  - Confirmation dialog
  - Soft delete (set deleted flag)
  - Post shows [deleted] with author removed
  - Comments remain visible
  - Can't be undone
- [ ] Edit history tracking:
  - Store edit timestamp in `posts.updated_at`
  - Show "edited X minutes ago"
- [ ] Optimistic update on save

**Edge Cases:**
- Edit during active discussion (notify with "X new comments")
- Delete with many upvotes (extra confirmation)
- Network failure during delete (retry)

---

### 5. Voting System

#### Story 5.1: Vote on Posts
**As a** logged-in user,
**I want to** upvote or downvote posts,
**So that** I can influence content visibility and quality.

**Acceptance Criteria:**
- [ ] Vote buttons on every post card and post detail page
- [ ] Upvote button (arrow up icon)
- [ ] Downvote button (arrow down icon)
- [ ] Score displayed between buttons
- [ ] Visual states:
  - Neutral: Gray arrows
  - Upvoted: Orange arrow, score orange
  - Downvoted: Blue arrow, score blue
- [ ] Voting logic:
  - First click: Add vote (+1 or -1)
  - Click same: Remove vote (neutral)
  - Click opposite: Change vote (net change of 2)
- [ ] Optimistic UI update
- [ ] Real-time score updates via Supabase subscriptions
- [ ] Vote stored in `votes` table with user_id, target_id, vote_type
- [ ] Post score calculated as SUM of votes
- [ ] Can't vote on own posts (buttons disabled)
- [ ] Login required (redirect to login with return URL)

**Edge Cases:**
- Rapid clicking (debounce)
- Network failure (revert optimistic update)
- Post deleted mid-vote (show error)
- User banned (prevent voting)

**Technical Notes:**
- Prevent double voting with unique constraint
- Use database triggers to update post score
- Rate limit: 50 votes per user per minute

---

#### Story 5.2: Karma System
**As a** user,
**I want** my karma score to reflect the quality of my contributions,
**So that** I can build reputation in the community.

**Acceptance Criteria:**
- [ ] Karma displayed on user profile
- [ ] Karma calculation:
  - Post karma: Sum of upvotes on all posts
  - Comment karma: Sum of upvotes on all comments
  - Total karma = Post karma + Comment karma
- [ ] Karma updates in real-time
- [ ] Karma never goes below 0 (floor at 0)
- [ ] Downvotes on own content don't affect karma
- [ ] Deleted posts don't lose karma (preserve earned karma)

**Edge Cases:**
- Mass downvoting (future: rate limit detection)
- Negative karma from controversial content (floor at 0)
- Karma from deleted user votes (keep, don't retroactively remove)

---

### 6. Comment System

#### Story 6.1: Add Comment
**As a** logged-in user viewing a post,
**I want to** add a comment,
**So that** I can participate in the discussion.

**Acceptance Criteria:**
- [ ] Comment form below post and below each comment
- [ ] Form includes:
  - Markdown textarea (max 10,000 chars)
  - Preview toggle
  - Character counter
  - Submit/Cancel buttons
- [ ] Top-level comment creates entry with `parent_id = null`
- [ ] Reply creates entry with `parent_id = [parent comment id]`
- [ ] Comment appears immediately (optimistic update)
- [ ] Comment displays:
  - Author username and avatar
  - Timestamp ("just now", "5 minutes ago", etc.)
  - Comment content (Markdown rendered)
  - Vote buttons
  - Reply button
  - Edit/Delete (if owner)
- [ ] Markdown support:
  - Bold, italic, links
  - Code blocks
  - Quotes
  - Lists
- [ ] @username mentions (highlight, but no notifications in MVP)
- [ ] Login required (show "Log in to comment" button)

**Edge Cases:**
- Empty comment (disable submit)
- Very long comment (allow, but consider "show more")
- Comment on deleted post (block)
- Network failure (show retry button)

**Technical Notes:**
- Rate limit: 20 comments per user per 10 minutes
- Spam detection: Flag identical comments

---

#### Story 6.2: Threaded Comments
**As a** user reading comments,
**I want to** see nested replies,
**So that** I can follow conversation threads.

**Acceptance Criteria:**
- [ ] Comments nested up to 10 levels deep
- [ ] Visual indentation:
  - Each level indented by 16px (pl-4)
  - Vertical line on left to show thread
- [ ] Collapse/expand threads:
  - Click username or collapse icon to collapse
  - Show "[+] username (X children)"
  - Click to expand
  - State preserved during session
- [ ] "Continue thread" link after depth 10:
  - Links to new page showing deeper thread
  - URL: `/h/[hub]/[postId]?thread=[commentId]`
- [ ] Highlighting:
  - OP comments highlighted with badge
  - Linked comment (from URL) highlighted
- [ ] Sort options apply to top-level only:
  - Replies sorted by score (Best)

**Edge Cases:**
- Very deep threads (limit to 10, show "continue")
- All threads collapsed (show "expand all")
- Deleted parent comment (show [deleted] but keep children)

---

#### Story 6.3: Vote on Comments
**As a** logged-in user,
**I want to** upvote or downvote comments,
**So that** valuable contributions rise to the top.

**Acceptance Criteria:**
- [ ] Same voting UI as posts (arrow buttons + score)
- [ ] Same voting logic (toggle, change vote)
- [ ] Comment karma affects user's total karma
- [ ] Can't vote on own comments
- [ ] Vote stored in `votes` table with `target_type = 'comment'`
- [ ] Optimistic update
- [ ] Real-time score updates

**Edge Cases:**
- Same as post voting
- Hidden/collapsed comment can still be voted on

---

#### Story 6.4: Edit/Delete Comments
**As a** comment author,
**I want to** edit or delete my comments,
**So that** I can correct mistakes or remove regrettable content.

**Acceptance Criteria:**
- [ ] Edit/Delete buttons visible only to comment author
- [ ] Edit mode:
  - Shows same Markdown editor
  - Pre-populated with existing content
  - Save/Cancel buttons
  - Shows "edited" indicator
- [ ] Delete:
  - Confirmation dialog
  - Soft delete (set content to [deleted], remove author)
  - Child replies remain visible
  - Can't be undone
- [ ] Edit time limit: 15 minutes (MVP restriction)
- [ ] Can't edit if comment has replies (optional for MVP)

**Edge Cases:**
- Delete parent comment with many children (keep structure)
- Edit during active replies (allow)
- Network failure (retry)

---

### 7. Main Feed

#### Story 7.1: Personalized Main Feed
**As a** logged-in user,
**I want to** see posts from hubs I'm subscribed to,
**So that** I can stay updated with content I care about.

**Acceptance Criteria:**
- [ ] Main feed at `/`
- [ ] Shows posts from subscribed hubs only
- [ ] Default sort: Hot
- [ ] Sort options: Hot, New, Top (time periods)
- [ ] Feed composition:
  - Mix of posts from all subscribed hubs
  - Weighted by hub subscription time (newer subs prioritized)
  - Deduplication if post matches multiple filters
- [ ] Infinite scroll (load 25 posts per batch)
- [ ] Loading states:
  - Skeleton cards while loading
  - "Loading more..." indicator
- [ ] Empty state:
  - If no subscriptions: "Subscribe to hubs to see posts"
  - If subscriptions but no posts: "No posts yet"
- [ ] Refresh button/pull-to-refresh on mobile
- [ ] Real-time updates (new posts notification)

**Edge Cases:**
- User subscribed to 0 hubs (show hub suggestions)
- All subscribed hubs empty (show empty state)
- Network failure (show cached posts, retry button)

**Technical Notes:**
- "Hot" algorithm: `score / (time_since_post + 2)^gravity` where gravity = 1.8
- Cache feed for 60 seconds
- Use cursor-based pagination

---

#### Story 7.2: Anonymous Main Feed
**As a** non-logged-in visitor,
**I want to** see a sample feed of posts,
**So that** I can evaluate the platform before signing up.

**Acceptance Criteria:**
- [ ] Shows posts from all 3 default hubs
- [ ] Same layout as personalized feed
- [ ] Banner encouraging signup:
  - "Join CommiSocial to customize your feed"
  - Dismiss button (stores in localStorage)
- [ ] Vote buttons disabled (show login tooltip on hover)
- [ ] Comment form replaced with "Log in to comment" button
- [ ] Same sorting and infinite scroll

**Edge Cases:**
- User dismisses banner but doesn't sign up (respect dismissal)
- User browses for extended time (show signup reminder after 10 posts)

---

## Success Metrics

### User Acquisition
| Metric | Target (Week 1) | Target (Month 1) | Measurement Method |
|--------|-----------------|------------------|-------------------|
| New signups | 100 users | 500 users | Supabase auth count |
| Email verification rate | >70% | >80% | Verified / total signups |
| Signup completion rate | >60% | >70% | Completed / started |
| Organic vs invited | 30/70 | 50/50 | Referral tracking |

### User Engagement
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Daily active users (DAU) | 40% of total users | Unique logins per day |
| Average session duration | >5 minutes | Analytics timestamp tracking |
| Posts per day | >10 | Post creation count |
| Comments per day | >30 | Comment creation count |
| Votes per user per session | >10 | Vote action count |
| Return rate (Day 7) | >50% | Users active on day 7 after signup |

### Content Creation
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Posts per user per week | >2 | Post count / active users |
| Link vs text post ratio | 70/30 | Post type distribution |
| Comments per post | >3 | Average comments per post |
| External link clicks | >100/day | Link click tracking |
| Profile completeness | >60% users with bio + links | Profile data analysis |

### Technical Performance
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Page load time (LCP) | <2 seconds | Vercel Analytics |
| Time to Interactive (TTI) | <3 seconds | Lighthouse |
| API response time (p95) | <500ms | Supabase logs |
| Error rate | <1% | Sentry error tracking |
| Uptime | >99% | Vercel status |
| Mobile traffic | >40% | Analytics device breakdown |

### Community Health
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Upvote/downvote ratio | >3:1 | Vote type distribution |
| Comment sentiment | >60% positive | Manual review (sample) |
| Spam/abuse reports | <5% of content | Report count |
| Hub subscription distribution | No hub <20% | Subscription analytics |

---

## Edge Cases & Constraints

### Authentication Edge Cases
1. **Email Provider Issues**
   - Gmail blocks verification email → Retry mechanism + whitelist instructions
   - User has typo in email → Allow email change before verification
   - Corporate firewall blocks Supabase → Provide alternative verification method

2. **Session Management**
   - User logs in on 5 devices → Allow but show active sessions in settings
   - Session hijacking attempt → Invalidate on password change + IP change detection
   - Refresh token expires mid-session → Silent refresh, fallback to login

3. **Account Recovery**
   - User forgets username → Allow login with email
   - No access to email → Require manual support (no auto-recovery)
   - Account locked after failed attempts → 15-minute cooldown + CAPTCHA

### Content Edge Cases
1. **Post Creation**
   - URL already posted in hub within 7 days → Show warning + link to existing post
   - Link returns 404 → Allow post but show "Link may be broken"
   - Embedded content removed from source → Show placeholder + original link
   - User posts offensive content → Flag for review (future: auto-moderation)

2. **Markdown Rendering**
   - XSS attempt via Markdown → Sanitize with DOMPurify
   - Extremely large image in post → Lazy load + max dimensions
   - Nested blockquotes 50 levels deep → Limit to 5 levels
   - Malformed Markdown → Render as plain text + show formatting hint

3. **Voting**
   - Vote brigade from external site → Rate limiting + anomaly detection
   - Automated voting bots → CAPTCHA after 20 votes/minute
   - User creates alt accounts to self-vote → IP tracking (future)

### Performance Constraints
1. **Database Limits**
   - Supabase free tier: 500MB storage → Monitor usage, upgrade at 400MB
   - 2GB bandwidth/month → Cache aggressively, optimize images
   - Concurrent connections: 60 → Connection pooling

2. **API Rate Limits**
   - Supabase API: 1000 requests/second → Client-side caching
   - Vercel functions: 100GB-hours/month → Optimize serverless usage
   - External embeds (YouTube API) → Cache responses for 24 hours

3. **Frontend Performance**
   - Infinite scroll with 10,000 posts → Virtual scrolling (future)
   - 50 comments on single post → Pagination at depth 3
   - Large Markdown posts → Lazy render below fold

### Business Logic Constraints
1. **User Limits (MVP)**
   - Max 10 external links per profile
   - Max 20 hub subscriptions
   - Max 5 posts per hour
   - Max 20 comments per 10 minutes

2. **Content Restrictions**
   - Post title: 300 characters
   - Post text: 10,000 characters
   - Comment: 10,000 characters
   - Bio: 2,000 characters
   - Username: 3-30 characters

3. **Hub Restrictions (MVP)**
   - Fixed 3 hubs (no user-created hubs)
   - No private hubs
   - No custom hub rules enforcement

---

## Definition of Done

### Feature Completion Criteria
A user story is considered DONE when:

#### Code Complete
- [ ] Feature implemented per acceptance criteria
- [ ] TypeScript with strict mode (no `any` types)
- [ ] All edge cases handled with error states
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode support
- [ ] Loading states for async operations
- [ ] Optimistic UI updates where applicable

#### Testing
- [ ] Unit tests for business logic (80% coverage)
- [ ] Integration tests for API routes
- [ ] E2E test for critical user flow (Playwright)
- [ ] Manual testing on:
  - Chrome (latest)
  - Safari (latest)
  - Firefox (latest)
  - Mobile Safari (iOS)
  - Mobile Chrome (Android)

#### Security
- [ ] Input validation on client and server
- [ ] XSS prevention (sanitized Markdown)
- [ ] CSRF protection (Supabase handles)
- [ ] Rate limiting on API routes
- [ ] Row Level Security policies applied
- [ ] Sensitive data encrypted at rest

#### Performance
- [ ] Lighthouse score >90 (Performance, Accessibility, Best Practices)
- [ ] Page load <2 seconds on 3G
- [ ] No console errors or warnings
- [ ] Images optimized (Next.js Image component)
- [ ] Code splitting for routes

#### Documentation
- [ ] Code comments for complex logic
- [ ] JSDoc for public functions
- [ ] README updated with feature usage
- [ ] API documentation (if public endpoints)
- [ ] Database schema changes documented

#### Deployment
- [ ] Feature deployed to staging
- [ ] Staging testing passed
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Rollback plan documented
- [ ] Deployed to production
- [ ] Production smoke tests passed

#### Monitoring
- [ ] Error tracking configured (Sentry)
- [ ] Analytics events tracked (Vercel Analytics)
- [ ] Performance monitoring (Vercel)
- [ ] Database query performance verified

### Release Checklist (MVP Launch)
- [ ] All MVP user stories marked DONE
- [ ] Pre-launch checklist completed (from product brief)
- [ ] Landing page live with signup
- [ ] Email verification working
- [ ] 3 default hubs seeded with sample posts
- [ ] 10 test users with complete profiles
- [ ] Legal pages: Privacy Policy, Terms of Service
- [ ] Support email configured
- [ ] Error monitoring active
- [ ] Analytics tracking verified
- [ ] Custom domain configured (if available)
- [ ] SSL certificate valid
- [ ] Backup strategy implemented
- [ ] Incident response plan documented
- [ ] Early adopter outreach plan ready

---

## User Journey (Happy Path)

### New User Onboarding
1. **Discovery** → User finds CommiSocial via social media post
2. **Landing Page** → Views landing page, sees value proposition
3. **Signup** → Creates account with email/password
4. **Email Verification** → Verifies email, redirected to /h/music
5. **First Impression** → Sees feed of music-related posts
6. **Exploration** → Browses /h/visualarts and /h/writing
7. **Subscription** → Subscribes to all 3 hubs
8. **Profile Setup** → Edits profile, adds bio and external links
9. **First Post** → Creates link post to their SoundCloud track
10. **Engagement** → Receives first upvote and comment
11. **Return Visit** → Comes back next day to check notifications
12. **Habit Formation** → Visits daily to check feed and post content

### Creator Workflow
1. **Morning Routine** → Checks main feed for updates
2. **Content Share** → Posts link to new YouTube video in /h/music
3. **Engagement** → Replies to comments on yesterday's post
4. **Discovery** → Upvotes interesting posts, leaves comments
5. **Community Building** → Follows other creators in comments
6. **Profile Update** → Adds new link to Instagram in profile
7. **Analytics Check** → Views link click count on profile links
8. **Evening Check** → Scrolls feed before bed, upvotes content

---

## Non-Functional Requirements

### Accessibility (WCAG 2.1 Level AA)
- [ ] Keyboard navigation for all interactive elements
- [ ] Screen reader compatible (ARIA labels)
- [ ] Color contrast ratios meet AA standards
- [ ] Focus indicators visible
- [ ] Alt text for all images
- [ ] Skip to content link
- [ ] Semantic HTML structure

### Security
- [ ] HTTPS only (enforced)
- [ ] Content Security Policy headers
- [ ] Input sanitization (prevent XSS, SQL injection)
- [ ] Rate limiting on auth endpoints
- [ ] Session timeout after 30 days inactivity
- [ ] Password hashing with bcrypt (handled by Supabase)
- [ ] Secrets stored in environment variables

### Privacy
- [ ] GDPR compliance considerations
- [ ] Privacy policy accessible
- [ ] User data export capability (future)
- [ ] Account deletion removes personal data
- [ ] Minimal data collection
- [ ] No third-party tracking (except Vercel Analytics)

### SEO
- [ ] Dynamic meta tags per page
- [ ] Open Graph tags for social sharing
- [ ] Sitemap.xml generated
- [ ] Robots.txt configured
- [ ] Semantic HTML with proper headings
- [ ] Fast page load (Core Web Vitals)
- [ ] Mobile-friendly (Google Mobile-Friendly Test)

### Browser Support
- Chrome 90+ (majority of users)
- Safari 14+ (iOS users)
- Firefox 88+
- Edge 90+
- Mobile Safari (iOS 14+)
- Mobile Chrome (Android 10+)

### Scalability (Future)
- Horizontal scaling with Supabase read replicas
- CDN for static assets (Vercel Edge Network)
- Database connection pooling
- Caching strategy (Redis for future)
- Image optimization with Next.js Image

---

## Dependencies & Assumptions

### External Dependencies
1. **Supabase**
   - PostgreSQL database available
   - Auth service operational
   - Realtime subscriptions working
   - Storage for avatar uploads

2. **Vercel**
   - Deployment platform available
   - Serverless functions operational
   - Edge network for CDN

3. **Third-Party Embeds**
   - YouTube API accessible
   - Spotify embed URLs working
   - SoundCloud oEmbed available
   - Open Graph metadata fetchable

### Assumptions
1. **User Behavior**
   - Users are familiar with Reddit-style interfaces
   - Creators have content on external platforms
   - Users will self-moderate initially (no explicit moderation tools in MVP)
   - Users trust email verification process

2. **Technical**
   - Modern browsers with JavaScript enabled
   - Users have stable internet connection (no offline mode)
   - Mobile users on iOS/Android (not feature phones)
   - Email delivery is reliable

3. **Business**
   - Free tier of Supabase sufficient for MVP
   - Vercel free tier sufficient for MVP
   - No monetization required in MVP
   - Manual moderation acceptable for first 100 users

---

## Open Questions & Risks

### Open Questions
1. **Moderation**: How to handle spam/abuse with no dedicated moderation tools?
   - **Mitigation**: Start invite-only, add reporting in Phase 2

2. **Hub Expansion**: When to allow user-created hubs?
   - **Mitigation**: Track requests, plan for Phase 2

3. **Notifications**: Push notifications vs email digest?
   - **Mitigation**: Email digest weekly, push for Phase 2

4. **Monetization**: Premium features vs ads vs creator tips?
   - **Mitigation**: Decide after MVP launch based on user feedback

### Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Supabase rate limits exceeded | High | Medium | Implement aggressive caching, monitor usage |
| Spam/abuse overwhelms platform | High | Medium | Start invite-only, add CAPTCHA, rate limiting |
| Low user adoption | High | Medium | Pre-launch waitlist, influencer outreach |
| External embed APIs change | Medium | Low | Fallback to simple links, monitor API changes |
| Security vulnerability discovered | Critical | Low | Regular security audits, Sentry monitoring |
| Database performance degrades | High | Medium | Optimize queries, add indexes, consider caching |

---

## Appendix

### Glossary
- **Hub**: A community focused on a specific topic (e.g., /h/music)
- **Karma**: Cumulative score from upvotes on user's posts and comments
- **Post**: Link or text content shared in a hub
- **Thread**: A nested chain of comments and replies
- **OP**: Original Poster (author of the post)
- **Feed**: Chronological or algorithm-sorted list of posts

### Related Documents
- Product Brief: `/specs/product-briefs/2025-10-27-commisocial/product-brief.md`
- Visual Research: `/specs/product-briefs/2025-10-27-commisocial/research/`

### Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-27 | Initial user stories for MVP | BMAD Product Owner |

---

**Next Steps:**
1. Architecture phase: Create technical architecture document
2. Discovery phase: Audit existing similar codebases for patterns
3. Planning phase: Break down into technical tasks with time estimates
4. Implementation phase: Execute build with Builder Pro
5. QA phase: Comprehensive testing and validation

---

*Document prepared using BMAD methodology*
*Ready for /bmad-pro-build execution*
