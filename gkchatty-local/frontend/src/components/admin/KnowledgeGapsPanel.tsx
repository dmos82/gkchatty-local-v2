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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, RefreshCw, CheckCircle, Eye, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

type GapStatus = 'new' | 'reviewed' | 'addressed' | 'dismissed';

interface KnowledgeGap {
  _id: string;
  query: string;
  normalizedQuery: string;
  bestScore: number;
  occurrenceCount: number;
  lastAskedAt: string;
  firstAskedAt: string;
  userIds: string[];
  status: GapStatus;
  reviewedBy: { _id: string; username: string } | null;
  reviewedAt: string | null;
  notes: string | null;
  suggestedDocTitle: string | null;
}

interface GapStats {
  total: number;
  new: number;
  reviewed: number;
  addressed: number;
  dismissed: number;
  topQuestions: number;
  uniqueUsers: number;
}

interface KnowledgeGapsPanelProps {
  onNewGapCountChange?: (count: number) => void;
}

const KnowledgeGapsPanel: React.FC<KnowledgeGapsPanelProps> = ({ onNewGapCountChange }) => {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [stats, setStats] = useState<GapStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Update dialog state
  const [selectedGap, setSelectedGap] = useState<KnowledgeGap | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<GapStatus>('reviewed');
  const [updateNotes, setUpdateNotes] = useState('');
  const [suggestedDocTitle, setSuggestedDocTitle] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete state
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const { toast } = useToast();

  // Fetch knowledge gaps
  const fetchGaps = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetchWithAuth(`/api/admin/knowledge-gaps?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setGaps(data.gaps || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        throw new Error(data.message || 'Failed to fetch knowledge gaps');
      }
    } catch (err: any) {
      console.error('[KnowledgeGapsPanel] Error fetching gaps:', err);
      setError(err.message || 'Failed to load knowledge gaps');
      toast({
        title: 'Error Loading Knowledge Gaps',
        description: err.message || 'Could not load data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, toast]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/admin/knowledge-gaps/stats', {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
          // Notify parent of new gap count for badge
          if (onNewGapCountChange) {
            onNewGapCountChange(data.stats.new || 0);
          }
        }
      }
    } catch (err) {
      console.error('[KnowledgeGapsPanel] Error fetching stats:', err);
    }
  }, [onNewGapCountChange]);

  // Initial load
  useEffect(() => {
    fetchGaps();
    fetchStats();
  }, [fetchGaps, fetchStats]);

  // Update gap status
  const handleUpdateGap = async () => {
    if (!selectedGap) return;

    setIsUpdating(true);
    try {
      const response = await fetchWithAuth(`/api/admin/knowledge-gaps/${selectedGap._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: updateStatus,
          notes: updateNotes || undefined,
          suggestedDocTitle: suggestedDocTitle || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update gap');
      }

      toast({
        title: 'Gap Updated',
        description: `Knowledge gap status updated to "${updateStatus}".`,
      });

      setIsUpdateDialogOpen(false);
      setSelectedGap(null);
      setUpdateNotes('');
      setSuggestedDocTitle('');

      // Refresh data
      fetchGaps();
      fetchStats();
    } catch (err: any) {
      console.error('[KnowledgeGapsPanel] Error updating gap:', err);
      toast({
        title: 'Error Updating Gap',
        description: err.message || 'Could not update. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete gap
  const handleDeleteGap = async (gapId: string) => {
    setIsDeletingId(gapId);
    try {
      const response = await fetchWithAuth(`/api/admin/knowledge-gaps/${gapId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete gap');
      }

      toast({
        title: 'Gap Deleted',
        description: 'Knowledge gap has been removed.',
      });

      // Refresh data
      fetchGaps();
      fetchStats();
    } catch (err: any) {
      console.error('[KnowledgeGapsPanel] Error deleting gap:', err);
      toast({
        title: 'Error Deleting Gap',
        description: err.message || 'Could not delete. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  // Open update dialog
  const openUpdateDialog = (gap: KnowledgeGap) => {
    setSelectedGap(gap);
    setUpdateStatus(gap.status === 'new' ? 'reviewed' : gap.status);
    setUpdateNotes(gap.notes || '');
    setSuggestedDocTitle(gap.suggestedDocTitle || '');
    setIsUpdateDialogOpen(true);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Get status badge variant
  const getStatusBadge = (status: GapStatus) => {
    switch (status) {
      case 'new':
        return <Badge variant="destructive">New</Badge>;
      case 'reviewed':
        return <Badge variant="secondary">Reviewed</Badge>;
      case 'addressed':
        return <Badge className="bg-green-500 hover:bg-green-600">Addressed</Badge>;
      case 'dismissed':
        return <Badge variant="outline">Dismissed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score < 0.3) return 'text-red-500';
    if (score < 0.4) return 'text-orange-500';
    return 'text-yellow-600';
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3 border rounded-lg bg-background">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
            <p className="text-xs text-muted-foreground">New</p>
            <p className="text-xl font-bold text-red-600">{stats.new}</p>
          </div>
          <div className="p-3 border rounded-lg bg-background">
            <p className="text-xs text-muted-foreground">Reviewed</p>
            <p className="text-xl font-bold">{stats.reviewed}</p>
          </div>
          <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
            <p className="text-xs text-muted-foreground">Addressed</p>
            <p className="text-xl font-bold text-green-600">{stats.addressed}</p>
          </div>
          <div className="p-3 border rounded-lg bg-background">
            <p className="text-xs text-muted-foreground">Dismissed</p>
            <p className="text-xl font-bold">{stats.dismissed}</p>
          </div>
          <div className="p-3 border rounded-lg bg-background">
            <p className="text-xs text-muted-foreground">Frequent (3+)</p>
            <p className="text-xl font-bold">{stats.topQuestions}</p>
          </div>
          <div className="p-3 border rounded-lg bg-background">
            <p className="text-xs text-muted-foreground">Unique Users</p>
            <p className="text-xl font-bold">{stats.uniqueUsers}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold">Knowledge Gaps ({total})</h3>
          <Button variant="outline" size="sm" onClick={() => { fetchGaps(); fetchStats(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="addressed">Addressed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive">
          <p>{error}</p>
          <Button variant="outline" className="mt-2" onClick={fetchGaps}>
            Try Again
          </Button>
        </div>
      ) : gaps.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">No knowledge gaps found.</p>
          <p className="text-sm">Questions with low RAG scores will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-md max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[300px]">Question</TableHead>
                <TableHead className="text-center">Count</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Asked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gaps.map(gap => (
                <TableRow key={gap._id}>
                  <TableCell className="font-medium max-w-[300px]">
                    <div className="whitespace-normal break-words">{gap.query}</div>
                    {gap.notes && (
                      <div className="text-xs text-muted-foreground mt-1 italic">
                        Note: {gap.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={gap.occurrenceCount >= 3 ? 'font-bold text-orange-500' : ''}>
                      {gap.occurrenceCount}
                    </span>
                  </TableCell>
                  <TableCell className={`text-center ${getScoreColor(gap.bestScore)}`}>
                    {(gap.bestScore * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell>{getStatusBadge(gap.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(gap.lastAskedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openUpdateDialog(gap)}
                        title="Review / Update"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">Review</span>
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isDeletingId === gap._id}
                            className="text-destructive hover:text-destructive/80"
                          >
                            {isDeletingId === gap._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span className="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Knowledge Gap?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this knowledge gap record. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteGap(gap._id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            Previous
          </Button>
          <span className="py-2 px-4 text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            Next
          </Button>
        </div>
      )}

      {/* Update Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Review Knowledge Gap</DialogTitle>
            <DialogDescription>
              Update the status and add notes for this knowledge gap.
            </DialogDescription>
          </DialogHeader>

          {selectedGap && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{selectedGap.query}</p>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Asked {selectedGap.occurrenceCount} time(s)</span>
                  <span>Score: {(selectedGap.bestScore * 100).toFixed(0)}%</span>
                  <span>Users: {selectedGap.userIds.length}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={updateStatus} onValueChange={(v: GapStatus) => setUpdateStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="addressed">Addressed (Added to KB)</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {updateStatus === 'addressed' && (
                <div className="space-y-2">
                  <Label htmlFor="docTitle">Document Added (Optional)</Label>
                  <Input
                    id="docTitle"
                    value={suggestedDocTitle}
                    onChange={(e) => setSuggestedDocTitle(e.target.value)}
                    placeholder="e.g., FAQ - Account Setup"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Add notes about this gap..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateDialogOpen(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGap} disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeGapsPanel;
