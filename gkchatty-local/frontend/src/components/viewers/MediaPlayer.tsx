'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  SkipBack,
  SkipForward,
  AlertCircle,
} from 'lucide-react';

interface MediaPlayerProps {
  url: string;
  type: 'video' | 'audio';
  fileName: string;
  onClose: () => void;
}

// Browser-supported formats
const BROWSER_SUPPORTED = {
  video: ['mp4', 'webm', 'ogg', 'mov'],
  audio: ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'webm', 'flac'],
};

export function MediaPlayer({ url, type, fileName, onClose }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Check if format is browser-supported
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const isSupported = BROWSER_SUPPORTED[type].includes(extension);

  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Play/pause toggle
  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play().catch((err) => {
        console.error('Play error:', err);
        setError('Unable to play media');
      });
    }
  }, [isPlaying]);

  // Mute toggle
  const toggleMute = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  }, []);

  // Seek
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const progressBar = progressRef.current;
      const media = mediaRef.current;
      if (!progressBar || !media) return;

      const rect = progressBar.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      const newTime = clickPosition * duration;
      media.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
  }, []);

  // Fullscreen toggle (video only)
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Download handler
  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  }, [url, fileName]);

  // Fetch media with authentication and create blob URL
  useEffect(() => {
    if (!isSupported) return;

    const fetchMedia = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = localStorage.getItem('accessToken');
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load media: ${response.statusText}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error('Error fetching media:', err);
        setError(err instanceof Error ? err.message : 'Failed to load media');
        setIsLoading(false);
      }
    };

    fetchMedia();

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [url, isSupported]);

  // Media event handlers
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(media.currentTime);
    const handleDurationChange = () => setDuration(media.duration);
    const handleLoadedData = () => setIsLoading(false);
    const handleError = () => {
      setIsLoading(false);
      setError('Failed to load media. The format may not be supported by your browser.');
    };
    const handleCanPlay = () => setIsLoading(false);

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('durationchange', handleDurationChange);
    media.addEventListener('loadeddata', handleLoadedData);
    media.addEventListener('error', handleError);
    media.addEventListener('canplay', handleCanPlay);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('durationchange', handleDurationChange);
      media.removeEventListener('loadeddata', handleLoadedData);
      media.removeEventListener('error', handleError);
      media.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          if (type === 'video') {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen, skip, type, onClose]);

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Unsupported format fallback
  if (!isSupported) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-xl p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Format Not Supported</h2>
          <p className="text-gray-400 mb-2">{fileName}</p>
          <p className="text-gray-500 text-sm mb-6">
            The {extension.toUpperCase()} format cannot be played in the browser. Please download
            the file to view it.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleDownload}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div
        ref={containerRef}
        className={`relative bg-gray-900 rounded-xl overflow-hidden ${
          type === 'video'
            ? isFullscreen
              ? 'w-full h-full'
              : 'w-full max-w-4xl'
            : 'w-full max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4 flex items-center justify-between">
          <h2 className="text-white font-medium truncate pr-4">{fileName}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-white/20 rounded-lg transition"
              title="Download"
            >
              <Download className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Media Content */}
        <div className={`${type === 'video' ? 'aspect-video' : 'py-20 px-8'}`}>
          {type === 'video' ? (
            blobUrl && (
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={blobUrl}
                className="w-full h-full bg-black"
                onClick={togglePlay}
                playsInline
              />
            )
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6">
                {isPlaying ? (
                  <Volume2 className="w-16 h-16 text-white animate-pulse" />
                ) : (
                  <Play className="w-16 h-16 text-white ml-2" />
                )}
              </div>
              {blobUrl && <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={blobUrl} />}
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-white mb-4">{error}</p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Download Instead
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="h-1 bg-gray-600 rounded-full mb-4 cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-blue-500 rounded-full relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Skip back */}
              <button
                onClick={() => skip(-10)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
                title="Skip back 10s"
              >
                <SkipBack className="w-5 h-5 text-white" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="p-3 bg-white rounded-full hover:bg-gray-200 transition"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-gray-900" />
                ) : (
                  <Play className="w-6 h-6 text-gray-900 ml-0.5" />
                )}
              </button>

              {/* Skip forward */}
              <button
                onClick={() => skip(10)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
                title="Skip forward 10s"
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              {/* Time display */}
              <span className="text-white text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Volume controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                  title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-white" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-white" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 accent-blue-500"
                />
              </div>

              {/* Fullscreen (video only) */}
              {type === 'video' && (
                <button
                  onClick={toggleFullscreen}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                  title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                >
                  {isFullscreen ? (
                    <Minimize className="w-5 h-5 text-white" />
                  ) : (
                    <Maximize className="w-5 h-5 text-white" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaPlayer;
