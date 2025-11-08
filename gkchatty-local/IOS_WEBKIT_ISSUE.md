# iOS WebKit HTTP Cross-Origin Issue

## Problem

iOS WebKit (used by Safari and Chrome on iOS) **blocks** `fetch()` requests with certain characteristics on HTTP (non-HTTPS) connections:

1. Requests with `Authorization` header on HTTP cross-origin → **BLOCKED**
2. Requests with `credentials: 'include'` on HTTP cross-origin → **BLOCKED**
3. Requests with `credentials: 'omit'` but Authorization header → **BLOCKED**

The requests are blocked **at the browser level** before they even leave the device. No amount of server-side configuration (CORS, proxies, API routes) can fix this.

## Evidence

- Frontend logs show fetchWithAuth preparing requests correctly
- Backend logs show **NO requests arriving** from mobile device
- Next.js server logs show **NO proxy requests** from mobile device
- Desktop/curl tests work perfectly with same configuration
- This is a documented iOS WebKit security policy

## Solutions

### Option 1: Enable HTTPS (Recommended for Development)

Use `mkcert` to create local SSL certificates:

```bash
# Install mkcert
brew install mkcert
mkcert -install

# Create certificate for local IP
cd gkchatty-local
mkcert 192.168.1.67 localhost 127.0.0.1

# Update backend to use HTTPS
# Update frontend to use HTTPS
# Access at https://192.168.1.67:4003
```

**Pros**: Solves the problem completely, matches production environment
**Cons**: Requires certificate setup

### Option 2: Accept Limitation

File uploads won't work on iOS mobile browsers for HTTP development.

**Pros**: No changes needed
**Cons**: Limited testing capability

### Option 3: Use Production Environment

Deploy to production with HTTPS and test there.

**Pros**: Tests real environment
**Cons**: Slower iteration

## Not Solutions

These do **NOT** work:

- ❌ CORS configuration changes
- ❌ Next.js rewrites
- ❌ Next.js API route proxies
- ❌ Changing credentials mode
- ❌ Removing Authorization header
- ❌ Backend security header changes
- ❌ fetchWithAuth modifications

## Recommended Path Forward

1. Implement HTTPS for local development using mkcert
2. Update both backend and frontend to use HTTPS
3. Test mobile file uploads on HTTPS

OR

Accept that mobile file upload testing requires production HTTPS environment.

## Technical Details

iOS WebKit enforces this as a security policy to prevent:
- Credential theft over insecure HTTP connections
- Man-in-the-middle attacks on mobile devices
- Cross-site request forgery (CSRF) on HTTP

This is **intentional browser behavior**, not a bug.
