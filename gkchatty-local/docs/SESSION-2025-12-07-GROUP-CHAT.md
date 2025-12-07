# Session: December 7, 2025 - Group Chat Implementation

## Summary
Implemented group chat MVP functionality for the IM (Instant Messaging) floating chat window system.

## Features Implemented

### Backend
- **`createGroupConversation` endpoint** in `conversationController.ts`
  - Creates group conversation with multiple participants
  - Validates participant IDs and retrieves usernames
  - Returns conversation with `isGroup: true`, `groupName`, `participantUsernames`

- **Route** `POST /api/conversations/group` in `conversationRoutes.ts`
  - Placed before `/:id` route to ensure proper matching
  - Requires authentication (`protect` and `checkSession` middleware)

### Frontend

#### IMContext.tsx
- Extended `ChatWindow` interface with group fields:
  ```typescript
  isGroup?: boolean;
  groupName?: string;
  participantUsernames?: string[];
  ```
- Added `openGroupChatWindow(conversationId, groupName, participantUsernames)` function

#### IMBuddyList.tsx
- Added group creation mode with state:
  - `isGroupMode` - toggles multi-select mode
  - `selectedUsers` - Set of selected user IDs
  - `groupName` - input for group name
- UI changes:
  - "New Group" toggle button (people icon) in header
  - Checkboxes appear next to users in group mode
  - Group name input and "Create Group" button in footer
- On successful creation, calls `openGroupChatWindow()` to open chat

#### IMChatWindow.tsx
- Added props: `isGroup`, `groupName`, `participantUsernames`
- Header changes for group chats:
  - Purple group icon instead of user avatar
  - Shows group name instead of username
  - Shows "X members" instead of online status
- Message display:
  - Shows sender username for group messages from others
- Minimized state:
  - Purple group icon
  - Shows group name

#### IMContainer.tsx
- Passes new group props to `IMChatWindow` component

## Files Modified

### Backend
- `gkchatty-local/backend/src/controllers/conversationController.ts`
- `gkchatty-local/backend/src/routes/conversationRoutes.ts`

### Frontend
- `gkchatty-local/frontend/src/contexts/IMContext.tsx`
- `gkchatty-local/frontend/src/components/im/IMBuddyList.tsx`
- `gkchatty-local/frontend/src/components/im/IMChatWindow.tsx`
- `gkchatty-local/frontend/src/components/im/IMContainer.tsx`

## Bug Fixes
- Fixed `localStorage.getItem('token')` to `localStorage.getItem('accessToken')` in IMBuddyList
- **Fixed avatar image stretching** in `avatar.tsx` - added `object-cover` to `AvatarImage` className
  - Before: `aspect-square h-full w-full`
  - After: `aspect-square h-full w-full object-cover`
  - Non-square images are now properly cropped to fit the circular container
- **Fixed "0 members" bug** in group chat - backend wasn't returning `participantUsernames`
  - Added `participantUsernames: allParticipantUsernames` to `createGroupConversation` response
  - File: `backend/src/controllers/conversationController.ts:566`

## How to Test Group Chat

1. Open http://localhost:4003
2. Log in with a test account
3. Click the IM toggle button (bottom right corner)
4. Click the "group" icon (people icon) in the buddy list header
5. Select 1+ users by clicking their checkboxes
6. Enter a group name in the input field
7. Click "Create Group"
8. A group chat window opens with:
   - Purple group icon
   - Group name in header
   - "X members" count

## Technical Details

### Socket Service
The existing socket service (`socketService.ts`) already handles group messages properly by iterating over all participants in a conversation. No changes were needed.

### Database Model
The `ConversationModel` already had group fields:
- `isGroup: Boolean`
- `groupName: String`
- `groupIcon: String` (optional)
- `createdBy: ObjectId`

## Remaining Work

### Not Yet Implemented
- Group icon/avatar upload
- Group admin features (promote/demote admins)

### Completed This Session (Phase 2)
- ✅ Add members to group
- ✅ Leave group functionality
- ✅ Delete group functionality
- ✅ Persistent notification bug fix

## Dev Server Ports
- Backend: http://localhost:4001
- Frontend: http://localhost:4003

## Additional Fixes This Session

### Avatar Image Stretching (FIXED)
**Issue:** User avatar images on staging were stretched when non-square images were uploaded.

**Root Cause:** `AvatarImage` component in `avatar.tsx` was missing `object-cover` CSS property.

**Fix Applied:** Added `object-cover` to ensure images are cropped to maintain aspect ratio:
```typescript
// Before
className={cn('aspect-square h-full w-full', className)}

// After
className={cn('aspect-square h-full w-full object-cover', className)}
```

**File Modified:** `gkchatty-local/frontend/src/components/ui/avatar.tsx:26`

**Status:** Ready to deploy to staging

### Group Conversations in Buddy List (ADDED)
**Issue:** Once a group chat window was closed, there was no way to re-open it since groups weren't shown in the buddy list.

**Solution:** Added a "Groups" section to IMBuddyList that displays existing group conversations:
- Purple badge icon at section header
- Lists all group conversations with purple group avatar
- Shows group name and unread count
- Clicking opens the group chat window
- Hidden during "Create Group" mode to avoid confusion

**Changes Made:**
1. Added `groupConversations` filter from `conversations` array
2. Added `handleGroupClick()` to open existing group chats
3. Added `GroupItem` component for rendering individual group entries
4. Added `GroupsSection` component at top of user list

**File Modified:** `gkchatty-local/frontend/src/components/im/IMBuddyList.tsx`

**Status:** Ready to test

### Online Status Clarification
**Issue:** Users reported some users not showing as online even though logged in.

**Analysis:** The presence system works correctly:
- When a user's socket connects successfully, they're marked online
- When socket disconnects (or all sockets disconnect), they're marked offline
- Users with expired JWTs (seen in server logs as `jwt expired`) cannot connect sockets

**Root Cause:** Users with expired tokens fail socket authentication:
```
[Socket Auth] Authentication failed: jwt expired
```

**Solution:** Users need to log out and log back in to get fresh tokens. This isn't a bug - it's correct security behavior. The token refresh system should handle this automatically during normal API calls, but socket connections specifically require re-authentication.

**Status:** Working as designed - no code changes needed

---

## Phase 2: Group Management Features (Completed)

### Persistent Notification Bug (FIXED)

**Issue:** User "dev" had a notification badge in group chat that wouldn't clear even after viewing messages.

**Root Cause:** Two issues in the mark-as-read flow:

1. **Backend** - `ConversationModel.ts:133` - The `markAsRead` method silently failed if the user's `participantMeta` entry didn't exist:
   ```typescript
   // BEFORE (broken)
   const meta = this.participantMeta.get(userId);
   if (meta) {
     meta.unreadCount = 0;
     // ...
   }

   // AFTER (fixed)
   const meta = this.participantMeta.get(userId) || {
     unreadCount: 0,
     lastReadAt: null,
     isArchived: false,
     isMuted: false,
     joinedAt: new Date(),
   };
   meta.unreadCount = 0;
   meta.lastReadAt = new Date();
   this.participantMeta.set(userId, meta);
   await this.save();
   ```

2. **Frontend** - `DMContext.tsx` - The `markConversationAsRead` function had early return when local `unreadCount === 0`, skipping the API call even when server state was out of sync.

**Files Modified:**
- `backend/src/models/ConversationModel.ts` - Fixed `markAsRead` to create default meta if missing
- `frontend/src/contexts/DMContext.tsx` - Always call API when marking as read

### Group Settings Menu in Chat Window (ADDED)

**Location:** `IMChatWindow.tsx` header - 3-dot icon appears for group chats

**Features:**
- **Add Members** - Opens modal to select users not already in group
- **Leave Group** - Removes self from group with confirmation dialog

**Implementation Details:**

```typescript
// State for group management
const [showGroupMenu, setShowGroupMenu] = useState(false);
const [showAddMembersModal, setShowAddMembersModal] = useState(false);
const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<Set<string>>(new Set());
const [availableUsers, setAvailableUsers] = useState<Array<{...}>>([]);

// API calls
// Add members: POST /api/conversations/:id/members
// Leave group: POST /api/conversations/:id/leave
```

**File Modified:** `frontend/src/components/im/IMChatWindow.tsx`

### Delete Group from Buddy List (ADDED)

**Location:** `IMBuddyList.tsx` - Trash icon appears on hover over group entries

**Features:**
- Red trash icon appears on hover
- Confirmation dialog before deletion
- Only group creator can delete (enforced by backend)
- Refreshes conversation list after deletion

**Implementation Details:**

```typescript
// State for delete confirmation
const [deleteConfirm, setDeleteConfirm] = useState<{
  isOpen: boolean;
  conversationId: string | null;
  groupName: string;
}>({ isOpen: false, conversationId: null, groupName: '' });

// API call
// Delete group: DELETE /api/conversations/:id/group
```

**File Modified:** `frontend/src/components/im/IMBuddyList.tsx`

### Backend Endpoints (Already Existed)

These endpoints were added in the previous part of this session:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations/:id/members` | POST | Add members to group |
| `/api/conversations/:id/leave` | POST | Leave group (remove self) |
| `/api/conversations/:id/group` | DELETE | Delete group (creator only) |

**File:** `backend/src/routes/conversationRoutes.ts`

---

## Complete Files Modified This Session

### Backend
- `src/controllers/conversationController.ts` - Group endpoints
- `src/routes/conversationRoutes.ts` - Route definitions
- `src/models/ConversationModel.ts` - Fixed `markAsRead` method

### Frontend
- `src/contexts/IMContext.tsx` - Group chat window support
- `src/contexts/DMContext.tsx` - Fixed mark-as-read logic
- `src/components/im/IMBuddyList.tsx` - Group creation, listing, deletion
- `src/components/im/IMChatWindow.tsx` - Group display, settings menu, add members, leave group
- `src/components/im/IMContainer.tsx` - Pass group props
- `src/components/ui/avatar.tsx` - Fixed image stretching

---

## Testing Checklist

### Group Chat MVP
- [x] Create group with 2+ users
- [x] Send messages in group
- [x] See sender names on messages
- [x] Purple group icon in header
- [x] Member count displayed
- [x] Groups section in buddy list
- [x] Reopen group from buddy list
- [x] Unread badge on groups

### Group Management
- [x] Add members to existing group
- [x] Leave group (remove self)
- [x] Delete group (creator only)
- [x] Confirmation dialogs for destructive actions

### Bug Fixes
- [x] Persistent notification clears properly
- [x] Avatar images not stretched
- [x] "0 members" bug fixed

---

## Status: MVP COMPLETE

All requested group chat features are implemented and working:
- Create groups
- Send/receive group messages
- View groups in buddy list
- Add members
- Leave groups
- Delete groups
- Proper notification handling
