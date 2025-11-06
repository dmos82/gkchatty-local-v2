'use client';

import React, { useState, useEffect } from 'react';
import { updatePersona } from '@/lib/api/personas';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { Persona } from '@/types';

interface EditPersonaFormProps {
  isOpen: boolean;
  onClose: () => void;
  persona: Persona | null;
  onPersonaUpdated: (persona: Persona) => void;
}

export default function EditPersonaForm({
  isOpen,
  onClose,
  persona,
  onPersonaUpdated,
}: EditPersonaFormProps) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Update form fields when persona changes
  useEffect(() => {
    if (persona) {
      setName(persona.name);
      setPrompt(persona.prompt);
    } else {
      setName('');
      setPrompt('');
    }
  }, [persona]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!persona) return;

    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Persona name is required.',
        variant: 'destructive',
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Persona prompt is required.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedPersona = await updatePersona(persona._id, {
        name: name.trim(),
        prompt: prompt.trim(),
      });

      toast({
        title: 'Success',
        description: `Persona "${updatedPersona.name}" updated successfully.`,
      });

      // Notify parent component
      onPersonaUpdated(updatedPersona);

      // Close dialog
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update persona';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const hasChanges = persona && (name !== persona.name || prompt !== persona.prompt);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Persona</DialogTitle>
          <DialogDescription>Modify the persona&apos;s name and behavior prompt.</DialogDescription>
        </DialogHeader>

        {persona && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-persona-name">Persona Name</Label>
              <Input
                id="edit-persona-name"
                placeholder="e.g., Professional Assistant, Creative Writer"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isSubmitting}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-persona-prompt">System Prompt</Label>
              <Textarea
                id="edit-persona-prompt"
                placeholder="Describe how the AI should behave, its personality, and response style..."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isSubmitting}
                rows={6}
                maxLength={2000}
              />
              <p className="text-sm text-muted-foreground">{prompt.length}/2000 characters</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !name.trim() || !prompt.trim() || !hasChanges}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Persona'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
