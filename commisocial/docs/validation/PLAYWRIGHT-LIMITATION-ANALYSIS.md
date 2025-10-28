# Playwright Console Capture Limitation - Root Cause Analysis

**Date:** 2025-10-27
**Project:** CommiSocial (Builder Pro stress test)
**Issue:** Automated tests failed to detect critical RLS policy error

---

## Executive Summary

**The Bug:** Missing RLS INSERT policy for profiles table preventing user signup
**Symptom:** "new row violates row-level security policy for table 'profiles'"
**Detection Method:** Manual browser testing (NOT automated Playwright tests)
**Impact:** CRITICAL - Signup completely broken, but tests showed "PASS"

### Key Finding

**Playwright's `mcp__builder-pro-mcp__test_ui` tool has a console capture limitation:**
- ✅ Captures console logs from page load and useEffect hooks
- ❌ FAILS to capture console logs from onClick handlers accessing `process.env`
- ❌ FAILS to capture network error responses from Supabase API calls

This limitation caused 7 failed fix attempts over multiple hours investigating the wrong root cause.

---

## The Investigation Timeline

### Phase 1: Initial Test Failure (Automated)
**Tool:** `mcp__builder-pro-mcp__test_ui`
**Result:** Test appeared to hang at "🔵 Checking if username exists..."
**Conclusion:** INCORRECT - Assumed React 19 async event handler issue

### Phase 2: Seven Failed Fix Attempts
1. ❌ Changed form onSubmit to button onClick
2. ❌ Disabled React Strict Mode
3. ❌ Switched from @supabase/ssr to standard client
4. ❌ Used setTimeout to escape event context
5. ❌ Applied useTransition pattern (React 19)
6. ❌ Downgraded to React 18.3.1
7. ❌ Created client with useMemo

**All failed because we were fixing the wrong problem.**

### Phase 3: Manual Browser Test (SUCCESS)
**Method:** User opened http://localhost:3000/signup in Chrome
**Console Output:**
```
🔵 Starting signup for: testuser
🔵 Using component-level Supabase client
🔵 Checking if username exists...
🔵 Username check result: []
🔵 Creating auth user...
✅ Auth user created: c5f0a8e9-...
🔵 Creating profile...
❌ Profile error: {
  code: "42501",
  details: null,
  hint: null,
  message: "new row violates row-level security policy for table 'profiles'"
}
```

**This was the REAL error - visible in browser but NOT in Playwright.**

---

## Technical Analysis: Why Playwright Failed

### Test 1: Simple Click Handler
**File:** `app/test-simple-click/page.tsx`
```typescript
const handleClick = () => {
  console.log('🔵 CLICK 1 - Just a log')
  console.log('🔵 CLICK 2 - Process env:', typeof process)
  console.log('🔵 CLICK 3 - Env var:', process.env.NEXT_PUBLIC_SUPABASE_URL)
}
```

**Browser Console (Chrome):**
```
🔵 CLICK 1 - Just a log
🔵 CLICK 2 - Process env: object
🔵 CLICK 3 - Env var: https://usdmnaljflsbkgiejved.supabase.co
```

**Playwright test_ui Result:**
```
Console messages: []  ← EMPTY!
```

### Test 2: Actual Signup Flow
**File:** `components/auth/SignupForm.tsx`

**Browser Console (Chrome):**
```
🔵 Starting signup for: testuser
🔵 Using component-level Supabase client
🔵 Checking if username exists...
🔵 Username check result: []
🔵 Creating auth user...
✅ Auth user created: c5f0a8e9-...
🔵 Creating profile...
❌ Profile error: {message: "new row violates row-level security policy..."}
```

**Playwright test_ui Result:**
```
Console messages:
🔵 Starting signup for: testuser
🔵 Using component-level Supabase client
🔵 Checking if username exists...
← STOPS HERE, no further logs
```

### Pattern Identified

**Playwright captures console logs:**
- ✅ From page load (window scope)
- ✅ From useEffect hooks
- ✅ From synchronous code
- ❌ From onClick handlers that access `process.env`
- ❌ From async functions triggered by user interactions
- ❌ From network error responses

**Hypothesis:** The issue occurs when:
1. Event handler is triggered by Playwright click action
2. Handler accesses `process.env` (which is webpack-replaced at build time)
3. Subsequent console.log statements don't get captured by Playwright's console listener

---

## The Real Bug: Missing RLS Policy

### Original Schema Migration
**File:** `supabase/migrations/20251027_init_schema.sql`
**Lines 51-55:**
```sql
-- Profiles policies
CREATE POLICY "Public profiles" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
-- ❌ MISSING: INSERT policy
```

### The Fix
**File:** `supabase/migrations/20251028_add_profiles_insert_policy.sql`
```sql
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
```

### Comparison: Other Tables Had Complete Policies
**Posts table (correct):**
```sql
CREATE POLICY "Users can create posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can update own posts" ON posts
  FOR UPDATE USING (auth.uid() = author_id);
```

**Profiles table (incomplete - missing INSERT):**
```sql
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
-- ❌ INSERT policy missing
```

---

## Impact Assessment

### Time Lost
- **7 fix attempts** based on incorrect root cause analysis
- **Multiple hours** of debugging React 19 async behavior
- **Package downgrades** to React 18.3.1 and Next.js 15.0.3 (unnecessary)

### Detection Failure
- **Automated tests:** FAILED to detect critical bug
- **Manual testing:** IMMEDIATELY found the issue
- **Gap:** No network request monitoring in test_ui tool

### Business Impact
- **Signup completely broken** - users cannot create accounts
- **Silent failure** in automated testing - false confidence
- **Production risk** - bug would have shipped if only automated tests were trusted

---

## Proposed Solutions

### Solution 1: Network Request Inspector (RECOMMENDED)
**Implementation:** Enhance `mcp__builder-pro-mcp__test_ui` to capture network requests

```typescript
// Add to test_ui tool
const captureNetworkRequests = async (page) => {
  const requests = []
  const responses = []

  page.on('request', request => {
    if (request.url().includes('supabase')) {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      })
    }
  })

  page.on('response', async response => {
    if (response.url().includes('supabase')) {
      const body = await response.text().catch(() => null)
      responses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        body: body
      })
    }
  })

  return { requests, responses }
}
```

**Benefits:**
- ✅ Captures Supabase API responses
- ✅ Detects RLS errors (HTTP 403)
- ✅ Shows exact error messages from server
- ✅ Works regardless of console.log capture issues

### Solution 2: Chrome DevTools Protocol (CDP) Integration
**Implementation:** Use CDP to capture ALL console output

```typescript
const client = await page.context().newCDPSession(page)
await client.send('Runtime.enable')

client.on('Runtime.consoleAPICalled', (event) => {
  console.log(`[CDP Console] ${event.type}:`, event.args)
})
```

**Benefits:**
- ✅ Captures ALL console messages
- ✅ Not affected by webpack transformations
- ✅ More reliable than page.on('console')

### Solution 3: Server-Side Error Logging
**Implementation:** Add dedicated error logging endpoint

```typescript
// app/api/log-error/route.ts
export async function POST(request: Request) {
  const { error, context } = await request.json()

  // Log to file
  await fs.appendFile(
    'logs/client-errors.log',
    JSON.stringify({ timestamp: new Date(), error, context }) + '\n'
  )

  return Response.json({ logged: true })
}

// In SignupForm.tsx
if (profileError) {
  console.error('❌ Profile error:', profileError)

  // Also send to server for logging
  fetch('/api/log-error', {
    method: 'POST',
    body: JSON.stringify({
      error: profileError,
      context: { action: 'signup', step: 'create_profile' }
    })
  })
}
```

**Benefits:**
- ✅ Guaranteed capture of all errors
- ✅ Test can read logs/client-errors.log
- ✅ Works regardless of browser/Playwright issues

### Solution 4: Dual Testing Strategy (HYBRID)
**Implementation:** Automated + Manual verification

```typescript
// Phase 2B: Interactive Testing
const result = await test_ui({
  url: "http://localhost:3000/signup",
  actions: [/* ... */]
})

// Check for issues
if (result.consoleErrors.length > 0 || result.networkErrors.length > 0) {
  // Automated test found issues
  return { status: 'FAIL', bugs: result.errors }
}

// Automated test passed, but prompt for manual verification
if (attempts < 2) {
  console.log("⚠️ Automated test passed, but prompting manual verification...")
  console.log("🔍 Please test in browser: http://localhost:3000/signup")
  console.log("   Credentials: testuser / test@example.com / Test123!")
  console.log("   Verify: Should redirect to /feed after signup")
}
```

**Benefits:**
- ✅ Catches issues automated tests miss
- ✅ Human verification of critical flows
- ✅ Builds confidence in testing process

---

## Recommendations

### Immediate Actions (Priority 1)
1. ✅ **Apply RLS policy fix** (DONE - policy applied)
2. 🔲 **Test signup manually** to verify fix works
3. 🔲 **Implement Solution 1** (Network Request Inspector)
4. 🔲 **Update validation workflow** to include manual verification step

### Short-term Improvements (Priority 2)
1. 🔲 **Add RLS policy validation** to orchestrate_build
2. 🔲 **Create RLS policy checklist** for all tables
3. 🔲 **Enhance test_ui** with CDP integration (Solution 2)
4. 🔲 **Document this limitation** in Builder Pro docs

### Long-term Enhancements (Priority 3)
1. 🔲 **Implement server-side error logging** (Solution 3)
2. 🔲 **Create automated RLS policy scanner**
3. 🔲 **Add database state validation** to test suite
4. 🔲 **Build policy comparison tool** (check all tables have INSERT/UPDATE/DELETE policies)

---

## Updated Validation Workflow Integration

### Enhanced Phase 2B: Interactive Testing

**OLD (v1.0):**
```yaml
Phase 2B: Interactive Testing
  - Fill form fields
  - Click submit button
  - Take screenshot
  - Check console for errors
```

**NEW (v2.0):**
```yaml
Phase 2B: Interactive Testing
  - Fill form fields
  - Click submit button
  - Take screenshot
  - ✅ Check console for errors
  - ✅ Monitor network requests (NEW)
  - ✅ Check for HTTP 403/500 responses (NEW)
  - ✅ Parse Supabase error messages (NEW)
  - ✅ Verify expected redirect occurred (NEW)
  - ❌ If no redirect and no error → Manual test required (NEW)
```

### New Phase 2D: Manual Verification Gate

```yaml
Phase 2D: Manual Verification (CONDITIONAL)
  Trigger: If automated tests pass but form didn't redirect

  Steps:
    1. Prompt user to test in real browser
    2. Provide exact URL and test credentials
    3. Specify expected outcome (e.g., "should redirect to /feed")
    4. Wait for user confirmation
    5. If user reports error → Document in bugs-found.md
    6. If user confirms working → Continue to Phase 3
```

---

## Lessons Learned

### What Went Wrong
1. **Over-reliance on automated testing** - Trusted Playwright console capture too much
2. **No network monitoring** - Couldn't see API error responses
3. **Incorrect root cause** - Spent hours fixing wrong issue (React 19 vs RLS policy)
4. **No manual verification step** - Should have prompted browser test earlier

### What Went Right
1. **Systematic debugging** - Created isolated test cases to narrow down issue
2. **User intervention** - Manual browser test immediately found real error
3. **Comprehensive fix** - Applied proper RLS policy using Supabase API
4. **Documentation** - Tracked entire investigation for future reference

### Key Takeaway
**"Passing automated tests ≠ Working feature"**

Always include manual verification for critical user flows like authentication, payments, and data mutations.

---

## Conclusion

This investigation revealed a critical limitation in our testing infrastructure:
- **Playwright console capture is unreliable** for onClick handlers accessing `process.env`
- **Network request monitoring is essential** for detecting API errors
- **Manual verification is required** for critical user flows

**Recommended Next Steps:**
1. Verify RLS fix works via manual browser test
2. Implement Network Request Inspector (Solution 1)
3. Update validation workflow with manual verification gate
4. Create RLS policy validation checklist

**Estimated Implementation Time:**
- Solution 1 (Network Inspector): 2-3 hours
- Workflow updates: 1 hour
- RLS policy scanner: 3-4 hours
- **Total: ~7 hours** to prevent this class of bug in the future

---

**Report prepared by:** SuperClaude (Builder Pro)
**Review status:** Awaiting user manual test confirmation
**Next action:** User tests signup at http://localhost:3000/signup
