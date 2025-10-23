# Test Credential Management

**Problem:** Test credentials were scattered across multiple files, leading to drift and authentication failures.

**Solution:** Centralized credential management with automated verification.

---

## 📋 Single Source of Truth

**File:** `.test-credentials.json`

This file contains **all** test credentials used across the entire monorepo.

```json
{
  "credentials": {
    "dev": {
      "username": "dev",
      "password": "dev123",
      "role": "admin",
      "description": "Primary development test user",
      "usedBy": [
        "scripts/stress-test.sh",
        "MCP environment variables",
        "E2E tests"
      ]
    }
  }
}
```

---

## 🔐 Where Credentials Are Used

### 1. Stress Test Script
**File:** `scripts/stress-test.sh`
**Location:** Line ~122
**Pattern:** `{"username":"dev","password":"dev123"}`

### 2. MCP Environment Variables
**File:** User's shell environment or `~/.config/claude/mcp.json`
**Variables:**
- `GKCHATTY_USERNAME=dev`
- `GKCHATTY_PASSWORD=dev123`

### 3. MongoDB Seed Data
**File:** `packages/backend/src/index.ts` (or seed script)
**Note:** User `dev` is seeded on first startup with password `dev123`

### 4. E2E Tests
**Files:** `packages/backend/src/routes/__tests__/*.test.ts`
**Pattern:** Login tests use `dev` / `dev123`

---

## ✅ Automated Verification

Run this script **before every commit** to ensure consistency:

```bash
./scripts/verify-credentials.sh
```

**What it checks:**
1. ✅ Stress test script has correct credentials
2. ✅ MCP environment matches (if configured)
3. ✅ MongoDB user exists
4. ✅ Password actually works via API call

**Output:**
```
🔐 Verifying Test Credentials Consistency
==========================================
✅ All credential checks passed!
```

---

## 🚫 How to PREVENT Drift

### Rule 1: Never Hardcode Credentials
❌ **BAD:**
```bash
curl -d '{"username":"dev","password":"SOME_PASSWORD_HERE"}'
```

✅ **GOOD:**
```bash
# Load from .test-credentials.json
DEV_USER=$(jq -r '.credentials.dev.username' .test-credentials.json)
DEV_PASS=$(jq -r '.credentials.dev.password' .test-credentials.json)
curl -d "{\"username\":\"$DEV_USER\",\"password\":\"$DEV_PASS\"}"
```

### Rule 2: Update the Central File First
When changing credentials:
1. Update `.test-credentials.json`
2. Run `./scripts/verify-credentials.sh` to find mismatches
3. Fix all locations listed in the output
4. Rerun verification until it passes

### Rule 3: Document New Usage
If you add credentials to a new file:
1. Add it to the `usedBy` array in `.test-credentials.json`
2. Add a check in `verify-credentials.sh`

---

## 🔧 Common Issues & Fixes

### Issue 1: "Invalid credentials" error in tests
**Symptom:** Stress test or E2E tests fail with `{"message":"Invalid credentials"}`

**Diagnosis:**
```bash
./scripts/verify-credentials.sh
```

**Fix:**
1. Check what `.test-credentials.json` says the password should be
2. Find the mismatch (script will show you)
3. Update the mismatched file
4. Verify: `./scripts/verify-credentials.sh`

### Issue 2: MongoDB user has wrong password
**Symptom:** Verification script says "Password INCORRECT!"

**Fix:**
You need to reset the user's password in MongoDB:

```javascript
// Option A: Update password hash directly
mongosh gkckb --eval "
  const bcrypt = require('bcryptjs');
  const newPassword = 'dev123';
  const hash = bcrypt.hashSync(newPassword, 10);
  db.users.updateOne(
    {username: 'dev'},
    {$set: {password: hash}}
  );
"
```

```bash
# Option B: Delete and re-seed
mongosh gkckb --eval "db.users.deleteOne({username: 'dev'})"
# Then restart backend (it will re-seed the user)
cd packages/backend && npm start
```

### Issue 3: Password works locally but not in CI/CD
**Symptom:** Tests pass on your machine, fail in GitHub Actions

**Root Cause:** Environment variables not set in CI

**Fix:**
Add to `.github/workflows/*.yml`:
```yaml
env:
  GKCHATTY_USERNAME: dev
  GKCHATTY_PASSWORD: dev123
```

---

## 📊 Verification Output Explained

```bash
🔍 Checking scripts/stress-test.sh...
  ✅ Credentials match
```
✅ = Stress test uses the correct dev/dev123 credentials

```bash
🔍 Checking MongoDB actual user...
  ✅ User 'dev' exists in MongoDB
     ✅ Password verified via API
```
✅ = User exists AND password works (tested by actually logging in)

```bash
⚠️  MongoDB not running (cannot verify)
```
⚠️ = Non-critical warning - can't verify but not necessarily broken

```bash
❌ Password INCORRECT!
```
❌ = **CRITICAL** - Password in `.test-credentials.json` doesn't match MongoDB

---

## 🎯 Best Practices

### For Developers
1. Run `./scripts/verify-credentials.sh` before pushing
2. Never commit credential changes without verification
3. If you add a new test user, document it in `.test-credentials.json`

### For CI/CD
Add verification to your pipeline:
```yaml
- name: Verify test credentials
  run: ./scripts/verify-credentials.sh
```

### For New Team Members
1. Read `.test-credentials.json` to know what credentials exist
2. Never guess passwords - always check the source of truth
3. If tests fail with auth errors, run verify script first

---

## 🔄 Credential Rotation

When you need to change the `dev` user password:

1. **Update central file:**
   ```bash
   # Edit .test-credentials.json
   # Change: "password": "dev123" → "password": "new_password"
   ```

2. **Find all usages:**
   ```bash
   ./scripts/verify-credentials.sh
   # It will show you what needs updating
   ```

3. **Update MongoDB:**
   ```javascript
   mongosh gkckb --eval "
     db.users.updateOne(
       {username: 'dev'},
       {$set: {password: bcrypt.hashSync('new_password', 10)}}
     );
   "
   ```

4. **Verify everything:**
   ```bash
   ./scripts/verify-credentials.sh
   # Should show all ✅
   ```

5. **Commit all changes together:**
   ```bash
   git add .test-credentials.json scripts/stress-test.sh # ... etc
   git commit -m "chore: Rotate dev user password"
   ```

---

## ❓ FAQ

**Q: Why not use environment variables everywhere?**
A: Environment variables are great for production, but for tests we need:
- Consistency across developers
- Version control (so everyone has same creds)
- Easy verification

**Q: Are these credentials secure?**
A: These are **TEST ONLY** credentials. They should:
- ❌ NEVER be used in production
- ❌ NEVER contain real user data
- ✅ Only exist in test databases
- ✅ Be documented publicly (not a secret)

**Q: What if I need different credentials for different test scenarios?**
A: Add them to `.test-credentials.json`:
```json
{
  "credentials": {
    "dev": {...},
    "test_user_basic": {
      "username": "testuser",
      "password": "test123",
      "role": "user"
    }
  }
}
```

**Q: Can I automate credential rotation?**
A: Yes! Create a script that:
1. Generates new random password
2. Updates `.test-credentials.json`
3. Updates MongoDB
4. Runs verification
5. Commits if successful

---

**Last Updated:** 2025-10-22
**Maintained By:** DevOps Team
**Related Scripts:**
- `./scripts/verify-credentials.sh` - Verification
- `.test-credentials.json` - Source of truth
