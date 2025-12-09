'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useDM } from './DMContext';

// Types
export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallDirection = 'incoming' | 'outgoing';

export interface CallParticipant {
  id: string;
  username: string;
}

export interface ActiveCall {
  callId: string;
  callType: CallType;
  direction: CallDirection;
  status: CallStatus;
  peer: CallParticipant;
  startedAt: Date;
  connectedAt?: Date;
}

interface VoiceVideoCallContextType {
  // Call state
  activeCall: ActiveCall | null;
  incomingCall: {
    callId: string;
    callType: CallType;
    callerId: string;
    callerUsername: string;
  } | null;

  // Media streams
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // Media controls
  isAudioMuted: boolean;
  isVideoOff: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;

  // Call actions
  initiateCall: (targetUserId: string, targetUsername: string, callType: CallType) => void;
  acceptCall: (callId: string) => void;
  rejectCall: (callId: string, reason?: string) => void;
  endCall: () => void;

  // Error state
  callError: string | null;
  clearCallError: () => void;
}

const VoiceVideoCallContext = createContext<VoiceVideoCallContextType | undefined>(undefined);

// ICE servers for NAT traversal
// STUN: Discovers public IP (works for most NATs)
// TURN: Relays traffic when direct connection fails (symmetric NATs, firewalls)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Google STUN servers (free, no auth required)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // OpenRelay TURN servers (free public TURN)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

interface VoiceVideoCallProviderProps {
  children: ReactNode;
}

export const VoiceVideoCallProvider: React.FC<VoiceVideoCallProviderProps> = ({ children }) => {
  const { socket, isConnected } = useDM();

  // Debug: Log socket state
  console.log('[VoiceVideoCall] Provider render - socket:', !!socket, 'isConnected:', isConnected);

  // Call state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callType: CallType;
    callerId: string;
    callerUsername: string;
  } | null>(null);

  // Media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Media controls
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Error state
  const [callError, setCallError] = useState<string | null>(null);

  // Refs for WebRTC
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop local media tracks (using ref to avoid stale closure)
    const currentStream = localStreamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote stream
    setRemoteStream(null);

    // Reset states
    setActiveCall(null);
    setIncomingCall(null);
    setIsAudioMuted(false);
    setIsVideoOff(false);
    pendingIceCandidatesRef.current = [];
  }, []); // No dependencies - uses refs

  // Get user media
  const getUserMedia = useCallback(async (callType: CallType): Promise<MediaStream | null> => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: callType === 'video',
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.error('[VoiceVideoCall] Failed to get user media:', err);
      setCallError('Failed to access camera/microphone. Please check permissions.');
      return null;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      const currentCall = activeCallRef.current;
      if (event.candidate && currentCall && socket) {
        console.log('[VoiceVideoCall] Sending ICE candidate');
        socket.emit('call:ice_candidate', {
          callId: currentCall.callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('[VoiceVideoCall] Received remote track');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[VoiceVideoCall] Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallError('Connection lost');
        cleanup();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, cleanup]);

  // Process pending ICE candidates
  const processPendingIceCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !pc.remoteDescription) return;

    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[VoiceVideoCall] Added pending ICE candidate');
      } catch (err) {
        console.error('[VoiceVideoCall] Failed to add ICE candidate:', err);
      }
    }
    pendingIceCandidatesRef.current = [];
  }, []);

  // Initiate a call
  const initiateCall = useCallback(
    async (targetUserId: string, targetUsername: string, callType: CallType) => {
      console.log('[VoiceVideoCall] initiateCall called with:', {
        targetUserId,
        targetUsername,
        callType,
        hasSocket: !!socket,
        isConnected,
        hasActiveCall: !!activeCall,
        hasIncomingCall: !!incomingCall,
      });

      if (!socket || !isConnected) {
        console.error('[VoiceVideoCall] Cannot initiate call - socket:', !!socket, 'isConnected:', isConnected);
        setCallError('Not connected to server');
        return;
      }

      if (activeCall || incomingCall) {
        console.error('[VoiceVideoCall] Cannot initiate call - already in a call');
        setCallError('Already in a call');
        return;
      }

      console.log(`[VoiceVideoCall] Initiating ${callType} call to ${targetUsername}`);

      // Get local media first
      console.log('[VoiceVideoCall] Requesting user media...');
      const stream = await getUserMedia(callType);
      if (!stream) {
        console.error('[VoiceVideoCall] Failed to get user media');
        return;
      }
      console.log('[VoiceVideoCall] Got user media stream:', stream.id);

      // Set both state AND ref immediately (ref needed before socket event arrives)
      setLocalStream(stream);
      localStreamRef.current = stream;

      // Emit call initiate
      console.log('[VoiceVideoCall] Emitting call:initiate to backend...');
      socket.emit('call:initiate', {
        targetUserId,
        callType,
      });
      console.log('[VoiceVideoCall] call:initiate emitted');
    },
    [socket, isConnected, activeCall, incomingCall, getUserMedia]
  );

  // Accept an incoming call
  const acceptCall = useCallback(
    async (callId: string) => {
      if (!socket || !isConnected || !incomingCall) {
        setCallError('Cannot accept call');
        return;
      }

      console.log('[VoiceVideoCall] Accepting call:', callId);

      // Get local media
      const stream = await getUserMedia(incomingCall.callType);
      if (!stream) return;

      // Set both state AND ref immediately (ref needed before socket event arrives)
      setLocalStream(stream);
      localStreamRef.current = stream;

      // Update state
      setActiveCall({
        callId: incomingCall.callId,
        callType: incomingCall.callType,
        direction: 'incoming',
        status: 'connecting',
        peer: {
          id: incomingCall.callerId,
          username: incomingCall.callerUsername,
        },
        startedAt: new Date(),
      });
      setIncomingCall(null);

      // Emit accept
      socket.emit('call:accept', { callId });
    },
    [socket, isConnected, incomingCall, getUserMedia]
  );

  // Reject an incoming call
  const rejectCall = useCallback(
    (callId: string, reason?: string) => {
      if (!socket) return;

      console.log('[VoiceVideoCall] Rejecting call:', callId);
      socket.emit('call:reject', { callId, reason });
      setIncomingCall(null);
    },
    [socket]
  );

  // End the current call
  const endCall = useCallback(() => {
    if (!socket || !activeCall) return;

    console.log('[VoiceVideoCall] Ending call:', activeCall.callId);
    socket.emit('call:end', { callId: activeCall.callId });
    cleanup();
  }, [socket, activeCall, cleanup]);

  // Toggle audio mute
  const toggleAudio = useCallback(() => {
    if (!localStream || !socket || !activeCall) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);

      // Notify peer
      socket.emit('call:toggle_media', {
        callId: activeCall.callId,
        mediaType: 'audio',
        enabled: audioTrack.enabled,
      });
    }
  }, [localStream, socket, activeCall]);

  // Toggle video off
  const toggleVideo = useCallback(() => {
    if (!localStream || !socket || !activeCall) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);

      // Notify peer
      socket.emit('call:toggle_media', {
        callId: activeCall.callId,
        mediaType: 'video',
        enabled: videoTrack.enabled,
      });
    }
  }, [localStream, socket, activeCall]);

  // Clear call error
  const clearCallError = useCallback(() => {
    setCallError(null);
  }, []);

  // Socket event handlers
  useEffect(() => {
    console.log('[VoiceVideoCall] Socket event handlers useEffect - socket:', !!socket);
    if (!socket) {
      console.log('[VoiceVideoCall] No socket, skipping event handler registration');
      return;
    }
    console.log('[VoiceVideoCall] Registering socket event handlers...');

    // Call initiated successfully (for caller)
    const handleCallInitiated = (data: {
      callId: string;
      targetUserId: string;
      targetUsername: string;
      callType: CallType;
    }) => {
      console.log('[VoiceVideoCall] Call initiated:', data);
      setActiveCall({
        callId: data.callId,
        callType: data.callType,
        direction: 'outgoing',
        status: 'ringing',
        peer: {
          id: data.targetUserId,
          username: data.targetUsername,
        },
        startedAt: new Date(),
      });
    };

    // Incoming call (for receiver)
    const handleIncomingCall = (data: {
      callId: string;
      callerId: string;
      callerUsername: string;
      callType: CallType;
    }) => {
      console.log('[VoiceVideoCall] Incoming call:', data);
      // Use ref to get current activeCall (avoids stale closure)
      const currentActiveCall = activeCallRef.current;
      if (currentActiveCall) {
        // Already in a call, auto-reject
        console.log('[VoiceVideoCall] Rejecting incoming call - already in a call');
        socket.emit('call:reject', { callId: data.callId, reason: 'busy' });
        return;
      }
      setIncomingCall(data);
    };

    // Call accepted - time to start WebRTC (for caller only)
    const handleCallAccepted = async (data: { callId: string; acceptedAt: string }) => {
      console.log('[VoiceVideoCall] Call accepted:', data);

      // Use ref to get the current stream (avoids stale closure)
      const currentLocalStream = localStreamRef.current;
      if (!currentLocalStream) {
        console.error('[VoiceVideoCall] No local stream when call accepted');
        return;
      }

      // Only the caller (outgoing direction) should create the offer
      // The receiver already set their activeCall in acceptCall and will wait for the offer
      setActiveCall((prev) => {
        if (!prev) return null;

        // If this is the receiver (incoming call), they already have activeCall set
        // Just update the connectedAt timestamp but don't process further
        if (prev.direction === 'incoming') {
          console.log('[VoiceVideoCall] Receiver got call:accepted, waiting for offer');
          return prev;
        }

        return {
          ...prev,
          status: 'connecting',
          connectedAt: new Date(data.acceptedAt),
        };
      });

      // Use the ref to get the current activeCall value (avoids stale closure)
      const currentActiveCall = activeCallRef.current;
      if (!currentActiveCall || currentActiveCall.direction !== 'outgoing') {
        console.log('[VoiceVideoCall] Not the caller, skipping offer creation');
        return;
      }

      // Create peer connection and add tracks
      const pc = createPeerConnection();
      currentLocalStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentLocalStream);
      });

      // Create and send offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call:offer', {
          callId: data.callId,
          sdp: offer,
        });
        console.log('[VoiceVideoCall] Offer sent');
      } catch (err) {
        console.error('[VoiceVideoCall] Failed to create offer:', err);
        setCallError('Failed to establish connection');
        cleanup();
      }
    };

    // Received offer (for receiver)
    const handleOffer = async (data: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[VoiceVideoCall] Received offer');

      // Use ref to get the current stream (avoids stale closure)
      const currentLocalStream = localStreamRef.current;
      if (!currentLocalStream) {
        console.error('[VoiceVideoCall] No local stream when receiving offer');
        return;
      }

      // Create peer connection and add tracks
      const pc = createPeerConnection();
      currentLocalStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentLocalStream);
      });

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Process any pending ICE candidates
        await processPendingIceCandidates();

        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('call:answer', {
          callId: data.callId,
          sdp: answer,
        });

        setActiveCall((prev) => (prev ? { ...prev, status: 'connected', connectedAt: new Date() } : null));
      } catch (err) {
        console.error('[VoiceVideoCall] Failed to handle offer:', err);
        setCallError('Failed to establish connection');
        cleanup();
      }
    };

    // Received answer (for caller)
    const handleAnswer = async (data: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[VoiceVideoCall] Received answer');

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('[VoiceVideoCall] No peer connection when receiving answer');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Process any pending ICE candidates
        await processPendingIceCandidates();

        setActiveCall((prev) => (prev ? { ...prev, status: 'connected', connectedAt: new Date() } : null));
      } catch (err) {
        console.error('[VoiceVideoCall] Failed to handle answer:', err);
        setCallError('Failed to establish connection');
        cleanup();
      }
    };

    // Received ICE candidate
    const handleIceCandidate = async (data: {
      callId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      console.log('[VoiceVideoCall] Received ICE candidate');

      const pc = peerConnectionRef.current;
      if (!pc) {
        // Store for later if peer connection not ready
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      if (!pc.remoteDescription) {
        // Store for later if remote description not set
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[VoiceVideoCall] Failed to add ICE candidate:', err);
      }
    };

    // Call rejected
    const handleCallRejected = (data: { callId: string; reason?: string }) => {
      console.log('[VoiceVideoCall] Call rejected:', data);
      setCallError(data.reason === 'busy' ? 'User is busy' : 'Call was rejected');
      cleanup();
    };

    // Call ended
    const handleCallEnded = (data: { callId: string; duration?: number }) => {
      console.log('[VoiceVideoCall] Call ended:', data);
      cleanup();
    };

    // Call timeout
    const handleCallTimeout = (data: { callId: string }) => {
      console.log('[VoiceVideoCall] Call timeout:', data);
      setCallError('Call was not answered');
      cleanup();
    };

    // Call error
    const handleCallError = (data: { error: string }) => {
      console.error('[VoiceVideoCall] Call error:', data);
      setCallError(data.error);
      cleanup();
    };

    // Peer media toggle
    const handleMediaToggled = (data: {
      callId: string;
      mediaType: 'audio' | 'video';
      enabled: boolean;
      userId: string;
    }) => {
      console.log('[VoiceVideoCall] Peer toggled media:', data);
      // Could update UI to show peer muted/video off state
    };

    // Register listeners
    socket.on('call:initiated', handleCallInitiated);
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice_candidate', handleIceCandidate);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:timeout', handleCallTimeout);
    socket.on('call:error', handleCallError);
    socket.on('call:media_toggled', handleMediaToggled);

    return () => {
      socket.off('call:initiated', handleCallInitiated);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice_candidate', handleIceCandidate);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:timeout', handleCallTimeout);
      socket.off('call:error', handleCallError);
      socket.off('call:media_toggled', handleMediaToggled);
    };
  // Note: localStream removed from deps - using localStreamRef.current in handlers
  // to avoid race condition where handlers are unregistered when stream is set
  }, [socket, createPeerConnection, processPendingIceCandidates, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const value: VoiceVideoCallContextType = {
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoOff,
    toggleAudio,
    toggleVideo,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    callError,
    clearCallError,
  };

  return (
    <VoiceVideoCallContext.Provider value={value}>{children}</VoiceVideoCallContext.Provider>
  );
};

// Hook to use the context
export const useVoiceVideoCall = () => {
  const context = useContext(VoiceVideoCallContext);
  if (context === undefined) {
    throw new Error('useVoiceVideoCall must be used within a VoiceVideoCallProvider');
  }
  return context;
};
