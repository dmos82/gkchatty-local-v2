'use client';

import React, { useState, useEffect } from 'react';
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
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

interface FeedbackEntry {
  _id: string;
  feedbackText: string;
  userId: string;
  username: string;
  chatId?: string;
  createdAt: string;
}

const FeedbackPanel: React.FC = () => {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const { toast } = useToast();

  // Fetch feedback data
  const fetchFeedback = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feedback`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.feedback)) {
        setFeedback(data.feedback);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      console.error('[FeedbackPanel] Error fetching feedback:', err);
      setError(err.message || 'Failed to load feedback');
      toast({
        title: 'Error Loading Feedback',
        description: err.message || 'Could not load feedback data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a specific feedback entry
  const handleDeleteFeedback = async (feedbackId: string) => {
    setIsDeletingItem(feedbackId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feedback/${feedbackId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      // Remove the deleted item from state
      setFeedback(prevFeedback => prevFeedback.filter(item => item._id !== feedbackId));

      toast({
        title: 'Feedback Deleted',
        description: 'The feedback entry has been deleted successfully.',
      });
    } catch (err: any) {
      console.error(`[FeedbackPanel] Error deleting feedback ${feedbackId}:`, err);
      toast({
        title: 'Error Deleting Feedback',
        description: err.message || 'Could not delete the feedback entry. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingItem(null);
    }
  };

  // Delete all feedback entries
  const handleDeleteAllFeedback = async () => {
    setIsDeletingAll(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feedback`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      // Clear all feedback from state
      setFeedback([]);

      toast({
        title: 'All Feedback Deleted',
        description: 'All feedback entries have been deleted successfully.',
      });
    } catch (err: any) {
      console.error('[FeedbackPanel] Error deleting all feedback:', err);
      toast({
        title: 'Error Deleting All Feedback',
        description: err.message || 'Could not delete all feedback entries. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Load feedback on component mount
  useEffect(() => {
    fetchFeedback();
  }, []);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">User Feedback ({feedback.length})</h3>

        {feedback.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeletingAll || isLoading}>
                {isDeletingAll ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete All Feedback?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all
                  <strong> ({feedback.length}) </strong>
                  feedback entries from the database.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAllFeedback}
                  disabled={isDeletingAll}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isDeletingAll ? 'Deleting...' : 'Confirm Delete All'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive">
          <p>{error}</p>
          <Button variant="outline" className="mt-2" onClick={fetchFeedback}>
            Try Again
          </Button>
        </div>
      ) : feedback.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">
          <p>No feedback has been submitted yet.</p>
        </div>
      ) : (
        <div className="border rounded-md max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Feedback</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedback.map(item => (
                <TableRow key={item._id}>
                  <TableCell className="font-medium max-w-md">
                    <div className="whitespace-normal break-words">{item.feedbackText}</div>
                  </TableCell>
                  <TableCell>{item.username}</TableCell>
                  <TableCell>{formatDate(item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFeedback(item._id)}
                      disabled={isDeletingItem === item._id}
                      className="text-destructive hover:text-destructive/80"
                    >
                      {isDeletingItem === item._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default FeedbackPanel;
