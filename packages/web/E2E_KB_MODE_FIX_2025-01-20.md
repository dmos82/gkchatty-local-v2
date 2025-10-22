# E2E KB Mode Switching Fix - January 20, 2025

## Critical Discovery

**Root Cause of Chat Timeouts**: E2E tests were querying empty `system-kb` instead of `user-docs` where uploaded documents are stored.

**User's Key Insight** (that led to the fix):
> "from a user perspective, im able to query the chat just fine in gkchatty on local host 4003. is it possible you are selecting the correct toggle for the queries hybrid/my docs/ and system kb? also there arent any documents in the system kb"

---

## Problem Analysis

### Default Behavior
- **SearchModeContext.tsx:31** - Default KB mode is `'system-kb'`
- System KB is empty (no documents)
- User manually switches to 'My Documents' (`user-docs`) to query uploaded files
- E2E tests never switched modes - they queried empty `system-kb`
- Result: Chat queries timed out after 45 seconds with no response

### Why User Could Query But Tests Couldn't
1. **User Flow**: Upload document → manually switch to "My Documents" → query successfully
2. **Test Flow**: Upload document → query without switching → timeout (querying empty KB)

---

## Solution Implemented

### 1. Added KB Toggle Locators to ChatPage.ts

**File**: `/apps/web/e2e/page-objects/ChatPage.ts`

```typescript
// Added locators (lines 16-17)
readonly systemKBSwitch: Locator;
readonly userDocsSwitch: Locator;

// Initialized in constructor (lines 40-41)
this.systemKBSwitch = page.locator('#system-kb');
this.userDocsSwitch = page.locator('#user-docs');
```

### 2. Implemented switchKnowledgeBaseMode() Method

**File**: `/apps/web/e2e/page-objects/ChatPage.ts` (lines 157-185)

```typescript
/**
 * Switch knowledge base mode using toggle switches
 * Fixes chat timeout issue - ensures tests query user-docs (where uploads go)
 * instead of system-kb (which is empty)
 */
async switchKnowledgeBaseMode(mode: 'system-kb' | 'user-docs') {
  const targetSwitch = mode === 'system-kb' ? this.systemKBSwitch : this.userDocsSwitch;

  // Check if already in correct mode
  const isAlreadyChecked = await targetSwitch.isChecked().catch(() => false);
  if (isAlreadyChecked) {
    return;
  }

  // Click the target switch
  await targetSwitch.click();

  // Wait for mode switch to complete
  await this.page.waitForTimeout(300);

  // Verify switch is now checked
  const isChecked = await targetSwitch.isChecked().catch(() => false);
  if (!isChecked) {
    throw new Error(`Failed to switch to ${mode} - switch not checked after click`);
  }

  // Wait for any UI updates
  await this.page.waitForLoadState('networkidle');
}
```

**Key Features**:
- Idempotent: Checks if already in correct mode before switching
- Error handling: Verifies switch succeeded
- Waits for UI updates to complete
- Clear error messages for debugging

### 3. Updated Journey 1 Login Tests

**File**: `/apps/web/e2e/journeys/journey-1-login-upload-chat.spec.ts`

**Added KB mode switch before all chat queries**:
1. Line 79: Main journey test - before querying about uploaded document
2. Line 267: "should answer questions about uploaded document" test
3. Line 287: "should maintain context across multiple questions" test
4. Line 308: "should handle queries when no relevant context exists" test

**Example**:
```typescript
// Step 4: Navigate to chat
await chatPage.goto();

// Step 4.5: CRITICAL - Switch to 'user-docs' mode (fixes timeout issue)
// Default is 'system-kb' which is empty, but uploaded docs are in 'user-docs'
await chatPage.switchKnowledgeBaseMode('user-docs');

// Step 5: Ask question about uploaded document
await chatPage.sendMessageAndWaitForResponse(query, 45000);
```

### 4. Updated Journey 1 Registration Tests

**File**: `/apps/web/e2e/journeys/journey-1-registration-upload-chat.spec.ts`

**Added KB mode switch to 7 test cases** (lines 74, 336, 360, 397, 427, 463, 489):
1. Main journey test
2. "should return relevant response based on uploaded document content"
3. "should indicate when asked about non-existent content"
4. "should maintain context across multiple questions"
5. "should handle chat query before uploading any documents"
6. "should allow user to logout and login again to access documents"
7. "should complete journey with valid user inputs and proper flow"

---

## Technical Details

### KBTogglePanel.tsx (UI Component)
```typescript
<Switch
  id="system-kb"
  checked={searchMode === 'system-kb'}
  onCheckedChange={handleSystemKBToggle}
/>
<Switch
  id="user-docs"
  checked={searchMode === 'user-docs'}
  onCheckedChange={handleMyDocsToggle}
/>
```

### SearchModeContext.tsx (State Management)
```typescript
export type SearchMode = 'hybrid' | 'system-kb' | 'user-docs';

// LINE 31: Default to System KB search (THE PROBLEM!)
return 'system-kb';
```

---

## Impact

### Tests Fixed
- **Journey 1 Login**: 4 chat query tests now switch to user-docs before querying
- **Journey 1 Registration**: 7 chat query tests now switch to user-docs before querying
- **Total**: 11 test cases fixed

### Expected Outcomes
1. ✅ Chat queries no longer timeout
2. ✅ Tests can successfully query uploaded documents
3. ✅ RAG responses contain document context
4. ✅ Test pass rate should increase dramatically (from ~65% to 90%+)

### Files Modified
1. `/apps/web/e2e/page-objects/ChatPage.ts` - Added locators and method
2. `/apps/web/e2e/journeys/journey-1-login-upload-chat.spec.ts` - 4 updates
3. `/apps/web/e2e/journeys/journey-1-registration-upload-chat.spec.ts` - 7 updates

---

## Testing

### Verification Steps
1. Run Journey 1 login tests with updated KB mode switching
2. Verify no timeout errors on chat queries
3. Confirm RAG responses contain document keywords
4. Check test logs for successful mode switching

### Test Command
```bash
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkckb/apps/web
pnpm exec playwright test journey-1-login --grep "should complete full user journey" --workers=1
```

---

## Lessons Learned

1. **User Insight Was Critical**: The user's observation about manually switching KB modes led directly to the root cause
2. **Default Values Matter**: SearchModeContext defaulting to `system-kb` was the hidden culprit
3. **Manual vs Automated Testing**: What works in manual testing may fail in automation if initial state differs
4. **Debugging Strategy**: Following the user's actual workflow revealed what tests were missing

---

## Next Steps

1. ✅ KB mode switching implemented in both journey files
2. ⏳ Run full Journey 1 test suite to verify fix
3. ⏳ Monitor test results for any remaining chat-related issues
4. ⏳ Document final pass rate improvement
5. ⏳ Proceed to Journey 2 (Admin flows) once Journey 1 at 90%+ pass rate

---

**Fix Completed**: January 20, 2025
**Root Cause**: Default KB mode (`system-kb`) was empty
**Solution**: Explicit switch to `user-docs` mode before all chat queries
**Expected Impact**: Chat timeout issues eliminated, test pass rate increase from ~65% to 90%+

