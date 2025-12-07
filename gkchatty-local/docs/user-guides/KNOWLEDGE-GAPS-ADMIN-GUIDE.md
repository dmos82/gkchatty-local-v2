# Knowledge Gaps - Admin Quick Start Guide

## What is Knowledge Gaps?

Knowledge Gaps automatically tracks questions that your knowledge base can't answer well. When users ask questions and the RAG system returns low-confidence results (score < 50%), those questions are logged for admin review.

This helps you:
- Identify missing documentation
- Prioritize content creation
- Understand what users are struggling to find

---

## Accessing the Feature

1. Log in as an admin user
2. Navigate to **Admin Dashboard** (`/admin`)
3. Click the **"Knowledge Gaps"** tab

A red badge on the tab shows the count of new (unreviewed) gaps.

---

## Understanding the Dashboard

### Statistics Panel

| Stat | Meaning |
|------|---------|
| **Total** | All knowledge gaps ever recorded |
| **New** | Gaps that haven't been reviewed yet |
| **Reviewed** | Gaps you've looked at but not addressed |
| **Addressed** | Gaps where you've added documentation |
| **Dismissed** | Gaps you've decided not to address |
| **Frequent** | Gaps asked 3+ times (priority!) |
| **Users** | Unique users affected by gaps |

### Table Columns

| Column | Description |
|--------|-------------|
| **Question** | The original question text |
| **Count** | How many times this question was asked (orange = 3+) |
| **Score** | Best RAG score (red < 30%, orange < 40%, yellow < 50%) |
| **Status** | Current status badge |
| **Last Asked** | When it was most recently asked |

---

## Managing Knowledge Gaps

### Reviewing a Gap

1. Click **"Review"** on any gap
2. In the dialog:
   - Change status to `reviewed`, `addressed`, or `dismissed`
   - Add notes about your decision
   - If addressed, enter the document title you created
3. Click **Save**

### Status Workflow

```
[New] → [Reviewed] → [Addressed]
           ↓
      [Dismissed]
```

- **New**: Automatically recorded when low-score query detected
- **Reviewed**: You've seen it, deciding what to do
- **Addressed**: You've added documentation to fix the gap
- **Dismissed**: Not relevant (e.g., off-topic questions)

### Priority Order

Focus on gaps with:
1. **High occurrence count** (asked frequently)
2. **Low scores** (very poor RAG results)
3. **Multiple unique users** (widespread issue)

---

## Filtering

Use the dropdown to filter by status:
- **All**: Show everything
- **New**: Only unreviewed gaps
- **Reviewed**: Only reviewed gaps
- **Addressed**: Only addressed gaps
- **Dismissed**: Only dismissed gaps

---

## Best Practices

### Daily Workflow

1. Check the Knowledge Gaps tab for new gaps (red badge)
2. Review high-occurrence gaps first
3. For each gap:
   - Is this a valid documentation need? → Create content, mark as addressed
   - Is this off-topic or irrelevant? → Mark as dismissed
   - Need more time to decide? → Mark as reviewed

### Content Creation

When you find a gap to address:
1. Create the missing documentation in your knowledge base
2. Upload/index the new document
3. Mark the gap as "addressed" with the document title
4. The gap won't be recorded again (unless dismissed gaps are re-asked)

### Monitoring

- Gaps asked 3+ times are highlighted orange - these are priorities
- Very low scores (< 30%) indicate the topic is completely missing
- Multiple users asking the same thing = definite content gap

---

## Troubleshooting

### No gaps appearing?

- Users may not have asked questions the KB can't answer
- Check that RAG is enabled and returning scores
- Threshold is set at 50% - questions answered well won't appear

### Badge not updating?

- Refresh the page
- Check browser console for errors
- Verify the API is responding: `GET /api/admin/knowledge-gaps/count`

### Gaps keep appearing for same question?

- Different phrasings create different gaps
- Similar questions are normalized but must match exactly
- This is expected behavior for genuinely different questions

---

## API Reference

For developers integrating with this feature:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/knowledge-gaps` | GET | List gaps with filtering |
| `/api/admin/knowledge-gaps/count` | GET | Get new gap count |
| `/api/admin/knowledge-gaps/stats` | GET | Get statistics |
| `/api/admin/knowledge-gaps/top` | GET | Get top gaps by occurrence |
| `/api/admin/knowledge-gaps/:id` | PUT | Update gap status |
| `/api/admin/knowledge-gaps/:id` | DELETE | Delete a gap |

See `docs/KNOWLEDGE-GAPS-FEATURE.md` for full technical documentation.
