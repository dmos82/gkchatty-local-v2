# Knowledge Gaps Feature - Implementation Complete

## Summary
Tracks common questions that the RAG system cannot answer well, allowing admins to identify gaps in the knowledge base and prioritize content creation.

**Status**: Complete
**Date**: 2025-12-06
**Part of**: Phase 4 Enterprise Features (Admin Dashboard Analytics)

---

## How It Works

1. **Automatic Detection**: When a user asks a question and the RAG system returns sources with a best score < 0.5, the query is automatically recorded as a "knowledge gap"
2. **Query Normalization**: Similar questions are grouped together using normalized text (lowercase, punctuation removed)
3. **Occurrence Tracking**: Each time the same question is asked, the count increments
4. **Admin Notification**: A red badge on the "Knowledge Gaps" tab shows the count of new/unreviewed gaps
5. **Workflow**: Admins can mark gaps as `reviewed`, `addressed` (when documentation added), or `dismissed`

---

## Files Created

### Backend

| File | Purpose |
|------|---------|
| `src/models/KnowledgeGapModel.ts` | MongoDB schema for tracking unanswered questions |
| `src/services/knowledgeGapService.ts` | Service layer with all business logic |

### Frontend

| File | Purpose |
|------|---------|
| `src/components/admin/KnowledgeGapsPanel.tsx` | Admin panel UI with stats, table, filters, and status management |

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `src/routes/chatRoutes.ts` | Added automatic knowledge gap tracking after RAG returns sources |
| `src/routes/adminRoutes.ts` | Added 6 new admin endpoints for knowledge gap management |

### Frontend

| File | Changes |
|------|---------|
| `src/app/admin/page.tsx` | Added "Knowledge Gaps" tab with notification badge |

---

## Database Schema

```typescript
interface IKnowledgeGap {
  query: string;                    // Original question text
  normalizedQuery: string;          // Lowercase, trimmed for grouping (unique index)
  bestScore: number;                // Highest RAG score (still below 0.5 threshold)
  occurrenceCount: number;          // How many times this question was asked
  lastAskedAt: Date;                // When it was last asked
  firstAskedAt: Date;               // When it was first recorded
  userIds: ObjectId[];              // Unique users who asked this
  status: GapStatus;                // 'new' | 'reviewed' | 'addressed' | 'dismissed'
  reviewedBy: ObjectId | null;      // Admin who reviewed
  reviewedAt: Date | null;
  notes: string | null;             // Admin notes
  suggestedDocTitle: string | null; // If addressed, what doc was added
}
```

**Indexes:**
- `normalizedQuery` (unique) - For fast duplicate detection
- `status` + `occurrenceCount` (compound) - For filtered queries

---

## API Endpoints

### List Knowledge Gaps
```
GET /api/admin/knowledge-gaps
```
**Query Parameters:**
- `status` - Filter by status (new, reviewed, addressed, dismissed)
- `minOccurrences` - Filter by minimum occurrence count (default: 1)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field: occurrenceCount, lastAskedAt, firstAskedAt (default: occurrenceCount)
- `sortOrder` - asc or desc (default: desc)

**Response:**
```json
{
  "success": true,
  "gaps": [...],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

### Get New Gap Count (for badge)
```
GET /api/admin/knowledge-gaps/count
```
**Response:**
```json
{
  "success": true,
  "count": 12
}
```

### Get Top Knowledge Gaps
```
GET /api/admin/knowledge-gaps/top?limit=10
```
**Response:**
```json
{
  "success": true,
  "gaps": [...]
}
```

### Get Gap Statistics
```
GET /api/admin/knowledge-gaps/stats
```
**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 45,
    "new": 12,
    "reviewed": 8,
    "addressed": 20,
    "dismissed": 5,
    "topQuestions": 15,
    "uniqueUsers": 28
  }
}
```

### Update Gap Status
```
PUT /api/admin/knowledge-gaps/:gapId
```
**Body:**
```json
{
  "status": "addressed",
  "notes": "Added FAQ document",
  "suggestedDocTitle": "Account Setup FAQ"
}
```

### Delete Gap
```
DELETE /api/admin/knowledge-gaps/:gapId
```

---

## UI Features

### Statistics Panel
- Total gaps count
- New (unreviewed) count - highlighted in red
- Reviewed count
- Addressed count
- Dismissed count
- Frequent questions (asked 3+ times)
- Unique users affected

### Table Columns
- **Question**: The original query text with notes displayed below
- **Count**: Occurrence count (highlighted orange if >= 3)
- **Score**: Best RAG score as percentage (color-coded: red < 30%, orange < 40%, yellow < 50%)
- **Status**: Badge showing current status
- **Last Asked**: Timestamp of most recent occurrence

### Actions
- **Review/Update**: Opens dialog to change status, add notes, and record document title
- **Delete**: Permanently removes the gap record (with confirmation)

### Filters
- Filter by status (All, New, Reviewed, Addressed, Dismissed)
- Pagination (20 items per page)
- Refresh button

---

## Configuration

### Threshold
The gap score threshold is set in `knowledgeGapService.ts`:
```typescript
const GAP_SCORE_THRESHOLD = 0.5;
```

Only queries with a best RAG score below this value are recorded.

---

## Testing the Feature

### 1. Generate Test Gaps
Ask questions that your knowledge base cannot answer well:
```
- "What is the meaning of life?"
- "How do I time travel?"
- "What's the recipe for grandma's secret sauce?"
```

### 2. Verify Recording
Check MongoDB:
```javascript
db.knowledgegaps.find().pretty()
```

### 3. Test Admin UI
1. Log in as admin
2. Go to Admin Dashboard
3. Click "Knowledge Gaps" tab
4. Verify:
   - Stats cards display correct counts
   - Table shows recorded gaps
   - Filtering works
   - Status updates work
   - Delete works

### 4. Test Notification Badge
1. Record some gaps with status='new'
2. Refresh admin page
3. Verify red badge appears on "Knowledge Gaps" tab
4. Mark gaps as reviewed/addressed
5. Verify badge count decreases

---

## Integration with Chat Flow

The tracking is integrated in `chatRoutes.ts`:

```typescript
// Track knowledge gaps: Calculate best score and record if below threshold
const bestSourceScore = finalSourcesForLlm.length > 0
  ? Math.max(...finalSourcesForLlm.map(s => s.score ?? 0))
  : 0;

// Record knowledge gap asynchronously (don't block response)
recordKnowledgeGap(sanitizedQuery, bestSourceScore, userId?.toString() || null).catch(err => {
  log.error({ error: err }, '[Knowledge Gap] Failed to record potential gap');
});
```

Key points:
- Runs asynchronously (doesn't block chat response)
- Handles errors gracefully (logs but doesn't crash)
- Only records if score is below threshold (checked in service)

---

## Status Workflow

```
[User asks question with low RAG score]
        ↓
    [status: new]
        ↓
   Admin reviews
        ↓
   ┌────┴────┐
   ↓         ↓
[reviewed]  [dismissed]
   ↓
Admin adds doc
   ↓
[addressed]
```

If a "dismissed" gap is asked again, it automatically resets to "new".

---

## Future Enhancements

1. **Auto-suggest documents**: Based on similar existing content
2. **Email notifications**: When a gap reaches X occurrences
3. **Bulk operations**: Mark multiple gaps at once
4. **Export**: Download gaps as CSV for analysis
5. **Analytics**: Charts showing gap trends over time
6. **AI categorization**: Auto-categorize gaps by topic

---

## Related Features

- **Audit Logging** (Phase 1) - Tracks admin actions on knowledge gaps
- **Real-time Dashboard** (Phase 4) - Could show live gap detection
- **Cost Management** (Phase 3) - Gaps indicate wasted API calls

---

## Troubleshooting

### Gaps not being recorded
1. Check RAG is returning scores
2. Verify threshold in service (default: 0.5)
3. Check MongoDB connection
4. Look for errors in logs: `[Knowledge Gap]`

### Badge not showing
1. Verify `/api/admin/knowledge-gaps/count` endpoint works
2. Check browser console for errors
3. Ensure gaps exist with status='new'

### Duplicate gaps
- The `normalizedQuery` index should prevent exact duplicates
- Similar but different questions will be separate records
