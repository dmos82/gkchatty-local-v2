'use client';

import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, User } from 'lucide-react';
import { useVoiceVideoCall } from '@/contexts/VoiceVideoCallContext';

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, acceptCall, rejectCall } = useVoiceVideoCall();
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone when incoming call
  useEffect(() => {
    if (incomingCall) {
      // Create ringtone audio (using a simple tone for now)
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      const playRingtone = () => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 440; // A4 note
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
      };

      // Play ringtone every second
      playRingtone();
      const interval = setInterval(playRingtone, 1500);

      return () => {
        clearInterval(interval);
        audioContext.close();
      };
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-900 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-gray-700">
        {/* Caller info */}
        <div className="flex flex-col items-center mb-8">
          {/* Avatar placeholder */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 animate-pulse">
            <User className="w-12 h-12 text-white" />
          </div>

          {/* Caller name */}
          <h2 className="text-2xl font-semibold text-white mb-2">
            {incomingCall.callerUsername}
          </h2>

          {/* Call type indicator */}
          <div className="flex items-center gap-2 text-gray-400">
            {incomingCall.callType === 'video' ? (
              <>
                <Video className="w-5 h-5" />
                <span>Incoming video call...</span>
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                <span>Incoming voice call...</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-8">
          {/* Decline button */}
          <button
            onClick={() => rejectCall(incomingCall.callId)}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-red-500/30"
            title="Decline"
          >
            <PhoneOff className="w-8 h-8 text-white" />
          </button>

          {/* Accept button */}
          <button
            onClick={() => acceptCall(incomingCall.callId)}
            className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-green-500/30"
            title="Accept"
          >
            {incomingCall.callType === 'video' ? (
              <Video className="w-8 h-8 text-white" />
            ) : (
              <Phone className="w-8 h-8 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
