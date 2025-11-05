'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react'; // Or your preferred loading spinner
import { ForcePasswordChangeModal } from './ForcePasswordChangeModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, checkSession } = useAuth();
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    // If loading is finished and there's no user, redirect to login
    if (!isLoading && !user) {
      console.log('[ProtectedRoute] Not authenticated, redirecting to /auth');
      router.push('/auth');
    }
  }, [user, isLoading, router]); // Dependencies for the effect

  // Check for force password change
  useEffect(() => {
    if (user && user.forcePasswordChange === true) {
      console.log('[ProtectedRoute] User needs to change password');
      setShowPasswordModal(true);
    }
  }, [user]);

  // While loading the authentication state, show a loading indicator
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-neutral-800">
        <Loader2 className="h-8 w-8 animate-spin dark:text-neutral-200" />
        <span className="ml-2 dark:text-neutral-200">Loading session...</span>
      </div>
    );
  }

  // Handle password change completion
  const handlePasswordChanged = async () => {
    console.log('[ProtectedRoute] Password changed successfully, refreshing session');
    setShowPasswordModal(false);
    // Refresh the user session to get updated forcePasswordChange status
    await checkSession();
  };

  // If not loading and user exists, render the protected content
  if (user) {
    return (
      <>
        <div className="min-h-screen bg-white dark:bg-neutral-800">{children}</div>
        <ForcePasswordChangeModal
          isOpen={showPasswordModal}
          onPasswordChanged={handlePasswordChanged}
        />
      </>
    );
  }

  // If not loading and no user, render null while redirecting
  // This prevents briefly flashing the protected content before redirect
  return null;
};

export default ProtectedRoute;
