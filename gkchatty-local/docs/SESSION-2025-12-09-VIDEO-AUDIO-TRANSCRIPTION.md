# Session: Video/Audio Transcription to DOCX

**Date:** 2025-12-09
**Status:** Ready for Testing

## Summary

Simplified the video/audio handling by removing in-browser playback. When users upload video or audio files, they are automatically transcribed to DOCX format (not PDF).

## Changes Made

### 1. Backend: `documentProcessor.ts` (Video Section)

**File:** `backend/src/utils/documentProcessor.ts`

Changed the video processing section from PDF to DOCX output:

| Before | After |
|--------|-------|
| `pdfKey` variable | `docxKey` variable |
| `.pdf` extension | `.docx` extension |
| `application/pdf` MIME type | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `videoResult.pdfBuffer` | `videoResult.docxBuffer` |

**Key code change:**
```typescript
// S3 key with DOCX extension
const docxKey = s3Key.replace(/\.[^/.]+$/, '.docx');

// Upload DOCX to S3
await uploadFile(
  videoResult.docxBuffer,
  docxKey,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
);

// Update database record
const updateData: any = {
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  originalFileName: videoResult.metadata.generatedFileName,
  s3Key: docxKey,
  file_extension: 'docx',
};
```

### 2. Already Correct (No Changes Needed)

- **`audioProcessor.ts`** - Already generates DOCX using `docx` npm package
- **`videoProcessor.ts`** - Already returns `docxBuffer` from audio processor
- **`UniversalFileViewer.tsx`** - Videos already route to DownloadPrompt

## Processing Pipeline

```
User uploads video/audio
        ↓
Backend detects media type
        ↓
Video: Extract audio via ffmpeg → Send to audio processor
Audio: Send directly to audio processor
        ↓
OpenAI Whisper API transcription
        ↓
Generate DOCX with transcription text
        ↓
Replace original file in S3 with DOCX
        ↓
Update database record (mimeType, fileName, s3Key)
        ↓
Frontend shows DOCX viewer or download option
```

## Frontend Behavior

| File Type | Viewer |
|-----------|--------|
| Video (MP4, etc.) | DownloadPrompt (cannot preview - transcribed to DOCX) |
| Audio (MP3, M4A, etc.) | MediaPlayer OR should show DOCX after transcription |
| DOCX | WordViewer |

## Known Issue to Monitor

The audio file "New Recording 4.m4a" still showed MediaPlayer in testing. This happens because:
1. Frontend detects file type from original mimeType in database
2. After transcription, the database should be updated to DOCX mimeType
3. If the file list doesn't refresh, it may show stale mimeType

**Potential fix if needed:** Route audio files to DownloadPrompt like videos:
```typescript
// UniversalFileViewer.tsx
case 'audio':
  return <DownloadPrompt fileName={fileName} documentId={documentId} onClose={onClose} />;
```

## Build Status

- TypeScript compilation: ✅ Success (no errors)
- Backend running: Port 4001
- Frontend running: Port 4003

## Test Checklist

- [ ] Upload new MP4 video file
- [ ] Verify transcription process completes
- [ ] Verify DOCX file appears in file list (not original video)
- [ ] Verify DOCX can be viewed/downloaded
- [ ] Upload new M4A/MP3 audio file
- [ ] Verify audio transcription to DOCX works
- [ ] Verify file list shows DOCX after processing

## Files Modified

1. `backend/src/utils/documentProcessor.ts` - Video section PDF→DOCX

## Files Already Correct

1. `backend/src/utils/audioProcessor.ts` - Uses DOCX generation
2. `backend/src/utils/videoProcessor.ts` - Returns docxBuffer
3. `frontend/src/components/viewers/UniversalFileViewer.tsx` - Videos use DownloadPrompt
