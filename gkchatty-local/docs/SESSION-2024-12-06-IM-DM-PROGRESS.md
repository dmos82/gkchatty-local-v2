# GKChatty IM/DM Feature Progress - December 6, 2024

## Session Summary

This session focused on fixing bugs in the newly implemented IM (Instant Messaging) / DM (Direct Messages) popup chat system.

---

## Bugs Fixed Today

### 1. Own Message Detection Bug (FIXED)

**Problem:** When reopening a chat window, ALL messages appeared as if they were from the other user. The user's own messages weren't displaying with yellow bubbles on the right side.

**Root Cause:** `IMChatWindow.tsx` was using `localStorage.getItem('userId')` which returns `null` because `AuthContext` only stores `accessToken` in localStorage, not the user ID.

**Fix Applied:**
```typescript
// OLD (broken):
const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

// NEW (working):
const currentUserId = user?._id || null;  // from useAuth() hook
```

**File:** `frontend/src/components/im/IMChatWindow.tsx` line 307-308

### 2. User Avatar Not Displaying (FIXED - Previous Session)

**Problem:** User's own messages showed a fallback letter instead of their uploaded avatar photo.

**Root Cause:** Code was fetching from non-existent endpoint `/api/users/${userId}/icon`

**Fix:** Changed to fetch from `/api/users/me/settings` and parse `data.settings?.iconUrl`

---

## Production Deployment Considerations Discussed

### Environment Variables Required

**Frontend (Netlify):**
```
NEXT_PUBLIC_API_URL=https://gkchatty-api.onrender.com
```

**Backend (Render):**
```
CORS_ORIGIN=https://apps.gkchatty.com,https://staging-gk-chatty.netlify.app
FRONTEND_URL=https://apps.gkchatty.com
```

### Socket.IO CORS Configuration

Already configured in `socketService.ts:67-71`:
```typescript
cors: {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4003'],
  methods: ['GET', 'POST'],
  credentials: true,
}
```

### Scaling Warning

Current architecture uses **in-memory user tracking** (`userSocketMap`). Works fine with single Render instance. If scaling to multiple instances, would need `@socket.io/redis-adapter`.

### 50 Concurrent Users Analysis

- Socket.IO can handle 10,000+ connections (50 users = ~0.5% capacity)
- MongoDB writes: ~100 messages/min manageable
- Render Starter tier ($7/mo) handles this comfortably

---

## Current Service Status

| Service | Port | Status |
|---------|------|--------|
| Backend API + Socket.IO | 4001 | Running |
| Frontend (Next.js) | 4003 | Running |
| MongoDB | 27017 | Running |

---

## Files Created/Modified for IM/DM Feature

### Backend (New Files - Untracked)
- `src/models/ConversationModel.ts`
- `src/models/DirectMessageModel.ts`
- `src/models/UserPresenceModel.ts`
- `src/controllers/conversationController.ts`
- `src/routes/conversationRoutes.ts`
- `src/services/socketService.ts`

### Frontend (New Files - Untracked)
- `src/components/im/IMToggle.tsx` - Toggle button in header
- `src/components/im/IMBuddyList.tsx` - Online users panel
- `src/components/im/IMChatWindow.tsx` - Popup chat window
- `src/contexts/DMContext.tsx` - Socket.IO + DM state management
- `src/contexts/IMContext.tsx` - UI state (windows, positions)

### Modified Files
- `backend/src/index.ts` - Socket.IO integration
- `frontend/src/app/layout.tsx` - Context providers
- `frontend/tailwind.config.js` - Chat window animations

---

## Next Steps (Not Yet Implemented)

### File Sharing Between Users

The `DirectMessage` model already has an `attachments` field:
```typescript
attachments?: Array<{
  type: string;      // 'image', 'file', 'video', 'audio'
  url: string;       // S3 presigned URL
  name: string;      // Original filename
  size: number;      // File size in bytes
}>;
```

**Recommended Approach:** Reuse existing S3 infrastructure
1. Add file picker to chat window
2. Upload to S3 via existing document upload endpoint
3. Send message with attachment via Socket.IO
4. Display inline preview (images) or download link (files)

**S3 Path Suggestion:**
```
dm_attachments/{conversationId}/{messageId}/{filename}
```

---

## Git Status

- **Branch:** `staging`
- **Uncommitted:** 7 modified files + 15+ new IM/DM files
- **Action Needed:** Commit IM/DM feature to preserve work

---

## Commands to Resume

```bash
# Start services
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem/gkchatty-local/backend
npm run dev

cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem/gkchatty-local/frontend
npm run dev

# Access
# Frontend: http://localhost:4003
# Backend: http://localhost:4001
```

---

## Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Socket service | `backend/src/services/socketService.ts` |
| Chat window UI | `frontend/src/components/im/IMChatWindow.tsx` |
| DM state/socket | `frontend/src/contexts/DMContext.tsx` |
| Message model | `backend/src/models/DirectMessageModel.ts` |
| Auth context | `frontend/src/contexts/AuthContext.tsx` |

---

*Last Updated: December 6, 2024*
