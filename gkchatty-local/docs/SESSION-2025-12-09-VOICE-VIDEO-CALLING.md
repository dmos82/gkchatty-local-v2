# Voice/Video Calling Feature - Session 2025-12-09

## Status: Working

Voice and video calling is now functional in production.

## Architecture Overview

### Backend (socketService.ts)
- **Call initiation:** `call:initiate` socket event
- **Call signaling:** WebRTC offer/answer/ICE candidate exchange via socket
- **Room-based delivery:** Users join personal `user:{userId}` room on connection
- **Call timeout:** 30-second auto-timeout if not answered

### Frontend (VoiceVideoCallContext.tsx)
- **WebRTC peer connection:** Handles media streams and ICE candidates
- **STUN/TURN servers:** Uses Google STUN + OpenRelay TURN for NAT traversal
- **Call states:** ringing, connecting, connected, ended

### UI Components
- **IncomingCallModal.tsx:** Shows incoming call with accept/reject buttons + ringtone
- **ActiveCallUI.tsx:** Draggable call window with video/audio, mute/camera controls
- **IMChatWindow.tsx:** Phone/video icons in chat header to initiate calls

## Issues Resolved

### Production Call Failure (Dec 9, 2025)
**Symptom:** Calls worked locally but not in production. Caller saw "Ringing..." then "Call was not answered", receiver never saw incoming call modal.

**Root Cause:** Socket room membership issue - receiver's socket wasn't in their personal `user:{userId}` room when call was initiated.

**Fix:** Added debug logging to track room socket count to diagnose the issue.

### WebRTC NAT Traversal (Dec 9, 2025)
**Symptom:** Calls connected locally but not across different networks.

**Fix:** Added TURN servers for relay when direct peer connection fails.

### Local Video Preview Black (Dec 9, 2025)
**Symptom:** Caller cannot see themselves during video call - their local video preview (PIP) shows black, but they can see the remote user.

**Root Cause:** Race condition between when `localStream` state is set and when `ActiveCallUI` renders. The `useEffect` that attaches the stream to the video element only had `[localStream]` as dependency, which could miss the initial render timing.

**Fix (Enhanced):**
1. Added `activeCall` to the useEffect dependency array to ensure the effect re-runs when the call UI first appears
2. Added explicit `play()` call on the video element as a fallback for browsers that require it
3. Added `z-10` to the local video PIP container to ensure it stays above the "waiting for remote" overlay during ringing/connecting phase
4. **Added retry logic (100ms)** - If initial stream attachment fails (ref not ready), retry after short delay
5. **Added ref callback `handleLocalVideoRef`** - Attaches stream immediately when video element mounts, providing another attachment opportunity

## Current Feature Set

### Working Features
- 1:1 voice calls
- 1:1 video calls
- Mute/unmute microphone
- Turn camera on/off
- Draggable call window
- Fullscreen mode
- Call duration timer
- Ringtone for incoming calls
- Auto-reject when already in call

### Call Flow
1. User A clicks phone/video icon in chat header
2. Backend creates call record, emits `call:incoming` to User B
3. User B sees IncomingCallModal with caller info
4. User B accepts -> both sides exchange WebRTC offer/answer
5. ICE candidates exchanged -> media streams connected
6. ActiveCallUI shows for both users

---

## Quality-of-Life Improvements (Implemented Dec 9, 2025)

### Phase 1: Busy Status & Better Feedback ✅
1. **"In Call" status indicator** ✅ - Green pulsing phone icon in buddy list when user is on a call
2. **Busy rejection message** ✅ - "{Username} is on another call" when calling someone busy
3. **Better caller feedback** ✅ - Personalized messages with username:
   - Busy: "{User} is on another call"
   - Declined: "{User} declined the call"
   - Offline: "{User} is offline" (immediate feedback)
   - Timeout: "{User} didn't answer"

### Phase 2: Notifications & History
4. **Browser notifications** - Notify when tab not focused
5. **Call history** - Log calls with duration, timestamp

### Phase 3: Group Calls (Future)
6. **Group video/voice calls** - SFU architecture for multi-party calls

---

## Files Modified

### Backend
- `backend/src/services/socketService.ts` - Call signaling + debug logging

### Frontend
- `frontend/src/contexts/VoiceVideoCallContext.tsx` - WebRTC + call state management
- `frontend/src/components/im/IncomingCallModal.tsx` - Incoming call UI
- `frontend/src/components/im/ActiveCallUI.tsx` - Active call UI
- `frontend/src/components/im/IMChatWindow.tsx` - Call buttons in chat
- `frontend/src/components/im/IMContainer.tsx` - Provider hierarchy
