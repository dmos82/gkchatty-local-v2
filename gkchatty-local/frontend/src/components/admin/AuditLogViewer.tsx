'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  CheckCircle,
  XCircle,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { cn } from '@/lib/utils';

// Types matching backend
type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'CHAT_QUERY'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'SETTINGS_UPDATED'
  | 'FEATURE_TOGGLE_CHANGED'
  | 'SESSION_TERMINATED'
  | 'BUDGET_EXCEEDED'
  | 'PII_DETECTED'
  | 'IP_BLOCKED'
  | 'ADMIN_ACTION';

type AuditResource = 'USER' | 'CHAT' | 'DOCUMENT' | 'SETTINGS' | 'SYSTEM' | 'FEATURE';

interface AuditLogEntry {
  _id: string;
  timestamp: string;
  userId: string | null;
  username: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  sessionId: string | null;
  success: boolean;
  errorMessage: string | null;
  correlationId: string | null;
}

interface AuditStats {
  totalEvents: number;
  eventsByAction: Record<string, number>;
  eventsByResource: Record<string, number>;
  failedEvents: number;
  uniqueUsers: number;
  uniqueIPs: number;
  recentActivity: { date: string; count: number }[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const AUDIT_ACTIONS: AuditAction[] = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'CHAT_QUERY',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
  'SETTINGS_UPDATED',
  'FEATURE_TOGGLE_CHANGED',
  'SESSION_TERMINATED',
  'BUDGET_EXCEEDED',
  'PII_DETECTED',
  'IP_BLOCKED',
  'ADMIN_ACTION',
];

const AUDIT_RESOURCES: AuditResource[] = [
  'USER',
  'CHAT',
  'DOCUMENT',
  'SETTINGS',
  'SYSTEM',
  'FEATURE',
];

const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [successFilter, setSuccessFilter] = useState<string>('all');
  const [usernameFilter, setUsernameFilter] = useState<string>('');
  const [correlationIdFilter, setCorrelationIdFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Show stats panel
  const [showStats, setShowStats] = useState(false);

  const { toast } = useToast();

  // Build query params from filters
  const buildQueryParams = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pagination.limit.toString());

      if (actionFilter && actionFilter !== 'all') {
        params.set('action', actionFilter);
      }
      if (resourceFilter && resourceFilter !== 'all') {
        params.set('resource', resourceFilter);
      }
      if (successFilter !== 'all') {
        params.set('success', successFilter);
      }
      if (usernameFilter.trim()) {
        params.set('username', usernameFilter.trim());
      }
      if (correlationIdFilter.trim()) {
        params.set('correlationId', correlationIdFilter.trim());
      }
      if (startDate) {
        params.set('startDate', new Date(startDate).toISOString());
      }
      if (endDate) {
        params.set('endDate', new Date(endDate).toISOString());
      }

      return params.toString();
    },
    [
      pagination.limit,
      actionFilter,
      resourceFilter,
      successFilter,
      usernameFilter,
      correlationIdFilter,
      startDate,
      endDate,
    ]
  );

  // Fetch audit logs
  const fetchLogs = useCallback(
    async (page: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        const queryString = buildQueryParams(page);
        const response = await fetchWithAuth(`/api/admin/audit-logs?${queryString}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setPagination({
            page: data.page || page,
            limit: data.limit || 25,
            total: data.total || 0,
            totalPages: data.totalPages || 0,
          });
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err: unknown) {
        console.error('[AuditLogViewer] Error fetching logs:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load audit logs';
        setError(errorMessage);
        toast({
          title: 'Error Loading Audit Logs',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [buildQueryParams, toast]
  );

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setIsStatsLoading(true);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', new Date(startDate).toISOString());
      if (endDate) params.set('endDate', new Date(endDate).toISOString());

      const response = await fetchWithAuth(`/api/admin/audit-logs/stats?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err: unknown) {
      console.error('[AuditLogViewer] Error fetching stats:', err);
    } finally {
      setIsStatsLoading(false);
    }
  }, [startDate, endDate]);

  // Export logs
  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(true);

    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (actionFilter && actionFilter !== 'all') params.set('action', actionFilter);
      if (resourceFilter && resourceFilter !== 'all') params.set('resource', resourceFilter);
      if (startDate) params.set('startDate', new Date(startDate).toISOString());
      if (endDate) params.set('endDate', new Date(endDate).toISOString());

      const response = await fetchWithAuth(`/api/admin/audit-logs/export?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to export logs');
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Create download
        const blob = new Blob([data.data], {
          type: format === 'json' ? 'application/json' : 'text/csv',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Export Complete',
          description: `Audit logs exported as ${format.toUpperCase()}`,
        });
      }
    } catch (err: unknown) {
      console.error('[AuditLogViewer] Export error:', err);
      toast({
        title: 'Export Failed',
        description: 'Could not export audit logs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setActionFilter('all');
    setResourceFilter('all');
    setSuccessFilter('all');
    setUsernameFilter('');
    setCorrelationIdFilter('');
    setStartDate('');
    setEndDate('');
  };

  // Initial load
  useEffect(() => {
    fetchLogs(1);
  }, []);

  // Refetch when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchLogs(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [
    actionFilter,
    resourceFilter,
    successFilter,
    usernameFilter,
    correlationIdFilter,
    startDate,
    endDate,
  ]);

  // Format timestamp
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Get action badge color
  const getActionBadgeVariant = (action: AuditAction): 'default' | 'destructive' | 'secondary' => {
    if (action.includes('FAILED') || action.includes('BLOCKED') || action.includes('EXCEEDED')) {
      return 'destructive';
    }
    if (action.includes('DELETED')) {
      return 'secondary';
    }
    return 'default';
  };

  // Render details as formatted string
  const formatDetails = (details: Record<string, unknown>): string => {
    const entries = Object.entries(details).filter(
      ([key]) => !['method', 'path', 'statusCode', 'responseTimeMs'].includes(key)
    );
    if (entries.length === 0) return '-';
    return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Audit Logs</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowStats(!showStats);
              if (!showStats) fetchStats();
            }}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(pagination.page)}
            disabled={isLoading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            disabled={isExporting || logs.length === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json')}
            disabled={isExporting || logs.length === 0}
          >
            Export JSON
          </Button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && (
        <div className="bg-muted/50 p-4 rounded-lg border">
          {isStatsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-background rounded-lg border">
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-background rounded-lg border">
                <p className="text-sm text-muted-foreground">Failed Events</p>
                <p className="text-2xl font-bold text-destructive">
                  {stats.failedEvents.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-background rounded-lg border">
                <p className="text-sm text-muted-foreground">Unique Users</p>
                <p className="text-2xl font-bold">{stats.uniqueUsers.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-background rounded-lg border">
                <p className="text-sm text-muted-foreground">Unique IPs</p>
                <p className="text-2xl font-bold">{stats.uniqueIPs.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No stats available</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Filters</h4>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            Clear Filters
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Action Filter */}
          <div className="space-y-1">
            <Label htmlFor="action-filter" className="text-xs">
              Action
            </Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger id="action-filter">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {AUDIT_ACTIONS.map(action => (
                  <SelectItem key={action} value={action}>
                    {action.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resource Filter */}
          <div className="space-y-1">
            <Label htmlFor="resource-filter" className="text-xs">
              Resource
            </Label>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger id="resource-filter">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {AUDIT_RESOURCES.map(resource => (
                  <SelectItem key={resource} value={resource}>
                    {resource}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Success Filter */}
          <div className="space-y-1">
            <Label htmlFor="success-filter" className="text-xs">
              Status
            </Label>
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger id="success-filter">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Success</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Username Filter */}
          <div className="space-y-1">
            <Label htmlFor="username-filter" className="text-xs">
              Username
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="username-filter"
                placeholder="Filter by user..."
                value={usernameFilter}
                onChange={e => setUsernameFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <Label htmlFor="start-date" className="text-xs">
              Start Date
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <Label htmlFor="end-date" className="text-xs">
              End Date
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Correlation ID Filter (separate row) */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="correlation-filter" className="text-xs">
              Correlation ID
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="correlation-filter"
                placeholder="Search by correlation ID..."
                value={correlationIdFilter}
                onChange={e => setCorrelationIdFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        Showing {logs.length} of {pagination.total.toLocaleString()} events
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive">
          <p>{error}</p>
          <Button variant="outline" className="mt-2" onClick={() => fetchLogs(1)}>
            Try Again
          </Button>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border rounded-md">
          <p>No audit logs found matching your filters.</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[160px]">Timestamp</TableHead>
                  <TableHead className="w-[120px]">User</TableHead>
                  <TableHead className="w-[140px]">Action</TableHead>
                  <TableHead className="w-[100px]">Resource</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[120px]">IP Address</TableHead>
                  <TableHead className="w-[80px] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log._id}>
                    <TableCell className="text-xs font-mono">
                      {formatDate(log.timestamp)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.username || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.resource}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate" title={formatDetails(log.details)}>
                      {formatDetails(log.details)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.ipAddress}</TableCell>
                    <TableCell className="text-center">
                      {log.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
