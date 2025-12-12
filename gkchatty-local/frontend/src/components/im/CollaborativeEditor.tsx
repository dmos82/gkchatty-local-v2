'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import { X, Save, FileText, Users, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

interface CollaborativeEditorProps {
  documentId: string | null;
  conversationId: string;
  socket: Socket | null;
  currentUser: {
    id: string;
    username: string;
  };
  onClose: () => void;
  onCreateDocument?: (title: string, fileType: string) => void;
  initialTitle?: string;
  initialFileType?: string;
}

interface Participant {
  id: string;
  name: string;
  color: string;
  cursor?: { index: number; length: number };
}

export default function CollaborativeEditor({
  documentId,
  conversationId,
  socket,
  currentUser,
  onClose,
  onCreateDocument,
  initialTitle = 'Untitled Document',
  initialFileType = 'docx',
}: CollaborativeEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [fileType, setFileType] = useState(initialFileType);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isCreating, setIsCreating] = useState(!documentId);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Yjs document - created synchronously so it's available for useEditor
  const ydoc = useMemo(() => new Y.Doc(), []);

  // Cleanup Yjs document on unmount
  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  // Generate consistent color for current user
  const getUserColor = useCallback((userId: string) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
    ];
    const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
    return colors[hash % colors.length];
  }, []);

  // TipTap editor with collaboration extensions
  const editor = useEditor({
    immediatelyRender: false, // Required for SSR/Next.js - prevents hydration mismatches
    extensions: [
      StarterKit.configure({
        // Disable default history - Yjs handles undo/redo
        // @ts-expect-error TipTap types don't expose history option but it works at runtime
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      // Note: CollaborationCursor removed - requires a provider with awareness.
      // We handle participant awareness manually via socket events.
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4',
      },
    },
  }, [ydoc]);

  // Socket event handlers for collaboration
  useEffect(() => {
    if (!socket || !documentId) return;

    // Join the document
    socket.emit('collab:join', { documentId });

    // Handle receiving document state on join
    const handleJoined = (data: {
      documentId: string;
      title: string;
      fileType: string;
      state: number[];
      participants: string[];
    }) => {
      setTitle(data.title);
      setFileType(data.fileType);

      // Apply initial state to Yjs doc
      if (data.state.length > 0) {
        Y.applyUpdate(ydoc, new Uint8Array(data.state));
      }

      // Set participants
      setParticipants(data.participants.map(name => ({
        id: name, // Using username as ID for display
        name,
        color: getUserColor(name),
      })));
    };

    // Handle sync updates from other users
    const handleSync = (data: { documentId: string; update: number[] }) => {
      if (data.documentId === documentId) {
        Y.applyUpdate(ydoc, new Uint8Array(data.update));
      }
    };

    // Handle awareness updates (cursor positions)
    const handleAwareness = (data: {
      documentId: string;
      awareness: {
        cursor?: { index: number; length: number };
        user: { id: string; name: string; color: string };
      };
    }) => {
      if (data.documentId === documentId) {
        setParticipants(prev => {
          const existing = prev.find(p => p.id === data.awareness.user.id);
          if (existing) {
            return prev.map(p =>
              p.id === data.awareness.user.id
                ? { ...p, cursor: data.awareness.cursor }
                : p
            );
          }
          return [...prev, {
            id: data.awareness.user.id,
            name: data.awareness.user.name,
            color: data.awareness.user.color,
            cursor: data.awareness.cursor,
          }];
        });
      }
    };

    // Handle user joined
    const handleUserJoined = (data: { documentId: string; userId: string; username: string }) => {
      if (data.documentId === documentId) {
        setParticipants(prev => {
          if (prev.some(p => p.id === data.userId)) return prev;
          return [...prev, {
            id: data.userId,
            name: data.username,
            color: getUserColor(data.userId),
          }];
        });
      }
    };

    // Handle user left
    const handleUserLeft = (data: { documentId: string; userId: string }) => {
      if (data.documentId === documentId) {
        setParticipants(prev => prev.filter(p => p.id !== data.userId));
      }
    };

    socket.on('collab:joined', handleJoined);
    socket.on('collab:sync', handleSync);
    socket.on('collab:awareness', handleAwareness);
    socket.on('collab:user_joined', handleUserJoined);
    socket.on('collab:user_left', handleUserLeft);

    return () => {
      // Leave document on unmount
      socket.emit('collab:leave', { documentId });
      socket.off('collab:joined', handleJoined);
      socket.off('collab:sync', handleSync);
      socket.off('collab:awareness', handleAwareness);
      socket.off('collab:user_joined', handleUserJoined);
      socket.off('collab:user_left', handleUserLeft);
    };
  }, [socket, documentId, getUserColor, ydoc]);

  // Send Yjs updates to server
  useEffect(() => {
    if (!socket || !documentId) return;

    const handleUpdate = (update: Uint8Array) => {
      socket.emit('collab:sync', {
        documentId,
        update: Array.from(update),
      });
    };

    ydoc.on('update', handleUpdate);

    return () => {
      ydoc.off('update', handleUpdate);
    };
  }, [socket, documentId, ydoc]);

  // Handle document creation
  const handleCreate = () => {
    if (!title.trim()) return;

    if (onCreateDocument) {
      onCreateDocument(title.trim(), fileType);
    } else if (socket) {
      socket.emit('collab:create', {
        conversationId,
        title: title.trim(),
        fileType,
      });
    }
    setIsCreating(false);
  };

  // Convert HTML to docx paragraphs
  // SEC-009 FIX: Use DOMParser instead of innerHTML to avoid XSS risk
  const htmlToDocxParagraphs = (html: string): Paragraph[] => {
    const paragraphs: Paragraph[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tempDiv = doc.body;

    const processNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      switch (tagName) {
        case 'h1':
          paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: element.textContent || '', bold: true })],
          }));
          break;
        case 'h2':
          paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: element.textContent || '', bold: true })],
          }));
          break;
        case 'h3':
          paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: element.textContent || '', bold: true })],
          }));
          break;
        case 'p':
          const runs: TextRun[] = [];
          element.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              runs.push(new TextRun(child.textContent || ''));
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const childEl = child as Element;
              const childTag = childEl.tagName.toLowerCase();
              const text = childEl.textContent || '';
              if (childTag === 'strong' || childTag === 'b') {
                runs.push(new TextRun({ text, bold: true }));
              } else if (childTag === 'em' || childTag === 'i') {
                runs.push(new TextRun({ text, italics: true }));
              } else if (childTag === 's' || childTag === 'strike') {
                runs.push(new TextRun({ text, strike: true }));
              } else {
                runs.push(new TextRun(text));
              }
            }
          });
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({ children: runs }));
          }
          break;
        case 'ul':
        case 'ol':
          element.querySelectorAll('li').forEach((li) => {
            paragraphs.push(new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun(li.textContent || '')],
            }));
          });
          break;
        case 'blockquote':
          paragraphs.push(new Paragraph({
            indent: { left: 720 },
            children: [new TextRun({ text: element.textContent || '', italics: true })],
          }));
          break;
        default:
          element.childNodes.forEach(processNode);
      }
    };

    tempDiv.childNodes.forEach(processNode);
    return paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun('')] })];
  };

  // Handle export
  const handleExport = async () => {
    if (!editor) return;

    const content = editor.getHTML();

    switch (fileType) {
      case 'docx': {
        // Create proper DOCX file
        const doc = new Document({
          sections: [{
            children: htmlToDocxParagraphs(content),
          }],
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${title}.docx`);
        break;
      }
      case 'txt': {
        const blob = new Blob([editor.getText()], { type: 'text/plain' });
        saveAs(blob, `${title}.txt`);
        break;
      }
      case 'md': {
        // Basic HTML to Markdown conversion
        const markdown = content
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
          .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
          .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
          .replace(/<[^>]+>/g, '');
        const blob = new Blob([markdown], { type: 'text/markdown' });
        saveAs(blob, `${title}.md`);
        break;
      }
      default: {
        // Fallback to HTML
        const htmlDoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body>${content}</body>
</html>`;
        const blob = new Blob([htmlDoc], { type: 'text/html' });
        saveAs(blob, `${title}.html`);
      }
    }
  };

  // Creation modal - using relative/absolute positioning for reliable button visibility
  if (isCreating) {
    return (
      <div className="relative w-full h-full bg-card overflow-hidden">
        {/* Header - fixed at top */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 border-b border-border bg-card z-10">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-goldkey-gold" />
            <span className="font-semibold">Create Collaborative Document</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Creation Form - scrollable middle section */}
        <div className="absolute top-[53px] left-0 right-0 bottom-[65px] overflow-y-auto p-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Document Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">File Type</label>
              <div className="flex gap-2 flex-wrap">
                {['docx', 'txt', 'md'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFileType(type)}
                    className={`px-4 py-2 rounded-md border transition-colors ${
                      fileType === type
                        ? 'border-goldkey-gold bg-goldkey-gold/10 text-goldkey-gold'
                        : 'border-border hover:border-goldkey-gold/50'
                    }`}
                  >
                    .{type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer - fixed at bottom, ALWAYS visible */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card flex gap-2 justify-end z-10">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="bg-goldkey-gold text-black hover:bg-goldkey-gold/90"
          >
            Create Document
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-goldkey-gold" />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-semibold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-goldkey-gold rounded px-1"
          />
          <span className="text-xs text-muted-foreground">.{fileType}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Participants */}
          <div className="flex items-center gap-1 mr-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="flex -space-x-2">
              {participants.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-card"
                  style={{ backgroundColor: p.color }}
                  title={p.name}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {participants.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                  +{participants.length - 4}
                </div>
              )}
            </div>
          </div>

          {/* Last saved indicator */}
          {lastSaved && (
            <span className="text-xs text-muted-foreground">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}

          {/* Export button */}
          <Button variant="ghost" size="icon" onClick={handleExport} title="Export">
            <Download className="h-4 w-4" />
          </Button>

          {/* Close button */}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && (
        <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/30">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('bold') ? 'bg-muted' : ''}`}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('italic') ? 'bg-muted' : ''}`}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('strike') ? 'bg-muted' : ''}`}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('heading', { level: 1 }) ? 'bg-muted' : ''}`}
            title="Heading 1"
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('heading', { level: 2 }) ? 'bg-muted' : ''}`}
            title="Heading 2"
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('heading', { level: 3 }) ? 'bg-muted' : ''}`}
            title="Heading 3"
          >
            H3
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('bulletList') ? 'bg-muted' : ''}`}
            title="Bullet List"
          >
            • List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('orderedList') ? 'bg-muted' : ''}`}
            title="Numbered List"
          >
            1. List
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('blockquote') ? 'bg-muted' : ''}`}
            title="Quote"
          >
            &ldquo;Quote
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded hover:bg-muted ${editor.isActive('codeBlock') ? 'bg-muted' : ''}`}
            title="Code Block"
          >
            {'</>'}
          </button>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:p-4 [&_.ProseMirror]:focus:outline-none"
        />
      </div>
    </div>
  );
}
