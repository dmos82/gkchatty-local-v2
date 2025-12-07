# Session: Socket Disconnect on Logout Fix
**Date:** 2024-12-07
**Status:** ✅ COMPLETED

## Problem
After logging out, the user's status remained "online" to other users instead of showing as "offline".

## Root Cause Analysis

### Initial Theory (Incorrect)
The socket initialization useEffect in `DMContext.tsx` had `[getToken]` as its dependency array. Since `getToken` is a memoized function reference that never changes, when logout cleared the localStorage token:
- The useEffect didn't re-run
- The cleanup function wasn't called
- The socket stayed connected

### Actual Root Cause (Discovered via Testing)
Even after adding the custom event pattern to handle logout, the socket was disconnecting **too quickly** after emitting `presence:update { status: 'offline' }`. The emit is asynchronous, and `socket.disconnect()` was called before the server had time to process the presence update.

**Race Condition Timeline (Before Fix):**
```
T+0ms:  socket.emit('presence:update', { status: 'offline' })  // Async - not yet processed
T+1ms:  socket.disconnect()  // Socket closes immediately
T+?ms:  Server tries to process presence update → Socket already gone
```

## The Final Fix (Custom Event Pattern + 100ms Delay)

The solution uses a custom window event AND a critical 100ms delay to ensure the server processes the presence update before socket disconnect.

### File 1: `frontend/src/context/AuthContext.tsx`

Dispatch custom event BEFORE setting user to null:
```typescript
const logout = useCallback(async () => {
  console.log('[AuthContext] logout: Attempting API logout...');

  // Dispatch logout event BEFORE clearing state so socket can disconnect
  console.log('[AuthContext] logout: Dispatching auth:logout event');
  window.dispatchEvent(new CustomEvent('auth:logout'));

  try {
    const apiUrl = getApiBaseUrl();
    console.log(`[AuthContext] logout: Using API URL: ${apiUrl}`);
    const response = await fetch(`${apiUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'omit',
      mode: 'cors',
    });
    // ... rest of logout logic
  } catch (error) {
    console.error('[AuthContext] logout: Fetch Error during logout API call:', error);
  }
  // Always clear client state
  setUser(null);
  localStorage.removeItem('accessToken');
  console.log('[AuthContext] logout: Client-side user state and localStorage cleared.');
  setIsLoading(false);
}, []);
```

### File 2: `frontend/src/contexts/DMContext.tsx` (THE CRITICAL FIX)

Listen for custom event and disconnect WITH 100ms delay:
```typescript
// Listen for logout event from AuthContext - this fires BEFORE user state changes
// This is critical because the component may unmount before useEffect cleanup runs
useEffect(() => {
  const handleLogout = async () => {
    console.log('[DMContext] auth:logout event received');
    if (socket?.connected) {
      console.log('[DMContext] Emitting presence:update offline via auth:logout handler. Socket ID:', socket.id);
      socket.emit('presence:update', { status: 'offline' });

      // ⚠️ CRITICAL: Wait 100ms for server to process the presence update
      // before disconnecting. Without this delay, socket.disconnect() happens
      // before the server can process the emit, causing presence to not update.
      await new Promise(resolve => setTimeout(resolve, 100));

      socket.disconnect();
      console.log('[DMContext] Socket disconnected via auth:logout handler');
    }
    setSocket(null);
    setIsConnected(false);
    setOnlineUsers([]);
    setConversations([]);
    setMessages([]);
  };

  window.addEventListener('auth:logout', handleLogout);
  return () => {
    window.removeEventListener('auth:logout', handleLogout);
  };
}, [socket]);
```

## How It Works Now

1. User clicks logout → AuthContext.logout() called
2. **FIRST:** `window.dispatchEvent(new CustomEvent('auth:logout'))` fires synchronously
3. DMContext's event listener receives event immediately (while still mounted)
4. DMContext emits `presence:update { status: 'offline' }` to server
5. **WAIT 100ms** - Allows server time to process the presence update
6. Server updates MongoDB UserPresence to 'offline'
7. Server broadcasts `presence:changed` to all connected clients
8. DMContext calls `socket.disconnect()`
9. **THEN:** AuthContext sets `user` to null
10. Component unmount happens (but socket already disconnected)
11. Other users see the logged-out user as "offline"

## Why the 100ms Delay Was Critical

The custom event pattern alone wasn't enough because:
- `socket.emit()` is asynchronous - it sends the message and returns immediately
- `socket.disconnect()` closes the connection synchronously
- Without a delay, the socket closes before the server processes the emit
- The presence update gets lost because the socket is already gone

**Timeline With Fix:**
```
T+0ms:    socket.emit('presence:update', { status: 'offline' })
T+1-50ms: Server receives and processes presence update
T+50ms:   Server broadcasts presence:changed to all clients
T+100ms:  socket.disconnect()  // Now safe to close
```

## Backend Logging Added (for debugging)

Added detailed logging in `backend/src/services/socketService.ts`:

```typescript
// Disconnect handler (lines 146-158)
socket.on('disconnect', async (reason) => {
  console.log(`[Socket DISCONNECT] User: ${authSocket.username}, Socket: ${socket.id}, Reason: ${reason}`);
  this.removeUserSocket(authSocket.userId, socket.id);

  const remainingSockets = this.userSocketMap.get(authSocket.userId);
  console.log(`[Socket DISCONNECT] Remaining sockets for ${authSocket.username}: ${remainingSockets?.size || 0}`);
  if (!remainingSockets || remainingSockets.size === 0) {
    console.log(`[Socket DISCONNECT] No remaining sockets, setting ${authSocket.username} to OFFLINE`);
    await this.updatePresence(authSocket, 'offline', socket.id, true);
  }
});

// Presence update handler (lines 391-400)
private async handlePresenceUpdate(
  socket: AuthenticatedSocket,
  payload: PresenceUpdatePayload
): Promise<void> {
  console.log(`[Socket PRESENCE] Received presence:update from ${socket.username}: status=${payload.status}`);
  await this.updatePresence(socket, payload.status, socket.id, false, payload.customStatus);
}

// Presence broadcast (lines 500-510)
console.log(`[Socket PRESENCE BROADCAST] Broadcasting presence:changed for ${socket.username}: status=${presence.status}`);
this.io?.emit('presence:changed', {
  userId: socket.userId,
  username: socket.username,
  status: presence.status,
  customStatus: presence.customStatus,
  lastSeenAt: presence.lastSeenAt,
});
```

## Verification Test Script

Created `backend/scripts/test-socket-disconnect.js` to verify the backend was working correctly:

```javascript
const io = require('socket.io-client');

const API_URL = 'http://localhost:4001';

async function main() {
  console.log('=== Socket Disconnect Test ===\n');

  // Step 1: Login to get token
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'dev123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // Step 2: Connect socket
  const socket = io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('presence:changed', (data) => {
    console.log(`   >> presence:changed event received:`, JSON.stringify(data));
  });

  await new Promise((resolve) => socket.once('connect', resolve));

  // Step 3: Emit presence:update offline
  console.log('Emitting presence:update { status: "offline" }...');
  socket.emit('presence:update', { status: 'offline' });

  // Wait for server to process
  await new Promise((r) => setTimeout(r, 500));

  // Step 4: Disconnect
  socket.disconnect();

  // Step 5: Verify via API
  const presenceRes = await fetch(`${API_URL}/api/conversations/users/online`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const presenceData = await presenceRes.json();
  console.log('Online users:', JSON.stringify(presenceData, null, 2));

  process.exit(0);
}

main().catch(console.error);
```

**Test Result:** The backend correctly:
1. Received `presence:update { status: 'offline' }`
2. Updated the user's presence in MongoDB
3. Broadcast `presence:changed` with `status: 'offline'` to all clients

This confirmed the **backend was working correctly** - the issue was purely the frontend timing.

## Debugging Journey

1. **First attempt**: Added `user` to useEffect dependencies - didn't work (race condition)
2. **Second attempt**: Added custom event without delay - problem persisted
3. **Investigation**: Added backend logging - saw disconnect happening before presence update
4. **Third attempt**: Created test script - confirmed backend works when given time
5. **Final fix**: Added 100ms delay between emit and disconnect - **SUCCESS**

## Files Modified

1. `frontend/src/contexts/DMContext.tsx` - Added auth:logout listener with 100ms delay
2. `frontend/src/context/AuthContext.tsx` - Already had custom event dispatch (from earlier attempt)
3. `backend/src/services/socketService.ts` - Added detailed logging for debugging

## Test Scripts (Can Be Deleted)

- `backend/scripts/test-socket-disconnect.js` - Socket disconnect verification
- `/tmp/test-socket-disconnect.js` - Copy of above

## Key Takeaway

**Async socket operations need time to complete.** When emitting a message before disconnect, always add a small delay to ensure the server processes the emit before the socket closes.

```typescript
// ❌ WRONG - Disconnect happens before server processes emit
socket.emit('presence:update', { status: 'offline' });
socket.disconnect();

// ✅ CORRECT - Server has time to process emit
socket.emit('presence:update', { status: 'offline' });
await new Promise(resolve => setTimeout(resolve, 100));
socket.disconnect();
```
