# Session: December 7, 2025 - DM Notification Fix

## Summary
Fixed notification badge issues in the IM (Instant Messaging) floating chat window system. Users were experiencing duplicate notifications and notifications appearing even when the chat window was open.

## Issues Addressed

### Issue 1: Duplicate Notification Badges (2 per message)
**Symptom:** Every incoming message caused the unread badge to increment by 2 instead of 1.

**Root Cause:** The backend emits `dm:receive` to TWO rooms:
1. `conversation:${conversationId}` - for users viewing that conversation
2. `user:${participantId}` - for offline notification

When a user is in the conversation, they receive the event twice (once from each room).

**Fix:** Added `processedMessageIds` ref in DMContext.tsx to track already-processed message IDs and only increment unread count on first occurrence.

**Commit:** `78ff7b4`

### Issue 2: Notifications When Chat Window is Open (First Attempt)
**Symptom:** Users saw notification badges even when actively viewing the conversation.

**Root Cause (Initial):** Stale closure in socket handler - `selectedConversation` state was captured when the socket handler was created and never updated.

**Fix:** Added `selectedConversationRef` that syncs with `selectedConversation` state, then use the ref in the socket handler.

**Commit:** `7f7ac21`

### Issue 3: Notifications Still Appearing with IM Windows Open
**Symptom:** After previous fix, notifications still appeared when IM floating chat window was open.

**Root Cause (Deeper):** The IM system (`IMContext`) uses floating chat windows that are SEPARATE from `DMContext.selectedConversation`. The IM windows manage their own state via `chatWindows[]` array with properties like `conversationId` and `isMinimized`.

**Architecture Discovery:**
- `DMContext.selectedConversation` - tracks the conversation open in the DM view (full-page chat)
- `IMContext.chatWindows[]` - tracks floating IM windows (AIM-style popup chats)
- These two contexts don't communicate about which conversations are being viewed!

**Fix:** Created a bridge between IMContext and DMContext:
1. Added `openConversationIdsRef` and `setOpenConversationIds()` to DMContext
2. Updated `dm:receive` handler to check BOTH `selectedConversationRef` AND `openConversationIdsRef`
3. Added sync effect in `IMContainer.tsx` that:
   - Filters `chatWindows` to get non-minimized windows with conversation IDs
   - Calls `setOpenConversationIds()` with those IDs
   - Also marks those conversations as read automatically

**Commit:** `624ce1e`

## Files Modified

### DMContext.tsx
- Added `processedMessageIds` ref for deduplication
- Added `selectedConversationRef` for socket handler
- Added `openConversationIdsRef` to track open IM windows
- Added `setOpenConversationIds()` function
- Updated `dm:receive` handler to check all open conversations
- Added `setOpenConversationIds` to context type and value

### IMContainer.tsx
- Added import of `useDM` from DMContext
- Added `useEffect` bridge that syncs open IM windows to DMContext

## Key Technical Concepts

### Stale Closures in Socket Handlers
When you create a socket event handler in a useEffect, it captures the state values at the time of creation. If the state changes later, the handler still has the old values. Solution: use refs that are updated via separate useEffects.

```tsx
// BAD - stale closure
socket.on('message', () => {
  console.log(selectedConversation); // Always the initial value!
});

// GOOD - ref updated by useEffect
const selectedConversationRef = useRef(null);
useEffect(() => {
  selectedConversationRef.current = selectedConversation;
}, [selectedConversation]);

socket.on('message', () => {
  console.log(selectedConversationRef.current); // Always current!
});
```

### Context Bridge Pattern
When two React contexts need to share state:
1. One context exposes a setter function
2. A component that has access to both contexts syncs them via useEffect

```tsx
// In component inside BOTH providers:
const { chatWindows } = useIM();
const { setOpenConversationIds } = useDM();

useEffect(() => {
  const openIds = chatWindows.filter(w => !w.isMinimized).map(w => w.conversationId);
  setOpenConversationIds(openIds);
}, [chatWindows, setOpenConversationIds]);
```

## Deployment
- **Frontend (Netlify):** Auto-deploys on push to staging
- **Backend (Render):** Not required - all changes were frontend-only

## Testing Verification
User confirmed notifications now behave correctly after deployment.

## Next Steps Discussed
- Group chat feature exploration
- Local version needs to be synced with live deployment before adding new features
