# Mobile Authentication Testing Guide

## Problem Summary

Mobile authentication was failing because cross-port cookie authentication doesn't work reliably on mobile browsers. We've implemented a dual authentication strategy:
- **Desktop**: HttpOnly cookies (existing)
- **Mobile**: Authorization header with JWT from localStorage

## What Was Changed

### Backend Changes
1. **Added test endpoint**: `/api/mobile-test` - No auth required, tests basic connectivity
2. **CORS updated**: Now allows any local network IP matching `192.168.x.x:4003`
3. **Authentication middleware**: Already supports both cookie and Bearer token authentication

### Frontend Changes
1. **Created `fetchWithAuth` wrapper** (`/frontend/src/lib/fetchWithAuth.ts`)
   - Automatically adds Authorization header from localStorage
   - Includes cookies for backward compatibility
   - Extensive debug logging
2. **Updated 40+ fetch calls** across the application to use `fetchWithAuth`
3. **Login updated** to store JWT token in localStorage
4. **Created diagnostic page**: `/mobile-test` - Comprehensive testing interface

## Testing Instructions

### Step 1: Access the Mobile Test Page

On your mobile device, navigate to:
```
http://192.168.x.x:4003/mobile-test
```
(Replace `192.168.x.x` with your actual local IP)

**Expected**: Page loads with environment information displayed

### Step 2: Run Connectivity Test (No Auth Required)

1. Click **"Run Connectivity Test"** button
2. **Expected Success Response**:
   ```json
   {
     "success": true,
     "origin": "http://192.168.x.x:4003",
     "ip": "::ffff:192.168.x.x",
     "message": "Mobile connectivity test successful - backend is reachable",
     "timestamp": "2025-11-04T..."
   }
   ```

**If this fails**:
- ❌ Your device cannot reach the backend (network issue)
- Check firewall settings
- Verify backend is running on port 4001
- Verify mobile is on same WiFi network

**If this succeeds**:
- ✅ Backend is reachable from mobile
- Proceed to Step 3

### Step 3: Login

1. Navigate to `/auth` on mobile
2. Login with your credentials
3. **Expected**: Redirected to homepage after login
4. Check the environment info on `/mobile-test` page
5. **Expected**: "Has Token" should show ✅ YES

**If "Has Token" shows ❌ NO**:
- Login failed to store token
- Check browser console for errors during login
- Try clearing browser data and logging in again

### Step 4: Run Authentication Test

1. On `/mobile-test` page, click **"Run Auth Test"** button
2. **Expected Success Response**:
   ```json
   {
     "status": 200,
     "ok": true,
     "data": {
       "enableDarkMode": false,
       "defaultKnowledgeBaseId": null,
       ...
     }
   }
   ```

**If this fails with 401 Unauthorized**:
- ❌ Authorization header not being sent
- Check browser console for `[fetchWithAuth]` logs
- Verify token is in localStorage
- Check backend logs for request details

**If this succeeds**:
- ✅ Authentication is working correctly
- All other features should now work on mobile

## Browser Console Debugging

Open browser developer tools (if available on mobile) and look for these logs:

### Expected Logs During Auth Test

```
[fetchWithAuth] ===== AUTH DEBUG =====
[fetchWithAuth] Endpoint: /api/users/me/settings
[fetchWithAuth] Full URL: http://192.168.x.x:4001/api/users/me/settings
[fetchWithAuth] Token in localStorage: YES (eyJhbGciOiJIUzI1NiIs...)
[fetchWithAuth] ✓ Authorization header added
[fetchWithAuth] Final headers: {"Content-Type":"application/json","Authorization":"Bearer eyJhbGci..."}
[fetchWithAuth] ==================
```

## Backend Log Verification

In your terminal running the backend, you should see:

```
=== MOBILE TEST REQUEST ===
Origin: http://192.168.x.x:4003
IP: ::ffff:192.168.x.x
User-Agent: Mozilla/5.0 (iPhone; ...)
=========================
```

For authenticated requests, you should see:
```
[Request Logger] Incoming: GET /api/users/me/settings from Origin: http://192.168.x.x:4003
[Protect Middleware] Token found in header
```

## Troubleshooting

### Issue: Connectivity Test Fails

**Symptoms**: Cannot reach `/api/mobile-test`

**Possible Causes**:
1. Backend not running
2. Mobile device on different network
3. Firewall blocking port 4001
4. Wrong IP address

**Solutions**:
1. Verify backend is running: `curl http://localhost:4001/api/mobile-test` on desktop
2. Verify mobile is on same WiFi network
3. Check system firewall allows port 4001
4. Use `ifconfig` or `ip addr` to verify your machine's IP

### Issue: Auth Test Fails (401)

**Symptoms**: Connectivity test passes, but auth test returns 401

**Possible Causes**:
1. Token not in localStorage
2. Token expired
3. Authorization header not being sent
4. CORS blocking request

**Solutions**:
1. Check "Has Token" in environment info
2. Log out and log back in to get fresh token
3. Check browser console for `[fetchWithAuth]` logs showing token
4. Check backend logs for CORS errors

### Issue: "Has Token" Shows NO After Login

**Symptoms**: Can login but token not stored

**Possible Causes**:
1. Login endpoint not returning token
2. localStorage not working on mobile browser
3. JavaScript error during login

**Solutions**:
1. Check browser console for errors
2. Try a different mobile browser
3. Clear browser data and retry

## Expected Behavior After Fixes

Once authentication is working:

✅ **Documents page** loads file tree
✅ **Personas tab** shows personas list
✅ **Admin dashboard** all tabs load data
✅ **File uploads** work in document manager
✅ **Folder creation** works
✅ **PDF viewer** opens documents

## Technical Details

### Why This Solution Works

**Problem**: Mobile browsers don't reliably support HttpOnly cookies across different ports in development

**Solution**: Dual authentication strategy
- Desktop continues using cookies (more secure)
- Mobile uses Authorization header (more reliable across ports)
- Backend accepts both methods

### Security Considerations

**Development**: JWT in localStorage is acceptable for local development

**Production**:
- Use same domain for frontend/backend (cookies work)
- Or continue with Authorization header approach
- Consider refresh token rotation
- Use HTTPS

## Files Modified

See summary for complete list, but key files:

**Frontend**:
- `/frontend/src/lib/fetchWithAuth.ts` - New wrapper
- `/frontend/src/stores/fileTreeStore.ts` - All file operations
- `/frontend/src/components/admin/*` - All admin components
- `/frontend/src/context/AuthContext.tsx` - Token storage

**Backend**:
- `/backend/src/index.ts` - Test endpoint + CORS
- `/backend/src/middleware/authMiddleware.ts` - Already supported both methods

## Next Steps

1. Test on mobile device using `/mobile-test` page
2. Report results (include screenshots if possible)
3. If connectivity test passes but auth fails, share browser console logs
4. If connectivity test fails, check network/firewall settings
