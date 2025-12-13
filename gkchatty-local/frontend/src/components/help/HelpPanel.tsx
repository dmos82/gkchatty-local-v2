'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHelp } from '@/contexts/HelpContext';
import { Keyboard } from 'lucide-react';

/**
 * HelpPanel - A mouse-following tooltip like Logic Pro X Quick Help
 *
 * Displays contextual help information near the mouse cursor when hovering
 * over elements with data-help-id attributes.
 */
export const HelpPanel: React.FC = () => {
  const { isHelpModeEnabled, activeHelpId, getHelpContent, setActiveHelpId } = useHelp();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get the current help content
  const helpItem = activeHelpId ? getHelpContent(activeHelpId) : null;

  // Track mouse position for tooltip placement
  useEffect(() => {
    if (!isHelpModeEnabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isHelpModeEnabled]);

  // Calculate tooltip position to stay within viewport
  useEffect(() => {
    if (!tooltipRef.current || !helpItem) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const padding = 16;
    const offsetX = 20; // Offset from cursor
    const offsetY = 20;

    let x = mousePosition.x + offsetX;
    let y = mousePosition.y + offsetY;

    // Adjust if tooltip would go off right edge
    if (x + rect.width > window.innerWidth - padding) {
      x = mousePosition.x - rect.width - offsetX;
    }

    // Adjust if tooltip would go off bottom edge
    if (y + rect.height > window.innerHeight - padding) {
      y = mousePosition.y - rect.height - offsetY;
    }

    // Ensure minimum positions
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setTooltipPosition({ x, y });
  }, [mousePosition, helpItem]);

  // Set up global mouseover listener for help mode
  useEffect(() => {
    if (!isHelpModeEnabled) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Find the closest element with a data-help-id attribute
      const helpElement = target.closest('[data-help-id]') as HTMLElement;

      if (helpElement) {
        const helpId = helpElement.getAttribute('data-help-id');
        if (helpId) {
          setActiveHelpId(helpId);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement | null;

      // Check if we're leaving a help element
      const helpElement = target.closest('[data-help-id]');
      if (helpElement) {
        // Only clear if we're not entering another help element
        const newHelpElement = relatedTarget?.closest('[data-help-id]');
        if (!newHelpElement) {
          setActiveHelpId(null);
        }
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [isHelpModeEnabled, setActiveHelpId]);

  // Category badge color (using Tailwind design system colors)
  const getCategoryBadge = (category?: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      chat: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Chat' },
      documents: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Documents' },
      navigation: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Navigation' },
      im: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Messaging' },
      admin: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Admin' },
      general: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', label: 'General' },
    };
    return badges[category || 'general'] || badges.general;
  };

  return (
    <AnimatePresence>
      {isHelpModeEnabled && helpItem && (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1], // Smooth ease-out curve
            opacity: { duration: 0.15 }
          }}
          style={{
            position: 'fixed',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            zIndex: 10000,
          }}
          className="pointer-events-none max-w-xs"
        >
          {/* Tooltip content - matches UI theme */}
          <div className="bg-card dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden">
            {/* Category badge */}
            {helpItem.category && (
              <div className="px-3 pt-2">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getCategoryBadge(helpItem.category).bg} ${getCategoryBadge(helpItem.category).text}`}>
                  {getCategoryBadge(helpItem.category).label}
                </span>
              </div>
            )}

            {/* Title and description */}
            <div className="px-3 py-2">
              <h3 className="text-sm font-semibold text-foreground dark:text-zinc-100 mb-1">
                {helpItem.title}
              </h3>
              <p className="text-xs text-muted-foreground dark:text-zinc-400 leading-relaxed">
                {helpItem.description}
              </p>

              {/* Keyboard shortcut */}
              {helpItem.shortcut && (
                <div className="mt-2 pt-2 border-t border-border dark:border-zinc-700 flex items-center gap-1.5 text-xs text-muted-foreground dark:text-zinc-500">
                  <Keyboard className="w-3 h-3" />
                  <span>{helpItem.shortcut}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HelpPanel;
