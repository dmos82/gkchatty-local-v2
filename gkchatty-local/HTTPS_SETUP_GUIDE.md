# HTTPS Setup Guide - GKChatty Local

**Status:** ✅ Backend configured, certificates generated
**Next:** Install cert on iOS device and update frontend

---

## What We've Done

### 1. Generated SSL Certificates ✅
```bash
mkcert 192.168.1.67 localhost 127.0.0.1
```

**Files created:**
- `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/192.168.1.67+2.pem` (certificate)
- `/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/192.168.1.67+2-key.pem` (private key)
- Root CA: `/Users/davidjmorin/Library/Application Support/mkcert/rootCA.pem`

**Expires:** February 4, 2028

### 2. Updated Backend ✅

**Changes to `backend/src/index.ts`:**
- Added HTTPS server on port 4002
- Kept HTTP server on port 4001 (for desktop compatibility)
- Both servers run simultaneously
- Graceful shutdown handles both servers

**Backend now listens on:**
- `http://localhost:4001` (HTTP - for desktop)
- `https://192.168.1.67:4002` (HTTPS - for mobile)

**Changes to `backend/.env`:**
- Added `https://192.168.1.67:4004` to `FRONTEND_URL` for CORS

---

## Impact on Desktop (NO BREAKING CHANGES)

✅ Desktop can continue using `http://localhost:4003` → works exactly as before
✅ All existing functionality preserved
✅ Zero disruption to HTTP workflow

---

## Next Steps

### Step 1: Install Certificate on iOS Device

**A. Get the rootCA.pem file:**
```bash
# Location is: /Users/davidjmorin/Library/Application Support/mkcert/rootCA.pem

# Option 1: AirDrop (recommended)
# 1. Open Finder
# 2. Navigate to: /Users/davidjmorin/Library/Application Support/mkcert/
# 3. Right-click rootCA.pem → Share → AirDrop
# 4. Send to your iPhone

# Option 2: Email
# Attach rootCA.pem to email and send to yourself
```

**B. Install on iPhone:**
1. Open the rootCA.pem file (from AirDrop or email)
2. Tap "Allow" when prompted
3. Go to **Settings** > **Profile Downloaded**
4. Tap **Install** (enter passcode if prompted)
5. Tap **Install** again to confirm

**C. Enable Full Trust:**
1. Go to **Settings** > **General** > **About**
2. Scroll to bottom: **Certificate Trust Settings**
3. Find "mkcert [your-name]"
4. Toggle **ON** to enable full trust
5. Tap **Continue** to confirm

### Step 2: Update Frontend for HTTPS

**Currently:** Frontend needs to be updated to support HTTPS for mobile access

**Option A: Simplest - Environment Variable (Recommended)**

Update `frontend/.env.local`:
```bash
# Current
BACKEND_URL=http://192.168.1.67:4001

# New - Add HTTPS backend URL
BACKEND_URL_HTTPS=https://192.168.1.67:4002
```

Then update `frontend/src/lib/config.ts` to use HTTPS URL when accessed via HTTPS:
```typescript
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return API_BASE_URL_SERVER;
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol; // 'http:' or 'https:'

  // If accessing via HTTPS, use HTTPS backend
  if (protocol === 'https:') {
    return `https://${hostname}:4002`;
  }

  // If accessed via IP address (not localhost), use network IP
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:4001`;
  }

  return API_BASE_URL_CLIENT; // http://localhost:4001
}
```

**Option B: Next.js HTTPS Dev Server (Complete Solution)**

Update `frontend/package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "dev:https": "next dev --experimental-https --experimental-https-key ../192.168.1.67+2-key.pem --experimental-https-cert ../192.168.1.67+2.pem"
  }
}
```

Then run:
```bash
cd frontend
pnpm dev:https
```

Frontend will be available at:
- `http://localhost:4003` (HTTP - desktop)
- `https://192.168.1.67:4004` (HTTPS - mobile)

### Step 3: Test Mobile File Upload

After installing the certificate on iOS and updating frontend:

**On iOS device:**
1. Open Safari
2. Navigate to: `https://192.168.1.67:4004`
3. Login as 'dev' user
4. Go to Document Manager
5. Try uploading a file
6. ✅ Should work now!

### Step 4: Test PDF Viewer

- Navigate to a PDF in Document Manager
- ✅ PDF should load correctly on mobile

---

## Troubleshooting

### "Certificate Not Trusted" on iOS

**Symptom:** iOS shows "This Connection Is Not Private"

**Fix:**
1. Verify certificate is installed: Settings > General > VPN & Device Management
2. Verify trust is enabled: Settings > General > About > Certificate Trust Settings
3. Make sure you're accessing `https://192.168.1.67:4004` (not http)

### HTTPS Server Not Starting

**Check backend logs for:**
```
SSL certificates not found. Running HTTP only.
```

**Fix:**
1. Verify certificates exist:
   ```bash
   ls -la "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/192.168.1.67+2"*
   ```
2. Re-generate if missing:
   ```bash
   cd "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local"
   mkcert 192.168.1.67 localhost 127.0.0.1
   ```

### Port Already in Use

**Symptom:**
```
Error: Port 4002 is already in use.
```

**Fix:**
```bash
# Find process using port 4002
lsof -ti :4002

# Kill the process
kill -9 <PID>

# Or kill all node processes
pkill -f "pnpm dev"
```

### Desktop Stops Working

**This should NEVER happen** because HTTP server still runs on port 4001.

If it does:
1. Check backend logs for errors
2. Verify HTTP server started: Look for "🚀 HTTP API Server listening on port 4001"
3. Restart backend

---

## Testing Checklist

### Desktop (HTTP) - Should Still Work
- [ ] Can access `http://localhost:4003`
- [ ] Can login
- [ ] Can upload files
- [ ] Can view PDFs
- [ ] No certificate warnings

### Mobile (HTTPS) - Should Now Work
- [ ] Certificate installed on iOS device
- [ ] Certificate trust enabled
- [ ] Can access `https://192.168.1.67:4004`
- [ ] Can login
- [ ] **Can upload files** (previously broken)
- [ ] Can view PDFs
- [ ] No "Load failed" errors

---

## Rollback Plan

If HTTPS causes issues, rollback is simple:

1. **Stop backend:**
   ```bash
   pkill -f "pnpm dev"
   ```

2. **Revert backend/src/index.ts:**
   - Comment out HTTPS server section
   - Keep only HTTP server

3. **Restart backend:**
   ```bash
   cd backend && pnpm dev
   ```

Desktop will work immediately. Mobile file uploads will fail again (but that's the original state).

---

## Production Deployment

For production, use real SSL certificates from Let's Encrypt:

```bash
# Install certbot
brew install certbot

# Get certificate for your domain
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Update backend/src/index.ts to use production certs
```

---

## Summary

**What Changed:**
- Backend now runs both HTTP and HTTPS servers simultaneously
- HTTP for desktop compatibility
- HTTPS for mobile iOS WebKit compatibility

**What Didn't Change:**
- All existing desktop functionality
- All API routes
- All authentication logic
- Database connections

**Why This Works:**
- iOS WebKit requires HTTPS for cross-origin requests with authentication
- Desktop browsers don't have this restriction
- Running both protocols allows both to work

**Next Action:**
Install the certificate on your iOS device and test file uploads!
