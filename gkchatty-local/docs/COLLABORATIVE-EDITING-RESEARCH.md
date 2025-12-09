# Collaborative Document Editing Research

**Date:** 2025-12-08
**Status:** Research Complete
**Estimated Implementation:** 6-8 hours (MVP), 12-16 hours (Full Feature)

---

## Executive Summary

This document outlines how to implement Google Docs-style collaborative document editing within GKChatty chat windows. The recommended approach uses **Yjs + TipTap + Socket.IO** for a seamless integration with our existing infrastructure.

---

## Requirements Recap

1. Button in chat window to initiate collaboration
2. User can select file type (Word doc, text, markdown)
3. Document opens within the chat window
4. Chat window expands to canvas-like interface
5. Multiple users edit simultaneously (real-time sync)
6. Changes merge without conflicts

---

## Technology Stack Comparison

### Sync Technology: CRDT vs OT

| Factor | CRDT (Yjs) | OT (Google Docs style) |
|--------|------------|------------------------|
| **Complexity** | Lower | Higher |
| **Server requirements** | No central transform server | Requires transformation server |
| **Offline support** | Excellent | Complex |
| **Conflict resolution** | Automatic, commutative | Sequential transforms |
| **Scaling** | Excellent (P2P possible) | Requires central coordination |
| **Library maturity** | Yjs: Very mature | No good open-source options |

**Recommendation: Yjs (CRDT)**
- Best performance of any CRDT implementation
- Works perfectly with Socket.IO via [y-socket.io](https://github.com/ivan-topp/y-socket.io)
- Offline editing built-in
- No server-side transform logic needed

### Rich Text Editor Options

| Editor | Collab Support | Bundle Size | Learning Curve | DOCX Support |
|--------|---------------|-------------|----------------|--------------|
| **TipTap** | Native Yjs binding | ~200KB | Medium | Yes (paid extension) |
| **Quill** | Community Yjs binding | ~250KB | Low | No |
| **ProseMirror** | Native Yjs binding | ~150KB | High | Via TipTap |
| **Slate** | Community Yjs binding | ~180KB | High | Community |
| **Monaco** | Native Yjs binding | ~2MB | Low | No (code only) |

**Recommendation: TipTap**
- Built on ProseMirror (battle-tested)
- First-class Yjs collaboration extension
- Headless = full control over UI
- [DOCX import/export available](https://tiptap.dev/product/conversion) (paid but reasonable)
- Great TypeScript support

---

## Architecture Design

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        GKChatty Frontend                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     IMChatWindow                            │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  Expanded Canvas Mode                                 │  │  │
│  │  │  ┌─────────────────────────┬────────────────────────┐ │  │  │
│  │  │  │                         │                        │ │  │  │
│  │  │  │     TipTap Editor       │    Mini Chat Panel     │ │  │  │
│  │  │  │     (Yjs Document)      │    (collapsed)         │ │  │  │
│  │  │  │                         │                        │ │  │  │
│  │  │  │  [Collaborator cursors] │  [Recent messages]     │ │  │  │
│  │  │  │                         │                        │ │  │  │
│  │  │  └─────────────────────────┴────────────────────────┘ │  │  │
│  │  │  [Toolbar: Bold, Italic, Lists, Export, Close]        │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ y-socket.io (Yjs over Socket.IO)
                              │ Reuses existing Socket.IO connection
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        GKChatty Backend                           │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Socket.IO Server                         │  │
│  │                                                             │  │
│  │  Existing handlers:          New handlers:                  │  │
│  │  - dm:send                   - collab:join                  │  │
│  │  - dm:receive                - collab:leave                 │  │
│  │  - presence:changed          - collab:sync                  │  │
│  │                              - collab:awareness             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              │ Persistence (optional)             │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  CollaborativeDocument (MongoDB)                            │  │
│  │  - _id                                                      │  │
│  │  - conversationId (links to DM conversation)                │  │
│  │  - title                                                    │  │
│  │  - yjsState (Binary - encoded Yjs document)                 │  │
│  │  - fileType ('docx', 'txt', 'md')                           │  │
│  │  - createdBy                                                │  │
│  │  - lastModifiedBy                                           │  │
│  │  - participants []                                          │  │
│  │  - createdAt, updatedAt                                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Socket.IO Event Design

```typescript
// Client -> Server
'collab:create'     // { conversationId, title, fileType }
'collab:join'       // { documentId }
'collab:leave'      // { documentId }
'collab:sync'       // { documentId, update: Uint8Array }
'collab:awareness'  // { documentId, awareness: Uint8Array }

// Server -> Client
'collab:created'    // { documentId, title, fileType, initialState }
'collab:joined'     // { documentId, currentState, participants }
'collab:user_joined'  // { documentId, userId, username }
'collab:user_left'    // { documentId, userId }
'collab:update'       // { documentId, update: Uint8Array }
'collab:awareness_update' // { documentId, awareness: Uint8Array }
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (3-4 hours)

#### 1.1 Install Dependencies

```bash
# Frontend
npm install @tiptap/core @tiptap/starter-kit @tiptap/extension-collaboration \
  @tiptap/extension-collaboration-cursor yjs y-socket.io

# Backend
npm install y-socket.io
```

#### 1.2 Create CollaborativeDocument Model

```typescript
// backend/src/models/CollaborativeDocumentModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICollaborativeDocument extends Document {
  conversationId: mongoose.Types.ObjectId;
  title: string;
  fileType: 'docx' | 'txt' | 'md' | 'rtf';
  yjsState: Buffer; // Encoded Yjs document
  createdBy: mongoose.Types.ObjectId;
  lastModifiedBy: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  isActive: boolean;
}

const CollaborativeDocumentSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  title: { type: String, required: true, default: 'Untitled Document' },
  fileType: { type: String, enum: ['docx', 'txt', 'md', 'rtf'], default: 'docx' },
  yjsState: { type: Buffer, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model<ICollaborativeDocument>('CollaborativeDocument', CollaborativeDocumentSchema);
```

#### 1.3 Add Collab Handlers to socketService.ts

```typescript
// backend/src/services/socketService.ts (additions)
import * as Y from 'yjs';
import CollaborativeDocument from '../models/CollaborativeDocumentModel';

// In-memory Yjs docs (consider Redis for production scaling)
const activeDocuments = new Map<string, Y.Doc>();

// Add to socket handlers
socket.on('collab:create', async ({ conversationId, title, fileType }) => {
  const ydoc = new Y.Doc();

  const doc = await CollaborativeDocument.create({
    conversationId,
    title,
    fileType,
    createdBy: userId,
    participants: [userId],
    yjsState: Y.encodeStateAsUpdate(ydoc),
  });

  activeDocuments.set(doc._id.toString(), ydoc);
  socket.join(`collab:${doc._id}`);

  socket.emit('collab:created', {
    documentId: doc._id,
    title,
    fileType,
    initialState: Array.from(Y.encodeStateAsUpdate(ydoc)),
  });
});

socket.on('collab:join', async ({ documentId }) => {
  let ydoc = activeDocuments.get(documentId);

  if (!ydoc) {
    // Load from database
    const doc = await CollaborativeDocument.findById(documentId);
    if (!doc) return socket.emit('collab:error', { message: 'Document not found' });

    ydoc = new Y.Doc();
    if (doc.yjsState) {
      Y.applyUpdate(ydoc, doc.yjsState);
    }
    activeDocuments.set(documentId, ydoc);
  }

  socket.join(`collab:${documentId}`);

  socket.emit('collab:joined', {
    documentId,
    currentState: Array.from(Y.encodeStateAsUpdate(ydoc)),
  });

  socket.to(`collab:${documentId}`).emit('collab:user_joined', {
    documentId,
    userId,
    username: user.username,
  });
});

socket.on('collab:sync', async ({ documentId, update }) => {
  const ydoc = activeDocuments.get(documentId);
  if (!ydoc) return;

  const updateArray = new Uint8Array(update);
  Y.applyUpdate(ydoc, updateArray);

  // Broadcast to other participants
  socket.to(`collab:${documentId}`).emit('collab:update', {
    documentId,
    update,
  });

  // Persist periodically (debounced in production)
  await CollaborativeDocument.findByIdAndUpdate(documentId, {
    yjsState: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
    lastModifiedBy: userId,
  });
});

socket.on('collab:awareness', ({ documentId, awareness }) => {
  socket.to(`collab:${documentId}`).emit('collab:awareness_update', {
    documentId,
    awareness,
  });
});
```

### Phase 2: Frontend Editor Component (2-3 hours)

#### 2.1 Create CollaborativeEditor Component

```typescript
// frontend/src/components/im/CollaborativeEditor.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { useDM } from '@/contexts/DMContext';
import { useAuth } from '@/hooks/useAuth';

interface CollaborativeEditorProps {
  documentId: string;
  initialState?: number[];
  onClose: () => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  documentId,
  initialState,
  onClose,
}) => {
  const { socket } = useDM();
  const { user } = useAuth();
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;

    // Apply initial state if provided
    if (initialState) {
      Y.applyUpdate(ydoc, new Uint8Array(initialState));
    }

    // Set up sync handlers
    const handleUpdate = ({ documentId: docId, update }: any) => {
      if (docId === documentId) {
        Y.applyUpdate(ydoc, new Uint8Array(update));
      }
    };

    const handleAwareness = ({ documentId: docId, awareness }: any) => {
      if (docId === documentId) {
        // Update awareness (cursors)
      }
    };

    socket.on('collab:update', handleUpdate);
    socket.on('collab:awareness_update', handleAwareness);

    // Send local updates
    ydoc.on('update', (update: Uint8Array) => {
      socket.emit('collab:sync', {
        documentId,
        update: Array.from(update),
      });
    });

    return () => {
      socket.off('collab:update', handleUpdate);
      socket.off('collab:awareness_update', handleAwareness);
      socket.emit('collab:leave', { documentId });
    };
  }, [socket, documentId, ydoc, initialState]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Yjs handles history
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider: null, // We'll manage awareness manually
        user: {
          name: user?.username || 'Anonymous',
          color: getRandomColor(),
        },
      }),
    ],
  });

  return (
    <div className="collaborative-editor h-full flex flex-col bg-white rounded-lg">
      {/* Toolbar */}
      <div className="toolbar flex items-center gap-2 p-2 border-b bg-gray-50">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-2 rounded ${editor?.isActive('bold') ? 'bg-gray-200' : ''}`}
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-2 rounded ${editor?.isActive('italic') ? 'bg-gray-200' : ''}`}
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded ${editor?.isActive('bulletList') ? 'bg-gray-200' : ''}`}
        >
          • List
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
        >
          Close Editor
        </button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-auto p-4 prose max-w-none"
      />
    </div>
  );
};

function getRandomColor() {
  const colors = ['#958DF1', '#F98181', '#FBBC88', '#FAF594', '#70CFF8', '#94FADB', '#B9F18D'];
  return colors[Math.floor(Math.random() * colors.length)];
}
```

### Phase 3: Canvas Mode UI (1-2 hours)

#### 3.1 Modify IMChatWindow for Canvas Mode

```typescript
// Additions to IMChatWindow.tsx

// New state
const [isCanvasMode, setIsCanvasMode] = useState(false);
const [activeDocument, setActiveDocument] = useState<{
  id: string;
  title: string;
  initialState?: number[];
} | null>(null);

// Canvas mode dimensions
const canvasSize = { width: 900, height: 700 };

// Start collaboration handler
const handleStartCollaboration = async (fileType: 'docx' | 'txt' | 'md') => {
  if (!socket || !conversationId) return;

  socket.emit('collab:create', {
    conversationId,
    title: 'Untitled Document',
    fileType,
  });
};

// Listen for document created
useEffect(() => {
  if (!socket) return;

  const handleCreated = (data: any) => {
    setActiveDocument({
      id: data.documentId,
      title: data.title,
      initialState: data.initialState,
    });
    setIsCanvasMode(true);
    setWindowSize(canvasSize);
  };

  socket.on('collab:created', handleCreated);
  socket.on('collab:joined', handleCreated);

  return () => {
    socket.off('collab:created', handleCreated);
    socket.off('collab:joined', handleCreated);
  };
}, [socket]);

// In render, add collaboration button to toolbar
{!isCanvasMode && (
  <button
    onClick={() => setShowFileTypeMenu(true)}
    className="p-1.5 hover:bg-[#505050] rounded"
    title="Start collaborative document"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  </button>
)}

// Canvas mode render
{isCanvasMode && activeDocument && (
  <div className="flex h-full">
    {/* Main editor area */}
    <div className="flex-1 min-w-0">
      <CollaborativeEditor
        documentId={activeDocument.id}
        initialState={activeDocument.initialState}
        onClose={() => {
          setIsCanvasMode(false);
          setActiveDocument(null);
          setWindowSize({ width: 320, height: 420 });
        }}
      />
    </div>
    {/* Mini chat sidebar */}
    <div className="w-48 border-l bg-[#252525] flex flex-col">
      <div className="p-2 text-xs text-gray-400">Chat</div>
      <div className="flex-1 overflow-y-auto">
        {/* Last 5 messages */}
      </div>
      <input
        type="text"
        placeholder="Quick message..."
        className="m-2 p-2 text-xs bg-[#1a1a1a] rounded"
      />
    </div>
  </div>
)}
```

### Phase 4: DOCX Export (1 hour)

#### Option A: TipTap Conversion (Recommended - Paid)

```typescript
// Requires @tiptap-pro/extension-export-docx
import { exportDocx } from '@tiptap-pro/extension-export-docx';

const handleExport = async () => {
  const docxBlob = await exportDocx(editor.getJSON());
  const url = URL.createObjectURL(docxBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${activeDocument.title}.docx`;
  a.click();
};
```

#### Option B: Free Alternative (docx package)

```typescript
// npm install docx file-saver
import { Document, Paragraph, TextRun, Packer } from 'docx';
import { saveAs } from 'file-saver';

const handleExport = async () => {
  const content = editor.getJSON();

  const doc = new Document({
    sections: [{
      children: convertTiptapToDocx(content),
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${activeDocument.title}.docx`);
};

function convertTiptapToDocx(content: any): Paragraph[] {
  // Convert TipTap JSON to docx Paragraphs
  // This is a basic implementation
  return content.content.map((node: any) => {
    if (node.type === 'paragraph') {
      return new Paragraph({
        children: node.content?.map((child: any) => {
          return new TextRun({
            text: child.text || '',
            bold: child.marks?.some((m: any) => m.type === 'bold'),
            italics: child.marks?.some((m: any) => m.type === 'italic'),
          });
        }) || [],
      });
    }
    // Handle other node types...
    return new Paragraph({});
  });
}
```

---

## File Type Support Matrix

| File Type | Import | Export | Editor Mode |
|-----------|--------|--------|-------------|
| **DOCX** | TipTap Pro or manual | TipTap Pro or `docx` package | Rich text |
| **TXT** | Native (string) | Native (string) | Plain text |
| **Markdown** | TipTap extension | TipTap extension | Rich text + MD preview |
| **RTF** | Limited | Via DOCX conversion | Rich text |

---

## Scaling Considerations

### For Production (100+ concurrent users)

1. **Move Yjs state to Redis**
   - Use [y-redis](https://github.com/yjs/y-redis) for distributed state
   - Scales horizontally with multiple backend instances

2. **Add persistence worker**
   - Debounce document saves (every 5 seconds)
   - Use background job queue (Bull/BullMQ)

3. **Consider dedicated collab server**
   - [Hocuspocus](https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing) from TipTap
   - Handles auth, persistence, scaling out of box

### Current Architecture (Good for 10-20 concurrent editors)

- In-memory Yjs docs on single server
- Direct MongoDB persistence
- Socket.IO rooms for document isolation

---

## Cost Analysis

### Free Stack
- **Yjs**: MIT License (free)
- **TipTap Core**: MIT License (free)
- **Socket.IO**: MIT License (free)
- **docx package**: MIT License (free)
- **Total: $0/month**

### Recommended Stack (Better DOCX)
- Above + TipTap Conversion: ~$99/month (Pro plan)
- Better DOCX fidelity, less custom code
- **Total: ~$99/month**

### Enterprise Stack (Full Scaling)
- Above + Hocuspocus Cloud: ~$299/month
- Handles auth, scaling, persistence
- **Total: ~$399/month**

---

## Security Considerations

1. **Authorization**: Verify user is participant of conversation before joining doc
2. **Rate limiting**: Limit collab:sync events (100/sec per user)
3. **Document size**: Cap at 1MB Yjs state
4. **Encryption**: Documents stored encrypted at rest (already via MongoDB encryption)

---

## MVP Scope

### Include in MVP
- [x] Create document from chat window
- [x] Basic rich text editing (bold, italic, lists)
- [x] Real-time sync between 2+ users
- [x] Collaborator presence (cursors)
- [x] Canvas mode UI expansion
- [x] Save to MongoDB
- [x] Export as TXT

### Post-MVP
- [ ] DOCX import/export (requires TipTap Pro or custom work)
- [ ] Markdown mode
- [ ] Comments/suggestions
- [ ] Version history
- [ ] Offline editing with sync
- [ ] Document templates

---

## Alternatives Considered

### 1. Embed Google Docs
- **Pros**: Zero implementation, full feature set
- **Cons**: Requires Google account, leaves GKChatty ecosystem, no offline
- **Verdict**: Not recommended - breaks unified experience

### 2. Use Etherpad
- **Pros**: Mature, self-hosted
- **Cons**: iframe embed feels disconnected, separate user system
- **Verdict**: Possible fallback if custom implementation fails

### 3. OnlyOffice Document Server
- **Pros**: Full MS Office compatibility
- **Cons**: Heavy (requires Docker, 2GB+ RAM), complex licensing
- **Verdict**: Overkill for chat-embedded editing

### 4. Build Custom with Yjs + TipTap
- **Pros**: Full control, integrates with existing Socket.IO, unified UX
- **Cons**: More dev time upfront
- **Verdict**: **Recommended** - best long-term fit

---

## Implementation Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Backend: Model + Socket handlers | 2 hours |
| 2 | Frontend: CollaborativeEditor component | 2 hours |
| 3 | Frontend: Canvas mode UI + integration | 2 hours |
| 4 | Testing & bug fixes | 2 hours |
| **Total MVP** | | **8 hours** |
| 5 | DOCX export (post-MVP) | 2 hours |
| 6 | Presence/cursors polish | 2 hours |
| 7 | Document management UI | 2 hours |
| **Total Full Feature** | | **14 hours** |

---

## Sources

- [Yjs Documentation](https://docs.yjs.dev)
- [Yjs GitHub](https://github.com/yjs/yjs)
- [y-socket.io - Socket.IO Integration](https://github.com/ivan-topp/y-socket.io)
- [TipTap Editor](https://tiptap.dev/docs/editor/getting-started/overview)
- [TipTap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)
- [TipTap DOCX Conversion](https://tiptap.dev/docs/conversion/import-export/docx)
- [Hocuspocus Backend](https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [Real-Time Collaborative Editing (GeeksforGeeks)](https://www.geeksforgeeks.org/reactjs/real-time-collaborative-editing-app-using-react-websockets/)
- [Building Collaborative Editor with Yjs (Medium)](https://medium.com/@ethanryan/making-a-simple-real-time-collaboration-app-with-react-node-express-and-yjs-a261597fdd44)
- [Kevin Jahns - Are CRDTs suitable for shared editing?](https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing)

---

*Research completed: 2025-12-08*
