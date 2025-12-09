# GKChatty Future Features Ideas

## 1. Video Conferencing (1:1 Calls)
**Status:** Idea - Not Started
**Priority:** Medium
**Effort:** ~4-6 hours

### Architecture
- WebRTC P2P (peer-to-peer, no media server needed)
- Socket.IO for signaling (already have infrastructure)
- STUN servers for NAT traversal (Google's free)
- TURN server for fallback (~$0.40/GB, only 10-15% of calls)

### MVP Features
- Video call button in chat window
- Incoming call notification with ringtone
- Accept / Decline buttons
- Mute audio / Disable video toggles
- End call button
- Picture-in-picture support

### Socket Events Needed
```typescript
'call:initiate'   → { recipientId, callType: 'video' | 'audio' }
'call:incoming'   → notify recipient
'call:accept'     → recipient accepts
'call:decline'    → recipient declines
'call:offer'      → WebRTC SDP offer
'call:answer'     → WebRTC SDP answer
'call:ice'        → ICE candidate exchange
'call:end'        → either party ends call
```

### Files to Create/Modify
- `frontend/src/components/im/VideoCall.tsx` - Call UI component
- `frontend/src/hooks/useWebRTC.ts` - WebRTC logic hook
- `backend/src/services/socketService.ts` - Call signaling handlers

---

## 2. In-Chat Collaborative Document Editing
**Status:** Research Complete - Ready for Implementation
**Priority:** High
**Effort:** 8 hours (MVP), 14 hours (Full Feature)

### Concept
Real-time collaborative document editing within chat conversations.
Google Docs-style multi-user editing embedded in chat windows with canvas-like expansion.

### Research Document
See **[COLLABORATIVE-EDITING-RESEARCH.md](./COLLABORATIVE-EDITING-RESEARCH.md)** for complete technical analysis.

### Recommended Stack
- **Sync**: Yjs (CRDT) - automatic conflict resolution, offline support
- **Editor**: TipTap (headless, built on ProseMirror)
- **Transport**: y-socket.io (integrates with existing Socket.IO)
- **File Types**: DOCX (via TipTap Pro or `docx` package), TXT, Markdown

### Key Features (MVP)
- Document icon button in chat window toolbar
- File type selector (Word, Text, Markdown)
- Chat window expands to ~900x700 canvas mode
- Split view: Editor (left) + Mini chat (right)
- Real-time cursor positions from other users
- Save to MongoDB, export as file

### Architecture Highlights
- Uses existing Socket.IO connection (no new server)
- CollaborativeDocument MongoDB model linked to conversation
- Yjs handles all merge conflicts automatically
- Canvas mode already partially supported (IMChatWindow has resize)

---

## 3. Screen Sharing (Future)
**Status:** Idea
**Depends on:** Video Conferencing

Would extend WebRTC implementation to include `getDisplayMedia()` for screen capture.

---

## 4. Group Video Calls (Future)
**Status:** Idea
**Depends on:** 1:1 Video Calls

Would require SFU (Selective Forwarding Unit) like LiveKit or mediasoup.
Not needed for 1:1 but essential for 3+ participants.

---

*Last Updated: 2025-12-08*
