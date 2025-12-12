'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHelp } from '@/contexts/HelpContext';
import { HelpCircle, Keyboard, X } from 'lucide-react';

/**
 * HelpPanel - A floating help panel similar to Logic Pro X Quick Help
 *
 * Displays contextual help information for UI elements when help mode is enabled.
 * The panel floats in the bottom-right corner and updates as the user hovers
 * over different elements with data-help-id attributes.
 */
export const HelpPanel: React.FC = () => {
  const { isHelpModeEnabled, activeHelpId, getHelpContent, toggleHelpMode, setActiveHelpId } = useHelp();
  const panelRef = useRef<HTMLDivElement>(null);

  // Get the current help content
  const helpItem = activeHelpId ? getHelpContent(activeHelpId) : getHelpContent('default');

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

  // Category colors for visual distinction
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'chat': return 'bg-blue-500';
      case 'documents': return 'bg-green-500';
      case 'navigation': return 'bg-purple-500';
      case 'im': return 'bg-orange-500';
      case 'admin': return 'bg-red-500';
      case 'general': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getCategoryLabel = (category?: string) => {
    switch (category) {
      case 'chat': return 'Chat';
      case 'documents': return 'Documents';
      case 'navigation': return 'Navigation';
      case 'im': return 'Messaging';
      case 'admin': return 'Admin';
      case 'general': return 'General';
      default: return 'Help';
    }
  };

  return (
    <AnimatePresence>
      {isHelpModeEnabled && (
        <>
          {/* Subtle overlay to indicate help mode is active */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-[9998] bg-black/5 dark:bg-white/5"
          />

          {/* Help mode indicator badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-2 left-1/2 -translate-x-1/2 z-[10001] px-3 py-1.5 bg-yellow-500 text-yellow-900 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"
          >
            <HelpCircle className="w-4 h-4" />
            Help Mode Active
            <span className="text-xs opacity-75">Press ? or Esc to exit</span>
          </motion.div>

          {/* Main help panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 right-4 z-[10000] w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-gray-900 dark:text-white">Quick Help</span>
              </div>
              <button
                onClick={toggleHelpMode}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                aria-label="Close help mode"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Panel content */}
            <div className="p-4">
              {/* Category badge */}
              {helpItem?.category && (
                <div className="mb-2">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium text-white rounded ${getCategoryColor(helpItem.category)}`}>
                    {getCategoryLabel(helpItem.category)}
                  </span>
                </div>
              )}

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {helpItem?.title || 'Quick Help'}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {helpItem?.description || 'Hover over any button or control to see what it does.'}
              </p>

              {/* Keyboard shortcut */}
              {helpItem?.shortcut && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Keyboard className="w-4 h-4" />
                  <span>{helpItem.shortcut}</span>
                </div>
              )}
            </div>

            {/* Panel footer with keyboard hint */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono">?</kbd> to toggle • <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono">Esc</kbd> to close
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default HelpPanel;
