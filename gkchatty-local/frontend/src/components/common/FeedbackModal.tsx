'use client';

import React, { useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

interface FeedbackModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentChatId?: string | null; // Optional chat ID to associate with feedback
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onOpenChange, currentChatId }) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async () => {
    // Reset error state
    setError(null);

    // Validate input
    if (!feedbackText.trim()) {
      setError('Please enter your feedback before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare payload
      const payload: { feedbackText: string; chatId?: string } = {
        feedbackText: feedbackText.trim(),
      };

      // Add chatId if available
      if (currentChatId) {
        payload.chatId = currentChatId;
      }

      // Submit feedback
      const response = await fetchWithAuth('/api/feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Handle API error responses
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      // Success! Clear form and close modal
      setFeedbackText('');
      onOpenChange(false);

      // Show success toast
      toast({
        title: 'Feedback Submitted',
        description: 'Thank you for your feedback!',
        variant: 'default',
      });
    } catch (err: any) {
      console.error('[FeedbackModal] Error submitting feedback:', err);
      setError(err.message || 'Failed to submit feedback. Please try again.');

      // Show error toast
      toast({
        title: 'Submission Failed',
        description: err.message || 'An error occurred while submitting your feedback.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFeedbackText('');
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning size={20} className="text-primary" />
            Submit Feedback
          </DialogTitle>
          <DialogDescription>
            Please share your thoughts, suggestions, or report any issues you've encountered.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            id="feedback"
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            placeholder="Your feedback here..."
            className="min-h-[120px] resize-y"
            aria-label="Feedback text"
            disabled={isSubmitting}
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="mr-2"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!feedbackText.trim() || isSubmitting}
            className="transition-all duration-200 ease-in-out hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
