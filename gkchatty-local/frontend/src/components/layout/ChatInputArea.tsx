'use client';

import React, { useState } from 'react';
import ChatFileUpload from '@/components/chat/ChatFileUpload';
import { Button } from '@/components/ui/button';
import { Paperclip, Send } from 'lucide-react';

export default function ChatInputArea() {
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState('');

  const handleUploadComplete = (uploadedFiles: Array<{ fileName: string; documentId: string }>) => {
    console.log('Files uploaded to My Documents:', uploadedFiles);
    setShowUpload(false);
    // Could show a toast or add a message about uploaded files
  };

  return (
    <footer className="p-4 border-t border-border bg-background text-foreground flex-shrink-0">
      <div className="max-w-4xl mx-auto">
        {/* File Upload Area - shows when attachment button is clicked */}
        {showUpload && (
          <div className="mb-4">
            <ChatFileUpload
              onUploadComplete={handleUploadComplete}
              onUploadStart={() => console.log('Upload started')}
              className="mb-4"
            />
          </div>
        )}

        {/* Chat Input */}
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-3 pr-20 rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpload(!showUpload)}
                className="h-8 w-8 p-0"
                title="Attach files"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              {/* Compact upload button alternative */}
              {!showUpload && (
                <ChatFileUpload compact onUploadComplete={handleUploadComplete} className="h-8" />
              )}
            </div>
          </div>
          <Button size="sm" disabled={!message.trim()} className="h-11 px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </footer>
  );
}
