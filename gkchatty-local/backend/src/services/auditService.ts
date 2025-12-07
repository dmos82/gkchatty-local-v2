import { Types } from 'mongoose';
import AuditLog, { IAuditLog, AuditAction, AuditResource } from '../models/AuditLogModel';
import { getLogger } from '../utils/logger';
import { isFeatureEnabled } from './featureToggleService';

const log = getLogger('auditService');

export interface AuditEventInput {
  userId?: Types.ObjectId | string | null;
  username?: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent?: string;
  sessionId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
  correlationId?: string | null;
}

export interface AuditLogFilters {
  userId?: string;
  username?: string;
  action?: AuditAction;
  resource?: AuditResource;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  correlationId?: string;
  ipAddress?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuditLogResult {
  logs: IAuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditStats {
  totalEvents: number;
  eventsByAction: Record<string, number>;
  eventsByResource: Record<string, number>;
  failedEvents: number;
  uniqueUsers: number;
  uniqueIPs: number;
  recentActivity: { date: string; count: number }[];
}

/**
 * Log an audit event
 */
export async function logAuditEvent(event: AuditEventInput): Promise<IAuditLog | null> {
  try {
    // Check if audit logging is enabled
    const auditEnabled = await isFeatureEnabled('audit_logs');
    if (!auditEnabled) {
      log.debug('Audit logging is disabled, skipping event');
      return null;
    }

    const auditLog = new AuditLog({
      timestamp: new Date(),
      userId: event.userId ? new Types.ObjectId(event.userId.toString()) : null,
      username: event.username || null,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId || null,
      details: event.details || {},
      ipAddress: event.ipAddress,
      userAgent: event.userAgent || '',
      sessionId: event.sessionId || null,
      success: event.success !== undefined ? event.success : true,
      errorMessage: event.errorMessage || null,
      correlationId: event.correlationId || null,
    });

    const saved = await auditLog.save();
    log.debug({ action: event.action, resource: event.resource, userId: event.userId }, 'Audit event logged');
    return saved;
  } catch (error) {
    log.error({ error, event }, 'Failed to log audit event');
    // Don't throw - audit logging should not break the main flow
    return null;
  }
}

/**
 * Get audit logs with filters and pagination
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {},
  pagination: PaginationOptions = { page: 1, limit: 50 }
): Promise<AuditLogResult> {
  const query: Record<string, unknown> = {};

  if (filters.userId) {
    query.userId = new Types.ObjectId(filters.userId);
  }
  if (filters.username) {
    query.username = { $regex: filters.username, $options: 'i' };
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (filters.resource) {
    query.resource = filters.resource;
  }
  if (filters.success !== undefined) {
    query.success = filters.success;
  }
  if (filters.correlationId) {
    query.correlationId = filters.correlationId;
  }
  if (filters.ipAddress) {
    query.ipAddress = filters.ipAddress;
  }
  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) {
      (query.timestamp as Record<string, Date>).$gte = filters.startDate;
    }
    if (filters.endDate) {
      (query.timestamp as Record<string, Date>).$lte = filters.endDate;
    }
  }

  const { page, limit, sortBy = 'timestamp', sortOrder = 'desc' } = pagination;
  const skip = (page - 1) * limit;
  const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort(sort).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs: logs as IAuditLog[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Export audit logs to JSON or CSV format
 */
export async function exportAuditLogs(
  filters: AuditLogFilters = {},
  format: 'json' | 'csv' = 'json'
): Promise<string> {
  const query: Record<string, unknown> = {};

  if (filters.userId) {
    query.userId = new Types.ObjectId(filters.userId);
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (filters.resource) {
    query.resource = filters.resource;
  }
  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) {
      (query.timestamp as Record<string, Date>).$gte = filters.startDate;
    }
    if (filters.endDate) {
      (query.timestamp as Record<string, Date>).$lte = filters.endDate;
    }
  }

  const logs = await AuditLog.find(query)
    .sort({ timestamp: -1 })
    .limit(10000) // Safety limit
    .lean();

  if (format === 'json') {
    return JSON.stringify(logs, null, 2);
  }

  // CSV format
  const headers = [
    'timestamp',
    'userId',
    'username',
    'action',
    'resource',
    'resourceId',
    'ipAddress',
    'success',
    'errorMessage',
    'correlationId',
  ];
  const csvRows = [headers.join(',')];

  for (const log of logs) {
    const row = headers.map((header) => {
      const value = (log as Record<string, unknown>)[header];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') return JSON.stringify(value).replace(/,/g, ';');
      return String(value).replace(/,/g, ';');
    });
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Get aggregated audit statistics
 */
export async function getAuditStats(startDate?: Date, endDate?: Date): Promise<AuditStats> {
  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;

  const matchStage: Record<string, unknown> = {};
  if (Object.keys(dateFilter).length > 0) {
    matchStage.timestamp = dateFilter;
  }

  const [
    totalResult,
    actionStats,
    resourceStats,
    failedResult,
    uniqueUsersResult,
    uniqueIPsResult,
    dailyActivity,
  ] = await Promise.all([
    AuditLog.countDocuments(matchStage),
    AuditLog.aggregate([
      { $match: matchStage },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    AuditLog.aggregate([
      { $match: matchStage },
      { $group: { _id: '$resource', count: { $sum: 1 } } },
    ]),
    AuditLog.countDocuments({ ...matchStage, success: false }),
    AuditLog.distinct('userId', matchStage),
    AuditLog.distinct('ipAddress', matchStage),
    AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]),
  ]);

  const eventsByAction: Record<string, number> = {};
  for (const stat of actionStats) {
    eventsByAction[stat._id] = stat.count;
  }

  const eventsByResource: Record<string, number> = {};
  for (const stat of resourceStats) {
    eventsByResource[stat._id] = stat.count;
  }

  const recentActivity = dailyActivity.map((day) => ({
    date: day._id,
    count: day.count,
  }));

  return {
    totalEvents: totalResult,
    eventsByAction,
    eventsByResource,
    failedEvents: failedResult,
    uniqueUsers: uniqueUsersResult.length,
    uniqueIPs: uniqueIPsResult.length,
    recentActivity,
  };
}

/**
 * Delete old audit logs (for data retention)
 */
export async function deleteOldAuditLogs(olderThanDays: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await AuditLog.deleteMany({ timestamp: { $lt: cutoffDate } });
  log.info({ deletedCount: result.deletedCount, olderThanDays }, 'Deleted old audit logs');
  return result.deletedCount;
}
