# Comprehensive fetchWithAuth Fix Plan

## Context
Mobile browsers don't support HttpOnly cookies reliably across ports. Solution: Use `fetchWithAuth` wrapper that adds `Authorization: Bearer {token}` header from localStorage.

## Files Already Fixed ✅
- `/frontend/src/lib/fetchWithAuth.ts` (wrapper created)
- `/frontend/src/lib/config.ts` (dynamic API URLs)
- `/frontend/src/context/AuthContext.tsx` (stores token on login)
- `/frontend/src/app/admin/page.tsx` (17 calls)
- `/frontend/src/components/admin/SettingsManager.tsx` (2 calls)
- `/frontend/src/lib/api/userSettings.ts` (3 calls)
- `/frontend/src/lib/api/personas.ts` (already correct)
- `/frontend/src/stores/fileTreeStore.ts` (already correct)

## Files Needing Updates - HIGH PRIORITY

### 1. `/frontend/src/app/page.tsx` - 9 fetch calls
- Line 182: `GET /api/chats/latest`
- Line 254: `GET /api/chats`
- Line 338: `GET /api/chats/:id`
- Line 432: `POST /api/chats`
- Line 520: `PATCH /api/chats/:id`
- Line 589: `POST /api/chats`
- Line 666: `POST /api/chats/:id/messages`
- Line 778: `DELETE /api/chats/:id/messages/:messageId`
- Line 936: `DELETE /api/chats/:id`

**Pattern:**
```typescript
// Add imports at top:
import { fetchWithAuth } from '@/lib/fetchWithAuth';

// Replace fetch calls:
// BEFORE:
const response = await fetch(`${API_BASE_URL}/api/chats`, {
  credentials: 'include',
});

// AFTER:
const response = await fetchWithAuth('/api/chats', {
  method: 'GET',
});
```

### 2. `/frontend/src/components/ChatInterface.tsx` - 1 call
- Line 117: `POST /api/chats`

### 3. `/frontend/src/components/chat/ChatFileUpload.tsx` - 2 calls
- Line 177: `POST /api/documents/get-presigned-url`
- Line 248: `POST /api/documents/process-uploaded-file`

### 4. `/frontend/src/app/admin/system-kb/page.tsx` - 1 call
- Line 29: `GET /api/system-kb/`

### 5. `/frontend/src/components/admin/SystemKBUpload.tsx` - 1 call (FormData)
- Line 99: `POST /api/admin/system-kb/upload`
**Special:** FormData - manually add Authorization header

### 6. `/frontend/src/components/layout/MainLayout.tsx` - 1 call
- Line 83: `GET /api/system-kb/`

### 7. `/frontend/src/components/layout/SystemKbList.tsx` - 1 call
- Line 36: `GET /api/system-kb/`

### 8. `/frontend/src/app/usage/page.tsx` - 1 call
- Line 45: `GET /users/me/usage` (note: missing /api prefix!)

### 9. `/frontend/src/components/auth/ForcePasswordChangeModal.tsx` - 1 call
- Line 58: `POST /api/users/me/password`

### 10. `/frontend/src/components/common/FeedbackModal.tsx` - 1 call
- Line 54: `POST /api/feedback`

### 11. `/frontend/src/components/search/FilenameSearch.tsx` - 1 call
- Line 40: `GET /api/search/filename`

### 12. `/frontend/src/components/admin/FileTreeDebug.tsx` - 1 call
- Line 13: `GET /api/folders/tree`

### 13. `/frontend/src/components/admin/DebugFileTree.tsx` - 1 call
- Line 13: `GET /api/folders/tree`

### 14. `/frontend/src/app/admin/UserDetailModal.tsx` - 1 call (if exists)
- Line 121: `DELETE /api/submissions/:id`

### 15. `/frontend/src/app/documents/s3-diagnostic/page.tsx` - 1 call
- Line 105: `POST /api/documents/get-presigned-url`

## FormData Special Handling

When uploading files with FormData, DO NOT use fetchWithAuth directly. Instead:

```typescript
import { getApiBaseUrl } from '@/lib/config';

const formData = new FormData();
formData.append('file', file);

// Manually add Authorization header
const apiUrl = `${getApiBaseUrl()}/api/endpoint`;
const token = localStorage.getItem('accessToken');
const headers: Record<string, string> = {};
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}

const response = await fetch(apiUrl, {
  method: 'POST',
  headers, // Do NOT set Content-Type for FormData
  credentials: 'include',
  body: formData,
});
```

## Files That Should NOT Be Changed
- `/frontend/src/context/AuthContext.tsx` - Login/logout/verify (already correct)
- `/frontend/src/services/authService.ts` - Register/login (no token needed)
- `/frontend/src/components/auth/RegisterForm.tsx` - Uses authService
- `/frontend/src/components/auth/CookieTest.tsx` - Test endpoint
- `/frontend/src/app/mobile-test/page.tsx` - Diagnostic page
- Any S3 presigned URL uploads (PUT to S3 directly)

## Testing After Fix
1. Desktop: Clear cookies, login with dev/dev123
2. Mobile: Login, test persona selection
3. Mobile: Send chat message
4. Mobile: Upload file
5. Mobile: Navigate all tabs in admin dashboard

## Success Criteria
- ✅ Desktop login works
- ✅ Mobile login works
- ✅ Mobile persona selection works
- ✅ No 401 errors on mobile
- ✅ All admin tabs load on mobile
- ✅ File uploads work on mobile
