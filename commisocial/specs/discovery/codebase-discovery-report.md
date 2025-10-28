# CommiSocial Codebase Discovery Report

**Phase:** Discovery (Phase 2 - BMAD-Pro-Build)
**Date:** 2025-10-27
**Scout:** BMAD Scout Agent (Explore)
**Status:** ✅ Complete

---

## Executive Summary

CommiSocial has a **well-structured Next.js 15 foundation** with established patterns that admin features can build upon. The codebase uses modern React practices (Server Components, shadcn/ui, Supabase RLS), providing excellent scaffolding for enterprise admin features.

**Readiness Score:** 8/10
- ✅ Strong authentication foundation (Supabase)
- ✅ Component library complete (shadcn/ui)
- ✅ RLS policies established
- ⚠️ Missing middleware for role checks (critical)
- ⚠️ Database schema needs admin columns

---

## 1. Project Structure & Routes

### Current Route Organization
```
/app/
├── (auth)/
│   ├── login/page.tsx          [Public, Client Component]
│   └── signup/page.tsx         [Public, Client Component]
├── feed/page.tsx               [Server Component - authenticated]
├── post/
│   ├── create/page.tsx
│   └── [id]/page.tsx
├── profile/
│   └── [username]/page.tsx
├── search/page.tsx
└── page.tsx                    [Homepage]
```

### Pattern Analysis
- **Route Groups:** `(auth)` folder groups related pages
- **Server Components:** Default for data fetching (FeedList, PostCard)
- **Client Components:** Forms and interactive elements (`'use client'`)
- **Dynamic Routes:** `[id]` and `[username]` for detail pages

### Recommended Admin Location
```
/app/admin/
├── layout.tsx                  [Admin wrapper - auth check, sidebar]
├── page.tsx                    [Dashboard home]
├── users/
│   ├── page.tsx               [User list + search]
│   └── [userId]/
│       └── page.tsx           [User detail/edit]
├── audit-logs/
│   ├── page.tsx               [Audit log viewer]
│   └── export/route.ts        [CSV export endpoint]
└── settings/page.tsx          [MFA enforcement dashboard]
```

**Decision:** Place admin routes at `/app/admin/*` with protected middleware check.

---

## 2. Authentication & Authorization

### Current Implementation

**Auth Library:** Supabase Auth (JWT-based sessions)

**Client Creation Patterns:**
```typescript
// Server Components
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
const supabase = await createClient()

// Client Components
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
const supabase = createClient()
```

**Session Management:**
- Cookies managed by Next.js
- httpOnly cookies for security
- PKCE flow for auth

**Current RLS Policies:**
```sql
-- Profiles
"Public profiles" - SELECT all
"Users can insert own profile" - INSERT (auth.uid() = id)
"Users can update own profile" - UPDATE (auth.uid() = id)

-- Posts
"Anyone can view posts" - SELECT all
"Authenticated users can create posts" - INSERT (authenticated)
"Users can update own posts" - UPDATE (auth.uid() = author_id)

-- Votes, Comments
Similar patterns (own records only)
```

### Gaps for Admin System

**Missing:**
1. **Middleware** - No `middleware.ts` for route protection
2. **Role Support** - `profiles.role` column doesn't exist
3. **Admin RLS Policies** - Need "Admins can SELECT/UPDATE all users"
4. **MFA** - No MFA implementation yet

**Required Changes:**
```typescript
// middleware.ts (NEW FILE)
export async function middleware(request: NextRequest) {
  // Check session exists
  // Verify user role (admin/super_admin)
  // Enforce MFA (check grace period)
  // Rate limiting
  // Capture IP/User-Agent for audit logs
}

export const config = {
  matcher: '/admin/:path*'
}
```

---

## 3. Database Schema Review

### Current Profiles Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Required Additions
```sql
ALTER TABLE profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'super_admin')),
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mfa_enforced_at TIMESTAMPTZ,
  ADD COLUMN last_login TIMESTAMPTZ;
```

### New Tables Required
```sql
-- Audit Logs (immutable)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  admin_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT
);

-- MFA Recovery Codes
CREATE TABLE mfa_recovery_codes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
```

### Migration Pattern
**Observed Pattern:**
```
20251027_init_schema.sql
20251027_complete_schema.sql
20251028_add_profiles_insert_policy.sql
20251028_auto_create_profile_trigger.sql
```

**Format:** `YYYYMMDD_description.sql`

**Next Migrations:**
```
20251028_add_admin_columns.sql
20251028_create_audit_logs_table.sql
20251028_create_mfa_recovery_codes_table.sql
20251028_add_admin_rls_policies.sql
20251028_add_audit_triggers.sql
```

---

## 4. Component Patterns & Reusable Assets

### Available UI Components (shadcn/ui)
- ✅ Button (with variants: default, destructive, outline, secondary, ghost, link)
- ✅ Input (text, email, password)
- ✅ Label
- ✅ Card (CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- ✅ Textarea
- ✅ DropdownMenu

### Existing Form Pattern
**From `SignupForm.tsx` and `LoginForm.tsx`:**
```typescript
'use client'

export function MyForm() {
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.from('table').insert(...)
      if (error) throw error
      // Success handling
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <Input value={formData.field} onChange={...} />
        {error && <p className="text-red-500">{error}</p>}
        <Button disabled={loading}>{loading ? 'Loading...' : 'Submit'}</Button>
      </form>
    </Card>
  )
}
```

### Data Display Pattern
**From `FeedList.tsx`:**
```typescript
// Server Component for data fetching
export async function FeedList() {
  const supabase = await createClient()

  const { data: posts, error } = await supabase
    .from('posts')
    .select(`
      id,
      title,
      content,
      author:profiles!author_id (username, display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return <ErrorDisplay />
  if (!posts || posts.length === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

// Client Component for interactivity
'use client'
export function PostCard({ post }: Props) {
  const handleClick = () => { /* ... */ }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
      </CardHeader>
      <CardContent>{post.content}</CardContent>
    </Card>
  )
}
```

### Validation Pattern
**From `SignupForm.tsx`:**
```typescript
const validateUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  return usernameRegex.test(username)
}

// Usage
if (!validateUsername(username)) {
  setError('Username must be 3-20 characters...')
  return
}
```

### Reusable for Admin
- ✅ Card component for user detail panels
- ✅ Button variants (destructive for delete actions)
- ✅ Input for search and filters
- ✅ DropdownMenu for bulk actions
- ✅ FeedList pattern for UserList with pagination
- ✅ SignupForm pattern for UserEditForm

---

## 5. Styling & Theming

### Tech Stack
- **Tailwind CSS 3.4+** with custom configuration
- **Dark Mode:** Class-based (`darkMode: ["class"]`)
- **shadcn/ui:** HSL-based color system

### Theme Variables
```css
/* globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --muted: 0 0% 96.1%;
  --accent: 0 0% 96.1%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  /* ... dark mode variants */
}
```

### Component Styling Approach
```typescript
// Using cn() utility (clsx + tailwind-merge)
import { cn } from '@/lib/utils'

<Button className={cn(
  "default-classes",
  variant === 'destructive' && "bg-destructive text-destructive-foreground",
  className
)} />
```

### For Admin Dashboard
- Use existing color variables
- `destructive` variant for delete actions
- Same container patterns (max-w-7xl mx-auto)
- Leverage dark mode support
- Follow Card + Button + Input consistency

---

## 6. Libraries & Dependencies

### Current Stack
```json
{
  "@supabase/ssr": "^0.7.0",
  "@supabase/supabase-js": "^2.76.1",
  "next": "^15.0.3",
  "react": "^18.3.1",
  "@radix-ui/react-*": "latest",
  "tailwindcss": "^3.4.18",
  "typescript": "^5.9.3",
  "lucide-react": "^0.548.0",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.8.0"
}
```

### Missing Dependencies (Need to Add)
```json
{
  "zod": "^3.22.4",              // Schema validation
  "react-hook-form": "^7.49.2",  // Form state management
  "@hookform/resolvers": "^3.3.3", // Zod + React Hook Form integration
  "date-fns": "^3.0.6",          // Date formatting
  "csv-stringify": "^6.4.6"      // CSV export
}
```

**Decision:** Add Zod + React Hook Form for admin forms (better than useState for complex validation)

---

## 7. Performance Considerations

### Current Patterns
- ✅ Server Components for data fetching (excellent)
- ✅ Limit 50 items per page
- ✅ Client-side validation before API calls
- ⚠️ No pagination UI yet (manual LIMIT/OFFSET)

### For Admin Scale (10,000+ users)
**Required Optimizations:**
1. **Pagination:** LIMIT 50 OFFSET (page - 1) * 50
2. **Indexes:** role, deleted_at, created_at, last_login
3. **Search:** GIN index for full-text search on username/email
4. **Debounce:** Search input (current approach is real-time)
5. **Cursor-based pagination:** For future scale (> 50,000 users)

**Audit Log Performance:**
- Immutable table (no UPDATEs) = fast INSERTs
- Index on timestamp DESC, admin_id, action
- Retention policy (auto-delete > 2 years)

---

## 8. Integration Risks & Mitigation

| Risk | Severity | Impact | Mitigation |
|------|----------|--------|------------|
| **No middleware exists** | 🔴 HIGH | Admin routes unprotected | Create middleware.ts FIRST (Phase 4 Task 1) |
| **profiles.role missing** | 🔴 HIGH | Cannot check admin status | Add migration to alter table (Task 2) |
| **No Zod validation** | 🟡 MEDIUM | Form validation inconsistent | Add Zod schemas (Task 5) |
| **RLS policy conflicts** | 🟡 MEDIUM | Admin queries might fail | Test policies in isolation (Task 3) |
| **No rate limiting** | 🟡 MEDIUM | API abuse possible | Add rate limit middleware (Task 6) |
| **Audit triggers missing** | 🟡 MEDIUM | No automatic logging | Create database triggers (Task 4) |
| **Header auth disabled** | 🟢 LOW | User menu doesn't show | Fix before launch (Task 10) |

---

## 9. Reusable Utilities & Helpers

### Existing (`lib/utils.ts`)
```typescript
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Need to Create
```typescript
// lib/admin/validators.ts
export const updateUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  display_name: z.string().min(1).max(50),
})

// lib/admin/formatters.ts
export function formatDate(date: Date | string): string {
  return format(new Date(date), 'PPP')
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

// lib/admin/password.ts
export function generateTemporaryPassword(): string {
  // 16-character secure random password
}

export function validatePasswordComplexity(password: string): boolean {
  // Min 8 chars, upper, lower, number, special
}

// lib/admin/csv.ts
export function convertToCSV(data: any[]): string {
  // Convert array of objects to CSV string
}
```

---

## 10. Testing Infrastructure

### Current Setup
- ✅ Playwright 1.56.1 installed
- ❌ No test files yet
- ❌ No test scripts in package.json

### Recommended Test Structure
```
tests/
├── unit/
│   ├── validators.test.ts
│   ├── formatters.test.ts
│   └── password.test.ts
├── integration/
│   ├── admin-rls-policies.test.ts
│   ├── audit-triggers.test.ts
│   └── server-actions.test.ts
└── e2e/
    ├── admin/
    │   ├── user-list.spec.ts
    │   ├── user-edit.spec.ts
    │   ├── user-delete.spec.ts
    │   ├── role-management.spec.ts
    │   └── audit-logs.spec.ts
    └── security/
        ├── unauthorized-access.spec.ts
        ├── privilege-escalation.spec.ts
        └── mfa-enforcement.spec.ts
```

---

## 11. Key Implementation Insights

### Server vs Client Components
- **Data Fetching:** Server Components (FeedList, UserList)
- **Interactive Forms:** Client Components (LoginForm, UserEditForm)
- **Mixed:** Layout components can be async Server Components

### Async Patterns
```typescript
// Server Component
export async function UserList() {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*')
  return <Table data={data} />
}

// Client Component
'use client'
export function UserEditForm() {
  const handleSubmit = async (e) => {
    const result = await fetch('/api/admin/users', {...})
  }
}
```

### State Management
- **Forms:** useState (current) or React Hook Form (recommended)
- **Global State:** Not needed for MVP (URL params for filters)
- **Cache:** Next.js automatic caching + revalidatePath

### Database Query Pattern
```typescript
// Direct Supabase queries (no ORM)
const { data: users } = await supabase
  .from('profiles')
  .select(`
    id,
    username,
    email,
    role,
    created_at
  `)
  .order('created_at', { ascending: false })
  .limit(50)
```

---

## 12. Recommendations Summary

### Phase 3 (Planning) Priorities
1. **Database First:** Migrations for role, audit_logs, RLS policies
2. **Middleware Second:** Auth/role/MFA checks before building routes
3. **Components Third:** UserList, UserEditForm, AuditLogViewer
4. **Testing Last:** E2E tests for critical workflows

### File Structure Plan
```
app/
├── admin/
│   ├── layout.tsx              # Middleware + sidebar
│   ├── page.tsx                # Dashboard
│   ├── users/
│   │   ├── page.tsx            # UserList (Server Component)
│   │   └── [userId]/
│   │       ├── page.tsx        # UserDetail (Server Component)
│   │       └── actions.ts      # Server Actions
│   ├── audit-logs/
│   │   ├── page.tsx            # AuditLogList (Server Component)
│   │   └── export/route.ts     # CSV export API route
│   └── settings/
│       └── page.tsx            # MFA enforcement dashboard

lib/
├── admin/
│   ├── validators.ts           # Zod schemas
│   ├── formatters.ts           # Date/CSV helpers
│   ├── password.ts             # Password utilities
│   └── types.ts                # TypeScript interfaces

components/
├── admin/
│   ├── AdminLayout.tsx         # Sidebar + header wrapper
│   ├── UserTable.tsx           # User list table (Server Component)
│   ├── UserSearch.tsx          # Search input (Client Component)
│   ├── UserFilters.tsx         # Role/status filters (Client Component)
│   ├── UserEditForm.tsx        # Edit form (Client Component)
│   ├── DeleteUserDialog.tsx    # Confirmation modal (Client Component)
│   ├── AuditLogTable.tsx       # Audit log table (Server Component)
│   └── ExportButton.tsx        # CSV export (Client Component)

supabase/
└── migrations/
    ├── 20251028_add_admin_columns.sql
    ├── 20251028_create_audit_logs.sql
    ├── 20251028_create_mfa_recovery_codes.sql
    ├── 20251028_add_admin_rls_policies.sql
    └── 20251028_add_audit_triggers.sql

middleware.ts                   # Route protection
```

### Library Additions (Install First)
```bash
pnpm add zod react-hook-form @hookform/resolvers date-fns csv-stringify
pnpm add -D @types/node
```

---

## Conclusion

**Overall Assessment:** 8/10 - Ready for admin integration with minor infrastructure additions.

**Strengths:**
- ✅ Modern Next.js 15 + React 19 foundation
- ✅ Supabase RLS architecture solid
- ✅ Component library complete (shadcn/ui)
- ✅ Consistent patterns throughout codebase
- ✅ Dark mode support ready

**Critical Gaps:**
- ⚠️ No middleware for route protection (MUST add first)
- ⚠️ Database schema missing admin columns (migration required)
- ⚠️ No validation library (add Zod)

**Risk Level:** LOW - All gaps can be addressed in Phase 4 implementation.

**Recommendation:** Proceed to Phase 3 (Planning) → Break down architecture into implementation tasks.

---

**Report Prepared By:** BMAD Scout Agent (Explore)
**Discovery Complete:** ✅
**Next Phase:** Planning (Phase 3) - Task breakdown with Builder Pro upload

---

*Generated by BMAD-Pro-Build v2.0 | Phase 2: Discovery | 2025-10-27*
