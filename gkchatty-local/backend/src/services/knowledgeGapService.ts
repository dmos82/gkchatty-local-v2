import mongoose from 'mongoose';
import KnowledgeGap, { IKnowledgeGap, GapStatus } from '../models/KnowledgeGapModel';
import { getLogger } from '../utils/logger';

const log = getLogger('knowledgeGapService');

// Threshold below which a query is considered a "knowledge gap"
const GAP_SCORE_THRESHOLD = 0.5;

/**
 * Normalize a query for grouping similar questions
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:'"]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ');        // Normalize whitespace
}

/**
 * Record a potential knowledge gap when RAG score is low
 */
export async function recordKnowledgeGap(
  query: string,
  bestScore: number,
  userId: string | null
): Promise<void> {
  // Only record if score is below threshold
  if (bestScore >= GAP_SCORE_THRESHOLD) {
    return;
  }

  const normalizedQuery = normalizeQuery(query);

  try {
    const userIdObj = userId ? new mongoose.Types.ObjectId(userId) : null;

    // Try to find existing gap with this normalized query
    const existingGap = await KnowledgeGap.findOne({ normalizedQuery });

    if (existingGap) {
      // Update existing gap
      existingGap.occurrenceCount += 1;
      existingGap.lastAskedAt = new Date();

      // Track best score (highest among low scores)
      if (bestScore > existingGap.bestScore) {
        existingGap.bestScore = bestScore;
      }

      // Add user if not already tracked
      if (userIdObj && !existingGap.userIds.some(id => id.equals(userIdObj))) {
        existingGap.userIds.push(userIdObj);
      }

      // Reset to 'new' if it was dismissed but is being asked again
      if (existingGap.status === 'dismissed') {
        existingGap.status = 'new';
      }

      await existingGap.save();
      log.debug({ query: normalizedQuery, count: existingGap.occurrenceCount }, 'Updated existing knowledge gap');
    } else {
      // Create new gap record
      const newGap = new KnowledgeGap({
        query,
        normalizedQuery,
        bestScore,
        occurrenceCount: 1,
        firstAskedAt: new Date(),
        lastAskedAt: new Date(),
        userIds: userIdObj ? [userIdObj] : [],
        status: 'new',
      });

      await newGap.save();
      log.debug({ query: normalizedQuery, score: bestScore }, 'Recorded new knowledge gap');
    }
  } catch (error) {
    // Don't throw - this is a background operation
    log.error({ error, query }, 'Failed to record knowledge gap');
  }
}

/**
 * Get knowledge gaps with filtering and pagination
 */
export async function getKnowledgeGaps(options: {
  status?: GapStatus | GapStatus[];
  minOccurrences?: number;
  page?: number;
  limit?: number;
  sortBy?: 'occurrenceCount' | 'lastAskedAt' | 'firstAskedAt';
  sortOrder?: 'asc' | 'desc';
}): Promise<{
  gaps: IKnowledgeGap[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const {
    status,
    minOccurrences = 1,
    page = 1,
    limit = 20,
    sortBy = 'occurrenceCount',
    sortOrder = 'desc',
  } = options;

  const filter: Record<string, unknown> = {
    occurrenceCount: { $gte: minOccurrences },
  };

  if (status) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  }

  const total = await KnowledgeGap.countDocuments(filter);
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  const gaps = await KnowledgeGap.find(filter)
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip(skip)
    .limit(limit)
    .populate('reviewedBy', 'username')
    .lean();

  return {
    gaps: gaps as IKnowledgeGap[],
    total,
    page,
    totalPages,
  };
}

/**
 * Get count of new (unreviewed) knowledge gaps for notification badge
 */
export async function getNewGapCount(): Promise<number> {
  return KnowledgeGap.countDocuments({ status: 'new' });
}

/**
 * Get top knowledge gaps (most frequently asked unanswered questions)
 */
export async function getTopKnowledgeGaps(limit: number = 10): Promise<IKnowledgeGap[]> {
  const gaps = await KnowledgeGap.find({ status: { $in: ['new', 'reviewed'] } })
    .sort({ occurrenceCount: -1 })
    .limit(limit)
    .lean();

  return gaps as IKnowledgeGap[];
}

/**
 * Update the status of a knowledge gap
 */
export async function updateGapStatus(
  gapId: string,
  status: GapStatus,
  adminUserId: string,
  notes?: string,
  suggestedDocTitle?: string
): Promise<IKnowledgeGap | null> {
  const update: Record<string, unknown> = {
    status,
    reviewedBy: new mongoose.Types.ObjectId(adminUserId),
    reviewedAt: new Date(),
  };

  if (notes !== undefined) {
    update.notes = notes;
  }

  if (suggestedDocTitle !== undefined) {
    update.suggestedDocTitle = suggestedDocTitle;
  }

  const gap = await KnowledgeGap.findByIdAndUpdate(
    gapId,
    { $set: update },
    { new: true }
  ).populate('reviewedBy', 'username');

  return gap;
}

/**
 * Get knowledge gap statistics
 */
export async function getGapStats(): Promise<{
  total: number;
  new: number;
  reviewed: number;
  addressed: number;
  dismissed: number;
  topQuestions: number;
  uniqueUsers: number;
}> {
  const [statusCounts, topQuestions, uniqueUsers] = await Promise.all([
    KnowledgeGap.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    KnowledgeGap.countDocuments({ occurrenceCount: { $gte: 3 } }),
    KnowledgeGap.aggregate([
      { $unwind: '$userIds' },
      { $group: { _id: '$userIds' } },
      { $count: 'count' }
    ]),
  ]);

  const counts = statusCounts.reduce((acc: Record<string, number>, { _id, count }: { _id: string; count: number }) => {
    acc[_id] = count;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: (Object.values(counts) as number[]).reduce((a: number, b: number) => a + b, 0),
    new: counts.new || 0,
    reviewed: counts.reviewed || 0,
    addressed: counts.addressed || 0,
    dismissed: counts.dismissed || 0,
    topQuestions,
    uniqueUsers: uniqueUsers[0]?.count || 0,
  };
}

/**
 * Delete a knowledge gap (admin only)
 */
export async function deleteGap(gapId: string): Promise<boolean> {
  const result = await KnowledgeGap.findByIdAndDelete(gapId);
  return !!result;
}
