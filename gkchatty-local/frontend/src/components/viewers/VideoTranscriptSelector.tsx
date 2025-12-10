'use client';

import React from 'react';
import { Video, FileText, X } from 'lucide-react';

interface VideoTranscriptSelectorProps {
  videoFileName: string;
  transcriptFileName: string;
  onSelectVideo: () => void;
  onSelectTranscript: () => void;
  onClose: () => void;
}

export function VideoTranscriptSelector({
  videoFileName,
  transcriptFileName,
  onSelectVideo,
  onSelectTranscript,
  onClose,
}: VideoTranscriptSelectorProps) {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-8 max-w-md w-full mx-4 border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Choose View Option</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition text-gray-400"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File name */}
        <p className="text-gray-400 text-sm mb-6 truncate" title={videoFileName}>
          {videoFileName}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {/* Watch Video */}
          <button
            onClick={onSelectVideo}
            className="w-full flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition group"
          >
            <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center group-hover:bg-purple-500 transition">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">Watch Video</p>
              <p className="text-gray-400 text-sm">Play the video file</p>
            </div>
          </button>

          {/* View Transcript */}
          <button
            onClick={onSelectTranscript}
            className="w-full flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition group"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center group-hover:bg-blue-500 transition">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">View Transcript</p>
              <p className="text-gray-400 text-sm truncate max-w-[200px]" title={transcriptFileName}>
                {transcriptFileName}
              </p>
            </div>
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-gray-500 text-xs mt-6 text-center">
          Press Escape to close
        </p>
      </div>
    </div>
  );
}

export default VideoTranscriptSelector;
