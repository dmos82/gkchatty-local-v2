# Folder Permissions Implementation Plan

**Date:** November 17, 2025
**Feature:** Right-click context menu for folder permissions (User/Admin/Specific Users access control)

---

## Overview

Allow admins to control folder access using a right-click context menu with three permission levels:
1. **All Users** - Everyone can see the folder and its contents
2. **Admin Only** - Only admin users can see the folder
3. **Specific Users** - Only selected users can see the folder

---

## Database Changes ✅ COMPLETE

### Updated Models

**FolderModel.ts** and **SystemFolderModel.ts** now include:

```typescript
permissions: {
  type: 'all' | 'admin' | 'specific-users';
  allowedUsers?: mongoose.Types.ObjectId[];  // Only used if type is 'specific-users'
}
```

**Defaults:**
- User folders (`FolderModel`): `type: 'all'` (everyone can access)
- System folders (`SystemFolderModel`): `type: 'admin'` (admin-only by default)

---

## Backend API Changes

### New Endpoints

#### 1. Update Folder Permissions (User Folders)
```
PATCH /api/folders/:folderId/permissions
```

**Request Body:**
```json
{
  "permissionType": "all" | "admin" | "specific-users",
  "allowedUsers": ["userId1", "userId2"]  // Only required if permissionType is "specific-users"
}
```

**Authorization:** Admin only

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "...",
    "name": "Policies",
    "permissions": {
      "type": "specific-users",
      "allowedUsers": ["userId1", "userId2"]
    }
  }
}
```

#### 2. Update System Folder Permissions
```
PATCH /api/system-folders/:folderId/permissions
```

**Same structure as above**

#### 3. Get All Users (for user picker)
```
GET /api/users
```

**Authorization:** Admin only

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "_id": "...",
      "username": "john.doe",
      "email": "john@example.com",
      "role": "user"
    }
  ]
}
```

---

### Modified Endpoints

#### GET /api/folders/tree

**Current:** Returns all folders for the user
**New:** Filter folders based on permissions

**Logic:**
```typescript
// For each folder, check if user has access
if (folder.permissions.type === 'all') {
  return true;  // Everyone can see
}

if (folder.permissions.type === 'admin') {
  return user.role === 'admin';  // Only admins can see
}

if (folder.permissions.type === 'specific-users') {
  return folder.permissions.allowedUsers.includes(user._id);  // Check if user is in allowed list
}
```

#### GET /api/system-folders/tree

**Same permission filtering logic as above**

---

## Frontend Changes

### 1. Right-Click Context Menu Component

**Location:** `frontend/src/components/admin/FolderContextMenu.tsx` (new file)

**Features:**
- Shows on right-click on folder
- Menu options:
  - Rename
  - Move
  - Delete
  - **Permissions** (admin only) ← NEW

**Example:**
```
┌─────────────────────┐
│ Rename Folder       │
│ Move Folder         │
│ Delete Folder       │
│ ──────────────      │
│ Permissions... 🔒   │ ← Admin only
└─────────────────────┘
```

---

### 2. Permissions Modal Component

**Location:** `frontend/src/components/admin/FolderPermissionsModal.tsx` (new file)

**UI Design:**

```
┌────────────────────────────────────────┐
│  Folder Permissions: "Policies"        │
├────────────────────────────────────────┤
│                                        │
│  Who can access this folder?           │
│                                        │
│  ○ All Users                           │
│     Everyone can view this folder      │
│                                        │
│  ○ Admin Only                          │
│     Only administrators can view       │
│                                        │
│  ● Specific Users                      │
│     Select users who can view:         │
│                                        │
│     ┌────────────────────────────┐     │
│     │ Search users...            │     │
│     └────────────────────────────┘     │
│                                        │
│     Selected Users (2):                │
│     • john.doe (john@example.com) ✕    │
│     • jane.smith (jane@example.com) ✕  │
│                                        │
├────────────────────────────────────────┤
│              [Cancel]  [Save]          │
└────────────────────────────────────────┘
```

**Props:**
```typescript
interface FolderPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: {
    _id: string;
    name: string;
    permissions: {
      type: 'all' | 'admin' | 'specific-users';
      allowedUsers?: string[];
    };
  };
  onSave: (permissions: { type: string; allowedUsers?: string[] }) => Promise<void>;
}
```

---

### 3. User Picker Component

**Location:** `frontend/src/components/admin/UserPicker.tsx` (new file)

**Features:**
- Search/filter users by username or email
- Multi-select users
- Show selected users with remove button
- Load users from `GET /api/users`

**Props:**
```typescript
interface UserPickerProps {
  selectedUsers: string[];  // Array of user IDs
  onChange: (userIds: string[]) => void;
}
```

---

### 4. Updated FileTreeManager

**Changes:**
- Add `onContextMenu` handler to folder nodes
- Show context menu on right-click
- Open permissions modal when "Permissions" clicked
- Filter folder tree based on user permissions

---

## Security Considerations

### 1. Authorization Checks

**All permission update endpoints:**
- ✅ Verify user is admin before allowing changes
- ✅ Return 403 Forbidden if non-admin tries to update

### 2. Data Validation

**Permission updates:**
- ✅ Validate `permissionType` is one of: 'all', 'admin', 'specific-users'
- ✅ If `permissionType` is 'specific-users', require `allowedUsers` array
- ✅ Verify all user IDs in `allowedUsers` exist in database
- ✅ Prevent empty `allowedUsers` array for 'specific-users' type

### 3. Folder Tree Filtering

**Backend filtering:**
- ✅ Filter folders on server-side (never send unauthorized folders to client)
- ✅ Check permissions recursively (if parent is hidden, hide all children)
- ✅ Cache user permissions for performance

---

## User Experience Flow

### Admin Sets Permissions

1. Admin right-clicks on folder "Insurance Policies"
2. Context menu appears with "Permissions..." option
3. Admin clicks "Permissions..."
4. Modal opens showing current permissions (default: "All Users")
5. Admin selects "Specific Users"
6. User picker appears
7. Admin searches for "Claims Team"
8. Admin selects 3 users from Claims Team
9. Admin clicks "Save"
10. Modal closes, folder permissions updated
11. Toast notification: "Permissions updated for Insurance Policies"

### Non-Admin User Experience

1. User "john.doe" logs in
2. Fetches folder tree
3. Backend filters folders based on john's permissions
4. John only sees folders where:
   - `permissions.type === 'all'` OR
   - `permissions.type === 'specific-users' && permissions.allowedUsers.includes(john._id)`
5. John doesn't see admin-only folders or folders where he's not in `allowedUsers`
6. **No indication** folders are hidden (seamless UX)

---

## Implementation Steps

### Phase 1: Backend Foundation ✅ COMPLETE
- [x] Update FolderModel with permissions field
- [x] Update SystemFolderModel with permissions field

### Phase 2: Backend API (In Progress)
- [ ] Create `updateFolderPermissions` controller (folderController.ts)
- [ ] Create `updateSystemFolderPermissions` controller (systemFolderController.ts)
- [ ] Add permission filtering to `getFolderTree`
- [ ] Add permission filtering to `getSystemFolderTree`
- [ ] Create `getAllUsers` endpoint for user picker
- [ ] Add validation and error handling

### Phase 3: Frontend Components
- [ ] Create FolderContextMenu component
- [ ] Create FolderPermissionsModal component
- [ ] Create UserPicker component
- [ ] Update FileTreeManager to use context menu
- [ ] Add permission state management (Context API or local state)

### Phase 4: Integration & Testing
- [ ] Test permission updates (all three types)
- [ ] Test folder filtering for different user roles
- [ ] Test recursive permission checking (parent/child folders)
- [ ] Test edge cases (no allowed users, invalid user IDs)
- [ ] Test UI responsiveness and error states

---

## Technical Decisions

### 1. Permissions Inheritance

**Question:** If a parent folder is "Admin Only", should child folders inherit?

**Decision:** **NO inheritance** - Each folder has independent permissions
- **Reason:** More flexible for complex organizational structures
- **Implementation:** Backend filters folders individually, not recursively
- **Future Enhancement:** Add "Apply to all subfolders" checkbox in UI

### 2. Document Access

**Question:** If folder is restricted, what happens to documents inside?

**Decision:** **Documents follow folder permissions**
- If user can't see folder, they can't access documents inside
- Backend checks folder permissions before serving document
- **Implementation:** Add folder permission check to document download endpoint

### 3. Performance

**Question:** How to efficiently filter large folder trees?

**Decision:** **Server-side filtering with caching**
- Filter folders in database query (not in memory)
- MongoDB query: `{ $or: [{ "permissions.type": "all" }, { "permissions.allowedUsers": userId }] }`
- Cache user's accessible folder IDs for session duration
- **Estimated performance:** <50ms for 1000 folders

---

## API Examples

### Update Folder to Admin-Only

**Request:**
```bash
PATCH /api/folders/673abc123def456/permissions
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "permissionType": "admin"
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "673abc123def456",
    "name": "Executive Files",
    "permissions": {
      "type": "admin"
    }
  }
}
```

### Update Folder to Specific Users

**Request:**
```bash
PATCH /api/folders/673abc123def456/permissions
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "permissionType": "specific-users",
  "allowedUsers": ["user123", "user456", "user789"]
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "673abc123def456",
    "name": "Claims Department",
    "permissions": {
      "type": "specific-users",
      "allowedUsers": ["user123", "user456", "user789"]
    }
  }
}
```

### Get Filtered Folder Tree (Non-Admin User)

**Request:**
```bash
GET /api/folders/tree
Authorization: Bearer <user-token>
```

**Response (only folders user has access to):**
```json
{
  "success": true,
  "tree": [
    {
      "_id": "folder1",
      "name": "Public Policies",
      "permissions": { "type": "all" }
    },
    {
      "_id": "folder2",
      "name": "My Team Files",
      "permissions": {
        "type": "specific-users",
        "allowedUsers": ["currentUserId"]
      }
    }
    // "Executive Files" not returned (admin-only)
  ]
}
```

---

## Migration Strategy

### Existing Folders

**Problem:** Existing folders don't have permissions field

**Solution:** Add migration script to set default permissions

**Migration Script:**
```typescript
// backend/src/scripts/migrate-folder-permissions.ts

import { Folder } from '../models/FolderModel';
import { SystemFolder } from '../models/SystemFolderModel';

async function migrateFolderPermissions() {
  // Update all user folders to "all" (current behavior)
  await Folder.updateMany(
    { permissions: { $exists: false } },
    { $set: { permissions: { type: 'all' } } }
  );

  // Update all system folders to "admin" (current behavior)
  await SystemFolder.updateMany(
    { permissions: { $exists: false } },
    { $set: { permissions: { type: 'admin' } } }
  );

  console.log('Migration complete!');
}
```

**When to run:** Before deploying this feature to production

---

## Estimated Effort

| Phase | Estimated Time |
|-------|---------------|
| Backend API (Phase 2) | 4-6 hours |
| Frontend Components (Phase 3) | 6-8 hours |
| Integration & Testing (Phase 4) | 3-4 hours |
| **Total** | **13-18 hours** |

---

## Next Steps

1. **Review this plan** - Any changes needed?
2. **Phase 2:** Implement backend API endpoints
3. **Phase 3:** Build frontend components
4. **Phase 4:** Integration testing

**Ready to proceed with Phase 2 (Backend API)?**

---

**Document Version:** 1.0
**Status:** Database models updated ✅, Ready for Phase 2
**Contact:** Generated by Claude Code
