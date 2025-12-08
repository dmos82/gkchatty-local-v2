# Chat Feature Audit - December 7, 2025

## Critical Issues Found

### 1. 🔴 Chat Visibility Bug (HIGH PRIORITY)
**Problem:** When User A starts a conversation with User B, User B doesn't see it until they send a message back.

**Root Cause:** Backend saves the conversation to DB but doesn't emit a `conversation:created` event to notify User B.

**Location:** `backend/src/services/socketService.ts` Line 314

**Fix Required:**
```typescript
// After conversation.save() in handleSendMessage:
for (const participantId of conversation.participants) {
  if (!participantId.equals(socket.userObjectId)) {
    this.io?.to(`user:${participantId.toString()}`).emit('conversation:new', {
      conversationId: conversation._id.toString(),
      otherParticipant: { _id: socket.userId, username: socket.username },
      lastMessage: conversation.lastMessage,
      createdAt: conversation.createdAt
    });
  }
}
```

**Frontend also needs:**
```typescript
// DMContext.tsx - add handler:
newSocket.on('conversation:new', (conversation) => {
  setConversations((prev) => [conversation, ...prev]);
});
```

---

### 2. 🔴 Group Chat - Cannot Leave 2-Person Groups
**Problem:** Users can't leave groups with 2 or fewer members. They're forced to delete the group instead.

**Location:** `backend/src/controllers/conversationController.ts` Lines 772-778

**Current Logic:**
```typescript
if (conversation.participants.length <= 2) {
  return res.status(400).json({
    message: 'Cannot leave group with 2 or fewer members. Delete the group instead.'
  });
}
```

**Fix Options:**
1. Allow leave, auto-delete if only 1 person remains
2. Allow leave, soft-delete for the remaining person
3. Change error message to guide user to delete

---

### 3. 🟡 Notification Redundancy (MEDIUM)
**Problem:** Backend emits `dm:receive` TWICE - once to conversation room and once to user room.

**Location:** `backend/src/services/socketService.ts` Lines 341 & 348

**Why:** To handle new conversations where recipient hasn't joined the room yet.

**Impact:**
- 2x socket traffic per message
- Frontend has to deduplicate (processedMessageIds ref)
- Potential race conditions

**Fix:** Only emit to user room (always works), remove conversation room emit:
```typescript
// Remove Line 341:
// socket.to(`conversation:${conversationId}`).emit('dm:receive', messageData);

// Keep Line 348 (user room):
this.io?.to(`user:${participantId.toString()}`).emit('dm:receive', messageData);
```

---

### 4. 🟡 Missing Socket Events (MEDIUM)
**Problem:** Several important events don't notify other users:

| Event | What's Missing |
|-------|---------------|
| Group deleted | Other members don't know it's gone |
| Member added | UI doesn't update participant list |
| Member left | Other members not notified |

**Fix:** Add socket emissions for each event.

---

### 5. 🟡 Presence Broadcasts to ALL Users (MEDIUM)
**Problem:** Every presence change broadcasts to ALL connected users.

**Location:** `backend/src/services/socketService.ts` Lines 565-579

**Impact:** O(N²) scaling - 1000 users = 1,000,000 events

**Fix:** Only broadcast to user's contacts (people they share conversations with).

---

### 6. 🟢 Unread Count Race Condition (LOW)
**Problem:** Uses refs that may have stale values during concurrent socket events.

**Location:** `frontend/src/contexts/DMContext.tsx` Lines 326-354

**Fix:** Ensure refs are updated synchronously with state.

---

## Architecture Summary

### Key Files
| Component | File | Purpose |
|-----------|------|---------|
| IM Window State | `frontend/src/contexts/IMContext.tsx` | Chat window positions, z-index |
| DM State & Socket | `frontend/src/contexts/DMContext.tsx` | Messages, conversations, presence |
| Chat Window UI | `frontend/src/components/im/IMChatWindow.tsx` | Message display, send, groups |
| Buddy List UI | `frontend/src/components/im/IMBuddyList.tsx` | Online users, group creation |
| Socket Service | `backend/src/services/socketService.ts` | All real-time events |
| Conversation API | `backend/src/controllers/conversationController.ts` | REST endpoints |
| Conversation Model | `backend/src/models/ConversationModel.ts` | DB schema, findOrCreateDM |

### Socket Events Used
| Event | Direction | Purpose |
|-------|-----------|---------|
| `dm:send` | Client→Server | Send message |
| `dm:sent` | Server→Client | ACK with real message ID |
| `dm:receive` | Server→Client | New message notification |
| `dm:typing` | Bidirectional | Typing indicator |
| `dm:mark_read` | Client→Server | Mark messages read |
| `dm:read_receipt` | Server→Client | Read notification |
| `presence:changed` | Server→All | User status change |
| `conversation:join` | Client→Server | Join conversation room |

---

## Recommended Fix Order (By Tomorrow)

### Phase 1: Critical (Do First)
1. **Fix chat visibility** - Add `conversation:new` socket event
2. **Fix leave group** - Allow leaving 2-person groups

### Phase 2: Important (If Time)
3. **Remove dual emit** - Only emit to user rooms
4. **Add group:deleted event** - Notify when group removed

### Phase 3: Can Wait
5. Fix presence broadcast scaling
6. Fix unread count race condition
7. Add member_added/left events

---

## Implementation Checklist

- [ ] Add `conversation:new` socket event (backend)
- [ ] Add `conversation:new` handler (frontend DMContext)
- [ ] Change leave group logic to allow 2-person groups
- [ ] Add `group:deleted` socket event (backend)
- [ ] Add `group:deleted` handler (frontend)
- [ ] Remove conversation room emit (optional optimization)
- [ ] Test all flows end-to-end
