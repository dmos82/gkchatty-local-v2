import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface ChatNotesPanelProps {
  chatId: string | null;
  initialNotes: string | null | undefined;
  onSaveNotes: (chatId: string | null, notes: string) => Promise<void>; // Function to call save API
  isLoading: boolean; // Prop to indicate if notes are being saved
}

const ChatNotesPanel: React.FC<ChatNotesPanelProps> = ({
  chatId,
  initialNotes,
  onSaveNotes,
  isLoading,
}) => {
  const [notes, setNotes] = useState(initialNotes || '');
  const [isEditing, setIsEditing] = useState(false); // Track unsaved changes

  // Update local state if initialNotes change (e.g., when selecting a different chat)
  useEffect(() => {
    setNotes(initialNotes || '');
    setIsEditing(false); // Reset editing status on chat change
  }, [initialNotes, chatId]);

  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
    setIsEditing(true); // Mark as edited
  };

  const handleSave = async () => {
    console.log(`[ChatNotesPanel] Attempting to save notes for chat ${chatId || 'new chat'}`);
    await onSaveNotes(chatId, notes);
    setIsEditing(false); // Mark as saved (assuming save is successful, might need error handling feedback)
  };

  return (
    <div className="p-4 flex flex-col h-full bg-card text-card-foreground rounded-lg border">
      <h3 className="text-lg font-semibold mb-3 border-b pb-2">
        Chat Notes
      </h3>
      <Textarea
        value={notes}
        onChange={handleNotesChange}
        placeholder="Add notes for this chat..."
        className="flex-grow resize-none text-sm"
        rows={10} // Adjust as needed
      />
      <div className="mt-3 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!isEditing || isLoading}
          size="sm"
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isLoading ? 'Saving...' : 'Save Notes'}
        </Button>
      </div>
    </div>
  );
};

export default ChatNotesPanel;
