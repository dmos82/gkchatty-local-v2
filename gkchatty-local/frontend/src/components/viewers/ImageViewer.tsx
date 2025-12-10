'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize,
  Move,
} from 'lucide-react';

interface ImageViewerProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function ImageViewer({ url, fileName, onClose }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Zoom in
  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  // Zoom out
  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);

  // Rotate 90 degrees
  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Reset to fit
  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Download
  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  }, [url, fileName]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, []);

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return; // Only allow panning when zoomed in
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [zoom, position]
  );

  // Handle drag move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case 'r':
          e.preventDefault();
          rotate();
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, rotate, resetView, onClose]);

  // Fetch image with authentication and create blob URL
  useEffect(() => {
    const fetchImage = async () => {
      try {
        setIsLoading(true);
        setError(false);

        const token = localStorage.getItem('accessToken');
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.statusText}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error('Error fetching image:', err);
        setError(true);
        setIsLoading(false);
      }
    };

    fetchImage();

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [url]);

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false);
    const img = e.target as HTMLImageElement;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  // Handle image error
  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setError(true);
  }, []);

  // Calculate cursor style
  const cursorStyle = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default';

  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900/80">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-medium truncate max-w-md">{fileName}</h2>
          {naturalSize.width > 0 && (
            <span className="text-gray-400 text-sm">
              {naturalSize.width} × {naturalSize.height} px
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            <button
              onClick={zoomOut}
              className="p-1.5 hover:bg-gray-700 rounded transition"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4 text-gray-300" />
            </button>
            <span className="text-gray-300 text-sm min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 hover:bg-gray-700 rounded transition"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          {/* Rotate */}
          <button
            onClick={rotate}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Rotate (R)"
          >
            <RotateCw className="w-5 h-5 text-gray-300" />
          </button>

          {/* Reset */}
          <button
            onClick={resetView}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Reset view (0)"
          >
            <Maximize className="w-5 h-5 text-gray-300" />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Download"
          >
            <Download className="w-5 h-5 text-gray-300" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition ml-2"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-300" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: cursorStyle }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error ? (
          <div className="text-center">
            <p className="text-red-400 mb-4">Failed to load image</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Download Instead
            </button>
          </div>
        ) : (
          blobUrl && (
            <img
              ref={imageRef}
              src={blobUrl}
              alt={fileName}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="max-w-full max-h-full select-none transition-transform duration-100"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                opacity: isLoading ? 0 : 1,
              }}
              draggable={false}
            />
          )
        )}
      </div>

      {/* Footer with hints */}
      <div className="flex items-center justify-center gap-6 p-3 bg-gray-900/80 text-gray-500 text-xs">
        <span className="flex items-center gap-1">
          <Move className="w-3 h-3" />
          Drag to pan when zoomed
        </span>
        <span>Scroll to zoom</span>
        <span>Press R to rotate</span>
        <span>Press 0 to reset</span>
      </div>
    </div>
  );
}

export default ImageViewer;
