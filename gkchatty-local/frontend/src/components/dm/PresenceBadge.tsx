'use client';

import React from 'react';
import { PresenceStatus } from '@/contexts/DMContext';

interface PresenceBadgeProps {
  status: PresenceStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusColors: Record<PresenceStatus, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
  offline: 'bg-gray-400',
};

const statusLabels: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
};

const sizeClasses: Record<string, string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({
  status,
  size = 'md',
  showLabel = false,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`${statusColors[status]} ${sizeClasses[size]} rounded-full inline-block ring-2 ring-white dark:ring-gray-800`}
        title={statusLabels[status]}
      />
      {showLabel && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {statusLabels[status]}
        </span>
      )}
    </div>
  );
};

export default PresenceBadge;
