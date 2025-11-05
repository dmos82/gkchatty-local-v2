'use client';

import React from 'react';
// import { User } from '@/types'; // REMOVED - Type will be inferred or come from useAuth context if needed
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

// Define props for UserStatus
interface UserStatusProps {
  // Use a more robust way to get the type if possible, e.g., from useAuth directly
  user: ReturnType<typeof import('@/hooks/useAuth').useAuth>['user'];
  onClick?: () => void; // Optional click handler
}

const UserStatus: React.FC<UserStatusProps> = ({ user, onClick }) => {
  if (!user) {
    return (
      <div className="flex items-center space-x-3 p-2 border-t border-border mt-auto">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex flex-col space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  // Render actual user status - make the div clickable if onClick is provided
  const ContainerComponent = onClick ? 'button' : 'div';
  const containerProps = onClick ? { onClick: onClick, className: 'w-full text-left' } : {}; // Make button take full width

  return (
    <ContainerComponent
      {...containerProps}
      className="flex items-center space-x-3 p-2 border-t border-border mt-auto hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
    >
      <Avatar className="h-8 w-8">
        <AvatarImage
          src={`https://avatar.vercel.sh/${user.username}.png`}
          alt={`@${user.username}`}
        />
        <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col space-y-0.5 overflow-hidden">
        <span className="text-sm font-medium truncate" title={user.username}>
          {user.username}
        </span>
        <span className="text-xs text-muted-foreground truncate" title={user.email}>
          {user.email}
        </span>
      </div>
    </ContainerComponent>
  );
};

export default UserStatus;
