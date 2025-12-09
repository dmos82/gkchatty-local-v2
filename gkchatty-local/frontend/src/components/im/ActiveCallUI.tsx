'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  User,
  Maximize2,
  Minimize2,
  GripHorizontal,
} from 'lucide-react';
import { useVoiceVideoCall } from '@/contexts/VoiceVideoCallContext';

export const ActiveCallUI: React.FC = () => {
  const {
    activeCall,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoOff,
    toggleAudio,
    toggleVideo,
    endCall,
    callError,
    clearCallError,
  } = useVoiceVideoCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Initialize position to bottom-right corner
  useEffect(() => {
    if (typeof window !== 'undefined' && !isFullscreen) {
      setPosition({
        x: window.innerWidth - 400 - 16, // 400px width + 16px margin
        y: window.innerHeight - 500 - 80, // 500px height + 80px margin (for IM toggle)
      });
    }
  }, [isFullscreen]);

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isFullscreen) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    },
    [isFullscreen, position]
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      let newX = dragStartRef.current.posX + deltaX;
      let newY = dragStartRef.current.posY + deltaY;

      // Constrain to viewport
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 500;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (activeCall?.status === 'connected' && activeCall.connectedAt) {
      const interval = setInterval(() => {
        const start = new Date(activeCall.connectedAt!).getTime();
        const now = Date.now();
        setCallDuration(Math.floor((now - start) / 1000));
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCallDuration(0);
    }
  }, [activeCall?.status, activeCall?.connectedAt]);

  // Format duration as mm:ss
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status text
  const getStatusText = (): string => {
    if (!activeCall) return '';
    switch (activeCall.status) {
      case 'ringing':
        return activeCall.direction === 'outgoing' ? 'Ringing...' : 'Incoming call...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call ended';
      default:
        return '';
    }
  };

  if (!activeCall) return null;

  const isVideoCall = activeCall.callType === 'video';

  // Determine positioning style
  const positionStyle = isFullscreen
    ? {}
    : {
        left: `${position.x}px`,
        top: `${position.y}px`,
      };

  return (
    <div
      ref={containerRef}
      style={positionStyle}
      className={`fixed ${
        isFullscreen
          ? 'inset-0'
          : 'w-96 h-[500px] rounded-2xl'
      } bg-gray-900 z-[55] shadow-2xl border border-gray-700 overflow-hidden flex flex-col ${
        isDragging ? 'cursor-grabbing' : ''
      }`}
    >
      {/* Header - Draggable */}
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between p-4 bg-gray-800/50 ${
          !isFullscreen ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {!isFullscreen && (
            <GripHorizontal className="w-4 h-4 text-gray-500 mr-1" />
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-medium">{activeCall.peer.username}</h3>
            <p className="text-sm text-gray-400">{getStatusText()}</p>
          </div>
        </div>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-2 hover:bg-gray-700 rounded-lg transition"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5 text-gray-400" />
          ) : (
            <Maximize2 className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {/* Video/Audio area */}
      <div className="flex-1 relative bg-gray-800">
        {isVideoCall ? (
          <>
            {/* Remote video (main) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Local video (picture-in-picture) */}
            <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden bg-gray-900 border border-gray-700 shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <VideoOff className="w-8 h-8 text-gray-500" />
                </div>
              )}
            </div>

            {/* No video from remote yet */}
            {!remoteStream && activeCall.status !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 animate-pulse">
                    <User className="w-12 h-12 text-white" />
                  </div>
                  <p className="text-gray-400">{getStatusText()}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Audio call - show avatar */
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
                <User className="w-16 h-16 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">
                {activeCall.peer.username}
              </h2>
              <p className="text-gray-400">{getStatusText()}</p>
              {/* Hidden audio element for remote stream */}
              <audio ref={remoteVideoRef as React.RefObject<HTMLAudioElement>} autoPlay />
            </div>
          </div>
        )}

        {/* Error display */}
        {callError && (
          <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg flex items-center justify-between">
            <span>{callError}</span>
            <button onClick={clearCallError} className="text-white/80 hover:text-white">
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-gray-800/50">
        <div className="flex justify-center gap-4">
          {/* Mute button */}
          <button
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isAudioMuted
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          {/* Video toggle (only for video calls) */}
          {isVideoCall && (
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isVideoOff
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? (
                <VideoOff className="w-6 h-6 text-white" />
              ) : (
                <Video className="w-6 h-6 text-white" />
              )}
            </button>
          )}

          {/* End call button */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30"
            title="End call"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveCallUI;
