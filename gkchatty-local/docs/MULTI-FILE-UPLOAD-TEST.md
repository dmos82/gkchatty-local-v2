# Multi-File Upload Test Instructions

**Date:** January 17, 2025
**Issue:** Only 1 of 5 files uploading
**Enhanced Logging:** ✅ Added

---

## Test 1: Upload Button Method

1. **Go to admin page:** http://localhost:4003/admin
2. **Open browser console:** Press F12 or Cmd+Option+I
3. **Clear console:** Cmd+K or click Clear button
4. **Prepare 5 test files** with unique names:
   - test1.txt
   - test2.txt
   - test3.txt
   - test4.txt
   - test5.txt

5. **Click the Upload button** (Upload icon in toolbar)
6. **Select all 5 files** in the file picker dialog
7. **Click Open**

### Expected Console Output:
```
[LOG] [FileTreeManager] File input onChange, selectedFolder: null
[LOG] [FileTreeStore] SYSTEM MODE UPLOAD - Total files: 5
[LOG] [FileTreeStore] Adding file 1/5: test1.txt (123 bytes)
[LOG] [FileTreeStore] Adding file 2/5: test2.txt (456 bytes)
[LOG] [FileTreeStore] Adding file 3/5: test3.txt (789 bytes)
[LOG] [FileTreeStore] Adding file 4/5: test4.txt (234 bytes)
[LOG] [FileTreeStore] Adding file 5/5: test5.txt (567 bytes)
[LOG] [FileTreeStore] Uploading files to: /api/admin/system-kb/upload
```

**Result:**
- [ ] All 5 files shown in console?
- [ ] All 5 files uploaded to backend?
- [ ] All 5 files visible in admin page after refresh?

---

## Test 2: Drag-and-Drop Method

1. **Stay on admin page:** http://localhost:4003/admin
2. **Keep console open**
3. **Clear console again**
4. **Prepare the same 5 files**
5. **Select all 5 files** in your file manager/Finder
6. **Drag them** into the admin page
7. **Drop them** either:
   - Into a folder (like "Company Policies")
   - Into the root area

### Expected Console Output:
```
[LOG] [FileTreeManager] Dropped 5 file(s) from OS
[LOG] [FileTreeManager]   File 1: test1.txt (123 bytes, text/plain)
[LOG] [FileTreeManager]   File 2: test2.txt (456 bytes, text/plain)
[LOG] [FileTreeManager]   File 3: test3.txt (789 bytes, text/plain)
[LOG] [FileTreeManager]   File 4: test4.txt (234 bytes, text/plain)
[LOG] [FileTreeManager]   File 5: test5.txt (567 bytes, text/plain)
[LOG] [FileTreeManager] Uploading to folder: Company Policies (or root)
[LOG] [FileTreeStore] SYSTEM MODE UPLOAD - Total files: 5
[LOG] [FileTreeStore] Adding file 1/5: test1.txt (123 bytes)
...
```

**Result:**
- [ ] "Dropped 5 file(s)" or "Dropped 1 file(s)"?
- [ ] All 5 files shown in FileTreeManager logs?
- [ ] All 5 files shown in FileTreeStore logs?
- [ ] All 5 files uploaded successfully?

---

## Diagnosis

### Scenario A: Upload Button Works (5 files), Drag-and-Drop Fails (1 file)
**Diagnosis:** Browser drag-and-drop API limitation
**Fix:** Add notice to use Upload button for multiple files

### Scenario B: Both Methods Show 5 Files in Console, But Only 1 Uploads
**Diagnosis:** Backend or network issue
**Actions:**
1. Check backend terminal for "Processing 5 files..." message
2. Check for file type restrictions (only PDF, TXT, MD allowed)
3. Check for duplicate file name rejection

### Scenario C: Both Methods Only Show 1 File in Console
**Diagnosis:** Frontend FileList handling issue
**Fix Required:** Frontend code needs adjustment

### Scenario D: Both Methods Upload All 5 Files Successfully
**Diagnosis:** Issue was intermittent or already fixed
**Action:** Document and close issue

---

## Backend Logs to Check

While testing, also watch backend terminal for:

```
[Admin Upload] Processing X files...
```

Where X should be 5.

If you see:
- "Processing 1 files..." → Frontend only sent 1 file
- "Skipping duplicate file: testX.txt" → File name already exists
- "Error processing file testX.txt" → Upload error

---

## Quick Test (30 seconds)

1. Go to http://localhost:4003/admin
2. Open console (F12)
3. Click Upload button
4. Select 5 files
5. Copy console output
6. Share with me

**I need to see the console output to diagnose the issue!**
