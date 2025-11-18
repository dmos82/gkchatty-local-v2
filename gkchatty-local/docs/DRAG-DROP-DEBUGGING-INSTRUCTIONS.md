# Drag-and-Drop File Upload Debugging

**Issue:** Dragging 5 files from file system only uploads 1 file
**Status:** Enhanced logging added for diagnosis

---

## What Was Added

### Frontend Logging Enhancements

**1. FileTreeManager.tsx (lines 510-513)**
```typescript
// Log each file name and size when dropped
Array.from(files).forEach((file, index) => {
  console.log(`[FileTreeManager]   File ${index + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
});
```

**2. fileTreeStore.ts (lines 308-312)**
```typescript
const filesArray = Array.from(files);
console.log('[FileTreeStore] SYSTEM MODE UPLOAD - Total files:', filesArray.length);
filesArray.forEach((file, index) => {
  console.log(`[FileTreeStore] Adding file ${index + 1}/${filesArray.length}: ${file.name} (${file.size} bytes)`);
  formData.append('files', file);
});
```

---

## How to Test

### Step 1: Open Browser Console
1. Go to http://localhost:4003/admin
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Click "Console" tab
4. Clear console (Cmd+K or click Clear button)

### Step 2: Prepare Test Files
Create 5 small test files on your desktop or in a folder:
- test1.txt
- test2.txt
- test3.txt
- test4.txt
- test5.txt

### Step 3: Perform Drag-and-Drop
1. Select all 5 files in your file manager
2. Drag them into the admin page
3. Drop them either:
   - Into a folder (like "Company Policies")
   - Into the root area

### Step 4: Check Console Output

**Look for these console messages:**

```
[FileTreeManager] Dropped X file(s) from OS
[FileTreeManager]   File 1: test1.txt (123 bytes, text/plain)
[FileTreeManager]   File 2: test2.txt (456 bytes, text/plain)
...
[FileTreeStore] SYSTEM MODE UPLOAD - Total files: X
[FileTreeStore] Adding file 1/X: test1.txt (123 bytes)
[FileTreeStore] Adding file 2/X: test2.txt (456 bytes)
...
[FileTreeStore] Uploading files to: /api/admin/system-kb/upload
[FileTreeStore] Upload result: {...}
```

---

## Diagnosis Scenarios

### Scenario 1: Only 1 file shown in initial drop
```
[FileTreeManager] Dropped 1 file(s) from OS  ← ONLY 1 FILE!
[FileTreeManager]   File 1: test1.txt (123 bytes, text/plain)
```

**Diagnosis:** Browser/OS is only passing 1 file to the drag event
**Likely Cause:**
- Browser limitation with drag-and-drop API
- OS file selection issue
- Need to use file input fallback

**Fix:** Implement file input as fallback for multi-file uploads

---

### Scenario 2: All 5 files in drop, but only 1 in FormData
```
[FileTreeManager] Dropped 5 file(s) from OS  ← 5 FILES DROPPED
[FileTreeManager]   File 1: test1.txt
...
[FileTreeManager]   File 5: test5.txt
[FileTreeStore] SYSTEM MODE UPLOAD - Total files: 1  ← ONLY 1 IN FORMDATA!
[FileTreeStore] Adding file 1/1: test1.txt
```

**Diagnosis:** Frontend is losing files between drop handler and upload function
**Likely Cause:**
- FileList not being passed correctly
- Issue with `Array.from(files)`
- Type conversion problem

**Fix:** Check handleFileUpload parameter passing

---

### Scenario 3: All 5 files in FormData, but only 1 uploaded
```
[FileTreeManager] Dropped 5 file(s) from OS
...
[FileTreeStore] SYSTEM MODE UPLOAD - Total files: 5  ← 5 FILES IN FORMDATA
[FileTreeStore] Adding file 1/5: test1.txt
...
[FileTreeStore] Adding file 5/5: test5.txt
[FileTreeStore] Upload result: {...uploadedDocuments: [only 1 item]}  ← ONLY 1 SAVED
```

**Diagnosis:** Backend receiving all files but only processing 1
**Likely Cause:**
- Backend loop breaking early
- Error during processing of subsequent files
- Duplicate detection rejecting files

**Fix:** Check backend logs for processing errors

---

### Scenario 4: All 5 files processed successfully
```
[FileTreeManager] Dropped 5 file(s) from OS
...
[FileTreeStore] SYSTEM MODE UPLOAD - Total files: 5
...
[FileTreeStore] Upload result: {uploadedDocuments: [5 items]}
```

**Diagnosis:** Everything working correctly!
**Action:** Issue may have been intermittent or already fixed

---

## Backend Logs to Check

After performing the drag-and-drop, check backend terminal for:

```
[Admin Upload] Processing 5 files...
[Admin Upload] File saved successfully: test1.txt at ...
[Admin Upload] MongoDB save successful for test1.txt, ID: ...
[Admin Upload] File saved successfully: test2.txt at ...
...
[Admin Upload] Upload summary: 5 uploaded, 0 skipped, 0 errors
```

**If you see:**
- "Processing 1 files..." → Frontend only sent 1 file
- "Skipping duplicate file" → Files rejected as duplicates
- "Error processing file" → Backend error during upload

---

## Automated Test Script

Run the Playwright test to simulate the issue:

```bash
cd /Users/davidjmorin/GOLDKEY\ CHATTY/gkchatty-ecosystem/gkchatty-local
node tests/drag-drop-test.js
```

**Note:** This test creates 5 temp files and simulates drag-and-drop.

---

## Common Fixes

### Fix 1: Browser Drag-and-Drop Limitation

Some browsers limit drag-and-drop to 1 file. Add file input fallback:

```typescript
// Add to FileTreeManager.tsx
<input
  type="file"
  multiple
  onChange={(e) => {
    if (e.target.files) {
      handleFileUpload(e.target.files, null);
    }
  }}
  style={{ display: 'none' }}
  ref={fileInputRef}
/>

<button onClick={() => fileInputRef.current?.click()}>
  Upload Files
</button>
```

### Fix 2: FormData Not Capturing All Files

Replace `forEach` with `for...of` loop:

```typescript
// Instead of:
Array.from(files).forEach(file => {
  formData.append('files', file);
});

// Use:
for (const file of Array.from(files)) {
  formData.append('files', file);
}
```

### Fix 3: Backend Duplicate Detection Too Aggressive

Check if files have same name - backend may skip duplicates:

```typescript
// backend/src/controllers/adminSystemKbController.ts (line 81)
if (existingFilenames.has(originalFileName)) {
  logger.info(`[Admin Upload] Skipping duplicate file: ${originalFileName}`);
  skippedDocuments.push({
    filename: originalFileName,
    reason: 'Duplicate file already exists',
  });
  continue;  ← Files skipped if names match
}
```

**Solution:** Use unique filenames for testing (test1.txt, test2.txt, etc.)

---

## Next Steps

1. **Perform manual test** with 5 files
2. **Copy console output** and share with me
3. **Check backend logs** for processing messages
4. **Identify which scenario** matches your output
5. **Apply appropriate fix** based on diagnosis

---

**Status:** Awaiting test results with enhanced logging
