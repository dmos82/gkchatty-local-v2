# Voice/Video Calling Feature - Session Summary

**Date:** 2025-12-09
**Status:** Complete and Ready for Production

## Overview

Implemented real-time voice and video calling between GKChatty IM users using WebRTC for peer-to-peer media streaming with Socket.IO signaling.

## Features Implemented

### 1. Voice Calls
- One-on-one voice calls between users
- Mute/unmute audio toggle
- Call duration timer (mm:ss format)
- Clean call termination

### 2. Video Calls
- One-on-one video calls with live video
- Picture-in-picture local video preview
- Camera on/off toggle
- Remote video display
- Fallback avatar when video is off

### 3. Incoming Call Modal
- Visual caller identification with avatar
- Audio ringtone (Web Audio API sine wave)
- Accept/Decline buttons
- Call type indicator (voice vs video)

### 4. Active Call UI
- **Draggable window** - Can be positioned anywhere on screen
- Fullscreen toggle with maximize/minimize buttons
- Call controls: mute, video toggle, end call
- Call status display (Ringing, Connecting, Connected, timer)
- Constrained to viewport bounds

### 5. Call States
- `idle` - No active call
- `ringing` - Outgoing call waiting for answer
- `connecting` - WebRTC peer connection establishing
- `connected` - Call active, media flowing
- `ended` - Call terminated

## Technical Implementation

### Backend (WebRTC Signaling)

**File:** `backend/src/services/socketService.ts`

Added socket events:
- `call:initiate` - Start a call to another user
- `call:incoming` - Notify recipient of incoming call
- `call:accept` - Accept an incoming call
- `call:reject` - Decline an incoming call
- `call:end` - Terminate active call
- `call:offer` - SDP offer exchange
- `call:answer` - SDP answer exchange
- `call:ice-candidate` - ICE candidate exchange

### Frontend Components

**VoiceVideoCallContext.tsx** - Core call management:
- RTCPeerConnection setup and cleanup
- Local/remote MediaStream management
- Socket event handlers for signaling
- Call state machine with refs (avoids stale closures)
- Audio/video mute toggling

**ActiveCallUI.tsx** - Call interface:
- Draggable window implementation
- Video elements for local/remote streams
- Call controls (mute, video, end)
- Duration timer with mm:ss format
- Fullscreen toggle

**IncomingCallModal.tsx** - Incoming call prompt:
- Web Audio API ringtone
- Accept/Decline buttons
- Caller info display

**IMContainer.tsx** - Provider integration:
- Wraps IM components with VoiceVideoCallProvider
- Renders IncomingCallModal and ActiveCallUI globally

**IMChatWindow.tsx** - Call buttons:
- Phone and Video icons in chat header
- Initiates calls via context

### Dependencies Added

**Backend:**
- No new dependencies (Socket.IO already present)

**Frontend:**
- No new dependencies (WebRTC is native browser API)

## Files Changed

### New Files
```
frontend/src/contexts/VoiceVideoCallContext.tsx
frontend/src/components/im/ActiveCallUI.tsx
frontend/src/components/im/IncomingCallModal.tsx
```

### Modified Files
```
backend/src/services/socketService.ts  (+805 lines WebRTC signaling)
frontend/src/components/im/IMContainer.tsx
frontend/src/components/im/IMChatWindow.tsx
frontend/src/contexts/DMContext.tsx
backend/package.json
frontend/package.json
frontend/next.config.mjs
```

## Bug Fixes Applied

### 1. Timer Showing NaN:NaN / 00:00
**Problem:** Call duration timer showed "NaN:NaN" for one party or stuck at "00:00"
**Cause:** `connectedAt` timestamp was not being set when call status transitioned to 'connected'
**Fix:** Added `connectedAt: new Date()` in both:
- `handleOffer` (line 508) - receiver side
- `handleAnswer` (line 532) - caller side

### 2. Stale Closures in Event Handlers
**Problem:** Socket event handlers referenced stale state values
**Cause:** React closure captures old state in callbacks
**Fix:** Used refs (`activeCallRef`, `peerConnectionRef`, etc.) alongside state

### 3. Calls Not Working After Code Changes
**Problem:** Calls stopped working despite code being correct
**Cause:** Multiple stale processes running on ports 4001/4003
**Fix:** Kill all processes, fresh restart of both servers

## Usage

### Making a Call
1. Open chat window with a user
2. Click phone icon (voice) or video icon (video) in header
3. Wait for recipient to answer
4. Call UI appears with controls

### Receiving a Call
1. Incoming call modal appears
2. Click green button to accept, red to decline
3. If accepted, call UI appears

### During a Call
- Click mic button to mute/unmute
- Click camera button to toggle video (video calls only)
- Click red phone button to end call
- Drag header to reposition window
- Click maximize/minimize for fullscreen

## Testing Notes

- Tested between two browser tabs (same machine)
- Tested between two different machines
- Both voice and video calls verified working
- Timer displays correctly on both sides
- Draggable window constrained to viewport

## Known Limitations

1. **No Group Calls** - Currently 1-on-1 only
2. **No Screen Sharing** - Could be added later
3. **No Call Recording** - Privacy consideration
4. **No TURN Server** - May have issues with strict NATs (STUN only currently)

## Future Enhancements

- Add TURN server for NAT traversal reliability
- Group video calls
- Screen sharing
- Call recording (with consent)
- Call quality indicators
- Bandwidth adaptation

## Deployment Notes

No environment variables required. Uses browser's native WebRTC APIs with Google's public STUN servers for NAT traversal.

STUN servers used:
- stun:stun.l.google.com:19302
- stun:stun1.l.google.com:19302
